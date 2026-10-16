"""Calendar events: what is on the calendar and when.

Two kinds of row, each with its own table in events.sql:

  * **entries** — a task placed on a day (`task_id`, `time_block`), which is
    how the calendar shows work that also exists on the dashboard;
  * **events** — a standalone block created on the calendar itself (`name`,
    optional weekly/monthly recurrence and an end date).

`is_default` marks the built-in events that cannot be deleted.

Event colours live in their own store: every hex handed out, stamped with the
ISO week it was claimed in, so the client can pick a new one visibly different
from the rest without the reserved set growing forever. See `colors` below.
"""
import re
from datetime import datetime

from backend.database import connection as db

HEX_COLOR_RE = re.compile(r'^#[0-9a-f]{6}$')


def _new_id(table):
    return db.new_id(table)


# --------------------------------------------------------------------------
# Entries: a task on a day
# --------------------------------------------------------------------------
def entries_for(username):
    return db.rows_for('calendar_entries', username)


def create_entry(username, data):
    """Place a task (or a bare time block) on a day."""
    entry_id = data.get('id') or _new_id('calendar_entries')
    entry = db.insert_row('calendar_entries', {
        "id": entry_id,
        "user_id": username,
        "date": data.get('date', ''),
        "time_block": data.get('time_block', ''),
        "task_id": data.get('task_id', None),
        "created_at": datetime.now().isoformat(),
    })
    return entry['id']


def update_entry(entry_id, username, data):
    """Change a placed entry's day, block or task. False if it isn't theirs."""
    changes = {field: data[field]
               for field in ('date', 'time_block', 'task_id') if field in data}
    if not changes:
        # Nothing sent to change, but the entry still has to be theirs for the
        # answer to be True — otherwise a caller learns which ids exist.
        return db.find_row('calendar_entries', entry_id, user_id=username) is not None
    return db.update_row('calendar_entries', entry_id, changes, user_id=username)


def delete_entry(entry_id, username=None):
    """Drop an entry — scoped to one account when a username is given."""
    db.delete_row('calendar_entries', entry_id, user_id=username)


# --------------------------------------------------------------------------
# Events: standalone calendar blocks
# --------------------------------------------------------------------------
def create_event(username, name, day, time_block, recurrence_month=None,
                 recurrence_week=None, end_date=None, description=''):
    """A new standalone calendar event, belonging to one account.

    `user_id` was not written until now, and `custom_events` did not filter on
    it, so every event anybody created was on everybody's calendar. The column
    was always in the schema (calendar_events references users.username with
    ON DELETE CASCADE); nothing was putting a value in it.
    """
    event = {
        "id": _new_id('calendar_events'),
        "user_id": username,
        "name": name,
        "recurrence-month": recurrence_month or None,
        "recurrence-week": recurrence_week or None,
        "end_date": end_date or None,
        "date": day,
        "time_block": time_block,
        "description": description or '',
        "completed": False,
        "created_at": datetime.now().isoformat(),
        "is_default": False,
    }
    event = db.insert_row('calendar_events', event)
    return {"success": True, "entry_id": event["id"], "message": "Calendar event created"}


def delete_event(event_id, username):
    """Delete one of this account's custom events. Defaults are protected.

    An event belonging to somebody else answers "not found" rather than
    "not yours": the two are the same fact to a caller who should not have
    known the id existed.
    """
    event = db.find_row('calendar_events', event_id, user_id=username)
    if not event:
        return {"success": False, "message": "Event not found"}
    if event.get('is_default', False):
        return {"success": False, "message": "Can't delete default events"}
    db.delete_row('calendar_events', event_id, user_id=username)
    return {"success": True, "message": "Calendar event deleted"}


def default_events():
    return [e for e in db.calendar_events() if e.get('is_default', False)]


def custom_events(username):
    """This account's own events. The defaults are everybody's; these are not."""
    return [e for e in db.rows_for('calendar_events', username)
            if not e.get('is_default', False)]


def sync_task(task_id, username, day, time_block=None, recurrence_month=None,
              recurrence_week=None, end_date=None, name=None):
    """Put an existing task on the calendar as an event block."""
    task = db.find_row('tasks', task_id, user_id=username)

    entry = {
        "id": _new_id('calendar_events'),
        # Stamped for the same reason `create_event` stamps it: without it the
        # block belongs to nobody, and `custom_events` shows it to everybody.
        "user_id": username,
        "name": name or (task.get('title', 'Untitled') if task else 'Untitled'),
        "recurrence-month": recurrence_month or None,
        "recurrence-week": recurrence_week or None,
        "end_date": end_date or None,
        "date": day,
        "time_block": time_block,
        "description": '',
        "completed": False,
        "created_at": datetime.now().isoformat(),
    }
    entry = db.insert_row('calendar_events', entry)
    return {"success": True, "entry_id": entry["id"], "message": "Task synced to calendar"}


def mark_task_completed(task_id, username):
    """Complete a task and tick off every calendar entry pointing at it."""
    if not db.find_row('tasks', task_id, user_id=username):
        return {"success": False, "message": "Task not found"}

    db.update_row('tasks', task_id, {'status': 'done'}, user_id=username)

    now = datetime.now().isoformat()
    updated = 0
    for entry in db.rows_for('calendar_entries', username):
        if entry.get('task_id') == task_id:
            db.update_row('calendar_entries', entry['id'],
                          {'completed': True, 'completed_at': now}, user_id=username)
            updated += 1

    return {"success": True,
            "message": "Task marked as completed in calendar. "
                       "{} calendar entries updated.".format(updated)}


def progress_for(username):
    """How much of a user's calendar is ticked off, overall and per day."""
    entries = entries_for(username)
    total = len(entries)
    completed = len([e for e in entries if e.get('completed', False)])

    by_date = {}
    for entry in entries:
        by_date.setdefault(entry.get('date', 'Unknown'), []).append(entry)

    return {
        "success": True,
        "total_entries": total,
        "completed_entries": completed,
        "completion_rate": (completed / total * 100) if total else 0,
        "entries_by_date": by_date,
        "entries": entries,
    }


# --------------------------------------------------------------------------
# Event colours
# --------------------------------------------------------------------------
# A colour is reserved for the week it was handed out in, and no longer.
#
# The client keeps two kinds of reservation apart (see
# frontend/src/utils/colorRegistry.ts): a colour is blocked while the thing
# wearing it is still on the calendar, which the client knows without asking,
# and it is *also* blocked for the rest of the week it was claimed in, which
# only this table remembers. The second is what stops a week of adding and
# deleting blocks from handing out the same hex twice; letting it run forever
# is what would eventually leave a calendar with nowhere left to go.
#
# Rows are kept rather than deleted. They cost a few bytes, and an expired
# colour is still a record of what this account has been shown.
def _current_week(when=None):
    """"2026-W33" — the ISO week a claim belongs to.

    ISO rather than "the last seven days" so the refresh lands on a Monday for
    everybody, which is the boundary "every week" means to a reader looking at
    a calendar.
    """
    year, week, _ = (when or datetime.now()).isocalendar()
    return '{}-W{:02d}'.format(year, week)


def colors(when=None):
    """The colours still reserved: the ones claimed this week.

    A row with no week is one written before claims were dated. It is treated
    as expired, which is the right answer for every one of them — they were all
    claimed before this code existed.
    """
    week = _current_week(when)
    return [
        row['color'] for row in db.event_colors()
        if row.get('claimed_week') == week
    ]


def add_color(color, when=None):
    """Claim a colour for this week. Returns what is reserved, or None if invalid."""
    color = str(color or '').strip().lower()
    if not HEX_COLOR_RE.match(color):
        return None

    week = _current_week(when)
    tracked = db.event_colors()

    # The same hex claimed again this week is the same claim. Claimed again in
    # a later week it is a new one, and the row is re-dated rather than
    # duplicated — the table is a set of colours, not a log of them.
    for row in tracked:
        if row.get('color') == color:
            row['claimed_week'] = week
            break
    else:
        tracked.append({'color': color, 'claimed_week': week})

    db.save_event_colors(tracked)
    return [row['color'] for row in tracked if row.get('claimed_week') == week]

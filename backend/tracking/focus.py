"""Focus time: how long the user actually sat down and worked.

The session itself runs client-side (src/hooks/useFocusSession.ts keeps the
timer in localStorage, as focus.js did before the port — same key, same shape).
What is tracked here is each day's total, one row per user per
day in focus.sql — so the calendar's Weekly Focus Time panel, the growth chart
and focus-type goals all read one number that survives a cleared browser.

Also here: the one-line "Focus" note attached to a calendar day, which the
Week, Day and Month views all show, so an edit in one view lands everywhere;
and the sittings, one row per focus sitting with the task it was for, which
used to live only in the browser that ran them.
"""
from backend.database import connection as db
from backend.tracking.auth import find_user


def _rows_for(username):
    return db.rows_for('focus_days', username, order='date')


def _seconds(row):
    try:
        return max(0.0, float(row.get('seconds', 0) or 0))
    except (TypeError, ValueError):
        return 0.0


def _goal_hours(row):
    try:
        return max(0.0, float(row.get('goal_hours', 0) or 0))
    except (TypeError, ValueError):
        return 0.0


def history_for(username):
    """{iso_date: {seconds, goal_hours}} for one account."""
    return {r['date']: {'seconds': _seconds(r), 'goal_hours': _goal_hours(r)}
            for r in _rows_for(username) if r.get('date')}


def record_day(username, day, seconds, goal_hours):
    """Store one day's focus total. Returns the stored record, or None.

    Never lets a stale client (an old tab with cleared localStorage, say)
    shrink a day's already-recorded total.
    """
    if not find_user(db.users(), username=username):
        return None

    # One day's row, found by its own primary key (user_id, date) rather than
    # by reading the whole ledger — every account's, every day's — and writing
    # all of it back to change one number.
    row = db.find_row('focus_days', day, user_id=username, key='date')
    kept = round(max(seconds, _seconds(row or {})), 1)

    if row is None:
        db.insert_row('focus_days', {'user_id': username, 'date': day,
                                     'seconds': kept, 'goal_hours': goal_hours})
    else:
        db.update_row('focus_days', day, {'seconds': kept, 'goal_hours': goal_hours},
                      user_id=username, key='date')
    return {'seconds': kept, 'goal_hours': goal_hours}


def log_day(username, day, seconds, goal_hours):
    """Add hand-entered time to a day's total. Returns the record, or None.

    The other way in is `record_day`, which is the timer mirroring itself and
    therefore takes the *larger* of what it holds and what it is sent — an old
    tab with cleared localStorage must not be able to erase real work.

    A person typing "I did two hours on Tuesday" into the dashboard's catch-up
    prompt is not a mirror and the max rule is wrong for them: a Tuesday that
    already holds twenty tracked minutes plus two typed hours is two hours and
    twenty minutes, not two hours. So this one adds, and the two callers stay
    separate rather than sharing a function with a mode flag — they are
    different claims about what the number means.

    `goal_hours` is only written on a day that has no row yet. A day the reader
    actually lived through had whatever goal it had, and backfilling time onto
    it is not a reason to rewrite the target it was measured against.
    """
    if not find_user(db.users(), username=username):
        return None

    row = db.find_row('focus_days', day, user_id=username, key='date')
    total = round(_seconds(row or {}) + max(0.0, float(seconds)), 1)

    if row is None:
        db.insert_row('focus_days', {'user_id': username, 'date': day,
                                     'seconds': total, 'goal_hours': goal_hours})
        return {'seconds': total, 'goal_hours': goal_hours}

    kept = _goal_hours(row) or goal_hours
    db.update_row('focus_days', day, {'seconds': total, 'goal_hours': kept},
                  user_id=username, key='date')
    return {'seconds': total, 'goal_hours': kept}


def history_range(username, start='', end=''):
    """{iso: {seconds, goal_hours}} within a date range, or None if no user.

    Days with no record are simply absent — nothing was tracked and nothing was
    planned.
    """
    if not find_user(db.users(), username=username):
        return None
    return {day: rec for day, rec in history_for(username).items()
            if (not start or day >= start) and (not end or day <= end)}


def total_seconds(username):
    """An account's all-time tracked focus seconds."""
    return sum(_seconds(r) for r in _rows_for(username))


# --------------------------------------------------------------------------
# The per-day focus note
# --------------------------------------------------------------------------
def day_notes(username):
    """Every saved day-focus note for a user, keyed by ISO date. None if no user."""
    if not find_user(db.users(), username=username):
        return None
    return {r['date']: r.get('text', '') for r in db.day_focus_notes()
            if r.get('user_id') == username and r.get('date')}


def set_day_note(username, day, text):
    """Upsert one day's focus text; empty text deletes the entry."""
    if not find_user(db.users(), username=username):
        return False

    db.delete_row('day_focus_notes', day, user_id=username, key='date')
    if text:
        db.insert_row('day_focus_notes',
                      {'user_id': username, 'date': day, 'text': text})
    return True


# --------------------------------------------------------------------------
# The sittings
# --------------------------------------------------------------------------
# One row per focus sitting, written by the browser as each one ends. The
# client's own field names (camelCase, the shape of `Interval` in
# frontend/src/components/Timer/intervals.ts) are what goes over the wire, so
# the browser keeps one shape for its cache and its requests; the mapping to
# columns lives here and nowhere else.

#: How many sittings a read hands back: the newest, oldest first. The same cap
#: the browser keeps (hooks/useIntervals), about two months of ordinary use.
SITTINGS_KEPT = 120

#: Client field → column, for the plain fields. `breaks` and `finished` are
#: converted on their own.
_SITTING_FIELDS = (
    ('day', 'day'), ('at', 'at'), ('styleId', 'style_id'), ('planned', 'planned'),
    ('minutes', 'minutes'), ('pauses', 'pauses'), ('taskId', 'task_id'),
    ('taskTitle', 'task_title'), ('intent', 'intent'), ('target', 'target'),
    ('done', 'done'), ('met', 'met'), ('readiness', 'readiness'), ('kind', 'kind'),
)


def _as_client(row):
    """A stored row in the browser's shape. NULL columns are left out, as the
    browser leaves out a field that was never set."""
    out = {'id': row['id'], 'finished': bool(row.get('finished'))}
    for field, column in _SITTING_FIELDS:
        if row.get(column) is not None:
            out[field] = row[column]
    breaks = [int(part) for part in str(row.get('breaks') or '').split(',') if part.strip().isdigit()]
    if breaks:
        out['breaks'] = breaks
    if 'met' in out:
        out['met'] = bool(out['met'])
    return out


def sittings_for(username):
    """The account's newest sittings, oldest first, in the browser's shape.
    None if there is no such account."""
    if not find_user(db.users(), username=username):
        return None
    rows = db.rows_for('focus_sittings', username)
    # Sorted here rather than in SQL: a sitting with no `at` sorts first in
    # SQLite and last in Postgres, and the order is the whole point of the list.
    rows.sort(key=lambda row: float(row.get('at') or 0))
    return [_as_client(row) for row in rows[-SITTINGS_KEPT:]]


def save_sittings(username, sittings):
    """Store sittings the browser has and the server does not. Returns how many
    were new, or None if there is no such account.

    A row the server already holds is not rewritten: a sitting is a fact about
    something that already happened. The one exception is its answer — `done`
    or `met` — which arrives after the row does and may have been given on a
    device that was offline when the row first went up.
    """
    if not find_user(db.users(), username=username):
        return None
    added = 0
    for sitting in sittings:
        held = db.find_row('focus_sittings', sitting['id'], user_id=username)
        if held is None:
            row = {'id': sitting['id'], 'user_id': username,
                   'finished': bool(sitting.get('finished')),
                   'breaks': ','.join(str(at) for at in sitting.get('breaks') or [])}
            for field, column in _SITTING_FIELDS:
                if sitting.get(field) is not None:
                    row[column] = sitting[field]
            db.insert_row('focus_sittings', row, key='id')
            added += 1
            continue
        answer = {column: sitting[field] for field, column in (('done', 'done'), ('met', 'met'))
                  if sitting.get(field) is not None and held.get(column) is None}
        if answer:
            db.update_row('focus_sittings', sitting['id'], answer, user_id=username)
    return added


def amend_sitting(username, sitting_id, done=None, met=None):
    """Record what came of one sitting's intention. False if there is no such
    row on this account."""
    held = db.find_row('focus_sittings', sitting_id, user_id=username)
    if held is None:
        return False
    changes = {}
    if done is not None:
        changes['done'] = done
    if met is not None:
        changes['met'] = bool(met)
    if changes:
        db.update_row('focus_sittings', sitting_id, changes, user_id=username)
    return True

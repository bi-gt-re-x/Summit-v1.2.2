"""XP: the ledger, levels and the streak.

Two things live here:

  * the **ledger** — the xp_events table in growth.sql, one row per XP-earning
    moment. It is append-only and is the source of truth for "how much did I earn, and when":
    the growth chart, the calendar's daily XP and the report card all read it
    rather than recomputing from tasks.
  * the **progression** stored on the account itself — total xp, level, tasks
    completed and the daily streak. These move together whenever a task is
    completed, so they are awarded in one place (`award_task_completion`).

Level N costs N * 100 XP, forever — there is no cap.
"""
from datetime import date, datetime, timedelta

from backend.config.settings import LEVEL_XP_STEP
from backend.database import connection as db


# --------------------------------------------------------------------------
# Levels
# --------------------------------------------------------------------------
def level_for_total_xp(total_xp):
    """Break a lifetime XP total into {level, xp_in_level, xp_required}."""
    level = 1
    remaining = max(0, int(total_xp or 0))
    needed = LEVEL_XP_STEP
    while remaining >= needed:
        remaining -= needed
        level += 1
        needed = level * LEVEL_XP_STEP
    return {'level': level, 'xp_in_level': remaining, 'xp_required': needed}


# --------------------------------------------------------------------------
# The ledger
# --------------------------------------------------------------------------
def events_for(username):
    """Every ledger row belonging to one account.

    Filtered in SQL rather than by reading the whole ledger and dropping most
    of it: the table is shared, so the Python version's cost was every
    account's events on every call. `xp_events_user_date_idx` leads on
    user_id, so this reads only the rows it returns.
    """
    return db.rows_for('xp_events', username)


def event_day(event):
    """The calendar day a ledger row falls on.

    Older rows carry only a timestamp; newer ones also carry an explicit
    'date'. Prefer the explicit one and fall back to the timestamp's date.
    """
    day = event.get('date')
    if day:
        return str(day)[:10]
    ts = event.get('timestamp') or ''
    return ts[:10] if ts else None


def log_event(username, amount, reason, tasks_completed=1, day=None):
    """Append one row to the ledger and return it."""
    now = datetime.now()
    event = {
        "id": db.new_id('xp_events'),
        "user_id": username,
        "amount": amount,
        "reason": reason,
        "timestamp": now.isoformat(),
        "date": day or date.today().isoformat(),
        "tasks_completed": tasks_completed,
    }
    db.insert_row('xp_events', event)
    return event


def daily_totals(username):
    """{iso_date: {'xp': n, 'tasks': n}} across the whole ledger.

    daily_xp rows pre-aggregate their task count; task_completion rows are one
    task each, which is why the default below is 1.
    """
    totals = {}
    for event in events_for(username):
        day = event_day(event)
        if not day:
            continue
        bucket = totals.setdefault(day, {'xp': 0, 'tasks': 0})
        bucket['xp'] += event.get('amount', 0) or 0
        bucket['tasks'] += event.get('tasks_completed', 1) or 0
    return totals


def earned_on(username, day):
    """XP and tasks recorded on one calendar day, midnight to midnight."""
    xp_earned = 0
    tasks_completed = 0
    for event in events_for(username):
        if event_day(event) != day:
            continue
        try:
            xp_earned += int(event.get('amount', 0) or 0)
        except (TypeError, ValueError):
            pass
        try:
            tasks_completed += int(event.get('tasks_completed', 1) or 0)
        except (TypeError, ValueError):
            pass
    return {'xp_earned': xp_earned, 'tasks_completed': tasks_completed}


def track_daily(username, xp_earned, tasks_completed):
    """Fold a day's totals into the account's ledger row for today.

    Note it folds into *whichever* row already carries today's date, including
    a task_completion one — so calling this after a task has been completed
    today grows that row rather than adding a 'daily_xp' row of its own. That
    is how it has always behaved; nothing in the frontend calls it today.
    """
    today = date.today().isoformat()
    entry = next((e for e in events_for(username) if e.get('date') == today), None)

    if entry:
        amount = (entry.get('amount') or 0) + xp_earned
        done = (entry.get('tasks_completed') or 0) + tasks_completed
        db.update_row('xp_events', entry['id'], {
            'amount': amount,
            'tasks_completed': done,
            'avg_task_xp': amount / done if done > 0 else 0,
        }, user_id=username)
    else:
        db.insert_row('xp_events', {
            "id": db.new_id('xp_events'),
            "user_id": username,
            "amount": xp_earned,
            "reason": "daily_xp",
            "timestamp": datetime.now().isoformat(),
            "date": today,
            "tasks_completed": tasks_completed,
            "avg_task_xp": xp_earned / tasks_completed if tasks_completed > 0 else 0,
        })


def last_task_completion(username):
    """The most recent task_completion row, or None.

    The goals page polls this so a task completed on the dashboard signals
    through to its console.
    """
    latest = None
    latest_id = -1
    for event in events_for(username):
        if event.get('reason') != 'task_completion':
            continue
        try:
            eid = int(event.get('id', 0))
        except (ValueError, TypeError):
            eid = 0
        if eid > latest_id:
            latest_id = eid
            latest = event
    return latest


def snapshot(username):
    """Everything the XP view of an account needs, built from the ledger.

    Account creation to today, one entry per day, with a running total —
    plus the current level and a summary of the whole run.
    """
    # Imported here rather than at module scope: auth awards XP through this
    # module, so a top-level import would be circular.
    from backend.tracking.auth import created_date_for, find_user

    user = find_user(db.users(), username=username)
    if not user:
        return {"success": False, "message": "User not found"}

    created = created_date_for(user)
    totals = daily_totals(username)

    series = []
    cumulative = 0
    day = min(created, date.today())
    day_number = 1
    while day <= date.today():
        iso = day.isoformat()
        bucket = totals.get(iso, {'xp': 0, 'tasks': 0})
        cumulative += bucket['xp']
        series.append({
            'date': iso,
            'day_number': day_number,
            'xp_earned': bucket['xp'],
            'tasks_completed': bucket['tasks'],
            'cumulative_xp': cumulative,
            'avg_task_xp': (bucket['xp'] / bucket['tasks']) if bucket['tasks'] else 0,
        })
        day += timedelta(days=1)
        day_number += 1

    levels = level_for_total_xp(user.get('xp', 0))
    return {
        "success": True,
        "user": {
            "username": user.get('username'),
            "created_date": created.isoformat(),
            "days_active": (date.today() - created).days + 1,
        },
        "stats": {
            "level": levels['level'],
            "current_xp": levels['xp_in_level'],
            "total_xp": user.get('xp', 0),
            "xp_required": levels['xp_required'],
            "tasks_completed": user.get('tasks_completed', 0),
        },
        "growth_data": series,
        "summary": {
            "total_days": len(series),
            "total_xp": cumulative,
            "average_xp_per_day": cumulative / len(series) if series else 0,
            "most_productive_day": max(series, key=lambda d: d['xp_earned']) if series else None,
        },
    }


# --------------------------------------------------------------------------
# The streak
# --------------------------------------------------------------------------
def parse_day(raw):
    """The date part of an ISO-ish value, or None.

    `date.fromisoformat` where the text is already the shape it wants, and
    `strptime` for anything else. The two agree on every value either accepts
    in that shape; what differs is the cost, and this is on a hot path.
    `ratings()` calls this once per task and twice per ledger event to decide
    which trailing week each one falls in — 61,285 times on the largest account
    in this database, which was 294ms of the 616ms the report card took, more
    than the reads it is scoring. `strptime` re-reads the locale and recompiles
    its format on every call; `fromisoformat` is a C parser for exactly this
    string.

    The shape test is what keeps the two honest rather than just fast:
    `fromisoformat` also accepts the compact `20260919`, which `strptime` with
    this format does not, so it is only reached for text `strptime` would have
    accepted too.
    """
    if not raw:
        return None
    text = str(raw)[:10]
    if len(text) == 10 and text[4] == '-' and text[7] == '-':
        try:
            return date.fromisoformat(text)
        except ValueError:
            return None
    try:
        return datetime.strptime(text, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None


#: How long a streak has to be before one missed day is forgiven.
#:
#: The forgiveness has to be *earned*, or it is not a streak — a grace day
#: available from day one means working every other day for ever and being told
#: it is a run. A week is long enough that somebody has shown the habit is real
#: and short enough to reach before the first missed day, which is the one that
#: does the damage.
GRACE_EARNED_AT = 7

#: How long before a spent grace day comes back, in days.
#:
#: One per streak was the first version and it is too mean at the long end: a
#: 200-day run that forgave a missed day in March is unprotected for the rest
#: of the year, which is the opposite of the point. One a month is a rate,
#: so the protection scales with the run instead of being used up by it.
GRACE_REFRESH_DAYS = 30


def _grace_available(user, last_date, today):
    """Whether the single day missed between these two dates is forgiven.

    Three things have to hold. **Exactly one day was missed** — this forgives
    an off day, not a fortnight away, and two missed days is a broken streak by
    any reading. **The streak had reached `GRACE_EARNED_AT`**, so the
    forgiveness was earned. And **no grace day has been spent recently**,
    which is what stops it becoming a standing licence.

    The last of those has a wrinkle: the day already recorded may be *this*
    missed day, because `refresh_streak` records it on a page load and
    `extend_streak` asks again when a task lands later the same day. That is
    the same forgiveness being read twice, not a second one, so it is allowed
    — which is what makes both callers idempotent.
    """
    if (today - last_date).days != 2:
        return False
    if (user.get('current_streak') or 0) < GRACE_EARNED_AT:
        return False

    missed = last_date + timedelta(days=1)
    already = parse_day(user.get('streak_grace_day'))
    if already is None or already == missed:
        return True
    return (today - already).days >= GRACE_REFRESH_DAYS


def refresh_streak(user):
    """Decay a stale streak so every page reads the same live value.

    A streak counts consecutive days with at least one completed task. It stays
    alive while the last completed task was today or yesterday — and now also
    across a single missed day, when the run had earned that. Two missed days,
    or one that the account has no grace left for, ends it. best_streak is the
    all-time record and is never lowered. At the start of a new day day_state
    flips back to 'newday' so the next completion extends the streak.

    Returns True when the record changed, so the caller can persist it.
    """
    last_date = parse_day(user.get('last_task_date'))
    if last_date is None:
        return False

    today = date.today()
    gap = (today - last_date).days
    changed = False
    if gap >= 2:
        if _grace_available(user, last_date, today):
            # One day missed, and this run had a grace day to spend. The
            # streak stands; the day it covered is written down so the rate in
            # GRACE_REFRESH_DAYS can be counted from it, and so that the same
            # day is not paid for twice.
            missed = (last_date + timedelta(days=1)).isoformat()
            if user.get('streak_grace_day') != missed:
                user['streak_grace_day'] = missed
                changed = True
        elif user.get('current_streak', 0) != 0:
            # Too long away, or nothing left to spend — the streak is broken.
            user['current_streak'] = 0
            changed = True
        if user.get('day_state') != 'newday':
            user['day_state'] = 'newday'
            changed = True
    elif gap == 1:
        # New day, streak still alive but not yet extended today.
        if user.get('day_state') != 'newday':
            user['day_state'] = 'newday'
            changed = True
    return changed


def extend_streak(user):
    """Count today's completion toward the streak.

    Another task the same day leaves it unchanged, the first task the next day
    extends it by one, a single missed day the run had earned forgiveness for
    also extends it, and anything longer restarts it at one.

    The grace is decided here rather than read off what `refresh_streak` left
    behind, because nothing guarantees a page load happened in between — a task
    finished from a screen that never called it would otherwise be scored by a
    different rule than the same task finished a minute after opening the app.
    Both ask `_grace_available`, and asking twice about one missed day is
    allowed, so the two agree however they are interleaved.
    """
    today = date.today()
    last_date = parse_day(user.get('last_task_date'))
    current = user.get('current_streak', 0) or 0

    if last_date is None:
        new_streak = 1
    else:
        gap = (today - last_date).days
        if gap <= 0:
            new_streak = max(current, 1)
        elif gap == 1:
            new_streak = current + 1
        elif _grace_available(user, last_date, today):
            new_streak = current + 1
            user['streak_grace_day'] = (last_date + timedelta(days=1)).isoformat()
        else:
            new_streak = 1
            # A run that ended takes its spent grace with it: the next one is
            # a new run and earns its own at GRACE_EARNED_AT.
            user['streak_grace_day'] = None

    user['current_streak'] = new_streak
    user['best_streak'] = max(user.get('best_streak', 0) or 0, new_streak)
    user['last_task_date'] = today.isoformat()
    user['day_state'] = 'oldday'
    return new_streak


def award_task_completion(user, xp_reward):
    """Move an account's whole progression on for one completed task.

    XP in, level recalculated from the new total, tasks_completed up one and
    the streak extended. **This writes the row itself** — the caller does not
    save afterwards — and `user` is updated in place to match what landed.

    ## Why the write is here rather than in the caller

    It used to add to `user['xp']` in Python and leave the caller to save the
    whole users table. Two completions arriving together each read the same
    starting total and each wrote their own +1, so one of them disappeared:
    thirty concurrent completions moved `tasks_completed` by one. XP and the
    task count are running totals and the database has to be the one adding to
    them.

    The streak is different and is still computed here: it is derived from
    `last_task_date` rather than accumulated, so two writers on the same day
    reach the same answer and the last one winning is correct.
    """
    extend_streak(user)
    row = db.add_to_row('users', user['id'],
                        {'xp': xp_reward, 'tasks_completed': 1},
                        changes={
                            'current_streak': user['current_streak'],
                            'best_streak': user['best_streak'],
                            'last_task_date': user['last_task_date'],
                            'day_state': user['day_state'],
                        })
    # Read back rather than assumed: another completion may have landed between
    # this one's read and its write, and the level has to follow the total that
    # is actually in the row.
    if row:
        user.update(row)
    else:
        user['xp'] = user.get('xp', 0) + xp_reward
        user['tasks_completed'] = user.get('tasks_completed', 0) + 1

    levels = level_for_total_xp(user['xp'])
    user['level'] = levels['level']
    db.update_row('users', user['id'], {'level': levels['level']})
    return levels

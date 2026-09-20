"""Focus time: how long the user actually sat down and worked.

The session itself runs client-side (src/hooks/useFocusSession.ts keeps the
timer in localStorage, as focus.js did before the port — same key, same shape).
What is tracked here is each day's total, one row per user per
day in focus.sql — so the calendar's Weekly Focus Time panel, the growth chart
and focus-type goals all read one number that survives a cleared browser.

Also here: the one-line "Focus" note attached to a calendar day, which the
Week, Day and Month views all show, so an edit in one view lands everywhere.
"""
from datetime import datetime

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


def history_for_everyone():
    """`history_for`, for every account at once: `{username: {day: {...}}}`.

    One read of a table that holds 1,880 rows, for the one caller that wants
    all of them — `/api/standing`, which compares accounts and so cannot scope
    itself to one. Asking `history_for` per account read this table sixteen
    times over for the standing panel and four times over per account inside
    the report card it called, which is where the bulk of that endpoint's 64
    focus reads came from.

    Aggregating it in SQL would buy nothing: there is already one row per
    account per day, which is the shape the callers want, and the coercion
    below is the same `_seconds` and `_goal_hours` every other reader goes
    through rather than a second opinion written in SQLite.
    """
    histories = {}
    for row in db.focus_days():
        username = row.get('user_id')
        day = row.get('date')
        if not username or not day:
            continue
        histories.setdefault(username, {})[day] = {
            'seconds': _seconds(row), 'goal_hours': _goal_hours(row)}
    return histories


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


def seconds_in_window(username, lo_days, hi_days, today):
    """Focused seconds recorded between `lo_days` and `hi_days` ago."""
    total = 0.0
    for row in _rows_for(username):
        try:
            d = datetime.strptime(str(row.get('date'))[:10], '%Y-%m-%d').date()
        except (ValueError, TypeError):
            continue
        if lo_days <= (today - d).days <= hi_days:
            total += _seconds(row)
    return total


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

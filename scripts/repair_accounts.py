"""Put every account's stored dates back in line with its own record.

    .venv-fastapi/bin/python scripts/repair_accounts.py           # show what would change
    .venv-fastapi/bin/python scripts/repair_accounts.py --apply   # change it

Two things it fixes, both found on 2026-10-21:

- users.created_at later than the account's first XP, finished task or focus
  day (Alpha's said 2021-08-12 with a record from 2020-09-12), or missing.
  It's set to the first recorded day; a missing one with no record falls back
  to the account id, the same as created_date_for.
- xp_events rows with no `date`. Code reads the timestamp instead, but SQL
  that groups by `date` skips them, so they get the timestamp's day.

Runs against whatever the app runs against (DATABASE_URL, else SQLite), so
point SUMMIT_DB or DATABASE_URL at a copy first if you want to try it out.
Safe to run twice: a second run finds nothing.
"""
import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import connection as db  # noqa: E402
from backend.tracking.auth import created_date_for  # noqa: E402


def _day(value):
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def first_days(con):
    """{username: earliest day with XP, a finished task or focus on it}."""
    first = {}
    queries = (
        "SELECT user_id, MIN(COALESCE(NULLIF(date, ''), substr(timestamp, 1, 10))) AS d "
        "FROM xp_events GROUP BY user_id",
        "SELECT user_id, MIN(substr(completed_at, 1, 10)) AS d FROM tasks "
        "WHERE status = 'done' AND completed_at IS NOT NULL AND completed_at != '' GROUP BY user_id",
        "SELECT user_id, MIN(date) AS d FROM focus_days GROUP BY user_id",
    )
    for sql in queries:
        for row in con.execute(sql):
            day = _day(row['d'])
            if day and (row['user_id'] not in first or day < first[row['user_id']]):
                first[row['user_id']] = day
    return first


def main(apply):
    con = db.connect()
    try:
        first = first_days(con)
        fixes = []
        for user in con.execute('SELECT username, id, created_at FROM users'):
            user = dict(user)
            stored = created_date_for(user) if user.get('created_at') else None
            start = first.get(user['username'])
            if start and (stored is None or start < stored):
                fixes.append((user['username'], user.get('created_at'), start.isoformat() + 'T00:00:00'))
            elif stored is None:
                fixes.append((user['username'], None, created_date_for(user).isoformat() + 'T00:00:00'))

        undated = con.execute(
            "SELECT user_id, COUNT(*) AS n FROM xp_events "
            "WHERE (date IS NULL OR date = '') AND timestamp IS NOT NULL AND timestamp != '' "
            "GROUP BY user_id").fetchall()

        for username, was, now in fixes:
            print('created_at  {:<18} {} -> {}'.format(username, was or '(none)', now))
        for row in undated:
            print('xp dates    {:<18} {} rows get their timestamp\'s day'.format(row['user_id'], row['n']))
        if not fixes and not undated:
            print('Nothing to repair.')
            return

        if not apply:
            print('\nDry run. Add --apply to write these.')
            return
        for username, _was, now in fixes:
            con.execute('UPDATE users SET created_at = ? WHERE username = ?', (now, username))
        con.execute(
            "UPDATE xp_events SET date = substr(timestamp, 1, 10) "
            "WHERE (date IS NULL OR date = '') AND timestamp IS NOT NULL AND timestamp != ''")
        con.commit()
        print('\nRepaired at {}.'.format(datetime.now().isoformat(timespec='seconds')))
    finally:
        con.close()


if __name__ == '__main__':
    main('--apply' in sys.argv)

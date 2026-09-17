"""One account per stage of the analytics ladder, so every stage can be looked at.

    .venv-fastapi/bin/python scripts/seed_stages.py           # write them
    .venv-fastapi/bin/python scripts/seed_stages.py --clear   # take them out

## Why these exist

The analytics page is five stages deep and every one of them is gated on
`activeDays` — days with real work on them, counted by utils/activeDay. That
makes the early stages almost impossible to see: an account old enough to be
worth developing against is, by definition, past them, and the only honest way
back to `Collecting` was to stop working for a month.

So this writes six accounts whose records land on either side of every
threshold in components/Analytics/milestones. They are not demos: each one is
a real record of finished tasks, XP events and focus days, so the page counts
them exactly as it counts anybody, and every figure on screen is arrived at the
same way it would be for a real reader.

## The six

    stage-new          1 active day     nothing has opened; the first milestone
    stage-early        4                the two Early tallies
    stage-weekly       9                trends, comparisons, the subject split
    stage-developing  18                the score, the grade, recommendations
    stage-full        40                everything, no staging notice
    stage-away        40, then quiet    `full`, and away long enough to say so

`stage-away` is the one worth keeping. It is the case the rest of the ladder
cannot produce: a complete account whose window is empty because nobody has
worked in it, which is what `AwayNotice` exists for and what a page of zeros
looks like without it.

## What it writes, and what --clear takes back

Six rows in `users`, and against each: `tasks`, `xp_events`, `focus_days`,
`user_subjects` and the two `user_settings` keys that keep the setup wizard out
of the way. Every generated row carries an id in the 1.20e12-1.299e12 band —
seed_year owns 1.00e12-1.099e12 and seed_alpha 1.10e12-1.199e12 — so `--clear`
removes exactly what this wrote and nothing a real account has ever done.

Deterministic: the same seed gives the same record every run, so a screenshot
taken today still matches the account tomorrow.

## The password

One shared password for all six, printed on every run. **These are local
development fixtures.** They are written straight into the database with a
known password and verified e-mail flags already set; nothing here should ever
run against a deployment, which is why it reads DB_PATH from the dev settings
rather than taking a connection string.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sqlite3
import sys
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.config.settings import DB_PATH  # noqa: E402
from backend.tracking.auth import hash_password  # noqa: E402

#: The id band this script owns. See the note above.
ID_BASE = 1_200_000_000_000
ID_TOP = 1_299_999_999_999

#: Local fixtures only. Printed on every run so it is never a secret anybody
#: has to go looking for.
PASSWORD = 'summit-dev'

#: Subject ids from the built-in catalogue — the same slugs a real task carries,
#: so the subject split and the per-subject pages resolve names normally.
SUBJECTS = [
    ('mathematics', 'Mathematics'),
    ('computer_science', 'Computer Science'),
    ('chemistry', 'Chemistry'),
    ('physics', 'Physics'),
]

TITLES = [
    'Problem set', 'Past paper', 'Reading', 'Lab write-up', 'Revision block',
    'Practice questions', 'Notes review', 'Worked examples', 'Essay draft',
    'Proof exercises',
]


class Account:
    """One seeded account and the shape of the record behind it."""

    def __init__(self, username, stage, active_days, span_days, quiet_days=0):
        self.username = username
        self.stage = stage
        #: Days with work on them. This is what every gate reads.
        self.active_days = active_days
        #: Calendar days from the first worked day to the last worked one.
        self.span_days = span_days
        #: Days of nothing after that. Only `stage-away` has any.
        self.quiet_days = quiet_days

    @property
    def age_days(self):
        return self.span_days + self.quiet_days


ACCOUNTS = [
    Account('stage-new', 'new', active_days=1, span_days=2),
    Account('stage-early', 'early', active_days=4, span_days=8),
    Account('stage-weekly', 'weekly', active_days=9, span_days=18),
    Account('stage-developing', 'developing', active_days=18, span_days=40),
    Account('stage-full', 'full', active_days=40, span_days=70),
    # Complete, then gone. `quietDays` past DORMANT_AFTER is the whole point.
    Account('stage-away', 'full (dormant)', active_days=40, span_days=70, quiet_days=50),
]


def worked_days(account, today, rng):
    """Which calendar days this account actually worked, oldest first.

    The active days are spread across the span rather than packed at one end:
    an account whose forty days are forty consecutive ones has no gaps for the
    consistency figures to be about, and the heatmap draws a solid block that
    looks like seeded data because it is.
    """
    first = today - timedelta(days=account.age_days - 1)
    span = [first + timedelta(days=n) for n in range(account.span_days)]
    if account.active_days >= len(span):
        return span
    # Always include the first and last day of the span, so `spanDays` is the
    # figure the account was built for rather than whatever the sample left.
    chosen = {span[0], span[-1]}
    rest = [day for day in span[1:-1]]
    rng.shuffle(rest)
    chosen.update(rest[: max(0, account.active_days - len(chosen))])
    return sorted(chosen)


def build(account, today, rng):
    """Every row for one account, as (table, row-dict) pairs."""
    rows = []
    created = today - timedelta(days=account.age_days - 1)
    user_id = str(ID_BASE + abs(hash(account.username)) % 10_000)

    rows.append(('users', {
        'id': user_id,
        'username': account.username,
        'name': account.username.replace('-', ' ').title(),
        'email': '{}@summit.local'.format(account.username),
        'password_hash': hash_password(PASSWORD),
        'provider': 'local',
        # Verified and complete, so the account signs straight in rather than
        # landing on a step that has nothing to do with analytics.
        'email_verified': 1,
        'profile_complete': 1,
        'theme': 'light',
        'daily_goal': 200,
        'xp': 0,
        'level': 1,
        'tasks_completed': 0,
        'current_streak': 0,
        'best_streak': 0,
        'created_at': created.isoformat(),
    }))

    for subject_id, name in SUBJECTS:
        rows.append(('user_subjects', {
            'user_id': account.username,
            'subject_id': subject_id,
            'name': name,
            'family': '',
            'custom': 0,
            'created_at': created.isoformat(),
        }))

    # The wizard is not what these accounts are for. See the module note.
    for key, value in (('analytics_setup_done', True), ('analytics_home_tab', 'overview')):
        rows.append(('user_settings', {
            'user_id': account.username,
            'key': key,
            'value': json.dumps(value),
            'updated_at': datetime.now().isoformat(),
        }))

    days = worked_days(account, today, rng)
    seq = 0
    total_xp = 0
    total_tasks = 0

    for day in days:
        # Between two and six finished tasks, which is the range that makes the
        # "tasks on the days you work" average land somewhere believable.
        count = rng.randint(2, 6)
        day_xp = 0

        for _ in range(count):
            seq += 1
            task_id = str(ID_BASE + 100_000 + seq + abs(hash(account.username)) % 1_000 * 10_000)
            subject_id, _name = rng.choice(SUBJECTS)
            hour = rng.choice([9, 10, 14, 16, 19, 20, 21])
            done_at = datetime.combine(day, datetime.min.time()).replace(
                hour=hour, minute=rng.randint(0, 59)
            )
            xp = rng.choice([20, 25, 30, 40, 50])
            day_xp += xp

            # Rated, so the quality panels, the difficulty curve and the
            # execution-gap observation all have something real to read.
            difficulty = rng.choices([2, 3, 4, 5], weights=[2, 4, 3, 1])[0]
            execution = min(5, max(1, difficulty + rng.choice([-1, 0, 0, 1, 1])))

            rows.append(('tasks', {
                'id': task_id,
                'user_id': account.username,
                'title': rng.choice(TITLES),
                'description': '',
                'priority': rng.choices(['low', 'medium', 'high'], weights=[1, 3, 2])[0],
                'status': 'done',
                'xp_value': xp,
                'due_date': day.isoformat(),
                'show_on_calendar': 1,
                'created_at': (done_at - timedelta(days=1)).isoformat(),
                'completed_at': done_at.isoformat(),
                'completion_seconds': rng.randint(900, 5400),
                'met_deadline': rng.choices([1, 0], weights=[4, 1])[0],
                'subject': subject_id,
                'difficulty': difficulty,
                'execution': execution,
            }))

            rows.append(('xp_events', {
                'id': str(int(task_id) + 500_000),
                'user_id': account.username,
                'amount': xp,
                'reason': 'task_completion',
                'timestamp': done_at.isoformat(),
                'date': day.isoformat(),
                'tasks_completed': 1,
                'avg_task_xp': xp,
            }))

        rows.append(('focus_days', {
            'user_id': account.username,
            'date': day.isoformat(),
            'seconds': rng.randint(25, 150) * 60,
            'goal_hours': 2,
        }))

        total_xp += day_xp
        total_tasks += count

    # A couple of open tasks, so the completion rate is a rate rather than 100%.
    for n in range(2):
        seq += 1
        rows.append(('tasks', {
            'id': str(ID_BASE + 200_000 + seq + abs(hash(account.username)) % 1_000 * 10_000),
            'user_id': account.username,
            'title': rng.choice(TITLES),
            'description': '',
            'priority': 'medium',
            'status': 'todo',
            'xp_value': 30,
            'due_date': (today + timedelta(days=n + 1)).isoformat(),
            'show_on_calendar': 1,
            'created_at': today.isoformat(),
            'subject': rng.choice(SUBJECTS)[0],
        }))

    # The user row's own totals, so the rail and the dashboard agree with the
    # ledger rather than reading zero beside a full analytics page.
    for table, row in rows:
        if table == 'users':
            row['xp'] = total_xp
            row['level'] = max(1, total_xp // 100)
            row['tasks_completed'] = total_tasks
            row['last_task_date'] = days[-1].isoformat() if days else None

    return rows


def clear(conn):
    """Remove every row this script has ever written, and nothing else."""
    names = [account.username for account in ACCOUNTS]
    marks = ','.join('?' for _ in names)
    for table in ('tasks', 'xp_events', 'focus_days', 'user_settings', 'user_subjects'):
        conn.execute('DELETE FROM {} WHERE user_id IN ({})'.format(table, marks), names)
    conn.execute('DELETE FROM users WHERE username IN ({})'.format(marks), names)
    conn.commit()


def write(conn, rows):
    for table, row in rows:
        columns = ','.join(row)
        marks = ','.join('?' for _ in row)
        conn.execute(
            'INSERT OR REPLACE INTO {} ({}) VALUES ({})'.format(table, columns, marks),
            list(row.values()),
        )
    conn.commit()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--clear', action='store_true', help='remove the accounts and stop')
    parser.add_argument('--seed', type=int, default=20260916)
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)
    conn.execute('PRAGMA foreign_keys = ON')

    clear(conn)
    if args.clear:
        print('Removed {} stage accounts.'.format(len(ACCOUNTS)))
        return

    today = date.today()
    print('Seeding into {}\n'.format(DB_PATH))
    print('{:<18} {:<18} {:>7} {:>7}  {}'.format(
        'USERNAME', 'STAGE', 'ACTIVE', 'SPAN', 'PASSWORD'))
    print('-' * 68)

    for account in ACCOUNTS:
        rng = random.Random(args.seed + len(account.username))
        write(conn, build(account, today, rng))
        print('{:<18} {:<18} {:>7} {:>7}  {}'.format(
            account.username, account.stage, account.active_days,
            account.age_days, PASSWORD))

    print('\nAll six use the same password. Local fixtures only.')
    print('Open http://localhost:5090/analytics after signing in as any of them.')


if __name__ == '__main__':
    main()

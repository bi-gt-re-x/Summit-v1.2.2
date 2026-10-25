"""Alpha's last few weeks: the timetable caught up, and weekly topic practice.

    .venv-fastapi/bin/python scripts/seed_alpha_weeks.py             # write it
    .venv-fastapi/bin/python scripts/seed_alpha_weeks.py --weeks 12  # further back
    .venv-fastapi/bin/python scripts/seed_alpha_weeks.py --clear     # take it back out

## Why this exists next to seed_alpha.py

seed_alpha.py wrote six years of record ending the day it ran (Oct 15) and a
year of timetable after it, all still open. So every day since reads as
nothing done: the Weekly summary on Analytics says zero days worked, the slump
card fires, and the topic library has nothing recent. And the six years were
written with names like "AIME problem set", which say the contest but never
the topic, so the subject page could only ask for topic names.

This writes two things on top, through the app's own database layer, so it
lands wherever the server reads (Postgres when DATABASE_URL is set, unlike
seed_alpha.py, which still writes the SQLite file):

**The timetable filled in.** Over the same weeks, every day either has its
seed_alpha blocks still open (from the day the record ends) or, before that,
is thin: from mid-September the record has one to four worked days a week,
with the work bunched onto single days. Open blocks are finished the way the
record before them was: most on time, a few late, about one in eight skipped
and left open. A thin day (fewer than six finished tasks) gets that weekday's
timetable from seed_alpha's `WEEK`, finished the same way. Each gets a
difficulty, a rating, sometimes a reason, and its XP in the ledger.

**Weekly topic practice.** For the last `--weeks` weeks, a fixed weekly plan
of named practice tied to Alpha's goals: AMC 10 and AIME sets that say the
topic (recursive counting, casework, number theory, geometry), USACO Gold
and Codeforces problems by topic, Strang's linear algebra, and ARCT violin
work. Each topic has its own level and trend, so the topic library shows
something real: recursive counting weak but climbing, casework strong, USACO
DP improving, Codeforces constructive problems weak.

Focus time is added only to days the timer never touched (no row, or under a
minute), from the studied blocks and practice on them. A day with real timer
time keeps exactly what it has.

## Owning what it writes

Tasks this writes have ids 1.300e12-1.309e12 and ledger rows 1.320e12-1.329e12,
13 digits like seed_alpha's (1.1e12) and seed_year's (1.0e12), so nothing the
app makes can collide with them. A caught-up timetable block keeps its
seed_alpha id; it's known as this script's by the ledger row this script
wrote for it. Focus days this writes carry seconds that end in :07, so
`--clear` can tell them from the timer's (a day that had under a minute
before loses that minute with it). `users.xp`, the level and the streak
are recomputed from the ledger and the record at the end, both ways.
"""
import argparse
import importlib.util
import os
import random
import sys
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.config import settings  # noqa: E402

settings.load_dotenv()  # DATABASE_URL, the way the server finds it

from backend.database import connection as db  # noqa: E402
from backend.tracking.xp import level_for_total_xp  # noqa: E402

TASK_LOW, TASK_HIGH = 1_300_000_000_000, 1_309_999_999_999
ROUTINE_BASE = TASK_LOW + 500_000  # routine blocks on thin days; practice is below it
EVENT_LOW, EVENT_HIGH = 1_320_000_000_000, 1_329_999_999_999
ALPHA_LOW, ALPHA_HIGH = 1_100_000_000_000, 1_119_999_999_999  # seed_alpha's tasks
FOCUS_MARK = 7  # seconds past the minute on every focus day this writes
THIN = 6  # a day with fewer finished tasks than this gets its timetable
QUIET = 60  # focus seconds under which a day counts as untouched by the timer


def timetable():
    """seed_alpha's WEEK: (weekday, title, subject, start, end, xp, study)."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seed_alpha.py')
    spec = importlib.util.spec_from_file_location('seed_alpha', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.WEEK

#: Subjects whose blocks count as studied time on the focus timer.
STUDY = {'mathematics', 'computer_science', 'machine_learning', 'statistics', 'research',
         'thesis', 'lectures', 'physics', 'music', 'literature'}

STRUGGLE = ['distracted', 'unclear', 'underestimated', 'no-time', 'low-energy', 'interrupted']
WENT_WELL = ['prepared', 'deep-focus', 'momentum', 'broken-down', 'fresh', 'familiar']

# --------------------------------------------------------------------------
# The weekly plan
# --------------------------------------------------------------------------
# topic key -> (title, subject, goal id, difficulty, level at the start,
#               level now, minutes)
# A level is the mean rating, 1-5, that topic's work gets. The rating of each
# session is drawn around the line from start to now, so a topic can climb.
TOPICS = {
    'rc':   ('AMC 10 recursive counting set', 'mathematics', 'scg0001', 4, 2.1, 3.0, 50),
    'case': ('AMC 10 casework set', 'mathematics', 'scg0001', 3, 4.0, 4.3, 40),
    'nt':   ('AIME number theory set', 'mathematics', 'scg0001', 4, 3.3, 3.5, 60),
    'geo':  ('AIME mock: geometry', 'mathematics', 'scg0001', 5, 2.8, 2.6, 90),
    'ev':   ('AIME probability: expected value', 'mathematics', 'scg0001', 4, 3.0, 3.2, 45),
    'eig':  ('Strang linear algebra: eigenvalues', 'mathematics', '', 3, 3.9, 4.2, 60),
    'dp':   ('USACO Gold dynamic programming problems', 'computer_science', 'scg0003', 4, 2.9, 3.7, 75),
    'sp':   ('USACO Gold shortest paths problems', 'computer_science', 'scg0003', 4, 3.8, 4.0, 60),
    'grd':  ('Codeforces Div 2: greedy problems', 'computer_science', 'scg0006', 3, 3.5, 3.6, 60),
    'con':  ('Codeforces constructive problems', 'computer_science', 'scg0006', 4, 2.6, 2.7, 60),
    'sw':   ('LeetCode sliding window problems', 'computer_science', '', 3, 4.1, 4.3, 40),
    'sc':   ('ARCT scales & arpeggios', 'music', 'scg0005', 3, 3.8, 4.1, 30),
    'et':   ('Kreutzer etude 9', 'music', 'scg0005', 4, 3.3, 3.7, 45),
    'sh':   ('Violin shifting drills', 'music', 'scg0005', 3, 2.8, 3.4, 25),
}

# Weekday (Mon=0) -> sessions, each (topic key, start time). Two or three a day,
# heaviest at the weekend, which is where the long timed work goes.
WEEK = {
    0: [('rc', '16:30'), ('sc', '20:00')],
    1: [('dp', '16:30'), ('eig', '19:30')],
    2: [('nt', '16:30'), ('et', '20:00')],
    3: [('sw', '16:00'), ('rc', '19:00'), ('sh', '21:00')],
    4: [('con', '16:30'), ('ev', '19:30')],
    5: [('geo', '10:00'), ('grd', '14:00'), ('sc', '18:00')],
    6: [('case', '10:30'), ('sp', '14:00'), ('et', '17:30')],
}


def stamp(day: date, hhmm: str, plus: int = 0) -> str:
    hour, minute = map(int, hhmm.split(':'))
    at = datetime(day.year, day.month, day.day, hour, minute) + timedelta(minutes=plus)
    return at.isoformat(timespec='seconds')


def rating(rng: random.Random, level: float) -> int:
    return max(1, min(5, round(level + rng.gauss(0, 0.55))))


def reason_for(rng: random.Random, execution: int) -> str:
    if execution <= 2 and rng.random() < 0.6:
        return rng.choice(STRUGGLE)
    if execution >= 4 and rng.random() < 0.35:
        return rng.choice(WENT_WELL)
    return ''


# --------------------------------------------------------------------------
# Writing
# --------------------------------------------------------------------------
def practice_rows(user: str, today: date, weeks: int, now: datetime, rng: random.Random):
    """The weekly plan for the last `weeks` weeks, finished, as task rows."""
    first = today - timedelta(days=7 * weeks - 1)
    rows = []
    for offset in range(7 * weeks):
        day = first + timedelta(days=offset)
        progress = offset / max(1, 7 * weeks - 1)
        # A rest day now and then, the way a real month has them.
        if rng.random() < 0.08:
            continue
        for key, start in WEEK[day.weekday()]:
            title, subject, goal, difficulty, was, now_level, span = TOPICS[key]
            if rng.random() < 0.07:
                continue  # one session skipped
            begin = stamp(day, start)
            end = stamp(day, start, span)
            if datetime.fromisoformat(end) > now:
                continue
            execution = rating(rng, was + (now_level - was) * progress)
            late = rng.random() < 0.08
            done_at = stamp(day, start, span + (rng.randint(20, 70) if late else -rng.randint(0, 8)))
            rows.append({
                'id': str(TASK_LOW + len(rows)),
                'user_id': user, 'title': title, 'description': '', 'priority': 'medium',
                'status': 'done', 'xp_value': 10 * difficulty + span // 5, 'subject': subject,
                'goal_id': goal or None, 'due_date': end, 'show_on_calendar': True,
                'created_at': begin, 'completed_at': done_at, 'completion_seconds': span * 60,
                'met_deadline': not late, 'difficulty': difficulty, 'execution': execution,
                'reason': reason_for(rng, execution) or None,
            })
    return rows


def finish(rng: random.Random, start: datetime, end: datetime):
    """When a block was finished, whether on time, and how it went."""
    late = rng.random() < 0.07
    finished = end + (timedelta(minutes=rng.randint(15, 60)) if late else -timedelta(minutes=rng.randint(0, 5)))
    difficulty = rng.choices([2, 3, 4, 5], weights=[14, 38, 34, 14])[0]
    execution = max(1, min(5, round(difficulty + 0.4 + rng.gauss(0, 0.8))))
    return finished, not late, difficulty, execution


def fill_days(con, user: str, first: date, now: datetime, rng: random.Random):
    """Every day from `first` to now: finish seed_alpha's open blocks, or on a
    thin day write the weekday's timetable, finished. Returns the finished rows
    as (id, xp, subject, created_at, completed_at, minutes, study)."""
    week = timetable()
    done = []
    routine = 0
    for offset in range((now.date() - first).days + 1):
        day = first + timedelta(days=offset)
        open_rows = con.execute(
            'SELECT id, xp_value, subject, created_at, due_date FROM tasks '
            'WHERE user_id = ? AND status = ? AND created_at >= ? AND created_at < ? AND due_date <= ? '
            'AND id >= ? AND id <= ? AND length(id) = 13 ORDER BY created_at',
            (user, 'todo', day.isoformat(), (day + timedelta(days=1)).isoformat(),
             now.isoformat(timespec='seconds'), str(ALPHA_LOW), str(ALPHA_HIGH))).fetchall()
        if open_rows:
            for row in open_rows:
                task_id, xp, subject, created, due = row[0], int(row[1] or 0), row[2], row[3], row[4]
                if rng.random() < 0.12:
                    continue  # skipped, and left open like a real missed block
                start, end = datetime.fromisoformat(created), datetime.fromisoformat(due)
                minutes = max(5, int((end - start).total_seconds() // 60))
                finished, on_time, difficulty, execution = finish(rng, start, end)
                con.execute(
                    'UPDATE tasks SET status = ?, completed_at = ?, completion_seconds = ?, met_deadline = ?, '
                    'difficulty = ?, execution = ?, reason = ? WHERE id = ?',
                    ('done', finished.isoformat(timespec='seconds'), minutes * 60, on_time, difficulty,
                     execution, reason_for(rng, execution) or None, task_id))
                done.append((task_id, xp, subject, created, finished.isoformat(timespec='seconds'), minutes,
                             subject in STUDY))
            continue
        have = con.execute(
            'SELECT COUNT(*) FROM tasks WHERE user_id = ? AND status = ? AND completed_at >= ? AND completed_at < ? '
            'AND NOT (id >= ? AND id <= ? AND length(id) = 13)',
            (user, 'done', day.isoformat(), (day + timedelta(days=1)).isoformat(),
             str(TASK_LOW), str(TASK_HIGH))).fetchone()[0]
        if have >= THIN:
            continue
        for weekday, title, subject, begin, finish_at, xp, study in week:
            if weekday != day.weekday() or rng.random() < 0.1:
                continue
            start = datetime.fromisoformat(stamp(day, begin))
            end = datetime.fromisoformat(stamp(day, finish_at))
            if end > now:
                continue
            minutes = max(5, int((end - start).total_seconds() // 60))
            finished, on_time, difficulty, execution = finish(rng, start, end)
            task_id = str(ROUTINE_BASE + routine)
            routine += 1
            con.execute(
                'INSERT INTO tasks (id, user_id, title, description, priority, status, xp_value, subject, '
                'due_date, show_on_calendar, created_at, completed_at, completion_seconds, met_deadline, '
                'difficulty, execution, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (task_id, user, title, '', 'medium', 'done', xp, subject, end.isoformat(timespec='seconds'),
                 True, start.isoformat(timespec='seconds'), finished.isoformat(timespec='seconds'),
                 minutes * 60, on_time, difficulty, execution, reason_for(rng, execution) or None))
            done.append((task_id, xp, subject, start.isoformat(timespec='seconds'),
                         finished.isoformat(timespec='seconds'), minutes, bool(study)))
    return done


def recount(con, user: str):
    """users.xp, level, tasks done and both streaks, from the ledger and the
    record, by seed_alpha's own rule (a day counts when a task was finished on
    it). The best streak is the record's longest run, so after `--clear` it
    reads what the record supports rather than whatever was stored before."""
    total, count = con.execute(
        'SELECT COALESCE(SUM(amount), 0), COALESCE(SUM(COALESCE(tasks_completed, 1)), 0) '
        'FROM xp_events WHERE user_id = ?', (user,)).fetchone()
    days = sorted({row[0][:10] for row in con.execute(
        'SELECT completed_at FROM tasks WHERE user_id = ? AND status = ? AND completed_at IS NOT NULL',
        (user, 'done')) if row[0]})
    best = run = 0
    previous = None
    for iso in days:
        this = date.fromisoformat(iso)
        run = run + 1 if previous and (this - previous).days == 1 else 1
        best = max(best, run)
        previous = this
    # The current run only counts if it reaches yesterday or today.
    current = run if days and (date.today() - date.fromisoformat(days[-1])).days <= 1 else 0
    level = level_for_total_xp(total)['level']
    con.execute(
        'UPDATE users SET xp = ?, level = ?, tasks_completed = ?, current_streak = ?, best_streak = ?, '
        'last_task_date = ? WHERE username = ?',
        (int(total), level, int(count), current, best, days[-1] if days else None, user))
    return int(total), level, current


def focus_written(con, user: str) -> dict:
    """The focus seconds this script wrote on each day, worked out again from
    the rows it wrote, so `--clear` removes exactly those and nothing the
    timer logged."""
    study = {title: bool(flag) for _w, title, _s, _b, _e, _xp, flag in timetable()}
    minutes = {}
    for task_id, subject, title, seconds, done_at in con.execute(
            'SELECT t.id, t.subject, t.title, t.completion_seconds, t.completed_at FROM xp_events e '
            'JOIN tasks t ON t.id = e.task_id WHERE e.user_id = ? AND e.id >= ? AND e.id <= ? '
            'AND length(e.id) = 13', (user, str(EVENT_LOW), str(EVENT_HIGH))):
        number = int(task_id)
        if TASK_LOW <= number < ROUTINE_BASE:
            counts = True
        elif ROUTINE_BASE <= number <= TASK_HIGH:
            counts = study.get(title, False)
        else:
            counts = subject in STUDY
        if counts and done_at:
            minutes[done_at[:10]] = minutes.get(done_at[:10], 0) + int(float(seconds or 0)) // 60
    return {day: min(total, 480) * 60 + FOCUS_MARK for day, total in minutes.items()}


def clear(con, user: str) -> dict:
    events = con.execute(
        'SELECT task_id, date FROM xp_events WHERE user_id = ? AND id >= ? AND id <= ? AND length(id) = 13',
        (user, str(EVENT_LOW), str(EVENT_HIGH))).fetchall()
    focus = 0
    for day, seconds in focus_written(con, user).items():
        focus += con.execute('DELETE FROM focus_days WHERE user_id = ? AND date = ? AND seconds = ?',
                             (user, day, seconds)).rowcount
    reopened = 0
    for task_id, _day in events:
        if task_id and ALPHA_LOW <= int(task_id) <= ALPHA_HIGH:
            reopened += con.execute(
                'UPDATE tasks SET status = ?, completed_at = NULL, completion_seconds = NULL, '
                'met_deadline = NULL, difficulty = NULL, execution = NULL, reason = NULL WHERE id = ?',
                ('todo', task_id)).rowcount
    gone = con.execute(
        'DELETE FROM xp_events WHERE user_id = ? AND id >= ? AND id <= ? AND length(id) = 13',
        (user, str(EVENT_LOW), str(EVENT_HIGH))).rowcount
    tasks = con.execute(
        'DELETE FROM tasks WHERE user_id = ? AND id >= ? AND id <= ? AND length(id) = 13',
        (user, str(TASK_LOW), str(TASK_HIGH))).rowcount
    return {'tasks written': tasks, 'ledger rows': gone, 'blocks reopened': reopened, 'focus days': focus}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--user', default='Alpha')
    ap.add_argument('--weeks', type=int, default=8, help='weeks of topic practice to write (default 8)')
    ap.add_argument('--clear', action='store_true', help='take out everything this wrote')
    ap.add_argument('--seed', type=int, default=20261025)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    now = datetime.now()
    today = now.date()
    con = db.connect()
    try:
        with con:
            if not con.execute('SELECT 1 FROM users WHERE username = ?', (args.user,)).fetchone():
                sys.exit('No user named {}.'.format(args.user))
            removed = clear(con, args.user)
            if args.clear:
                xp, level, run = recount(con, args.user)
                print('{}: removed {}'.format(args.user, ', '.join('{} {}'.format(n, k) for k, n in removed.items())))
                print('  ledger {:,} XP, level {}, streak {}'.format(xp, level, run))
                return

            first = today - timedelta(days=7 * args.weeks - 1)
            caught = fill_days(con, args.user, first, now, rng)
            practice = practice_rows(args.user, today, args.weeks, now, rng)
            for row in practice:
                con.execute('INSERT INTO tasks ({}) VALUES ({})'.format(', '.join(row), ', '.join('?' * len(row))),
                            tuple(row.values()))

            # One ledger row per finished task, on the day it was finished.
            finished = [(task_id, xp, done_at) for task_id, xp, _s, _c, done_at, _m, _st in caught]
            finished += [(row['id'], row['xp_value'], row['completed_at']) for row in practice]
            con.executemany(
                'INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date, tasks_completed, '
                'avg_task_xp, task_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [(str(EVENT_LOW + at), args.user, xp, 'task_completion', done_at, done_at[:10], 1, xp, task_id)
                 for at, (task_id, xp, done_at) in enumerate(finished)])

            # Focus time for the days the timer never touched: the studied
            # blocks and the practice on them, capped at eight hours.
            minutes = {}
            for _id, _xp, _subject, _c, done_at, span, study in caught:
                if study:
                    minutes[done_at[:10]] = minutes.get(done_at[:10], 0) + span
            for row in practice:
                day = row['completed_at'][:10]
                minutes[day] = minutes.get(day, 0) + row['completion_seconds'] // 60
            written = 0
            for day, total in sorted(minutes.items()):
                have = con.execute('SELECT seconds FROM focus_days WHERE user_id = ? AND date = ?',
                                   (args.user, day)).fetchone()
                existing = int(float(have[0] or 0)) if have else 0
                if existing >= QUIET:
                    continue
                written += 1
                seconds = min(total, 480) * 60 + FOCUS_MARK
                if have:
                    con.execute('UPDATE focus_days SET seconds = ? WHERE user_id = ? AND date = ?',
                                (seconds, args.user, day))
                else:
                    con.execute('INSERT INTO focus_days (user_id, date, seconds, goal_hours) VALUES (?, ?, ?, ?)',
                                (args.user, day, seconds, 12))

            xp, level, run = recount(con, args.user)
        print('{}: finished {} timetable blocks since {} and wrote {} practice sessions over {} weeks'.format(
            args.user, len(caught), first, len(practice), args.weeks))
        print('  {} focus days, ledger {:,} XP, level {}, streak {}'.format(written, xp, level, run))
    finally:
        con.close()


if __name__ == '__main__':
    main()

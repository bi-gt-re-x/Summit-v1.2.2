"""Seed a year of an account's calendar and task list.

Written for demos and for looking at the app with a real amount of work in it.
Every page in Summit is shaped by what is on the list — the horizon, the
groupings, the sparklines, the week grid, the XP figures — and all of them read
differently against ten rows than against a life. An account with a year in
front of it is the only way to see what those views actually do.

## What it writes

Tasks, and only tasks. The calendar is not a second store: it draws whatever
carries `show_on_calendar`, taking `created_at` as the start of the block and
`due_date` as its end (see frontend/hooks/useCalendarTasks and
`plannedSeconds` in components/Tasks/board.ts). So a timed block on the grid
and an untimed to-do on the Tasks page are the same row with that one flag
different, and this writes both:

    show_on_calendar = 1   a block, start -> end, drawn on the week and month
    show_on_calendar = 0   a to-do, due that day, never on the grid

`calendar_events` holds only the four built-in session bands and is left
alone.

## The shape of the year

One person: a high-school student training seriously for competitive maths and
competitive programming, who also plays violin at a level that costs real hours.
The rhythm is theirs rather than a spread of random rows — the day opens with an
instrument and a problem set before school, school takes the middle of it, and
the afternoon and evening are where the actual training happens. The weekend is
where the long timed work goes, because that is the only place a three-hour
contest fits.

It is deliberately a *rigorous* week and it is meant to look like one. Three
kinds of entry make it up:

  * daily and weekday recurrences, the spine of the week — morning practice,
    morning drill, school, an afternoon block that alternates orchestra and
    programming, homework, and contest maths in the evening;
  * weekly and monthly recurrences, the rhythm on top of it — Monday's three
    targets, Friday's math team and its timed mock, the monthly mistake review
    and the lesson checkpoint;
  * one-offs, scattered across the year, which for this person is a *calendar*
    rather than a scattering: AMC in November, USACO in December, January and
    February, AIME in February, the US Open in March, APs in May, ARML in June,
    and the concerts, auditions and recitals that sit between them.

The account this seeds already has five years of record behind it, and that
record is the same person — its subjects are maths, computer science, physics,
chemistry, literature and music, and its personal bests are AMC 8, MathCounts,
AIME problems solved, a Codeforces rating and RCM levels. The forward year has
to be recognisably the same student, a bit further along: AMC 10/12 and AIME
rather than AMC 8, USACO and Codeforces rather than a first contest.

## The XP floor

Every day is topped up to at least `--min-xp` of open XP. The top-up is drawn
from real work rather than a filler row with a number on it, so a day that
came up short gets another thing this person would plausibly be doing.

## Running it

    python3 scripts/seed_year.py --user Alpha

Idempotent by tag: every row it writes carries a marker in `description`, and
a re-run clears the previous run's rows for that user and window first, so
this can be run repeatedly without stacking. `--clear` removes them and stops.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import random
import sqlite3
import sys
from datetime import date, datetime, timedelta

DB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'summit.db')

# How a re-run finds its own work, and nothing else.
#
# This used to be a marker string written into `description`. That was visible:
# `description` is a real field on a real task, the Tasks page searches it
# along with the title, and every row this wrote carried "[seeded:year]" in a
# column the account is entitled to use for its own notes. A bookkeeping mark
# does not belong in the data it is keeping book on.
#
# So the mark is the id instead. `db.new_id` (backend/database/connection.py)
# hands out the current millisecond, which since 2001 has been a 13-digit
# number starting 1.0e12 and today is 1.79e12 and climbing. The window below
# is therefore reserved by construction: it is 13 digits, it sorts and
# compares as one, and no clock will ever land in it again. Ids are never
# shown to anyone, so nothing about the mark reaches the account.
SEED_ID_LOW = '1000000000000'
SEED_ID_HIGH = '1099999999999'

# The old marker, cleared on the next run so the rows it wrote lose it.
LEGACY_TAG = '[seeded:year]'

# What `description` gets now: the same empty string every other task carries
# when nobody wrote a note on it.
TAG = ''

# How the reserved window is divided between accounts.
#
# `base` used to be `int(SEED_ID_LOW)` flat, so every run wrote ids 1000000000000
# upward whatever it was seeding. That is fine for one account and wrong for two:
# the second run hit `UNIQUE constraint failed: tasks.id` on its first row, and
# neither `--user` nor `--seed` changed anything, because neither reached the id.
# Seeding a demo account beside an existing one is exactly what this script is
# for, so it could not do its own job twice.
#
# The window is 1e11 wide, so it is cut into blocks and each account is given
# one, chosen by hashing its name. blake2b rather than `hash()`, which is salted
# per process for strings and would move an account's block on every run.
#
# A block holds a million rows — a year of this week is about 3,900 — and there
# are a hundred thousand blocks. The last id in the last block is exactly
# SEED_ID_HIGH, so every id this writes is 13 digits and inside the window
# `OWNED` matches on.
SEED_BLOCK = 1_000_000
SEED_BLOCKS = 100_000


def id_base(user: str, seed: int) -> int:
    """Where this account's ids start. Stable for a name, distinct between them.

    `seed` is folded in so there is something to turn when two names land in the
    same block — a one in a hundred thousand accident, and the error it causes
    says to do this.
    """
    key = '{}\x00{}'.format(user, seed).encode()
    block = int(hashlib.blake2b(key, digest_size=8).hexdigest(), 16) % SEED_BLOCKS
    return int(SEED_ID_LOW) + block * SEED_BLOCK


# The WHERE clause matching rows this script owns.
OWNED = (
    "user_id = ? AND ("
    " (id >= ? AND id <= ? AND length(id) = 13)"
    " OR description = ?"
    ")"
)
OWNED_ARGS = lambda user: (user, SEED_ID_LOW, SEED_ID_HIGH, LEGACY_TAG)

# ---------------------------------------------------------------------------
# The week
# ---------------------------------------------------------------------------
# (start, end, title, subject, priority, xp, days)  — days as weekday numbers,
# Monday 0. Times are local and a block ends the same day it starts.
WEEKDAYS = (0, 1, 2, 3, 4)
WEEKEND = (5, 6)
ALL_DAYS = (0, 1, 2, 3, 4, 5, 6)

# The training pools.
#
# Rotated rather than sampled (see `pick`), so a week reads as a syllabus
# working through its topics rather than as a list being shuffled. Each pool is
# one recurring block's worth of subject matter for a couple of weeks.
MATH_TRAINING = [
    'Math — AIME set: algebra and number theory',
    'Math — geometry: power of a point, radical axes',
    'Math — combinatorics: bijections, counting two ways',
    'Math — number theory: orders and primitive roots',
    'Math — functional equations drill',
    'Math — inequalities: AM-GM, Cauchy, smoothing',
    'Math — timed AMC 12 set, 25 in 75',
    'Math — polynomials: Vieta and symmetric sums',
]
CS_TRAINING = [
    'USACO — graphs: shortest paths and DSU',
    'USACO — dynamic programming on trees',
    'USACO — greedy and exchange arguments',
    'USACO — segment trees and range queries',
    'USACO — binary search on the answer',
    'Codeforces — Div. 2 virtual, four problems',
    'USACO — flood fill and grid simulation',
    'USACO — strings: hashing and KMP',
]
PRACTICE = [
    'Violin — scales, thirds and octaves',
    'Violin — Kreutzer etude, slow bowing',
    'Violin — Bach partita, movement work',
    'Violin — orchestra parts for the winter set',
    'Violin — shifting and intonation drill',
    'Violin — vibrato and tone in the low register',
    'Violin — concerto exposition from memory',
    'Violin — sight-reading and rhythm',
]
SCHOOLWORK = [
    'Homework — AP Calculus BC problem set',
    'Homework — AP Physics C, rotation',
    'Homework — AP Chemistry, equilibrium',
    'Homework — English essay draft',
    'Homework — US History reading and notes',
    'Homework — Spanish composition',
    'Homework — physics lab write-up',
    'Homework — AP Statistics, inference',
]
READING = [
    'Read — the English set text',
    'Read — an olympiad write-up from AoPS',
    'Read — a competitive programming editorial',
    'Read — something that is not for school',
]

# Blocks that go on the calendar.
#
# The weekday afternoon slot deliberately alternates rather than stacking:
# orchestra owns Monday and Wednesday, programming training owns Tuesday and
# Thursday, and Friday's math team is a weekly beat that takes the same hour.
# Drawing them on top of each other is not a busy day on the week grid — it is
# two rectangles over the same hour.
#
# School is one block rather than seven. The account is a record of work this
# person chooses and is measured on; the timetable is the container it happens
# around, and splitting it into periods would bury every training block under a
# wall of lessons nobody is tracking.
BLOCKS = [
    # (start, end, title-or-pool, subject, priority, xp, days)
    ('05:50', '06:40', PRACTICE,          'music',            'high',    70, WEEKDAYS),
    ('06:45', '07:25', MATH_TRAINING,     'mathematics',      'high',    85, (0, 2, 4)),
    ('06:45', '07:25', 'Strength and conditioning', 'gym',    'medium',  45, (1, 3)),
    ('07:55', '15:10', 'School — periods 1 to 7',   'coursework', 'high', 120, WEEKDAYS),
    ('15:30', '16:30', 'Orchestra rehearsal',       'music',  'high',    70, (0, 2)),
    ('15:30', '16:45', CS_TRAINING,       'computer_science', 'high',   110, (1, 3)),
    ('17:00', '18:15', SCHOOLWORK,        'homework',         'high',    90, WEEKDAYS),
    ('18:20', '19:00', 'Dinner with the family',    'family', 'medium',  30, ALL_DAYS),
    ('19:10', '20:40', MATH_TRAINING,     'mathematics',      'high',   120, (0, 1, 2, 3)),
    ('20:50', '21:40', PRACTICE,          'music',            'medium',  60, (1, 3, 4)),
    ('21:45', '22:10', 'Log the day and set tomorrow', 'journaling', 'low', 25, WEEKDAYS),
    # Saturday — where the long timed work goes, because nothing else fits it.
    ('08:00', '09:00', 'Long run',                  'running', 'medium', 50, (5,)),
    ('09:30', '11:30', 'Violin lesson, then the notes from it', 'music', 'high', 120, (5,)),
    ('13:00', '15:00', 'USACO — full timed practice contest', 'computer_science', 'high', 150, (5,)),
    ('15:30', '17:00', MATH_TRAINING,     'mathematics',      'high',   110, (5,)),
    ('20:00', '21:30', 'Downtime — film or friends', 'film',  'low',     30, (5,)),
    # Sunday
    ('09:00', '10:30', PRACTICE,          'music',            'high',    95, (6,)),
    ('11:00', '12:30', 'Write up the week\'s solutions', 'writing', 'high', 90, (6,)),
    ('13:30', '15:00', 'Personal project — contest grader', 'programming', 'medium', 85, (6,)),
    ('16:00', '17:00', 'Week review — what actually moved', 'planning', 'high', 60, (6,)),
    ('19:00', '20:00', READING,           'reading',          'low',     35, (6,)),
]

# Weekly beats. Each one owns its slot — see the note on BLOCKS.
WEEKLY = [
    (0, '07:25', '07:50', 'Set the week — three targets',      'planning',    'high',  45),
    (4, '15:30', '17:00', 'Math team practice — relay round',  'study_group', 'high',  95),
    (4, '19:10', '21:10', 'Mock contest — timed, full length', 'exams',       'high', 140),
]

# Monthly beats. Placed in the evening slot the contest-maths block otherwise
# holds, so they replace it for that day rather than being drawn over it.
MONTHLY = [
    (3,  '19:10', '20:30', 'Review every problem missed this month', 'revision',    'high',   90),
    (11, '19:10', '20:30', 'Lesson checkpoint — repertoire and etudes', 'music',    'high',   85),
    (19, '19:10', '20:20', 'Update the AoPS notebook and tag the gaps', 'mathematics', 'medium', 65),
    (26, '20:00', '21:00', 'Activity log and college list upkeep',   'admin',       'medium', 50),
]

# Untimed to-dos — the Tasks page list, never on the grid.
TODOS = [
    ("Redo yesterday's missed problems",          'revision',         'high',   40),
    ('Update the solution log',                   'mathematics',      'medium', 35),
    ('Flashcards — Spanish vocabulary',           'flashcards',       'low',    20),
    ('Read 20 pages of the set text',             'literature',       'medium', 30),
    ('Fix the failing USACO test case',           'computer_science', 'high',   45),
    ('Practice the shifting passage slowly',      'music',            'medium', 30),
    ('Email the orchestra director about the audition', 'email',      'low',    15),
    ('Finish the physics lab data',               'physics',          'medium', 40),
    ('Memorise the polyatomic ions',              'chemistry',        'low',    25),
    ('Pack the violin and the contest kit',       'chores',           'low',    15),
    ('Lights out by half ten',                    'sleep',            'medium', 20),
    ('Ask about the calculus proof from class',   'tutoring',         'low',    20),
]

# The fixed points of the year: (month, day-of-month, title, subject, priority, xp, hours)
# `hours` is None for an untimed to-do, or (start, end) for a block.
#
# ## A real month, not an offset from the run date
#
# These used to be offsets from whatever month the seed started in, which is
# right for a persona whose year is "twelve months of work from here" and wrong
# for this one. A contest calendar is *seasonal*: the AMC is in November, the
# AIME is in February, the AP exams are in May, and none of them care when
# somebody ran a script. Seeding from August put the AMC in October and the
# AIME in January, which is a demo account that a competitor would read as
# nonsense before they read anything else on the page.
#
# So the month is the month. Each fixture is placed in every year the window
# covers, which is what makes a fourteen-month window correctly contain two
# Septembers and one November.
ONE_OFFS = [
    (9,  12, 'All-State orchestra audition — recording day', 'music',            'high', 180, ('09:00', '12:00')),
    (9,  26, 'Math team tryout',                             'mathematics',      'high', 140, ('15:30', '17:30')),
    (10, 10, 'USACO — October practice contest',             'computer_science', 'high', 160, ('09:00', '13:00')),
    (10, 24, 'Youth symphony — first concert of the season', 'music',            'high', 150, ('18:00', '21:00')),
    (11,  7, 'AMC 12 A',                                     'exams',            'high', 220, ('08:00', '11:00')),
    (11, 18, 'AMC 12 B',                                     'exams',            'high', 200, ('08:00', '11:00')),
    (12, 12, 'USACO December contest',                       'computer_science', 'high', 200, ('09:00', '13:00')),
    (12, 19, 'Winter concert — full orchestra',              'music',            'high', 160, ('18:30', '21:00')),
    (1,  16, 'USACO January contest',                        'computer_science', 'high', 200, ('09:00', '13:00')),
    (1,  30, 'Semester finals — the long study block',       'exams',            'high', 180, ('09:00', '13:00')),
    (2,   5, 'AIME I',                                       'exams',            'high', 260, ('13:00', '16:00')),
    (2,  20, 'USACO February contest',                       'computer_science', 'high', 200, ('09:00', '13:00')),
    (3,   6, 'Summer programme applications — essays',       'writing',          'high', 170, ('10:00', '13:00')),
    (3,  20, 'USACO US Open',                                'computer_science', 'high', 220, ('09:00', '14:00')),
    (4,  11, 'Spring recital — solo repertoire',             'music',            'high', 170, ('18:00', '20:00')),
    (4,  25, 'State math league finals',                     'mathematics',      'high', 190, ('08:30', '13:00')),
    (5,   8, 'AP Calculus BC exam',                          'exams',            'high', 200, ('08:00', '12:00')),
    (5,  13, 'AP Computer Science A exam',                   'exams',            'high', 190, ('12:00', '15:30')),
    (5,  19, 'AP Physics C exam',                            'exams',            'high', 190, ('08:00', '11:30')),
    (6,   6, 'ARML — team practice weekend',                 'mathematics',      'high', 200, ('09:00', '16:00')),
    (6,  20, 'Summer plan — reading list and packing',       'planning',         'medium', 80, None),
    (7,  13, 'Summer programme — qualifying quiz',           'mathematics',      'high', 180, ('09:00', '12:00')),
    (7,  27, 'Chamber music intensive — final showcase',     'music',            'high', 160, ('17:00', '20:00')),
    (8,  17, 'Back to school — timetable and supplies',      'planning',         'medium', 60, None),
]


def stamp(day: date, hhmm: str) -> str:
    return f'{day.isoformat()}T{hhmm}:00'


def pick(pool, turn):
    """A title from a rotating pool.

    Stepped by the day rather than drawn at random. `rng.choice` gave the same
    deep-work topic three days running often enough to notice, which reads less
    like a person's week than like a list being shuffled. Rotating cycles the
    pool so consecutive days differ and the whole pool is used.
    """
    return pool[turn % len(pool)] if isinstance(pool, list) else pool


def minutes(hhmm: str) -> int:
    h, m = hhmm.split(':')
    return int(h) * 60 + int(m)


def build(user: str, start: date, days: int, min_xp: int, seed: int):
    rng = random.Random(seed)
    rows = []
    base = id_base(user, seed)

    def add(day, title, subject, priority, xp, span=None):
        """One task. `span` is (start, end) for a block, None for a to-do."""
        idx = len(rows)
        if idx >= SEED_BLOCK:
            # A million rows is about 250 years of this week. Reaching it means
            # something is wrong with --days, not that the block is too small.
            raise SystemExit(
                'Refusing to write more than {:,} rows: an account\'s id block '
                'holds that many, and past it this would overwrite the next '
                'account\'s.'.format(SEED_BLOCK))
        if span:
            created, due = stamp(day, span[0]), stamp(day, span[1])
            on_cal = 1
        else:
            # A to-do is made the morning of the day it is due and carries no
            # time, which is what an untimed row looks like everywhere else.
            created, due = stamp(day, '08:00'), day.isoformat()
            on_cal = 0
        rows.append((
            str(base + idx), user, title, TAG, priority, 'todo', int(xp),
            subject, due, on_cal, created,
        ))
        return xp

    # One-offs resolved to real dates before the year is walked, because they
    # get first claim on their hours — see the note in the day loop.
    special: dict[date, list] = {}
    finish = start + timedelta(days=days)
    for month, dom, title, subject, priority, xp, span in ONE_OFFS:
        # Every year the window touches, so a fourteen-month run gets both of
        # its Septembers and only its one November. See the note on ONE_OFFS.
        for year in range(start.year, finish.year + 1):
            try:
                when = date(year, month, dom)
            except ValueError:
                continue
            if start <= when < finish:
                special.setdefault(when, []).append((title, subject, priority, xp, span))

    for offset in range(days):
        day = start + timedelta(days=offset)
        wd = day.weekday()
        earned = 0
        # The hours already spoken for on this day, and the to-do titles
        # already on it.
        booked: list[tuple[int, int]] = []
        taken: set[str] = set()

        def block(title, subject, priority, xp, span):
            """A timed block, if its hours are still free.

            **A day is a day, and two things cannot have the same hour.** The
            one-offs are placed first and the routine fills in around them,
            because that is the direction it goes in life: the morning you ship
            v2 to 10% of traffic is not also a morning of ordinary deep work,
            and the afternoon of the conference talk is not also the afternoon
            of the campaign block. Drawn the other way the week grid showed two
            rectangles over the same hour, which does not read as a busy day —
            it reads as a bug.
            """
            s0, e0 = minutes(span[0]), minutes(span[1])
            if any(s0 < b and e0 > a for a, b in booked):
                return 0
            booked.append((s0, e0))
            return add(day, title, subject, priority, xp, span)

        def todo(entry):
            title, subject, priority, xp = entry
            if title in taken:
                return 0
            taken.add(title)
            return add(day, title, subject, priority, xp)

        # The day's own event first, then the week's shape around it.
        for title, subject, priority, xp, span in special.get(day, []):
            earned += block(title, subject, priority, xp, span) if span else todo(
                (title, subject, priority, xp))

        for wday, s, e, title, subject, priority, xp in WEEKLY:
            if wd == wday:
                earned += block(title, subject, priority, xp, (s, e))

        for dom, s, e, title, subject, priority, xp in MONTHLY:
            if day.day == dom:
                earned += block(title, subject, priority, xp, (s, e))

        # Stepped by the day *and* by the row, not the day alone. Two blocks can
        # share a pool — the morning drill and the evening session both draw
        # from MATH_TRAINING, and morning and evening practice both draw from
        # PRACTICE — and keying the rotation on the day alone handed both of
        # them the same title, so a Wednesday read "timed AMC 12 set" at a
        # quarter to seven and again at ten past seven. Adding the row's index
        # walks the two through the pool a fixed distance apart.
        for index, (s, e, pool, subject, priority, xp, when) in enumerate(BLOCKS):
            if wd in when:
                earned += block(pick(pool, offset + index), subject, priority, xp, (s, e))

        # Two or three to-dos, varying by day so the list is not a stencil.
        for entry in rng.sample(TODOS, rng.randint(2, 3)):
            earned += todo(entry)

        # The floor, drawn from the same pool of real work rather than a filler
        # row with a number on it. Ordered by XP so a day that is barely short
        # gets one small thing rather than four.
        for entry in sorted(TODOS, key=lambda t: t[3]):
            if earned >= min_xp:
                break
            earned += todo(entry)

        # If the whole pool ran out and the day is still short, one honest
        # catch-all rather than silently missing the floor.
        if earned < min_xp:
            earned += block('Focus block — clear the backlog', 'work', 'medium',
                            min_xp - earned, ('12:15', '13:00'))
            if earned < min_xp:
                add(day, 'Focus block — clear the backlog', 'work', 'medium',
                    min_xp - earned)

    return rows


# ---------------------------------------------------------------------------
# Finishing the part of the window that is already in the past
# ---------------------------------------------------------------------------
#: How many of the finished tasks carry a rating.
#:
#: About half, because about half is what actually happens: the prompt after a
#: completed task can be skipped and often is, and `backend/tracking/analytics.py`
#: is explicit that an account which never answers it must not be graded zero for
#: quality. A seed that rated everything would produce an account no real one
#: resembles, and would hide that fallback from anybody looking at the page.
RATED_SHARE = 0.55

#: How often a deadline is missed. Not zero — a record with a hundred per cent
#: on-time rate grades a perfect efficiency score and tells nobody anything.
MISSED_SHARE = 0.14


def complete_through(con, user: str, through: date, seed: int) -> int:
    """Finish every seeded task dated on or before `through`.

    ## Why this exists

    Re-running this script deletes the rows the previous run wrote — including
    the ones that had since been marked done. On an account whose whole point
    is a continuous record that leaves a hole: the last few weeks lose their
    finished tasks, and the analytics page reads that as a collapse rather than
    as a re-seed. So the window that is already in the past gets finished on the
    way in, and the record stays continuous across the swap.

    ## It deliberately writes no XP events

    The XP ledger is a separate, append-only store, and the events for the days
    this covers are **already there** — they were written when the previous
    run's tasks were completed, and deleting those tasks did not un-earn them
    (which is the ledger's whole design; see the note on two sources in
    frontend/src/utils/growthYears.ts). Writing a second set would double every
    one of those days.

    So the split is: the ledger keeps its history, and these rows supply the
    two things only a task can — a rating, and whether it met its deadline —
    which are what the quality and efficiency scores are computed from.
    """
    rng = random.Random(seed ^ 0x5EED)
    rows = con.execute(
        f'SELECT id, due_date, created_at FROM tasks WHERE {OWNED}', OWNED_ARGS(user)
    ).fetchall()

    updates = []
    for task_id, due, created in rows:
        day = (due or '')[:10]
        if not day or date.fromisoformat(day) > through:
            continue

        # A block finished when it ended; an untimed to-do got ticked off in the
        # evening, which is when the rest of this person's list gets cleared.
        finished = due if 'T' in (due or '') else f'{day}T20:30:00'

        elapsed = None
        if created and 'T' in created and 'T' in finished:
            started = datetime.fromisoformat(created)
            elapsed = max(60, int((datetime.fromisoformat(finished) - started).total_seconds()))

        met = 0 if rng.random() < MISSED_SHARE else 1

        if rng.random() < RATED_SHARE:
            # Weighted toward the middle and up. A record where everything is a
            # 5 is not a record of anything, and one where everything is a 3 is
            # a slider nobody moved.
            difficulty = rng.choices([2, 3, 4, 5], weights=[1, 3, 4, 2])[0]
            execution = rng.choices([2, 3, 4, 5], weights=[1, 3, 4, 2])[0]
        else:
            difficulty = execution = None

        updates.append((finished, elapsed, met, difficulty, execution, task_id))

    con.executemany(
        'UPDATE tasks SET status = ?, completed_at = ?, completion_seconds = ?,'
        ' met_deadline = ?, difficulty = ?, execution = ? WHERE id = ?',
        [('done',) + row for row in updates],
    )
    return len(updates)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--user', default='Alpha')
    ap.add_argument('--days', type=int, default=365)
    ap.add_argument('--min-xp', type=int, default=500)
    ap.add_argument('--seed', type=int, default=20260818)
    ap.add_argument('--from', dest='start', default=None, help='YYYY-MM-DD, default today')
    ap.add_argument('--clear', action='store_true', help='remove seeded rows and stop')
    ap.add_argument('--complete-through', dest='through', default=None,
                    help='YYYY-MM-DD: finish the seeded tasks dated on or before this')
    args = ap.parse_args()

    start = date.fromisoformat(args.start) if args.start else date.today()
    con = sqlite3.connect(DB)
    try:
        gone = con.execute(
            f'DELETE FROM tasks WHERE {OWNED}', OWNED_ARGS(args.user)
        ).rowcount
        if args.clear:
            con.commit()
            print(f'removed {gone} seeded rows for {args.user}')
            return

        rows = build(args.user, start, args.days, args.min_xp, args.seed)
        try:
            con.executemany(
                'INSERT INTO tasks (id, user_id, title, description, priority, status,'
                ' xp_value, subject, due_date, show_on_calendar, created_at)'
                ' VALUES (?,?,?,?,?,?,?,?,?,?,?)', rows)
        except sqlite3.IntegrityError as exc:
            # Two names hashed into one block — see `id_base`. One in a hundred
            # thousand, and the way out is a different --seed, so say so rather
            # than leaving a UNIQUE constraint message to be worked out.
            con.rollback()
            raise SystemExit(
                '{}\n\n{} collides with ids already in the database. Its block is '
                'chosen from --seed, so run this again with a different one:\n'
                '    python3 scripts/seed_year.py --user {} --seed {}'.format(
                    exc, args.user, args.user, args.seed + 1))
        con.commit()

        finished = 0
        if args.through:
            finished = complete_through(
                con, args.user, date.fromisoformat(args.through), args.seed)
            con.commit()

        blocks = sum(1 for r in rows if r[9] == 1)
        print(f'{args.user}: replaced {gone} seeded rows with {len(rows)}')
        if finished:
            print(f'  {finished} of them marked done, up to {args.through}')
        print(f'  {blocks} calendar blocks, {len(rows) - blocks} untimed to-dos')
        print(f'  {start} to {start + timedelta(days=args.days - 1)}')
    finally:
        con.close()


if __name__ == '__main__':
    sys.exit(main())

"""Alpha's real timetable, a year of it ahead and six years of record behind.

    python3 scripts/seed_alpha.py            # write it
    python3 scripts/seed_alpha.py --clear    # take it all back out

## What this is, next to seed_year.py

seed_year writes *a* year — an invented week for an invented student, to see
what the app's views do against a life rather than against ten rows. This
writes *this* week: the actual timetable Alpha keeps, forward a year as a
calendar, and six years behind as finished work with the analytics that come
off it.

The two do not overlap. seed_year owns ids 1.00e12-1.099e12; this owns
1.10e12-1.199e12, and both stay 13 digits and below the millisecond timestamps
real ids are made of, so neither can collide with the other or with anything
the app writes. `--clear` here removes only what this wrote.

## The three things it writes

**The year ahead** (`WEEK`) is the timetable as calendar blocks: the lectures
and sections of the two majors, the research the doctorate is made of, and —
just as timetabled — the violin, the training, the meals with other people and
the two mornings that start in cold water. They are `todo` and they earn
nothing yet, which is the point of a calendar: they are what is going to
happen, and the XP on them is what finishing one will be worth.

**The years behind** are not the same week six times. They are six eras — see
`ERAS` — and a day takes its timetable from the one it fell in: school, the
contest years, the last year of school, the freshman year, the year the
research started, and the thesis year the account is in now. Every block is
finished, plus the study that fills an evening, each carrying a subject, a
difficulty and an execution rating so the quality grid and the subject split
have something real underneath them. The focus timer and the report card are
written to match, day by day.

One year repeated six times would have had no progress in it, only volume —
and the Records page asks "look how far have I come", which that answers with
"nowhere, very busily". So the day gets longer, the goal it is measured against
rises with it, the ratings drift up about a point, lateness falls from 18% to
8%, and a day missed goes from one in fourteen to one in two hundred and fifty.

**The hall of fame.** Records and milestones across the six years — the AMC 8
climbing, a mile coming down, a Kaggle placing coming down from four thousandth
— and three that are read back off the rows rather than typed, because the
longest streak, the best day and the longest sitting are facts about the record
and a seed that invents them writes a page its own Growth tab contradicts.

**The preferences.** Alpha plans its week in this app, so it is set up like
somebody who does: the ratings as deep as they go, the analytics as hard as
they go, and the window set to all of it. See `SETTINGS`.

**The level.** `top_up` exists for when the record is thinner than the account
is meant to read as: the shortfall is spread back across days that already have
work on them, so no day appears that the account did not turn up for. Six years
of this timetable clears level 100 on its own and it adds nothing — it is kept
for the shallower runs `--years` allows. The ledger stays the authority:
`users.xp` is recomputed from it at the end, never set beside it.

## Who Alpha is

A machine-learning and mathematics double major on a PhD track at a college
that is hard to get into, in the year the thesis starts — and, six years back,
a fifteen-year-old doing AMC 10 practice after school and learning Python on a
Friday. The habits are the throughline: the same sitting before it is light,
the same violin, the same evening review, at fifteen and at twenty-one. That is a specific
person and it has to be, because a seed is an argument about what this app is
for: every panel in it is drawn from somebody's record, and a record with only
work in it produces a set of pages that can say nothing except that its owner
worked.

So the week is rigorous *and* it is coloured. Math 55, analysis and algebra on
one side; machine learning, algorithms and statistical learning on the other;
a lab meeting, an advisor, a reading group and a thesis block for the part
that is not coursework. And then the violin on Wednesday and the orchestra on
Monday, lifting three mornings and running two, lunch with the lab, dinner out
on Friday, a long run with friends on Saturday, and the ice baths and the
sitting still that are what make the rest of it survivable.

The second half is not decoration. The Habits tab looks for recurring
behaviour, the Insights tab looks for what conditions the better work shows up
under, and both of them need something to find that is not another problem
set — `NOT_STUDY` below is where that distinction is actually drawn.
"""
from __future__ import annotations

import argparse
import os
import random
import sqlite3
import sys
from datetime import date, datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.config.settings import DB_PATH                    # noqa: E402
from backend.config.subjects import BY_ID                      # noqa: E402
from backend.tracking.analytics import grade_for_score         # noqa: E402
from backend.tracking.xp import level_for_total_xp             # noqa: E402

DB = DB_PATH

# --------------------------------------------------------------------------
# The window this script owns
# --------------------------------------------------------------------------
# Same reasoning as seed_year.py's, one block up: real ids are millisecond
# timestamps (1.79e12 and climbing) and will never come back down, so a 13-digit
# range below them is reserved by construction. seed_year has 1.0e12; this has
# 1.1e12, and the two cannot meet.
ID_LOW = 1_100_000_000_000
ID_HIGH = 1_199_999_999_999
TASK_BASE = 1_100_000_000_000     # tasks:     1.100e12 - 1.119e12
EVENT_BASE = 1_120_000_000_000    # xp_events: 1.120e12 - 1.139e12
RECORD_BASE = 1_140_000_000_000   # records:   1.140e12 - 1.159e12

OWNED = 'user_id = ? AND id >= ? AND id <= ? AND length(id) = 13'


def owned_args(user):
    return (user, str(ID_LOW), str(ID_HIGH))


# --------------------------------------------------------------------------
# The week
# --------------------------------------------------------------------------
# (weekday, title, subject, start, end, xp, study)
#
# `study` is whether the block is deliberate work or merely attendance, and
# it is what `focus_sessions` counts on. It used to be read off the subject —
# a block filed under `lectures` was a lesson and did not count — but the
# lectures here are filed under what they are *about*, because that is what
# joins them to a skill tree. Two questions were riding on one field, and
# they have different answers: a machine-learning lecture is machine
# learning, and sitting in it is still not an hour of focus.
#
# Monday is 0. Alpha is a computer-science undergraduate: the degree is the
# software, the machine learning and the web work, the mathematics is Math 55
# and Putnam training rather than coursework, and the violin is the thing that
# is not any of that. XP is scaled to what the block costs to actually do — an
# hour of lectures is not an hour of a problem set — and the numbers are
# deliberately round, because they are a currency and a reader who finishes a
# lecture and sees 40 should not have to wonder why not 38.
#
# Subjects are catalogue ids from backend/config/subjects.py, and they are the
# join to the skill trees: `machine_learning`, `web_design`, `programming`,
# `computer_science` and `mathematics` each open a different lattice, which is
# what makes this timetable readable on the skill-tree page as well as on the
# calendar.
#: Roughly what a day on this week is worth, and therefore the account's goal.
#:
#: One name for a number that was written twice — once as the target stored on
#: the account and once as the divisor the report card scores productivity
#: against — which is two places for the same fact and one of them free to
#: drift.
#:
#: It is 450 rather than the 300 it was, and that is a fix rather than a
#: preference. The timetable plus an evening comes to something like 470 XP on
#: a working day, so against 300 the productivity score was `min(100, 157)` on
#: every single week of the year: a metric that cannot move is a flat line on a
#: chart and a grade that means nothing. At 450 a good week and a thin one are
#: different numbers, which is the whole reason the chart is drawn.
DAILY_GOAL = 450

#: The week, as (weekday, title, subject, start, end, xp, is_deliberate_study).
#:
#: Monday is 0. The last field is what tells attendance from work — see
#: `ATTENDANCE` below — and it is a flag rather than an inference from the
#: subject, because a machine-learning lecture *is* machine learning and
#: sitting in one is still not an hour of focus.
#:
#: Read down a day and it should look like a day somebody actually has: a sit
#: and a session before it is light, lectures through the middle, the research
#: and the seminars in the afternoon, and the evening spoken for by a person
#: rather than by the degree. That last part is the half that was missing. A
#: week of nothing but lectures and problem sets is not what a rigorous year
#: looks like, it is what one looks like from the outside — and an account
#: seeded that way has nothing to say on the Habits tab except that its owner
#: works, which is the one thing the tab could already see.
WEEK = (
    # ---- Mathematics, the first of the two majors -------------------------
    # Math 55 three mornings a week is the spine of the degree; analysis and
    # algebra are the other two lectures the major actually costs.
    (0, 'Math 55 lecture', 'mathematics', '09:00', '10:30', 45, False),
    (2, 'Math 55 lecture', 'mathematics', '09:00', '10:30', 45, False),
    (4, 'Math 55 lecture', 'mathematics', '09:00', '10:30', 45, False),
    (1, 'Real analysis lecture', 'mathematics', '09:00', '10:15', 45, False),
    (3, 'Abstract algebra lecture', 'algebra', '09:00', '10:15', 45, False),
    (1, 'Math 55 section', 'mathematics', '16:00', '17:00', 35, True),

    # Monday hands the Putnam problems out and Thursday takes the week's
    # attempt apart. Two halves of one thing, three days apart on purpose.
    (0, 'Putnam seminar', 'mathematics', '17:30', '19:00', 55, True),
    (3, 'Putnam problem session', 'mathematics', '19:00', '20:30', 55, True),

    # ---- Machine learning, the second ------------------------------------
    (0, 'Machine Learning lecture', 'machine_learning', '11:00', '12:30', 45, False),
    (2, 'Machine Learning lecture', 'machine_learning', '11:00', '12:30', 45, False),
    (1, 'Algorithms lecture', 'computer_science', '10:30', '12:00', 45, False),
    (3, 'Algorithms lecture', 'computer_science', '10:30', '12:00', 45, False),
    (4, 'Statistical learning lecture', 'statistics', '11:00', '12:15', 45, False),
    (3, 'ML lab', 'machine_learning', '15:00', '17:00', 60, True),

    # ---- The doctorate this is all pointed at -----------------------------
    # The part that is not coursework, and the part an undergraduate on a PhD
    # track spends their credibility on: a group to sit in, an advisor to
    # answer to, a literature to keep up with, and a thesis that is written in
    # blocks or not at all.
    (1, 'Lab meeting', 'research', '14:00', '15:00', 30, False),
    (2, 'Paper reading group', 'research', '15:00', '16:00', 45, True),
    (4, 'Advisor meeting', 'research', '13:00', '13:45', 30, False),
    (4, 'Thesis writing block', 'thesis', '14:00', '16:00', 65, True),

    # ---- The violin, which is not the degree and not negotiable -----------
    (2, 'Violin lesson', 'music', '18:00', '19:00', 40, True),
    (0, 'Orchestra rehearsal', 'music', '19:30', '21:00', 40, True),

    # ---- Training ---------------------------------------------------------
    *[(d, 'Lift', 'gym', '07:30', '08:30', 25, False) for d in (0, 2, 4)],
    *[(d, 'Morning run', 'running', '07:30', '08:15', 20, False) for d in (1, 3)],

    # ---- The head, either end of the day ----------------------------------
    *[(d, 'Morning meditation', 'meditation', '06:45', '07:10', 12, False)
      for d in range(5)],
    *[(d, 'Evening review', 'planning', '22:00', '22:20', 10, False)
      for d in range(5)],

    # ---- People ------------------------------------------------------------
    # Two standing appointments with other human beings, on the calendar for
    # the same reason the lectures are: what is not timetabled does not happen
    # in a week this full.
    (1, 'Lunch with the lab', 'friends', '12:15', '13:00', 12, False),
    (4, 'Dinner out with friends', 'friends', '19:30', '21:30', 20, False),

    # ---- The weekend -------------------------------------------------------
    # It used to be empty, which said that Saturday and Sunday were whatever
    # was left over. They are the recovery this week is affordable *because*
    # of, so they are timetabled like everything else.
    (5, 'Long run with friends', 'running', '08:30', '10:00', 30, False),
    (5, 'Ice bath', 'health', '10:30', '10:50', 15, False),
    (5, 'Brunch out', 'friends', '11:30', '13:00', 15, False),
    (6, 'Long meditation sit', 'meditation', '08:30', '09:15', 20, False),
    (6, 'Ice bath', 'health', '09:30', '09:50', 15, False),
    (6, 'Sunday reset', 'planning', '18:00', '18:45', 20, False),
)

#: The day's subject, written onto the calendar as its Focus note.
#:
#: Tied to what the day actually holds rather than rotated for variety: Monday
#: and Thursday are the Putnam seminar and its problem session, Wednesday is
#: the reading group and the violin, Friday is the thesis. The weekend names
#: what the weekend is for, which on this timetable is people and recovery
#: rather than a sixth and seventh working day.
FOCUS_DAYS = {
    0: ('Putnam',),
    1: ('Algorithms', 'Analysis'),
    2: ('Machine learning',),
    3: ('Putnam', 'ML lab'),
    4: ('Thesis',),
    5: ('Friends and training', 'Deep work'),
    6: ('Rest and reset', 'Reading'),
}

# --------------------------------------------------------------------------
# The study that fills the year behind
# --------------------------------------------------------------------------
# (title, subject, minutes, xp). Drawn from to top a finished day up to
# something like a real one — the timetable alone is a little over 200 XP on an
# average weekday, and somebody taking this year seriously is closer to 470.
#
# Weighted toward the four things the evenings actually go on — the problem
# sets, the research, the model that is training, and the violin — and then
# deliberately not only those. Three of the eighteen are other people and two
# are recovery, which is roughly the true ratio for somebody who is doing this
# well rather than doing it until they stop.
EVENING = (
    ('Math 55 problem set', 'mathematics', 120, 110),
    ('Analysis problem set', 'mathematics', 90, 90),
    ('Putnam problems', 'mathematics', 90, 90),
    ('Algorithms problem set', 'computer_science', 90, 85),
    ('Thesis experiments', 'thesis', 90, 90),
    ('Paper replication', 'research', 75, 75),
    ('ML paper reading', 'machine_learning', 60, 60),
    ('Training run + writeup', 'machine_learning', 75, 70),
    ('Model debugging', 'machine_learning', 60, 55),
    ('LeetCode session', 'programming', 60, 55),
    ('Kaggle notebook', 'data_science', 90, 80),
    ('Violin practice', 'music', 45, 40),
    ('Climbing with friends', 'friends', 90, 30),
    ('Board game night', 'friends', 90, 25),
    ('Cooking with housemates', 'cooking', 60, 20),
    ('Evening walk', 'health', 30, 15),
    ('Journalling', 'journaling', 20, 15),
    ('Flashcards', 'flashcards', 20, 20),
)

# The weekend pool. Longer sessions, because two unbroken days is what a Putnam
# mock and a training run need — and a larger share of it is not work at all,
# which is the difference between a weekend and a Wednesday.
WEEKEND = (
    ('Putnam mock', 'mathematics', 240, 180),
    ('Analysis proof grinding', 'mathematics', 150, 130),
    ('Thesis writing', 'thesis', 180, 150),
    ('Research reading', 'research', 120, 100),
    ('ML project training', 'machine_learning', 150, 130),
    ('Open source contribution', 'programming', 120, 110),
    ('Long violin practice', 'music', 90, 70),
    ('Reading', 'reading', 60, 40),
    ('Long lift session', 'gym', 75, 45),
    ('Ice bath and sauna', 'health', 40, 20),
    ('Long meditation', 'meditation', 60, 30),
    ('Hike with friends', 'friends', 180, 45),
    ('Brunch with friends', 'friends', 90, 25),
    ('Cooking a proper meal', 'cooking', 75, 25),
    ('Chores', 'chores', 45, 25),
    ('Laundry and reset', 'laundry', 45, 20),
)


# --------------------------------------------------------------------------
# Six years, and the six different people who lived them
# --------------------------------------------------------------------------
# The record used to be one year: `WEEK` above, repeated 365 times. That is
# enough to draw every panel in the app and it is not enough to be *about*
# anything — an account whose Tuesday six years ago is identical to its Tuesday
# last week has no progress in it, only volume. The Records page asks "look how
# far have I come" and would have had one answer: nowhere, very busily.
#
# So the years behind are six eras, and a day picks the era it fell in. The
# same person throughout — the meditation, the lifting, the violin and the
# evening review run the whole length, because those are the habits the rest is
# affordable *because* of, and somebody who drops them in year two does not get
# to year six. What changes is what the work is:
#
#     school          AMC 10, school classes, learning to program at all
#     contest         AIME, USACO, the first machine learning that is not a toy
#     final-year      olympiad, a research internship, applications
#     freshman        Math 55, the first Putnam, a degree that is now the job
#     research        a lab, an advisor, papers, the second Putnam
#     thesis          `WEEK` above — the year this account is in now
#
# Each era carries its own daily goal, because a goal is what productivity is
# scored against and a sixteen-year-old measured against a doctoral student's
# day is a flat zero for two years. The account's *stored* goal is the current
# era's; the report cards behind are scored against the goal of the week they
# describe, which is what makes the Growth tab a climb rather than a ramp
# somebody drew.

#: The half of the week that is not the degree, and does not change.
#:
#: Written once and given to every era. This is the argument the seed is making
#: about what six years of this actually takes: the person who got to a thesis
#: is the person who was already sitting still before it was light at fifteen,
#: and the violin is the thing that was never negotiable in either year.
LIFE = (
    *[(d, 'Morning meditation', 'meditation', '06:45', '07:10', 12, False)
      for d in range(5)],
    *[(d, 'Evening review', 'planning', '22:00', '22:20', 10, False)
      for d in range(5)],
    *[(d, 'Lift', 'gym', '07:30', '08:30', 25, False) for d in (0, 2, 4)],
    *[(d, 'Morning run', 'running', '07:30', '08:15', 20, False) for d in (1, 3)],
    (2, 'Violin lesson', 'music', '18:00', '19:00', 40, True),
    (5, 'Long run with friends', 'running', '08:30', '10:00', 30, False),
    (5, 'Ice bath', 'health', '10:30', '10:50', 15, False),
    (6, 'Long meditation sit', 'meditation', '08:30', '09:15', 20, False),
    (6, 'Ice bath', 'health', '09:30', '09:50', 15, False),
    (6, 'Sunday reset', 'planning', '18:00', '18:45', 20, False),
)

#: Year one: fifteen, at school, and only just serious.
SCHOOL_WEEK = (
    *LIFE,
    *[(d, 'School day', 'lectures', '08:40', '15:20', 55, False) for d in range(5)],
    (0, 'AMC 10 practice set', 'mathematics', '16:30', '17:45', 45, True),
    (3, 'AMC 10 practice set', 'mathematics', '16:30', '17:45', 45, True),
    (1, 'Maths club', 'mathematics', '16:00', '17:00', 30, True),
    (4, 'Learning Python', 'programming', '16:30', '17:30', 35, True),
    (2, 'Orchestra rehearsal', 'music', '19:30', '21:00', 40, True),
    (5, 'Weekend problem set', 'mathematics', '10:30', '12:00', 50, True),
)
SCHOOL_EVENING = (
    ('Homework', 'lectures', 90, 55),
    ('AMC practice problems', 'mathematics', 60, 55),
    ('Geometry practice', 'geometry', 45, 40),
    ('Algebra drills', 'algebra', 45, 40),
    ('Python exercises', 'programming', 45, 40),
    ('Violin practice', 'music', 45, 40),
    ('Reading', 'reading', 45, 25),
    ('Flashcards', 'flashcards', 20, 20),
    ('Cooking with family', 'cooking', 45, 15),
    ('Football with friends', 'friends', 90, 25),
    ('Journalling', 'journaling', 15, 12),
)

#: Year two: the AIME, the first real algorithms, the first model.
CONTEST_WEEK = (
    *LIFE,
    *[(d, 'School day', 'lectures', '08:40', '15:20', 55, False) for d in range(5)],
    (0, 'AIME problem set', 'mathematics', '16:30', '18:15', 60, True),
    (3, 'AIME problem set', 'mathematics', '16:30', '18:15', 60, True),
    (1, 'USACO training', 'computer_science', '16:30', '18:00', 55, True),
    (4, 'USACO training', 'computer_science', '16:30', '18:00', 55, True),
    (2, 'Orchestra rehearsal', 'music', '19:30', '21:00', 40, True),
    (5, 'AIME mock', 'mathematics', '09:30', '12:30', 90, True),
    (6, 'ML course lecture', 'machine_learning', '14:00', '15:30', 50, True),
)
CONTEST_EVENING = (
    ('Homework', 'lectures', 75, 50),
    ('AIME practice problems', 'mathematics', 90, 80),
    ('Number theory practice', 'number_theory', 60, 60),
    ('Combinatorics practice', 'mathematics', 60, 60),
    ('Competitive programming', 'computer_science', 75, 70),
    ('ML course exercises', 'machine_learning', 60, 55),
    ('First Kaggle attempt', 'data_science', 75, 60),
    ('Violin practice', 'music', 45, 40),
    ('Climbing with friends', 'friends', 90, 30),
    ('Reading', 'reading', 45, 25),
    ('Journalling', 'journaling', 15, 12),
    ('Flashcards', 'flashcards', 20, 20),
)

#: Year three: the last year of school, and the first year of the rest of it.
FINAL_WEEK = (
    *LIFE,
    *[(d, 'School day', 'lectures', '08:40', '15:20', 55, False) for d in range(5)],
    (0, 'Olympiad problem set', 'mathematics', '16:30', '18:30', 70, True),
    (3, 'Olympiad problem set', 'mathematics', '16:30', '18:30', 70, True),
    (1, 'USACO Gold training', 'computer_science', '16:30', '18:00', 60, True),
    (2, 'Research internship', 'research', '16:00', '18:00', 65, True),
    (4, 'Research internship', 'research', '16:00', '18:00', 65, True),
    (2, 'Orchestra rehearsal', 'music', '19:30', '21:00', 40, True),
    (4, 'Applications block', 'planning', '19:00', '20:00', 30, True),
    (5, 'Olympiad mock', 'mathematics', '09:30', '13:00', 100, True),
)
FINAL_EVENING = (
    ('Olympiad problems', 'mathematics', 120, 100),
    ('Proof writing', 'mathematics', 75, 75),
    ('Functional equations', 'algebra', 60, 60),
    ('Competitive programming', 'computer_science', 75, 70),
    ('Internship code', 'research', 90, 80),
    ('Paper reading (slowly)', 'research', 60, 55),
    ('ML side project', 'machine_learning', 90, 75),
    ('Essay drafting', 'writing', 60, 45),
    ('Violin practice', 'music', 45, 40),
    ('Dinner with friends', 'friends', 90, 25),
    ('Flashcards', 'flashcards', 20, 20),
    ('Journalling', 'journaling', 15, 12),
)

#: Year four: the degree starts, and so does the Putnam.
FRESHMAN_WEEK = (
    *LIFE,
    (0, 'Math 55 lecture', 'mathematics', '09:00', '10:30', 45, False),
    (2, 'Math 55 lecture', 'mathematics', '09:00', '10:30', 45, False),
    (4, 'Math 55 lecture', 'mathematics', '09:00', '10:30', 45, False),
    (1, 'Linear algebra lecture', 'algebra', '09:00', '10:15', 45, False),
    (3, 'Discrete maths lecture', 'mathematics', '09:00', '10:15', 45, False),
    (1, 'Intro CS lecture', 'computer_science', '10:30', '12:00', 45, False),
    (3, 'Intro CS lecture', 'computer_science', '10:30', '12:00', 45, False),
    (0, 'Math 55 section', 'mathematics', '16:00', '17:00', 35, True),
    (0, 'Putnam seminar', 'mathematics', '17:30', '19:00', 55, True),
    (3, 'Putnam problem session', 'mathematics', '19:00', '20:30', 55, True),
    (2, 'CS lab', 'computer_science', '15:00', '17:00', 55, True),
    (0, 'Orchestra rehearsal', 'music', '19:30', '21:00', 40, True),
    (1, 'Lunch with friends', 'friends', '12:15', '13:00', 12, False),
    (4, 'Dinner out with friends', 'friends', '19:30', '21:30', 20, False),
    (5, 'Brunch out', 'friends', '11:30', '13:00', 15, False),
)
FRESHMAN_EVENING = (
    ('Math 55 problem set', 'mathematics', 120, 110),
    ('Linear algebra problem set', 'algebra', 90, 85),
    ('Putnam problems', 'mathematics', 90, 90),
    ('CS assignment', 'computer_science', 90, 85),
    ('Proof grinding', 'mathematics', 75, 75),
    ('ML self-study', 'machine_learning', 75, 70),
    ('LeetCode session', 'programming', 60, 55),
    ('Violin practice', 'music', 45, 40),
    ('Climbing with friends', 'friends', 90, 30),
    ('Cooking with housemates', 'cooking', 60, 20),
    ('Board game night', 'friends', 90, 25),
    ('Journalling', 'journaling', 20, 15),
    ('Flashcards', 'flashcards', 20, 20),
    ('Evening walk', 'health', 30, 15),
)

#: Year five: a lab, an advisor, and the year it stopped being coursework.
RESEARCH_WEEK = (
    *LIFE,
    (0, 'Real analysis lecture', 'mathematics', '09:00', '10:30', 45, False),
    (2, 'Real analysis lecture', 'mathematics', '09:00', '10:30', 45, False),
    (1, 'Abstract algebra lecture', 'algebra', '09:00', '10:15', 45, False),
    (3, 'Abstract algebra lecture', 'algebra', '09:00', '10:15', 45, False),
    (0, 'Machine Learning lecture', 'machine_learning', '11:00', '12:30', 45, False),
    (2, 'Machine Learning lecture', 'machine_learning', '11:00', '12:30', 45, False),
    (4, 'Statistical learning lecture', 'statistics', '11:00', '12:15', 45, False),
    (1, 'Lab meeting', 'research', '14:00', '15:00', 30, False),
    (2, 'Paper reading group', 'research', '15:00', '16:00', 45, True),
    (3, 'ML lab', 'machine_learning', '15:00', '17:00', 60, True),
    (4, 'Advisor meeting', 'research', '13:00', '13:45', 30, False),
    (0, 'Putnam seminar', 'mathematics', '17:30', '19:00', 55, True),
    (3, 'Putnam problem session', 'mathematics', '19:00', '20:30', 55, True),
    (0, 'Orchestra rehearsal', 'music', '19:30', '21:00', 40, True),
    (1, 'Lunch with the lab', 'friends', '12:15', '13:00', 12, False),
    (4, 'Dinner out with friends', 'friends', '19:30', '21:30', 20, False),
    (5, 'Brunch out', 'friends', '11:30', '13:00', 15, False),
)
RESEARCH_EVENING = (
    ('Analysis problem set', 'mathematics', 90, 90),
    ('Algebra problem set', 'algebra', 90, 90),
    ('Putnam problems', 'mathematics', 90, 90),
    ('Paper replication', 'research', 90, 85),
    ('ML paper reading', 'machine_learning', 60, 60),
    ('Model debugging', 'machine_learning', 75, 65),
    ('Training run + writeup', 'machine_learning', 75, 70),
    ('Kaggle notebook', 'data_science', 90, 80),
    ('LeetCode session', 'programming', 60, 55),
    ('Violin practice', 'music', 45, 40),
    ('Climbing with friends', 'friends', 90, 30),
    ('Cooking with housemates', 'cooking', 60, 20),
    ('Journalling', 'journaling', 20, 15),
    ('Evening walk', 'health', 30, 15),
)


class Era:
    """One stretch of the six years, and what a week in it looked like.

    `weight` is how much of the window the era gets, oldest first. They are
    equal here — six years, six eras — and it is a weight rather than a count of
    days so the same six read correctly whether the script is asked for six
    years or for two.
    """

    __slots__ = ('name', 'weight', 'week', 'evening', 'weekend', 'goal',
                 'focus_goal', 'rest', 'away', 'load')

    def __init__(self, name, weight, week, evening, weekend, goal,
                 focus_goal, rest=0.16, away=0.04, load=(3, 5)):
        self.name = name
        self.weight = weight
        self.week = week
        self.evening = evening
        self.weekend = weekend
        self.goal = goal
        self.focus_goal = focus_goal
        #: A day that keeps the habits and drops the work, and a day genuinely
        #: away. Both loosen going back: a fifteen-year-old has school holidays
        #: and a doctoral student in a thesis year does not.
        self.rest = rest
        self.away = away
        #: How many things off the evening pool a day picks up, low to high.
        #:
        #: This was a flat three-to-five for every day of the record, which is
        #: what made a fifteen-year-old's average focus day *longer* than a
        #: doctoral student's: school until half three, then three hours of
        #: chosen evening study on top, every night, at fifteen. The hours are
        #: supposed to climb across the six years, and a pool that is sampled
        #: the same way throughout is the one thing that guarantees they will
        #: not.
        self.load = load


SCHOOL_WEEKEND = (
    ('AMC practice set', 'mathematics', 120, 100),
    ('Maths reading', 'mathematics', 90, 70),
    ('Python project', 'programming', 120, 90),
    ('Long violin practice', 'music', 90, 70),
    ('Reading', 'reading', 90, 45),
    ('Out with friends', 'friends', 180, 40),
    ('Family lunch', 'friends', 90, 20),
    ('Chores', 'chores', 45, 25),
    ('Long meditation', 'meditation', 45, 25),
    ('Laundry and reset', 'laundry', 45, 20),
)

CONTEST_WEEKEND = (
    ('AIME mock', 'mathematics', 180, 150),
    ('Olympiad problems', 'mathematics', 150, 120),
    ('Competitive programming contest', 'computer_science', 180, 140),
    ('ML course project', 'machine_learning', 150, 110),
    ('Kaggle weekend', 'data_science', 180, 130),
    ('Long violin practice', 'music', 90, 70),
    ('Reading', 'reading', 60, 40),
    ('Long lift session', 'gym', 75, 45),
    ('Hike with friends', 'friends', 180, 45),
    ('Cooking a proper meal', 'cooking', 75, 25),
    ('Chores', 'chores', 45, 25),
    ('Laundry and reset', 'laundry', 45, 20),
)

#: The six, oldest first.
#:
#: Read the `away` column down and it is the argument the whole seed is making.
#: A day away is a day with nothing on it at all, and it is the only thing that
#: breaks a streak — a rest day keeps the sitting, the lifting and the evening
#: review, which is what a rest day actually looks like for somebody who has
#: been doing this for six years.
#:
#: It falls from one day in fourteen to one in two hundred and fifty. That is
#: the difference between a fifteen-year-old with school holidays and somebody
#: whose week is planned in this app and who has not missed a day since the
#: thesis started — and it is what makes the streak on the front page a number
#: worth having rather than whatever the dice said.
ERAS = (
    Era('School', 1.0, SCHOOL_WEEK, SCHOOL_EVENING, SCHOOL_WEEKEND,
        goal=230, focus_goal=2, rest=0.24, away=0.07, load=(1, 2)),
    Era('Contest years', 1.0, CONTEST_WEEK, CONTEST_EVENING, CONTEST_WEEKEND,
        goal=300, focus_goal=3, rest=0.20, away=0.045, load=(2, 3)),
    Era('Final year', 1.0, FINAL_WEEK, FINAL_EVENING, CONTEST_WEEKEND,
        goal=360, focus_goal=3, rest=0.18, away=0.028, load=(2, 3)),
    Era('Freshman year', 1.0, FRESHMAN_WEEK, FRESHMAN_EVENING, WEEKEND,
        goal=410, focus_goal=4, rest=0.16, away=0.016, load=(3, 4)),
    Era('Research year', 1.0, RESEARCH_WEEK, RESEARCH_EVENING, WEEKEND,
        goal=440, focus_goal=4, rest=0.15, away=0.008, load=(3, 5)),
    Era('Thesis year', 1.0, WEEK, EVENING, WEEKEND,
        goal=DAILY_GOAL, focus_goal=5, rest=0.14, away=0.004, load=(4, 5)),
)


def era_calendar(start: date, days: int):
    """Which era each day of the window falls in, oldest first.

    Returns a list of (first_day, last_day, Era), the spans being the eras'
    weights over the window. Built once rather than asked per day: the boundary
    between two eras is the thing most likely to be wrong by one, and one place
    that decides it is one place to check.
    """
    total = sum(era.weight for era in ERAS)
    spans = []
    used = 0
    for at, era in enumerate(ERAS):
        length = days - used if at == len(ERAS) - 1 else round(days * era.weight / total)
        spans.append((start + timedelta(days=used),
                      start + timedelta(days=used + length - 1), era))
        used += length
    return spans


def era_by_day(start: date, days: int):
    """The same, flattened: {ISO day: Era}."""
    out = {}
    for first, last, era in era_calendar(start, days):
        day = first
        while day <= last:
            out[day.isoformat()] = era
            day += timedelta(days=1)
    return out


# --------------------------------------------------------------------------
# The hall of fame
# --------------------------------------------------------------------------
#: What Alpha has logged on the Records page, as (name, category, unit, target,
#: direction, [(years_ago, value), ...]).
#:
#: One row per *entry*, not per record — which is the shape the records table
#: exists to have, and the reason the page can draw an evolution at all. A
#: record here is every row sharing a name, and the chart is those rows in date
#: order. See data/sql/records.sql.
#:
#: `direction` is which end of the range is the good end. Most of these climb;
#: the mile, the 5k and the Kaggle placing come *down*, and they are in here
#: deliberately — a seed whose every record goes up cannot show that the
#: comparison direction is doing anything, and those three are exactly the case
#: that used to read upside down.
#:
#: The values are an argument, not a list of numbers: 18 to 25 on the AMC 8 over
#: six years, a mile from 6:48 to 5:12, a Kaggle placing from four thousandth to
#: under two hundred. Nothing here is a straight line, because a record that
#: improves by the same amount every time is not a record anybody set.
RECORDS = (
    # Alpha already has an AMC 8 series of its own, logged by hand and running
    # 18 to 25 across the last two years. These are *earlier* and *lower* on
    # purpose: this script may add to the record and may not argue with it, and
    # four entries topping out at 25 six years ago would have said the account
    # scored full marks in 2020 and then dropped to 18 in 2024. Together they
    # are one climb — 11, 14, 16, then the eighteen the hand-logged run starts
    # from.
    ('AMC 8', 'Competitive Math', 'points', 25, 'higher',
     ((6.3, 11), (5.8, 14), (5.2, 16))),
    ('AMC 10', 'Competitive Math', 'points', 150, 'higher',
     ((5.8, 96), (5.2, 112.5), (4.8, 121.5), (4.2, 133.5))),
    ('AMC 12', 'Competitive Math', 'points', 150, 'higher',
     ((4.1, 102), (3.8, 115.5), (3.2, 127.5))),
    ('AIME', 'Competitive Math', 'points', 15, 'higher',
     ((5.0, 5), (4.1, 8), (3.9, 9), (3.1, 11), (2.2, 13))),
    ('Putnam', 'Competitive Math', 'points', 120, 'higher',
     ((2.2, 21), (1.2, 43), (0.2, 58))),
    ('USACO', 'Competitive Programming', 'points', 1000, 'higher',
     ((4.9, 612), (4.2, 780), (3.4, 933))),
    ('LeetCode solved', 'Competitive Programming', 'problems', 0, 'higher',
     ((3.9, 120), (2.8, 342), (1.9, 604), (0.6, 918))),
    ('Kaggle placing', 'Machine Learning', '', 0, 'lower',
     ((4.4, 4102), (3.3, 1870), (2.1, 604), (0.8, 188))),
    ('Model accuracy', 'Machine Learning', 'points', 100, 'higher',
     ((3.2, 71.4), (2.4, 83.9), (1.5, 89.2), (0.4, 93.6))),
    ('Papers read', 'Research', 'problems', 0, 'higher',
     ((2.9, 24), (1.8, 96), (0.9, 188), (0.1, 271))),
    ('Mile', 'Running', 'minutes', 0, 'lower',
     ((6.1, 6.8), (5.0, 6.35), (3.6, 5.9), (2.0, 5.5), (0.5, 5.2))),
    ('5k', 'Running', 'minutes', 0, 'lower',
     ((5.5, 25.4), (4.0, 23.1), (2.4, 21.2), (0.7, 19.6))),
    ('Bench press', 'Training', 'points', 0, 'higher',
     ((5.7, 45), (4.3, 62.5), (2.9, 80), (1.4, 95), (0.3, 102.5))),
    ('Deadlift', 'Training', 'points', 0, 'higher',
     ((5.6, 90), (4.0, 130), (2.5, 165), (0.9, 190))),
    # The three Summit records are not here. They are things this app counted,
    # so inventing figures for them would put a hall of fame on the page that
    # the account's own history contradicts — a "longest streak, 412 days" over
    # a record whose best run is 103. They are read off the rows instead; see
    # `summit_records`.
    ('Violin RCM level', 'Music', 'level', 10, 'higher',
     ((6.0, 6), (4.4, 8), (2.6, 9), (0.9, 10))),
    ('GPA', 'School', 'points', 4, 'higher',
     ((5.6, 3.72), (4.5, 3.85), (3.4, 3.91), (2.3, 3.94), (0.6, 3.97))),
)

#: The things that happened once. No figure to beat — a milestone is "I reached
#: something" where a record is "I did better", which is the distinction the
#: page states under its own heading.
#:
#: Categorised so the page has something to fold: a heading with more than one
#: thing under it becomes a group, and a category of one stays a plain row. See
#: `milestoneGroups` in frontend/src/utils/records.ts.
MILESTONES = (
    ('First AIME qualification', 'Competitive Math', 5.1),
    ('AIME 11 — top 5% nationally', 'Competitive Math', 3.1),
    ('USAMO qualified', 'Competitive Math', 3.0),
    ('Putnam top 500', 'Competitive Math', 1.2),
    ('Putnam Honorable Mention', 'Competitive Math', 0.2),
    ('USACO Platinum', 'Competitive Programming', 3.4),
    ('First open-source PR merged', 'Competitive Programming', 4.0),
    ('First model that beat the baseline', 'Machine Learning', 3.2),
    ('Kaggle top 200 finish', 'Machine Learning', 0.8),
    ('First paper submitted', 'Research', 1.0),
    ('First paper accepted', 'Research', 0.3),
    ('Joined the lab', 'Research', 2.0),
    ('RCM Level 10 certificate', 'Music', 0.9),
    ('First orchestra solo', 'Music', 2.4),
    ('First sub-6 mile', 'Running', 3.6),
    ('First 100kg bench', 'Training', 0.6),
    ('1,000 days on Summit', 'Summit', 2.8),
    ('10,000 tasks completed', 'Summit', 1.1),
    ('Accepted onto the PhD track', 'School', 1.6),
)


def summit_records(behind, focus):
    """The records this app counted for itself, read back off what it wrote.

    Three of them — the longest streak, the best day, the longest sitting — are
    facts about the record rather than claims about the world, so they are
    derived and not listed. A seed that types a figure for these produces a
    Records page whose headline is contradicted by the Growth tab three
    sections below it, which is the one kind of wrong a demo account must not
    be: it makes the *app* look like it cannot count.

    Each comes back as the running maximum, sampled at the days it actually
    moved — which is what a record is. Only the improvements are entries, so
    the evolution the page draws is the real one.
    """
    xp_by_day: dict[str, int] = {}
    for row in behind:
        day = row[11][:10]
        xp_by_day[day] = xp_by_day.get(day, 0) + row[6]

    def climbing(pairs):
        """(day, value) for every point the running maximum moved."""
        out, best = [], None
        for day, value in sorted(pairs):
            if best is None or value > best:
                best = value
                out.append((day, value))
        return out

    # A streak is the run of consecutive worked days ending on each day, and
    # the record is the longest that had happened *by* then.
    worked = sorted(xp_by_day)
    runs, run, previous = [], 0, None
    for day in worked:
        at = date.fromisoformat(day)
        run = run + 1 if previous is not None and (at - previous).days == 1 else 1
        runs.append((day, run))
        previous = at

    # The longest single sitting, off the tasks themselves rather than off the
    # day's focus total: `focus_days` is capped at eight hours a day, so a
    # running maximum of it becomes "480 minutes" within a year and stays there
    # — a record that is really the cap, reported as an achievement.
    sittings = [(row[11][:10], round(int(row[12] or 0) / 60))
                for row in behind
                if row[2] not in ATTENDANCE and row[7] not in NOT_STUDY]

    return {
        # A streak of one day is not a record, it is the first day — and a
        # streak of seven is a week. The first one somebody would actually
        # write down is a month, which is also what stops this record's first
        # entry being so small that it wins the hero on percentage alone:
        # `headline` ranks on the share of where you started, and starting at 1
        # makes any later figure an infinite improvement.
        'Longest streak': [(day, run) for day, run in climbing(runs) if run >= 30],
        'Best XP day': climbing(list(xp_by_day.items())),
        'Longest focus session': climbing(sittings),
    }


#: How the three derived records are filed, since they are not in `RECORDS`.
DERIVED_META = {
    'Longest streak': ('Summit', 'days', 0),
    'Best XP day': ('Summit', '', 0),
    'Longest focus session': ('Summit', 'minutes', 0),
}

#: At most this many entries per derived record. The running maximum of a daily
#: figure over six years moves dozens of times, and a hall of fame is not a
#: changelog — the evolution chart wants the shape, not every step of it. The
#: first and the last are always kept: where you started and where you are is
#: the whole claim the page makes.
DERIVED_MAX = 7


def thin(entries, keep=DERIVED_MAX):
    """Cut a long climb down to `keep` points, first and last among them."""
    if len(entries) <= keep:
        return entries
    step = (len(entries) - 1) / (keep - 1)
    picked = {round(at * step) for at in range(keep)}
    picked.add(len(entries) - 1)
    return [entries[at] for at in sorted(picked)]


def record_rows(user: str, today: date, derived: dict | None = None):
    """The hall of fame, as rows, dated backwards from today."""
    rows = []
    now = datetime.now().isoformat(timespec='seconds')

    def add(kind, name, category, value, target, unit, direction, on):
        rows.append((
            str(RECORD_BASE + len(rows)), user, kind, name, category,
            value, target, unit, direction, '', on, now, now,
        ))

    def ago(years_ago):
        return (today - timedelta(days=round(years_ago * 365.25))).isoformat()

    for name, category, unit, target, direction, entries in RECORDS:
        for years_ago, value in entries:
            add('record', name, category, value, target, unit, direction,
                ago(years_ago))

    for name, entries in (derived or {}).items():
        category, unit, target = DERIVED_META[name]
        for on, value in thin(entries):
            add('record', name, category, value, target, unit, 'higher', on)

    for name, category, years_ago in MILESTONES:
        add('milestone', name, category, 0, 0, '', 'higher', ago(years_ago))

    # Claimed only if the record bears it out. "Every day for a full year" is
    # the kind of milestone a seed is tempted to write because it sounds like
    # this account — and if the rows underneath say the best run was 103 days,
    # it is the app calling its own owner a liar on the front page.
    longest = max((value for _on, value in (derived or {}).get('Longest streak', ())),
                  default=0)
    if longest >= 365:
        run = (derived or {})['Longest streak'][-1][0]
        add('milestone', 'Every day for a full year', 'Summit', 0, 0, '', 'higher', run)
    return rows


RECORD_COLUMNS = (
    'id, user_id, kind, name, category, value, target, unit,'
    ' comparison_direction, note, achieved_on, created_at, updated_at'
)


# --------------------------------------------------------------------------
# An account that plans around this app
# --------------------------------------------------------------------------
#: Alpha's preferences, and they are part of the argument.
#:
#: This is somebody whose week is timetabled to the quarter hour and who wants
#: to be told the truth about it, so the ratings are set as deep as they go and
#: the analytics are set as hard as they go:
#:
#:     rating_depth      'reasons' — the two star rows *and* what made the
#:                       difference, which is the only setting that produces
#:                       the reasons panel at all
#:     analytics_tone    'harsh'  — the read-out does not soften anything
#:     analytics_detail  'everything' — every panel the page can draw
#:     analytics_window  'all'    — six years is the point; do not window it
#:
#: The rest is the shape of a life run out of this app: the day starts on the
#: dashboard, the catch-up prompt is on because an untracked day is a hole in
#: six years of record, deleting asks first, and the clock is 24-hour because
#: the timetable is written that way.
SETTINGS = {
    'theme_mode': 'dark',
    'accent': 'violet',
    'home_page': 'dashboard',
    'clock_format': '24h',
    'week_starts_on': 'monday',

    # Strict. Every question the app can ask after a task, asked.
    'rating_depth': 'reasons',
    'confirm_delete': 'true',
    'default_priority': 'high',
    'default_xp': '40',

    'task_status': 'open',
    'task_sort': 'due',
    'task_group': 'due',
    'task_horizon': 'week',
    'calendar_view': 'week',

    # Four hours of deliberate work is the floor on a day in the thesis year,
    # and the dim is on because the timer is used rather than glanced at.
    'focus_goal_hours': '4',
    'focus_dim': 'true',
    'catchup_prompt': 'true',

    'records_sort': 'improvement',
    'timer_setup_done': 'true',

    'analytics_window': 'all',
    'analytics_setup_done': 'true',
    'analytics_home_tab': 'growth',
    'analytics_log_style': 'both',
    'analytics_tone': 'harsh',
    'analytics_detail': 'everything',
    'analytics_standing': 'true',

    'notifications_enabled': 'true',
    'notify_popups': 'true',
    'notify_tasks': 'true',
    'notify_calendar': 'true',
    'notify_analytics': 'true',
    'notify_goals': 'true',
    'notify_streak': 'true',
    'notify_progress': 'true',
}


def stamp(day: date, hhmm: str) -> str:
    return '{}T{}:00'.format(day.isoformat(), hhmm)


def minutes(hhmm: str) -> int:
    h, m = hhmm.split(':')
    return int(h) * 60 + int(m)


def add_minutes(day: date, hhmm: str, span: int) -> str:
    start = datetime.combine(day, datetime.min.time()) + timedelta(minutes=minutes(hhmm))
    return (start + timedelta(minutes=span)).isoformat()


# --------------------------------------------------------------------------
# Building
# --------------------------------------------------------------------------
def forward_rows(user: str, start: date, days: int, first_id: int):
    """The timetable ahead, as unfinished calendar blocks."""
    rows = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        for weekday, title, subject, begin, end, xp, _study in WEEK:
            if day.weekday() != weekday:
                continue
            rows.append((
                str(first_id + len(rows)), user, title, '', 'medium', 'todo',
                xp, subject, stamp(day, end), 1, stamp(day, begin),
                None, None, None, None, None,
            ))
    return rows


def behind_rows(user: str, start: date, days: int, first_id: int, rng: random.Random):
    """The years already lived, plus the study around them.

    Everything here is finished, rated and timed, because that is what the
    analytics pages read: the quality grid needs difficulty against execution,
    the efficiency metric needs a duration and a deadline it either met or did
    not, and the subject split needs a subject on every row.

    Each day takes its week from the era it fell in — see `ERAS`. The ratings
    carry the same arc: execution drifts up about a point across the six years,
    because somebody who has been doing this since they were fifteen is better
    at it at twenty-one, and a record where that is not visible is a record with
    no progress in it.
    """
    rows = []
    eras = era_by_day(start, days)

    def finish(day, title, subject, begin, span, xp, on_cal, through=0.0):
        """One finished task. `begin` is a clock time, `span` is minutes.

        `through` is how far into the six years this day is, 0 to 1, and it is
        what makes the record improve: lateness falls and execution climbs.
        """
        started = stamp(day, begin)
        due = add_minutes(day, begin, span)
        # Most things land on time; the ones that do not are what stops the
        # efficiency score being a flat 100 and therefore meaningless. It
        # tightens with the years — 18% at fifteen, 8% in the thesis year —
        # because getting better at this is mostly getting better at finishing
        # when you said you would.
        late = rng.random() < (0.18 - 0.10 * through)
        done_at = add_minutes(day, begin, span + (rng.randint(10, 90) if late else 0))
        # Difficulty and execution: a real record is mostly competent work at a
        # sensible level, with enough spread to make the grid worth drawing.
        difficulty = rng.choices([2, 3, 4, 5], weights=[12, 34, 38, 16])[0]
        drift = 1 if rng.random() < through * 0.55 else 0
        execution = max(1, min(5, difficulty + drift + rng.choices(
            [-2, -1, 0, 1], weights=[6, 22, 54, 18])[0]))
        rows.append((
            str(first_id + len(rows)), user, title, '', 'medium', 'done',
            xp, subject, due, on_cal, started,
            done_at, span * 60 + (rng.randint(0, 600)), 0 if late else 1,
            difficulty, execution,
        ))

    for offset in range(days):
        day = start + timedelta(days=offset)
        era = eras[day.isoformat()]
        through = offset / max(1, days - 1)

        # Two kinds of day that are not a working day, and they are not the
        # same thing.
        #
        # This used to be one: a 13% chance of the day being skipped outright,
        # no rows at all. That was right when the week was nothing but
        # lectures and problem sets — a day off from a week like that really is
        # an empty day. It is wrong now. Somebody who lifts three mornings,
        # sits for twenty minutes before it is light and gets in cold water on
        # a Saturday does not stop doing those because they are not working;
        # those *are* the rest day. Modelling one as a hole in the record made
        # the app say the account had not turned up at all, and the streak on
        # the front page came out at 1 against a year of daily effort.
        #
        # So: a rest day keeps everything on the timetable that was never work
        # — see `NOT_STUDY`, which is the line this reads — and drops the
        # lectures, the seminars and the evening. Roughly one day in eight.
        #
        # A day *away* is the rarer thing and stays a genuine hole: travel,
        # illness, the weekend somebody actually leaves. One day in
        # twenty-five, which is what leaves the streak worth looking at and the
        # consistency score something other than a flat hundred.
        roll = rng.random()
        if roll < era.away:
            continue
        resting = roll < era.rest

        for weekday, title, subject, begin, end, xp, _study in era.week:
            if day.weekday() != weekday:
                continue
            if resting and subject not in NOT_STUDY:
                continue
            finish(day, title, subject, begin,
                   minutes(end) - minutes(begin), xp, 1, through)

        if resting:
            continue

        pool = era.weekend if day.weekday() >= 5 else era.evening
        clock = 9 * 60 if day.weekday() >= 5 else 19 * 60 + 30
        low, high = era.load
        for title, subject, span, xp in rng.sample(pool, rng.randint(low, high)):
            begin = '{:02d}:{:02d}'.format(clock // 60, clock % 60)
            if clock + span > 22 * 60 + 30:
                break
            finish(day, title, subject, begin, span, xp, 0, through)
            clock += span + 15

    return rows


def focus_notes(user: str, start: date, days: int):
    """The day's subject, written where the calendar shows it."""
    rows = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        choices = FOCUS_DAYS[day.weekday()]
        rows.append((user, day.isoformat(),
                     choices[(offset // 7) % len(choices)]))
    return rows


#: Timetabled blocks that are attendance rather than work, by title.
#:
#: Derived from `WEEK` rather than listed again, so a block whose flag is
#: changed above cannot go on being counted down here.
#: Titles that are attendance rather than work, across every era.
#:
#: Derived from all six weeks and not only the thesis year's, which is what it
#: was and which stopped being enough the moment the early eras arrived: their
#: biggest block is "School day", six hours and forty minutes of it, and a
#: title the thesis year has never heard of was not in this set. So every
#: school day in the first three years was counted as one unbroken focus
#: session — which made the longest sitting on the Records page 408 minutes,
#: and the focus figures for a fifteen-year-old better than a doctoral
#: student's.
#:
#: A title that is work in one era and attendance in another would land here
#: and be attendance everywhere. None currently is, and the alternative — a set
#: keyed by (era, title) — would be a lot of machinery for a distinction
#: nothing has yet needed to draw.
ATTENDANCE = frozenset(
    title
    for era in ERAS
    for _d, title, _s, _b, _e, _x, study in era.week
    if not study)

#: Subjects that are never deliberate study, whatever they are attached to.
#:
#: The evening and weekend pools carry no flag of their own, so this is the
#: only thing standing between them and the focus figures. It used to be three
#: names because the week held almost nothing but work; now that it holds a
#: life, the list is the whole of that life. An hour in an ice bath, an hour
#: with friends and an hour of sitting still are all worth XP and all belong on
#: the record — and not one of them is an hour of focus, which is the figure
#: the app reports as time spent studying.
#:
#: `reading` is deliberately *not* here. Reading a book is study in the sense
#: this app means; lying in cold water is not.
NOT_STUDY = frozenset((
    'planning', 'chores', 'laundry', 'cooking',
    'gym', 'running', 'health', 'meditation',
    'friends', 'journaling',
))


def focus_sessions(user: str, tasks, rng: random.Random, eras: dict):
    """Hours actually sat, per day, from the work that was done.

    Counted off the finished rows rather than invented beside them, so the
    focus figures and the task figures cannot disagree about a Tuesday. Only
    the deliberate study counts — sitting in a lecture is not a focus session,
    which is the same line the app draws.

    The goal on each row is the era's rather than a flat three hours: a day in
    the school years that reached two is a day that met its target, and scoring
    it against a thesis year's would write two years of failure into a record
    that was going perfectly well.
    """
    by_day: dict[str, int] = {}
    for row in tasks:
        title, subject, completed = row[2], row[7], row[11]
        if title in ATTENDANCE or subject in NOT_STUDY:
            continue
        day = completed[:10]
        by_day[day] = by_day.get(day, 0) + int(row[12] or 0)

    return [(user, day, min(seconds, 8 * 3600),
             eras[day].focus_goal if day in eras else 3)
            for day, seconds in sorted(by_day.items())]


def snapshots(user: str, tasks, focus, start: date, days: int, eras: dict):
    """The report card as it would have been recorded, week by week.

    The card writes one row per metric each time it is read, so a year that was
    lived leaves a year of them — and without that the Growth Score has a
    figure and no line. These are computed from the rows above rather than
    drawn as a curve: the productivity score is the week's XP against the
    account's goal, consistency is the days it worked, quality is what it rated
    its own work, and so on. The same five, and the mean of them.

    Each week is scored against the goal of the era it fell in, not against the
    account's current one. A sixteen-year-old measured against a doctoral
    student's day is a productivity score near zero for two straight years, and
    the Growth tab would draw that as somebody who started badly and got better
    — when what actually happened is that the day got longer. The stored goal
    is the present era's; these are the goals that were true at the time.
    """
    xp_by_day: dict[str, int] = {}
    rated: dict[str, list[tuple[int, int]]] = {}
    ontime: dict[str, list[int]] = {}
    for row in tasks:
        day = row[11][:10]
        xp_by_day[day] = xp_by_day.get(day, 0) + row[6]
        rated.setdefault(day, []).append((row[14], row[15]))
        ontime.setdefault(day, []).append(row[13])
    focus_by_day = {day: seconds for _u, day, seconds, _g in focus}

    rows = []
    for offset in range(0, days, 7):
        window = [(start + timedelta(days=offset + n)).isoformat()
                  for n in range(7) if offset + n < days]
        day = window[-1]
        worked = [d for d in window if xp_by_day.get(d)]
        if not worked:
            continue

        xp = sum(xp_by_day.get(d, 0) for d in worked) / len(window)
        pairs = [p for d in window for p in rated.get(d, [])]
        flags = [f for d in window for f in ontime.get(d, [])]
        hours = sum(focus_by_day.get(d, 0) for d in worked) / 3600.0
        era = eras.get(day) or eras.get(window[0]) or ERAS[-1]
        goal = float(era.goal)
        # The focus target moves with the era for the same reason the XP goal
        # does — see the note above.
        focus_target = float(era.focus_goal)

        scores = {
            'productivity': min(100, round(xp / goal * 100)),
            'consistency': round(len(worked) / len(window) * 100),
            'quality': min(100, round(
                sum(e for _d, e in pairs) / len(pairs) / 5 * 100)) if pairs else 0,
            'efficiency': round(sum(flags) / len(flags) * 100) if flags else 0,
            'focus': min(100, round(hours / (len(window) * focus_target) * 100)),
        }
        scores['overall'] = round(sum(scores.values()) / len(scores))

        for metric, score in scores.items():
            rows.append((user, day, metric, score, grade_for_score(score), '{}'))
    return rows


# --------------------------------------------------------------------------
# Writing
# --------------------------------------------------------------------------
TASK_COLUMNS = (
    'id, user_id, title, description, priority, status, xp_value, subject,'
    ' due_date, show_on_calendar, created_at, completed_at, completion_seconds,'
    ' met_deadline, difficulty, execution'
)


#: seed_year.py's window. Not this script's to write, but very much this
#: script's problem: both draw on the same calendar, and a real timetable with
#: an invented one laid over it is two Wednesdays at once. Cleared by default
#: because the two cannot both be Alpha's week; `--keep-seed-year` says
#: otherwise for anyone who wants the density rather than the timetable.
SEED_YEAR_LOW, SEED_YEAR_HIGH = '1000000000000', '1099999999999'


def clear(con, user: str, ahead_from: date, behind_from: date, behind_to: date,
          keep_seed_year: bool = False) -> int:
    """Everything this script has ever written for `user`, and nothing else."""
    gone = con.execute('DELETE FROM tasks WHERE ' + OWNED, owned_args(user)).rowcount
    if not keep_seed_year:
        gone += con.execute(
            'DELETE FROM tasks WHERE user_id = ? AND id >= ? AND id <= ?'
            ' AND length(id) = 13', (user, SEED_YEAR_LOW, SEED_YEAR_HIGH)).rowcount
    gone += con.execute('DELETE FROM xp_events WHERE ' + OWNED, owned_args(user)).rowcount
    gone += con.execute('DELETE FROM records WHERE ' + OWNED, owned_args(user)).rowcount
    # Bounded on both sides, and to the window each table is written in.
    for table in ('focus_days', 'metric_snapshots'):
        gone += con.execute(
            'DELETE FROM {} WHERE user_id = ? AND date BETWEEN ? AND ?'.format(table),
            (user, min(behind_from.isoformat(), WRITTEN_SINCE),
             behind_to.isoformat())).rowcount
    # The notes are the year ahead rather than the year behind, so they are the
    # one range measured from today. A --clear run on a later day leaves the
    # few days it has since walked past; they are notes on a calendar, and the
    # alternative is a DELETE with no upper bound, which is what this whole
    # note is about.
    gone += con.execute(
        'DELETE FROM day_focus_notes WHERE user_id = ? AND date BETWEEN ? AND ?',
        (user, ahead_from.isoformat(),
         (ahead_from + timedelta(days=364)).isoformat())).rowcount
    return gone


#: The earliest date any version of this script has written a focus day or a
#: report-card row to, and therefore the floor on what it may delete.
#:
#: Those two tables are keyed by (user, date) and carry no id, so unlike tasks
#: and the ledger there is no mark saying which rows are this script's — the
#: date range *is* the mark. It was `>= BEHIND_FROM` with no upper bound to
#: begin with, which read as "everything from the year I write onwards" and
#: deleted the account's real focus history and every report card the app
#: itself had recorded since. A seeding script may overwrite what it wrote; it
#: may not take the record with it on the way past. So the delete stays bounded
#: on both sides: this floor below, and the run's own last written day above.
#:
#: It stopped being the only floor when the record went from one year to six:
#: the run's own `behind_from` is now six years back and is the honest bound on
#: what this run is about to overwrite, so `clear` takes the earlier of the two.
#: This literal stays as the floor for a *shallower* run — `--years 2` against a
#: database a six-year run wrote should still take the older rows out rather
#: than leave four years of orphaned report cards behind it.
WRITTEN_SINCE = '2018-01-01'


def behind_window(today: date, years: int = 6) -> tuple[date, date]:
    """The years of record: `years` of them, ending yesterday.

    Measured from today rather than frozen into the file. The window used to be
    a pair of literals, and a literal year of record is only correct for the
    twelve months after it is typed — a year later the account has a full
    history that stops dead a year ago, every "this week" panel in the app
    reads empty, and the seed looks like a bug in the app rather than a stale
    constant. It ends yesterday because today belongs to the year *ahead*: the
    calendar's blocks for today are things still to do, and a day cannot
    sensibly be both already lived and still coming.
    """
    last = today - timedelta(days=1)
    return last - timedelta(days=round(years * 365.25) - 1), last


def streaks(tasks, last_day: date):
    """The streak the written record implies: the run ending `last_day`, and the best.

    The account's streak is a stored counter, not something the app derives on
    read — `current_streak` is bumped as tasks are finished and reset once a
    whole day passes without one. A seed that writes a year of finished work and
    leaves that counter alone therefore produces an account with a year of
    daily effort behind it and a streak of zero on the front page, which reads
    as a broken app rather than as a seeded one. So the counter is written from
    the same rows the rest of the account is written from.

    The current run has to end on the last day written: the record stops
    yesterday, and a streak that ended a week before that is a streak the app
    would have already dropped to zero.
    """
    worked = {row[11][:10] for row in tasks}

    current = 0
    day = last_day
    while day.isoformat() in worked:
        current += 1
        day -= timedelta(days=1)

    best = run = 0
    previous = None
    for iso_day in sorted(worked):
        this = date.fromisoformat(iso_day)
        run = run + 1 if previous and (this - previous).days == 1 else 1
        best = max(best, run)
        previous = this

    return current, max(best, current)


def top_up(con, user: str, target: int, before: str):
    """Raise the ledger to `target` across days the account already worked.

    Alpha's early record was written thinly — 92 XP a day against its own
    300-a-day goal — so the shortfall to a level worth showing is not an
    invention, it is the difference between a seeded account and a lived one.
    It is spread over the days that already have something on them, so no day
    appears that the account did not turn up for, and the consistency figures
    do not move.

    `tasks_completed = 0` on these rows: they add XP and claim no tasks, which
    is what keeps the ledger's task count equal to the tasks that exist.
    """
    total = con.execute(
        'SELECT COALESCE(SUM(amount), 0) FROM xp_events WHERE user_id = ?',
        (user,)).fetchone()[0]
    short = target - total
    if short <= 0:
        return 0, total

    days = [row[0] for row in con.execute(
        'SELECT DISTINCT date(timestamp) FROM xp_events'
        ' WHERE user_id = ? AND date(timestamp) < ? ORDER BY 1', (user, before))]
    if not days:
        return 0, total

    each, spare = divmod(short, len(days))
    rows = []
    for at, day in enumerate(days):
        amount = each + (1 if at < spare else 0)
        if amount <= 0:
            continue
        rows.append((str(EVENT_BASE + 10_000_000 + at), user, amount,
                     'daily_xp', '{}T20:00:00'.format(day), day, 0, 0))
    con.executemany(
        'INSERT INTO xp_events (id, user_id, amount, reason, timestamp, date,'
        ' tasks_completed, avg_task_xp) VALUES (?,?,?,?,?,?,?,?)', rows)
    return short, target


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--user', default='Alpha')
    ap.add_argument('--clear', action='store_true')
    ap.add_argument('--seed', type=int, default=20260907)
    ap.add_argument('--keep-seed-year', action='store_true',
                    help="leave seed_year.py's rows on the calendar")
    ap.add_argument('--level', type=int, default=100,
                    help='level to bring the account to (default 100)')
    ap.add_argument('--years', type=int, default=6,
                    help='years of record to write behind today (default 6)')
    ap.add_argument('--keep-settings', action='store_true',
                    help="leave the account's preferences alone")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    today = date.today()
    ahead_from = today
    behind_from, behind_to = behind_window(today, args.years)
    behind_days = (behind_to - behind_from).days + 1
    eras = era_by_day(behind_from, behind_days)

    con = sqlite3.connect(DB)
    con.execute('PRAGMA foreign_keys = ON')
    try:
        with con:
            gone = clear(con, args.user, ahead_from, behind_from, behind_to,
                         keep_seed_year=args.keep_seed_year)
            if args.clear:
                # `users.xp` is the ledger's sum and nothing else, so taking
                # rows out of the ledger has to put the row back in step.
                left = con.execute(
                    'SELECT COALESCE(SUM(amount), 0),'
                    ' COALESCE(SUM(COALESCE(tasks_completed, 1)), 0)'
                    ' FROM xp_events WHERE user_id = ?', (args.user,)).fetchone()
                # The streak counter is written from the record too, so it
                # comes back out with it rather than being left standing over
                # a year of work that is no longer there.
                con.execute(
                    'UPDATE users SET xp = ?, level = ?, tasks_completed = ?,'
                    ' current_streak = 0, day_state = ? WHERE username = ?',
                    (left[0], level_for_total_xp(left[0])['level'], left[1],
                     'newday', args.user))
                print('{}: removed {} rows, ledger back to {:,} XP'.format(
                    args.user, gone, left[0]))
                return

            ahead = forward_rows(args.user, ahead_from, 365, TASK_BASE)
            behind = behind_rows(args.user, behind_from, behind_days,
                                 TASK_BASE + 1_000_000, rng)
            con.executemany(
                'INSERT INTO tasks ({}) VALUES ({})'.format(
                    TASK_COLUMNS, ','.join('?' * 16)), ahead + behind)

            # One ledger row per finished task, carrying the same XP and the
            # same day — the ledger is what the analytics pages count from, so
            # a finished task without one is work the app cannot see.
            events = [
                (str(EVENT_BASE + at), args.user, row[6], 'task_completion',
                 row[11], row[11][:10], 1, row[6])
                for at, row in enumerate(behind)
            ]
            con.executemany(
                'INSERT INTO xp_events (id, user_id, amount, reason, timestamp,'
                ' date, tasks_completed, avg_task_xp) VALUES (?,?,?,?,?,?,?,?)',
                events)

            notes = focus_notes(args.user, ahead_from, 365)
            con.executemany(
                'INSERT OR REPLACE INTO day_focus_notes (user_id, date, text)'
                ' VALUES (?,?,?)', notes)

            focus = focus_sessions(args.user, behind, rng, eras)
            con.executemany(
                'INSERT OR REPLACE INTO focus_days (user_id, date, seconds,'
                ' goal_hours) VALUES (?,?,?,?)', focus)

            con.executemany(
                'INSERT INTO records ({}) VALUES ({})'.format(
                    RECORD_COLUMNS, ','.join('?' * 13)),
                record_rows(args.user, today, summit_records(behind, focus)))

            if not args.keep_settings:
                # Written straight rather than through the API: this is a
                # seeding script and the endpoint would need a session. Every
                # key is one FIELDS already declares, so a value that stops
                # being valid fails the same read the app's own would.
                con.executemany(
                    'INSERT OR REPLACE INTO user_settings (user_id, key, value,'
                    ' updated_at) VALUES (?,?,?,?)',
                    [(args.user, key, value, datetime.now().isoformat(timespec='seconds'))
                     for key, value in SETTINGS.items()])

            cards = snapshots(args.user, behind, focus, behind_from, behind_days, eras)
            con.executemany(
                'INSERT OR REPLACE INTO metric_snapshots (user_id, date, metric,'
                ' score, grade, detail) VALUES (?,?,?,?,?,?)', cards)

            # Level N costs N * 100, so the band for a level is 10,000 wide at
            # 100. Aim at the middle of it rather than the floor: a later task
            # finished in the app should not tip the account back a level.
            floor = 100 * (args.level - 1) * args.level // 2
            added, total = top_up(con, args.user, floor + 4_000,
                                  behind_from.isoformat())

            ledger = con.execute(
                'SELECT COALESCE(SUM(amount), 0), COALESCE(SUM(COALESCE(tasks_completed, 1)), 0)'
                ' FROM xp_events WHERE user_id = ?', (args.user,)).fetchone()
            levels = level_for_total_xp(ledger[0])
            # The streak the year behind implies, alongside the ledger it
            # implies — both are stored counters, and both have to agree with
            # the rows underneath them.
            run, best = streaks(behind, behind_to)
            con.execute(
                'UPDATE users SET xp = ?, level = ?, tasks_completed = ?,'
                ' daily_goal = ?, current_streak = ?, best_streak = ?,'
                ' last_task_date = ?, day_state = ? WHERE username = ?',
                (ledger[0], levels['level'], ledger[1], DAILY_GOAL, run, best,
                 behind_to.isoformat(), 'newday', args.user))

        print('{}: cleared {}, wrote {} ahead + {} behind'.format(
            args.user, gone, len(ahead), len(behind)))
        print('  {} focus notes, {} focus days, {} report-card rows'.format(
            len(notes), len(focus), len(cards)))
        print('  ledger {:,} XP ({:,} topped up) -> level {}'.format(
            ledger[0], added, levels['level']))
        print('  record {} to {}, streak {} (best {})'.format(
            behind_from, behind_to, run, best))
        for first, last, era in era_calendar(behind_from, behind_days):
            print('    {:<16} {} to {}'.format(era.name, first, last))
    finally:
        con.close()


if __name__ == '__main__':
    main()

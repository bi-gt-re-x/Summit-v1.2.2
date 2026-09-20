"""Achievements — what the record has already earned.

One endpoint. The page asks for an account's badges and gets every badge that
exists, each carrying whether it is earned, the figure it is measured against,
and how far along that figure is.

## The catalogue is code; the earning is a row

data/sql/achievements.sql splits these deliberately — the catalogue is the same
for everybody and only the earning is per-account — and this module keeps that
split while moving the catalogue itself into `CATALOGUE` below.

It is defined here rather than seeded as data because a badge is a rule, and a
rule that lives in a table has to be migrated to change. The table is still
written: `_sync_catalogue` reconciles it on first read — inserting what is
missing and rewriting what has changed — so the schema stays the description of
the app it belongs to and a reader querying the database directly sees the same
badges the page does.

## Earned once, dated forever

A badge is earned the first time the figure reaches the threshold, and the row
written to `user_achievements` is what fixes the date. That matters for the
ones that can go down again: a streak badge earned in March stays earned in
July, because the row remembers a thing that happened rather than describing
the account as it is now. Progress on an unearned badge is recomputed every
time, because that is a statement about now.

## Every metric is measured, none is invented

Every metric is a count over a table the app already keeps: tasks and when they
were finished, the focus ledger, the XP ledger, goals, notes, records, calendar
events. Nothing here maintains a counter of its own and nothing here writes to
the account's own totals — the same rule records.py follows, that a page which
scores the record does not get to change it.

That constraint is what the whole catalogue is built around. "Finish 200 tasks
before 8am" is a badge because `completed_at` is a timestamp; "read 50 articles"
is not a badge, because nothing in this app knows what an article is.

## The graded metrics come from the analytics engine, not from here

Nine of them — the growth score, the five metric grades under it, the
consistency rate, the share of finished work that was rated, and the share that
met its deadline — are read off `analytics.ratings` in
backend/tracking/analytics.py rather than recounted.

That is the point of them rather than an implementation detail. A badge that
recomputed "consistency" would be a second definition of a word the analytics
page has already defined, scored and graded, and the two would disagree the
first time either was edited — the reader would be told they are at 80% on one
page and shown a locked badge asking for 80% on another. Going through the one
engine means a badge is a *threshold on a published figure*, and the figure it
is a threshold on is the one the reader can already see the working for.

It also means these badges move both ways while unearned, which the counting
ones cannot: a grade can fall. That is fine and is the same rule the streak
badges follow — earning is a row with a date on it, and `_record_earned` never
takes one back.

## Achievement XP is a score, not currency

Every badge carries an `xp_reward` and the endpoint returns the sum of the
earned ones. **It is never added to the account's XP.** It is a way of weighing
a wall — fifty easy badges against three brutal ones — and the page labels it
as its own figure for that reason. Awarding it would mean this endpoint could
change the level of an account by being read, which is exactly what the rule
above forbids.

## Hidden badges

Six of them are `hidden`: the page does not name them until they are
earned. They exist so that the wall has a floor nobody can see the bottom of,
and they are deliberately out of reach on any ordinary account — a five-hundred
day streak, ten thousand hours of focus, level 250. The last of those is
`Ascended`, the only badge in the catalogue that confers a title, and at
3,112,500 XP (see `level_for_total_xp`: level N costs N x 100) it is the
hardest thing in the app by an order of magnitude.

A hidden badge's progress is not sent while it is locked. Sending "412 / 10000"
would be naming it in everything but the string.
"""
from datetime import datetime

from fastapi import APIRouter, Depends

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.config.skill_trees import TREES as SKILL_TREES, tree_for
from backend.config.subjects import BY_ID as SUBJECTS
from backend.database import connection as db
from backend.tracking import analytics as analytics_tracking
from backend.tracking import focus as focus_tracking
from backend.tracking.auth import load_user
from backend.tracking.xp import event_day, level_for_total_xp

router = APIRouter(tags=['achievements'])

#: The seven headings the wall is filed under, in reading order.
#:
#: Mastery is the skill trees. It is its own heading rather than more Learning
#: badges because it answers a different question: Learning counts what was
#: done, Mastery counts how far into a subject it went. A hundred hours of
#: focus and a lattice half filled in are both worth saying, and neither is a
#: bigger version of the other. The page gives it a section of its own on top
#: of the chip every heading gets — see `TreeWall` in
#: frontend/src/pages/Achievements.tsx for why that one is worth the space.
#:
#: Analytics is the graded report card: not how much was done, but how well it
#: scored. It is last before Special because it is the only heading a reader
#: cannot move by working more — only by working better — so it reads as the
#: end of the ladder rather than another rung on it.
CATEGORIES = (
    'Productivity', 'Consistency', 'Learning', 'Mastery', 'Milestones',
    'Analytics', 'Special',
)

#: What each difficulty rating is called. 1 is a first afternoon, 5 is a year
#: of the app taken seriously.
TIER_LABELS = {
    1: 'Starter',
    2: 'Steady',
    3: 'Serious',
    4: 'Elite',
    5: 'Legendary',
}

#: What a badge of each difficulty is worth toward the achievement score.
#: Steep on purpose: a wall where thirty Starters outweigh one Legendary is a
#: wall that rewards breadth and calls it depth.
TIER_XP = {1: 25, 2: 50, 3: 100, 4: 250, 5: 500}

#: Every badge, as (id, name, description, metric, threshold, tier, category).
#:
#: Thresholds inside a metric climb, so a reader always has exactly one next
#: rung on each — which is the point of having eight task badges rather than
#: one at a number nobody reaches.
CATALOGUE = (
    # ---- Productivity: the work itself ---------------------------------
    ('first-task',   'First Step',            'Finish your first task.',                          'tasks',       1,     1, 'Productivity'),
    ('tasks-10',     'Warmed Up',             'Finish 10 tasks.',                                 'tasks',       10,    1, 'Productivity'),
    ('tasks-50',     'Half a Hundred',        'Finish 50 tasks.',                                 'tasks',       50,    2, 'Productivity'),
    ('tasks-100',    'Century',               'Finish 100 tasks.',                                'tasks',       100,   2, 'Productivity'),
    ('tasks-250',    'Quarter Thousand',      'Finish 250 tasks.',                                'tasks',       250,   3, 'Productivity'),
    ('tasks-500',    'Task Crusher',          'Finish 500 tasks.',                                'tasks',       500,   3, 'Productivity'),
    ('tasks-1000',   'Four Figures',          'Finish 1,000 tasks.',                              'tasks',       1000,  4, 'Productivity'),
    ('tasks-2500',   'The Long Haul',         'Finish 2,500 tasks.',                              'tasks',       2500,  5, 'Productivity'),
    ('hard-10',      'Triage',                'Finish 10 high-priority tasks.',                   'priority',    10,    1, 'Productivity'),
    ('hard-50',      'Heavy Lifter',          'Finish 50 high-priority tasks.',                   'priority',    50,    2, 'Productivity'),
    ('hard-200',     'Firefighter',           'Finish 200 high-priority tasks.',                  'priority',    200,   4, 'Productivity'),
    ('day-5',        'Productive Day',        'Finish 5 tasks in a single day.',                  'day_tasks',   5,     1, 'Productivity'),
    ('day-10',       'Double Digits',         'Finish 10 tasks in a single day.',                 'day_tasks',   10,    2, 'Productivity'),
    ('day-20',       'Relentless',            'Finish 20 tasks in a single day.',                 'day_tasks',   20,    4, 'Productivity'),
    ('day-30',       'Machine Mode',          'Finish 30 tasks in a single day.',                 'day_tasks',   30,    5, 'Productivity'),
    ('events-10',    'Scheduled',             'Complete 10 calendar events.',                     'events',      10,    1, 'Productivity'),
    ('events-50',    'Calendar Keeper',       'Complete 50 calendar events.',                     'events',      50,    3, 'Productivity'),
    ('events-200',   'Master of the Week',    'Complete 200 calendar events.',                    'events',      200,   4, 'Productivity'),

    # ---- Consistency: turning up, and keeping turning up ----------------
    ('streak-3',     'Three in a Row',        'Hold a 3-day streak.',                             'streak',      3,     1, 'Consistency'),
    ('streak-7',     'Week Warrior',          'Hold a 7-day streak.',                             'streak',      7,     1, 'Consistency'),
    ('streak-14',    'Fortnight',             'Hold a 14-day streak.',                            'streak',      14,    2, 'Consistency'),
    ('streak-30',    'Unstoppable',           'Hold a 30-day streak.',                            'streak',      30,    2, 'Consistency'),
    ('streak-60',    'Two Months Deep',       'Hold a 60-day streak.',                            'streak',      60,    3, 'Consistency'),
    ('streak-100',   'Hundred Days',          'Hold a 100-day streak.',                           'streak',      100,   4, 'Consistency'),
    ('streak-365',   'Year of Fire',          'Hold a 365-day streak.',                           'streak',      365,   5, 'Consistency'),
    ('days-30',      'Regular',               'Do work on 30 separate days.',                     'active_days', 30,    1, 'Consistency'),
    ('days-100',     'Hundred Days In',       'Do work on 100 separate days.',                    'active_days', 100,   2, 'Consistency'),
    ('days-250',     'Devoted',               'Do work on 250 separate days.',                    'active_days', 250,   3, 'Consistency'),
    ('days-500',     'Half a Thousand Days',  'Do work on 500 separate days.',                    'active_days', 500,   5, 'Consistency'),
    ('goal-day-5',   'On Target',             'Hit your daily focus goal 5 times.',               'perfect_days', 5,    1, 'Consistency'),
    ('goal-day-25',  'Consistent Aim',        'Hit your daily focus goal 25 times.',              'perfect_days', 25,   2, 'Consistency'),
    ('goal-day-100', 'Dead Centre',           'Hit your daily focus goal 100 times.',             'perfect_days', 100,  4, 'Consistency'),
    ('goal-day-250', 'Unerring',              'Hit your daily focus goal 250 times.',             'perfect_days', 250,  5, 'Consistency'),
    ('early-10',     'Early Bird',            'Finish 10 tasks before 8am.',                      'early',       10,    1, 'Consistency'),
    ('early-50',     'Dawn Patrol',           'Finish 50 tasks before 8am.',                      'early',       50,    3, 'Consistency'),
    ('early-200',    'Sunrise Discipline',    'Finish 200 tasks before 8am.',                     'early',       200,   4, 'Consistency'),
    ('weekend-10',   'Weekend Warrior',       'Finish 10 tasks on a Saturday or Sunday.',         'weekend',     10,    1, 'Consistency'),
    ('weekend-50',   'No Days Off',           'Finish 50 tasks on a Saturday or Sunday.',         'weekend',     50,    2, 'Consistency'),
    ('weekend-150',  'Saturday Scholar',      'Finish 150 tasks on a Saturday or Sunday.',        'weekend',     150,   4, 'Consistency'),
    ('months-3',     'Quarter Year',          'Be active in 3 different months.',                 'months',      3,     1, 'Consistency'),
    ('months-6',     'Half a Year',           'Be active in 6 different months.',                 'months',      6,     2, 'Consistency'),
    ('months-12',    'Full Circle',           'Be active in 12 different months.',                'months',      12,    4, 'Consistency'),

    # ---- Learning: depth, breadth and the writing down ------------------
    ('focus-1',      'First Hour',            'Log 1 hour of focus.',                             'focus',       1,     1, 'Learning'),
    ('focus-10',     'Ten Deep',              'Log 10 hours of focus.',                           'focus',       10,    1, 'Learning'),
    ('focus-50',     'Fifty Down',            'Log 50 hours of focus.',                           'focus',       50,    2, 'Learning'),
    ('focus-100',    'Knowledge Seeker',      'Log 100 hours of focus.',                          'focus',       100,   3, 'Learning'),
    ('focus-250',    'Deep Diver',            'Log 250 hours of focus.',                          'focus',       250,   3, 'Learning'),
    ('focus-500',    'Five Hundred Hours',    'Log 500 hours of focus.',                          'focus',       500,   4, 'Learning'),
    ('focus-1000',   'The Thousand',          'Log 1,000 hours of focus.',                        'focus',       1000,  5, 'Learning'),
    ('fdays-10',     'Showing Up',            'Focus on 10 separate days.',                       'focus_days',  10,    1, 'Learning'),
    ('fdays-50',     'Fifty Sittings',        'Focus on 50 separate days.',                       'focus_days',  50,    2, 'Learning'),
    ('fdays-150',    'Practised',             'Focus on 150 separate days.',                      'focus_days',  150,   3, 'Learning'),
    ('fdays-365',    'A Year of Focus',       'Focus on 365 separate days.',                      'focus_days',  365,   5, 'Learning'),
    ('deep-3',       'Long Session',          'Focus for 3 hours in a single day.',               'focus_best',  3,     1, 'Learning'),
    ('deep-6',       'Marathon Mind',         'Focus for 6 hours in a single day.',               'focus_best',  6,     3, 'Learning'),
    ('deep-10',      'All Day Deep',          'Focus for 10 hours in a single day.',              'focus_best',  10,    4, 'Learning'),
    ('subj-3',       'Broadening',            'Finish tasks in 3 different subjects.',            'subjects',    3,     1, 'Learning'),
    ('subj-8',       'Well Rounded',          'Finish tasks in 8 different subjects.',            'subjects',    8,     2, 'Learning'),
    ('subj-15',      'Renaissance',           'Finish tasks in 15 different subjects.',           'subjects',    15,    4, 'Learning'),
    ('subj-25',      'Wide Field',            'Finish tasks in 25 different subjects.',           'subjects',    25,    5, 'Learning'),
    ('notes-1',      'First Note',            'Write your first note.',                           'notes',       1,     1, 'Learning'),
    ('notes-10',     'Note Taker',            'Write 10 notes.',                                  'notes',       10,    1, 'Learning'),
    ('notes-50',     'Notebook Filler',       'Write 50 notes.',                                  'notes',       50,    2, 'Learning'),
    ('notes-200',    'Archivist',             'Write 200 notes.',                                 'notes',       200,   3, 'Learning'),
    ('notes-500',    'A Library of Your Own', 'Write 500 notes.',                                 'notes',       500,   5, 'Learning'),

    # ---- Mastery: how far into a subject the work actually went ---------
    #
    # Measured on the skill trees, and on the account's own XP rather than on
    # the trees' authored `percent` — see `_tree_standing`.
    #
    # Six ladders, because "how far into the trees have you got" is six
    # questions and the first three could not tell them apart. `trees` is how
    # many were touched at all and `trees_deep` how many passed half: a reader
    # with twenty trees at 5% and a reader with two at 90% scored the same on
    # both and are not doing the same thing.
    #
    # `trees_done` is the top of the depth ladder — a lattice actually covered,
    # which `tree_best` can only ever say once however many are finished.
    # `tree_groups` is breadth that means something: the nine catalogue fields
    # (Maths and science, Computing, Creative…) rather than a count of
    # lattices, so opening five languages is one field and not five. `tree_xp`
    # is every lattice's own capped standing added up, in whole trees' worth of
    # work, and it is the only figure here that keeps moving after a tree caps.
    #
    # Thresholds climb inside each ladder, so there is always exactly one next
    # rung on each — tests/test_skill_tree_badges.py is what holds that true.

    # How many lattices the work has touched at all.
    ('trees-1',      'First Lattice',         'Reach a skill tree.',                              'trees',       1,     1, 'Mastery'),
    ('trees-3',      'Three Fronts',          'Reach 3 different skill trees.',                   'trees',       3,     1, 'Mastery'),
    ('trees-5',      'Five Lattices',         'Reach 5 different skill trees.',                   'trees',       5,     2, 'Mastery'),
    ('trees-8',      'Broad Front',           'Reach 8 different skill trees.',                   'trees',       8,     2, 'Mastery'),
    ('trees-15',     'Wide Curriculum',       'Reach 15 different skill trees.',                  'trees',       15,    3, 'Mastery'),
    ('trees-25',     'Whole Shelf',           'Reach 25 different skill trees.',                  'trees',       25,    4, 'Mastery'),
    ('trees-40',     'Cartography',           'Reach 40 different skill trees.',                  'trees',       40,    5, 'Mastery'),

    # How far into the single best one.
    ('tree-10',      'First Steps Up',        'Get a tenth of the way into a skill tree.',        'tree_best',   10,    1, 'Mastery'),
    ('tree-25',      'Foot in the Door',      'Get a quarter of the way into a skill tree.',      'tree_best',   25,    1, 'Mastery'),
    ('tree-50',      'Halfway Up',            'Get halfway into a skill tree.',                   'tree_best',   50,    2, 'Mastery'),
    ('tree-75',      'Three Quarters',        'Get three quarters of the way into a skill tree.', 'tree_best',   75,    3, 'Mastery'),
    ('tree-90',      'Near the Summit',       'Get 90% of the way into a skill tree.',            'tree_best',   90,    4, 'Mastery'),
    ('tree-100',     'Topped Out',            'Cover a whole skill tree.',                        'tree_best',   100,   4, 'Mastery'),

    # How many got past half.
    ('deep-trees-1', 'Depth',                 'Get halfway into 1 skill tree.',                   'trees_deep',  1,     2, 'Mastery'),
    ('deep-trees-2', 'Two Deep',              'Get halfway into 2 skill trees.',                  'trees_deep',  2,     2, 'Mastery'),
    ('deep-trees-3', 'Three Deep',            'Get halfway into 3 skill trees.',                  'trees_deep',  3,     3, 'Mastery'),
    ('deep-trees-6', 'Specialist',            'Get halfway into 6 skill trees.',                  'trees_deep',  6,     4, 'Mastery'),
    ('deep-trees-10', 'Many Mountains',       'Get halfway into 10 skill trees.',                 'trees_deep',  10,    5, 'Mastery'),
    ('deep-trees-15', 'A Range of Peaks',     'Get halfway into 15 skill trees.',                 'trees_deep',  15,    5, 'Mastery'),

    # How many were covered outright.
    ('trees-done-1', 'Summit',                'Cover a whole skill tree.',                        'trees_done',  1,     3, 'Mastery'),
    ('trees-done-2', 'Two Summits',           'Cover 2 whole skill trees.',                       'trees_done',  2,     4, 'Mastery'),
    ('trees-done-5', 'Five Summits',          'Cover 5 whole skill trees.',                       'trees_done',  5,     5, 'Mastery'),
    ('trees-done-10', 'The Whole Range',      'Cover 10 whole skill trees.',                      'trees_done',  10,    5, 'Mastery'),

    # How many different fields they sit in.
    ('tgroup-2',     'Two Fields',            'Reach skill trees in 2 different fields.',         'tree_groups', 2,     1, 'Mastery'),
    ('tgroup-4',     'Four Fields',           'Reach skill trees in 4 different fields.',         'tree_groups', 4,     2, 'Mastery'),
    ('tgroup-6',     'Six Fields',            'Reach skill trees in 6 different fields.',         'tree_groups', 6,     3, 'Mastery'),
    ('tgroup-9',     'Every Field',           'Reach skill trees in all 9 fields.',               'tree_groups', 9,     5, 'Mastery'),

    # And the total, which keeps going after every one of the above has capped.
    ('treexp-1',     'A Tree’s Worth',        'Do a whole skill tree’s worth of work.',           'tree_xp',     1,     2, 'Mastery'),
    ('treexp-3',     'Three Trees’ Worth',    'Do 3 skill trees’ worth of work.',                 'tree_xp',     3,     3, 'Mastery'),
    ('treexp-8',     'Eight Trees’ Worth',    'Do 8 skill trees’ worth of work.',                 'tree_xp',     8,     4, 'Mastery'),
    ('treexp-20',    'Twenty Trees’ Worth',   'Do 20 skill trees’ worth of work.',                'tree_xp',     20,    5, 'Mastery'),

    # ---- Milestones: the numbers the app counts in ----------------------
    ('xp-1000',      'Getting Going',         'Earn 1,000 XP.',                                   'xp',          1000,  1, 'Milestones'),
    ('xp-5000',      'Five Thousand',         'Earn 5,000 XP.',                                   'xp',          5000,  1, 'Milestones'),
    ('xp-10000',     'Ten Thousand',          'Earn 10,000 XP.',                                  'xp',          10000, 2, 'Milestones'),
    ('xp-25000',     'Twenty-Five K',         'Earn 25,000 XP.',                                  'xp',          25000, 2, 'Milestones'),
    ('xp-50000',     'Fifty Thousand',        'Earn 50,000 XP.',                                  'xp',          50000, 3, 'Milestones'),
    ('xp-100000',    'Six Figures',           'Earn 100,000 XP.',                                 'xp',        100000,  4, 'Milestones'),
    ('xp-250000',    'Quarter Million',       'Earn 250,000 XP.',                                 'xp',        250000,  5, 'Milestones'),
    ('xp-500000',    'Half a Million',        'Earn 500,000 XP.',                                 'xp',        500000,  5, 'Milestones'),
    ('level-5',      'Level Five',            'Reach level 5.',                                   'level',       5,     1, 'Milestones'),
    ('level-10',     'Level Ten',             'Reach level 10.',                                  'level',       10,    1, 'Milestones'),
    ('level-25',     'Ascending',             'Reach level 25.',                                  'level',       25,    2, 'Milestones'),
    ('level-50',     'Halfway to a Hundred',  'Reach level 50.',                                  'level',       50,    3, 'Milestones'),
    ('level-75',     'Seventy-Five',          'Reach level 75.',                                  'level',       75,    4, 'Milestones'),
    ('level-100',    'Centurion',             'Reach level 100.',                                 'level',       100,   4, 'Milestones'),
    ('level-150',    'Beyond',                'Reach level 150.',                                 'level',       150,   5, 'Milestones'),
    ('dayxp-500',    'Big Day',               'Earn 500 XP in a single day.',                     'day_xp',      500,   1, 'Milestones'),
    ('dayxp-1500',   'Huge Day',              'Earn 1,500 XP in a single day.',                   'day_xp',      1500,  3, 'Milestones'),
    ('dayxp-3000',   'Record Day',            'Earn 3,000 XP in a single day.',                   'day_xp',      3000,  4, 'Milestones'),
    ('goal-1',       'Goal Getter',           'Finish a goal.',                                   'goals',       1,     1, 'Milestones'),
    ('goal-5',       'Five Reached',          'Finish 5 goals.',                                  'goals',       5,     2, 'Milestones'),
    ('goal-15',      'Goal Machine',          'Finish 15 goals.',                                 'goals',       15,    3, 'Milestones'),
    ('goal-30',      'Thirty Down',           'Finish 30 goals.',                                 'goals',       30,    4, 'Milestones'),
    ('goal-50',      'Finisher',              'Finish 50 goals.',                                 'goals',       50,    5, 'Milestones'),
    ('rec-1',        'On the Board',          'Log your first personal record.',                  'records',     1,     1, 'Milestones'),
    ('rec-10',       'Record Keeper',         'Log 10 personal records.',                         'records',     10,    2, 'Milestones'),
    ('rec-25',       'Statistician',          'Log 25 personal records.',                         'records',     25,    3, 'Milestones'),
    ('rec-50',       'Your Own Worst Rival',  'Log 50 personal records.',                         'records',     50,    4, 'Milestones'),

    # ---- Analytics: not how much, but how well it scored -----------------
    #
    # Every threshold here is on a figure `analytics.ratings` publishes — see
    # the module note. Nothing is recounted, so a badge asking for 80%
    # consistency is asking for the number printed on the analytics page, and
    # the reader can open the working behind it.
    #
    # The grade ladders stop at 90 rather than at 100. A metric's score is a
    # blend, and the top of several of them is only reachable in a window where
    # nothing went wrong at all; a badge nobody can earn is a badge that makes
    # the wall feel rigged rather than hard. The S grade is the one exception,
    # and it is deliberately the single hardest visible badge on the wall.
    ('score-40',     'Graded',                'Reach a Growth Score of 40.',                      'growth_score', 40,   1, 'Analytics'),
    ('score-60',     'Passing Grade',         'Reach a Growth Score of 60.',                      'growth_score', 60,   2, 'Analytics'),
    ('score-75',     'Solid Record',          'Reach a Growth Score of 75.',                      'growth_score', 75,   3, 'Analytics'),
    ('score-85',     'Straight B',            'Reach a Growth Score of 85.',                      'growth_score', 85,   4, 'Analytics'),
    ('score-90',     'Top of the Class',      'Reach a Growth Score of 90.',                      'growth_score', 90,   5, 'Analytics'),
    ('prod-70',      'Productive',            'Score 70 on productivity.',                        'productivity_score', 70, 2, 'Analytics'),
    ('prod-90',      'Prolific',              'Score 90 on productivity.',                        'productivity_score', 90, 4, 'Analytics'),
    ('qual-70',      'Good Work',             'Score 70 on quality.',                             'quality_score', 70,  2, 'Analytics'),
    ('qual-90',      'Excellent Work',        'Score 90 on quality.',                             'quality_score', 90,  4, 'Analytics'),
    ('cons-70',      'Reliable',              'Score 70 on consistency.',                         'consistency_score', 70, 2, 'Analytics'),
    ('cons-90',      'Metronome',             'Score 90 on consistency.',                         'consistency_score', 90, 4, 'Analytics'),
    ('eff-70',       'Efficient',             'Score 70 on efficiency.',                          'efficiency_score', 70, 2, 'Analytics'),
    ('eff-90',       'Sharp',                 'Score 90 on efficiency.',                          'efficiency_score', 90, 4, 'Analytics'),
    ('foc-70',       'Focused',               'Score 70 on focus.',                               'focus_score',  70,   2, 'Analytics'),
    ('foc-90',       'Locked In',             'Score 90 on focus.',                               'focus_score',  90,   4, 'Analytics'),
    ('rate-50',      'Half the Days',         'Show up on 50% of your days.',                     'consistency_rate', 50, 1, 'Analytics'),
    ('rate-75',      'Most Days',             'Show up on 75% of your days.',                     'consistency_rate', 75, 3, 'Analytics'),
    ('rate-90',      'Nearly Every Day',      'Show up on 90% of your days.',                     'consistency_rate', 90, 5, 'Analytics'),
    ('ontime-75',    'Punctual',              'Meet 75% of your deadlines.',                      'on_time',      75,   2, 'Analytics'),
    ('ontime-90',    'Dependable',            'Meet 90% of your deadlines.',                      'on_time',      90,   4, 'Analytics'),
    ('rated-25',     'Marking Your Work',     'Rate 25 finished tasks.',                          'rated',        25,   1, 'Analytics'),
    ('rated-100',    'Honest Record',         'Rate 100 finished tasks.',                         'rated',        100,  2, 'Analytics'),
    ('rated-500',    'Nothing Unexamined',    'Rate 500 finished tasks.',                         'rated',        500,  4, 'Analytics'),


    # ---- Special: the odd ones, and the five nobody is told about -------
    ('night-10',     'Night Owl',             'Finish 10 tasks between midnight and 4am.',        'night',       10,    2, 'Special'),
    ('dayxp-5000',   'Once in a Lifetime',    'Earn 5,000 XP in a single day.',                   'day_xp',      5000,  5, 'Special'),
    ('deep-14',      'Fourteen Hours',        'Focus for 14 hours in a single day.',              'focus_best',  14,    5, 'Special'),
)

#: The five nobody is told about until they have them, as
#: (id, name, description, metric, threshold, title).
#:
#: All Legendary, all Special, and all far past the end of the visible ladder on
#: their own metric — the visible streak badge stops at 365 and this one wants
#: 500; the visible focus badge stops at 1,000 hours and this one wants ten
#: thousand. That gap is the point: a hidden badge a reader could stumble into
#: while chasing a visible one is not hidden, it is just unlabelled.
#:
#: `Ascended` is last because it is the hardest: level 250 is 3,112,500 XP on a
#: ladder where level N costs N x 100. It is the only badge that carries a
#: title, and the title is the reason it exists.
HIDDEN = (
    ('hidden-nocturne',  'Nocturne',           'Finish 100 tasks between midnight and 4am.', 'night',    100,   None),
    ('hidden-polymath',  'Polymath',           'Finish tasks in 40 different subjects.',     'subjects', 40,    None),
    ('hidden-iron-will', 'Iron Will',          'Hold a 500-day streak.',                     'streak',   500,   None),
    ('hidden-10k-hours', 'Ten Thousand Hours', 'Log 10,000 hours of focus.',                 'focus',    10000, None),
    ('hidden-cartographer', 'Cartographer',    'Reach 45 different skill trees.',             'trees',    45,    None),
    ('hidden-ascended',  'Ascended',           'Reach level 250.',                           'level',    250,   'Ascended'),
)

#: The nine read off the analytics report card rather than counted here.
#:
#: Named as a set because two things need to know which they are: `_graded`,
#: which zeroes all of them for an account too new to score, and `_signature`,
#: which has to include something that moves when a *grade* moves rather than
#: only when a count does.
GRADED_METRICS = (
    'growth_score', 'productivity_score', 'quality_score', 'consistency_score',
    'efficiency_score', 'focus_score', 'consistency_rate', 'on_time', 'rated',
)

#: What each metric is called on the page, so a locked badge can say "412 / 500
#: tasks" without the client holding a second copy of this list.
METRIC_LABELS = {
    'tasks': 'tasks',
    'priority': 'tasks',
    'day_tasks': 'in a day',
    'events': 'events',
    'xp': 'XP',
    'day_xp': 'in a day',
    'streak': 'days',
    'active_days': 'days',
    'perfect_days': 'days',
    'early': 'tasks',
    'weekend': 'tasks',
    'night': 'tasks',
    'months': 'months',
    'level': 'level',
    'focus': 'hours',
    'focus_days': 'days',
    'focus_best': 'hours',
    'subjects': 'subjects',
    'trees': 'trees',
    'trees_deep': 'trees',
    'trees_done': 'trees',
    'tree_best': '% of a tree',
    'tree_groups': 'fields',
    'tree_xp': "trees' worth",
    # The graded half. A score is out of 100 and a rate is a percentage, and
    # the unit says so rather than leaving "68 / 90" to be read as a count of
    # something.
    'growth_score': '/ 100',
    'productivity_score': '/ 100',
    'quality_score': '/ 100',
    'consistency_score': '/ 100',
    'efficiency_score': '/ 100',
    'focus_score': '/ 100',
    'consistency_rate': '% of days',
    'on_time': '% on time',
    'rated': 'rated',
    'notes': 'notes',
    'goals': 'goals',
    'records': 'records',
}


def _rows():
    """The whole catalogue as uniform dicts, visible ones first.

    Two literals above rather than one because a hidden badge is a different
    kind of entry — it has no category to choose and no tier to weigh up, being
    always Special and always Legendary — and giving them one shape here means
    nothing downstream has to know there were two.
    """
    out = []
    for badge_id, name, description, metric, threshold, tier, category in CATALOGUE:
        out.append({
            'id': badge_id, 'name': name, 'description': description,
            'metric': metric, 'threshold': threshold, 'tier': tier,
            'category': category, 'xp_reward': TIER_XP[tier],
            'hidden': False, 'title': None,
        })
    for badge_id, name, description, metric, threshold, title in HIDDEN:
        out.append({
            'id': badge_id, 'name': name, 'description': description,
            'metric': metric, 'threshold': threshold, 'tier': 5,
            'category': 'Special',
            # Worth more than any visible badge, and the title-bearer worth ten
            # times a Legendary. The score is a weighing of a wall; a wall with
            # Ascended on it is not the same wall.
            'xp_reward': 5000 if title else 1000,
            'hidden': True, 'title': title,
        })
    return out


ALL = _rows()


def _row_for(badge):
    """One catalogue entry in the table's shape."""
    return {
        'id': badge['id'], 'name': badge['name'],
        'description': badge['description'], 'icon': None,
        'metric': badge['metric'], 'threshold': badge['threshold'],
        'tier': badge['tier'], 'category': badge['category'],
        'xp_reward': badge['xp_reward'], 'hidden': 1 if badge['hidden'] else 0,
        'title': badge['title'],
    }


def _sync_catalogue():
    """Make the table say what the catalogue says. Never deletes.

    Inserts what is missing **and rewrites what has changed**. Insert-only was
    not enough once a badge could be renamed: sixteen ids in this catalogue were
    in the table already under earlier names and thresholds, and a table holding
    "Fifty in" for a badge the page calls "Half a Hundred" makes the claim at
    the top of this module — that a reader querying the database sees the same
    badges — false.

    A badge removed from the catalogue keeps its row and anybody's earning of
    it, because deleting it would cascade `user_achievements` and take
    somebody's history with it. An obsolete row simply stops being returned.
    That is the one direction this does not sync, and it is deliberate.

    ## Only what changed

    The catalogue changes when a release changes it and at no other time, so on
    all but the first read after a deploy this writes nothing at all. That was
    the intent before, and it did not hold: it merged each row with the
    catalogue's version and asked whether the merge differed, and the merge
    always differed. `_row_for` states `icon` and `title` as None where the
    stored row, read back, simply has no such key — `read_table` leaves a NULL
    column out rather than setting it to None, which the note at the top of
    connection.py says in as many words. `{**row, 'icon': None} != row` however
    equal the two rows are, so `changed` was True every time and every read of
    the page deleted 158 catalogue rows and reinserted them.

    Comparing field by field instead is what fixes it — `row.get(name)` is None
    for a missing key and for a stored NULL alike, which is the comparison that
    was wanted. The writes are `insert_row` and `update_row` rather than a
    whole-table rewrite, so a badge whose name changed costs one UPDATE of one
    row instead of a DELETE of the catalogue.
    """
    held = {row['id']: row for row in db.read_table('achievements') if row.get('id')}

    for badge in ALL:
        fresh = _row_for(badge)
        row = held.get(badge['id'])
        if row is None:
            db.insert_row('achievements', fresh)
            continue
        # A stored BOOLEAN reads back as True where `_row_for` states 1, and
        # `True == 1` in Python, so the plain comparison is the right one here
        # as well as the cheap one.
        changes = {name: value for name, value in fresh.items()
                   if name != 'id' and row.get(name) != value}
        if changes:
            db.update_row('achievements', badge['id'], changes)


def _hour_and_day(stamp):
    """The hour and weekday of a completion timestamp, or (None, None).

    Rows written before the app recorded a time, and rows written by an import,
    carry a date with no clock on it. Those cannot answer "before 8am" and are
    left out of the badges that ask rather than counted as midnight — which
    would hand every one of them to Night Owl.
    """
    text = str(stamp or '')
    if len(text) < 16:
        return None, None
    try:
        when = datetime.fromisoformat(text.replace('Z', '+00:00'))
    except ValueError:
        return None, None
    return when.hour, when.weekday()


def _tree_standing(done):
    """How far into each skill tree the account's finished work has actually got.

    ## Why this is computed and not read

    A tree's nodes carry a `state` and a `percent`, and neither is evidence
    about anybody: they are authored illustration, the same on every account —
    see the note in frontend/src/skills/subjectTrees.ts. A badge counted on
    them would be earned by everyone the moment they signed up, which is not a
    badge, it is a decoration.

    What *is* per-account is the XP filed under the subjects that route to a
    tree. So a tree's standing is the account's own XP in it against what the
    lattice is worth, and every figure underneath is a re-reading of the task
    rows — the same rule the rest of this module follows.

    ## Capped at 100

    A subject can be worked past what its lattice covers: Alpha's mathematics
    is twice the Mathematics tree. Uncapped, "get halfway into 3 trees" would
    be reachable by grinding one subject until the arithmetic said 300%, which
    is the opposite of what the badge is for. Covering a tree is covering it.

    ## The six figures, and why breadth is counted twice

    `reached` and `groups` are both breadth and they are not the same breadth.
    Five languages open one lattice, so `reached` already refuses to call that
    five subjects — but Spanish, French and Japanese are still one *field*, and
    a reader who has opened eight lattices inside Computing has not gone wide.
    `groups` is the catalogue's own nine headings (backend/config/subjects.py),
    which is the coarsest honest answer to "how many different things is this
    person doing".

    `total` is the one figure that keeps moving after a tree is capped: every
    lattice's own capped share, added up and divided by 100, so it reads as
    whole trees' worth of work. A reader who has topped out four trees and is
    a third into a fifth is at 4.3 and the badge ladder above has somewhere
    left to go.

    Returns (trees reached, best percent, trees at or past half, trees
    covered, fields reached, whole trees' worth).
    """
    earned = {}
    groups = set()
    for row in done:
        subject = (row.get('subject') or '').strip()
        tree = tree_for(subject)
        if tree is None:
            continue
        earned[tree] = earned.get(tree, 0) + float(row.get('xp_value') or 0)
        group = (SUBJECTS.get(subject) or {}).get('group')
        if group:
            groups.add(group)

    shares = []
    for tree, xp in earned.items():
        worth = SKILL_TREES.get(tree, ('', 0))[1]
        if worth > 0:
            shares.append(min(100, int(xp / worth * 100)))

    return (
        len(earned),
        max(shares, default=0),
        sum(1 for s in shares if s >= 50),
        sum(1 for s in shares if s >= 100),
        len(groups),
        int(sum(shares) // 100),
    )


def _graded(username, tasks=None, events=None, focus_history=None):
    """The nine figures that come off the analytics report card.

    Read through `analytics.ratings` rather than recounted here, which is the
    whole point of them — see "The graded metrics" in the module note.

    `record=False` because reading the card normally files a dated snapshot per
    metric (backend/tracking/analytics.py), and this is not a reader looking at
    their report card. Letting the badge check write snapshots would put a row
    in the history for every notification sweep, which would turn the analytics
    page's own history chart into a record of how often the bell was polled.

    An account too new to be scored gets zeros. That is the honest answer and
    not a failure: every badge on these metrics is then simply unearned, which
    is what an unscored account should see.
    """
    # The rows come from `_figures`, which has already read them; see the note
    # there. `ratings` reads them itself when they are not handed over, so the
    # other caller of this function is unaffected.
    card = analytics_tracking.ratings(username, record=False, tasks=tasks,
                                      events=events, focus_history=focus_history)
    if not card:
        return dict.fromkeys(GRADED_METRICS, 0)

    metrics = card.get('metrics') or {}

    def score(name):
        return int(round(float((metrics.get(name) or {}).get('score') or 0)))

    quality = metrics.get('quality') or {}
    consistency = metrics.get('consistency') or {}
    efficiency = metrics.get('efficiency') or {}
    return {
        'growth_score': int(round(float((card.get('overall') or {}).get('score') or 0))),
        'productivity_score': score('productivity'),
        'quality_score': score('quality'),
        'consistency_score': score('consistency'),
        'efficiency_score': score('efficiency'),
        'focus_score': score('focus'),
        'consistency_rate': int(round(float(consistency.get('rate') or 0))),
        'on_time': int(round(float(efficiency.get('on_time_pct') or 0))),
        'rated': int(quality.get('rated_tasks') or 0),
    }


#: The task columns every badge is counted off, plus the ones the report card
#: scores on. See `_figures`, which reads them once and hands the rows to both.
TASK_FIELDS = tuple(dict.fromkeys(
    ('status', 'completed_at', 'priority', 'subject', 'xp_value')
    + analytics_tracking.SCORED_TASK_FIELDS))

#: The ledger columns, from the same place: `_figures` reads the amount and
#: the day, and the card's trends read the task count, which is exactly
#: SCORED_LEDGER_FIELDS. Named rather than re-listed, because two lists of the
#: same four columns is one list that stops being the same.
LEDGER_FIELDS = analytics_tracking.SCORED_LEDGER_FIELDS


def _figures(username, user):
    """The account's current value for every metric a badge is measured on.

    One pass over each table, plus one read of the analytics report card.
    Everything is counted off what the app already stores — see the module note
    — so a figure here is always a re-reading of the record rather than a
    number this endpoint keeps.

    ## Read once, counted twice

    Named columns rather than every column, and one read rather than two. This
    used to be `db.tasks_for`, which is `SELECT *` — seventeen fields per row
    including `description`, unbounded free text that no badge is measured on —
    and then `_graded` asked for the report card, which read every task, the
    whole ledger and the focus history all over again to score them. On the
    largest account here that was the same 20,539 rows twice, at 20.8 MB and
    33.5 MB, inside one request for a page of badge counts.

    So the three sources are read here, narrowed to TASK_FIELDS and
    LEDGER_FIELDS, and handed to `_graded` for the card. Nothing is recounted
    off them that the card counts — the nine graded figures are still the
    card's, which is the rule the module note sets out. What is shared is the
    rows, not the arithmetic.
    """
    mine = db.columns_for('tasks', username, TASK_FIELDS)
    events = db.columns_for('xp_events', username, LEDGER_FIELDS)
    focus_history = focus_tracking.history_for(username)
    done = [row for row in mine if row.get('status') == 'done']
    (trees, tree_best, trees_deep,
     trees_done, tree_groups, tree_xp) = _tree_standing(done)

    per_day = {}
    early = night = weekend = priority = 0
    subjects = set()
    months = set()
    for row in done:
        stamp = row.get('completed_at') or ''
        day = str(stamp)[:10]
        if day:
            per_day[day] = per_day.get(day, 0) + 1
            months.add(day[:7])
        if (row.get('priority') or '') == 'high':
            priority += 1
        subject = (row.get('subject') or '').strip()
        if subject:
            subjects.add(subject)
        hour, weekday = _hour_and_day(stamp)
        if hour is not None:
            if hour < 8:
                early += 1
            if hour < 4:
                night += 1
            if weekday >= 5:
                weekend += 1

    # `history_for` rather than the raw rows: it is one row per day already,
    # and its `_seconds` is the coercion every other focus reader goes through.
    focus_days_seconds = [record['seconds'] for record in focus_history.values()]
    focus_seconds = sum(focus_days_seconds)
    focus_best = max(focus_days_seconds, default=0)
    # A day counts as hit only where a goal was actually set on it. `goal_hours`
    # defaults to 2 in the schema, so a zero means somebody turned the goal off
    # rather than met one of nothing.
    perfect = sum(
        1 for record in focus_history.values()
        if record['goal_hours'] > 0
        and record['seconds'] >= record['goal_hours'] * 3600
    )

    xp_per_day = {}
    for event in events:
        day = event_day(event)
        if day:
            xp_per_day[day] = xp_per_day.get(day, 0) + float(event.get('amount') or 0)

    # Days with work on them, for the "Do work on N separate days" badges. Any
    # one of the three counts: a finished task, a logged focus session, or any
    # XP. `per_day` alone is finished tasks, which quietly told somebody whose
    # habit is the focus timer that they had never worked a day — see
    # frontend/src/utils/activeDay.ts, which is the same rule on the client and
    # is what the analytics gates read.
    worked_days = set(per_day)
    worked_days |= {day for day, amount in xp_per_day.items() if amount > 0}
    worked_days |= {day[:10] for day, record in focus_history.items()
                    if record['seconds'] > 0}

    return {
        # Counted off the record rather than read from `users.tasks_completed`.
        #
        # That column is a running total the app keeps, and it does not come
        # back down when a finished task is deleted — on the largest account in
        # this database it says 18,638 where the rows say 18,331. Every other
        # surface that counts finished work counts the rows (the analytics page
        # among them), so reading the column here made the badge ladder the one
        # place in the app with a different idea of how much had been done, and
        # handed out "Finish 2,500 tasks" three hundred tasks early.
        'tasks': len(done),
        'priority': priority,
        'day_tasks': max(per_day.values(), default=0),
        'events': sum(
            1 for row in db.rows_for('calendar_events', username)
            if row.get('completed')
        ),
        'xp': int(user.get('xp') or 0),
        'day_xp': int(max(xp_per_day.values(), default=0)),
        # The best streak, not the current one: a badge is a thing that
        # happened, and reading `current_streak` would un-earn it every time a
        # day was missed.
        'streak': int(user.get('best_streak') or 0),
        'active_days': len(worked_days),
        'perfect_days': perfect,
        'early': early,
        'weekend': weekend,
        'night': night,
        'months': len(months),
        'level': int(user.get('level') or 1),
        'focus': int(focus_seconds // 3600),
        'focus_days': sum(1 for seconds in focus_days_seconds if seconds > 0),
        'focus_best': int(focus_best // 3600),
        'subjects': len(subjects),
        'trees': trees,
        'tree_best': tree_best,
        'trees_deep': trees_deep,
        'trees_done': trees_done,
        'tree_groups': tree_groups,
        'tree_xp': tree_xp,
        'notes': len(db.rows_for('notes', username)),
        'goals': sum(
            1 for row in db.rows_for('goals', username)
            if row.get('status') == 'completed'
        ),
        'records': len(db.rows_for('records', username)),
        **_graded(username, tasks=mine, events=events, focus_history=focus_history),
    }


def _record_earned(username, earned_ids):
    """Write a row for anything newly earned, and return every earned date.

    Inserts only what is new. It used to read every row in the table — every
    account's — and rewrite all of them to add one, which on a first visit to
    the page meant a full rewrite per badge the account had ever earned.
    """
    mine = {
        row.get('achievement_id'): row.get('earned_at')
        for row in db.rows_for('user_achievements', username)
    }
    now = datetime.now().isoformat(timespec='seconds')
    for badge_id in earned_ids:
        if badge_id in mine:
            continue
        db.insert_row('user_achievements', {
            'user_id': username, 'achievement_id': badge_id, 'earned_at': now})
        mine[badge_id] = now
    return mine


# --------------------------------------------------------------------------
# Earning, off the page
# --------------------------------------------------------------------------
#: Where the last-evaluated signature is kept, per account.
#:
#: `user_settings` is a plain key/value table and `get_settings` only ever
#: returns keys listed in FIELDS (backend/api/settings.py), so an internal key
#: stored here is invisible to the settings page rather than merely unlisted on
#: it. That is why this is not a new column: the row already has a home.
SIGNATURE_KEY = 'achievements_seen'


def _signature(username):
    """What the badges were last worked out against.

    Three parts, and each is there for a failure the other two do not catch.

    `db.badge_signature` is the record — every count a badge could be earned
    off, in one cheap query.

    The **day** is in it because nine of the metrics are grades, and a grade
    moves with the calendar as well as with the work: the report card is scored
    over a rolling ninety days, so a bad stretch ageing out of the window can
    lift a score with nothing new happening. Without the day those nine badges
    would only ever be noticed on a day something else also moved.

    The **catalogue size** is in it because adding a badge has to re-open the
    question for accounts that already cleared its threshold. Without it,
    everything added above would stay unearned on every existing account until
    that account happened to finish a task.
    """
    return '{}|{}|{}'.format(
        db.badge_signature(username), datetime.now().date().isoformat(), len(ALL))


def check_earned(username, user, force=False):
    """Work out what this account has earned, and write down anything new.

    Returns `(figures, newly earned)`. The sweep turns the second half into
    sentences and throws the first away; the page wants both, which is why they
    come back together — working the figures out is the expensive half and the
    page would otherwise pay for it twice.

    `figures` is None when the guard skipped the work, which is the one case a
    caller must not read it: nothing was computed, and the honest answer to
    "what are this account's figures" is that this call did not ask.

    ## Why this is not only called by the page

    It used to be. `list_achievements` was the only thing that ever wrote a row
    to `user_achievements`, which meant a badge was not earned when you earned
    it — it was earned when you next went and *looked at the wall*. The bell
    already knew how to announce one (`_progress_candidates` in
    backend/tracking/notify.py reads that table), so the notification was real
    and arrived in the wrong order: finish the task, hear nothing, open
    Achievements a week later, and only then be told.

    So the sweep calls this too, and the badge is announced within the minute
    — or within the second, because the client re-reads notifications on the
    same `summit:stats-changed` event a completion fires.

    ## The guard

    Working this out is a pass over every task the account owns plus a reading
    of the report card: ~400ms on the largest account here. The sweep runs on a
    sixty-second poll *and* on every completion, so paying that each time would
    have made finishing twelve tasks four seconds of server work for an answer
    that did not change.

    `force` is what the page passes. A reader looking at the wall gets the
    figures worked out whatever the signature says, because the page prints
    them all and not just the earned ones — the guard is about whether anything
    could have been *earned*, which is a narrower question than the one the
    page is asking.
    """
    if not force:
        seen = db.user_setting(username, SIGNATURE_KEY)
        if seen == _signature(username):
            return None, []

    # Before any row is written, because `user_achievements.achievement_id`
    # references the catalogue table and a badge added to `CATALOGUE` in this
    # release has no row there yet. The page reached this by calling it first;
    # a sweep is now the other way in, and the foreign key does not care which.
    _sync_catalogue()

    figures = _figures(username, user)
    earned_ids = [
        badge['id'] for badge in ALL
        if figures.get(badge['metric'], 0) >= badge['threshold']
    ]
    before = {row.get('achievement_id') for row in db.rows_for('user_achievements', username)}
    _record_earned(username, earned_ids)

    # Written after the work, not before: a signature stored ahead of a read
    # that then failed would say the badges are up to date when they are not.
    db.set_user_setting(username, SIGNATURE_KEY, _signature(username))
    fresh = [badge for badge in ALL if badge['id'] in set(earned_ids) - before]
    return figures, fresh


@router.get('/api/achievements')
def list_achievements(username: str = Depends(current_username)):
    name = (username or '').strip()
    _, user = load_user(name)
    if not user:
        return fail('Account not found')

    # `force`, because this page prints every badge's progress and not only
    # what is earned — see the note on `check_earned`. It writes the rows and
    # updates the signature, so the sweep that runs a second later finds
    # nothing left to do.
    figures, _fresh = check_earned(name, user, force=True)
    dates = {
        row.get('achievement_id'): row.get('earned_at')
        for row in db.rows_for('user_achievements', name)
    }

    badges = []
    for badge in ALL:
        value = figures.get(badge['metric'], 0)
        earned = badge['id'] in dates
        # A locked hidden badge sends nothing that describes it. Its name, its
        # description and its threshold are all withheld, and so is progress:
        # "412 / 10,000 hours" names it in everything but the string.
        secret = badge['hidden'] and not earned
        badges.append({
            'id': badge['id'],
            'name': '???' if secret else badge['name'],
            'description': (
                'A hidden achievement. Keep going.' if secret else badge['description']
            ),
            'metric': '' if secret else badge['metric'],
            'unit': '' if secret else METRIC_LABELS.get(badge['metric'], ''),
            'threshold': 0 if secret else badge['threshold'],
            'value': 0 if secret else min(value, badge['threshold']),
            'earned': earned,
            'earned_at': dates.get(badge['id']),
            'tier': badge['tier'],
            'tier_label': TIER_LABELS[badge['tier']],
            'category': badge['category'],
            'xp_reward': badge['xp_reward'],
            'hidden': badge['hidden'],
            'title': badge['title'] if earned else None,
        })

    # The category band. Counted here rather than on the page so the page has
    # one fewer thing that could disagree with the list under it.
    categories = [
        {
            'name': category,
            'earned': sum(1 for b in badges if b['category'] == category and b['earned']),
            'total': sum(1 for b in badges if b['category'] == category),
        }
        for category in CATEGORIES
    ]

    progress = level_for_total_xp(figures['xp'])
    return ok(
        achievements=badges,
        # Counted over the wall that is being sent, not over the rows in the
        # table. `user_achievements` never deletes — see `_sync_catalogue` — so
        # it still holds a row for every badge this account earned under an id
        # the catalogue has since dropped or renamed, and `len(dates)` counts
        # those. That put "71 Achievements Earned" above a wall with 68 on it,
        # and made the ring, the category bars and the achievement score three
        # different answers to one question.
        earned=sum(1 for b in badges if b['earned']),
        total=len(badges),
        figures=figures,
        categories=categories,
        # The sum of what has been earned, and never added to the account —
        # see the module note. `total_xp` is what a perfect wall would score,
        # which is what makes the earned figure mean anything.
        achievement_xp=sum(b['xp_reward'] for b in badges if b['earned']),
        total_xp=sum(b['xp_reward'] for b in badges),
        streak=int(user.get('current_streak') or 0),
        level=progress['level'],
        xp_to_next=max(0, progress['xp_required'] - progress['xp_in_level']),
        # The title the account has earned the right to call itself, or none.
        # Exactly one badge in the catalogue confers one.
        title=next((b['title'] for b in badges if b['title']), None),
    )

"""scripts/seed_alpha.py — the timetable, and the invariants it must not break.

This one writes into a live account rather than building a fixture, so what is
worth pinning is not the shape of the week — that is a timetable, and it will
change when the timetable does — but the three things that would quietly
corrupt an account if they slipped:

  * it writes inside its own id window, and seed_year's is a different one;
  * `users.xp` is the ledger's sum, never a number set beside it;
  * the tables it cannot mark by id are deleted by a *bounded* range.

The last one is here because it was wrong. `clear` removed focus days and
report cards from the start of the year it writes *onwards*, with no upper
bound, which took the account's real focus history and every report card the
app had recorded since along with it.
"""
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))), 'scripts'))

import seed_alpha  # noqa: E402
import seed_year  # noqa: E402
from backend.config.subjects import BY_ID  # noqa: E402
from backend.tracking.xp import level_for_total_xp  # noqa: E402


def test_the_two_seeders_cannot_write_over_each_other():
    """Both draw on the same calendar, so both reserve their own ids."""
    assert seed_alpha.ID_LOW > int(seed_year.SEED_ID_HIGH)
    assert len(str(seed_alpha.ID_LOW)) == len(str(seed_alpha.ID_HIGH)) == 13


def test_the_id_blocks_inside_the_window_do_not_meet():
    """Tasks and ledger rows share the window and must not share an id."""
    assert seed_alpha.TASK_BASE < seed_alpha.EVENT_BASE
    # 20 billion apart: a year is a few thousand rows, so neither can reach
    # the other even if the week grew by orders of magnitude.
    assert seed_alpha.EVENT_BASE - seed_alpha.TASK_BASE >= 20_000_000_000
    assert seed_alpha.EVENT_BASE + 10_000_000 + 5_000 <= seed_alpha.ID_HIGH


def test_every_subject_on_the_timetable_is_a_real_subject():
    """A subject the catalogue does not know is a task filed under nothing —
    it drops out of the subject split and the skill trees without erroring."""
    named = (
        [row[2] for row in seed_alpha.WEEK]
        + [row[1] for row in seed_alpha.EVENING]
        + [row[1] for row in seed_alpha.WEEKEND]
    )
    unknown = sorted({s for s in named if s not in BY_ID})
    assert unknown == [], unknown


def test_the_timetable_is_the_one_that_was_asked_for():
    """The week, read back as (day, title, start, end). If the timetable
    changes this is the line to change, and changing it should be deliberate.

    Alpha is a machine-learning and mathematics double major on a PhD track:
    the lectures and sections of two majors, the research the doctorate is made
    of, and — timetabled just as firmly — the violin, the training, the meals
    with other people and the mornings that start in cold water."""
    week = {(d, title, begin, end)
            for d, title, _s, begin, end, _x, _study in seed_alpha.WEEK}
    for day in range(5):
        assert (day, 'Morning meditation', '06:45', '07:10') in week
        assert (day, 'Evening review', '22:00', '22:20') in week
    for day in (0, 2, 4):
        assert (day, 'Math 55 lecture', '09:00', '10:30') in week
        assert (day, 'Lift', '07:30', '08:30') in week
    for day in (1, 3):
        assert (day, 'Algorithms lecture', '10:30', '12:00') in week
        assert (day, 'Morning run', '07:30', '08:15') in week
    # Mathematics, the first major.
    assert (1, 'Real analysis lecture', '09:00', '10:15') in week
    assert (3, 'Abstract algebra lecture', '09:00', '10:15') in week
    assert (0, 'Putnam seminar', '17:30', '19:00') in week
    assert (3, 'Putnam problem session', '19:00', '20:30') in week
    # Machine learning, the second.
    assert (3, 'ML lab', '15:00', '17:00') in week
    assert (4, 'Statistical learning lecture', '11:00', '12:15') in week
    # The doctorate the two are pointed at.
    assert (1, 'Lab meeting', '14:00', '15:00') in week
    assert (2, 'Paper reading group', '15:00', '16:00') in week
    assert (4, 'Advisor meeting', '13:00', '13:45') in week
    assert (4, 'Thesis writing block', '14:00', '16:00') in week
    # And the half of the week that is not the degree.
    assert (2, 'Violin lesson', '18:00', '19:00') in week
    assert (0, 'Orchestra rehearsal', '19:30', '21:00') in week
    assert (1, 'Lunch with the lab', '12:15', '13:00') in week
    assert (4, 'Dinner out with friends', '19:30', '21:30') in week
    assert (5, 'Long run with friends', '08:30', '10:00') in week
    assert (5, 'Ice bath', '10:30', '10:50') in week
    assert (6, 'Ice bath', '09:30', '09:50') in week
    assert (6, 'Long meditation sit', '08:30', '09:15') in week
    assert (6, 'Sunday reset', '18:00', '18:45') in week


def test_the_weekend_is_on_the_timetable():
    """It used to be empty — `assert not [row for row in WEEK if row[0] > 4]` —
    which said Saturday and Sunday were whatever was left over. They are the
    recovery the rest of the week is affordable because of, so they are
    timetabled like everything else, and none of what is on them is work."""
    weekend = [row for row in seed_alpha.WEEK if row[0] > 4]
    assert len(weekend) >= 5
    for _d, title, subject, _b, _e, _x, study in weekend:
        assert not study, title
        assert subject in seed_alpha.NOT_STUDY, title


def test_nothing_on_the_week_overlaps_anything_else_on_its_day():
    """A timetable that double-books itself is not a timetable. This is worth a
    test rather than a careful read because the blocks are grouped by what they
    are for — the mathematics together, the research together — so two that
    collide sit twenty lines apart in the file."""
    by_day: dict[int, list[tuple[int, int, str]]] = {}
    for day, title, _s, begin, end, _x, _study in seed_alpha.WEEK:
        by_day.setdefault(day, []).append(
            (seed_alpha.minutes(begin), seed_alpha.minutes(end), title))

    for day, blocks in by_day.items():
        blocks.sort()
        for (_s1, end1, first), (start2, _e2, second) in zip(blocks, blocks[1:]):
            assert end1 <= start2, (day, first, second)


def test_the_week_has_a_life_in_it_as_well_as_a_degree():
    """The half that was missing, and the reason it matters: the Habits and
    Insights tabs look for recurring behaviour and for what conditions the
    better work shows up under. A record with only work in it gives them
    nothing to find that is not another problem set."""
    subjects = {row[2] for row in seed_alpha.WEEK}
    subjects |= {row[1] for row in seed_alpha.EVENING}
    subjects |= {row[1] for row in seed_alpha.WEEKEND}
    # Music, other people, training, and the two ways of putting the head down.
    for subject in ('music', 'friends', 'gym', 'running',
                    'meditation', 'health', 'cooking'):
        assert subject in subjects, subject


def test_the_timetable_reaches_the_subjects_it_is_meant_to():
    """The point of filing a lecture under what it is *about* is that the
    account's record reaches the lattices that teach it. If these ids drift,
    the skill tree page and the analytics tab stop seeing the degree."""
    named = {row[2] for row in seed_alpha.WEEK}
    named |= {row[1] for row in seed_alpha.EVENING}
    named |= {row[1] for row in seed_alpha.WEEKEND}
    for subject in ('programming', 'computer_science', 'machine_learning',
                    'data_science', 'statistics', 'mathematics', 'algebra',
                    'research', 'thesis', 'music'):
        assert subject in named, subject


def test_a_lecture_is_not_a_focus_session():
    """Attendance and work used to be told apart by the subject — a block filed
    under `lectures` was a lesson. The lectures are filed under what they teach
    now, so the flag carries that question instead, and this is what stops the
    two readings drifting apart again."""
    assert 'Math 55 lecture' in seed_alpha.ATTENDANCE
    assert 'Machine Learning lecture' in seed_alpha.ATTENDANCE
    assert 'Lab meeting' in seed_alpha.ATTENDANCE
    assert 'Lift' in seed_alpha.ATTENDANCE
    # The things somebody actually sits down and does are not in it.
    assert 'Putnam seminar' not in seed_alpha.ATTENDANCE
    assert 'ML lab' not in seed_alpha.ATTENDANCE
    assert 'Violin lesson' not in seed_alpha.ATTENDANCE
    assert 'Thesis writing block' not in seed_alpha.ATTENDANCE
    # The early eras have their own, and the biggest block in the record is one
    # of them: six hours and forty minutes of school is attendance, and while
    # this set was built from the thesis year alone it was not in it — so every
    # school day in the first three years counted as one unbroken focus
    # session.
    assert 'School day' in seed_alpha.ATTENDANCE
    # And every attendance title really is a block on some era's week.
    titles = {row[1] for era in seed_alpha.ERAS for row in era.week}
    assert seed_alpha.ATTENDANCE <= titles


def test_xp_rises_with_what_a_block_costs():
    """The numbers are a currency, so they have to rank the way effort does."""
    by_title = {row[1]: (row[5], seed_alpha.minutes(row[4]) - seed_alpha.minutes(row[3]))
                for row in seed_alpha.WEEK}
    assert by_title['Evening review'][0] < by_title['Ice bath'][0]
    assert by_title['Ice bath'][0] < by_title['Lift'][0]
    assert by_title['Lift'][0] < by_title['Violin lesson'][0]
    assert by_title['Violin lesson'][0] < by_title['Math 55 lecture'][0]
    assert by_title['Math 55 lecture'][0] < by_title['Putnam seminar'][0]
    assert by_title['Putnam seminar'][0] < by_title['ML lab'][0]
    assert by_title['ML lab'][0] < by_title['Thesis writing block'][0]
    for title, (xp, span) in by_title.items():
        assert xp > 0, title
        # Nothing is worth more per minute than the Putnam seminar, which is
        # the hardest ninety minutes on the week.
        assert xp / span <= by_title['Putnam seminar'][0] / 90 + 0.35, title


def test_every_day_of_the_week_has_a_focus_subject():
    """The note is written for each of the 365 days ahead, so each weekday
    needs at least one subject to draw from."""
    assert sorted(seed_alpha.FOCUS_DAYS) == list(range(7))
    for day, choices in seed_alpha.FOCUS_DAYS.items():
        assert choices, day
        for name in choices:
            assert 0 < len(name) <= 200, name


def test_the_level_target_is_reachable_from_the_ledger():
    """The script aims at the middle of a level's band, not its floor: a task
    finished in the app afterwards must not tip the account back down."""
    floor = 100 * 99 * 100 // 2
    assert level_for_total_xp(floor)['level'] == 100
    assert level_for_total_xp(floor + 4_000)['level'] == 100
    # And the aim leaves room above it, which is the point of not using floor.
    assert level_for_total_xp(floor + 4_000 + 1_000)['level'] == 100


def test_the_bounded_windows_are_bounded():
    """The bug: an unbounded DELETE on the tables with no id to mark."""
    source = open(seed_alpha.__file__, encoding='utf-8').read()
    body = source[source.index('def clear('):source.index('def streaks(')]
    # Every delete on a date-keyed table names both ends.
    for table in ('focus_days', 'metric_snapshots', 'day_focus_notes'):
        assert table in body, table
    assert 'date >= ?' not in body, 'an unbounded date delete is back'
    assert body.count('BETWEEN ? AND ?') >= 2
    # The floor is a literal and the ceiling is the run's own last written day,
    # so the range is closed at both ends however far the calendar has moved.
    assert 'WRITTEN_SINCE' in body and 'behind_to' in body


def test_the_record_ends_yesterday_however_deep_it_goes():
    """It used to be a pair of literals, and a literal year of record is only
    right for the twelve months after it is typed. A year later the account's
    history stopped dead a year ago and every "this week" panel read empty."""
    for today in (date(2026, 9, 7), date(2027, 3, 1), date(2028, 2, 29)):
        for years in (1, 2, 6):
            start, last = seed_alpha.behind_window(today, years)
            assert last == today - timedelta(days=1)
            assert round((last - start).days / 365.25) == years
            # And never into the year ahead, which is what today belongs to.
            assert last < today
            assert seed_alpha.WRITTEN_SINCE < last.isoformat()


def test_every_day_of_the_record_belongs_to_exactly_one_era():
    """The six eras are what make six years a progression rather than one year
    repeated. A day that falls in none of them has no week to draw from, and a
    day in two would be drawn twice — so the spans have to tile the window with
    no gap and no overlap, and the boundary is the thing most likely to be off
    by one."""
    for days in (365, 1000, 2192):
        start = date(2020, 9, 12)
        spans = seed_alpha.era_calendar(start, days)
        assert len(spans) == len(seed_alpha.ERAS)
        assert spans[0][0] == start
        assert spans[-1][1] == start + timedelta(days=days - 1)
        # Each era picks up exactly where the last one left off.
        for (_first, last, _era), (nxt, _l, _e) in zip(spans, spans[1:]):
            assert nxt == last + timedelta(days=1)

        by_day = seed_alpha.era_by_day(start, days)
        assert len(by_day) == days


def test_each_era_is_scored_against_its_own_day():
    """A sixteen-year-old measured against a doctoral student's day is a
    productivity score near zero for two straight years, and the Growth tab
    would draw that as somebody who started badly and improved — when what
    happened is that the day got longer. So the goal climbs with the eras, and
    the report cards are scored against the goal that was true at the time."""
    goals = [era.goal for era in seed_alpha.ERAS]
    assert goals == sorted(goals)
    assert goals[0] < goals[-1]
    # The account's stored goal is the era it is in now, which is the last one.
    assert seed_alpha.ERAS[-1].goal == seed_alpha.DAILY_GOAL
    # The same has to be true of the evening load and of how often a day is
    # missed, or the hours do not climb and the streak is whatever the dice say.
    loads = [era.load[1] for era in seed_alpha.ERAS]
    assert loads == sorted(loads)
    aways = [era.away for era in seed_alpha.ERAS]
    assert aways == sorted(aways, reverse=True)


def test_the_seed_does_not_claim_records_the_rows_deny():
    """The three Summit records are facts about the record rather than claims
    about the world, so they are read back off it. A seed that types a figure
    for these produces a hall of fame the Growth tab contradicts three sections
    below — which makes the *app* look like it cannot count."""
    listed = {name for name, *_rest in seed_alpha.RECORDS}
    assert 'Longest streak' not in listed
    assert 'Best XP day' not in listed
    assert 'Longest focus session' not in listed
    assert set(seed_alpha.DERIVED_META) == {
        'Longest streak', 'Best XP day', 'Longest focus session'}

    # And the year-long-streak milestone is only written when it happened.
    assert not any(name == 'Every day for a full year'
                   for name, _cat, _ago in seed_alpha.MILESTONES)
    rows = seed_alpha.record_rows(
        'Alpha', date(2026, 9, 12),
        {'Longest streak': [('2024-01-01', 40), ('2025-01-01', 103)]})
    assert not any(row[3] == 'Every day for a full year' for row in rows)
    rows = seed_alpha.record_rows(
        'Alpha', date(2026, 9, 12),
        {'Longest streak': [('2024-01-01', 40), ('2025-01-01', 400)]})
    assert any(row[3] == 'Every day for a full year' for row in rows)


def test_a_record_says_which_way_is_better():
    """Most of these climb; the mile, the 5k and the Kaggle placing come down.
    They are in the seed for that reason — a hall of fame whose every record
    goes up cannot show the comparison direction doing anything, and those are
    exactly the ones that used to read upside down."""
    directions = {name: direction
                  for name, _cat, _unit, _target, direction, _entries
                  in seed_alpha.RECORDS}
    assert directions['Mile'] == 'lower'
    assert directions['5k'] == 'lower'
    assert directions['Kaggle placing'] == 'lower'
    assert directions['AMC 8'] == 'higher'
    assert set(directions.values()) == {'higher', 'lower'}

    # Every entry of one record agrees with itself, and every row carries one
    # of the two words — the column is NOT NULL on a fresh schema.
    rows = seed_alpha.record_rows('Alpha', date(2026, 9, 12))
    said = {}
    for row in rows:
        assert row[8] in ('higher', 'lower')
        said.setdefault(row[3], set()).add(row[8])
    assert all(len(words) == 1 for words in said.values())


def test_a_seeded_record_climbs_the_way_it_says_it_does():
    """Every series is an argument about six years, so none of them may wander:
    a record that goes 18, 25, 21 is not progress, it is noise with a good
    first impression."""
    for name, _cat, _unit, _target, direction, entries in seed_alpha.RECORDS:
        ago = [years for years, _value in entries]
        assert ago == sorted(ago, reverse=True), name
        values = [value for _years, value in entries]
        assert values == sorted(values, reverse=direction == 'lower'), name


def test_the_streak_agrees_with_the_record():
    """A year of finished work and a streak of zero reads as a broken app.
    `streaks` is what stops the two disagreeing."""
    def worked(*days):
        return [(None,) * 11 + ('{}T20:00:00'.format(d),) for d in days]

    last = date(2026, 9, 6)
    # A run ending on the last day written is the current streak.
    assert seed_alpha.streaks(
        worked('2026-09-04', '2026-09-05', '2026-09-06'), last) == (3, 3)
    # A gap before the end means the app would already have dropped it.
    assert seed_alpha.streaks(
        worked('2026-08-01', '2026-08-02', '2026-08-03'), last) == (0, 3)
    # The best is the longest run anywhere, never below the current one.
    assert seed_alpha.streaks(
        worked('2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04',
               '2026-09-05', '2026-09-06'), last) == (2, 4)


def test_every_seeded_preference_is_a_key_the_app_declares():
    """A key FIELDS does not declare is a row nothing will ever read."""
    from backend.api.settings import FIELDS

    unknown = set(seed_alpha.SETTINGS) - set(FIELDS)
    assert not unknown, unknown


def test_every_seeded_preference_is_stored_as_the_type_it_is_declared_with():
    """The bug this pins is the one that took the account's whole palette out.

    `user_settings.value` is in JSON_COLUMNS, so the write is a `json.dumps`
    and the read a `json.loads` — and this script writes the row itself rather
    than going through the endpoint, so nothing else applies that encoding for
    it. It once wrote the values bare: 'dark', 'violet', 'week'. None of those
    is JSON, so all eighteen string preferences on the account read back as
    `{}`, and the page set `data-accent="[object Object]"` and filtered the
    task board on an object.

    So this asserts the round trip, not the spelling — dumped and loaded, each
    value comes back as itself and as the type FIELDS declares.
    """
    import json

    from backend.api.settings import FIELDS

    for key, value in seed_alpha.SETTINGS.items():
        back = json.loads(json.dumps(value, sort_keys=True))
        assert back == value, key
        declared = type(FIELDS[key][0])
        # int/float are one family here: `focus_goal_hours` is declared 2.0 and
        # 4 is a fine value for it. bool is not — it is a subclass of int and
        # a flag stored as 1 is the thing `_keyed` has to coerce back.
        if declared is bool:
            assert isinstance(back, bool), key
        elif declared in (int, float):
            assert isinstance(back, (int, float)) and not isinstance(back, bool), key
        else:
            assert isinstance(back, declared), key

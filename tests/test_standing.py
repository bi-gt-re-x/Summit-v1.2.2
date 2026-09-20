"""A rank is only allowed to be as precise as the cohort behind it.

"Where You Stand" placed the reader against every other account with a
comparable record, and it did so from three others up. Against five it printed
"Top 1.0%" — a figure whose finest honest step is twenty points, written to one
decimal place, in the same style as every other number on the page.

The panel did name the cohort size beside it, and that was the defence: a small
sample disclosed rather than hidden. It is not enough. A reader does not divide
100 by the number in the caption; they read a percentile, because that is what
it is shaped like. These tests hold both halves of the fix — the floor on
saying anything at all, and the precision of what is said above it.
"""
from backend.tracking import standing


def test_a_rank_is_rounded_to_what_the_cohort_can_resolve():
    """Five others cannot distinguish tenths, so the figure must not claim to."""
    five = [0, 1, 2, 3, 4]
    for mine in range(6):
        percent = standing._top_percent(mine, five)
        # 100/5 = 20-point steps, and the clamp at either end.
        assert percent in (1.0, 20.0, 40.0, 60.0, 80.0, 99.0), (mine, percent)


def test_a_large_cohort_is_allowed_tenths():
    """The rounding follows the sample rather than being blanket-coarse."""
    many = list(range(500))
    seen = {standing._top_percent(mine, many) for mine in range(0, 500, 7)}
    assert any(value != round(value) for value in seen), sorted(seen)[:8]


def test_nobody_is_placed_beyond_everybody():
    """"Top 0%" claims a rank outside the population; "top 100%" is a way of
    calling somebody last in the language of winning."""
    others = list(range(30))
    assert standing._top_percent(1000, others) == 1.0
    assert standing._top_percent(-1000, others) == 99.0


def test_ties_place_together():
    """Otherwise the comparison turns on the order rows came out of the table."""
    others = [5, 5, 5, 5]
    assert standing._top_percent(5, others) == standing._top_percent(5, others)
    assert standing._top_percent(6, others) < standing._top_percent(4, others)


def test_the_floor_is_high_enough_that_one_account_is_not_a_landslide():
    """Twenty is where a single person joining moves a rank by about five
    points rather than by twenty-five."""
    assert standing.COHORT_FLOOR >= 20
    step = 100.0 / standing.COHORT_FLOOR
    assert step <= 5.0, step


def test_a_small_instance_says_so_instead_of_ranking(client):
    """End to end: a fresh install has two accounts, and the honest answer to
    "where do I stand?" is that there is nobody to stand against yet."""
    payload = client.get('/api/standing').json()
    assert payload['success'] is True
    assert payload['enough'] is False
    assert payload['floor'] == standing.COHORT_FLOOR
    assert all(row['percentile'] is None for row in payload['rows']), payload


# ---------------------------------------------------------------------------
# The bulk reads have to agree with the per-account ones
# ---------------------------------------------------------------------------
# Placing one account against the others means measuring all of them, and doing
# that a row at a time cost 132 queries and 33 MB on the author's database — it
# read every account's whole task history and whole ledger into Python, twice
# over each, to produce five numbers apiece. The measuring now happens in
# SQLite: `ledger_days` and `completed_task_days` in backend/database/
# connection.py fold the two big tables to daily totals, and
# `rollups_for_everyone` in backend/tracking/analytics.py assembles the same
# buckets `_daily_rollup` assembles from rows.
#
# Which means there are now two implementations of the same arithmetic, one in
# Python over dicts and one in SQL. They cannot share a predicate across that
# boundary. They can share these tests, which is the whole reason the fast path
# is allowed to exist: it is only ever a saving if it is not also an answer.

from datetime import datetime, timedelta   # noqa: E402

from backend.database import connection as db                    # noqa: E402
from backend.tracking import analytics as analytics_tracking     # noqa: E402
from backend.tracking import focus as focus_tracking             # noqa: E402
from backend.tracking import xp as xp_tracking                   # noqa: E402

from tests.conftest import make_account                          # noqa: E402


def _day(back):
    return (datetime.now() - timedelta(days=back)).date().isoformat()


def _task(username, day, **over):
    row = {'id': db.new_id('tasks'), 'user_id': username, 'title': 'Practice set',
           'priority': 'medium', 'status': 'done', 'xp_value': 40,
           'created_at': '2026-01-02T09:00:00',
           'completed_at': '{}T10:00:00'.format(day) if day else None}
    row.update(over)
    db.insert_row('tasks', row)


def _event(username, **over):
    row = {'id': db.new_id('xp_events'), 'user_id': username, 'amount': 40,
           'reason': 'task_completion', 'tasks_completed': 1}
    row.update(over)
    db.insert_row('xp_events', row)


def _awkward_account(username):
    """One account carrying every shape the two paths have to agree about."""
    make_account(username)

    # Rated on both rows, on one row only, and on neither — `rating_of` counts
    # the first and nothing else.
    _task(username, _day(1), difficulty=4, execution=5)
    _task(username, _day(1), difficulty=3)
    _task(username, _day(2), execution=2)
    _task(username, _day(2))
    # Out of range is not among the shapes, because the column will not hold
    # it: `CHECK (difficulty BETWEEN 1 AND 5)` in data/sql/tasks.sql refuses
    # both a 0 and a string. The range test in `rating_of` — and the `typeof`
    # guard standing in for its isinstance check in connection.py — are for a
    # database that predates the constraint, which is exactly the case no test
    # can build.

    # Timed and untimed; a deadline met, a deadline missed, and no deadline at
    # all. The middle one is the case a truthiness test gets wrong: the column
    # was answered, and the answer was no.
    _task(username, _day(3), completion_seconds=900, met_deadline=True)
    _task(username, _day(3), completion_seconds=0, met_deadline=False)
    _task(username, _day(4), xp_value=0)
    # Finished with nowhere to file it, and unfinished. Neither is a day.
    _task(username, None, completed_at='')
    _task(username, _day(4), status='todo')

    # A ledger row with an explicit date, one carrying only a timestamp (the
    # rows written before that column existed), one worth nothing, and one
    # recording no task.
    _event(username, date=_day(1), timestamp='{}T10:00:00'.format(_day(1)))
    _event(username, timestamp='{}T11:00:00'.format(_day(2)))
    _event(username, date=_day(3), amount=0, reason='daily_xp')
    _event(username, date=_day(4), amount=15, tasks_completed=0)
    _event(username, date=_day(4), amount=15, tasks_completed=None)

    # A day at the timer, a day with a row and no time on it, and a day with no
    # goal set. The middle one must not count as worked or as a goal missed.
    db.insert_row('focus_days', {'user_id': username, 'date': _day(1),
                                 'seconds': 5400, 'goal_hours': 2})
    db.insert_row('focus_days', {'user_id': username, 'date': _day(5),
                                 'seconds': 0, 'goal_hours': 3})
    db.insert_row('focus_days', {'user_id': username, 'date': _day(6),
                                 'seconds': 1200, 'goal_hours': 0})
    return username


def test_the_ledger_folded_by_sqlite_is_the_ledger_folded_in_python(app):
    """`ledger_days` against `daily_totals`, account by account."""
    _awkward_account('bulk')
    make_account('empty')

    everyone = db.ledger_days()
    for username in ('bulk', 'empty'):
        assert everyone.get(username, {}) == xp_tracking.daily_totals(username), username


def test_the_focus_history_read_once_is_the_history_read_per_account(app):
    """`history_for_everyone` against `history_for`."""
    _awkward_account('bulk')
    make_account('empty')

    everyone = focus_tracking.history_for_everyone()
    for username in ('bulk', 'empty'):
        assert everyone.get(username, {}) == focus_tracking.history_for(username), username


def test_the_bulk_rollup_is_the_per_account_rollup(app):
    """The one that matters: same days, same buckets, same fields.

    `_daily_rollup` is the definition — of which days count as worked, of what
    a rating is, of which tasks were timed. This asserts the SQL says the same,
    field for field, rather than asserting the score that comes out of it: two
    wrong buckets can average to a right score, and then the next metric added
    to the card quietly disagrees between the two pages that print it.
    """
    _awkward_account('bulk')
    make_account('empty')

    everyone = analytics_tracking.rollups_for_everyone()
    for username in ('bulk', 'empty'):
        assert everyone.get(username, {}) == analytics_tracking._daily_rollup(username), username
    # And it is actually measuring something.
    assert len(everyone['bulk']) >= 5, everyone['bulk']


def test_the_standing_score_is_the_report_card_score(app):
    """The `score` measure is the number the report card prints, not a second
    opinion computed beside it — so a change to the card moves both or
    neither."""
    _awkward_account('bulk')

    placement = standing.standing('bulk')
    card = analytics_tracking.ratings('bulk', record=False)
    scored = next(row for row in placement['rows'] if row['key'] == 'score')
    assert scored['value'] == card['overall']['score']


def test_placing_an_account_reads_each_table_once(app):
    """The fix, as a property rather than as a stopwatch.

    The old version's cost was the number of accounts multiplied by the size of
    everyone's history, because every read sat inside the loop over accounts.
    Counting statements is how that stays fixed: a read that creeps back into
    the loop shows up here as a count that tracks the number of accounts,
    whatever it does to the clock on the machine running the suite.
    """
    for i in range(6):
        _awkward_account('cohort{}'.format(i))

    seen = []
    real = db.connect

    def counting():
        con = real()
        con.set_trace_callback(lambda sql: seen.append(' '.join(str(sql).split()[:4]).upper()))
        return con

    db.connect = counting
    try:
        assert standing.standing('cohort0') is not None
    finally:
        db.connect = real

    selects = [sql for sql in seen if sql.startswith('SELECT')]
    assert len(selects) == 4, selects
    assert sum(1 for sql in selects if 'USERS' in sql) == 1, selects

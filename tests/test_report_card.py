"""The report card grades the last ninety days, and grades them fairly.

The page used to tell this repository's own demo account — 4,120 finished
tasks, level 60, a 152-day best streak — **"F: not enough is happening yet to
score"**, while printing "top 1.0% of Summit users" beside it. Four things were
wrong at once and each of these tests holds one of them shut.
"""
from datetime import date, timedelta

from backend.database import connection as db
from backend.tracking import analytics


def finish(client, xp=10, when=None, difficulty=None, execution=None, due=None):
    """One completed task, optionally back-dated and rated."""
    made = client.post('/api/tasks', json={
        'name': 'task', 'xp_reward': xp, 'due_date': due or '',
    }).json()
    task_id = made['task_id']
    client.post('/api/complete_task', json={'task_id': task_id})
    if when:
        db.update_row('tasks', task_id, {'completed_at': when + 'T12:00:00'},
                      user_id='tester')
        for row in db.rows_for('xp_events', 'tester'):
            if row.get('reason') == 'task_completion' and row.get('date') != when:
                db.update_row('xp_events', row['id'], {'date': when}, user_id='tester')
    if difficulty is not None:
        client.post('/api/rate_task', json={'task_id': task_id,
                                            'difficulty': difficulty,
                                            'execution': execution})
    return task_id


def card(client):
    return client.get('/api/get_growth_ratings').json()


# --------------------------------------------------------------------------
def test_the_window_is_ninety_days_not_the_account_lifetime(client):
    """The bug: a long-dormant account could never recover its average.

    `total_days` was the number of days since the account was created, so an
    account made years ago and taken seriously this month was scored on the
    mean of the whole silence. No amount of work moves an average over 1,840
    days, which is how a very active account came to read F.
    """
    db.update_row('users', db.find_row('users', 'tester', key='username')['id'],
                  {'created_at': '2021-01-01T00:00:00'})
    finish(client, xp=50)

    consistency = card(client)['metrics']['consistency']
    assert consistency['total_days'] == analytics.SCORING_WINDOW_DAYS
    # Not the ~1,700 days since 2021.
    assert consistency['total_days'] < 200


def test_a_young_account_is_scored_on_the_days_it_has_existed(client):
    """A three-day-old account must not be marked down for the other 87."""
    made = date.today() - timedelta(days=2)
    db.update_row('users', db.find_row('users', 'tester', key='username')['id'],
                  {'created_at': made.isoformat() + 'T00:00:00'})
    finish(client, xp=50)
    assert card(client)['metrics']['consistency']['total_days'] == 3


def test_work_outside_the_window_does_not_count(client):
    """Old work is history, not this month's score."""
    long_ago = (date.today() - timedelta(days=200)).isoformat()
    finish(client, xp=500, when=long_ago)
    assert card(client)['metrics']['productivity']['avg_daily_xp'] == 0


# --------------------------------------------------------------------------
def test_productivity_is_scored_against_the_accounts_own_daily_goal(client):
    """It was a flat 300 XP a day for full marks — a number nobody chose."""
    user = db.find_row('users', 'tester', key='username')
    db.update_row('users', user['id'], {'daily_goal': 100})
    finish(client, xp=100)
    assert card(client)['metrics']['productivity']['score'] == 100

    # Same day's work, twice the target: half the score.
    db.update_row('users', user['id'], {'daily_goal': 200})
    assert card(client)['metrics']['productivity']['score'] == 50


def test_productivity_counts_days_worked_not_days_on_the_calendar(client):
    """Turning up is what consistency measures; scoring it twice was the bug.

    One day's work in a ninety-day window is a full day's work on the day it
    happened. It should score the day, and let consistency say it was one day
    out of ninety.
    """
    db.update_row('users', db.find_row('users', 'tester', key='username')['id'],
                  {'daily_goal': 100})
    finish(client, xp=100)
    metrics = card(client)['metrics']
    assert metrics['productivity']['score'] == 100
    assert metrics['consistency']['score'] < 5


# --------------------------------------------------------------------------
def test_an_ordinary_good_rating_is_not_a_failing_quality_score(client):
    """Difficulty x execution is out of 25, and its midpoint is not 50%.

    A task rated 3 and 3 scored 9/25 = 36. Three out of five twice over is an
    ordinary good task, and the scale it is read on has to say so: the
    geometric mean is 3, and 3 out of 5 is 60.
    """
    finish(client, xp=10, difficulty=3, execution=3)
    assert card(client)['metrics']['quality']['score'] == 60


def test_full_marks_still_need_full_marks(client):
    finish(client, xp=10, difficulty=5, execution=5)
    assert card(client)['metrics']['quality']['score'] == 100


# --------------------------------------------------------------------------
def test_efficiency_is_the_number_the_card_prints_beside_it(client):
    """It was half deadlines and half wall-clock "speed".

    `completion_seconds` is the gap between writing a task down and finishing
    it, so a task created Monday for Friday scored as five days of slowness —
    punishing exactly what the calendar and the goals page ask people to do.
    The card's caption always read "N% finished on time"; the score now is it.
    """
    finish(client, xp=10, due='2099-01-01T00:00:00')
    efficiency = card(client)['metrics']['efficiency']
    assert efficiency['score'] == efficiency['on_time_pct'] == 100


def test_a_day_with_no_focus_does_not_count_against_the_focus_score(client):
    """The same double count productivity had, in the last metric.

    A tracked day with zero seconds used to add its goal to the denominator and
    nothing to the numerator. Consistency already counts the days off.
    """
    today = date.today().isoformat()
    idle = (date.today() - timedelta(days=1)).isoformat()
    client.post('/api/focus_sync', json={'date': today, 'focused_seconds': 7200,
                                         'goal_hours': 2})
    client.post('/api/focus_sync', json={'date': idle, 'focused_seconds': 0,
                                         'goal_hours': 2})
    assert card(client)['metrics']['focus']['score'] == 100


# --------------------------------------------------------------------------
def test_a_busy_account_does_not_read_as_a_failing_one(client):
    """The whole point, end to end.

    Ninety days of steady, well-rated, on-time work against the account's own
    stated goal should not come out an F. This is the regression that started
    all of it.
    """
    user = db.find_row('users', 'tester', key='username')
    db.update_row('users', user['id'], {'daily_goal': 100})
    today = date.today()
    for back in range(0, 60):
        day = (today - timedelta(days=back)).isoformat()
        finish(client, xp=100, when=day, difficulty=4, execution=4,
               due='2099-01-01T00:00:00')
        client.post('/api/focus_sync', json={'date': day, 'focused_seconds': 7200,
                                             'goal_hours': 2})

    result = card(client)['overall']
    assert result['grade'] not in ('F', 'D'), result
    assert result['score'] >= 70, result


# --------------------------------------------------------------------------
def test_every_grade_the_scorer_can_produce_can_be_stored(client):
    """The bug: 'A+' was a grade the table would not hold.

    `GRADE_BANDS` has returned 'A+' for the 96-99 band for as long as the
    scorer has existed, and `metric_snapshots.grade` allowed six letters that
    did not include it. `save_snapshot` writes a row per metric on every read
    of the card, so a single metric landing in that band raised IntegrityError
    and /api/get_growth_ratings answered 500 — to exactly the accounts scoring
    best on something.

    This asserts the two lists against each other rather than re-testing one
    band, because the failure was a disagreement between them: any future
    letter added to the scorer is caught here on the day it is added, instead
    of on the day somebody earns it.
    """
    for score in range(0, 101):
        letter = analytics.grade_for_score(score)
        db.write_table('metric_snapshots', [{
            'user_id': 'tester', 'date': '2026-01-01', 'metric': 'overall',
            'score': score, 'grade': letter, 'detail': {},
        }])
        stored = db.rows_for('metric_snapshots', 'tester')
        assert stored[-1]['grade'] == letter, (score, letter)


def test_a_top_band_snapshot_can_be_written(client):
    """The same bug at the line that raised it.

    `save_snapshot` writes one row per metric on every read of the card, so it
    is the call that turned a 96-99 score into an IntegrityError and a 500.
    The band is forced here rather than worked toward with seeded tasks: the
    five metrics are computed, and a test that hoped one of them would land
    between 96 and 99 would pass for the wrong reason on most runs — which is
    exactly what the first version of this test did.
    """
    rows = [{
        'user_id': 'tester', 'date': '2026-01-01', 'metric': metric,
        'score': 97, 'grade': analytics.grade_for_score(97), 'detail': {},
    } for metric in ('productivity', 'quality', 'consistency', 'efficiency',
                     'focus', 'overall')]

    db.save_metric_snapshots(rows)

    stored = analytics.history('tester', metric='overall')
    assert stored[-1]['grade'] == 'A+', stored[-1]
    assert client.get('/api/get_growth_ratings').status_code == 200


# --------------------------------------------------------------------------
# The card does not care who read its rows
# --------------------------------------------------------------------------
# `ratings` takes the task rows, the ledger and the focus history as optional
# arguments now, because the achievements page reads all three to count its
# badges and then asks for this card — which read all three again, the
# account's whole history twice in one request. The saving is only real if the
# card is the same card either way.
def test_the_card_is_the_same_whoever_read_the_rows(client):
    """Handed the rows, or reading them itself: one answer.

    Both spellings of "handed": the narrowed columns the achievements page
    actually passes, and every column, which is what a caller holding rows read
    for some other purpose would have. A card that needs a column outside
    SCORED_TASK_FIELDS or SCORED_LEDGER_FIELDS fails the first and passes the
    second, which is the failure worth catching — the narrow read is the one on
    the page.
    """
    today = date.today()
    for back in range(0, 12):
        when = (today - timedelta(days=back)).isoformat()
        finish(client, xp=30 + back, when=when, difficulty=4, execution=3)
    db.insert_row('focus_days', {'user_id': 'tester', 'date': today.isoformat(),
                                 'seconds': 5400, 'goal_hours': 2})

    from backend.tracking import focus as focus_tracking
    from backend.tracking import xp as xp_tracking

    own = analytics.ratings('tester', record=False)
    focus_history = focus_tracking.history_for('tester')

    narrowed = analytics.ratings(
        'tester', record=False,
        tasks=db.columns_for('tasks', 'tester', analytics.SCORED_TASK_FIELDS),
        events=db.columns_for('xp_events', 'tester', analytics.SCORED_LEDGER_FIELDS),
        focus_history=focus_history)

    whole = analytics.ratings(
        'tester', record=False,
        tasks=db.tasks_for('tester'),
        events=xp_tracking.events_for('tester'),
        focus_history=focus_history)

    assert own == narrowed
    assert own == whole


def test_the_focus_trend_is_the_windowed_history(client):
    """That trend used to read the focus table twice more on its own, through
    `focus.seconds_in_window`. It is windowed out of the history the card has
    already read, which has to come to the same total — including over the days
    that have a row and no seconds on them.

    `seconds_in_window` itself is gone: that line was its only caller, and a
    second copy of this rule kept for nobody is how two answers to one question
    start. The rule it held is written out here instead.
    """
    from backend.tracking import focus as focus_tracking

    today = date.today()
    for back, seconds in ((1, 3600), (3, 1800), (5, 0), (8, 7200), (10, 900)):
        db.insert_row('focus_days', {
            'user_id': 'tester', 'date': (today - timedelta(days=back)).isoformat(),
            'seconds': seconds, 'goal_hours': 2})

    history = focus_tracking.history_for('tester')

    def windowed(lo, hi):
        return sum(record['seconds'] for day, record in history.items()
                   if lo <= (today - date.fromisoformat(day)).days <= hi)

    assert windowed(0, 6) == 3600 + 1800 + 0
    assert windowed(7, 13) == 7200 + 900

    # And the card's own trend is the sign of the difference between them.
    card = analytics.ratings('tester', record=False)
    assert card['metrics']['focus']['trend'] == analytics._trend(
        windowed(0, 6), windowed(7, 13))


def test_the_fast_date_parse_agrees_with_the_slow_one():
    """`parse_day` reaches `date.fromisoformat` for text shaped like a date and
    `strptime` for everything else, because it is called 61,285 times to build
    one report card on the largest account here and `strptime` re-reads the
    locale on every call. The two have to answer the same.

    Including on the rubbish: a value neither accepts is None, and a value
    `fromisoformat` alone would accept — the compact `20260919` — must not
    start parsing now that it is in the path.
    """
    from datetime import datetime

    from backend.tracking import xp as xp_tracking

    def slow(raw):
        if not raw:
            return None
        try:
            return datetime.strptime(str(raw)[:10], '%Y-%m-%d').date()
        except (ValueError, TypeError):
            return None

    values = [
        '2026-09-19', '2026-09-19T14:03:11', '2026-09-19T14:03:11.123456',
        '1999-01-01', '2026-02-29', '2026-13-01', '2026-09-32',
        '20260919', '2026-9-19', '2026-09-1', '', None, 0, 'not a date',
        '   ', 'T', date.today().isoformat(),
    ]
    for value in values:
        assert xp_tracking.parse_day(value) == slow(value), value


# --------------------------------------------------------------------------
# Filing the day's grades is six rows
# --------------------------------------------------------------------------
# Reading the report card files it, so `/api/get_growth_ratings` is a read that
# leaves six rows behind. It used to leave them by reading every snapshot ever
# taken, dropping the six being replaced and writing all of them back — 2,316
# INSERTs on the author's database to store six rows, on a page anyone can
# refresh, growing by six rows a day per account for ever.
def _statements(work):
    """Every statement `work` runs, upper-cased on one line."""
    seen = []
    real = db.connect

    def counting():
        con = real()
        con.set_trace_callback(lambda sql: seen.append(' '.join(str(sql).split()).upper()))
        return con

    db.connect = counting
    try:
        work()
    finally:
        db.connect = real
    return seen


def _a_card(score=60):
    """A card in the shape `save_snapshot` reads."""
    block = lambda: {'score': score, 'grade': analytics.grade_for_score(score),
                     'trend': {'direction': 'flat', 'pct': 0}}
    return {'overall': block(),
            'metrics': {name: block() for name in analytics.METRICS}}


def test_filing_a_day_writes_six_rows_however_long_the_history(client):
    """The property the fix is about. A write that rewrites the history shows
    up here as a statement count that grows with the number of days stored."""
    for day in range(1, 60):
        analytics.save_snapshot('tester', _a_card(), day='2026-01-{:02d}'.format(
            (day % 28) + 1) if day < 28 else '2026-02-{:02d}'.format((day % 28) + 1))
    assert len(db.rows_for('metric_snapshots', 'tester')) > 100

    writes = [sql for sql in _statements(
        lambda: analytics.save_snapshot('tester', _a_card(), day='2026-03-01'))
        if sql.startswith(('INSERT', 'UPDATE', 'DELETE'))]
    assert len(writes) == 6, writes
    assert not any(sql.startswith('DELETE') for sql in writes), writes


def test_reading_the_card_twice_in_a_day_replaces_that_day(client):
    """Not appends, and not a delete followed by an insert: the day's six rows
    are replaced in place, so a reader refreshing the page never sees their own
    history briefly missing a day."""
    analytics.save_snapshot('tester', _a_card(40), day='2026-03-01')
    analytics.save_snapshot('tester', _a_card(80), day='2026-03-01')

    stored = [r for r in db.rows_for('metric_snapshots', 'tester')
              if r['date'] == '2026-03-01']
    assert len(stored) == 6, stored
    assert {r['score'] for r in stored} == {80}, stored
    assert {r['grade'] for r in stored} == {analytics.grade_for_score(80)}


def test_filing_a_day_leaves_every_other_day_and_account_alone(client, stranger):
    """The whole-table rewrite made that a property of the rewrite being
    correct. It is now a property of the write being scoped to six keys."""
    analytics.save_snapshot('tester', _a_card(40), day='2026-03-01')
    analytics.save_snapshot('stranger', _a_card(50), day='2026-03-01')
    analytics.save_snapshot('tester', _a_card(60), day='2026-03-02')

    analytics.save_snapshot('tester', _a_card(90), day='2026-03-02')

    def scores(user, day):
        return {r['score'] for r in db.rows_for('metric_snapshots', user)
                if r['date'] == day}

    assert scores('tester', '2026-03-02') == {90}
    assert scores('tester', '2026-03-01') == {40}
    assert scores('stranger', '2026-03-01') == {50}


def test_the_detail_survives_the_round_trip(client):
    """`detail` is a JSON column and the figures behind each score live in it.
    A write that stores it as the string "{'score': ...}" reads back as a
    different thing, and nothing downstream would say so."""
    card = _a_card(70)
    card['metrics']['focus']['focused_minutes'] = 53
    card['metrics']['focus']['goal_minutes'] = 390
    analytics.save_snapshot('tester', card, day='2026-03-01')

    focus = [r for r in analytics.history('tester', metric='focus')
             if r['date'] == '2026-03-01'][0]
    assert focus['detail']['focused_minutes'] == 53
    assert focus['detail']['goal_minutes'] == 390
    assert focus['detail']['trend'] == {'direction': 'flat', 'pct': 0}
    assert 'score' not in focus['detail'] and 'grade' not in focus['detail']


def test_the_history_is_one_account_s_oldest_first(client, stranger):
    """`history` read the whole table and filtered in Python. Scoped in SQL, it
    has to return the same list in the same order — and still only one
    account's, which is what the page is asking for."""
    analytics.save_snapshot('stranger', _a_card(10), day='2026-03-02')
    for day, score in (('2026-03-03', 30), ('2026-03-01', 20), ('2026-03-02', 25)):
        analytics.save_snapshot('tester', _a_card(score), day=day)

    overall = analytics.history('tester', metric='overall')
    assert [r['date'] for r in overall] == ['2026-03-01', '2026-03-02', '2026-03-03']
    assert [r['score'] for r in overall] == [20, 25, 30]
    assert all(r['user_id'] == 'tester' for r in analytics.history('tester'))

    everything = analytics.history('tester')
    assert everything == sorted(everything, key=lambda r: (r['date'], r['metric']))
    assert len(everything) == 18


def test_reading_the_report_card_reads_each_table_once(client):
    """The endpoint as a whole: four reads and six writes, whatever is stored.
    A `SELECT *` creeping back onto it shows up as the column list changing."""
    finish(client, xp=40)
    client.get('/api/get_growth_ratings')

    statements = _statements(lambda: client.get('/api/get_growth_ratings'))
    reads = [sql for sql in statements if sql.startswith('SELECT')]
    for table in ('TASKS', 'XP_EVENTS', 'FOCUS_DAYS'):
        hits = [sql for sql in reads if 'FROM "{}"'.format(table) in sql]
        assert len(hits) == 1, (table, hits)

    # And the two big ones name their columns. `focus_days` is exempt and
    # stays exempt: it has four columns and the score reads all four, so
    # `SELECT *` there is the column list, spelled shorter.
    for table in ('TASKS', 'XP_EVENTS'):
        hit = next(sql for sql in reads if 'FROM "{}"'.format(table) in sql)
        assert not hit.startswith('SELECT * FROM'), hit

    writes = [sql for sql in statements
              if sql.startswith(('INSERT', 'UPDATE', 'DELETE'))]
    assert len(writes) == 6, writes

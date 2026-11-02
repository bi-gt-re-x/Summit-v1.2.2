"""The Growth tab's periods: one scorer, asked about more than one window.

The report card grades a fixed trailing ninety days and answers "how am I
doing". This answers "how have I changed", which needs the same five metrics
over a window the reader picks *and* over the window before it — so the scoring
that used to sit inline in `ratings()` was pulled out into `score_window` and
is now called from both.

That refactor is the thing most worth protecting here, and it is protected in
two directions. test_report_card.py pins the figures `ratings()` produces and
did not change when the arithmetic moved; these pin that `period_scores` is
reading the same scorer rather than a second one that happens to agree today.
"""
from datetime import date, timedelta

import pytest

from backend.database import connection as db
from backend.tracking import analytics


def finish(client, xp=10, when=None, difficulty=None, execution=None):
    """One completed task, optionally back-dated and rated."""
    made = client.post('/api/tasks', json={
        'name': 'task', 'xp_reward': xp, 'due_date': '',
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


def ago(days):
    return (date.today() - timedelta(days=days)).isoformat()


def periods(client, period='30d'):
    return client.get('/api/growth_periods', params={'period': period}).json()


# --------------------------------------------------------------------------
# The one scorer
# --------------------------------------------------------------------------
def test_the_period_scorer_is_the_report_cards_scorer(client):
    """Not "agrees with" — *is*. The same function, over the same window.

    If these ever diverge it will be because somebody added a second
    computation, which is the one thing backend/tracking/analytics.py asks
    nobody to do. Ninety days is the report card's own window, so asking the
    period scorer for it has to reproduce the card exactly.
    """
    for day in range(0, 40, 3):
        finish(client, xp=40, when=ago(day), difficulty=4, execution=4)

    card = client.post('/api/get_growth_ratings').json()
    scored = periods(client, '90d')

    assert scored['current']['overall'] == card['overall']['score']
    for name in analytics.METRICS:
        assert scored['current']['parts'][name] == card['metrics'][name]['score'], name


def test_a_window_is_scored_on_the_days_it_covers(client):
    """Work outside the period does not count toward it.

    The whole basis of the tab: a seven-day window and a year window are
    different questions, and a scorer that quietly read everything would make
    every period on the row identical.
    """
    finish(client, xp=500, when=ago(200))

    week = periods(client, '7d')['current']
    year = periods(client, '365d')['current']

    assert week['figures']['productivity']['avg_daily_xp'] == 0
    assert year['figures']['productivity']['avg_daily_xp'] > 0


# --------------------------------------------------------------------------
# The comparison
# --------------------------------------------------------------------------
def test_a_period_with_nothing_before_it_reports_no_growth(client):
    """"Since you started" reaches back to day one, so it has no predecessor.

    Printing a growth figure anyway is how "+100%" comes to mean "we had no
    idea". The tab draws a dash off this null.
    """
    finish(client, xp=50)
    scored = periods(client, 'all')

    assert scored['previous'] is None
    assert scored['change']['overall'] is None


def test_a_young_account_gets_no_predecessor_it_did_not_live_through(client):
    """A 30-day window on a 10-day-old account has no earlier 30 days.

    Comparing against a scrap of history that happens to precede the window
    would be a comparison against noise, dressed as a comparison against a
    month.
    """
    user = db.find_row('users', 'tester', key='username')
    db.update_row('users', user['id'],
                  {'created_at': ago(9) + 'T00:00:00'})
    finish(client, xp=50)

    assert periods(client, '30d')['previous'] is None


def test_the_previous_window_is_the_same_length_and_immediately_before(client):
    user = db.find_row('users', 'tester', key='username')
    db.update_row('users', user['id'], {'created_at': ago(400) + 'T00:00:00'})
    finish(client, xp=50)

    scored = periods(client, '30d')
    assert scored['days'] == 30
    assert scored['previous']['end'] == ago(30)
    assert scored['previous']['start'] == ago(59)


def test_growth_is_reported_against_the_previous_windows_score(client):
    """The percentage is a movement in the graded score, not in raw XP."""
    user = db.find_row('users', 'tester', key='username')
    db.update_row('users', user['id'], {'created_at': ago(400) + 'T00:00:00'})
    # A little in the earlier window, a lot more in the recent one.
    for day in range(31, 58, 6):
        finish(client, xp=20, when=ago(day))
    for day in range(0, 28, 2):
        finish(client, xp=120, when=ago(day))

    scored = periods(client, '30d')
    assert scored['current']['overall'] > scored['previous']['overall']
    assert scored['change']['overall'] > 0


def test_growth_from_a_zero_score_is_a_dash_and_not_a_hundred_per_cent(client):
    """There is no percentage of nothing, and the tab does not invent one.

    The backend's older week-over-week `_trend` calls this +100%, which is a
    number chosen to fill a slot rather than measured. A reader is not left
    without the news: the card prints the two scores either side of an arrow,
    so "0 -> 44" is on the screen with the dash beside it.
    """
    user = db.find_row('users', 'tester', key='username')
    db.update_row('users', user['id'], {'created_at': ago(400) + 'T00:00:00'})
    for day in range(0, 28, 2):
        finish(client, xp=120, when=ago(day))

    scored = periods(client, '30d')
    assert scored['previous']['overall'] == 0
    assert scored['change']['overall'] is None
    assert scored['current']['overall'] > 0


# --------------------------------------------------------------------------
# The line
# --------------------------------------------------------------------------
def test_the_line_ends_on_the_periods_last_day(client):
    """The last point is the reading the rest of the tab states.

    The samples are stepped, so the walk usually stops short of the end; the
    final point is added back deliberately. A line whose right-hand end is four
    days before the figure printed above it is a line that disagrees with the
    page.
    """
    finish(client, xp=50)
    scored = periods(client, '365d')

    assert scored['series'][-1]['date'] == scored['end']
    assert scored['series'][0]['date'] == scored['start']


def test_the_line_is_capped_so_a_long_period_is_not_a_thousand_points(client):
    finish(client, xp=50)
    user = db.find_row('users', 'tester', key='username')
    db.update_row('users', user['id'], {'created_at': ago(1800) + 'T00:00:00'})

    scored = periods(client, 'all')
    assert len(scored['series']) <= analytics.MAX_SERIES_POINTS + 1


def test_every_point_carries_all_five_metrics_and_the_overall(client):
    """The chart lets the reader switch between them, so every point has all."""
    finish(client, xp=50)
    point = periods(client, '30d')['series'][0]

    for name in analytics.METRICS:
        assert name in point
    assert 'overall' in point and 'date' in point


def test_a_points_window_is_held_between_a_week_and_a_month(client):
    """Each point is a trailing window, because a day is not a reading.

    Consistency over one day is 0 or 100, and quality over a day nobody rated
    is not a reading at all — so the line is a moving average, and the tab
    prints the window length rather than letting it be a secret.
    """
    finish(client, xp=50)
    user = db.find_row('users', 'tester', key='username')
    db.update_row('users', user['id'], {'created_at': ago(1800) + 'T00:00:00'})

    assert periods(client, '7d')['trend_window'] == analytics.MIN_TREND_WINDOW
    assert periods(client, 'all')['trend_window'] == analytics.MAX_TREND_WINDOW


# --------------------------------------------------------------------------
# The row of cards
# --------------------------------------------------------------------------
def test_every_period_is_summarised_so_the_row_costs_no_extra_call(client):
    """The six cards are the control and the overview at once."""
    finish(client, xp=50)
    cards = periods(client, '30d')['periods']

    assert [card['key'] for card in cards] == list(analytics.PERIOD_KEYS)
    assert all('overall' in card and 'change' in card for card in cards)


def test_an_unknown_period_falls_back_rather_than_failing(client):
    """A stale bookmark or a typed URL is not a 500."""
    finish(client, xp=50)
    assert periods(client, 'two weeks')['period'] == '30d'


def test_the_periods_need_a_session(anon):
    assert anon.get('/api/growth_periods').status_code == 401


# --------------------------------------------------------------------------
# Quality, and goals with nothing to divide by
# --------------------------------------------------------------------------
def _day(**figures):
    return {**analytics.empty_day(), 'xp': 100, 'earned': True, 'worked': True, **figures}


def _rated(count, difficulty=3, execution=3):
    return _day(tasks=count, task_xp=count * 40, rated=count,
                quality_sum=count * difficulty * execution,
                difficulty_sum=count * difficulty, execution_sum=count * execution)


def _scored(row, goal=100):
    today = date.today()
    return analytics.score_window({today.isoformat(): row}, today, today, goal)


def test_quality_has_no_score_until_enough_tasks_are_rated():
    """No XP stand-in: it's a different scale, so the score jumped on the first rating."""
    for rated in range(0, analytics.QUALITY_MIN_RATED):
        scored = _scored(_rated(rated) if rated else _day(tasks=4, task_xp=400))
        assert scored['parts']['quality'] is None
        assert scored['figures']['quality']['basis'] == 'unrated'

    scored = _scored(_rated(analytics.QUALITY_MIN_RATED))
    assert scored['parts']['quality'] == 60
    assert scored['figures']['quality']['basis'] == 'ratings'


def test_xp_per_task_never_moves_the_quality_score_or_the_overall():
    small, huge = _scored(_day(tasks=1, task_xp=5)), _scored(_day(tasks=1, task_xp=500))
    assert small['parts'] == huge['parts']
    assert small['overall'] == huge['overall']


def test_the_overall_averages_only_the_parts_it_could_measure():
    scored = _scored(_day(tasks=1, task_xp=10))
    parts = scored['parts']
    assert parts['quality'] is parts['efficiency'] is parts['focus'] is None
    assert scored['overall'] == round((parts['productivity'] + parts['consistency']) / 2)


def test_a_first_rating_does_not_move_the_score():
    unrated = _scored(_day(tasks=2, task_xp=80))
    first = _scored(_rated(1, difficulty=1, execution=1))
    assert first['overall'] == unrated['overall']


def test_the_report_card_files_no_quality_row_with_nothing_to_score(client):
    finish(client, xp=40)
    card = client.post('/api/get_growth_ratings').json()
    assert card['metrics']['quality']['score'] is None
    assert card['metrics']['quality']['grade'] is None
    assert card['metrics']['quality']['basis'] == 'unrated'
    assert card['overall']['score'] is not None
    assert not [row for row in analytics.history('tester', 'quality')]
    assert analytics.history('tester', 'overall')


def test_the_growth_tab_reads_an_account_with_nothing_rated(client):
    finish(client, xp=40)
    data = periods(client, '30d')
    assert data['current']['parts']['quality'] is None
    assert data['current']['grades']['quality'] is None
    assert data['change']['quality'] is None
    assert all(point['quality'] is None for point in data['series'])


@pytest.mark.parametrize('goal', [0, 0.0, None, -5, '0', 'abc', ''])
def test_a_daily_goal_with_nothing_to_divide_by_reads_as_the_default(goal):
    scored = _scored(_day(), goal)
    assert scored['parts']['productivity'] == 100
    assert scored['figures']['productivity']['daily_goal'] == analytics.DEFAULT_DAILY_GOAL


def test_focus_logged_on_a_day_with_a_goal_of_zero_still_scores():
    """Two hours against no goal used to score 0, as if nothing was logged."""
    today = date.today()
    logged = {(today - timedelta(days=back)).isoformat(): {'seconds': 3600, 'goal_hours': 0}
              for back in range(analytics.FOCUS_MIN_DAYS)}
    rollup = analytics._daily_rollup('nobody', tasks=[], events=[], focus_history=logged)
    scored = analytics.score_window(rollup, today - timedelta(days=2), today, 100)
    assert scored['parts']['focus'] == 50


def test_every_analytics_read_works_with_no_goals_and_with_zero_targets(client):
    finish(client, xp=40)
    def reads():
        for path in ('/api/goal_forecast', '/api/next_actions', '/api/get_growth_ratings',
                     '/api/growth_periods', '/api/get_goals', '/api/metric_histories'):
            reply = client.get(path)
            assert reply.status_code == 200, path
            assert reply.json().get('success') is not False, path

    reads()
    for measure in ('number', 'milestones'):
        client.post('/api/add_goal', json={'title': 'Zero ' + measure, 'measure': measure,
                                           'target_number': 0, 'deadline': ago(-30)})
    reads()


def _finished(due, met, on=None):
    return {'status': 'done', 'completed_at': (on or date.today().isoformat()) + 'T12:00:00',
            'xp_value': 10, 'due_date': due, 'met_deadline': met}


def _efficiency(tasks):
    today = date.today()
    rollup = analytics._daily_rollup('nobody', tasks=tasks, events=[], focus_history={})
    return analytics.score_window(rollup, today, today, 100)


def test_a_task_with_no_due_date_is_not_on_time_or_late():
    """New undated tasks store no result and read as late; old ones hold either."""
    tasks = [_finished('', None), _finished(None, True), _finished('', False)] * 4
    scored = _efficiency(tasks)
    assert scored['figures']['efficiency']['deadline_tracked'] == 0
    assert scored['parts']['efficiency'] is None


def test_efficiency_waits_for_enough_due_dates_and_only_counts_those():
    enough = analytics.EFFICIENCY_MIN_DEADLINES
    few = [_finished('2026-01-01', False)] * (enough - 1)
    assert _efficiency(few)['parts']['efficiency'] is None

    mixed = [_finished('2026-01-01', True)] * enough + [_finished('', False)] * 20
    assert _efficiency(mixed)['parts']['efficiency'] == 100


def test_focus_waits_for_enough_days_and_never_counts_as_zero_before_that():
    today = date.today()
    logged = {today.isoformat(): {'seconds': 60, 'goal_hours': 2}}
    rollup = analytics._daily_rollup('nobody', tasks=[], events=[], focus_history=logged)
    scored = analytics.score_window(rollup, today, today, 100)
    assert scored['parts']['focus'] is None
    assert scored['figures']['focus']['focus_days'] == 1


def test_a_first_deadline_or_focus_session_does_not_move_the_score():
    bare = _scored(_day(tasks=2, task_xp=20))
    first = _scored(_day(tasks=2, task_xp=20, deadline_tracked=1, on_time=0,
                         focus_seconds=60.0, focus_goal_seconds=7200.0))
    assert first['overall'] == bare['overall']


def test_an_unmeasured_part_files_no_row_and_reads_on_the_growth_tab(client):
    finish(client, xp=40)
    card = client.post('/api/get_growth_ratings').json()
    for name in ('efficiency', 'focus'):
        assert card['metrics'][name]['score'] is None
        assert card['metrics'][name]['grade'] is None
        assert not analytics.history('tester', name)
    parts = periods(client, '30d')['current']['parts']
    assert parts['efficiency'] is None and parts['focus'] is None


# --------------------------------------------------------------------------
# Focus: what isn't logged still counts
# --------------------------------------------------------------------------
def _focus_score(logged, worked_only, length=10):
    """`logged` and `worked_only` are how many days back each kind of day was."""
    today = date.today()
    iso = lambda back: (today - timedelta(days=back)).isoformat()
    rollup = analytics._daily_rollup(
        'nobody',
        tasks=[{'status': 'done', 'completed_at': iso(back) + 'T12:00:00', 'xp_value': 10}
               for back in worked_only],
        events=[],
        focus_history={iso(back): {'seconds': 7200, 'goal_hours': 2} for back in logged})
    return analytics.score_window(rollup, today - timedelta(days=length - 1), today, 100)


def test_skipping_the_log_on_a_day_worked_lowers_focus():
    """Hitting the goal on three days and logging nothing on three more was 100%."""
    assert _focus_score((5, 6, 7), ())['parts']['focus'] == 100
    scored = _focus_score((5, 6, 7), (2, 3, 4))
    assert scored['parts']['focus'] == 50
    assert scored['figures']['focus']['goal_minutes'] == 720


def test_work_before_the_first_session_isnt_a_skipped_log():
    """Starting to use the timer can't punish the months before it."""
    assert _focus_score((0, 1, 2), (5, 6, 7))['parts']['focus'] == 100


def test_never_logging_is_left_out_rather_than_counted_against():
    assert _focus_score((), (0, 1, 2))['parts']['focus'] is None


def test_a_later_goal_is_the_one_a_skipped_day_is_held_to():
    today = date.today()
    iso = lambda back: (today - timedelta(days=back)).isoformat()
    rollup = analytics._daily_rollup(
        'nobody',
        tasks=[{'status': 'done', 'completed_at': iso(0) + 'T12:00:00', 'xp_value': 10}],
        events=[],
        focus_history={iso(3): {'seconds': 3600, 'goal_hours': 2},
                       iso(1): {'seconds': 3600, 'goal_hours': 4}})
    assert rollup[iso(0)]['focus_goal_seconds'] == 4 * 3600


# --------------------------------------------------------------------------
# Consistency: one set of days
# --------------------------------------------------------------------------
def _series(client):
    return client.get('/api/get_growth_data', params={'days': 0}).json()['growth_data']


def _worked_days(client):
    return {row['date'] for row in _series(client) if row['worked']}


def test_the_series_and_the_score_count_the_same_days_worked(client):
    """A finished task with no ledger event was a day for the score and not the tile."""
    finish(client, xp=40)
    made = client.post('/api/tasks', json={'name': 'unledgered', 'xp_reward': 10,
                                           'due_date': ''}).json()
    db.update_row('tasks', made['task_id'],
                  {'status': 'done', 'completed_at': ago(3) + 'T12:00:00'}, user_id='tester')
    client.post('/api/focus_sync', json={'date': ago(5), 'focused_seconds': 10, 'goal_hours': 2})

    worked = _worked_days(client)
    assert worked == {day for day, row in analytics._daily_rollup('tester').items() if row['worked']}
    assert ago(3) in worked and ago(5) in worked

    last = _series(client)[-90:]
    rate = sum(1 for row in last if row['worked']) / len(last) * 100
    card = client.post('/api/get_growth_ratings').json()
    assert card['metrics']['consistency']['score'] == round(rate)


def test_a_task_finished_later_reaches_the_cached_series(client):
    finish(client, xp=40)
    assert ago(4) not in _worked_days(client)
    made = client.post('/api/tasks', json={'name': 'later', 'xp_reward': 10, 'due_date': ''}).json()
    db.update_row('tasks', made['task_id'],
                  {'status': 'done', 'completed_at': ago(4) + 'T12:00:00'}, user_id='tester')
    assert ago(4) in _worked_days(client)


def test_the_stats_say_how_much_head_start_the_account_has(client):
    assert client.get('/api/stats').json()['stats']['head_start'] == 0
    db.insert_row('user_background', {'user_id': 'tester', 'head_start': 7, 'detail': 'detailed'})
    assert client.get('/api/stats').json()['stats']['head_start'] == 7

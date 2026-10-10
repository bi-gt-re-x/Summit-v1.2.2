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

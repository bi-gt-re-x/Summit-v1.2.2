"""Vacation mode: days the streak is paused for, and the grace day made visible.

A vacation day is not a missed day. That is the whole rule, and everything else
follows from where it is applied: the gap `refresh_streak` and `extend_streak`
measure skips vacation days, so a run survives a week away untouched, does not
spend its grace day on it, and does not grow either — the first task back
counts as the day after the last one before.

The other half of this file is `grace_status`, which is what the streak card
reads to say whether a grace day is ready, spent, or not yet earned.

See backend/tracking/xp.py, from `VACATION_MAX_DAYS` down.
"""
from datetime import date, timedelta

from backend.database import connection as db
from backend.tracking import xp

TODAY = date.today()


def ago(days):
    return (TODAY - timedelta(days=days)).isoformat()


def ahead(days):
    return (TODAY + timedelta(days=days)).isoformat()


def account(streak, last_seen_days_ago, grace=None, away=None):
    """A bare user row. `away` is a list of (first, last) days-ago pairs."""
    return {
        'current_streak': streak,
        'best_streak': max(streak, 10),
        'last_task_date': ago(last_seen_days_ago),
        'day_state': 'oldday',
        'streak_grace_day': grace,
        'streak_vacations': [[ago(a), ago(b)] for a, b in (away or [])],
    }


# --------------------------------------------------------------------------
# A vacation is not a missed day
# --------------------------------------------------------------------------
def test_a_week_away_does_not_end_a_three_day_run():
    """Too young for grace, so only the vacation can be what saves it."""
    user = account(streak=3, last_seen_days_ago=8, away=[(7, 1)])
    xp.refresh_streak(user)
    assert user['current_streak'] == 3


def test_and_the_first_task_back_counts_as_the_next_day():
    user = account(streak=3, last_seen_days_ago=8, away=[(7, 1)])
    assert xp.extend_streak(user) == 4
    assert user['streak_grace_day'] is None


def test_the_vacation_spends_no_grace():
    user = account(streak=20, last_seen_days_ago=8, away=[(7, 1)])
    xp.extend_streak(user)
    assert user['streak_grace_day'] is None


def test_today_on_vacation_is_not_at_risk():
    """Vacation from yesterday through tomorrow, nothing done: nothing missed."""
    user = {**account(streak=3, last_seen_days_ago=2),
            'streak_vacations': [[ago(1), ahead(1)]]}
    xp.refresh_streak(user)
    assert user['current_streak'] == 3


def test_a_missed_day_after_the_vacation_is_still_a_missed_day():
    """Back on day 1, not working until day 3: one ordinary missed day."""
    young = account(streak=3, last_seen_days_ago=6, away=[(5, 2)])
    xp.refresh_streak(young)
    assert young['current_streak'] == 0

    earned = account(streak=12, last_seen_days_ago=6, away=[(5, 2)])
    xp.refresh_streak(earned)
    assert earned['current_streak'] == 12
    assert earned['streak_grace_day'] == ago(1)


def test_two_missed_days_around_a_vacation_end_the_run():
    user = account(streak=12, last_seen_days_ago=7, away=[(5, 2)])
    xp.refresh_streak(user)
    assert user['current_streak'] == 0


# --------------------------------------------------------------------------
# Planning and ending one
# --------------------------------------------------------------------------
def test_a_vacation_starts_today_and_ends_on_the_day_given():
    user = account(streak=5, last_seen_days_ago=1)
    assert xp.plan_vacation(user, ahead(6)) is None
    assert user['streak_vacations'] == [[ago(0), ahead(6)]]
    assert xp.current_vacation(user, TODAY) == {
        'start': ago(0), 'end': ahead(6), 'active': True}


def test_it_cannot_end_in_the_past_or_run_past_a_month():
    user = account(streak=5, last_seen_days_ago=1)
    assert xp.plan_vacation(user, ago(1))
    assert xp.plan_vacation(user, 'soon')
    assert xp.plan_vacation(user, ahead(xp.VACATION_MAX_DAYS))
    assert xp.plan_vacation(user, ahead(xp.VACATION_MAX_DAYS - 1)) is None


def test_moving_the_end_keeps_the_days_already_taken():
    """Five days in, shortened to end tomorrow: the five stay covered."""
    user = account(streak=5, last_seen_days_ago=6, away=[(5, -5)])
    assert xp.plan_vacation(user, ahead(1)) is None
    assert user['streak_vacations'] == [[ago(5), ahead(1)]]


def test_the_month_is_counted_from_the_first_day_away():
    user = account(streak=5, last_seen_days_ago=21, away=[(20, -2)])
    assert xp.plan_vacation(user, ahead(10))


def test_ending_early_leaves_today_an_ordinary_day():
    user = account(streak=5, last_seen_days_ago=4, away=[(3, -4)])
    assert xp.end_vacation(user) is True
    assert user['streak_vacations'] == [[ago(3), ago(1)]]
    assert xp.current_vacation(user, TODAY) is None
    xp.refresh_streak(user)
    assert user['current_streak'] == 5


def test_ending_one_that_started_today_removes_it():
    user = account(streak=5, last_seen_days_ago=1, away=[(0, -3)])
    xp.end_vacation(user)
    assert user['streak_vacations'] is None


def test_old_vacations_are_dropped_once_nothing_reads_them():
    user = account(streak=30, last_seen_days_ago=0, away=[(40, 35), (5, 3)])
    xp.plan_vacation(user, ahead(2))
    assert user['streak_vacations'] == [[ago(5), ago(3)], [ago(0), ahead(2)]]


# --------------------------------------------------------------------------
# Where the grace day stands
# --------------------------------------------------------------------------
def test_a_young_run_is_told_how_far_off_its_grace_day_is():
    status = xp.grace_status(account(streak=4, last_seen_days_ago=0), TODAY)
    assert status['state'] == 'locked'
    assert status['days_to_earn'] == xp.GRACE_EARNED_AT - 4


def test_an_earned_run_with_nothing_spent_is_ready():
    status = xp.grace_status(account(streak=9, last_seen_days_ago=0), TODAY)
    assert status['state'] == 'ready'


def test_a_spent_one_says_the_day_it_comes_back_and_that_day_is_right():
    used = TODAY - timedelta(days=3)
    user = account(streak=20, last_seen_days_ago=0, grace=used.isoformat())
    status = xp.grace_status(user, TODAY)
    assert status['state'] == 'spent'
    back = date.fromisoformat(status['back_on'])

    # The day before it comes back, a missed day is not forgiven; on it, it is.
    def forgiven(missed):
        run = account(streak=20, last_seen_days_ago=0, grace=used.isoformat())
        run['last_task_date'] = (missed - timedelta(days=1)).isoformat()
        return xp._grace_available(run, missed - timedelta(days=1), missed + timedelta(days=1))

    assert not forgiven(back - timedelta(days=1))
    assert forgiven(back)
    assert xp.grace_status(user, back)['state'] == 'ready'


# --------------------------------------------------------------------------
# Through the API
# --------------------------------------------------------------------------
def _tester():
    return next(u for u in db.read_table('users') if u['username'] == 'tester')


def test_planning_one_through_the_api_saves_it_and_answers_with_the_stats(client):
    reply = client.post('/api/streak/vacation', json={'until': ahead(4)}).json()
    assert reply['success'], reply
    assert reply['stats']['vacation'] == {'start': ago(0), 'end': ahead(4), 'active': True}
    assert _tester()['streak_vacations'] == [[ago(0), ahead(4)]]

    settings = client.get('/api/settings').json()['settings']
    assert settings['streak_vacation']['end'] == ahead(4)
    assert settings['vacation_max_days'] == xp.VACATION_MAX_DAYS


def test_a_bad_one_is_refused_with_a_reason(client):
    reply = client.post('/api/streak/vacation', json={'until': ahead(90)}).json()
    assert reply['success'] is False
    assert 'at most' in reply['message']


def test_ending_one_through_the_api(client):
    client.post('/api/streak/vacation', json={'until': ahead(4)})
    reply = client.post('/api/streak/vacation/end').json()
    assert reply['success'] and reply['stats']['vacation'] is None


def test_the_stats_read_says_where_the_grace_day_stands(client):
    db.update_row('users', 'tester', {'current_streak': 12, 'last_task_date': ago(0),
                                      'streak_grace_day': ago(2)}, key='username')
    stats = client.get('/api/stats').json()['stats']
    assert stats['grace']['state'] == 'spent'
    assert stats['grace']['back_on'] == xp.grace_back_on(TODAY - timedelta(days=2)).isoformat()


def test_resetting_progress_clears_grace_and_vacations(client):
    db.update_row('users', 'tester', {'current_streak': 12, 'streak_grace_day': ago(2),
                                      'streak_vacations': [[ago(0), ahead(3)]]},
                  key='username')
    reply = client.post('/api/settings/reset',
                        json={'scope': 'progress', 'confirm': 'tester'}).json()
    assert reply['success'], reply
    row = _tester()
    assert not row.get('streak_grace_day') and not row.get('streak_vacations')

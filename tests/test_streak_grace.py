"""A streak survives one missed day, once it has earned that.

Miss a day and it went back to zero. For the person it is aimed at that is the
moment they stop — the number they were playing for is gone, and starting from
0 with a 27-day run behind them reads as pointless. The run is what the app is
asking them to protect, so the thing to protect is the run.

The rule has three parts, and all three matter:

* **One missed day**, not two. Two is not an off day.
* **Only once the run is `GRACE_EARNED_AT` days old.** Forgiveness from day one
  means working every other day for ever and being told it is a streak.
* **At most one per `GRACE_REFRESH_DAYS`.** A rate rather than a lifetime
  allowance, so a long run stays protected instead of using its one up in March.

The two functions that move a streak — `refresh_streak` on a page load and
`extend_streak` when a task lands — each decide this for themselves, because
nothing guarantees the first ran before the second. So every case here is
asserted through both paths.

See `_grace_available` in backend/tracking/xp.py.
"""
from datetime import date, timedelta

import pytest

from backend.database import connection as db
from backend.tracking import xp


def ago(days):
    return (date.today() - timedelta(days=days)).isoformat()


def account(streak, last_seen_days_ago, grace=None):
    """A bare user row — these two functions read and write nothing else."""
    return {
        'current_streak': streak,
        'best_streak': max(streak, 10),
        'last_task_date': ago(last_seen_days_ago),
        'day_state': 'oldday',
        'streak_grace_day': grace,
    }


# --------------------------------------------------------------------------
# The gap that is forgiven
# --------------------------------------------------------------------------
def test_a_missed_day_no_longer_ends_a_week_old_run():
    """The change itself, on the page-load path."""
    user = account(streak=12, last_seen_days_ago=2)
    xp.refresh_streak(user)
    assert user['current_streak'] == 12


def test_and_the_next_task_carries_it_on():
    """The completion path, from the same state. 12 becomes 13, not 1."""
    user = account(streak=12, last_seen_days_ago=2)
    assert xp.extend_streak(user) == 13


def test_the_forgiven_day_is_written_down():
    """It is the missed day itself, not today — the rate counts from it."""
    user = account(streak=12, last_seen_days_ago=2)
    xp.refresh_streak(user)
    assert user['streak_grace_day'] == ago(1)


# --------------------------------------------------------------------------
# The gaps that are not
# --------------------------------------------------------------------------
def test_two_missed_days_still_end_it():
    user = account(streak=12, last_seen_days_ago=3)
    xp.refresh_streak(user)
    assert user['current_streak'] == 0


def test_two_missed_days_restart_at_one_on_the_next_task():
    user = account(streak=12, last_seen_days_ago=3)
    assert xp.extend_streak(user) == 1


@pytest.mark.parametrize('streak', [1, 3, 6])
def test_a_run_shorter_than_a_week_has_not_earned_it(streak):
    """Otherwise every other day is a streak, which is not a streak."""
    user = account(streak=streak, last_seen_days_ago=2)
    xp.refresh_streak(user)
    assert user['current_streak'] == 0
    assert user['streak_grace_day'] is None


def test_a_run_of_exactly_a_week_has():
    """GRACE_EARNED_AT is a floor, not a threshold to pass."""
    user = account(streak=xp.GRACE_EARNED_AT, last_seen_days_ago=2)
    xp.refresh_streak(user)
    assert user['current_streak'] == xp.GRACE_EARNED_AT


# --------------------------------------------------------------------------
# The rate
# --------------------------------------------------------------------------
def test_a_second_missed_day_within_the_month_is_not_forgiven():
    """One a month. The first was a week ago, so this one costs the run."""
    user = account(streak=20, last_seen_days_ago=2, grace=ago(9))
    xp.refresh_streak(user)
    assert user['current_streak'] == 0


def test_a_missed_day_after_the_month_is_up_is_forgiven_again():
    """A long run stays protected rather than spending its one allowance."""
    user = account(streak=200, last_seen_days_ago=2,
                   grace=ago(xp.GRACE_REFRESH_DAYS + 5))
    xp.refresh_streak(user)
    assert user['current_streak'] == 200
    assert user['streak_grace_day'] == ago(1)


def test_a_broken_run_drops_its_spent_grace():
    """The next run is a new run and earns its own."""
    user = account(streak=20, last_seen_days_ago=5, grace=ago(3))
    xp.extend_streak(user)
    assert user['current_streak'] == 1
    assert user['streak_grace_day'] is None


# --------------------------------------------------------------------------
# The two paths agreeing
# --------------------------------------------------------------------------
def test_asking_twice_about_one_missed_day_is_not_two_graces():
    """A page load then a task, which is the ordinary way round.

    `refresh_streak` records the forgiveness; `extend_streak` asks again a
    moment later and must read it as the same one rather than as an allowance
    already spent — or opening the app before finishing a task would be what
    broke the streak.
    """
    user = account(streak=12, last_seen_days_ago=2)
    xp.refresh_streak(user)
    assert xp.extend_streak(user) == 13
    assert user['streak_grace_day'] == ago(1)


def test_a_task_with_no_page_load_first_is_scored_the_same():
    """The other order, which is why the check is not read off the record."""
    without = account(streak=12, last_seen_days_ago=2)
    with_load = account(streak=12, last_seen_days_ago=2)
    xp.refresh_streak(with_load)

    assert xp.extend_streak(without) == xp.extend_streak(with_load) == 13


def test_refreshing_twice_in_a_day_changes_nothing_the_second_time():
    """`refresh_streak` returns whether the row needs saving."""
    user = account(streak=12, last_seen_days_ago=2)
    xp.refresh_streak(user)
    assert xp.refresh_streak(user) is False


# --------------------------------------------------------------------------
# What must not have changed
# --------------------------------------------------------------------------
def test_an_unbroken_run_still_just_counts_up():
    user = account(streak=4, last_seen_days_ago=1)
    assert xp.extend_streak(user) == 5
    assert user['streak_grace_day'] is None


def test_a_second_task_the_same_day_does_not_count_twice():
    user = account(streak=4, last_seen_days_ago=0)
    assert xp.extend_streak(user) == 4


def test_the_record_is_never_lowered_by_a_break():
    user = account(streak=12, last_seen_days_ago=9)
    user['best_streak'] = 30
    xp.refresh_streak(user)
    assert user['current_streak'] == 0
    assert user['best_streak'] == 30


def test_an_account_that_has_never_finished_anything_is_left_alone():
    user = account(streak=0, last_seen_days_ago=0)
    user['last_task_date'] = None
    assert xp.refresh_streak(user) is False


# --------------------------------------------------------------------------
# Whether an empty today would be forgiven — what the warning asks
# --------------------------------------------------------------------------
def test_a_week_old_run_that_worked_yesterday_would_survive_an_empty_today():
    user = account(streak=12, last_seen_days_ago=1)
    assert xp.grace_covers_today(user, date.today()) is True


def test_a_run_too_young_for_grace_would_not():
    user = account(streak=xp.GRACE_EARNED_AT - 1, last_seen_days_ago=1)
    assert xp.grace_covers_today(user, date.today()) is False


def test_a_run_that_spent_its_grace_recently_would_not():
    user = account(streak=20, last_seen_days_ago=1, grace=ago(10))
    assert xp.grace_covers_today(user, date.today()) is False


def test_a_run_already_leaning_on_grace_for_yesterday_would_not():
    """Yesterday was the forgiven day, so an empty today is a second one."""
    user = account(streak=12, last_seen_days_ago=2)
    xp.refresh_streak(user)
    assert user['current_streak'] == 12
    assert xp.grace_covers_today(user, date.today()) is False


def test_no_streak_has_nothing_to_cover():
    user = account(streak=0, last_seen_days_ago=1)
    assert xp.grace_covers_today(user, date.today()) is False


# --------------------------------------------------------------------------
# What a completion writes back
# --------------------------------------------------------------------------
def _tester():
    return next(u for u in db.read_table('users') if u['username'] == 'tester')


def _finish_one(client):
    task = client.post('/api/tasks', json={'name': 'one', 'xp_reward': 10}).json()['task_id']
    return client.post('/api/complete_task', json={'task_id': task}).json()


def test_a_completion_that_spends_grace_saves_the_day_it_covered(client):
    """Without a page load in between, nothing else would write it down."""
    db.update_row('users', 'tester', {'current_streak': 12, 'last_task_date': ago(2),
                                      'streak_grace_day': None}, key='username')
    reply = _finish_one(client)

    assert reply['current_streak'] == 13
    assert reply['last_task_date'] == date.today().isoformat()
    assert reply['streak_grace_day'] == ago(1)
    assert _tester()['streak_grace_day'] == ago(1)


def test_a_completion_that_starts_a_new_run_clears_the_old_runs_grace(client):
    """Left behind, it would hold the next run's grace back for a month."""
    db.update_row('users', 'tester', {'current_streak': 0, 'last_task_date': ago(5),
                                      'streak_grace_day': ago(8)}, key='username')
    _finish_one(client)
    assert _tester().get('streak_grace_day') is None


def test_the_stats_read_carries_the_days_the_strip_is_drawn_from(client):
    db.update_row('users', 'tester', {'current_streak': 12, 'last_task_date': ago(1),
                                      'streak_grace_day': ago(4)}, key='username')
    stats = client.get('/api/stats').json()['stats']
    assert stats['last_task_date'] == ago(1)
    assert stats['streak_grace_day'] == ago(4)

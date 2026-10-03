"""Goal health: three states, each decided by a rule a reader can check.

Behind means past its date, more than ten points behind the calendar, or
linked work that has gone quiet for a fortnight. Everything else that has
started is on track. The sentence under the chip names the rule that fired,
so these pin the sentence as well as the state.

Ported from frontend/src/utils/goalHealth.test.ts when the rule moved here.
"""
from datetime import date, timedelta

from backend.tracking.goal_health import goal_health

TODAY = date(2026, 10, 3)


def day(offset):
    return (TODAY + timedelta(days=offset)).isoformat()


def goal(**over):
    row = {
        'id': 'g-1', 'title': 'Qualify for AIME', 'status': 'active',
        'measure': 'number', 'target_number': 100, 'current_value': 50,
        'priority': 5, 'start_date': day(-30), 'created_at': day(-30) + 'T09:00:00',
        'deadline': day(30), 'milestones': [],
    }
    row.update(over)
    return row


def worked(n, goal_id='g-1'):
    """`n` finished tasks against the goal, one on each of the last `n` days."""
    return [{'id': 't-{}-{}'.format(goal_id, at), 'status': 'done', 'goal_id': goal_id,
             'completed_at': day(-at) + 'T10:00:00'} for at in range(n)]


def worked_on(days_ago, goal_id='g-1'):
    return [{'id': 't-old', 'status': 'done', 'goal_id': goal_id,
             'completed_at': day(-days_ago) + 'T10:00:00'}]


def health(one, tasks):
    return goal_health(one, tasks, TODAY)


def test_on_track_when_keeping_pace_and_worked():
    found = health(goal(), worked(3))
    assert found['state'] == 'on-track'
    assert found['label'] == 'On Track'
    assert 'worked on 3 times in the last fortnight' in found['reason']


def test_behind_when_trailing_the_calendar_by_more_than_ten_points():
    found = health(goal(current_value=20), worked(3))
    assert found['state'] == 'behind'
    assert found['reason'].startswith('30 points behind where the calendar says it should be')


def test_not_behind_for_trailing_by_less_than_that():
    assert health(goal(current_value=45), worked(3))['state'] == 'on-track'


def test_behind_once_its_date_has_passed():
    found = health(goal(deadline=day(-2)), worked(3))
    assert found['state'] == 'behind'
    assert found['reason'] == 'Its date passed 2 days ago and it is 50% done.'


def test_behind_when_linked_work_has_gone_quiet_for_a_fortnight():
    found = health(goal(), worked_on(20))
    assert found['state'] == 'behind'
    assert found['reason'] == 'Nothing done toward this in 20 days.'


def test_not_called_quiet_when_nothing_was_ever_linked():
    assert health(goal(deadline=''), [])['state'] == 'on-track'


def test_not_started_rather_than_failing_before_anything_is_recorded():
    found = health(goal(current_value=0), [])
    assert found['state'] == 'not-started'
    assert found['label'] == 'Not Started'


def test_reached_goal_reads_complete():
    assert health(goal(status='completed'), [])['label'] == 'Complete'


def test_counter_goal_reads_the_whole_record_as_evidence():
    # A streak goal has no links of its own; every task feeds it.
    streak = goal(measure='streak', current_streak=10, target_streak=20)
    unlinked = [{'id': 'x', 'status': 'done', 'completed_at': day(0)}]
    assert 'worked on 1 time' in health(streak, unlinked)['reason']


def test_rounds_halves_up_the_way_the_page_always_has():
    # 12.5% done: JavaScript printed 13, Python's round would print 12.
    found = health(goal(current_value=12.5, start_date=day(-1), deadline=day(1000)), worked(1))
    assert found['reason'].startswith('13% done')


def test_get_goals_attaches_health_to_every_goal(client):
    client.post('/api/add_goal', json={'title': 'Read more', 'goal_type': 'xp', 'target_xp': 500})
    reply = client.get('/api/get_goals').json()
    assert reply['success'], reply
    health = reply['goals'][-1]['health']
    assert health['state'] == 'not-started'
    assert set(health['signals']) >= {'progress', 'daysLeft', 'daysSinceWork'}

"""Goal health: three states, each decided by a rule a reader can check.

Behind means past its date, more than ten points behind the calendar, or
linked work that has gone quiet for two weeks. Everything else that has
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
    assert found['label'] == 'On track'
    assert 'worked on 3 times in the last two weeks' in found['reason']


def test_behind_when_trailing_the_calendar_by_more_than_ten_points():
    found = health(goal(current_value=20), worked(3))
    assert found['state'] == 'behind'
    assert found['reason'].startswith('30 points behind schedule')


def test_not_behind_for_trailing_by_less_than_that():
    assert health(goal(current_value=45), worked(3))['state'] == 'on-track'


def test_behind_once_its_date_has_passed():
    found = health(goal(deadline=day(-2)), worked(3))
    assert found['state'] == 'behind'
    assert found['reason'] == "Its date passed 2 days ago and it's 50% done."


def test_behind_when_linked_work_has_gone_quiet_for_two_weeks():
    found = health(goal(), worked_on(20))
    assert found['state'] == 'behind'
    # This goal has no subject, so the line also says how to fix that.
    assert found['reason'] == ('Nothing done toward this in 20 days. '
                               'Add a subject so your work in it counts.')


def test_not_called_quiet_when_nothing_was_ever_linked():
    assert health(goal(deadline=''), [])['state'] == 'on-track'


def test_not_started_rather_than_failing_before_anything_is_recorded():
    found = health(goal(current_value=0), [])
    assert found['state'] == 'not-started'
    assert found['label'] == 'Not started'


def test_reached_goal_reads_complete():
    assert health(goal(status='completed'), [])['label'] == 'Complete'


def test_counter_goal_reads_the_whole_record_as_evidence():
    # A counter goal has no links of its own; every task feeds it.
    counter = goal(measure='tasks', current_tasks=10, target_tasks=20)
    unlinked = [{'id': 'x', 'status': 'done', 'completed_at': day(0)}]
    assert 'worked on 1 time' in health(counter, unlinked)['reason']


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


# ---------------------------------------------------------------------------
# Work in the goal's subject, and the gentler calendar (2026-11-08)
# ---------------------------------------------------------------------------
def in_subject(n, subject='python', days_ago=0):
    """`n` finished tasks filed under a subject, linked to nothing."""
    return [{'id': 's-{}-{}'.format(subject, at), 'status': 'done', 'subject': subject,
             'completed_at': day(-(days_ago + at)) + 'T10:00:00'} for at in range(n)]


def stones(done, total):
    return [{'id': 'm{}'.format(i), 'status': 'done' if i < done else 'todo'} for i in range(total)]


def outcome(**over):
    row = {'measure': 'milestones', 'subject_ids': 'python', 'milestones': stones(1, 4)}
    row.update(over)
    return goal(**row)


def test_work_in_the_goals_subject_keeps_it_from_reading_quiet():
    # Nothing linked, but Python work every day: not "nothing done in 20 days".
    found = health(outcome(), worked_on(20) + in_subject(3))
    assert found['state'] == 'on-track'
    assert 'Worked on it 3 times' in found['reason'] or 'worked on 3 times' in found['reason']


def test_subject_work_never_counts_as_progress():
    found = health(outcome(), in_subject(5))
    assert found['signals']['progress'] == 0.25


def test_working_but_behind_the_calendar_reads_working_on_it():
    # 25% done at the halfway mark: 25 points behind, but worked on lately.
    found = health(outcome(), in_subject(4))
    assert found['state'] == 'on-track'
    assert found['label'] == 'Working on it'
    assert found['reason'] == 'Worked on it 4 times in the last two weeks. Tick a checkpoint when you reach one.'


def test_still_behind_when_far_behind_even_with_work():
    # 25% done with 83% of the time gone: 58 points behind.
    found = health(outcome(start_date=day(-50), deadline=day(10)), in_subject(4))
    assert found['state'] == 'behind'


def test_behind_the_calendar_with_no_recent_work_is_still_behind():
    found = health(outcome(), worked_on(15))
    assert found['state'] == 'behind'


def test_nothing_is_behind_the_calendar_in_its_first_week():
    young = outcome(milestones=stones(0, 4), start_date=day(-5), deadline=day(10))
    found = health(young, worked(1))
    assert found['state'] == 'on-track'
    assert found['label'] == 'Working on it'


def test_subject_work_before_the_goal_began_does_not_count():
    found = health(outcome(milestones=stones(0, 4)), in_subject(3, days_ago=40))
    assert found['state'] == 'not-started'


def test_a_goal_with_no_subject_gets_no_subject_work():
    found = health(outcome(subject_ids=''), in_subject(3) + worked_on(20))
    assert found['state'] == 'behind'


def test_counter_goals_are_unchanged_by_subjects():
    counter = goal(measure='tasks', current_tasks=10, target_tasks=20, subject_ids='python')
    assert 'worked on 1 time' in health(counter, [{'id': 'x', 'status': 'done', 'completed_at': day(0)}])['reason']


def test_a_streak_with_plenty_of_days_left_is_not_behind():
    # 14-day streak, 1 day in, 151 days left: the calendar can't call that late.
    streak = goal(measure='streak', current_streak=1, target_streak=14,
                  start_date=day(-200), deadline=day(151))
    found = health(streak, worked(1))
    assert found['state'] == 'on-track'
    assert found['reason'] == '13 more days in a row does it.'


def test_a_streak_without_enough_days_left_is_behind():
    streak = goal(measure='streak', current_streak=1, target_streak=60,
                  start_date=day(-200), deadline=day(31))
    found = health(streak, worked(1))
    assert found['state'] == 'behind'
    assert found['reason'] == 'It needs 59 more days in a row and there are 31 days left.'


def test_a_goal_with_no_subject_is_told_how_to_count_its_work():
    found = health(outcome(subject_ids=''), worked_on(20))
    assert found['reason'].endswith('Add a subject so your work in it counts.')


def test_a_goal_with_a_subject_gets_no_such_nudge():
    found = health(outcome(), worked_on(20))
    assert 'Add a subject' not in found['reason']


def test_a_goal_made_today_is_not_behind_for_older_linked_work():
    # The matcher links older tasks to a new goal. A goal made a minute ago
    # read "Nothing done toward this in 24 days" before this.
    fresh = outcome(milestones=stones(0, 5), start_date=day(0),
                    created_at=day(0) + 'T09:00:00', deadline=day(200))
    found = health(fresh, worked_on(24))
    assert found['state'] == 'not-started'


def test_quiet_is_never_longer_than_the_goal_has_existed():
    young = outcome(start_date=day(-10), created_at=day(-10) + 'T09:00:00', deadline=day(200))
    found = health(young, worked_on(24) + worked_on(5))
    assert found['state'] == 'on-track'
    assert found['signals']['daysSinceWork'] == 5

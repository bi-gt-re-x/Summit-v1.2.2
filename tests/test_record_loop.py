"""The loop the plan was missing: ask what went wrong, then use it.

Scores and reasons go in through /api/rate_task; the plan, the booking button,
the clear button and the goal planner's brief read them back out. See
backend/tracking/record.py.
"""
from datetime import date, datetime, timedelta

from backend.database import connection as db
from backend.tracking import planner, record


def make_task(client, name, **over):
    reply = client.post('/api/tasks', json=dict({'name': name, 'xp_reward': 20}, **over)).json()
    return reply['task_id']


def row(task_id):
    return db.find_row('tasks', task_id, user_id='tester')


# ---- Scores ---------------------------------------------------------------
def test_a_score_is_stored_with_the_rating(client):
    task_id = make_task(client, 'Quadratics #1-10')
    client.post('/api/complete_tasks', json={'task_ids': [task_id]})
    reply = client.post('/api/rate_task', json={'task_id': task_id, 'execution': 2,
                                                'reason': 'unclear', 'score_got': 6,
                                                'score_of': 10}).json()
    assert reply['success']
    assert (reply['score_got'], reply['score_of']) == (6, 10)
    assert (row(task_id)['score_got'], row(task_id)['score_of'], row(task_id)['reason']) == (6, 10, 'unclear')


def test_a_score_alone_is_enough_to_save(client):
    task_id = make_task(client, '5 DP problems')
    reply = client.post('/api/rate_task', json={'task_id': task_id, 'score_got': 5, 'score_of': 5}).json()
    assert reply['success']


def test_a_score_that_cannot_be_right_is_refused(client):
    task_id = make_task(client, 'Set')
    for bad in ({'score_got': 11, 'score_of': 10}, {'score_got': 3}, {'score_got': -1, 'score_of': 4},
                {'score_got': 0, 'score_of': 0}):
        reply = client.post('/api/rate_task', json=dict({'task_id': task_id}, **bad)).json()
        assert not reply['success'], bad
    assert row(task_id).get('score_got') is None


# ---- Booking the sessions a date asks for ---------------------------------
def goal(**over):
    today = date.today()
    fields = {'id': 'g-contest', 'user_id': 'tester', 'title': 'USACO December', 'status': 'active',
              'deadline': (today + timedelta(days=30)).isoformat(),
              'start_date': (today - timedelta(days=10)).isoformat(),
              'created_at': (today - timedelta(days=10)).isoformat(),
              'subject_ids': 'computer_science', 'progress': 30}
    fields.update(over)
    db.insert_row('goals', fields)
    return fields['id']


def test_booking_puts_one_session_a_day_on_the_calendar_linked_to_the_goal(client):
    goal_id = goal()
    reply = client.post('/api/next_actions/book', json={'goal_id': goal_id}).json()
    assert reply['success'], reply
    booked = reply['booked']
    assert booked
    days = [one['start'][:10] for one in booked]
    assert len(set(days)) == len(days)
    for one in booked:
        made = row(one['task_id'])
        assert made['goal_id'] == goal_id
        assert made['subject'] == 'computer_science'
        assert made['show_on_calendar'] in (True, 1)
    # Booked once, the week is covered: asking again books nothing.
    again = client.post('/api/next_actions/book', json={'goal_id': goal_id}).json()
    assert not again['success']


def test_booking_needs_a_live_goal_of_this_account(client):
    reply = client.post('/api/next_actions/book', json={'goal_id': 'nope'}).json()
    assert not reply['success']


# ---- Clearing leftovers ---------------------------------------------------
def test_clearing_removes_only_leftover_routines(client):
    old = (date.today() - timedelta(days=3)).isoformat()
    routines = [make_task(client, 'Morning meditation', due_date=old) for _ in range(3)]
    one_off = make_task(client, 'Essay draft', due_date=old)
    future = make_task(client, 'Morning meditation', due_date=(date.today() + timedelta(days=2)).isoformat())
    reply = client.post('/api/next_actions/clear',
                        json={'task_ids': routines + [one_off, future]}).json()
    assert sorted(reply['cleared']) == sorted(routines)
    assert all(row(task_id) is None for task_id in routines)
    assert row(one_off) and row(future)


# ---- The planner hears the record -----------------------------------------
def test_the_goal_planner_brief_carries_the_record(client, monkeypatch):
    goal_id = goal()
    worked = make_task(client, 'Knapsack #1-8', subject='computer_science')
    client.post('/api/complete_tasks', json={'task_ids': [worked]})
    client.post('/api/rate_task', json={'task_id': worked, 'score_got': 3, 'score_of': 8})
    seen = {}

    def fake(title, **kwargs):
        seen.update(kwargs)
        return ['a', 'b', 'c', 'd', 'e']
    monkeypatch.setattr(planner, 'suggest_milestones', fake)
    assert client.post('/api/suggest_milestones', json={'goal_id': goal_id}).json()['success']
    lines = seen['record']
    assert lines[0] == 'Days left: 30. That pace needs about 4 sessions a week.'
    assert 'Worked on this on 1 of the last 14 days.' in lines
    assert 'Their most recent work on it: "Knapsack #1-8" (3/8 right).' in lines


def test_the_brief_says_where_they_stand_and_why_it_goes_badly():
    now = datetime(2026, 10, 15, 9, 0)
    tasks = [{'id': str(at), 'title': 'Set {}'.format(at), 'status': 'done', 'subject': 'maths',
              'completed_at': '2026-10-{:02d}T12:00:00'.format(10 + at), 'execution': 2,
              'reason': 'unclear', 'score_got': 2, 'score_of': 5} for at in range(4)]
    lines = record.brief_lines({'id': 'g', 'title': 'AIME', 'deadline': '2026-11-14',
                                'subject_ids': 'maths', 'current_value': 9, 'target_number': 12},
                               tasks, now)
    assert 'Where they are now: 9 of 12.' in lines
    assert 'maths: got 8 of their last 20 problems right (40%). Weakest: "Set 0" 2/5, "Set 1" 2/5.' in lines
    assert 'Why sessions go badly: "Did not know where to start" on 4 of the last 4 rough ones.' in lines


def test_a_new_goal_with_no_record_adds_nothing_to_the_brief():
    assert record.brief_lines({'id': 'g', 'title': 'Learn guitar'}, [], datetime(2026, 10, 15)) == []

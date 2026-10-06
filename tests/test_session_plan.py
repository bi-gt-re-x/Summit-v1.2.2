"""Plan my next session: estimate, XP, the next free slot, and the lock."""
from datetime import datetime

from backend.database import connection as db
from backend.tracking import session_plan as plan


def test_minutes_come_from_the_step_or_its_difficulty():
    assert plan.estimate_minutes(42, 3) == 45
    assert plan.estimate_minutes(None, 1) == 20
    assert plan.estimate_minutes(900, 5) == 75


def test_xp_scales_with_length_and_difficulty_inside_the_dialog_range():
    assert plan.xp_for(45, 3) == 25
    assert plan.xp_for(90, 5) > plan.xp_for(90, 2)
    assert plan.xp_for(5, 1) == plan.MIN_XP
    assert plan.xp_for(10_000, 5) == plan.MAX_XP


def test_the_slot_skips_tasks_and_events_in_the_way():
    now = datetime(2026, 10, 6, 8, 7)
    tasks = [{'show_on_calendar': 1, 'created_at': '2026-10-06T08:15:00',
              'due_date': '2026-10-06T09:00:00'}]
    calendar = {'2026-10-6': {'timestamps': [{'startTime': '09:00', 'endTime': '10:30'}]}}
    busy = plan.busy_spans(tasks, calendar, now)
    assert plan.next_slot(30, busy, now) == (datetime(2026, 10, 6, 10, 30),
                                             datetime(2026, 10, 6, 11, 0))


def test_late_in_the_day_it_moves_to_tomorrow_morning():
    now = datetime(2026, 10, 6, 21, 50)
    start, _ = plan.next_slot(45, [], now)
    assert start == datetime(2026, 10, 7, plan.DAY_START, 0)


def _recommend(username='tester', minutes=40, difficulty=3):
    row = db.insert_row('subject_recommendations', {
        'id': 'rplan{}'.format(datetime.now().timestamp()), 'user_id': username,
        'subject': 'Algebra', 'given_at': '2026-10-06T10:00:00',
        'title': 'Sprint #1-10', 'focus': '', 'kind': 'targeted_practice',
        'difficulty': difficulty, 'minutes': minutes, 'reason': '', 'signal': ''})
    return row['id']


def _state(client, rec_id):
    rows = client.get('/api/subject_recommendations?subject=Algebra').json()['recommendations']
    return next(row for row in rows if row['id'] == rec_id)


def test_planning_books_a_task_and_locks_the_step_until_it_is_deleted(client):
    rec = _recommend()
    body = client.post('/api/subject_recommendation/plan', json={'id': rec}).json()
    assert body['success'], body
    task = db.find_row('tasks', body['task']['id'], user_id='tester')
    assert task['xp_value'] == body['task']['xp'] > 0
    assert task['created_at'] < task['due_date']
    assert _state(client, rec)['state'] == 'planned'

    again = client.post('/api/subject_recommendation/plan', json={'id': rec}).json()
    assert not again['success']

    client.delete('/api/tasks/{}'.format(task['id']))
    assert _state(client, rec)['state'] == 'open'
    assert client.post('/api/subject_recommendation/plan', json={'id': rec}).json()['success']


def test_completing_the_task_marks_the_step_done(client):
    rec = _recommend()
    task_id = client.post('/api/subject_recommendation/plan', json={'id': rec}).json()['task']['id']
    client.post('/api/complete_task', json={'task_id': task_id})
    row = _state(client, rec)
    assert row['state'] == 'done' and row['taken']
    assert not client.post('/api/subject_recommendation/plan', json={'id': rec}).json()['success']


def test_another_account_cannot_plan_my_step(client, stranger):
    rec = _recommend()
    body = stranger.post('/api/subject_recommendation/plan', json={'id': rec}).json()
    assert not body['success']

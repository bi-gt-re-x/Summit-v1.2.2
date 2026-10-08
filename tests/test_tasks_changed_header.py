"""A response says when its request changed the task list —
backend/middleware/writes.py and `WRITTEN` in backend/database/connection.py.

The browser refreshes its copies of the tasks off this header, so it has to
be there for every kind of task write and absent for everything else."""
from backend.database import connection as db

HEADER = 'X-Summit-Tasks-Changed'


def _new(client, name='Read chapter 3'):
    reply = client.post('/api/tasks', json={'name': name, 'priority': 'low', 'xp_reward': 10})
    assert reply.json()['success'], reply.json()
    return reply


def test_creating_a_task_says_so(client):
    assert _new(client).headers.get(HEADER) == '1'


def test_completing_editing_and_deleting_say_so(client):
    task_id = _new(client).json()['task_id']
    assert client.put('/api/tasks/{}'.format(task_id), json={'name': 'Renamed'}).headers.get(HEADER) == '1'
    assert client.post('/api/complete_task', json={'task_id': task_id}).headers.get(HEADER) == '1'
    assert client.delete('/api/tasks/{}'.format(task_id)).headers.get(HEADER) == '1'


def test_planning_a_recommended_session_says_so(client):
    db.insert_row('subject_recommendations', {
        'id': 'rhdr1', 'user_id': 'tester', 'subject': 'Algebra',
        'given_at': '2026-10-06T10:00:00', 'title': 'Sprint #1-10', 'focus': '',
        'kind': 'targeted_practice', 'difficulty': 3, 'minutes': 40, 'reason': '', 'signal': ''})
    reply = client.post('/api/subject_recommendation/plan', json={'id': 'rhdr1'})
    assert reply.json()['success'] and reply.headers.get(HEADER) == '1'


def test_reading_tasks_does_not(client):
    _new(client)
    assert HEADER not in client.get('/api/tasks').headers


def test_writing_something_else_does_not(client):
    assert HEADER not in client.post('/api/spaces/1', json={'name': 'Ideas'}).headers


def test_the_table_is_read_off_the_statement():
    tables = set()
    token = db.WRITTEN.set(tables)
    try:
        for statement in ('INSERT INTO tasks (id) VALUES (1)', 'update "tasks" set x=1',
                          'DELETE FROM task_goal_matches WHERE 1', 'INSERT OR REPLACE INTO notes VALUES (1)',
                          'SELECT * FROM tasks', 'PRAGMA table_info(tasks)'):
            db._note_write(statement)
    finally:
        db.WRITTEN.reset(token)
    assert tables == {'tasks', 'task_goal_matches', 'notes'}

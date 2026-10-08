"""A GET request never writes to the database.

Reads that wrote — a streak decayed, a badge awarded, notifications swept,
grades filed, goals synced, recommendations stamped — meant nothing could be
read without changing it: not a page prefetched, not a response cached, not
the database inspected while debugging. Each of those writes is now done by
an explicit POST the app calls (the same path, as a POST), and the GETs only
read.

This calls every GET route the app has, against an account set up so that
each of those old writes would fire, and fails on any statement that writes.
A new GET that writes fails here the day it is added.
"""
from datetime import date, timedelta

from backend.database import connection as db

#: GET routes whose path takes a parameter, with a value to call them with.
#: Routes not listed here and not taking one are found from the app itself.
WITH_PARAMS = {
    '/api/subject_recommendations': '?subject=Algebra',
    '/api/subject_reading_saved': '?subject=Algebra',
    '/api/next_sessions': '',
    '/api/notifications': '?day={today}&at=09:00',
}


def _account_with_every_old_write_due(client):
    """Tasks, a finished and a deleted planned session, a stale streak, a
    streak goal, notifications on."""
    done = client.post('/api/tasks', json={'name': 'Proof set 1', 'priority': 'low',
                                           'xp_reward': 20, 'subject': 'mathematics'}).json()['task_id']
    client.post('/api/complete_task', json={'task_id': done})
    gone = client.post('/api/tasks', json={'name': 'Sprint', 'priority': 'low', 'xp_reward': 20}).json()['task_id']
    client.post('/api/tasks', json={'name': 'Open one', 'priority': 'low', 'xp_reward': 20})
    for rec, task in (('rget1', done), ('rget2', gone)):
        db.insert_row('subject_recommendations', {
            'id': rec, 'user_id': 'tester', 'subject': 'Algebra', 'given_at': '2026-10-01T10:00:00',
            'title': 'Sprint #1-10', 'focus': '', 'kind': 'targeted_practice', 'difficulty': 3,
            'minutes': 40, 'reason': '', 'signal': '', 'task_id': task})
    client.delete('/api/tasks/{}'.format(gone))
    client.post('/api/add_goal', json={'title': 'Ten-day streak', 'goal_type': 'streak', 'target_streak': 10})

    user = db.find_row('users', 'tester', key='username')
    stale = (date.today() - timedelta(days=5)).isoformat()
    db.update_row('users', user['id'], {'current_streak': 7, 'last_task_date': stale, 'day_state': 'oldday'})


def test_no_get_request_writes(client, monkeypatch):
    _account_with_every_old_write_due(client)

    written = []
    real = db._note_write

    def note(statement):
        match = db.WRITE.match(statement)
        if match:
            written.append(match.group(1).lower())
        real(statement)

    monkeypatch.setattr(db, '_note_write', note)

    today = date.today().isoformat()
    offenders = {}
    for route in client.app.routes:
        path = getattr(route, 'path', '')
        if 'GET' not in (getattr(route, 'methods', None) or set()) or not path.startswith('/api'):
            continue
        if '{' in path:
            continue
        written.clear()
        client.get(path + WITH_PARAMS.get(path, '').format(today=today))
        if written:
            offenders[path] = sorted(set(written))

    assert offenders == {}, 'These GET requests write: {}'.format(offenders)

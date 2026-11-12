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
    '/api/notifications': '?day={today}&at=09:00',
    '/api/amc/search': '?q=circle',
}


def _account_with_every_old_write_due(client):
    """Some AMC history (an answer, a miss in the review log, a mock and a
    plan), a stale streak, and notifications on."""
    client.post('/api/amc/problems/step-10-01/attempt', json={'answer': 'D'})
    client.post('/api/amc/problems/step-10-02/attempt', json={'answer': 'A'})
    client.post('/api/amc/contests/step-mock-aime/submit', json={'answers': {'1': '55'}})
    client.put('/api/amc/plan', json={'target': 'AMC 10', 'goal_score': 105, 'hours': 5,
                                      'exam_date': (date.today() + timedelta(days=90)).isoformat()})
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

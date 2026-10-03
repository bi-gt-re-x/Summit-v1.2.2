"""The per-skill evidence a level is built from.

Every figure the skill tree now prints about a reader — the level, the
accuracy, the hardest difficulty reached — is arithmetic over these rows, so
what this file pins is that the rows are believable: a marked problem is one
attempt, nobody gets more right than they tried, the time is the server's, and
one account cannot see or remove another's. The arithmetic itself is tested in
frontend/src/utils/skillLevel.test.ts.

Assertions are on the database rather than on the reply where it matters, for
the reason test_crud.py gives.
"""
from datetime import datetime

from backend.database import connection as db
from backend.tracking.skillattempts import clean_attempt


def _mark(client, **over):
    body = {'node_id': 'm.quadratics', 'ordinal': 3, 'slot': 2,
            'weight': 'core', 'attempted': 1, 'correct': 1, 'source': 'problem'}
    body.update(over)
    return client.post('/api/skill-attempts', json=body).json()


def _log(client, **over):
    body = {'node_id': 'm.quadratics', 'ordinal': 3, 'weight': 'stretch',
            'attempted': 12, 'correct': 9, 'source': 'log'}
    body.update(over)
    return client.post('/api/skill-attempts', json=body).json()


# ---------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------
def test_a_marked_problem_is_stored(client):
    reply = _mark(client)
    assert reply['success'], reply
    row = db.find_row('skill_attempts', reply['attempt']['id'], user_id='tester')
    assert (row['node_id'], row['ordinal'], row['slot'], row['weight']) == (
        'm.quadratics', 3, 2, 'core')
    assert (row['attempted'], row['correct'], row['source']) == (1, 1, 'problem')


def test_a_log_is_one_row_with_its_counts(client):
    """Twelve problems from a textbook are one claim, not twelve invented times."""
    reply = _log(client)
    assert reply['success'], reply
    rows = db.rows_for('skill_attempts', 'tester')
    assert len(rows) == 1
    assert (rows[0]['attempted'], rows[0]['correct']) == (12, 9)
    assert 'slot' not in rows[0]  # NULL, which the reader drops


def test_the_time_is_the_servers(client):
    """A client that chose `at` could choose its own history."""
    reply = client.post('/api/skill-attempts', json={
        'node_id': 'm.quadratics', 'ordinal': 1, 'slot': 1, 'weight': 'warmup',
        'attempted': 1, 'correct': 1, 'at': '2020-01-01T00:00:00',
    }).json()
    assert reply['success'], reply
    assert not reply['attempt']['at'].startswith('2020')


def test_the_node_as_a_whole_is_ordinal_zero(client):
    """For nodes with no written steps, work can still be logged."""
    reply = _log(client, node_id='music.scales', ordinal=0)
    assert reply['success'], reply


# ---------------------------------------------------------------------------
# What is refused
# ---------------------------------------------------------------------------
def test_more_right_than_attempted_is_refused(client):
    reply = _log(client, attempted=10, correct=15)
    assert not reply['success']
    assert db.rows_for('skill_attempts', 'tester') == []


def test_a_marked_problem_is_one_attempt(client):
    assert not _mark(client, attempted=3, correct=2)['success']
    assert not _mark(client, slot=None)['success']


def test_only_the_three_difficulties(client):
    assert not _mark(client, weight='impossible')['success']


def test_a_huge_log_is_refused(client):
    assert not _log(client, attempted=5000, correct=10)['success']


def test_a_malformed_node_id_is_refused(client):
    assert not _mark(client, node_id='DROP TABLE users')['success']
    assert not _mark(client, node_id='')['success']


def test_fractional_counts_are_refused():
    row, reason = clean_attempt({'node_id': 'm.algebra', 'weight': 'core',
                                 'source': 'log', 'attempted': 2.5, 'correct': 1})
    assert row is None and reason


def test_clean_attempt_stamps_the_given_now():
    row, reason = clean_attempt(
        {'node_id': 'm.algebra', 'ordinal': 2, 'slot': 1, 'weight': 'warmup',
         'attempted': 1, 'correct': 0},
        now=datetime(2026, 9, 1, 8, 30))
    assert reason is None
    assert row['at'] == '2026-09-01T08:30:00'


# ---------------------------------------------------------------------------
# Reading and removing, one account at a time
# ---------------------------------------------------------------------------
def test_the_list_is_only_mine(client, stranger):
    _mark(client)
    _log(stranger)
    mine = client.get('/api/skill-attempts').json()['attempts']
    theirs = stranger.get('/api/skill-attempts').json()['attempts']
    assert [row['user_id'] for row in mine] == ['tester']
    assert [row['user_id'] for row in theirs] == ['stranger']


def test_a_mark_can_be_taken_back(client):
    made = _mark(client)['attempt']
    reply = client.post('/api/skill-attempts/delete', json={'id': made['id']}).json()
    assert reply['success'], reply
    assert db.rows_for('skill_attempts', 'tester') == []


def test_nobody_else_can_take_it_back(client, stranger):
    made = _mark(client)['attempt']
    reply = stranger.post('/api/skill-attempts/delete', json={'id': made['id']}).json()
    assert not reply['success']
    assert len(db.rows_for('skill_attempts', 'tester')) == 1


def test_signed_out_gets_nothing(anon):
    reply = anon.get('/api/skill-attempts')
    assert reply.status_code == 401 or not reply.json().get('success')


def test_it_goes_out_with_an_export(client):
    _mark(client)
    tables = client.get('/api/settings/export').json()['export']['tables']
    assert len(tables['skill_attempts']) == 1


# ---------------------------------------------------------------------------
# Levels, read here and sent with the rows (backend/tracking/skill_level.py)
# ---------------------------------------------------------------------------
def test_the_list_carries_every_steps_level(client):
    _log(client)  # twelve Hard, nine right: Hard is cleared
    reply = client.get('/api/skill-attempts').json()
    step = reply['levels']['m.quadratics#3']
    assert step['now']['level'] == 4
    assert step['attempted'] == 12


def test_a_write_comes_back_with_its_steps_new_level(client):
    reply = _mark(client)
    assert reply['levels']['m.quadratics#3']['now']['level'] == 1


def test_taking_back_the_last_attempt_leaves_no_level(client):
    made = _mark(client, ordinal=5)['attempt']
    reply = client.post('/api/skill-attempts/delete', json={'id': made['id']}).json()
    assert reply['key'] == 'm.quadratics#5'
    assert reply['levels'] == {}

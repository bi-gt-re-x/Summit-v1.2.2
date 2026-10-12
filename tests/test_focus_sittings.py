"""The focus sittings: one row per sitting, kept on the account.

They used to live only in the browser that ran them, so the Timer page's
sittings panel and its length recommendation started from nothing on a second
device. These pin what moving them to the server has to get right: a retry
adds nothing twice, a sitting is not rewritten once held, its answer can still
arrive later, one account cannot see another's, and junk is bounded rather
than stored.
"""
from backend.database import connection as db


def sitting(**over):
    row = {
        'id': 's-1', 'day': '2026-10-12', 'styleId': 'classic', 'planned': 25,
        'minutes': 25, 'pauses': 1, 'finished': True, 'at': 1791838000000,
        'breaks': [12], 'taskId': 't-1', 'taskTitle': 'Revise integrals',
    }
    row.update(over)
    return row


def test_a_sitting_goes_up_and_comes_back_in_the_browsers_shape(client):
    assert client.post('/api/focus/sittings', json={'sittings': [sitting()]}).json()['added'] == 1
    back = client.get('/api/focus/sittings').json()['sittings']
    assert back == [sitting()]


def test_sending_the_same_sitting_twice_adds_it_once(client):
    client.post('/api/focus/sittings', json={'sittings': [sitting()]})
    again = client.post('/api/focus/sittings', json={'sittings': [sitting(minutes=5)]}).json()
    assert again['added'] == 0
    rows = db.rows_for('focus_sittings', 'tester')
    assert len(rows) == 1
    # Held rows are facts: a second copy does not rewrite them.
    assert rows[0]['minutes'] == 25


def test_an_answer_given_later_still_lands(client):
    client.post('/api/focus/sittings', json={'sittings': [sitting(intent='15 problems', target=15)]})
    client.post('/api/focus/sittings', json={'sittings': [sitting(intent='15 problems', target=15, done=12)]})
    assert client.get('/api/focus/sittings').json()['sittings'][0]['done'] == 12


def test_amend_records_what_came_of_it(client):
    client.post('/api/focus/sittings', json={'sittings': [sitting(intent='understand IBP')]})
    assert client.post('/api/focus/sittings/amend', json={'id': 's-1', 'met': True}).json()['success']
    assert client.get('/api/focus/sittings').json()['sittings'][0]['met'] is True


def test_amend_refuses_a_sitting_that_is_not_there(client):
    assert not client.post('/api/focus/sittings/amend', json={'id': 'nope', 'done': 3}).json()['success']


def test_the_newest_come_back_oldest_first(client):
    rows = [sitting(id='s-%d' % n, at=1791838000000 + n) for n in range(130)]
    rows.append(sitting(id='old', at=None))
    client.post('/api/focus/sittings', json={'sittings': rows[:100]})
    client.post('/api/focus/sittings', json={'sittings': rows[100:]})
    back = client.get('/api/focus/sittings').json()['sittings']
    assert len(back) == 120
    assert back[-1]['id'] == 's-129'
    assert [row['at'] for row in back] == sorted(row['at'] for row in back)


def test_one_account_cannot_see_anothers(client, stranger):
    client.post('/api/focus/sittings', json={'sittings': [sitting()]})
    assert stranger.get('/api/focus/sittings').json()['sittings'] == []
    # And the same id on another account is that account's own row.
    assert stranger.post('/api/focus/sittings', json={'sittings': [sitting()]}).json()['added'] == 1
    assert not stranger.post('/api/focus/sittings/amend', json={'id': 'missing'}).json()['success']


def test_junk_is_bounded_or_skipped(client):
    reply = client.post('/api/focus/sittings', json={'sittings': [
        sitting(id='bad id with spaces'),
        sitting(id='s-2', day='yesterday'),
        sitting(id='s-3', minutes=9999, kind='nap', readiness='sleepy', taskTitle='x' * 500),
    ]}).json()
    assert reply['added'] == 1
    row = client.get('/api/focus/sittings').json()['sittings'][0]
    assert row['id'] == 's-3'
    assert row['minutes'] == 600
    assert 'kind' not in row and 'readiness' not in row
    assert len(row['taskTitle']) == 200


def test_signed_out_callers_are_refused(anon):
    assert anon.get('/api/focus/sittings').status_code == 401
    assert anon.post('/api/focus/sittings', json={'sittings': []}).status_code == 401

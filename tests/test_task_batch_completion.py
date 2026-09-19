"""Completing many tasks as one action — steps eleven and twelve.

Sixty tasks finished at once used to be sixty requests, sixty account writes
and sixty re-renders. It is one request now, one transaction per hundred
tasks, and one reply. These pin that it still does everything sixty single
completions did, and that it is safe to send twice.
"""
import threading

import pytest

from backend.api import tasks as tasks_api
from backend.database import connection as db
from backend.tracking.xp import level_for_total_xp


def make_tasks(client, count, xp=10, prefix='task'):
    ids = []
    for i in range(count):
        reply = client.post('/api/tasks', json={'name': '{} {}'.format(prefix, i), 'xp_reward': xp}).json()
        ids.append(reply['task_id'])
    return ids


def account():
    return next(u for u in db.read_table('users') if u['username'] == 'tester')


def ledger():
    return [e for e in db.rows_for('xp_events', 'tester') if e.get('reason') == 'task_completion']


def status(task_id):
    return db.find_row('tasks', task_id, user_id='tester')['status']


def complete(client, ids):
    return client.post('/api/complete_tasks', json={'task_ids': ids}).json()


@pytest.fixture
def calls(monkeypatch):
    """Every transaction the batch path opens."""
    seen = []
    real = db.complete_tasks

    def counting(*args, **kwargs):
        seen.append(len(args[2]))
        return real(*args, **kwargs)

    monkeypatch.setattr(db, 'complete_tasks', counting)
    return seen


# ---------------------------------------------------------------------------
# Step 11: one action, everything a completion does
# ---------------------------------------------------------------------------
@pytest.mark.parametrize('count', [1, 10, 60])
def test_a_batch_does_what_that_many_single_completions_did(client, calls, count):
    ids = make_tasks(client, count, xp=10)
    before = account()

    reply = complete(client, ids)

    assert reply['success']
    assert [row['task_id'] for row in reply['completed']] == ids
    assert all(status(t) == 'done' for t in ids)
    after = account()
    assert after['xp'] - (before.get('xp') or 0) == 10 * count
    assert after['tasks_completed'] - (before.get('tasks_completed') or 0) == count
    assert after['level'] == level_for_total_xp(after['xp'])['level']
    assert after['current_streak'] == 1
    # One ledger row per task, as single completions wrote — so every chart
    # counting completions per day reads the same whichever way they arrived.
    assert len(ledger()) == count
    assert reply['xp_earned'] == 10 * count
    # Sixty tasks is one chunk, so one transaction.
    assert calls == [count]


def test_every_task_records_its_timing(client):
    (task,) = make_tasks(client, 1)
    client.put('/api/tasks/%s' % task, json={'due_date': '2099-01-01T00:00:00'})

    complete(client, [task])

    row = db.find_row('tasks', task, user_id='tester')
    assert row['completed_at'] and row['completion_seconds'] >= 0
    assert row['met_deadline'] is True


def test_the_task_count_goals_move_by_the_batch_size(client):
    goal = client.post('/api/add_goal', json={
        'title': 'Finish 100 tasks', 'goal_type': 'tasks', 'target_tasks': 100}).json()['id']
    ids = make_tasks(client, 12)

    complete(client, ids)

    assert db.find_row('goals', goal, user_id='tester')['current_tasks'] == 12


def test_a_large_batch_is_chunked_one_transaction_per_chunk(client, calls, monkeypatch):
    monkeypatch.setattr(tasks_api, 'COMPLETE_CHUNK', 25)
    ids = make_tasks(client, 60)

    reply = complete(client, ids)

    assert calls == [25, 25, 10]
    assert len(reply['completed']) == 60
    assert account()['tasks_completed'] == 60


def test_a_request_over_the_limit_is_refused_whole(client, monkeypatch):
    monkeypatch.setattr(tasks_api, 'MAX_COMPLETE', 5)
    ids = make_tasks(client, 6)

    reply = client.post('/api/complete_tasks', json={'task_ids': ids})

    assert reply.status_code == 400
    assert not any(status(t) == 'done' for t in ids)


def test_an_empty_batch_does_nothing_and_says_so(client, calls):
    reply = complete(client, [])
    assert reply['success'] and reply['completed'] == [] and reply['xp_earned'] == 0
    assert calls == []


def test_tasks_that_are_not_yours_are_reported_not_touched(client, stranger):
    theirs = stranger.post('/api/tasks', json={'name': 'theirs', 'xp_reward': 50}).json()['task_id']
    mine = make_tasks(client, 1)

    reply = complete(client, mine + [theirs, 'no-such-task'])

    assert reply['not_found'] == [theirs, 'no-such-task']
    assert db.find_row('tasks', theirs)['status'] == 'todo'
    assert account()['xp'] == 10


def test_completing_never_rematches_goals(client, monkeypatch):
    from backend.goal_matcher import service
    ids = make_tasks(client, 5)
    monkeypatch.setattr(service, 'refresh_task', lambda *a, **k: pytest.fail('rematched'))
    monkeypatch.setattr(service, 'refresh_tasks', lambda *a, **k: pytest.fail('rematched'))

    assert complete(client, ids)['success']


def test_the_single_endpoint_is_the_batch_of_one_with_its_old_reply(client):
    (task,) = make_tasks(client, 1, xp=30)

    reply = client.post('/api/complete_task', json={'task_id': task}).json()

    assert reply['success'] and reply['xp_earned'] == 30 and reply['task_id'] == task
    for field in ('new_xp', 'new_level', 'new_tasks_completed', 'xp_required',
                  'current_streak', 'best_streak'):
        assert field in reply
    assert client.post('/api/complete_task', json={'task_id': 'nope'}).json()['success'] is False


# ---------------------------------------------------------------------------
# Step 12: duplicates, retries, races and failures pay out exactly once
# ---------------------------------------------------------------------------
def test_duplicate_ids_are_completed_once_and_reported_once(client):
    a, b = make_tasks(client, 2)

    reply = complete(client, [a, b, a, a, b])

    assert [row['task_id'] for row in reply['completed']] == [a, b]
    assert reply['already_done'] == []
    assert account()['xp'] == 20 and len(ledger()) == 2


def test_already_completed_tasks_earn_nothing_again(client):
    a, b = make_tasks(client, 2)
    complete(client, [a])

    reply = complete(client, [a, b])

    assert [row['task_id'] for row in reply['completed']] == [b]
    assert reply['already_done'] == [a]
    assert account()['xp'] == 20 and len(ledger()) == 2


def test_a_retried_request_changes_nothing(client):
    """The reply was lost to a timeout, so the client sends it again."""
    ids = make_tasks(client, 60)
    first = complete(client, ids)
    after_first = account()

    again = complete(client, ids)

    assert len(first['completed']) == 60
    assert again['completed'] == [] and sorted(again['already_done']) == sorted(ids)
    assert again['xp_earned'] == 0
    assert account()['xp'] == after_first['xp']
    assert account()['tasks_completed'] == after_first['tasks_completed']
    assert len(ledger()) == 60


def test_the_single_endpoint_no_longer_pays_twice_for_a_double_tap(client):
    (task,) = make_tasks(client, 1, xp=25)

    first = client.post('/api/complete_task', json={'task_id': task}).json()
    second = client.post('/api/complete_task', json={'task_id': task}).json()

    assert first['xp_earned'] == 25 and first['already_done'] is False
    assert second['success'] and second['xp_earned'] == 0 and second['already_done'] is True
    assert account()['xp'] == 25 and len(ledger()) == 1


def test_simultaneous_requests_for_the_same_tasks_pay_out_once(client):
    ids = make_tasks(client, 60)
    results, errors = [], []

    def send():
        try:
            results.append(tasks_api._complete('tester', ids))
        except Exception as exc:  # pragma: no cover - surfaced by the assert
            errors.append(exc)

    threads = [threading.Thread(target=send) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    completed = [task_id for result in results for task_id, _ in result['completed']]
    # Every task finished by exactly one of the four, and paid for once.
    assert sorted(completed) == sorted(ids)
    assert account()['xp'] == 600 and account()['tasks_completed'] == 60
    assert len(ledger()) == 60


def test_overlapping_simultaneous_batches_split_the_work_without_doubling(client):
    ids = make_tasks(client, 40)
    results = []
    halves = [ids[:30], ids[10:]]
    threads = [threading.Thread(target=lambda part=part: results.append(tasks_api._complete('tester', part)))
               for part in halves]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    completed = [task_id for result in results for task_id, _ in result['completed']]
    assert sorted(completed) == sorted(ids)
    assert account()['xp'] == 400


def test_a_chunk_that_fails_is_all_or_nothing_and_a_retry_finishes_the_job(client, monkeypatch):
    monkeypatch.setattr(tasks_api, 'COMPLETE_CHUNK', 10)
    ids = make_tasks(client, 25)
    real = db.complete_tasks
    seen = []

    def disk_full(total):
        raise RuntimeError('disk full')

    def flaky(*args, **kwargs):
        seen.append(1)
        if len(seen) == 2:
            # Fails inside the transaction, after its UPDATEs have run: the
            # level is the last thing a chunk computes before it commits.
            args = list(args)
            args[7] = disk_full
        return real(*args, **kwargs)

    monkeypatch.setattr(db, 'complete_tasks', flaky)
    reply = complete(client, ids)

    # The first chunk landed; the second rolled back whole; the third was not tried.
    assert [row['task_id'] for row in reply['completed']] == ids[:10]
    assert reply['failed'] == ids[10:]
    assert [status(t) for t in ids[10:20]] == ['todo'] * 10
    assert account()['xp'] == 100 and len(ledger()) == 10

    monkeypatch.setattr(db, 'complete_tasks', real)
    retry = complete(client, ids)

    assert sorted(row['task_id'] for row in retry['completed']) == sorted(ids[10:])
    assert retry['already_done'] == ids[:10]
    assert account()['xp'] == 250 and account()['tasks_completed'] == 25
    assert len(ledger()) == 25


def test_the_ledger_refuses_a_second_row_for_the_same_completion(client):
    (task,) = make_tasks(client, 1)
    complete(client, [task])
    (event,) = ledger()
    assert event['task_id'] == task

    con = db.connect()
    try:
        con.execute('INSERT OR IGNORE INTO xp_events (id, user_id, amount, reason, timestamp, task_id) '
                    "VALUES ('dupe', 'tester', 10, 'task_completion', ?, ?)",
                    (event['timestamp'], task))
        con.commit()
    finally:
        con.close()

    assert len(ledger()) == 1


def test_a_very_large_batch_completes_in_one_request(client, calls):
    ids = [db.insert_row('tasks', {'id': 'bulk-{}'.format(i), 'user_id': 'tester', 'title': 'Bulk',
                                   'status': 'todo', 'priority': 'low', 'xp_value': 1})['id']
           for i in range(tasks_api.MAX_COMPLETE)]

    reply = complete(client, ids)

    assert len(reply['completed']) == tasks_api.MAX_COMPLETE
    assert calls == [tasks_api.COMPLETE_CHUNK] * (tasks_api.MAX_COMPLETE // tasks_api.COMPLETE_CHUNK)
    assert account()['xp'] == tasks_api.MAX_COMPLETE

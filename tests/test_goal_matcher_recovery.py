"""Step twenty-one: nothing is left claiming a question that will never come.

'Pending' says a model is queued about a task, and the queue is one process's
memory. A restart in the middle would leave that claim standing for ever, with
the task's goals hidden behind it.
"""
import threading

import pytest

from backend.database import connection as db
from backend.goal_matcher import ai, service, store
from backend.goal_matcher.queue import work
from backend.tracking import planner


@pytest.fixture
def model(monkeypatch):
    """A model that never answers until the test lets it."""
    gate = threading.Event()
    monkeypatch.setattr(planner, 'able', lambda: True)
    monkeypatch.setattr(ai, 'ask', lambda *a, **k: gate.wait(5) and None)
    return gate


def ambiguous_goals(client):
    first = client.post('/api/add_goal', json={
        'title': 'Reach USACO Gold', 'measure': 'milestones',
        'milestones': ['Gold graph theory solid']}).json()['id']
    second = client.post('/api/add_goal', json={
        'title': 'Pass discrete maths', 'measure': 'milestones',
        'milestones': ['Graph theory problem sheets']}).json()['id']
    work.wait_idle()
    return first, second


def make_task(client, name='Graph theory', subject='mathematics'):
    return client.post('/api/tasks', json={'name': name, 'subject': subject}).json()['task_id']


def status(task_id):
    mapping = store.mapping_for('tester', task_id)
    return mapping.status if mapping else None


def test_a_task_stuck_pending_after_a_restart_is_picked_up_again(client):
    ambiguous_goals(client)
    task = make_task(client)
    work.wait_idle()
    # As a restart leaves it: the state says queued, and nothing is.
    store.save_mapping('tester', task, store.TaskGoalMapping.pending())
    assert status(task) == 'pending'

    service.catch_up('tester')
    work.wait_idle()

    assert status(task) == 'ambiguous'
    assert store.stale_count('tester') == 0


def test_a_task_really_queued_is_left_alone(client, model):
    ambiguous_goals(client)
    task = make_task(client)

    # The question is in flight: the job is waiting on the gate.
    assert status(task) == 'pending'
    assert service.recover_pending('tester') == 0
    assert status(task) == 'pending'

    model.set()
    work.wait_idle()
    assert status(task) == 'ambiguous'


def test_recovery_runs_once_and_a_catch_up_still_ends(client, monkeypatch):
    ambiguous_goals(client)
    tasks = [make_task(client, 'Graph theory {}'.format(i)) for i in range(5)]
    work.wait_idle()
    for task in tasks:
        store.save_mapping('tester', task, store.TaskGoalMapping.pending())
    runs = []
    real = service.recover_pending
    monkeypatch.setattr(service, 'recover_pending',
                        lambda user: runs.append(user) or real(user))

    assert service.catch_up('tester', slice_size=2) == 5

    assert runs == ['tester']
    assert all(status(task) == 'ambiguous' for task in tasks)


def test_recovery_leaves_every_other_state_as_it_found_it(client):
    violin = client.post('/api/add_goal', json={
        'title': 'Violin ARCT', 'measure': 'milestones', 'subject_ids': 'music'}).json()['id']
    work.wait_idle()
    matched = client.post('/api/tasks', json={'name': 'Violin lesson', 'subject': 'music'}).json()['task_id']
    unmatched = client.post('/api/tasks', json={'name': 'Ice bath', 'subject': 'health'}).json()['task_id']
    work.wait_idle()

    assert service.recover_pending('tester') == 0
    assert store.mapping_for('tester', matched).goal_ids == (violin,)
    assert status(unmatched) == 'unmatched'
    assert db.find_row('tasks', matched, user_id='tester')['goal_match_version'] > 0

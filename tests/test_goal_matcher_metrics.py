"""Step nineteen: numbers about what the matcher did, and nothing else in them.

Counts and milliseconds. A metric carrying a task title would be a task
history in the logs, so the tests below check the shape as much as the sums.
"""
import pytest

from backend.config import settings
from backend.goal_matcher import metrics, service
from backend.goal_matcher.queue import work


@pytest.fixture(autouse=True)
def clean():
    metrics.reset()
    yield
    metrics.reset()


def make_goal(client, title, subjects=''):
    goal_id = client.post('/api/add_goal', json={
        'title': title, 'measure': 'milestones', 'subject_ids': subjects}).json()['id']
    work.wait_idle()
    return goal_id


def make_task(client, name, subject=None, **extra):
    body = {'name': name, 'xp_reward': 5, **({'subject': subject} if subject else {}), **extra}
    task = client.post('/api/tasks', json=body).json()['task_id']
    work.wait_idle()
    return task


def test_a_fresh_snapshot_has_every_counter_at_nothing():
    found = metrics.snapshot()
    for name in metrics.NAMES:
        assert found[name] == 0, name
    assert found['average_run_ms'] == 0 and found['average_batch'] == 0


def test_matching_counts_what_it_ran_and_how_it_came_out(client):
    violin = make_goal(client, 'Violin ARCT', 'music')
    make_task(client, 'Violin lesson', 'music')
    make_task(client, 'Ice bath', 'health')
    make_task(client, 'Anything at all', goal_id=violin)

    found = metrics.snapshot()
    assert found['tasks_matched'] == 3
    assert (found['matched'], found['unmatched'], found['explicit']) == (2, 1, 1)
    assert found['runs'] >= 3
    assert found['duration_ms'] > 0 and found['average_run_ms'] > 0
    assert found['slowest_run_ms'] >= found['average_run_ms']


def test_a_catch_up_counts_its_pass_once_and_its_tasks_each(client):
    make_goal(client, 'Violin ARCT', 'music')
    from backend.database import connection as db
    for i in range(12):
        db.insert_row('tasks', {'id': 'old-{}'.format(i), 'user_id': 'tester', 'status': 'todo',
                                'title': 'Violin lesson {}'.format(i), 'subject': 'music',
                                'priority': 'low', 'xp_value': 1})
    metrics.reset()

    service.catch_up('tester')

    found = metrics.snapshot()
    assert found['tasks_matched'] == 12 and found['matched'] == 12
    assert found['runs'] == 1


def test_batch_completion_counts_batches_and_their_sizes(client):
    ids = [make_task(client, 'Job {}'.format(i)) for i in range(5)]
    metrics.reset()

    client.post('/api/complete_tasks', json={'task_ids': ids[:4]})
    client.post('/api/complete_tasks', json={'task_ids': ids[4:]})

    found = metrics.snapshot()
    assert found['batches'] == 2
    assert found['tasks_completed'] == 5
    assert found['largest_batch'] == 4
    assert found['average_batch'] == 2.5


def test_the_normalising_cache_reports_what_it_saved(client):
    """The counters are the cache's own, and the cache outlives a test — so
    this reads the change across the work, not the totals."""
    make_goal(client, 'Violin ARCT', 'music')
    before = metrics.snapshot()

    for _ in range(6):
        make_task(client, 'Violin lesson', 'music')

    after = metrics.snapshot()
    hits = after['cache_hits'] - before['cache_hits']
    misses = after['cache_misses'] - before['cache_misses']
    # The same title over and over: after the first, every read is a hit.
    assert hits > misses and misses <= 6


def test_the_model_counters_move_only_when_a_model_is_asked(client):
    make_goal(client, 'Violin ARCT', 'music')
    make_task(client, 'Violin lesson', 'music')

    found = metrics.snapshot()
    assert (found['ai_asked'], found['ai_answered'], found['ai_failed'],
            found['ai_cached'], found['ai_unreadable']) == (0, 0, 0, 0, 0)


def test_background_jobs_are_counted(client):
    make_goal(client, 'Violin ARCT', 'music')
    assert metrics.snapshot()['jobs_run'] >= 1
    assert metrics.snapshot()['jobs_failed'] == 0


def test_every_value_is_a_number_and_no_metric_carries_content(client):
    make_goal(client, 'Violin ARCT', 'music')
    make_task(client, 'A very distinctive title', 'music')

    found = metrics.snapshot()
    assert all(isinstance(value, (int, float)) for value in found.values())
    assert 'distinctive' not in repr(found) and 'Violin' not in repr(found)


def test_the_endpoint_answers_in_development_and_not_otherwise(client, monkeypatch):
    make_goal(client, 'Violin ARCT', 'music')
    make_task(client, 'Violin lesson', 'music')

    monkeypatch.setattr(settings, 'dev_mode', lambda: True)
    reply = client.get('/api/goal_matcher/metrics')
    assert reply.json()['success']
    assert reply.json()['metrics']['matched'] == 1
    assert reply.json()['queued'] == 0

    monkeypatch.setattr(settings, 'dev_mode', lambda: False)
    hidden = client.get('/api/goal_matcher/metrics')
    assert hidden.status_code == 404


def test_the_endpoint_needs_an_account(anon, monkeypatch):
    monkeypatch.setattr(settings, 'dev_mode', lambda: True)
    assert anon.get('/api/goal_matcher/metrics').status_code in (401, 403)

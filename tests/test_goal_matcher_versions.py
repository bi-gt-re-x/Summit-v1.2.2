"""Step ten of the goal matcher: versions, and catching up lazily.

A version bump marks every older answer stale and reprocesses nothing by
itself. Stale tasks are found by an indexed query and refreshed a bounded slice
at a time, or when the task is next edited — never on startup, never on a read.
"""
import pytest

from backend.database import connection as db
from backend.goal_matcher import service, store, types
from backend.main import create_app


def make_goal(client, title, subjects=''):
    return client.post('/api/add_goal', json={
        'title': title, 'measure': 'milestones', 'subject_ids': subjects}).json()['id']


def make_task(client, name, subject=None):
    body = {'name': name, 'xp_reward': 5, **({'subject': subject} if subject else {})}
    return client.post('/api/tasks', json=body).json()['task_id']


def legacy_task(title, subject=None):
    """A task written before the matcher existed: no status, no version."""
    return db.insert_row('tasks', {'id': db.new_id('tasks'), 'user_id': 'tester', 'title': title,
                                   'status': 'done', 'priority': 'medium', 'xp_value': 5,
                                   'subject': subject})['id']


@pytest.fixture
def bump(monkeypatch):
    """Move the matcher on a version, the way a release that changes the rules would."""
    def go():
        monkeypatch.setattr(types, 'GOAL_MATCHER_VERSION', types.GOAL_MATCHER_VERSION + 1)
    return go


def test_new_answers_carry_the_current_version_and_are_not_stale(client):
    make_goal(client, 'Violin ARCT', 'music')
    task = make_task(client, 'Violin lesson', 'music')

    assert store.mapping_for('tester', task).version == types.GOAL_MATCHER_VERSION
    assert not store.mapping_for('tester', task).is_stale()
    assert store.stale_count('tester') == 0


def test_tasks_from_before_the_matcher_are_stale_until_reached(client):
    legacy_task('Violin lesson', 'music')
    legacy_task('Lift', 'gym')
    make_task(client, 'Something new')

    assert store.stale_count('tester') == 2
    assert {t['title'] for t in store.stale_tasks('tester', 10)} == {'Violin lesson', 'Lift'}


def test_a_version_bump_makes_every_older_answer_stale_and_reprocesses_nothing(client, bump, monkeypatch):
    make_goal(client, 'Violin ARCT', 'music')
    tasks = [make_task(client, 'Violin lesson {}'.format(i), 'music') for i in range(3)]
    runs = []
    monkeypatch.setattr(service, 'classify_task',
                        lambda index, task, real=service.classify_task: runs.append(1) or real(index, task))

    bump()

    assert runs == []
    assert store.stale_count('tester') == 3
    assert all(store.mapping_for('tester', t).is_stale() for t in tasks)
    # The old answer is still there and still read: stale is not the same as wrong.
    assert all(store.mapping_for('tester', t).goal_ids for t in tasks)


def test_starting_the_app_reprocesses_nothing(client, bump, monkeypatch):
    make_goal(client, 'Violin ARCT', 'music')
    legacy_task('Violin lesson', 'music')
    bump()
    monkeypatch.setattr(service, 'refresh_task', lambda *a, **k: pytest.fail('ran at startup'))

    create_app()
    db.connect().close()

    assert store.stale_count('tester') == 1


def test_opening_pages_reprocesses_nothing(client, bump):
    make_goal(client, 'Violin ARCT', 'music')
    legacy_task('Violin lesson', 'music')
    make_task(client, 'Violin practice', 'music')
    bump()

    for path in ('/api/tasks', '/api/analytics/tasks', '/api/get_user_data', '/api/get_goals'):
        client.get(path)

    assert store.stale_count('tester') == 2


def test_a_refresh_pass_is_bounded_and_resumable(client):
    violin = make_goal(client, 'Violin ARCT', 'music')
    ids = [legacy_task('Violin lesson {}'.format(i), 'music') for i in range(7)]

    assert service.refresh_stale('tester', limit=3) == {'refreshed': 3, 'remaining': 4}
    assert service.refresh_stale('tester', limit=3) == {'refreshed': 3, 'remaining': 1}
    assert service.refresh_stale('tester', limit=3) == {'refreshed': 1, 'remaining': 0}
    # Nothing left: a pass does nothing and says so.
    assert service.refresh_stale('tester', limit=3) == {'refreshed': 0, 'remaining': 0}

    assert all(store.mapping_for('tester', t).goal_ids == (violin,) for t in ids)


def test_a_refresh_brings_old_answers_up_to_the_new_rules(client, bump):
    make_goal(client, 'Violin ARCT', 'music')
    task = make_task(client, 'Violin lesson', 'music')
    bump()

    service.refresh_stale('tester')

    assert store.mapping_for('tester', task).version == types.GOAL_MATCHER_VERSION
    assert store.stale_count('tester') == 0


def test_editing_a_stale_task_brings_it_up_to_date_on_the_way(client, bump):
    make_goal(client, 'Violin ARCT', 'music')
    task = make_task(client, 'Violin lesson', 'music')
    bump()

    client.put('/api/tasks/%s' % task, json={'name': 'Violin lesson, long'})

    assert not store.mapping_for('tester', task).is_stale()


def test_completing_a_stale_task_does_not_rematch_it(client, bump):
    make_goal(client, 'Violin ARCT', 'music')
    task = make_task(client, 'Violin lesson', 'music')
    bump()

    client.post('/api/complete_task', json={'task_id': task})

    assert store.mapping_for('tester', task).is_stale()


def test_the_stale_query_selects_only_matching_fields(client):
    db.insert_row('tasks', {'id': 'long', 'user_id': 'tester', 'title': 'x', 'status': 'todo',
                            'priority': 'medium', 'xp_value': 1, 'description': 'y' * 10000})
    (row,) = store.stale_tasks('tester', 5)
    assert set(row) <= set(store.STALE_FIELDS)


def test_the_stale_query_uses_its_index(client):
    con = db.connect()
    try:
        plan = ' '.join(str(tuple(r)) for r in con.execute(
            'EXPLAIN QUERY PLAN SELECT id FROM tasks WHERE user_id = ? '
            'AND (goal_match_version IS NULL OR goal_match_version < ?)', ('tester', 1)))
    finally:
        con.close()
    assert 'tasks_user_match_idx' in plan


# ---------------------------------------------------------------------------
# Step 11: matching many tasks at once
# ---------------------------------------------------------------------------
def test_a_batch_is_one_goals_read_and_one_transaction_per_chunk(client, monkeypatch):
    make_goal(client, 'Violin ARCT', 'music')
    ids = [legacy_task('Violin lesson {}'.format(i), 'music') for i in range(25)]
    loads, writes = [], []
    real_load, real_save = service.candidate_index.load, db.save_goal_mappings
    monkeypatch.setattr(service.candidate_index, 'load',
                        lambda user, **kw: loads.append(user) or real_load(user, **kw))
    monkeypatch.setattr(db, 'save_goal_mappings',
                        lambda user, entries: writes.append(len(entries)) or real_save(user, entries))

    result = service.refresh_tasks('tester', store.stale_tasks('tester', 100), chunk_size=10)

    assert result == {'refreshed': 25, 'failed': 0}
    assert loads == ['tester']
    assert writes == [10, 10, 5]
    assert len(store.goal_links('tester')) == 25


def test_a_chunk_that_fails_costs_that_chunk_and_no_more(client, monkeypatch):
    make_goal(client, 'Violin ARCT', 'music')
    [legacy_task('Violin lesson {}'.format(i), 'music') for i in range(25)]
    real_save = db.save_goal_mappings
    seen = []

    def flaky(user, entries):
        seen.append(len(entries))
        if len(seen) == 2:
            raise RuntimeError('disk full')
        return real_save(user, entries)

    monkeypatch.setattr(db, 'save_goal_mappings', flaky)
    result = service.refresh_tasks('tester', store.stale_tasks('tester', 100), chunk_size=10)

    assert result == {'refreshed': 15, 'failed': 10}
    # The failed chunk is untouched, so still stale, and the next pass takes it.
    assert store.stale_count('tester') == 10
    monkeypatch.setattr(db, 'save_goal_mappings', real_save)
    assert service.refresh_stale('tester') == {'refreshed': 10, 'remaining': 0}


def test_a_batch_skips_tasks_that_are_not_this_accounts(client, stranger):
    make_goal(client, 'Violin ARCT', 'music')
    theirs = stranger.post('/api/tasks', json={'name': 'Violin lesson', 'subject': 'music'}).json()['task_id']
    mine = legacy_task('Violin lesson', 'music')

    result = service.refresh_tasks('tester', [{'id': mine, 'title': 'Violin lesson', 'subject': 'music'},
                                              {'id': theirs, 'title': 'Violin lesson', 'subject': 'music'}])

    assert result == {'refreshed': 1, 'failed': 0}
    assert list(store.goal_links('tester')) == [mine]

"""Saving and reading task goal mappings: ids only, and never a broken one.

Step two of the goal matcher. Still no matching — mappings are built by hand
here — so these pin what the store does with them: what it writes, what it
refuses to write, and what it reads back when the goals underneath have moved.
"""
import sqlite3

from backend.config import settings
from backend.database import connection as db
from backend.goal_matcher import store
from backend.goal_matcher.types import GOAL_MATCHER_VERSION, TaskGoalMapping, TaskGoalMatch


def make_goal(client, title):
    reply = client.post('/api/add_goal', json={
        'title': title, 'goal_type': 'xp', 'target_xp': 100,
        'description': 'A long description that must never be copied onto a task.',
    }).json()
    assert reply['success'], reply
    return reply['id']


def make_task(client, name='AMC 8 geometry practice'):
    reply = client.post('/api/tasks', json={'name': name, 'xp_reward': 5}).json()
    assert reply['success'], reply
    return reply['task_id']


def matched(*pairs, source='rule'):
    return TaskGoalMapping(status='matched', matches=tuple(
        TaskGoalMatch(goal_id=goal_id, score=score, source=source) for goal_id, score in pairs))


def raw_rows(task_id):
    con = sqlite3.connect(settings.DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        return [dict(row) for row in con.execute(
            'SELECT * FROM task_goal_matches WHERE task_id = ? ORDER BY goal_id', (task_id,))]
    finally:
        con.close()


def test_a_saved_mapping_is_ids_and_two_numbers_and_nothing_about_the_goal(client):
    goal = make_goal(client, 'AMC 8 24+')
    task = make_task(client)

    store.save_mapping('tester', task, matched((goal, 0.91)))

    rows = raw_rows(task)
    assert rows == [{'task_id': task, 'goal_id': goal, 'user_id': 'tester',
                     'score': 0.91, 'source': 'rule'}]
    # The task row carries the status and version, and gains nothing else.
    row = db.find_row('tasks', task, user_id='tester')
    assert (row['goal_match_status'], row['goal_match_version']) == ('matched', GOAL_MATCHER_VERSION)
    assert 'AMC 8 24+' not in repr(row) and 'must never be copied' not in repr(row)


def test_it_reads_back_as_it_was_saved(client):
    one, two = make_goal(client, 'AMC 8'), make_goal(client, 'Counting')
    task = make_task(client)
    mapping = matched((one, 0.9), (two, 0.6))

    assert store.save_mapping('tester', task, mapping) == mapping
    assert store.mapping_for('tester', task) == mapping


def test_saving_again_replaces_rather_than_adds(client):
    one, two = make_goal(client, 'AMC 8'), make_goal(client, 'Counting')
    task = make_task(client)

    store.save_mapping('tester', task, matched((one, 0.9), (two, 0.6)))
    store.save_mapping('tester', task, matched((two, 0.8)))

    assert store.mapping_for('tester', task).goal_ids == (two,)
    assert len(raw_rows(task)) == 1


def legacy_task(title):
    """A task as one written before the matcher existed: straight into the table."""
    row = db.insert_row('tasks', {'id': db.new_id('tasks'), 'user_id': 'tester', 'title': title,
                                  'status': 'todo', 'priority': 'medium', 'xp_value': 5})
    return row['id']


def test_unmatched_is_stored_as_an_answer_and_differs_from_never_matched(client):
    looked_at, never = make_task(client, 'Read chapter 7'), legacy_task('Other')

    store.save_mapping('tester', looked_at, TaskGoalMapping.unmatched())

    assert store.mapping_for('tester', looked_at) == TaskGoalMapping.unmatched()
    assert store.mapping_for('tester', never) is None
    assert raw_rows(looked_at) == []


def test_a_goal_that_does_not_exist_is_dropped_not_raised(client):
    real = make_goal(client, 'AMC 8')
    task = make_task(client)

    kept = store.save_mapping('tester', task, matched((real, 0.9), ('no-such-goal', 0.95)))

    assert kept.goal_ids == (real,)
    assert store.mapping_for('tester', task).goal_ids == (real,)


def test_when_every_goal_named_is_missing_it_is_stored_as_unmatched(client):
    task = make_task(client)

    kept = store.save_mapping('tester', task, matched(('gone', 0.9)))

    assert kept == TaskGoalMapping.unmatched()
    assert db.find_row('tasks', task, user_id='tester')['goal_match_status'] == 'unmatched'


def test_another_accounts_goal_can_never_be_linked(client, stranger):
    theirs = make_goal(stranger, 'Their goal')
    task = make_task(client)

    kept = store.save_mapping('tester', task, matched((theirs, 0.99)))

    assert kept.goal_ids == ()
    assert raw_rows(task) == []


def test_another_accounts_task_is_refused(client, stranger):
    theirs = make_task(stranger)
    goal = make_goal(client, 'Mine')

    assert store.save_mapping('tester', theirs, matched((goal, 0.9))) is None
    assert raw_rows(theirs) == []
    assert store.mapping_for('tester', theirs) is None


def test_deleting_a_goal_takes_its_links_with_it(client):
    keep, doomed = make_goal(client, 'Keep'), make_goal(client, 'Doomed')
    task = make_task(client)
    store.save_mapping('tester', task, matched((keep, 0.9), (doomed, 0.8)))

    assert client.post('/api/delete_goal', json={'goal_id': doomed}).json()['success']

    assert [row['goal_id'] for row in raw_rows(task)] == [keep]
    assert store.mapping_for('tester', task).goal_ids == (keep,)


def test_deleting_a_task_takes_its_links_with_it(client):
    goal = make_goal(client, 'Goal')
    task = make_task(client)
    store.save_mapping('tester', task, matched((goal, 0.9)))

    assert client.delete('/api/tasks/%s' % task).json()['success']

    assert raw_rows(task) == []


def test_a_goal_removed_behind_the_stores_back_reads_as_nothing(client):
    """`write_table` swaps rows with foreign keys off, so no cascade fires."""
    goal = make_goal(client, 'Goal')
    task = make_task(client)
    store.save_mapping('tester', task, matched((goal, 0.9)))

    db.write_table('goals', [row for row in db.read_table('goals') if row['id'] != goal])

    # The row is still there, and it is ignored — and because it was the only
    # goal, the mapping reads as stale so the next pass looks again.
    assert len(raw_rows(task)) == 1
    assert store.mapping_for('tester', task) == TaskGoalMapping(status='unmatched', version=0)


def test_the_settings_resets_clear_links_before_they_can_dangle(client):
    """A leftover link would fail the next write_table of the links table."""
    goal = make_goal(client, 'Goal')
    task = make_task(client)
    store.save_mapping('tester', task, matched((goal, 0.9)))

    reply = client.post('/api/settings/reset', json={'scope': 'content', 'confirm': 'tester'}).json()

    assert reply['success'], reply
    assert raw_rows(task) == []
    # And the table can still be rewritten whole, which a dangling row prevents.
    db.write_table('task_goal_matches', db.read_table('task_goal_matches'))


def test_reading_many_tasks_at_once_is_chunked_and_complete(client, monkeypatch):
    monkeypatch.setattr(db, '_IN_CHUNK', 3)
    goal = make_goal(client, 'Goal')
    tasks = [make_task(client, 'task {}'.format(i)) for i in range(8)]
    for task in tasks:
        store.save_mapping('tester', task, matched((goal, 0.8)))

    found = store.mappings_for('tester', tasks + [tasks[0], ''])

    assert sorted(found) == sorted(tasks)
    assert all(mapping.goal_ids == (goal,) for mapping in found.values())

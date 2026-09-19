"""Step twenty: sixty tasks created at once, as one action.

The brief's other simultaneous case. Sixty creates were sixty requests, sixty
inserts and sixty reads of the account's goals; this is one of each, and the
matching that follows is the batch pass.
"""
import pytest

from backend.api import tasks as tasks_api
from backend.database import connection as db
from backend.goal_matcher import service, store
from backend.goal_matcher.queue import work


def make_goal(client, title, subjects=''):
    goal_id = client.post('/api/add_goal', json={
        'title': title, 'measure': 'milestones', 'subject_ids': subjects}).json()['id']
    work.wait_idle()
    return goal_id


def bulk(client, tasks):
    return client.post('/api/tasks/bulk', json={'tasks': tasks}).json()


def rows():
    return db.rows_for('tasks', 'tester')


def test_sixty_tasks_arrive_as_sixty_rows_matched_in_one_pass(client, monkeypatch):
    violin = make_goal(client, 'Violin ARCT', 'music')
    passes = []
    real = service.refresh_tasks
    monkeypatch.setattr(service, 'refresh_tasks',
                        lambda user, tasks, **kw: passes.append(len(list(tasks))) or real(user, tasks, **kw))

    reply = bulk(client, [{'name': 'Violin lesson {}'.format(i), 'subject': 'music', 'xp_reward': 5}
                          for i in range(60)])

    assert reply['created'] == 60 and len(reply['task_ids']) == 60
    assert len(rows()) == 60
    assert passes == [60]
    assert all(store.mapping_for('tester', task_id).goal_ids == (violin,)
               for task_id in reply['task_ids'])


def test_it_writes_the_same_task_a_single_create_would(client):
    goal = make_goal(client, 'Violin ARCT', 'music')
    stone = client.post('/api/add_milestone', json={'goal_id': goal, 'title': 'RCM Level 8'}).json()['id']
    work.wait_idle()

    reply = bulk(client, [{'name': 'Violin lesson', 'subject': 'music', 'priority': 'high',
                           'xp_reward': 25, 'due_date': '2099-01-01T00:00:00',
                           'goal_id': goal, 'milestone_id': stone}])

    (row,) = rows()
    assert (row['title'], row['priority'], row['xp_value']) == ('Violin lesson', 'high', 25)
    assert (row['subject'], row['goal_id'], row['milestone_id']) == ('music', goal, stone)
    assert row['status'] == 'todo' and row['created_at']
    assert store.mapping_for('tester', reply['task_ids'][0]).matches[0].source == 'explicit'


def test_nothing_is_created_from_nothing(client):
    reply = bulk(client, [])
    assert reply['created'] == 0 and reply['task_ids'] == [] and rows() == []


def test_a_request_over_the_limit_is_refused_whole(client, monkeypatch):
    monkeypatch.setattr(tasks_api, 'MAX_CREATE', 3)
    reply = client.post('/api/tasks/bulk', json={'tasks': [{'name': 'x'} for _ in range(4)]})
    assert reply.status_code == 400
    assert rows() == []


def test_sending_the_same_list_again_adds_only_what_is_missing(client):
    """The reply was lost; the client sends the batch again with its own ids."""
    tasks = [{'id': 'mine-{}'.format(i), 'name': 'Job {}'.format(i)} for i in range(5)]
    first = bulk(client, tasks)
    again = bulk(client, tasks + [{'id': 'mine-5', 'name': 'Job 5'}])

    assert first['created'] == 5
    assert again['created'] == 1 and again['task_ids'] == ['mine-5']
    assert sorted(again['already_there']) == ['mine-{}'.format(i) for i in range(5)]
    assert len(rows()) == 6


def test_a_bad_link_is_dropped_rather_than_failing_the_batch(client, stranger):
    theirs = stranger.post('/api/add_goal', json={
        'title': 'Theirs', 'measure': 'milestones'}).json()['id']
    work.wait_idle()

    reply = bulk(client, [{'name': 'Mine', 'goal_id': theirs},
                          {'name': 'Also mine', 'goal_id': 'no-such-goal'}])

    assert reply['created'] == 2
    assert all(row.get('goal_id') is None for row in rows())


def test_the_goals_are_read_once_for_the_batch_not_once_per_task(client, monkeypatch):
    goal = make_goal(client, 'Violin ARCT', 'music')
    reads = []
    real = db.columns_for
    monkeypatch.setattr(db, 'columns_for', lambda table, user, cols, **kw:
                        reads.append(table) or real(table, user, cols, **kw))

    bulk(client, [{'name': 'Violin lesson {}'.format(i), 'goal_id': goal} for i in range(30)])

    # Two for the links, two for the matcher's index. Not sixty.
    assert reads.count('goals') == 2 and reads.count('goal_milestones') == 2


def test_tasks_with_no_goal_named_read_nothing_to_find_that_out(client, monkeypatch):
    reads = []
    real = db.columns_for
    monkeypatch.setattr(db, 'columns_for', lambda table, user, cols, **kw:
                        reads.append(table) or real(table, user, cols, **kw))

    bulk(client, [{'name': 'Job {}'.format(i)} for i in range(10)])

    # Only the matcher's own index read.
    assert reads.count('goals') == 1

"""Steps seven to nine of the goal matcher, through the real endpoints.

7. A task's goals are worked out when it is created or edited in a way that
   matters, and stored — never when it is completed, and never on a read.
8. What reads a task gets its stored goals with it (tested alongside).
9. A goal the reader linked by hand always wins.
"""
import pytest

from backend.database import connection as db
from backend.goal_matcher import service, store
from backend.goal_matcher import deterministic
from backend.goal_matcher.queue import work


def make_goal(client, title, subjects='', measure='milestones', milestones=()):
    reply = client.post('/api/add_goal', json={
        'title': title, 'measure': measure, 'subject_ids': subjects,
        'milestones': list(milestones),
    }).json()
    assert reply['success'], reply
    # A new goal queues a catch-up in the background (step 14). Let it land
    # before the test goes on, as a reader's next click would a moment later.
    work.wait_idle()
    return reply['id']


def make_task(client, name, subject=None, **extra):
    body = {'name': name, 'xp_reward': 5, **extra}
    if subject:
        body['subject'] = subject
    reply = client.post('/api/tasks', json=body).json()
    assert reply['success'], reply
    return reply['task_id']


def mapping(task_id):
    return store.mapping_for('tester', task_id)


@pytest.fixture
def runs(monkeypatch):
    """Counts every time the matcher actually classifies a task."""
    seen = []
    real = service.classify_task

    def counting(index, task):
        seen.append(task.get('id'))
        return real(index, task)

    monkeypatch.setattr(service, 'classify_task', counting)
    return seen


# ---------------------------------------------------------------------------
# Step 7: persisted on create and on the edits that matter
# ---------------------------------------------------------------------------
def test_a_new_task_is_matched_as_it_is_created(client):
    violin = make_goal(client, 'Violin ARCT', 'music')
    task = make_task(client, 'Violin lesson', 'music')

    assert mapping(task).goal_ids == (violin,)
    assert mapping(task).matches[0].source == 'rule'


def test_a_new_task_toward_nothing_is_stored_as_unmatched_not_left_blank(client):
    make_goal(client, 'Violin ARCT', 'music')
    task = make_task(client, 'Read chapter 7', 'chemistry')

    assert mapping(task).status == 'unmatched'
    assert db.find_row('tasks', task, user_id='tester')['goal_match_status'] == 'unmatched'


def test_an_account_with_no_goals_still_gets_an_answer(client):
    task = make_task(client, 'Violin lesson', 'music')
    assert mapping(task).status == 'unmatched'


def test_renaming_a_task_rematches_it(client, runs):
    violin = make_goal(client, 'Violin ARCT', 'music')
    task = make_task(client, 'Scales', 'music')
    assert mapping(task).goal_ids == ()

    client.put('/api/tasks/%s' % task, json={'name': 'Violin scales'})

    assert mapping(task).goal_ids == (violin,)
    assert runs == [task, task]


def test_changing_the_subject_rematches_it(client):
    violin = make_goal(client, 'Violin ARCT', 'music')
    task = make_task(client, 'Violin lesson', 'music')
    assert mapping(task).goal_ids == (violin,)

    # Refiled somewhere the goal does not reach: the old answer does not stand.
    client.put('/api/tasks/%s' % task, json={'subject': 'chemistry'})

    assert mapping(task).status == 'unmatched'


@pytest.mark.parametrize('edit', [
    {'completed': True},
    {'priority': 'high'},
    {'due_date': '2099-01-01T00:00:00'},
    {'xp_reward': 50},
    {'name': 'Violin lesson'},          # "changed" to what it already was
])
def test_edits_that_touch_nothing_the_match_reads_run_nothing(client, runs, edit):
    make_goal(client, 'Violin ARCT', 'music')
    task = make_task(client, 'Violin lesson', 'music')
    before = mapping(task)

    assert client.put('/api/tasks/%s' % task, json=edit).json()['success']

    assert runs == [task]
    assert mapping(task) == before


def test_completing_rating_and_redating_run_nothing(client, runs):
    make_goal(client, 'Violin ARCT', 'music')
    task = make_task(client, 'Violin lesson', 'music')

    client.post('/api/complete_task', json={'task_id': task})
    client.post('/api/rate_task', json={'task_id': task, 'difficulty': 3, 'execution': 4})
    client.post('/api/update_task_due_date', json={'id': task, 'due_date': '2099-01-01'})

    assert runs == [task]


def test_reading_tasks_runs_nothing(client, runs):
    make_goal(client, 'Violin ARCT', 'music')
    make_task(client, 'Violin lesson', 'music')
    runs.clear()

    for path in ('/api/tasks', '/api/analytics/tasks', '/api/get_user_data', '/api/get_goals'):
        assert client.get(path).json()['success'], path

    assert runs == []


def test_a_matcher_failure_never_fails_the_task(client, monkeypatch):
    make_goal(client, 'Violin ARCT', 'music')

    def broken(index, task):
        raise RuntimeError('matcher fell over')

    monkeypatch.setattr(deterministic, 'classify', broken)
    monkeypatch.setattr(service, 'classify', broken)
    task = make_task(client, 'Violin lesson', 'music')

    # Saved, and left as never matched — for a later pass, not as "no goal".
    assert db.find_row('tasks', task, user_id='tester')['title'] == 'Violin lesson'
    assert mapping(task) is None
    assert client.put('/api/tasks/%s' % task, json={'name': 'Violin scales'}).json()['success']


def test_another_accounts_goals_are_never_candidates(client, stranger):
    make_goal(stranger, 'Violin ARCT', 'music')
    task = make_task(client, 'Violin lesson', 'music')
    assert mapping(task).status == 'unmatched'


def test_the_index_is_read_once_per_task_write(client, monkeypatch):
    make_goal(client, 'Violin ARCT', 'music')
    loads = []
    real = service.candidate_index.load
    monkeypatch.setattr(service.candidate_index, 'load',
                        lambda username, **kw: loads.append(username) or real(username, **kw))

    make_task(client, 'Violin lesson', 'music')

    assert loads == ['tester']


# ---------------------------------------------------------------------------
# Step 8: pages read what was stored
# ---------------------------------------------------------------------------
def by_id(tasks):
    return {task['id']: task for task in tasks}


def test_the_task_list_carries_each_tasks_stored_goals(client):
    violin = make_goal(client, 'Violin ARCT', 'music')
    matched = make_task(client, 'Violin lesson', 'music')
    other = make_task(client, 'Lift', 'gym')

    for path in ('/api/tasks', '/api/get_user_data'):
        tasks = by_id(client.get(path).json()['tasks'])
        assert tasks[matched]['goal_ids'] == [violin], path
        # Toward nothing: no key at all, the way a NULL column arrives.
        assert 'goal_ids' not in tasks[other], path
        assert tasks[matched]['goal_match_status'] == 'matched'


def test_analytics_gets_the_links_beside_its_columns(client):
    violin = make_goal(client, 'Violin ARCT', 'music')
    matched = make_task(client, 'Violin lesson', 'music')
    make_task(client, 'Lift', 'gym')

    reply = client.get('/api/analytics/tasks').json()

    assert reply['goal_links'] == {matched: [violin]}
    assert 'goal_ids' not in reply['fields']


def test_a_task_toward_two_goals_lists_both_strongest_first(client):
    usaco = make_goal(client, 'Reach USACO Gold', 'computer_science')
    temp = make_goal(client, '[temp] Reach USACO Gold', 'computer_science')
    task = make_task(client, 'USACO training', 'computer_science')

    assert client.get('/api/analytics/tasks').json()['goal_links'][task] == [usaco, temp]


def test_a_deleted_goal_disappears_from_what_pages_read(client):
    violin = make_goal(client, 'Violin ARCT', 'music')
    task = make_task(client, 'Violin lesson', 'music')
    client.post('/api/delete_goal', json={'goal_id': violin})

    assert 'goal_ids' not in by_id(client.get('/api/tasks').json()['tasks'])[task]
    assert client.get('/api/analytics/tasks').json()['goal_links'] == {}


def test_the_links_are_one_query_however_many_tasks(client, monkeypatch):
    make_goal(client, 'Violin ARCT', 'music')
    for i in range(30):
        make_task(client, 'Violin lesson {}'.format(i), 'music')
    calls = []
    real = db.goal_links_for
    monkeypatch.setattr(db, 'goal_links_for', lambda user: calls.append(user) or real(user))

    tasks = client.get('/api/tasks').json()['tasks']

    assert calls == ['tester']
    assert sum('goal_ids' in task for task in tasks) == 30


# ---------------------------------------------------------------------------
# Step 9: a goal linked by hand always wins
# ---------------------------------------------------------------------------
def sources(task_id):
    return [(m.goal_id, m.source, m.score) for m in mapping(task_id).matches]


def origins(task_id):
    """Which goals, and how each was found, strongest first. Scores left out."""
    return [(m.goal_id, m.source) for m in mapping(task_id).matches]


def test_a_hand_made_link_is_stored_even_when_the_words_say_nothing(client):
    thesis = make_goal(client, 'Finish the thesis', 'computer_science')
    task = make_task(client, 'Lift', 'gym', goal_id=thesis)

    assert sources(task) == [(thesis, 'explicit', 1.0)]
    assert mapping(task).status == 'matched'


def test_the_rules_add_goals_beside_it_and_never_ahead_of_it(client):
    violin = make_goal(client, 'Violin ARCT', 'music')
    recital = make_goal(client, 'Spring recital', 'music')
    task = make_task(client, 'Violin lesson', 'music', goal_id=recital)

    assert origins(task) == [(recital, 'explicit'), (violin, 'rule')]
    assert by_id(client.get('/api/tasks').json()['tasks'])[task]['goal_ids'] == [recital, violin]


def test_linking_the_goal_the_rules_found_keeps_one_copy_marked_explicit(client):
    violin = make_goal(client, 'Violin ARCT', 'music')
    task = make_task(client, 'Violin lesson', 'music', goal_id=violin)

    assert sources(task) == [(violin, 'explicit', 1.0)]


def test_linking_later_puts_it_first_and_unlinking_leaves_the_rules(client):
    violin = make_goal(client, 'Violin ARCT', 'music')
    recital = make_goal(client, 'Spring recital', 'music')
    task = make_task(client, 'Violin lesson', 'music')
    assert origins(task) == [(violin, 'rule')]

    client.put('/api/tasks/%s' % task, json={'goal_id': recital})
    assert origins(task) == [(recital, 'explicit'), (violin, 'rule')]

    client.put('/api/tasks/%s' % task, json={'goal_id': None})
    assert origins(task) == [(violin, 'rule')]


def test_renaming_a_linked_task_cannot_remove_the_link(client):
    recital = make_goal(client, 'Spring recital', 'music')
    task = make_task(client, 'Recital run-through', 'music', goal_id=recital)

    client.put('/api/tasks/%s' % task, json={'name': 'Something else entirely'})
    client.put('/api/tasks/%s' % task, json={'subject': 'chemistry'})

    assert sources(task) == [(recital, 'explicit', 1.0)]


def test_an_ambiguous_reading_is_dropped_once_the_task_has_an_owner(client):
    make_goal(client, 'Reach USACO Gold', milestones=['Gold graph theory solid'])
    mine = make_goal(client, 'Pass discrete maths', 'mathematics')
    alone = make_task(client, 'Graph theory', 'mathematics')
    linked = make_task(client, 'Graph theory', 'mathematics', goal_id=mine)

    assert mapping(alone).status == 'ambiguous'
    assert sources(linked) == [(mine, 'explicit', 1.0)]


@pytest.mark.parametrize('kind', ['completed', 'counter'])
def test_the_reader_may_link_goals_the_rules_never_would(client, kind):
    if kind == 'completed':
        goal_id = make_goal(client, 'Old goal')
        client.post('/api/update_goal', json={'id': goal_id, 'status': 'completed'})
    else:
        goal_id = client.post('/api/add_goal', json={
            'title': 'Earn XP', 'goal_type': 'xp', 'target_xp': 100}).json()['id']
    task = make_task(client, 'Anything', goal_id=goal_id)

    assert sources(task) == [(goal_id, 'explicit', 1.0)]


def test_another_accounts_goal_cannot_be_linked_by_hand_either(client, stranger):
    theirs = make_goal(stranger, 'Violin ARCT', 'music')
    task = make_task(client, 'Violin lesson', 'music', goal_id=theirs)

    assert mapping(task).status == 'unmatched'
    assert 'goal_id' not in db.find_row('tasks', task, user_id='tester')


def test_deleting_the_linked_goal_leaves_no_trace_of_it(client):
    recital = make_goal(client, 'Spring recital', 'music')
    task = make_task(client, 'Recital run-through', 'music', goal_id=recital)

    client.post('/api/delete_goal', json={'goal_id': recital})

    assert 'goal_id' not in db.find_row('tasks', task, user_id='tester')
    assert 'goal_ids' not in by_id(client.get('/api/tasks').json()['tasks'])[task]

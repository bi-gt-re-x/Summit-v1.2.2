"""Step fifteen of the goal matcher: a model, only where the rules cannot say.

Ambiguous tasks — a few plausible goals, none confident — are the only ones
asked about. A matched task is already answered and an unmatched one has
nothing to ask. The question is one task and a shortlist; anything that cannot
be read leaves the task exactly as ambiguous as it was.
"""
import json

import pytest

from backend.database import connection as db
from backend.goal_matcher import ai, service, store
from backend.goal_matcher.queue import work
from backend.tracking import planner


@pytest.fixture
def model(monkeypatch):
    """A configured model that answers with whatever the test sets."""
    asked = []

    def answer(brief, system=None, schema=None, instruction='', model_id='', max_tokens=0):
        asked.append(brief)
        reply = model.reply
        if isinstance(reply, Exception):
            raise reply
        return reply if isinstance(reply, str) else json.dumps(reply)

    monkeypatch.setattr(planner, 'able', lambda: True)
    monkeypatch.setattr(planner, 'from_provider', answer)
    model.asked = asked
    model.reply = {'goals': []}
    return model


def ambiguous_goals(client):
    """Two goals the rules cannot choose between: both name graph theory, and
    neither is filed under a subject, so nothing tips the balance."""
    first = client.post('/api/add_goal', json={
        'title': 'Reach USACO Gold', 'measure': 'milestones',
        'milestones': ['Gold graph theory solid']}).json()['id']
    second = client.post('/api/add_goal', json={
        'title': 'Pass discrete maths', 'measure': 'milestones',
        'milestones': ['Graph theory problem sheets']}).json()['id']
    work.wait_idle()
    return first, second


def ambiguous_task(client, title='Graph theory', subject='mathematics', **extra):
    task = client.post('/api/tasks', json={
        'name': title, 'subject': subject, 'xp_reward': 5, **extra}).json()['task_id']
    work.wait_idle()
    return task


def mapping(task_id):
    return store.mapping_for('tester', task_id)


def test_the_rules_settle_most_tasks_without_asking(client, model):
    client.post('/api/add_goal', json={'title': 'Violin ARCT', 'measure': 'milestones',
                                       'subject_ids': 'music'})
    work.wait_idle()
    matched = client.post('/api/tasks', json={'name': 'Violin lesson', 'subject': 'music'}).json()['task_id']
    nothing = client.post('/api/tasks', json={'name': 'Ice bath', 'subject': 'health'}).json()['task_id']
    work.wait_idle()

    assert mapping(matched).status == 'matched'
    assert mapping(nothing).status == 'unmatched'
    assert model.asked == []


def test_an_ambiguous_task_is_asked_about_and_the_answer_is_stored(client, model):
    usaco, discrete = ambiguous_goals(client)
    model.reply = {'goals': [2]}

    task = ambiguous_task(client)

    assert mapping(task).goal_ids == (discrete,)
    assert mapping(task).matches[0].source == 'ai'
    assert len(model.asked) == 1


def test_the_question_is_the_task_and_the_shortlist_and_nothing_else(client, model):
    client.post('/api/add_goal', json={'title': 'Violin ARCT', 'measure': 'milestones',
                                       'subject_ids': 'music'})
    ambiguous_goals(client)
    ambiguous_task(client)

    (question,) = model.asked
    assert 'Graph theory' in question and 'mathematics' in question
    assert 'Reach USACO Gold' in question and 'Pass discrete maths' in question
    # Not the account's other goals, and not any task but this one.
    assert 'Violin' not in question
    assert len(question) < 600


def test_an_empty_answer_means_no_goal_rather_than_a_guess(client, model):
    ambiguous_goals(client)
    model.reply = {'goals': []}

    task = ambiguous_task(client)

    assert mapping(task).status == 'unmatched'
    assert mapping(task).goal_ids == ()


@pytest.mark.parametrize('reply', [
    'not json at all',
    {'goals': 'both'},
    {'goals': [9]},            # a goal that was never offered
    {'goals': [True]},
    {'nope': [1]},
])
def test_an_answer_that_cannot_be_read_leaves_the_task_ambiguous(client, model, reply):
    ambiguous_goals(client)
    model.reply = reply

    task = ambiguous_task(client)

    assert mapping(task).status == 'ambiguous'
    assert mapping(task).goal_ids == ()


def test_a_model_that_fails_leaves_the_task_ambiguous_and_the_task_alone(client, model):
    ambiguous_goals(client)
    model.reply = RuntimeError('the provider is down')

    task = ambiguous_task(client)

    assert mapping(task).status == 'ambiguous'
    assert db.find_row('tasks', task, user_id='tester')['title'] == 'Graph theory'


def test_nothing_is_asked_when_no_model_is_configured(client, monkeypatch):
    monkeypatch.setattr(planner, 'able', lambda: False)
    monkeypatch.setattr(planner, 'from_provider',
                        lambda *a, **k: pytest.fail('asked a model that is not configured'))

    ambiguous_goals(client)
    task = ambiguous_task(client)

    assert mapping(task).status == 'ambiguous'


def test_the_same_question_is_asked_once_however_many_tasks_ask_it(client, model):
    usaco, discrete = ambiguous_goals(client)
    model.reply = {'goals': [1]}

    others = [ambiguous_task(client) for _ in range(6)]

    assert len(model.asked) == 1
    assert all(mapping(task).goal_ids == (usaco,) for task in others)


def test_an_edit_while_the_model_is_asked_wins(client, model, monkeypatch):
    usaco, discrete = ambiguous_goals(client)
    task = ambiguous_task(client)
    model.asked.clear()

    # The answer arrives for a title the task no longer has.
    was = {'title': 'Graph theory', 'subject': 'mathematics', 'goal_id': None}
    client.put('/api/tasks/%s' % task, json={'name': 'Violin lesson'})
    work.wait_idle()
    model.reply = {'goals': [1]}

    assert service.resolve('tester', task, was, [usaco, discrete]) is None
    assert mapping(task).status != 'matched' or mapping(task).matches[0].source != 'ai'


def test_a_task_the_reader_linked_is_never_asked_about(client, model):
    usaco, mine = ambiguous_goals(client)

    task = ambiguous_task(client, goal_id=mine)

    assert mapping(task).matches[0].source == 'explicit'
    assert model.asked == []


def test_a_catch_up_asks_about_only_a_few_of_a_long_history(client, model, monkeypatch):
    monkeypatch.setattr(service, 'AI_PER_PASS', 3)
    ambiguous_goals(client)
    for i in range(10):
        db.insert_row('tasks', {'id': 'old-{}'.format(i), 'user_id': 'tester', 'status': 'todo',
                                'title': 'Graph theory {}'.format(i), 'subject': 'mathematics',
                                'priority': 'low', 'xp_value': 1})

    result = service.refresh_tasks('tester', store.stale_tasks('tester', 50))
    work.wait_idle()

    assert result['refreshed'] == 10
    assert result['asked'] == 3
    assert len(model.asked) == 3
    # The rest are ambiguous, which is what they are.
    assert store.mapping_for('tester', 'old-9').status == 'ambiguous'


def test_a_queued_task_says_it_is_queued(client, model, monkeypatch):
    import threading
    gate = threading.Event()

    def slow(*args, **kwargs):
        gate.wait(5)
        return None

    ambiguous_goals(client)
    monkeypatch.setattr(ai, 'ask', slow)

    task = client.post('/api/tasks', json={
        'name': 'Graph theory', 'subject': 'mathematics'}).json()['task_id']

    # Queued, and the state says so rather than claiming an answer.
    assert mapping(task).status == 'pending'
    gate.set()
    work.wait_idle()
    assert mapping(task).status == 'ambiguous'


# ---------------------------------------------------------------------------
# Step 16: the rest of the cases a model can put us in
# ---------------------------------------------------------------------------
def test_nothing_is_asked_when_there_is_nothing_to_choose_between(client, model):
    """No candidates is not a question. It is an answer the rules already gave."""
    assert ai.ask('tester', 'Graph theory', 'mathematics', []) is None
    assert model.asked == []


@pytest.mark.parametrize('failure', [
    TimeoutError('timed out'),
    ConnectionError('connection reset'),
    planner.PlannerUnavailable('rate limited'),
])
def test_every_way_a_call_can_fail_reads_the_same(client, model, failure):
    ambiguous_goals(client)
    model.reply = failure

    task = ambiguous_task(client)

    assert mapping(task).status == 'ambiguous'
    assert mapping(task).goal_ids == ()


def test_a_task_that_has_not_changed_is_never_asked_about_twice(client, model):
    usaco, discrete = ambiguous_goals(client)
    model.reply = {'goals': [1]}
    task = ambiguous_task(client)
    assert len(model.asked) == 1

    # Edits that do not touch the title or the subject, and a catch-up over
    # everything: none of it is a new question.
    client.post('/api/complete_task', json={'task_id': task})
    client.put('/api/tasks/%s' % task, json={'priority': 'high'})
    client.put('/api/tasks/%s' % task, json={'name': 'Graph theory'})
    service.catch_up('tester')
    work.wait_idle()

    assert len(model.asked) == 1
    assert mapping(task).goal_ids == (usaco,)


def test_a_failed_answer_is_not_cached_and_is_asked_again_next_time(client, model):
    ambiguous_goals(client)
    model.reply = RuntimeError('down')
    first = ambiguous_task(client)
    assert mapping(first).status == 'ambiguous'

    model.reply = {'goals': [1]}
    second = ambiguous_task(client, title='Graph theory')

    assert len(model.asked) == 2
    assert mapping(second).status == 'matched'


def test_an_answer_that_lands_before_the_mark_is_not_overwritten_by_it(client, model):
    """The worker can finish before the line that marks the task queued."""
    ambiguous_goals(client)
    model.reply = {'goals': [1]}
    marks = []
    real = store.save_mapping

    def watch(username, task_id, mapping):
        marks.append(mapping.status)
        return real(username, task_id, mapping)

    from backend.goal_matcher import service as svc
    original, svc.store.save_mapping = svc.store.save_mapping, watch
    try:
        task = ambiguous_task(client)
    finally:
        svc.store.save_mapping = original

    # Marked pending first, then answered — never the other way round.
    assert marks.index('pending') < marks.index('matched')
    assert mapping(task).status == 'matched'

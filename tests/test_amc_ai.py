"""The AI layer and smart insights, with the model replaced by a fake.

No test here talks to Grok or Groq: `ai._call` is swapped for a function that
answers by the instruction it was given, and `ai.provider` is pinned to
'grok'. What is under test is everything around the model: caching, the daily
limit, the checks on what comes back, and the second solve that decides
whether a written problem is kept.
"""
import json

import pytest

from backend.amc import ai, create, smart


@pytest.fixture(autouse=True)
def _fresh_created():
    create.forget()
    yield
    create.forget()


@pytest.fixture
def fake_model(monkeypatch):
    """Pins provider 'grok' and records every call. Set `answers[instruction prefix]`."""
    calls = []
    answers = {}

    def call(system, brief, schema, instruction, max_tokens):
        calls.append(instruction)
        for prefix, reply in answers.items():
            if instruction.startswith(prefix):
                return json.dumps(reply(brief) if callable(reply) else reply)
        raise AssertionError('unexpected instruction: ' + instruction)
    monkeypatch.setattr(ai, 'provider', lambda: 'grok')
    monkeypatch.setattr(ai, 'label', lambda: 'Grok · test')
    monkeypatch.setattr(ai, '_call', call)
    return calls, answers


def _answer(client, pid, answer):
    return client.post('/api/amc/problems/{}/attempt'.format(pid), json={'answer': answer, 'seconds': 60}).json()


def test_ability_rises_with_harder_problems_solved():
    easy = smart.fit([(1, True), (1, True), (1.5, True), (2, False)])[0]
    strong = smart.fit([(3, True), (3.5, True), (4, True), (4.5, False)])[0]
    assert strong > easy
    assert smart.fit([])[0] == smart.PRIOR_MEAN


def test_insights_work_without_a_key(client):
    for pid, answer in [('mock10-1-01', 'B'), ('mock10-1-02', 'D'), ('mock10-1-03', 'A'), ('mock10-1-14', 'E')]:
        _answer(client, pid, answer)
    body = client.get('/api/amc/insights').json()
    stats = body['stats']
    assert body['success'] and not body['ai']['available'] and 'XAI_API_KEY' in body['ai']['setup']
    assert stats['answered'] == 4 and stats['contests']['AMC 10']['count'] == 25
    assert 0 <= stats['contests']['AMC 10']['chance'] <= 1
    assert stats['focus'] and stats['next_problems']
    # One miss on a #3 that is far below the level is flagged as careless only once the level is known.
    refused = client.post('/api/amc/insights/ai', json={}).json()
    assert not refused['success'] and 'XAI_API_KEY' in refused['message']


def test_diagnosis_is_written_once_a_day(client, fake_model):
    calls, answers = fake_model
    answers['Read these results'] = {
        'headline': 'You are close.', 'diagnosis': 'Steady work.', 'strengths': ['Algebra'],
        'weaknesses': ['Counting'], 'contest_strategy': 'Do 1-15 first.',
        'this_week': [{'action': 'Twenty counting problems', 'why': 'Most points', 'minutes': 600,
                       'topic': 'not-a-topic'}]}
    first = client.post('/api/amc/insights/ai', json={}).json()
    assert first['success'] and first['diagnosis']['headline'] == 'You are close.'
    assert first['diagnosis']['this_week'][0]['minutes'] == 240 and first['diagnosis']['this_week'][0]['topic'] == ''
    again = client.post('/api/amc/insights/ai', json={}).json()
    assert again['cached'] and len(calls) == 1
    assert client.get('/api/amc/insights').json()['diagnosis']['headline'] == 'You are close.'
    client.post('/api/amc/insights/ai', json={'refresh': True})
    assert len(calls) == 2


def test_hints_are_shared_and_never_give_away_an_aime_answer(client, fake_model):
    calls, answers = fake_model
    answers['Give a level 1 hint'] = {'hint': 'Look at the last digit.'}
    answers['Give a level 2 hint'] = {'hint': 'The answer is 401, by inclusion-exclusion.'}
    one = client.post('/api/amc/ai/hint/mockaime-1-01', json={'level': 1}).json()
    assert one['hint'] == 'Look at the last digit.'
    assert client.post('/api/amc/ai/hint/mockaime-1-01', json={'level': 1}).json()['cached']
    two = client.post('/api/amc/ai/hint/mockaime-1-01', json={'level': 2}).json()
    assert '401' not in two['hint']
    assert len(calls) == 2


def test_explaining_needs_a_wrong_answer(client, fake_model):
    calls, answers = fake_model
    answers['Explain this student'] = {'likely_mistake': 'Added instead of multiplied.',
                                        'habit': 'Reread the question.', 'right_approach': 'Multiply.'}
    assert not client.post('/api/amc/ai/explain/mock10-1-01').json()['success']
    _answer(client, 'mock10-1-01', 'A')
    body = client.post('/api/amc/ai/explain/mock10-1-01').json()
    assert body['success'] and body['given'] == 'A' and body['likely_mistake'].startswith('Added')


PROBLEM = {'statement': 'What is $2 + 2$?', 'choices': ['$1$', '$2$', '$3$', '$4$', '$5$'], 'answer': 'D',
           'solution': ['Add the twos.', 'That is $4$.'], 'insight': 'Addition.', 'trap': 'Multiplying.'}


def test_a_written_problem_is_kept_only_when_a_second_solve_agrees(client, fake_model):
    calls, answers = fake_model
    answers['Write one new problem'] = PROBLEM
    answers['Solve this problem'] = {'work': '2 + 2 = 4', 'answer': '(D)'}
    made = client.post('/api/amc/ai/create', json={'like': 'mock10-1-01'}).json()
    assert made['success'] and made['id'].startswith('ai-')
    assert calls == ['Write one new problem.', 'Solve this problem.']
    listed = client.get('/api/amc/problems', params={'source': 'ai'}).json()
    assert [p['id'] for p in listed['problems']] == [made['id']] and listed['kinds']['ai'] == 1
    assert listed['problems'][0]['source'] == 'AI practice'
    # It is practiced like any other problem, with a solution that ends on its answer.
    reply = _answer(client, made['id'], 'D')
    assert reply['correct'] and reply['problem']['solution'][-1] == r'The answer is $\textbf{(D)}$.'


def test_a_problem_whose_answer_does_not_hold_up_is_thrown_away(client, fake_model):
    calls, answers = fake_model
    answers['Write one new problem'] = PROBLEM
    answers['Solve this problem'] = {'work': 'hmm', 'answer': 'B'}
    made = client.post('/api/amc/ai/create', json={'level': 'AMC 10', 'topic': 'arithmetic', 'rating': 1}).json()
    assert not made['success'] and 'second solve' in made['message']
    assert len(calls) == 4       # two drafts, each checked once
    assert client.get('/api/amc/problems', params={'source': 'ai'}).json()['problems'] == []


def test_malformed_drafts_are_rejected_before_solving(client, fake_model):
    calls, answers = fake_model
    answers['Write one new problem'] = {**PROBLEM, 'choices': ['$1$', '$1$', '$2$', '$3$', '$4$']}
    made = client.post('/api/amc/ai/create', json={'level': 'AMC 10', 'topic': 'arithmetic', 'rating': 1}).json()
    assert not made['success'] and all(c.startswith('Write') for c in calls)


def test_the_daily_limit(client, fake_model, monkeypatch):
    calls, answers = fake_model
    monkeypatch.setenv('AI_DAILY_LIMIT', '1')
    answers['Give a level'] = {'hint': 'Think.'}
    assert client.post('/api/amc/ai/hint/mock10-1-05', json={'level': 1}).json()['success']
    capped = client.post('/api/amc/ai/hint/mock10-1-06', json={'level': 1}).json()
    assert not capped['success'] and 'today' in capped['message']
    status = client.get('/api/amc/ai/status').json()
    assert status['used_today'] == 1 and status['limit'] == 1


def test_grok_is_preferred_whenever_its_key_is_set(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY', 'groq-test')
    monkeypatch.setenv('MILESTONE_PROVIDER', 'groq')
    assert ai.provider() == 'groq'
    monkeypatch.setenv('XAI_API_KEY', 'xai-test')
    assert ai.provider() == 'grok' and ai.label().startswith('Grok')

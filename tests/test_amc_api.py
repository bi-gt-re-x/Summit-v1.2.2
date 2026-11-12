"""The AMC prep API end to end: answering, the review schedule, mocks, the
study plan, search, and that one account never sees another's rows."""
from datetime import date, timedelta

import pytest

from backend.amc import engine
from backend.amc.bank import BY_ID


@pytest.fixture
def today(monkeypatch):
    """Pin the API's idea of today so the review schedule can be walked."""
    state = {'day': date(2026, 11, 12)}
    monkeypatch.setattr('backend.api.amc._today', lambda: state['day'])
    return state


def test_signed_out_is_refused(anon):
    assert anon.get('/api/amc/dashboard').status_code == 401


def test_dashboard_starts_empty(client, today):
    body = client.get('/api/amc/dashboard').json()
    assert body['success']
    assert body['stats']['attempted'] == 0 and body['stats']['due'] == 0
    assert body['next_problem'] is not None
    assert body['plan'] is None


def test_problem_hides_answer_until_attempted(client, today):
    body = client.get('/api/amc/problems/step-10-01').json()
    assert 'answer' not in body['problem'] and 'solution' not in body['problem']
    reply = client.post('/api/amc/problems/step-10-01/attempt', json={'answer': 'D', 'seconds': 40}).json()
    assert reply['correct'] and reply['problem']['answer'] == 'D'
    body = client.get('/api/amc/problems/step-10-01').json()
    assert body['problem']['solution'] and body['status'] == 'solved'


def test_a_miss_comes_back_after_3_10_21_days(client, today):
    client.post('/api/amc/problems/step-10-02/attempt', json={'answer': 'A'})
    queue = client.get('/api/amc/review').json()
    assert queue['due'] == [] and queue['upcoming'][0]['id'] == 'step-10-02'
    assert queue['upcoming'][0]['due'] == '2026-11-15'

    # Right answer before it is due: no change.
    client.post('/api/amc/problems/step-10-02/attempt', json={'answer': 'C', 'source': 'review'})
    assert client.get('/api/amc/review').json()['upcoming'][0]['stage'] == 0

    for days, stage in ((3, 1), (10, 2)):
        today['day'] += timedelta(days=days)
        assert client.get('/api/amc/review').json()['due'][0]['id'] == 'step-10-02'
        client.post('/api/amc/problems/step-10-02/attempt', json={'answer': 'C', 'source': 'review'})
        row = client.get('/api/amc/review').json()['upcoming'][0]
        assert row['stage'] == stage

    today['day'] += timedelta(days=21)
    client.post('/api/amc/problems/step-10-02/attempt', json={'answer': 'C', 'source': 'review'})
    queue = client.get('/api/amc/review').json()
    assert queue['due'] == [] and queue['upcoming'] == []
    assert queue['mastered'][0]['id'] == 'step-10-02'


def test_a_wrong_review_starts_over(client, today):
    client.post('/api/amc/problems/step-10-03/attempt', json={'answer': 'A'})
    today['day'] += timedelta(days=3)
    client.post('/api/amc/problems/step-10-03/attempt', json={'answer': 'E', 'source': 'review'})
    today['day'] += timedelta(days=10)
    client.post('/api/amc/problems/step-10-03/attempt', json={'answer': 'B', 'source': 'review'})
    row = client.get('/api/amc/review').json()['upcoming'][0]
    assert row['stage'] == 0 and row['misses'] == 2


def test_reveal_counts_as_a_miss(client, today):
    body = client.post('/api/amc/problems/step-aime-01/reveal').json()
    assert body['problem']['answer'] == 55
    assert client.get('/api/amc/review').json()['upcoming'][0]['id'] == 'step-aime-01'


def test_blank_answer_is_refused(client, today):
    assert not client.post('/api/amc/problems/step-10-01/attempt', json={'answer': ''}).json()['success']


def test_mock_is_scored_like_the_real_thing(client, today):
    answers = {}
    for i, pid in enumerate(['step-10-{:02d}'.format(n) for n in range(1, 26)], start=1):
        if i <= 20:
            answers[str(i)] = BY_ID[pid]['answer']   # 20 right
        elif i <= 22:
            answers[str(i)] = ''                      # 2 blank
        else:
            right = BY_ID[pid]['answer']
            answers[str(i)] = 'A' if right != 'A' else 'B'  # 3 wrong
    reply = client.post('/api/amc/contests/step-mock-10/submit', json={'answers': answers, 'seconds': 3600}).json()
    result = client.get('/api/amc/mocks/' + reply['id']).json()
    assert result['result']['score'] == 20 * 6 + 2 * 1.5
    assert (result['result']['correct'], result['result']['wrong'], result['result']['blank']) == (20, 3, 2)
    # Wrong and blank problems all land in review.
    queue = client.get('/api/amc/review').json()
    assert len(queue['upcoming']) == 5


def test_aime_mock_scores_one_per_answer(client, today):
    answers = {str(i): BY_ID['step-aime-{:02d}'.format(i)]['answer'] for i in range(1, 8)}
    reply = client.post('/api/amc/contests/step-mock-aime/submit', json={'answers': answers}).json()
    assert client.get('/api/amc/mocks/' + reply['id']).json()['result']['score'] == 7


def test_contest_pages(client, today):
    mock = client.get('/api/amc/contests/step-mock-12').json()
    assert mock['contest']['count'] == 25 and len(mock['problems']) == 25
    assert 'answer' not in mock['problems'][0] and mock['problems'][0]['number'] == 1
    past = client.get('/api/amc/contests/2021-fall-amc-10b').json()
    assert past['contest']['kind'] == 'past' and past['contest']['problems_url'].endswith('2021_Fall_AMC_10B_Problems')
    listing = client.get('/api/amc/contests').json()
    assert [m['count'] for m in listing['mocks']] == [25, 25, 15]


def test_logging_a_past_contest(client, today):
    assert client.post('/api/amc/contests/2023-amc-10a/log', json={'score': 103.5}).json()['success']
    assert not client.post('/api/amc/contests/2023-amc-10a/log', json={'score': 151}).json()['success']
    assert not client.post('/api/amc/contests/2023-amc-10a/submit', json={'answers': {}}).json()['success']
    body = client.get('/api/amc/contests').json()
    year = next(y for y in body['years'] if y['year'] == 2023)
    row = next(c for c in year['contests'] if c['id'] == '2023-amc-10a')
    assert row['logged']['score'] == 103.5


def test_study_plan(client, today):
    assert client.get('/api/amc/plan').json()['plan'] is None
    bad = client.put('/api/amc/plan', json={'target': 'AMC 10', 'exam_date': '2020-01-01',
                                            'goal_score': 100, 'hours': 5}).json()
    assert not bad['success']
    body = client.put('/api/amc/plan', json={'target': 'AMC 10', 'exam_date': '2027-02-01',
                                             'goal_score': 105, 'hours': 5}).json()
    assert body['success'] and body['plan']['days_left'] == (date(2027, 2, 1) - date(2026, 11, 12)).days
    phases = [w['phase'] for w in body['weeks']]
    assert phases[0] == 'Foundations' and phases[-1] == 'Taper'
    assert 'Contest mode' in phases and any(w['mock'] for w in body['weeks'])
    assert body['weeks'][0]['current']
    key = body['today'][0]['key']
    ticked = client.post('/api/amc/plan/check', json={'key': key, 'done': True}).json()
    assert next(i for i in ticked['today'] if i['key'] == key)['done']


def test_search_finds_problems_topics_and_contests(client, today):
    body = client.get('/api/amc/search', params={'q': 'modular'}).json()
    assert any(t['id'] == 'modular-arithmetic' for t in body['topics'])
    assert body['problems']
    body = client.get('/api/amc/search', params={'q': '2019 aime'}).json()
    assert {c['name'] for c in body['contests']} >= {'2019 AIME I', '2019 AIME II'}
    assert client.get('/api/amc/search', params={'q': 'review'}).json()['pages'][0]['to'] == '/review'


def test_accounts_are_separate(client, stranger, today):
    client.post('/api/amc/problems/step-10-02/attempt', json={'answer': 'A'})
    assert stranger.get('/api/amc/review').json()['upcoming'] == []
    assert stranger.get('/api/amc/dashboard').json()['stats']['attempted'] == 0


def test_projection_rises_with_results():
    empty = engine.projected({}, 'AMC 10')
    strong = engine.history([{'problem_id': p, 'correct': 1, 'at': '2026-11-12T10:00:00', 'seconds': 60}
                             for p in BY_ID])
    assert engine.projected(strong, 'AMC 10') > empty
    assert 0 < empty < 150


def test_resetting_amc_progress_clears_only_amc_rows(client, today):
    client.post('/api/amc/problems/step-10-02/attempt', json={'answer': 'A'})
    client.put('/api/amc/plan', json={'target': 'AIME', 'exam_date': '2027-02-05',
                                      'goal_score': 7, 'hours': 4})
    assert not client.post('/api/settings/reset', json={'scope': 'amc'}).json()['success']
    reply = client.post('/api/settings/reset', json={'scope': 'amc', 'confirm': 'tester'}).json()
    assert reply['success'] and reply['removed']['amc_attempts'] == 1
    assert client.get('/api/amc/review').json()['upcoming'] == []
    assert client.get('/api/amc/plan').json()['plan'] is None
    assert client.get('/api/settings').json()['success']


def test_the_export_includes_amc_rows(client, today):
    client.post('/api/amc/problems/step-10-01/attempt', json={'answer': 'D'})
    body = client.get('/api/settings/export', params={'table': 'all', 'format': 'json'}).json()
    rows = body['export']['tables']['amc_attempts']
    assert rows and rows[0]['problem_id'] == 'step-10-01'

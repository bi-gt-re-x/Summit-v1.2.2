"""The study plan's AI coach, with the model call stubbed out."""
import json
from datetime import date

import pytest

from backend.amc import coach
from backend.tracking import planner

REPLY = {
    'summary': 'Lock in #1-15, then build geometry and counting for #16-20.',
    'starting_point': 'You have not answered anything yet.',
    'phases': [
        {'name': 'Foundations', 'weeks': '1-8', 'goal': 'Clean on #1-10.',
         'focus_topics': ['circles', 'not-a-topic', 'probability'], 'routine': 'Three sets a week.'},
        {'name': 'Contest mode', 'weeks': '9-12', 'goal': 'A mock every week.',
         'focus_topics': ['area'], 'routine': 'Mock on Saturday.'},
    ],
    'weekly_schedule': [{'day': 'Mon', 'task': 'Ten circle problems', 'minutes': 60},
                        {'day': 'Sat', 'task': 'Timed mock', 'minutes': 9999}],
    'milestones': [{'week': 8, 'target': '90 on a mock'}, {'week': 2, 'target': 'Finish the circles set'}],
    'focus_order': ['circles', 'CIRCLES', 'logarithms', 'probability'],
    'tips': ['Skip a problem after three minutes.'],
    'questions': ['Do you have AoPS Intro to Geometry?'],
}


@pytest.fixture
def model(monkeypatch):
    """A configured provider whose answer is REPLY, recording what it was told."""
    seen = {}

    def answer(brief, system=None, schema=None, instruction='', **_):
        seen.update(brief=brief, schema=schema)
        return json.dumps(REPLY)

    monkeypatch.setattr(planner, 'provider', lambda: 'groq')
    monkeypatch.setattr(planner, 'from_provider', answer)
    monkeypatch.setattr('backend.api.amc._today', lambda: date(2026, 11, 12))
    return seen


def _plan(client, **details):
    return client.put('/api/amc/plan', json={
        'target': 'AMC 10', 'exam_date': '2027-11-05', 'goal_score': 105, 'hours': 6,
        'details': {'experience': 'taken', 'last_score': 84, 'days_per_week': 4,
                    'weak': ['circles', 'bogus'], 'resources': 'AoPS Intro to Counting',
                    'notes': 'Only free on weekends', **details}}).json()


def test_details_are_kept_and_bounded(client, model):
    body = _plan(client, days_per_week=12)
    details = body['plan']['details']
    assert details['days_per_week'] == 7 and details['weak'] == ['circles']
    assert details['resources'] == 'AoPS Intro to Counting'


def test_the_coach_writes_a_plan_from_everything_it_was_told(client, model):
    _plan(client)
    body = client.post('/api/amc/plan/coach', json={}).json()
    assert body['success']
    written = body['plan']['coach']
    # Bounded and checked: unknown and off-contest topics dropped (logarithms
    # is AMC 12 / AIME only), duplicates folded, minutes capped, milestones sorted.
    assert written['phases'][0]['focus_topics'] == ['circles', 'probability']
    assert written['focus_order'] == ['circles', 'probability']
    assert written['weekly_schedule'][1]['minutes'] == 600
    assert [m['week'] for m in written['milestones']] == [2, 8]
    assert written['questions'] == ['Do you have AoPS Intro to Geometry?']
    assert body['plan']['coach_by'].startswith('Groq')
    # The brief carried the intake answers and the topic list.
    assert 'Only free on weekends' in model['brief'] and 'most recent real score' in model['brief']
    assert '- circles: Circles' in model['brief']
    assert model['schema'] is coach.SCHEMA
    # Its topic order leads the week-by-week plan.
    assert [f['id'] for f in body['weeks'][0]['focus']] == ['circles', 'probability']


def test_follow_up_answers_reach_the_model(client, model):
    _plan(client)
    client.post('/api/amc/plan/coach', json={'answers': {'Do you have AoPS Intro to Geometry?': 'Yes, half done'}})
    assert 'Yes, half done' in model['brief']


def test_changing_contest_drops_the_old_coach_plan(client, model):
    _plan(client)
    client.post('/api/amc/plan/coach', json={})
    body = client.put('/api/amc/plan', json={'target': 'AIME', 'exam_date': '2027-02-05',
                                             'goal_score': 7, 'hours': 6}).json()
    assert body['plan']['coach'] is None
    assert body['plan']['details']['resources'] == 'AoPS Intro to Counting'


def test_no_key_is_said_plainly(client, monkeypatch):
    monkeypatch.setattr(planner, 'provider', lambda: '')
    _plan(client)
    body = client.post('/api/amc/plan/coach', json={}).json()
    assert not body['success'] and 'GROQ_API_KEY' in body['message']


def test_an_unreadable_answer_is_an_error_not_a_crash(client, monkeypatch, model):
    monkeypatch.setattr(planner, 'from_provider', lambda *a, **k: 'not json at all')
    _plan(client)
    body = client.post('/api/amc/plan/coach', json={}).json()
    assert not body['success'] and 'could not be read' in body['message']

"""What to review: three review sessions above Next sessions —
backend/tracking/review_sessions and /api/review_sessions in
backend/api/subject_ai.py."""
from datetime import date, datetime, timedelta

from backend.database import connection as db
from backend.tracking import review_sessions as rs
from backend.tracking import subject_ai

TODAY = date(2026, 10, 24)
NAMES = {'mathematics': 'Mathematics', 'music': 'Music'}


def _task(title, subject, days_ago, **extra):
    day = (TODAY - timedelta(days=days_ago)).isoformat()
    return {'title': title, 'subject': subject, 'status': 'done',
            'completed_at': day + 'T10:00:00', **extra}


class TestWhatIsDue:
    def test_work_on_its_spacing_day_is_due(self):
        found = rs.due([_task('Proof set 3', 'mathematics', 7),
                        _task('Proof set 9', 'mathematics', 10)], 'mathematics', today=TODAY)
        assert found['spaced'] == ['"Proof set 3", finished 7 days ago']

    def test_work_that_went_badly_is_due_with_how_it_went(self):
        found = rs.due([_task('Putnam A1', 'mathematics', 10, execution=2, difficulty=4)],
                       'mathematics', today=TODAY)
        assert found['badly'] == ['"Putnam A1", finished 10 days ago; filed 4 of 5 hard, rated 2 of 5']

    def test_a_low_score_counts_as_going_badly(self):
        found = rs.due([_task('Quiz', 'mathematics', 9, score_got=5, score_of=10)],
                       'mathematics', today=TODAY)
        assert 'scored 5 of 10' in found['badly'][0]

    def test_hard_work_done_once_is_due_but_not_once_followed_up(self):
        alone = rs.due([_task('Galois theory notes', 'mathematics', 20, difficulty=5)],
                       'mathematics', today=TODAY)
        assert len(alone['hard']) == 1
        followed = rs.due([_task('Galois theory notes', 'mathematics', 20, difficulty=5),
                           _task('Galois theory notes', 'mathematics', 12, difficulty=4)],
                          'mathematics', today=TODAY)
        assert followed['hard'] == []

    def test_a_routine_is_not_material_to_review(self):
        tasks = [_task('Evening review', 'planning', day) for day in range(1, 9)]
        assert rs.count(rs.due(tasks, None, today=TODAY)) == 0

    def test_across_subjects_each_title_carries_its_subject(self):
        found = rs.due([_task('Scales', 'music', 3)], None, NAMES, today=TODAY)
        assert found['spaced'] == ['"[Music] Scales", finished 3 days ago']

    def test_the_block_is_empty_when_nothing_is_due(self):
        assert rs.brief_block({'spaced': [], 'badly': [], 'hard': []}) == ''
        assert '<review_due>' in rs.brief_block({'spaced': ['x'], 'badly': [], 'hard': []})

    def test_the_plan_is_told_these_are_review_sessions(self, monkeypatch):
        seen = {}

        def answer(brief, **kwargs):
            seen.update(kwargs, brief=brief)
            return '{"next_steps": []}'

        monkeypatch.setattr(subject_ai, 'configured', lambda: True)
        monkeypatch.setattr(subject_ai.planner, 'from_provider', answer)
        try:
            subject_ai.plan({'subject': 'Mathematics'}, review='\n\n<review_due>\nx\n</review_due>')
        except subject_ai.BriefUnavailable:
            pass
        assert 'THESE ARE REVIEW SESSIONS' in seen['system']
        assert 'review sessions' in seen['instruction']
        assert '<review_due>' in seen['brief']


# ---- The endpoints -----------------------------------------------------------
STEPS = [
    {'title': 'Redo Proof set 2 cold', 'focus': 'Mathematics', 'type': 'review',
     'difficulty': 3, 'minutes': 30, 'reason': 'done 1 day ago', 'drills': []},
    {'title': 'Scales from memory', 'focus': 'Music', 'type': 'review',
     'difficulty': 2, 'minutes': 20, 'reason': 'done 1 day ago', 'drills': []},
    {'title': 'Proof set 1 recall', 'focus': 'Mathematics', 'type': 'timed_set',
     'difficulty': 3, 'minutes': 25, 'reason': 'done 1 day ago', 'drills': []},
]


def _seed(username='tester'):
    day = (date.today() - timedelta(days=1)).isoformat()
    for at, (title, subject) in enumerate((('Proof set 1', 'mathematics'),
                                            ('Proof set 2', 'mathematics'),
                                            ('Scales', 'music'))):
        db.insert_row('tasks', {
            'id': 'rv{}{}'.format(int(datetime.now().timestamp() * 1000), at),
            'user_id': username, 'title': title, 'subject': subject, 'status': 'done',
            'priority': 'low', 'xp_value': 10, 'completed_at': day + 'T10:00:00',
            'created_at': day + 'T09:00:00', 'difficulty': 3, 'execution': 4})


def _stub(monkeypatch, record=None):
    def plan(state, model_id='', overall=False, starter=False, review=''):
        if record is not None:
            record.update(state=state, overall=overall, review=review)
        return [dict(step) for step in STEPS]

    monkeypatch.setattr(subject_ai, 'configured', lambda: True)
    monkeypatch.setattr(subject_ai, 'plan', plan)


def test_three_review_sessions_are_kept_apart_from_next_sessions(client, monkeypatch):
    _seed()
    seen = {}
    _stub(monkeypatch, seen)
    body = client.post('/api/review_sessions', json={}).json()
    assert body['success'] is True, body
    assert seen['overall'] is True and '<review_due>' in seen['review']
    assert [step['title'] for step in body['steps']] == [step['title'] for step in STEPS]

    again = client.get('/api/review_sessions').json()
    assert [step['id'] for step in again['steps']] == [step['id'] for step in body['steps']]
    assert again['due'] >= 1
    assert client.get('/api/next_sessions').json()['steps'] == []


def test_planning_a_review_session_files_it_under_its_subject(client, monkeypatch):
    _seed()
    _stub(monkeypatch)
    steps = client.post('/api/review_sessions', json={}).json()['steps']
    booked = client.post('/api/subject_recommendation/plan', json={'id': steps[1]['id']}).json()
    assert booked['success'] is True, booked
    assert db.find_row('tasks', booked['task']['id'], user_id='tester')['subject'] == 'music'
    states = [step['state'] for step in client.get('/api/review_sessions').json()['steps']]
    assert states == ['open', 'planned', 'open']


def test_one_subject_has_its_own_three(client, monkeypatch):
    _seed()
    seen = {}
    _stub(monkeypatch, seen)
    body = client.post('/api/review_sessions', json={'subject_id': 'mathematics'}).json()
    assert body['subject'] == 'Review: Mathematics' and seen['overall'] is False
    assert client.get('/api/review_sessions').json()['steps'] == []


def test_nothing_due_says_so(client, monkeypatch):
    _stub(monkeypatch)
    body = client.post('/api/review_sessions', json={}).json()
    assert body['success'] is False and 'due for review' in body['message']


def test_workouts_and_social_plans_are_not_material_to_review():
    found = rs.due([_task('Long run with friends', 'running', 3),
                    _task('Dinner out', 'friends', 7),
                    _task('Proof set 3', 'mathematics', 7)], None, NAMES, today=TODAY)
    assert found['spaced'] == ['"[Mathematics] Proof set 3", finished 7 days ago']

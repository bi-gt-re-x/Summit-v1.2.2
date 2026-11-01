"""The five kinds of next session and the topics they read —
backend/tracking/session_kinds and /api/next_sessions."""
from datetime import date, datetime, timedelta

from backend.database import connection as db
from backend.tracking import session_kinds as sk
from backend.tracking import subject_ai
from backend.tracking import topics as topic_tracking


def _row(topic, status, gap, subject='mathematics', **extra):
    return {'subject': subject, 'subject_label': subject.title(), 'subsubject': 'competition-math',
            'subsubject_label': 'Competition Math', 'topic': topic, 'label': topic.split(':')[-1].title(),
            'status': status, 'gap': gap, 'tasks': 5, 'execution': 3.0, 'base': 3.5, **extra}


ROWS = [_row('competition-math:counting', 'weak', -0.6),
        _row('competition-math:geometry', 'weak', -0.3),
        _row('competition-math:casework', 'strong', 0.5),
        _row('competition-math:algebra', 'steady', 0.1),
        _row('running:tempo', 'weak', -0.9, subject='running')]


class TestTheKinds:
    def test_anything_unknown_is_general(self):
        assert sk.kind_of('weakness') == 'weakness'
        assert sk.kind_of('nonsense') == 'general'

    def test_each_kind_has_its_own_ledger_key(self):
        assert sk.key('general') == 'All subjects'
        assert sk.key('general', 'Music') == 'Music'
        assert sk.key('review') == 'Review: all subjects'
        assert sk.key('review', 'Music') == 'Review: Music'
        assert sk.key('expansion', 'Music') == 'Expansion: Music'
        assert sk.key('new') == 'New topics: all subjects'
        assert len(set(sk.ACROSS)) == 5

    def test_the_subject_comes_back_out_of_a_key(self):
        assert sk.subject_of('New topics: Earth science') == 'Earth science'
        assert sk.subject_of('Earth science') == 'Earth science'


class TestTheTopics:
    def test_weakest_are_worst_first_and_skip_workouts(self):
        found = sk.weakest(sk.studied(ROWS))
        assert [row['topic'] for row in found] == ['competition-math:counting', 'competition-math:geometry']

    def test_strongest_are_best_first(self):
        assert [row['topic'] for row in sk.strongest(sk.studied(ROWS))] == ['competition-math:casework']

    def test_with_none_called_weak_it_reads_the_ones_under_average(self):
        rows = [_row('a:b', 'steady', -0.1), _row('a:c', 'steady', 0.1)]
        assert [row['topic'] for row in sk.weakest(rows)] == ['a:b']

    def test_options_lead_with_what_the_kind_cares_about(self):
        ids = [row['id'] for row in sk.options('expansion', ROWS, None)]
        assert ids[0] == 'competition-math:casework'
        assert 'running:tempo' not in ids
        assert [row['id'] for row in sk.options('weakness', ROWS, None)][0] == 'competition-math:counting'

    def test_options_stay_in_the_subjects_picked(self):
        assert sk.options('weakness', ROWS, ['music']) == []

    def test_untouched_topics_leave_out_what_is_done(self):
        tax = topic_tracking.taxonomy()
        first = next(tid for tid, topic in tax.topics.items() if topic['tree'] == 'mathematics')
        rows = [{**_row(first, 'steady', 0), 'subsubject': 'mathematics'}]
        found = sk.untouched(rows, ['mathematics'])
        assert found and all(row['topic'] != first for row in found)
        assert {row['status'] for row in found} == {'untouched'}
        assert all(row['subsubject'] == 'mathematics' for row in found)

    def test_a_topic_a_goal_needs_comes_first(self):
        goals = [{'id': 'g1', 'title': 'Reach AIME'}]
        found = sk.untouched([], ['mathematics'], goals)
        assert found[0]['why'].startswith('goal: Reach AIME')


class TestTheBrief:
    def test_weakness_lists_the_weak_with_their_numbers(self):
        block = sk.brief_block('weakness', ROWS, None)
        assert '<weakest_topics>' in block and 'Counting' in block and 'rated 3 of 5' in block
        assert 'Casework' not in block

    def test_picked_topics_win_over_what_the_kind_would_choose(self):
        block = sk.brief_block('weakness', ROWS, None, ['competition-math:casework'])
        assert 'Casework' in block and 'Counting' not in block

    def test_general_has_a_section_only_when_topics_are_picked(self):
        assert sk.brief_block('general', ROWS, None) == ''
        assert '<picked_topics>' in sk.brief_block('general', ROWS, None, ['competition-math:casework'])

    def test_each_kind_tells_the_model_what_the_sessions_are_for(self, monkeypatch):
        seen = {}

        def answer(brief, **kwargs):
            seen.update(kwargs, brief=brief)
            return '{"next_steps": []}'

        monkeypatch.setattr(subject_ai, 'configured', lambda: True)
        monkeypatch.setattr(subject_ai.planner, 'from_provider', answer)
        for angle, note, words in (('expansion', 'EXPANSION', 'expansion sessions'),
                                   ('weakness', 'WEAKNESS', 'weakness sessions'),
                                   ('new', 'NEW-TOPIC', 'new-topic sessions')):
            try:
                subject_ai.plan({'subject': 'Mathematics'}, angle=angle, focus='\n\n<x>y</x>')
            except subject_ai.BriefUnavailable:
                pass
            assert note in seen['system'] and words in seen['instruction'] and '<x>y</x>' in seen['brief']

    def test_tasks_filter_by_the_topic_their_name_files_under(self):
        tasks = [{'title': 'AMC 10 recursive counting set', 'subject': 'mathematics'},
                 {'title': 'Scales', 'subject': 'music'}]
        topic = topic_tracking.classify(tasks[0]['title'], '', 'mathematics')['topic']
        assert topic and sk.on_topics(tasks, [topic]) == [tasks[0]]


# ---- The endpoints -----------------------------------------------------------
STEPS = [
    {'title': 'Harder counting', 'focus': 'Mathematics', 'type': 'targeted_practice',
     'difficulty': 3, 'minutes': 30, 'reason': 'x', 'drills': []},
    {'title': 'Counting from the start', 'focus': 'Mathematics', 'type': 'review',
     'difficulty': 2, 'minutes': 20, 'reason': 'x', 'drills': []},
    {'title': 'Counting timed', 'focus': 'Mathematics', 'type': 'timed_set',
     'difficulty': 3, 'minutes': 25, 'reason': 'x', 'drills': []},
]


def _seed(username='tester'):
    day = (date.today() - timedelta(days=2)).isoformat()
    stamp = int(datetime.now().timestamp() * 1000)
    plan = [('AMC 10 recursive counting set', 2), ('AMC 10 recursive counting drill', 2),
            ('AMC 10 recursive counting quiz', 1), ('AMC 10 casework set', 5),
            ('AMC 10 casework drill', 5), ('AMC 10 casework quiz', 5),
            ('AMC 10 probability set', 3), ('AMC 10 probability drill', 3), ('AMC 10 probability quiz', 3)]
    for at, (title, execution) in enumerate(plan):
        db.insert_row('tasks', {
            'id': 'sk{}{}'.format(stamp, at), 'user_id': username, 'title': title,
            'subject': 'mathematics', 'status': 'done', 'priority': 'low', 'xp_value': 10,
            'completed_at': day + 'T10:00:00', 'created_at': day + 'T09:00:00',
            'difficulty': 3, 'execution': execution})


def _stub(monkeypatch, record=None):
    def plan(state, model_id='', overall=False, starter=False, review='', angle='', focus=''):
        if record is not None:
            record.update(state=state, overall=overall, starter=starter, review=review,
                          angle=angle, focus=focus)
        return [dict(step) for step in STEPS]

    monkeypatch.setattr(subject_ai, 'configured', lambda: True)
    monkeypatch.setattr(subject_ai, 'plan', plan)


def test_a_read_offers_topics_and_says_how_much_there_is(client):
    _seed()
    body = client.get('/api/next_sessions', params={'kind': 'weakness'}).json()
    assert body['success'] is True and body['kind'] == 'weakness'
    assert body['due'] >= 1 and body['topics'][0]['status'] == 'weak'
    assert body['subject'] == 'Weakness: all subjects'


def test_weakness_plans_from_the_weak_and_keeps_its_own_three(client, monkeypatch):
    _seed()
    seen = {}
    _stub(monkeypatch, seen)
    body = client.post('/api/next_sessions', json={'kind': 'weakness'}).json()
    assert body['success'] is True, body
    assert seen['angle'] == 'weakness' and '<weakest_topics>' in seen['focus']
    shown = client.get('/api/next_sessions', params={'kind': 'weakness'}).json()['steps']
    assert [step['id'] for step in shown] == [step['id'] for step in body['steps']]
    assert client.get('/api/next_sessions').json()['steps'] == []
    assert client.get('/api/next_sessions', params={'kind': 'expansion'}).json()['steps'] == []


def test_a_kind_with_nothing_to_work_from_says_so(client, monkeypatch):
    _stub(monkeypatch)
    for kind, words in (('expansion', 'strong topics'), ('weakness', 'weak topics'),
                        ('review', 'due for review')):
        body = client.post('/api/next_sessions', json={'kind': kind}).json()
        assert body['success'] is False and words in body['message']


def test_picked_topics_narrow_the_work_the_plan_reads(client, monkeypatch):
    _seed()
    seen = {}
    _stub(monkeypatch, seen)
    topic = topic_tracking.classify('AMC 10 casework set', '', 'mathematics')['topic']
    body = client.post('/api/next_sessions', json={'topics': [topic]}).json()
    assert body['success'] is True, body
    assert seen['state']['finished'] == 3 and '<picked_topics>' in seen['focus']


def test_new_topics_need_no_finished_work(client, monkeypatch):
    seen = {}
    _stub(monkeypatch, seen)
    body = client.post('/api/next_sessions', json={'kind': 'new', 'subject_id': 'mathematics'}).json()
    assert body['success'] is True, body
    assert seen['angle'] == 'new' and '<new_topics>' in seen['focus'] and seen['starter'] is False
    assert body['subject'] == 'New topics: Mathematics'


def test_planning_a_session_of_any_kind_files_it_from_its_focus(client, monkeypatch):
    _seed()
    _stub(monkeypatch)
    steps = client.post('/api/next_sessions', json={'kind': 'expansion'}).json()['steps']
    booked = client.post('/api/subject_recommendation/plan', json={'id': steps[0]['id']}).json()
    assert booked['success'] is True, booked
    assert db.find_row('tasks', booked['task']['id'], user_id='tester')['subject'] == 'mathematics'
    states = [step['state'] for step in client.get('/api/next_sessions', params={'kind': 'expansion'}).json()['steps']]
    assert states == ['planned', 'open', 'open']

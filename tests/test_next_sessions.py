"""Three next sessions from the dashboard and the Recommendations tab: for one
subject, or across every subject — backend/tracking/next_sessions and
/api/next_sessions in backend/api/subject_ai.py."""
from datetime import date, datetime, timedelta

from backend.database import connection as db
from backend.tracking import next_sessions as ns
from backend.tracking import subject_ai

TODAY = date(2026, 10, 7)
NAMES = {'mathematics': 'Mathematics', 'music': 'Music'}


def _task(title, subject, days_ago, **extra):
    day = (TODAY - timedelta(days=days_ago)).isoformat()
    return {'title': title, 'subject': subject, 'status': 'done',
            'completed_at': day + 'T10:00:00', **extra}


class TestTheBrief:
    def test_numbers_are_blanked_so_ranges_of_one_material_group(self):
        assert ns.name_family('MATHCOUNTS Sprint 21-30') == 'MATHCOUNTS Sprint #'
        assert ns.name_family('AMC10 2019 #14') == 'AMC10 #'

    def test_one_subject_counts_only_its_own_work_in_the_window(self):
        tasks = [
            _task('Proof set 1', 'mathematics', 1, difficulty=4, execution=2, reason='unclear'),
            _task('Proof set 2', 'mathematics', 5, difficulty=4, execution=5),
            _task('Scales', 'music', 2),
            _task('Old proof set', 'mathematics', 200),
            _task('Earlier proof set', 'mathematics', 120),
        ]
        state = ns.state_for(tasks, 'mathematics', 'Mathematics', NAMES, TODAY)
        assert state['finished'] == 2 and state['finished_before'] == 1
        assert state['rated'] == 2 and state['active_days'] == 2
        group = state['work_groups'][0]
        assert group['name'] == 'Proof set #' and group['count'] == 2
        assert group['well'] == 1 and group['badly'] == 1 and group['execution'] == 3.5
        assert state['mistakes'] == [{'label': 'Did not know where to start', 'count': 1, 'share': 100}]
        assert [row['title'] for row in state['recent_work']] == ['Proof set 1', 'Proof set 2']

    def test_every_subject_puts_the_subject_in_front_of_each_title(self):
        tasks = [_task('Proof set 1', 'mathematics', 1), _task('Scales', 'music', 2)]
        state = ns.state_for(tasks, None, ns.OVERALL, NAMES, TODAY)
        assert state['subject'] == 'All subjects' and state['finished'] == 2
        assert [row['title'] for row in state['recent_work']] == [
            '[Mathematics] Proof set 1', '[Music] Scales']

    def test_minutes_are_the_calendar_block_and_never_a_lead_time(self):
        placed = _task('Lecture', 'mathematics', 1, show_on_calendar=1,
                       created_at='2026-10-06T09:00:00', due_date='2026-10-06T10:30:00',
                       completion_seconds=400_000)
        lead = _task('Problem set', 'mathematics', 1, completion_seconds=400_000)
        short = _task('Drill', 'mathematics', 1, completion_seconds=1_200)
        rows = ns.recent_work([placed, lead, short])
        assert [row['minutes'] for row in rows] == [90, None, 20]

    def test_the_picker_lists_subjects_with_recent_work_busiest_first(self):
        tasks = [_task('a', 'music', 1), _task('b', 'mathematics', 1),
                 _task('c', 'mathematics', 2), _task('d', 'chemistry', 1)]
        assert ns.subjects_in(tasks, NAMES, TODAY) == [
            {'id': 'mathematics', 'name': 'Mathematics', 'count': 2},
            {'id': 'music', 'name': 'Music', 'count': 1}]

    def test_a_session_across_subjects_is_filed_by_its_focus(self):
        assert ns.subject_named('Mathematics', NAMES) == 'mathematics'
        assert ns.subject_named('[Music]', NAMES) == 'music'
        assert ns.subject_named('Music theory', NAMES) == 'music'
        assert ns.subject_named('Cooking', NAMES) is None

    def test_the_overall_plan_is_told_it_spans_every_subject(self, monkeypatch):
        seen = {}

        def answer(brief, **kwargs):
            seen.update(kwargs)
            return '{"next_steps": []}'

        monkeypatch.setattr(subject_ai, 'configured', lambda: True)
        monkeypatch.setattr(subject_ai.planner, 'from_provider', answer)
        try:
            subject_ai.plan({'subject': 'All subjects'}, overall=True)
        except subject_ai.BriefUnavailable:
            pass
        assert 'THIS BRIEF COVERS EVERY SUBJECT' in seen['system']
        assert 'across these subjects' in seen['instruction']


# ---- The endpoints -----------------------------------------------------------
STEPS = [
    {'title': 'Putnam 2019 A1-A3', 'focus': 'Mathematics', 'type': 'timed_set',
     'difficulty': 4, 'minutes': 60, 'reason': 'two went badly', 'drills': []},
    {'title': 'Bach intonation', 'focus': 'Music', 'type': 'targeted_practice',
     'difficulty': 3, 'minutes': 30, 'reason': 'one went well', 'drills': []},
    {'title': 'Proof review', 'focus': 'Mathematics', 'type': 'review',
     'difficulty': 2, 'minutes': 20, 'reason': 'two done', 'drills': []},
]


def _seed(username='tester'):
    day = (date.today() - timedelta(days=1)).isoformat()
    for at, (title, subject) in enumerate((('Proof set 1', 'mathematics'),
                                            ('Proof set 2', 'mathematics'),
                                            ('Scales', 'music'))):
        db.insert_row('tasks', {
            'id': 'ns{}{}'.format(int(datetime.now().timestamp() * 1000), at),
            'user_id': username, 'title': title, 'subject': subject, 'status': 'done',
            'priority': 'low', 'xp_value': 10, 'completed_at': day + 'T10:00:00',
            'created_at': day + 'T09:00:00', 'difficulty': 3, 'execution': 4})


def _stub(monkeypatch, record=None):
    def plan(state, model_id='', overall=False):
        if record is not None:
            record.update(state=state, overall=overall)
        return [dict(step) for step in STEPS]

    monkeypatch.setattr(subject_ai, 'configured', lambda: True)
    monkeypatch.setattr(subject_ai, 'plan', plan)


def test_nothing_suggested_yet_lists_the_subjects_to_choose_from(client):
    _seed()
    body = client.get('/api/next_sessions').json()
    assert body['success'] is True
    assert body['subject'] == 'All subjects' and body['steps'] == []
    assert [entry['id'] for entry in body['subjects']] == ['mathematics', 'music']


def test_three_across_every_subject_are_kept_and_come_back(client, monkeypatch):
    _seed()
    seen = {}
    _stub(monkeypatch, seen)
    body = client.post('/api/next_sessions', json={}).json()
    assert body['success'] is True, body
    assert seen['overall'] is True
    assert seen['state']['recent_work'][0]['title'].startswith('[')
    assert [step['title'] for step in body['steps']] == [step['title'] for step in STEPS]
    assert all(step['state'] == 'open' and step['id'] for step in body['steps'])

    again = client.get('/api/next_sessions').json()
    assert [step['id'] for step in again['steps']] == [step['id'] for step in body['steps']]


def test_one_subjects_three_are_the_subject_pages_three(client, monkeypatch):
    _seed()
    seen = {}
    _stub(monkeypatch, seen)
    body = client.post('/api/next_sessions', json={'subject_id': 'mathematics'}).json()
    assert body['subject'] == 'Mathematics' and seen['overall'] is False
    saved = client.get('/api/subject_reading_saved?subject=Mathematics').json()['reading']
    assert [step['id'] for step in saved['next_steps']] == [step['id'] for step in body['steps']]


def test_a_new_three_replaces_the_old(client, monkeypatch):
    _seed()
    _stub(monkeypatch)
    first = client.post('/api/next_sessions', json={}).json()['steps']
    second = client.post('/api/next_sessions', json={}).json()['steps']
    shown = client.get('/api/next_sessions').json()['steps']
    assert len(shown) == 3
    assert {step['id'] for step in shown} == {step['id'] for step in second}
    assert not {step['id'] for step in shown} & {step['id'] for step in first}


def test_planning_one_from_every_subject_files_it_under_the_subject_it_names(client, monkeypatch):
    _seed()
    _stub(monkeypatch)
    steps = client.post('/api/next_sessions', json={}).json()['steps']
    booked = [client.post('/api/subject_recommendation/plan', json={'id': step['id']}).json()
              for step in steps]
    assert all(answer['success'] for answer in booked), booked
    subjects = [db.find_row('tasks', answer['task']['id'], user_id='tester')['subject']
                for answer in booked]
    assert subjects == ['mathematics', 'music', 'mathematics']
    # All three booked into different slots, and all three now read as planned.
    starts = {answer['task']['start'] for answer in booked}
    assert len(starts) == 3
    assert {step['state'] for step in client.get('/api/next_sessions').json()['steps']} == {'planned'}


def test_the_pills_narrow_every_subject_to_the_ones_chosen(client, monkeypatch):
    _seed()
    seen = {}
    _stub(monkeypatch, seen)
    body = client.post('/api/next_sessions', json={'subjects': ['music']}).json()
    assert body['success'] is True, body
    assert seen['overall'] is True and seen['state']['finished'] == 1
    assert [row['title'] for row in seen['state']['recent_work']] == ['[Music] Scales']
    # Still the three across every subject: the same ones come back unnarrowed.
    assert [step['id'] for step in client.get('/api/next_sessions').json()['steps']] == \
        [step['id'] for step in body['steps']]


def test_pills_with_no_work_or_not_yours_say_so(client, monkeypatch):
    _seed()
    _stub(monkeypatch)
    nothing = client.post('/api/next_sessions', json={'subjects': ['chemistry']}).json()
    assert nothing['success'] is False and 'subjects chosen' in nothing['message']
    strange = client.post('/api/next_sessions', json={'subjects': ['own_nope']}).json()
    assert strange['success'] is False


def test_nothing_to_plan_from_says_so(client, monkeypatch):
    _stub(monkeypatch)
    body = client.post('/api/next_sessions', json={}).json()
    assert body['success'] is False and 'no finished work' in body['message']


def test_a_subject_that_is_not_yours_is_refused(client):
    assert client.get('/api/next_sessions?subject_id=own_nope').json()['success'] is False


def test_each_account_has_its_own(client, stranger, monkeypatch):
    _seed()
    _stub(monkeypatch)
    client.post('/api/next_sessions', json={})
    assert stranger.get('/api/next_sessions').json()['steps'] == []


def test_subjects_in_brackets_are_taken_out_of_what_the_reader_sees():
    step = {'title': '[Mathematics] Stewart Ch. 7 #1-10', 'focus': '[Mathematics]',
            'reason': 'Your [Mathematics] Math 55 lectures go well.', 'signal': '',
            'drills': ['[Music] Scales in thirds'], 'difficulty': 3}
    clean = ns.unbracket(step)
    assert clean['title'] == 'Stewart Ch. 7 #1-10'
    assert clean['reason'] == 'Your Math 55 lectures go well.'
    assert clean['drills'] == ['Scales in thirds']
    # `focus` is how the session is filed, so it is left as the model wrote it.
    assert clean['focus'] == '[Mathematics]' and clean['difficulty'] == 3


def test_the_plan_is_told_to_write_for_the_reader_not_the_brief():
    assert 'never with a "#"' in subject_ai.STEPS_SYSTEM
    assert 'never with a subject in brackets' in subject_ai.STEPS_SYSTEM
    assert 'not "avg execution 3.8"' in subject_ai.STEPS_SYSTEM


def test_the_briefs_labels_are_put_in_the_readers_words():
    assert subject_ai.reader_words(
        'Your long runs average execution is 3.5 out of 5') == 'Your long runs average rating is 3.5 out of 5'
    assert subject_ai.reader_words('avg execution 3.8') == 'average rating 3.8'
    assert subject_ai.reader_words('rises to ≥4') == 'rises to 4 or more'
    assert subject_ai.reader_words('Executive summary') == 'Executive summary'

"""Live blocks on a space's page — backend/tracking/live.py and the endpoints
in backend/api/spaces.py.

A live block stores where it looks, never what it saw. These check both
halves: that a page keeps a live block's settings (cleaned) and no data, and
that what each source answers moves when the account's data does, which is the
whole point of calling it live. The last part is the revision stamp and the
`X-Summit-Live` header that let an open page know to ask again.
"""
from datetime import date, timedelta

import pytest

from backend.tracking import live, skill_level

TODAY = date.today()


def _live(client, **query):
    reply = client.get('/api/spaces/live', params=query).json()
    assert reply['success'], reply
    return reply['data']


def _task(client, name, xp=10, **extra):
    reply = client.post('/api/tasks', json={'name': name, 'priority': 'low', 'xp_reward': xp, **extra}).json()
    assert reply['success'], reply
    return reply['task_id']


def _done(client, task_id):
    assert client.post('/api/complete_task', json={'task_id': task_id}).json()['success']


# --------------------------------------------------------------------------
# What a page keeps
# --------------------------------------------------------------------------
def test_config_is_cleaned_to_what_each_source_takes():
    assert live.clean_config({'source': 'growth', 'subject': 'algebra', 'days': 90, 'junk': 1}) == {
        'source': 'growth', 'subject': 'algebra', 'days': 90}
    # A window that isn't offered falls back to the default one.
    assert live.clean_config({'source': 'growth', 'days': 45})['days'] == 30
    assert live.clean_config({'source': 'productivity', 'weeks': 'lots'})['weeks'] == 8
    assert live.clean_config({'source': 'calendar', 'days': 14})['days'] == 14
    assert live.clean_config({'source': 'records', 'limit': 99})['limit'] == 5
    # An unknown source keeps the block, pointed at the first source.
    assert live.clean_config({'source': 'weather'}) == {'source': 'goal', 'goal': ''}
    assert live.clean_config(None) == {'source': 'goal', 'goal': ''}
    assert live.clean_config({'source': 'goal', 'goal': True}) == {'source': 'goal', 'goal': ''}


def test_a_page_keeps_a_live_block_and_no_data(client):
    doc = {'icon': '', 'cover': '', 'blocks': [
        {'id': 'a', 'type': 'h1', 'text': 'AMC 10 Training'},
        {'id': 'b', 'type': 'live', 'text': 'Score trend', 'x': 0, 'y': 0, 'w': 6,
         'live': {'source': 'growth', 'subject': 'competition-math', 'days': 90, 'data': [1, 2, 3]}},
        {'id': 'c', 'type': 'live', 'text': '', 'live': {'source': 'calendar', 'days': 7}},
    ]}
    space = client.post('/api/spaces/1', json={'doc': doc}).json()['space']
    blocks = space['doc']['blocks']
    assert blocks[1] == {'id': 'b', 'type': 'live', 'text': 'Score trend', 'x': 0, 'y': 0, 'w': 6,
                         'live': {'source': 'growth', 'subject': 'competition-math', 'days': 90}}
    assert blocks[2]['live'] == {'source': 'calendar', 'days': 7}
    assert '[Live: Growth, Score trend]' in space['body']
    assert '[Live: Calendar]' in space['body']
    # And it reads back the same.
    assert client.get('/api/spaces').json()['spaces'][0]['doc']['blocks'][1]['live']['subject'] == 'competition-math'


def test_a_live_block_without_settings_still_saves(client):
    doc = {'blocks': [{'id': 'x', 'type': 'live', 'text': ''}]}
    blocks = client.post('/api/spaces/2', json={'doc': doc}).json()['space']['doc']['blocks']
    assert blocks[0]['live'] == {'source': 'goal', 'goal': ''}


# --------------------------------------------------------------------------
# Each source, and that it follows the data
# --------------------------------------------------------------------------
def test_goal_block_follows_the_goal(client):
    assert _live(client, source='goal') == {'empty': True}

    deadline = (TODAY + timedelta(days=10)).isoformat()
    client.post('/api/add_goal', json={'title': 'Finish 5 sets', 'goal_type': 'tasks',
                                       'target_tasks': 5, 'deadline': deadline})
    gid = client.get('/api/get_goals').json()['goals'][0]['id']
    client.post('/api/add_milestone', json={'goal_id': gid, 'title': 'First fifty',
                                            'target_date': (TODAY + timedelta(days=3)).isoformat()})

    before = _live(client, source='goal', goal=gid)
    assert before['goal']['title'] == 'Finish 5 sets'
    assert before['goal']['days_left'] == 10
    assert before['next_milestone']['title'] == 'First fifty'
    start = before['goal']['progress']

    _done(client, _task(client, 'Problem set', xp=20, goal_id=gid))
    after = _live(client, source='goal', goal=gid)
    assert after['goal']['progress'] > start
    assert (after['goal']['current'], after['goal']['target'], after['goal']['unit']) == (1, 5, 'tasks')
    assert after['recent'][0]['title'] == 'Problem set'
    assert after['done_this_week'] == 1

    # Left on "most pressing", it finds the same goal.
    assert _live(client, source='goal')['goal']['id'] == gid
    # One it can't see is empty, not someone else's.
    assert _live(client, source='goal', goal='nope') == {'empty': True}


def test_most_pressing_goal_is_the_soonest_open_one():
    rows = [
        {'id': 'late', 'status': 'active', 'deadline': (TODAY + timedelta(days=30)).isoformat()},
        {'id': 'done', 'status': 'completed', 'deadline': TODAY.isoformat()},
        {'id': 'soon', 'status': 'active', 'deadline': (TODAY + timedelta(days=2)).isoformat()},
        {'id': 'open', 'status': 'active'},
    ]
    assert live.pick_goal(rows, '', TODAY)['id'] == 'soon'
    assert live.pick_goal(rows, 'late', TODAY)['id'] == 'late'
    assert live.pick_goal([], '', TODAY) is None


def test_skills_block_reads_levels_from_answers(client):
    data = _live(client, source='skills', tree='mathematics')
    assert data['title'] == 'Mathematics'
    arith = next(node for node in data['nodes'] if node['id'] == 'm.arith')
    assert arith['level'] == 0 and arith['state'] == 'next'
    # Something that requires Arithmetic is locked until it's done.
    assert any(node['state'] == 'locked' and 'Arithmetic' in node['requires'] for node in data['nodes'])

    for weight in ('warmup', 'core', 'stretch'):
        reply = client.post('/api/skill-attempts', json={'node_id': 'm.arith', 'ordinal': 1, 'weight': weight,
                                                         'attempted': 10, 'correct': 9, 'source': 'log'}).json()
        assert reply['success'], reply
    data = _live(client, source='skills', tree='mathematics')
    arith = next(node for node in data['nodes'] if node['id'] == 'm.arith')
    assert arith['level'] >= 4 and arith['state'] == 'done' and arith['accuracy'] == 90
    assert data['done'] >= 1 and data['accuracy'] == 90
    # With Arithmetic done, what needed only it is next.
    assert next(node for node in data['nodes'] if node['name'] == 'Order of Operations')['state'] == 'next'
    # With no tree named, the block follows the one practiced most.
    assert _live(client, source='skills')['tree'] == 'mathematics'


def test_unknown_tree_is_empty(client):
    assert _live(client, source='skills', tree='no-such-tree') == {'empty': True}


def test_productivity_block_counts_this_week(client):
    before = _live(client, source='productivity', weeks=4)
    assert len(before['weeks']) == 4 and len(before['days']) == 28
    assert before['weeks'][-1]['end'] == TODAY.isoformat()
    _done(client, _task(client, 'Read a chapter', xp=30))
    after = _live(client, source='productivity', weeks=4)
    assert after['weeks'][-1]['tasks'] == before['weeks'][-1]['tasks'] + 1
    assert after['weeks'][-1]['xp'] >= before['weeks'][-1]['xp'] + 30
    assert after['days'][-1]['active'] is True
    assert after['streak'] >= 1


def test_productivity_weeks_and_consistency():
    series = [{'date': (TODAY - timedelta(days=back)).isoformat(), 'xp_earned': 10, 'tasks_completed': 1,
               'focus_minutes': 0} for back in range(0, 28, 2)]
    view = live.productivity_view(series, 2, 3, TODAY)
    assert [week['xp'] for week in view['weeks']] == [30, 40]
    assert view['consistency'] == 50
    assert view['change'] == 33
    assert view['streak'] == 3


def test_records_block_tracks_personal_bests(client):
    def save(name, value, on, direction='higher', category='Competitive Math'):
        reply = client.post('/api/records/save', json={
            'kind': 'record', 'name': name, 'value': value, 'unit': 'points', 'achieved_on': on,
            'category': category, 'comparison_direction': direction}).json()
        assert reply['success'], reply

    save('AMC 10', 72, '2026-01-10')
    save('AMC 10', 90, '2026-03-10')
    save('AMC 10', 84, '2026-05-10')
    save('Mile', 7.5, '2026-02-01', direction='lower', category='Running')
    save('Mile', 6.9, '2026-04-01', direction='lower', category='Running')

    data = _live(client, source='records')
    amc = next(row for row in data['bests'] if row['name'] == 'AMC 10')
    assert (amc['best'], amc['best_on'], amc['first'], amc['latest'], amc['improvement']) == (
        90, '2026-03-10', 72, 84, 18)
    mile = next(row for row in data['bests'] if row['name'] == 'Mile')
    assert mile['best'] == 6.9 and mile['improvement'] == pytest.approx(0.6)
    assert data['categories'] == ['Competitive Math', 'Running']

    only_math = _live(client, source='records', category='Running')
    assert [row['name'] for row in only_math['bests']] == ['Mile']

    save('AMC 10', 108, '2026-09-01')
    assert next(row for row in _live(client, source='records')['bests'] if row['name'] == 'AMC 10')['best'] == 108


def test_calendar_block_lists_what_is_coming(client):
    soon = (TODAY + timedelta(days=2)).isoformat() + 'T16:30'
    far = (TODAY + timedelta(days=20)).isoformat() + 'T09:00'
    late = (TODAY - timedelta(days=1)).isoformat() + 'T09:00'
    near_id = _task(client, 'Practice test', due_date=soon)
    _task(client, 'Far off', due_date=far)
    _task(client, 'Missed', due_date=late)
    client.post('/api/add_goal', json={'title': 'Qualify for AIME', 'goal_type': 'tasks', 'target_tasks': 5,
                                       'deadline': (TODAY + timedelta(days=5)).isoformat()})

    week = _live(client, source='calendar', days=7)
    titles = [item['title'] for item in week['items']]
    assert titles == ['Missed', 'Practice test', 'Qualify for AIME']
    assert week['items'][0]['overdue'] is True and week['overdue'] == 1
    assert week['items'][1]['time'] == '16:30'
    assert week['items'][2]['kind'] == 'deadline'
    assert 'Far off' in [item['title'] for item in _live(client, source='calendar', days=30)['items']]

    _done(client, near_id)
    assert 'Practice test' not in [item['title'] for item in _live(client, source='calendar', days=7)['items']]


def test_growth_block_compares_windows(client):
    data = _live(client, source='growth', subject='mathematics', days=7)
    assert data['now']['tasks'] == 0 and len(data['points']) == 7 and data['step'] == 1
    assert data['name'] == 'Mathematics'
    _done(client, _task(client, 'Proofs', xp=25, subject='mathematics'))
    _done(client, _task(client, 'Scales', xp=40, subject='music'))
    data = _live(client, source='growth', subject='mathematics', days=7)
    assert data['now']['tasks'] == 1 and data['now']['xp'] == 25
    assert data['points'][-1]['xp'] == 25
    # A subject with a tree also says how the practice went.
    assert data['skills'] == {'attempted': 0, 'accuracy': None, 'attempted_before': 0, 'accuracy_before': None}
    # Ninety days is drawn by the week.
    assert _live(client, source='growth', subject='mathematics', days=90)['step'] == 7
    everything = _live(client, source='growth', days=30)
    assert everything['subject'] == '' and everything['now']['tasks'] >= 2 and everything['skills'] is None


def test_growth_change_is_against_the_window_before():
    tasks = [
        {'status': 'done', 'subject': 'algebra', 'xp_value': 10, 'completed_at': (TODAY - timedelta(days=9)).isoformat()},
        {'status': 'done', 'subject': 'algebra', 'xp_value': 30, 'completed_at': TODAY.isoformat()},
        {'status': 'todo', 'subject': 'algebra', 'xp_value': 99, 'completed_at': None},
    ]
    view = live.growth_view('algebra', 7, tasks, [], [], [], TODAY)
    assert view['now']['xp'] == 30 and view['before']['xp'] == 10 and view['change']['xp'] == 200


def test_skills_view_is_pure():
    nodes = [{'id': 'a', 'name': 'A', 'tree': 't', 'treeTitle': 'T', 'requires': []},
             {'id': 'b', 'name': 'B', 'tree': 't', 'treeTitle': 'T', 'requires': ['A']}]
    view = live.skills_view(nodes, [], 't', skill_level.read_level)
    assert [node['state'] for node in view['nodes']] == ['next', 'locked']
    assert view['accuracy'] is None


# --------------------------------------------------------------------------
# Options, refusals, and keeping up
# --------------------------------------------------------------------------
def test_options_list_what_a_block_can_point_at(client):
    client.post('/api/add_goal', json={'title': 'Earn 100 XP', 'goal_type': 'xp', 'target_xp': 100})
    client.post('/api/records/save', json={'kind': 'record', 'name': 'AMC 10', 'value': 90,
                                           'category': 'Competitive Math', 'achieved_on': '2026-03-10'})
    reply = client.get('/api/spaces/live/options').json()
    assert [goal['title'] for goal in reply['goals']] == ['Earn 100 XP']
    assert {'id': 'mathematics', 'title': 'Mathematics'} in reply['trees']
    assert any(subject['id'] == 'mathematics' for subject in reply['subjects'])
    assert reply['categories'] == ['Competitive Math']


def test_unknown_source_is_refused(client):
    reply = client.get('/api/spaces/live', params={'source': 'weather'}).json()
    assert reply['success'] is False


def test_signed_out_gets_nothing(anon):
    assert anon.get('/api/spaces/live', params={'source': 'goal'}).status_code == 401
    assert anon.get('/api/spaces/live/revisions').status_code == 401
    assert anon.get('/api/spaces/live/options').status_code == 401


def test_live_data_is_per_account(client, stranger):
    client.post('/api/records/save', json={'kind': 'record', 'name': 'AMC 10', 'value': 90, 'achieved_on': '2026-03-10'})
    assert _live(stranger, source='records')['bests'] == []


def test_a_write_names_the_sources_it_moved_and_bumps_them(client, stranger):
    revs = client.get('/api/spaces/live/revisions').json()['revisions']
    assert set(revs) == set(live.SOURCES)
    theirs = stranger.get('/api/spaces/live/revisions').json()['revisions']

    reply = client.post('/api/records/save', json={'kind': 'record', 'name': 'AMC 10', 'value': 90})
    assert reply.headers.get('X-Summit-Live') == 'records'
    after = client.get('/api/spaces/live/revisions').json()['revisions']
    assert after['records'] != revs['records']
    assert after['skills'] == revs['skills']

    task = client.post('/api/tasks', json={'name': 'Drill', 'priority': 'low', 'xp_reward': 5})
    assert set(task.headers.get('X-Summit-Live').split(',')) >= {'goal', 'productivity', 'calendar', 'growth'}

    # Someone else's write moves nothing of theirs.
    assert stranger.get('/api/spaces/live/revisions').json()['revisions'] == theirs


def test_reading_moves_nothing(client):
    revs = client.get('/api/spaces/live/revisions').json()['revisions']
    for source in live.SOURCES:
        reply = client.get('/api/spaces/live', params={'source': source})
        assert 'X-Summit-Live' not in reply.headers
    assert client.get('/api/spaces/live/revisions').json()['revisions'] == revs


def test_saving_a_page_is_not_a_data_change(client):
    reply = client.post('/api/spaces/1', json={'name': 'AMC 10 Training'})
    assert 'X-Summit-Live' not in reply.headers


def test_sources_for_tables():
    assert live.sources_for({'records'}) == ['records']
    assert live.sources_for({'skill_attempts'}) == ['skills', 'growth']
    assert live.sources_for({'user_settings', 'sessions'}) == []

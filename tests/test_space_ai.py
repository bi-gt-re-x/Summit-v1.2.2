"""The Spaces AI chat, and the reference lookup every AI draft goes through.

The model is stubbed: what's pinned is what the server does with an answer.
It has to come back cleaned like any save, be written to the space, add to
the page or replace it as the model said, and hand back the old page for
Undo.
"""
import json

from backend.tracking import planner, sources, space_ai

from tests.conftest import make_account, sign_in


def _answer(mode='replace', blocks=None):
    return json.dumps({
        'reply': 'Built it.',
        'mode': mode,
        'icon': '📚',
        'blocks': blocks or [
            {'type': 'h1', 'text': 'AMC 10 plan', 'indent': 0, 'checked': False,
             'chart': None, 'live_source': None, 'goal': None},
            {'type': 'todo', 'text': 'Do a past paper', 'indent': 0, 'checked': False,
             'chart': None, 'live_source': None, 'goal': None},
            {'type': 'live', 'text': '', 'indent': 0, 'checked': False,
             'chart': None, 'live_source': 'goal', 'goal': 'not-a-goal'},
            {'type': 'sticky', 'text': 'A note', 'fill_color': '#FDE68A', 'width': 4,
             'indent': 9, 'checked': False, 'chart': None, 'live_source': None, 'goal': None},
        ],
    })


def _stub(monkeypatch, text, seen=None):
    monkeypatch.setattr(planner, 'able', lambda: True)

    def fake(brief, **kwargs):
        if seen is not None:
            seen.update(kwargs, brief=brief)
        return text
    monkeypatch.setattr(planner, 'from_provider', fake)


def test_a_page_is_built_and_saved(app, monkeypatch):
    make_account('builder')
    client = sign_in(app, 'builder')
    seen = {}
    _stub(monkeypatch, _answer(), seen)

    reply = client.post('/api/spaces/1/ai', json={'prompt': 'A plan for the AMC 10'}).json()

    assert reply['success'], reply
    assert reply['reply'] == 'Built it.'
    blocks = reply['space']['doc']['blocks']
    assert [b['type'] for b in blocks] == ['h1', 'todo', 'live', 'sticky']
    assert blocks[3]['fill']['color'] == '#fde68a'
    assert blocks[3].get('indent', 0) <= 2
    # A goal id the account doesn't have falls back to the goals list.
    assert blocks[2]['live']['source'] == 'goals'
    assert reply['space']['doc']['icon'] == '📚'
    # Saved, so the page opens with it.
    stored = client.get('/api/spaces').json()['spaces'][0]
    assert stored['doc']['blocks'][0]['text'] == 'AMC 10 plan'
    # The prompt is what the references are looked up for.
    assert 'A plan for the AMC 10' in seen['topics']


def test_append_keeps_the_page_and_undo_gets_it_back(app, monkeypatch):
    make_account('adder')
    client = sign_in(app, 'adder')
    page = {'icon': '', 'cover': '', 'blocks': [{'id': 'a', 'type': 'text', 'text': 'Mine'}]}
    _stub(monkeypatch, _answer(mode='append'))

    reply = client.post('/api/spaces/2/ai', json={'prompt': 'add a checklist', 'doc': page}).json()

    texts = [b['text'] for b in reply['space']['doc']['blocks']]
    assert texts[0] == 'Mine' and 'AMC 10 plan' in texts
    assert [b['text'] for b in reply['before']['blocks']] == ['Mine']


def test_an_empty_prompt_is_refused(app, monkeypatch):
    make_account('quiet')
    client = sign_in(app, 'quiet')
    _stub(monkeypatch, _answer())
    assert not client.post('/api/spaces/1/ai', json={'prompt': '  '}).json()['success']


def test_an_unreadable_answer_says_so(app, monkeypatch):
    make_account('garbled')
    client = sign_in(app, 'garbled')
    _stub(monkeypatch, 'not json at all')
    reply = client.post('/api/spaces/1/ai', json={'prompt': 'a page'}).json()
    assert not reply['success']
    assert reply['message']


def test_the_brief_carries_the_page_and_the_chat():
    brief = space_ai.brief_from('add tips', '# SAT plan', 'Space 1',
                                [{'role': 'user', 'text': 'make an SAT page'}],
                                goals=[{'id': '4', 'title': 'SAT 1500'}], about=['Has done: AP Bio'])
    assert '# SAT plan' in brief and 'make an SAT page' in brief
    assert 'id 4: SAT 1500' in brief and 'AP Bio' in brief


def test_references_are_off_in_tests_and_never_raise(monkeypatch):
    assert sources.brief_block('AMC 10') == ''

    monkeypatch.setenv('SUMMIT_NO_SOURCES', '0')
    sources._cache.clear()

    def broken(url):
        raise OSError('no network')
    monkeypatch.setattr(sources, '_get', broken)
    assert sources.lookup('anything at all') == []
    assert sources.brief_block('anything at all') == ''


def test_references_are_written_as_a_block(monkeypatch):
    monkeypatch.setenv('SUMMIT_NO_SOURCES', '0')
    sources._cache.clear()

    def fake(url):
        if 'w/api.php' in url:
            return {'query': {'search': [{'title': 'SAT'}]}}
        return {'title': 'SAT', 'extract': 'The SAT is a standardized test.',
                'content_urls': {'desktop': {'page': 'https://en.wikipedia.org/wiki/SAT'}}}
    monkeypatch.setattr(sources, '_get', fake)

    block = sources.brief_block('SAT prep')
    assert sources.HEADING in block
    assert 'The SAT is a standardized test.' in block
    assert 'https://en.wikipedia.org/wiki/SAT' in block


def _live_block(**fields):
    base = {'type': 'live', 'text': '', 'indent': 0, 'checked': False, 'color': None,
            'fill_color': None, 'shape': None, 'width': None, 'chart': None,
            'live_source': None, 'live_view': None, 'live_metric': None,
            'live_ref': None, 'live_range': None}
    base.update(fields)
    return base


def test_live_analytics_blocks_point_at_real_things(app, monkeypatch):
    """Every analytics source is open to it, with its view, metric and range,
    and a pick that isn't on the account falls back to the default."""
    from backend.database import connection as db
    make_account('tracker')
    db.insert_row('goals', {'id': db.new_id('goals'), 'user_id': 'tracker', 'title': 'SAT 1500',
                            'status': 'active'})
    goal_id = str(db.rows_for('goals', 'tracker')[0]['id'])
    client = sign_in(app, 'tracker')
    answer = json.loads(_answer(blocks=[
        _live_block(live_source='goal', live_ref=goal_id, live_view='ring'),
        _live_block(live_source='heatmap', live_metric='focus', live_range=52, live_view='strip'),
        _live_block(live_source='growth', live_ref='not-a-subject', live_range=90),
        _live_block(live_source='productivity', live_view='nonsense'),
    ]))
    answer.update(cover='ocean', cover_text='SAT push', background='#F0F4FF')
    _stub(monkeypatch, json.dumps(answer))

    doc = client.post('/api/spaces/1/ai', json={'prompt': 'a tracker'}).json()['space']['doc']

    goal, heat, growth, prod = (b['live'] for b in doc['blocks'])
    assert goal == {**goal, 'source': 'goal', 'goal': goal_id, 'view': 'ring'}
    assert (heat['metric'], heat['weeks'], heat['view']) == ('focus', 52, 'strip')
    assert growth['subject'] == '' and growth['days'] == 90
    assert prod['view'] == 'bars'  # an unknown view is the source's first
    assert doc['cover'] == 'ocean' and doc['coverText'] == 'SAT push'
    assert doc['background']['color'] == '#f0f4ff'


def test_the_brief_lists_every_live_source_and_the_accounts_picks():
    brief = space_ai.brief_from('track it', '', 'Space 1', [], options={
        'goals': [{'id': '9', 'title': 'AIME'}],
        'subjects': [{'id': 'mathematics', 'name': 'Mathematics', 'used': 3}],
        'trees': [{'id': 'competition-math', 'title': 'Competition Math'}],
        'records': ['Mile run'], 'categories': ['Fitness']})
    for text in ('id 9: AIME', 'id mathematics: Mathematics', 'id competition-math',
                 'Mile run', 'Fitness'):
        assert text in brief
    for source in ('heatmap', 'rhythm', 'skills', 'growth', 'calendar'):
        assert '  - {} ('.format(source) in space_ai.SYSTEM


# ---- the chat is per account and per space ------------------------------------
def _block(**fields):
    base = {'type': 'text', 'text': '', 'indent': 0, 'checked': False, 'color': None,
            'fill_color': None, 'fill_style': None, 'shape': None, 'width': None, 'rows': None,
            'column': None, 'chart': None, 'live_source': None, 'live_view': None,
            'live_metric': None, 'live_ref': None, 'live_range': None}
    base.update(fields)
    return base


def _answer2(mode='replace', blocks=(), edits=(), reply='Done.', **page):
    return json.dumps({'reply': reply, 'mode': mode, 'icon': '', 'cover': '', 'cover_text': '',
                       'cover_align': '', 'background': '', 'blocks': list(blocks),
                       'edits': list(edits), **page})


def test_each_account_and_each_space_has_its_own_chat(app, monkeypatch):
    make_account('chatter1')
    make_account('chatter2')
    one, two = sign_in(app, 'chatter1'), sign_in(app, 'chatter2')
    _stub(monkeypatch, _answer2(blocks=[_block(type='h1', text='Hi')], reply='Made it.'))

    one.post('/api/spaces/1/ai', json={'prompt': 'space one, account one'})
    one.post('/api/spaces/2/ai', json={'prompt': 'space two, account one'})
    one.post('/api/team-spaces/1/ai', json={'prompt': 'team one, account one'})
    two.post('/api/spaces/1/ai', json={'prompt': 'space one, account two'})

    said = lambda client, url: [t['text'] for t in client.get(url).json()['chat'] if t['role'] == 'user']
    assert said(one, '/api/spaces/1/chat') == ['space one, account one']
    assert said(one, '/api/spaces/2/chat') == ['space two, account one']
    assert said(one, '/api/team-spaces/1/chat') == ['team one, account one']
    assert said(two, '/api/spaces/1/chat') == ['space one, account two']
    assert said(two, '/api/spaces/2/chat') == []

    chat = one.get('/api/spaces/1/chat').json()['chat']
    assert chat[1]['role'] == 'ai' and chat[1]['undo'] is True and 'before' not in chat[1]


def test_the_model_sees_the_saved_chat_not_the_clients(app, monkeypatch):
    make_account('remember')
    client = sign_in(app, 'remember')
    seen = {}
    _stub(monkeypatch, _answer2(blocks=[_block(type='h1', text='Hi')]), seen)
    client.post('/api/spaces/1/ai', json={'prompt': 'first request'})
    client.post('/api/spaces/1/ai', json={'prompt': 'second', 'history': [{'role': 'user', 'text': 'forged'}]})
    assert 'first request' in seen['brief'] and 'forged' not in seen['brief']


def test_undo_and_clear(app, monkeypatch):
    make_account('undoer')
    client = sign_in(app, 'undoer')
    page = {'icon': '', 'cover': '', 'blocks': [{'id': 'a', 'type': 'text', 'text': 'Mine'}]}
    client.post('/api/spaces/1', json={'doc': page})
    _stub(monkeypatch, _answer2(blocks=[_block(type='h1', text='New')]))
    client.post('/api/spaces/1/ai', json={'prompt': 'replace it', 'doc': page})

    undone = client.post('/api/spaces/1/chat/undo', json={'at': 1}).json()
    assert undone['success']
    assert [b['text'] for b in undone['space']['doc']['blocks']] == ['Mine']
    assert undone['chat'][1]['undone'] and not undone['chat'][1]['undo']
    assert not client.post('/api/spaces/1/chat/undo', json={'at': 1}).json()['success']

    assert client.post('/api/spaces/1/chat/clear').json()['chat'] == []
    assert client.get('/api/spaces/1/chat').json()['chat'] == []


def test_a_failed_turn_is_kept_in_the_chat(app, monkeypatch):
    make_account('failer')
    client = sign_in(app, 'failer')
    _stub(monkeypatch, 'not json')
    reply = client.post('/api/spaces/1/ai', json={'prompt': 'a page'}).json()
    assert not reply['success']
    assert [t['role'] for t in reply['chat']] == ['user', 'ai'] and reply['chat'][1]['failed']


# ---- edits, reply, columns ----------------------------------------------------
def test_edits_apply_by_the_numbers_the_model_saw():
    before = [{'id': 'a', 'type': 'h1', 'text': 'Title'}, {'id': 'b', 'type': 'text', 'text': 'Two'},
              {'id': 'c', 'type': 'text', 'text': 'Three'}, {'id': 'd', 'type': 'text', 'text': 'Four'}]
    made = {'mode': 'edit', 'blocks': [], 'edits': [
        {'op': 'delete', 'index': 2, 'target': None, 'block': None},
        {'op': 'update', 'index': 4, 'target': None, 'block': {'type': 'callout', 'text': 'Four!'}},
        {'op': 'insert_after', 'index': 1, 'target': None, 'block': {'type': 'text', 'text': 'New'}},
        {'op': 'move_after', 'index': 3, 'target': 0, 'block': None},
    ]}
    blocks, written = space_ai.apply(before, made, lambda n: 'n{}'.format(n))
    assert [(b['id'], b['text']) for b in blocks] == [('c', 'Three'), ('a', 'Title'), ('n0', 'New'), ('d', 'Four!')]
    assert blocks[3]['type'] == 'callout'
    assert written == {'d', 'n0', 'c'}


def test_reply_changes_nothing(app, monkeypatch):
    make_account('asker')
    client = sign_in(app, 'asker')
    page = {'icon': '', 'cover': '', 'blocks': [{'id': 'a', 'type': 'text', 'text': 'Mine'}]}
    client.post('/api/spaces/1', json={'doc': page})
    _stub(monkeypatch, _answer2(mode='reply', reply='It reads fine: 15:1.'))
    reply = client.post('/api/spaces/1/ai', json={'prompt': 'is it readable?', 'doc': page}).json()
    assert reply['mode'] == 'reply' and reply['before'] is None
    assert [b['text'] for b in client.get('/api/spaces').json()['spaces'][0]['doc']['blocks']] == ['Mine']
    assert not reply['chat'][-1]['undo']


def test_columns_pin_every_top_level_block():
    blocks = [{'type': 'h1', 'text': 'T'}, {'type': 'sticky', 'text': 'L', '_column': 'left'},
              {'type': 'sticky', 'text': 'R', '_column': 'right'}, {'type': 'text', 'text': 'under', 'indent': 1},
              {'type': 'sticky', 'text': 'note', 'w': 4}]
    placed = space_ai.place_columns(blocks)
    assert [(b.get('x'), b.get('w'), b.get('y')) for b in placed] == [
        (0, 12, 0), (0, 6, 0), (6, 6, 0), (None, None, None), (0, 4, 0)]
    plain = space_ai.place_columns([{'type': 'text', 'text': 'x'}])
    assert 'x' not in plain[0]


# ---- looking at what it made ------------------------------------------------------
def test_contrast_is_measured_the_way_the_editor_draws():
    from backend.tracking import space_look as look
    assert look.contrast('#ffffff', '#000000') == 21.0
    doc = {'blocks': [
        {'id': 'a', 'type': 'h1', 'text': 'Title'},
        {'id': 'b', 'type': 'sticky', 'text': 'note', 'fill': {'color': '#fde68a', 'style': 'solid'}, 'color': '#ffffff'},
        {'id': 'c', 'type': 'text', 'text': 'gold', 'color': '#facc15'},
    ]}
    rows = {row['index']: row for row in look.audit(doc)}
    assert rows[1]['grade'] in ('AA', 'AAA')
    assert rows[2]['grade'] == 'fail' and rows[2]['ground'] == '#fde68a'
    assert rows[3]['grade'] == 'fail'


def test_repair_fixes_only_what_the_ai_wrote():
    from backend.tracking import space_look as look
    doc = {'blocks': [
        {'id': 'mine', 'type': 'text', 'text': 'my gold', 'color': '#facc15'},
        {'id': 'ai1', 'type': 'sticky', 'text': 'note', 'fill': {'color': '#fde68a', 'style': 'solid'}, 'color': '#ffffff'},
        {'id': 'ai2', 'type': 'text', 'text': 'their gold', 'color': '#facc15'},
    ]}
    fixed = look.repair(doc, only_ids={'ai1', 'ai2'})
    assert {row['index'] for row in fixed} == {2, 3}
    assert doc['blocks'][0]['color'] == '#facc15'  # the reader's own choice stays
    assert look.contrast(doc['blocks'][1]['color'], '#fde68a') >= 4.5
    assert 'color' not in doc['blocks'][2]  # theme-following text drops its color


def test_on_a_painted_page_the_color_is_fixed_not_dropped():
    from backend.tracking import space_look as look
    doc = {'background': {'color': '#0f172a', 'style': 'solid'},
           'blocks': [{'id': 'x', 'type': 'text', 'text': 'dim', 'color': '#334155'}]}
    look.repair(doc)
    assert look.contrast(doc['blocks'][0]['color'], '#0f172a') >= 4.5


def test_the_reply_says_what_the_check_found(app, monkeypatch):
    make_account('looker')
    client = sign_in(app, 'looker')
    _stub(monkeypatch, _answer2(blocks=[
        _block(type='sticky', text='Hard to read', fill_color='#fde68a', color='#ffffff'),
        _block(type='text', text='fine')]))
    reply = client.post('/api/spaces/1/ai', json={'prompt': 'a page'}).json()
    assert any('I changed its text to' in note for note in reply['notes'])
    sticky = reply['space']['doc']['blocks'][0]
    from backend.tracking import space_look as look
    assert look.contrast(sticky['color'], '#fde68a') >= 4.5


def test_the_brief_shows_the_page_as_it_looks(app, monkeypatch):
    make_account('seer')
    client = sign_in(app, 'seer')
    seen = {}
    _stub(monkeypatch, _answer2(mode='reply'), seen)
    page = {'icon': '', 'cover': '', 'blocks': [
        {'id': 'a', 'type': 'sticky', 'text': 'Mock Saturday', 'fill': {'color': '#1e3a8a', 'style': 'solid'},
         'color': '#1f2328'}]}
    client.post('/api/spaces/1/ai', json={'prompt': 'is it readable?', 'doc': page})
    assert '1. sticky "Mock Saturday" fill #1e3a8a solid text color #1f2328' in seen['brief']
    assert 'Block 1 (sticky) fails' in seen['brief']


# ---- context picked for the prompt ----------------------------------------------
def test_the_prompt_pulls_in_the_matching_record(app):
    from datetime import date, timedelta
    from backend.api import spaces as spaces_api
    from backend.database import connection as db
    make_account('contexted')
    today = date.today()
    db.insert_row('tasks', {'id': db.new_id('tasks'), 'user_id': 'contexted', 'title': 'Alcumus set',
                            'subject': 'mathematics', 'status': 'done', 'priority': 'medium',
                            'completed_at': today.isoformat() + 'T10:00:00'})
    db.insert_row('tasks', {'id': db.new_id('tasks'), 'user_id': 'contexted', 'title': 'Mock test',
                            'subject': 'mathematics', 'status': 'todo', 'priority': 'medium',
                            'due_date': (today + timedelta(days=3)).isoformat()})
    lines = spaces_api.prompt_context('contexted', 'Make me an AMC plan for this week')
    text = '\n'.join(lines)
    assert text.startswith('Today is ')
    assert 'Mathematics: 1 tasks finished' in text and 'Alcumus set' in text
    assert 'Mock test (due' in text
    assert 'They named: AMC' in text


def test_an_edit_finds_its_block_by_text_when_the_number_is_off():
    before = [{'id': 'a', 'type': 'h1', 'text': 'AMC plan'}, {'id': 'b', 'type': 'container', 'text': 'Task Tracker'},
              {'id': 'c', 'type': 'sticky', 'text': 'Time management'}]
    made = {'mode': 'edit', 'blocks': [], 'edits': [
        # Counted from 0: index 1 is meant to be the container.
        {'op': 'update', 'index': 1, 'was': 'Task Tracker', 'target': None,
         'block': {'type': 'container', 'text': 'Tracker'}},
        {'op': 'delete', 'index': 2, 'was': 'Time management', 'target': None, 'block': None},
    ]}
    blocks, _ = space_ai.apply(before, made, lambda n: 'n{}'.format(n))
    assert [(b['id'], b['text']) for b in blocks] == [('a', 'AMC plan'), ('b', 'Tracker')]


def test_a_container_with_a_pale_tint_gets_a_deeper_one():
    from backend.tracking import space_look as look
    doc = {'blocks': [{'id': 'c', 'type': 'container', 'text': 'Tracker',
                       'fill': {'color': '#e0e0e0', 'style': 'fade'}, 'color': '#eeeeee'}]}
    fixed = look.repair(doc)
    assert fixed[0]['how'] == 'tint' and 'color' not in doc['blocks'][0]
    assert all(row['grade'] != 'fail' for row in look.audit(doc))

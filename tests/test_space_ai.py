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
            {'type': 'sticky', 'text': 'kinds the model may not use become text',
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
    assert [b['type'] for b in blocks] == ['h1', 'todo', 'live', 'text']
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
                                [{'id': '4', 'title': 'SAT 1500'}], ['Has done: AP Bio'])
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

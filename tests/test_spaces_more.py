"""What Spaces gained: tables, countdowns, contents, to-dos tied to real tasks, and a
version history that keeps a page through a wipe.

The page format is backend/api/spaces.py `_clean_doc`; history is "Version history" there.
"""
from datetime import datetime, timedelta

from backend.api import spaces as spaces_api
from backend.database import connection as db


def page(*blocks, **more):
    doc = {'icon': '', 'cover': '', 'blocks': list(blocks)}
    doc.update(more)
    return doc


def text(words, ident=None):
    return {'id': ident or 'b-' + words[:8].replace(' ', '-'), 'type': 'text', 'text': words}


def save(client, doc, at=1, base='/api/spaces'):
    return client.post('{}/{}'.format(base, at), json={'doc': doc}).json()


# ---- the new blocks -------------------------------------------------------------
def test_a_table_is_kept_square_and_bounded():
    doc = spaces_api._clean_doc(page({'id': 't', 'type': 'table', 'table': {
        'rows': [['a', 'b', 'c'], ['d'], 'not a row', [1, None, 'x' * 500]], 'head': False}}))
    table = doc['blocks'][0]['table']
    assert table['head'] is False
    assert table['rows'][0] == ['a', 'b', 'c']
    assert table['rows'][1] == ['d', '', '']
    assert table['rows'][2][0] == '1' and table['rows'][2][1] == ''
    assert len(table['rows'][2][2]) == spaces_api.TABLE['cell_max']
    assert len(table['rows']) == 3


def test_a_table_with_nothing_in_it_gets_three_by_three():
    doc = spaces_api._clean_doc(page({'id': 't', 'type': 'table'}))
    assert doc['blocks'][0]['table'] == {'rows': [[''] * 3] * 3, 'head': True}


def test_a_table_is_capped_in_rows_and_columns():
    wide = [['x'] * 20 for _ in range(50)]
    table = spaces_api._clean_doc(page({'id': 't', 'type': 'table', 'table': {'rows': wide}}))['blocks'][0]['table']
    assert len(table['rows']) == spaces_api.TABLE['rows_max']
    assert len(table['rows'][0]) == spaces_api.TABLE['cols_max']


def test_a_countdown_keeps_only_a_real_day():
    good = spaces_api._clean_doc(page({'id': 'c', 'type': 'countdown', 'text': 'AMC 10', 'date': '2026-11-12'}))
    assert good['blocks'][0] == {'id': 'c', 'type': 'countdown', 'text': 'AMC 10', 'date': '2026-11-12'}
    for bad in ('2026-02-30', 'tomorrow', 20261112, None):
        cleaned = spaces_api._clean_doc(page({'id': 'c', 'type': 'countdown', 'date': bad}))
        assert cleaned['blocks'][0]['date'] == ''


def test_contents_and_task_links_are_kept():
    doc = spaces_api._clean_doc(page(
        {'id': 'toc', 'type': 'toc'},
        {'id': 'd', 'type': 'todo', 'text': 'Read ch. 1', 'task': 'task-123'},
        {'id': 'e', 'type': 'text', 'text': 'plain', 'task': 'task-9'},
    ))
    assert doc['blocks'][0] == {'id': 'toc', 'type': 'toc', 'text': ''}
    assert doc['blocks'][1]['task'] == 'task-123'
    # Only a to-do can be a task.
    assert 'task' not in doc['blocks'][2]


def test_the_new_blocks_read_as_plain_text():
    doc = spaces_api._clean_doc(page(
        {'id': 't', 'type': 'table', 'table': {'rows': [['Topic', 'Sure'], ['Counting', '2']]}},
        {'id': 'c', 'type': 'countdown', 'text': 'AMC 10', 'date': '2026-11-12'},
        {'id': 'toc', 'type': 'toc'},
    ))
    assert spaces_api._doc_text(doc).splitlines() == [
        '| Topic | Sure |', '|---|---|', '| Counting | 2 |', '⏳ AMC 10: 2026-11-12', '[Contents]']


def test_the_ai_isnt_offered_blocks_it_has_no_fields_for():
    from backend.tracking import space_ai
    assert not {'table', 'countdown', 'toc'} & set(space_ai.KINDS)


# ---- version history ---------------------------------------------------------------
def history(client, at=1, base='/api/spaces'):
    return client.get('{}/{}/history'.format(base, at)).json()['versions']


def test_the_first_page_has_no_history(client):
    save(client, page(text('Hello there')))
    assert history(client) == []


def test_a_big_delete_keeps_the_page_before_it(client):
    full = page(*[text('Line number {}'.format(n), 'b{}'.format(n)) for n in range(6)])
    save(client, full)
    save(client, page(text('Line number 0', 'b0')))
    versions = history(client)
    assert [row['reason'] for row in versions] == ['cut']
    assert versions[0]['blocks'] == 6
    assert versions[0]['preview'][0] == 'Line number 0'


def test_small_edits_close_together_dont_pile_up(client):
    save(client, page(text('One')))
    save(client, page(text('One two')))
    save(client, page(text('One two three')))
    save(client, page(text('One two three four')))
    # The page as it first stood is kept; the typing after it, minutes apart, is not.
    assert [row['preview'] for row in history(client)] == [['One']]


def test_editing_after_a_while_keeps_the_older_page(client):
    save(client, page(text('Draft one')))
    db.set_user_setting('tester', spaces_api._history_key('personal', 1), [
        {'at': (datetime.now() - timedelta(minutes=30)).isoformat(timespec='seconds'),
         'doc': page(text('Older')), 'words': 1, 'blocks': 1, 'reason': 'edit'}])
    save(client, page(text('Draft two')))
    versions = history(client)
    assert [row['preview'] for row in versions] == [['Draft one'], ['Older']]


def test_restoring_puts_the_old_page_back_and_keeps_the_current_one(client):
    full = page(*[text('Line number {}'.format(n), 'b{}'.format(n)) for n in range(6)])
    save(client, full)
    save(client, page(text('Oops')))
    reply = client.post('/api/spaces/1/history/restore', json={'at': 0}).json()
    assert reply['success'], reply
    assert len(reply['space']['doc']['blocks']) == 6
    assert client.get('/api/spaces').json()['spaces'][0]['body'].startswith('Line number 0')
    versions = history(client)
    assert versions[0]['reason'] == 'restore'
    assert versions[0]['preview'] == ['Oops']


def test_a_version_that_isnt_there_cant_be_restored(client):
    assert client.post('/api/spaces/1/history/restore', json={'at': 3}).json()['success'] is False
    assert client.get('/api/spaces/9/history').json()['success'] is False


def test_history_keeps_only_so_many(client):
    keep = spaces_api.HISTORY['keep']
    old = (datetime.now() - timedelta(minutes=30)).isoformat(timespec='seconds')
    db.set_user_setting('tester', spaces_api._history_key('personal', 1), [
        {'at': old, 'doc': page(text('v{}'.format(n))), 'words': 1, 'blocks': 1, 'reason': 'edit'} for n in range(keep)])
    save(client, page(text('Now')))
    save(client, page(text('Later')))
    assert len(history(client)) == keep


def test_team_spaces_have_their_own_history(client):
    full = page(*[text('Team line {}'.format(n), 't{}'.format(n)) for n in range(5)])
    save(client, full, base='/api/team-spaces')
    save(client, page(text('cleared')), base='/api/team-spaces')
    assert len(history(client, base='/api/team-spaces')) == 1
    assert history(client) == []


def test_history_is_per_account(client, stranger):
    full = page(*[text('Mine {}'.format(n), 'm{}'.format(n)) for n in range(5)])
    save(client, full)
    save(client, page(text('gone')))
    assert history(stranger) == []
    assert stranger.post('/api/spaces/1/history/restore', json={'at': 0}).json()['success'] is False

"""More pages than three, and folders to file them in.

The rules are the add / delete / file routes in backend/api/spaces.py. These pin that a
page keeps its id whatever happens around it, that deleting one takes its history and
chat with it, that folders file pages without owning them, and that both kinds behave
the same.
"""
import pytest

from backend.api import spaces as spaces_api
from backend.database import connection as db

BASES = [('/api/spaces', 'personal'), ('/api/team-spaces', 'team')]


@pytest.mark.parametrize('base,kind', BASES)
def test_a_new_page_comes_after_the_three_with_the_next_id(client, base, kind):
    reply = client.post(base + '/new', json={'name': 'AMC prep'}).json()
    assert reply['success'] and reply['space']['id'] == 4 and reply['space']['name'] == 'AMC prep'
    listed = client.get(base).json()['spaces']
    assert [row['id'] for row in listed] == [1, 2, 3, 4]
    assert client.post(base + '/4', json={'body': 'Mocks every Saturday'}).json()['success']
    blank = client.post(base + '/new', json={}).json()['space']
    assert blank['name'].endswith('5')


@pytest.mark.parametrize('base,kind', BASES)
def test_deleting_a_page_never_renumbers_the_others(client, base, kind):
    client.post(base + '/new', json={'name': 'Four'})
    client.post(base + '/2', json={'name': 'Two'})
    client.post(base + '/2/ai', json={'prompt': ''})
    db.set_user_setting('tester', spaces_api._history_key(kind, 2), [{'at': 'x', 'doc': {}}])
    assert client.post(base + '/2/delete').json()['success']
    listed = client.get(base).json()['spaces']
    assert [(row['id'], row['name']) for row in listed][-1] == (4, 'Four')
    assert [row['id'] for row in listed] == [1, 3, 4]
    assert db.user_setting('tester', spaces_api._history_key(kind, 2)) == []
    # A new one takes a fresh id, never the deleted one's.
    assert client.post(base + '/new', json={}).json()['space']['id'] == 5
    assert client.post(base + '/2', json={'name': 'Back?'}).json()['success'] is False


@pytest.mark.parametrize('base,kind', BASES)
def test_the_last_page_stays(client, base, kind):
    for ident in (1, 2):
        assert client.post('{}/{}/delete'.format(base, ident)).json()['success']
    assert client.post(base + '/3/delete').json()['success'] is False


def test_there_is_a_most(client, monkeypatch):
    monkeypatch.setattr(spaces_api, 'MAX_COUNT', 4)
    assert client.post('/api/spaces/new', json={}).json()['success']
    assert client.post('/api/spaces/new', json={}).json()['success'] is False


@pytest.mark.parametrize('base,kind', BASES)
def test_folders_file_pages_without_owning_them(client, base, kind):
    folder = client.post(base + '/folders', json={'name': 'Competitions'}).json()['folder']
    assert folder['name'] == 'Competitions'
    made = client.post(base + '/new', json={'name': 'MathCounts', 'folder': folder['id']}).json()['space']
    assert made['folder'] == folder['id']
    assert client.post(base + '/1/folder', json={'folder': folder['id']}).json()['space']['folder'] == folder['id']
    assert client.post(base + '/1/folder', json={'folder': 'nope'}).json()['success'] is False
    renamed = client.post('{}/folders/{}'.format(base, folder['id']), json={'name': 'Contests'}).json()
    assert renamed['folder']['name'] == 'Contests'
    page = client.get(base).json()
    assert page['folders'] == [{'id': folder['id'], 'name': 'Contests'}]
    assert {row['id'] for row in page['spaces'] if row['folder'] == folder['id']} == {1, made['id']}

    gone = client.post('{}/folders/{}/delete'.format(base, folder['id'])).json()
    assert gone['success'] and gone['folders'] == []
    after = client.get(base).json()
    assert len(after['spaces']) == 4 and all(row['folder'] == '' for row in after['spaces'])


def test_a_folder_needs_a_name(client):
    assert client.post('/api/spaces/folders', json={'name': '  '}).json()['success'] is False


def test_pages_can_be_put_in_a_new_order(client):
    client.post('/api/spaces/new', json={'name': 'Four'})
    reply = client.post('/api/spaces/order', json={'ids': [4, 1, 99, 4]}).json()
    assert [row['id'] for row in reply['spaces']] == [4, 1, 2, 3]
    assert [row['id'] for row in client.get('/api/spaces').json()['spaces']] == [4, 1, 2, 3]


def test_pages_saved_before_ids_read_by_their_place(client):
    db.set_user_setting('tester', 'personal_spaces', [{'name': 'A', 'body': ''}, {'name': 'B', 'body': ''},
                                                       {'name': 'C', 'body': ''}])
    assert [(row['id'], row['name']) for row in client.get('/api/spaces').json()['spaces']] == [
        (1, 'A'), (2, 'B'), (3, 'C')]


def test_folders_and_pages_belong_to_their_account(client, stranger):
    folder = client.post('/api/spaces/folders', json={'name': 'Mine'}).json()['folder']
    client.post('/api/spaces/new', json={'name': 'Private'})
    page = stranger.get('/api/spaces').json()
    assert page['folders'] == [] and len(page['spaces']) == 3
    assert stranger.post('/api/spaces/folders/{}/delete'.format(folder['id'])).json()['success'] is False

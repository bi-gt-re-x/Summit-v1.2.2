"""The three Personal spaces: a name and a page of text each, renamable."""


def test_three_spaces_start_named_and_empty(client):
    body = client.get('/api/spaces').json()
    assert body['success'] is True
    assert [(s['id'], s['name'], s['body']) for s in body['spaces']] == [
        (1, 'Space 1', ''), (2, 'Space 2', ''), (3, 'Space 3', '')]


def test_a_space_can_be_renamed_and_written_in(client):
    client.post('/api/spaces/2', json={'name': '  Reading list  '})
    client.post('/api/spaces/2', json={'body': 'Godel, Escher, Bach'})
    spaces = client.get('/api/spaces').json()['spaces']
    assert spaces[1] == {'id': 2, 'name': 'Reading list', 'body': 'Godel, Escher, Bach'}
    # The others are untouched.
    assert spaces[0]['name'] == 'Space 1' and spaces[2]['name'] == 'Space 3'


def test_a_blank_name_goes_back_to_the_default(client):
    client.post('/api/spaces/1', json={'name': 'Ideas'})
    client.post('/api/spaces/1', json={'name': '   '})
    assert client.get('/api/spaces').json()['spaces'][0]['name'] == 'Space 1'


def test_names_and_text_are_bounded(client):
    reply = client.post('/api/spaces/3', json={'name': 'x' * 200, 'body': 'y' * 60_000}).json()
    assert len(reply['space']['name']) == 40
    assert len(reply['space']['body']) == 50_000


def test_there_are_only_three(client):
    assert client.post('/api/spaces/4', json={'name': 'x'}).json()['success'] is False
    assert client.post('/api/spaces/0', json={'name': 'x'}).json()['success'] is False


def test_spaces_are_per_account(client, stranger):
    client.post('/api/spaces/1', json={'name': 'Mine', 'body': 'private'})
    theirs = stranger.get('/api/spaces').json()['spaces'][0]
    assert theirs == {'id': 1, 'name': 'Space 1', 'body': ''}


def test_signed_out_gets_nothing(anon):
    reply = anon.get('/api/spaces')
    assert reply.status_code in (401, 403) or reply.json().get('success') is False


def test_the_pages_are_gated(anon):
    reply = anon.get('/spaces/1', follow_redirects=False)
    assert reply.status_code == 303
    assert '/login' in reply.headers['location']

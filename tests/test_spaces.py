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


# ---- Team ------------------------------------------------------------------
def test_three_team_spaces_start_named_empty_and_with_nobody_invited(client):
    spaces = client.get('/api/team-spaces').json()['spaces']
    assert [(s['id'], s['name'], s['body'], s['invites']) for s in spaces] == [
        (1, 'Team Space 1', '', []), (2, 'Team Space 2', '', []), (3, 'Team Space 3', '', [])]


def test_a_team_space_is_renamed_and_written_in_apart_from_personal(client):
    client.post('/api/team-spaces/1', json={'name': 'Study group', 'body': 'Thursdays'})
    team = client.get('/api/team-spaces').json()['spaces'][0]
    assert (team['name'], team['body']) == ('Study group', 'Thursdays')
    assert client.get('/api/spaces').json()['spaces'][0]['name'] == 'Space 1'


def test_an_invite_is_kept_as_pending(client):
    reply = client.post('/api/team-spaces/2/invite', json={'email': ' Ada@Example.com '}).json()
    assert reply['success'] is True
    assert reply['space']['invites'] == [{'email': 'ada@example.com', 'status': 'pending'}]
    assert client.get('/api/team-spaces').json()['spaces'][1]['invites'][0]['email'] == 'ada@example.com'


def test_an_invite_must_look_like_an_address_and_only_once(client):
    assert client.post('/api/team-spaces/1/invite', json={'email': 'not an email'}).json()['success'] is False
    client.post('/api/team-spaces/1/invite', json={'email': 'a@b.co'})
    again = client.post('/api/team-spaces/1/invite', json={'email': 'A@B.co'}).json()
    assert again['success'] is False and 'already' in again['message']


def test_an_invite_can_be_taken_back(client):
    client.post('/api/team-spaces/3/invite', json={'email': 'a@b.co'})
    client.post('/api/team-spaces/3/invite', json={'email': 'c@d.co'})
    reply = client.post('/api/team-spaces/3/uninvite', json={'email': 'a@b.co'}).json()
    assert [item['email'] for item in reply['space']['invites']] == ['c@d.co']


def test_renaming_keeps_the_invites(client):
    client.post('/api/team-spaces/1/invite', json={'email': 'a@b.co'})
    client.post('/api/team-spaces/1', json={'name': 'Lab'})
    assert client.get('/api/team-spaces').json()['spaces'][0]['invites'][0]['email'] == 'a@b.co'


def test_there_are_only_three_team_spaces(client):
    assert client.post('/api/team-spaces/4', json={'name': 'x'}).json()['success'] is False
    assert client.post('/api/team-spaces/4/invite', json={'email': 'a@b.co'}).json()['success'] is False


def test_the_team_pages_are_gated(anon):
    reply = anon.get('/team/2', follow_redirects=False)
    assert reply.status_code == 303


# ---- The page as blocks -----------------------------------------------------
PAGE = {
    'icon': '📚',
    'cover': 'ocean',
    'blocks': [
        {'id': 'a', 'type': 'h1', 'text': 'Reading'},
        {'id': 'b', 'type': 'todo', 'text': 'GEB', 'checked': True},
        {'id': 'c', 'type': 'todo', 'text': 'SICP', 'indent': 1},
        {'id': 'd', 'type': 'toggle', 'text': 'Notes', 'collapsed': True},
        {'id': 'e', 'type': 'divider', 'text': 'ignored'},
        {'id': 'f', 'type': 'code', 'text': 'print(1)'},
    ],
}


def test_a_page_is_kept_as_blocks_and_as_plain_text(client):
    reply = client.post('/api/spaces/1', json={'doc': PAGE}).json()
    assert reply['success'] is True
    space = client.get('/api/spaces').json()['spaces'][0]
    assert space['doc']['icon'] == '📚' and space['doc']['cover'] == 'ocean'
    assert [b['type'] for b in space['doc']['blocks']] == ['h1', 'todo', 'todo', 'toggle', 'divider', 'code']
    assert space['doc']['blocks'][1]['checked'] is True
    assert space['doc']['blocks'][2]['indent'] == 1
    assert space['doc']['blocks'][3]['collapsed'] is True
    assert space['doc']['blocks'][4]['text'] == ''
    assert space['body'] == '# Reading\n- [x] GEB\n  - [ ] SICP\n▸ Notes\n---\n```\nprint(1)\n```'


def test_a_page_is_cleaned_before_it_is_kept(client):
    doc = {
        'icon': 'x' * 40,
        'cover': 'neon',
        'blocks': [
            {'id': 'a', 'type': 'marquee', 'text': 'kept as text'},
            {'id': 'a', 'type': 'text', 'text': 'y' * 20_000, 'indent': 99},
            {'id': 'c', 'type': 'text', 'checked': True, 'collapsed': True},
            'not a block',
        ],
    }
    blocks = client.post('/api/spaces/2', json={'doc': doc}).json()['space']['doc']['blocks']
    space = client.get('/api/spaces').json()['spaces'][1]['doc']
    assert len(space['icon']) == 16 and space['cover'] == ''
    assert blocks[0] == {'id': 'a', 'type': 'text', 'text': 'kept as text'}
    assert blocks[1]['id'] != 'a' and blocks[1]['indent'] == 4 and len(blocks[1]['text']) == 10_000
    assert blocks[2] == {'id': 'c', 'type': 'text', 'text': ''}
    assert len(blocks) == 3


def test_a_page_never_opened_as_blocks_has_no_doc(client):
    client.post('/api/spaces/3', json={'body': 'plain'})
    assert 'doc' not in client.get('/api/spaces').json()['spaces'][2]


def test_a_team_page_is_blocks_too_and_keeps_its_invites(client):
    client.post('/api/team-spaces/1/invite', json={'email': 'ada@example.com'})
    client.post('/api/team-spaces/1', json={'doc': PAGE})
    space = client.get('/api/team-spaces').json()['spaces'][0]
    assert space['doc']['blocks'][0]['text'] == 'Reading'
    assert space['invites'] == [{'email': 'ada@example.com', 'status': 'pending'}]

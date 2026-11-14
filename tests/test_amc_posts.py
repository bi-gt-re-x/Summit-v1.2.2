"""Posting problems and solutions by hand (backend/amc/posts.py, backend/api/amc_posts.py)."""
import pytest

from backend.amc import posts

AMC = {'level': 'AMC 10', 'title': 'Test 1', 'statement': r'What is $\frac12+\frac13$?',
       'choices': [r'$\frac16$', r'\frac25', r'$\frac56$', '$1$', r'$\frac76$'], 'answer': 'c',
       'solution': 'Common denominator:\n\n$\\frac36+\\frac26=\\frac56$.'}


def test_an_amc_post_is_saved_and_listed(client):
    made = client.post('/api/amc/posts', json=AMC).json()
    assert made['success']
    post = made['post']
    assert post['id'].startswith('post-') and post['author'] == 'tester' and post['can_edit']
    assert post['answer'] == 'C'
    assert post['choices'][1] == r'$\frac25$'          # TeX typed without $ is wrapped
    listed = client.get('/api/amc/posts').json()['posts']
    assert [p['id'] for p in listed] == [post['id']]
    assert client.get('/api/amc/posts', params={'level': 'AIME'}).json()['posts'] == []


def test_an_aime_post_needs_an_integer_answer(client):
    body = {'level': 'AIME', 'statement': 'Find $2^{10} \\bmod 1000$.', 'answer': '1024', 'solution': ''}
    assert 'whole number' in client.post('/api/amc/posts', json=body).json()['message']
    made = client.post('/api/amc/posts', json={**body, 'answer': '024'}).json()
    assert made['success'] and made['post']['answer'] == '24' and made['post']['choices'] is None


@pytest.mark.parametrize('change, message', [
    ({'statement': ''}, 'Write the problem'),
    ({'choices': ['$1$', '$2$', '$3$', '$4$']}, 'five answer choices'),
    ({'choices': ['$1$', '$1$', '$3$', '$4$', '$5$']}, 'the same'),
    ({'answer': 'F'}, 'A to E'),
    ({'statement': 'What is $1+1?'}, 'unmatched $'),
    ({'level': 'AMC 8'}, 'AMC 10, AMC 12 or AIME'),
])
def test_bad_posts_are_refused_with_a_reason(client, change, message):
    reply = client.post('/api/amc/posts', json={**AMC, **change}).json()
    assert not reply['success'] and message in reply['message']


def test_aops_markup_and_a_pasted_choices_line_are_understood():
    pasted = (r'What is <math>2+3</math>?' '\n\n'
              r'<math>\textbf{(A)}\ 4 \qquad \textbf{(B)}\ 5 \qquad \textbf{(C)}\ 6 \qquad '
              r'\textbf{(D)}\ 7 \qquad \textbf{(E)}\ 8</math>')
    post = posts.clean('AMC 12', '', pasted, None, 'B', r'\[2+3=5\]')
    assert post['statement'] == 'What is $2+3$?'
    assert post['choices'] == ['$4$', '$5$', '$6$', '$7$', '$8$']
    assert post['solution'] == '$$2+3=5$$'


def test_split_pulls_the_choices_out(client):
    reply = client.post('/api/amc/posts/split', json={
        'statement': r'Pick one. $\textbf{(A) } 1 \qquad \textbf{(B) } 2 \qquad \textbf{(C) } 3 \qquad '
                     r'\textbf{(D) } 4 \qquad \textbf{(E) } 5$'}).json()
    assert reply['success'] and reply['statement'] == 'Pick one.' and reply['choices'][4] == '$5$'
    assert not client.post('/api/amc/posts/split', json={'statement': 'No choices here.'}).json()['success']


def test_only_the_author_can_edit_or_delete(client, stranger):
    pid = client.post('/api/amc/posts', json=AMC).json()['post']['id']
    theirs = stranger.get('/api/amc/posts').json()['posts'][0]
    assert theirs['id'] == pid and not theirs['can_edit']
    assert not stranger.put('/api/amc/posts/' + pid, json={**AMC, 'title': 'Mine now'}).json()['success']
    assert not stranger.delete('/api/amc/posts/' + pid).json()['success']
    edited = client.put('/api/amc/posts/' + pid, json={**AMC, 'title': 'Renamed'}).json()
    assert edited['success'] and edited['post']['title'] == 'Renamed'
    assert client.delete('/api/amc/posts/' + pid).json()['success']
    assert client.get('/api/amc/posts').json()['posts'] == []

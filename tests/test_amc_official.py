"""Importing an official contest by pasting it.

The fixtures are made-up problems laid out the way the AoPS wiki source and a
PDF's text are laid out — the parsing is what is under test, not the content.
"""
from backend.amc import official

WIKI = r"""{{AMC10 Problems|year=2023|ab=A}}
==Problem 1==
What is <math>2+3</math>?

<math>\textbf{(A) } 4 \qquad\textbf{(B) } 5 \qquad\textbf{(C) } 6 \qquad\textbf{(D) } 7 \qquad\textbf{(E) } 8</math>

[[2023 AMC 10A Problems/Problem 1|Solution]]

==Problem 2==
A '''circle''' has radius <math>r</math>. Find <math>\frac{\pi r^2}{r}</math> when <math>r=2</math>.
<asy>
draw(circle((0,0),2));
</asy>

<math>\mathrm{(A)}\ \pi \qquad \mathrm{(B)}\ 2\pi \qquad \mathrm{(C)}\ 3\pi</math>
<math>\mathrm{(D)}\ 4\pi \qquad \mathrm{(E)}\ 5\pi</math>

[[2023 AMC 10A Problems/Problem 2|Solution]]

==Problem 3==
How many ways can 3 friends sit in a row?

<math>\textbf{(A)}~3\qquad\textbf{(B)}~4\qquad\textbf{(C)}~5\qquad\textbf{(D)}~6\qquad\textbf{(E)}~\text{none of these}</math>

==See also==
{{AMC10 box|year=2023|ab=A|before=First|after=[[2023 AMC 10B Problems]]}}
"""

TEXT = """1. What is 2 + 3? (A) 4 (B) 5 (C) 6 (D) 7 (E) 8
2. What is 10 - 4? (A) 4 (B) 5 (C) 6 (D) 7 (E) 8
"""


def test_wiki_source():
    found = official.parse_contest(WIKI, 'AMC 10')
    assert [p['number'] for p in found] == [1, 2, 3]
    one, two, three = found
    assert one['statement'] == 'What is $2+3$?'
    assert one['choices'] == ['$4$', '$5$', '$6$', '$7$', '$8$']
    assert 'Solution' not in one['statement'] and '[[' not in one['statement']
    # Choices split over two math blocks, an Asymptote diagram kept aside,
    # bold markup removed.
    assert two['choices'] == ['$\\pi$', '$2\\pi$', '$3\\pi$', '$4\\pi$', '$5\\pi$']
    assert 'draw(circle' in two['diagram'] and '<asy>' not in two['statement']
    assert "'''" not in two['statement'] and 'circle' in two['statement']
    assert three['choices'][3] == '$6$' and three['choices'][4] == 'none of these'
    assert 'See also' not in three['statement']


def test_plain_text():
    found = official.parse_contest(TEXT, 'AMC 10')
    assert found[0]['statement'] == 'What is 2 + 3?'
    assert found[0]['choices'] == ['4', '5', '6', '7', '8']
    assert found[1]['choices'][2] == '6'


def test_aime_has_no_choices():
    found = official.parse_contest('==Problem 1==\nFind <math>x</math>.\n==Problem 2==\nFind y.', 'AIME')
    assert found[0]['choices'] is None and found[0]['statement'] == 'Find $x$.'


def test_answer_keys():
    letters = 'BCDAEBCDAEBCDAEBCDAEBCDAE'
    assert official.parse_key('\n'.join('# ' + x for x in letters), 'AMC 10') == list(letters)
    assert official.parse_key('\n'.join('%d. %s' % (i + 1, x) for i, x in enumerate(letters)), 'AMC 10') == list(letters)
    assert official.parse_key(letters, 'AMC 10') == list(letters)
    assert official.parse_key(' '.join(letters), 'AMC 10') == list(letters)
    aime = [204, 33, 5, 80, 6, 7, 999, 0, 12, 45, 100, 250, 3, 18, 77]
    assert official.parse_key('\n'.join('# %03d' % n for n in aime), 'AIME') == aime
    assert official.parse_key(' '.join('%d. %d' % (i + 1, n) for i, n in enumerate(aime)), 'AIME') == aime


def test_topic_and_difficulty_guesses():
    assert official.guess_topic('A circle has radius 3.') == 'circles'
    assert official.guess_topic('What is the remainder when 7^5 is divided by 4?') == 'modular-arithmetic'
    assert official.difficulty_at('AMC 10', 1) == 1 and official.difficulty_at('AMC 10', 25) == 5
    assert official.difficulty_at('AIME', 15) == 5
    assert official.guess_topics('How many ordered pairs of positive integers $(x, y)$ satisfy $xy = 12$?')[0] \
        == 'diophantine'
    assert official.guess_topics('In triangle $ABC$, the angle bisector from $A$ meets $BC$ at $D$.')[:2] \
        == ['triangle-centers', 'angle-chasing']
    assert official.guess_topics('A clock shows 3 p.m.')[0] == 'clocks-calendars'


def _full_contest():
    body = '\n'.join(
        '==Problem %d==\nWhat is %d+0?\n\n<math>\\textbf{(A) }%d\\qquad\\textbf{(B) }%d\\qquad'
        '\\textbf{(C) }%d\\qquad\\textbf{(D) }%d\\qquad\\textbf{(E) }%d</math>\n'
        % (n, n, n, n + 1, n + 2, n + 3, n + 4) for n in range(1, 26))
    return body, 'A' * 25


def test_import_then_practise_and_time_it(client):
    body, key = _full_contest()
    preview = client.post('/api/amc/contests/2023-amc-10a/import', json={'problems': body, 'key': key}).json()
    assert preview['success'] and preview['issues'] == [] and not preview['saved']
    assert client.get('/api/amc/contests/2023-amc-10a').json()['contest']['imported'] is False

    saved = client.post('/api/amc/contests/2023-amc-10a/import',
                        json={'problems': body, 'key': key, 'save': True}).json()
    assert saved['saved']

    detail = client.get('/api/amc/contests/2023-amc-10a').json()
    assert detail['contest']['imported'] and len(detail['problems']) == 25
    assert 'answer' not in detail['problems'][0]

    # Practised one at a time, in-site.
    reply = client.post('/api/amc/problems/2023-amc-10a-3/attempt', json={'answer': 'B'}).json()
    assert reply['success'] and not reply['correct'] and reply['problem']['answer'] == 'A'
    assert client.get('/api/amc/problems/2023-amc-10a-3').json()['next'] == '2023-amc-10a-4'
    assert client.get('/api/amc/problems', params={'source': 'official'}).json()['problems'][0]['source'] \
        == '2023 AMC 10A #1'

    # And timed as a whole contest, scored 6 / 1.5 / 0.
    answers = {str(n): 'A' for n in range(1, 21)}
    mock = client.post('/api/amc/contests/2023-amc-10a/submit', json={'answers': answers}).json()
    result = client.get('/api/amc/mocks/' + mock['id']).json()
    assert result['result']['score'] == 20 * 6 + 5 * 1.5
    assert result['contest']['official']

    # Search finds it.
    assert any(p['id'].startswith('2023-amc-10a') for p in
               client.get('/api/amc/search', params={'q': '2023 AMC 10A'}).json()['problems'])


def test_an_incomplete_import_is_refused(client):
    body, _ = _full_contest()
    reply = client.post('/api/amc/contests/2023-amc-10a/import',
                        json={'problems': body, 'key': 'ABC', 'save': True}).json()
    assert not reply['success'] and '3 of 25' in reply['message']
    assert client.get('/api/amc/contests/2023-amc-10a').json()['contest']['imported'] is False


def _api_page(pages, redirects=()):
    """An AoPS API reply (formatversion 2) holding these {title: source} pages."""
    import json
    return json.dumps({'batchcomplete': True, 'query': {
        'redirects': [{'from': a, 'to': b} for a, b in redirects],
        'pages': [{'ns': 0, 'title': t, 'revisions': [{'slots': {'main': {'contentmodel': 'wikitext', 'content': c}}}]}
                  for t, c in pages.items()]}})


def test_batch_links_cover_problems_and_keys():
    batches = official.batch_urls(['2023-amc-10a', '2024-aime-i'])
    assert len(batches) == 1
    url = batches[0]['url']
    assert url.startswith(official.API) and '2023_AMC_10A_Problems' in url and '2024_AIME_I_Answer_Key' in url
    many = official.batch_urls([c['id'] for c in official.catalog.PAST][:20])
    assert [len(b['contests']) for b in many] == [8, 8, 4]


def test_bundle_imports_every_complete_paper(client):
    body, key = _full_contest()
    first = _api_page({'2023 AMC 10A Problems': body, '2023 AMC 10A Answer Key': '\n'.join('# A' for _ in range(25)),
                       '2023 AMC 10B Problems': body})
    # A second batch pasted after the first, with the browser's chrome around it,
    # and a key that reached the page through a redirect.
    second = 'Pretty-print ' + _api_page({'2023 AMC 12A Answer Key (new)': key, '2023 AMC 12A Problems': body},
                                         redirects=[('2023 AMC 12A Answer Key', '2023 AMC 12A Answer Key (new)')])
    reply = client.post('/api/amc/official/import', json={'text': first + '\n' + second}).json()
    assert reply['success'] and reply['saved'] == 0
    rows = {r['id']: r for r in reply['contests']}
    assert rows['2023-amc-10a']['complete'] and rows['2023-amc-12a']['complete']
    assert not rows['2023-amc-10b']['complete'] and 'answer key was not' in rows['2023-amc-10b']['issues'][0]

    saved = client.post('/api/amc/official/import', json={'text': first + second, 'save': True}).json()
    assert saved['saved'] == 2
    assert client.get('/api/amc/contests/2023-amc-12a').json()['contest']['imported']
    left = client.get('/api/amc/official/batches').json()
    assert left['missing'] == left['total'] - 2
    assert not client.post('/api/amc/official/import', json={'text': 'nothing here'}).json()['success']


def test_official_problems_are_shown_whole_in_order(client):
    body, key = _full_contest()
    client.post('/api/amc/contests/2023-amc-10a/import', json={'problems': body, 'key': key, 'save': True})
    detail = client.get('/api/amc/contests/2023-amc-10a').json()
    assert [p['number'] for p in detail['problems']] == list(range(1, 26))
    first = detail['problems'][0]
    assert first['statement'] == 'What is 1+0?' and first['choices'][0] == '$1$'
    assert first['aops_url'].endswith('2023_AMC_10A_Problems/Problem_1')
    assert [p['rating'] for p in detail['problems']] == sorted(p['rating'] for p in detail['problems'])


def test_problem_list_runs_in_contest_order(client):
    rows = client.get('/api/amc/problems', params={'source': 'step'}).json()['problems']
    order = [(r['source'].rsplit(' #', 1)[0], int(r['source'].rsplit('#', 1)[1])) for r in rows]
    mocks = [m['name'] for m in official.catalog.MOCKS]
    assert order == sorted(order, key=lambda o: (mocks.index(o[0]), o[1]))
    hard = client.get('/api/amc/problems', params={'rating': '4'}).json()
    assert hard['problems'] and all(4 <= r['rating'] < 5 for r in hard['problems'])
    assert sum(hard['rating_counts'].values()) == hard['total']

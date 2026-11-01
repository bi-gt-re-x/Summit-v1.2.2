"""LaTeX in skill problems, and the shape each answer has to take.

- backend/tracking/mathtext.py: plain math becomes `\\( ... \\)` in the trees
  that have math, and nowhere else. A dollar sign stays a dollar sign.
- backend/tracking/skill_check.py: every answer gets a shape, the shape is
  enforced before grading, and equal answers count as equal.
- backend/api/skillchecks.py: a question goes out with its shape, and the wrong
  shape comes back with a message and records nothing.

The library tests read data/skill_steps_seed.json, so a new batch that breaks
one of these rules fails here.
"""
import json
import os

import pytest

from backend.tracking import mathtext, skill_check, skillsteps
from backend.tracking.mathtext import to_latex, to_plain

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _library():
    with open(os.path.join(ROOT, 'data', 'skill_nodes.json')) as handle:
        trees = {node['id']: node['tree'] for node in json.load(handle)['nodes']}
    with open(os.path.join(ROOT, 'data', 'skill_steps_seed.json')) as handle:
        seed = json.load(handle)['programmes']
    for node_id, entry in seed.items():
        for step in entry['steps']:
            for problem in step.get('problems') or []:
                yield trees[node_id], problem


# ---------------------------------------------------------------------------
# Plain math to LaTeX
# ---------------------------------------------------------------------------
@pytest.mark.parametrize('plain, latex', [
    ('Factor 4z^2 - 20z + 25.', r'Factor \(4z^{2} - 20z + 25\).'),
    ('1/2.', r'\(\frac{1}{2}\).'),
    ('Find dy/dx for e^(xy) = 5.', r'Find \(\frac{dy}{dx}\) for \(e^{xy} = 5\).'),
    ('Solve for x.', r'Solve for \(x\).'),
    ('Is y = 4x - 9 a line?', r'Is \(y = 4x - 9\) a line?'),
    ('Evaluate 2 + 3 x 4.', r'Evaluate \(2 + 3 \times 4\).'),
    ('Simplify (x + 3)(x - 2).', r'Simplify \((x + 3)(x - 2)\).'),
    ('Give cos 315° exactly.', r'Give \(\cos 315^{\circ}\) exactly.'),
    ('Evaluate log4 2.', r'Evaluate \(\log_{4} 2\).'),
])
def test_math_becomes_latex(plain, latex):
    assert to_latex(plain, 'algebra') == latex


def test_a_matrix_is_a_matrix():
    assert to_latex('det [[5, 0], [0, 2]]?', 'linear-algebra') == (
        r'det \(\begin{bmatrix} 5 & 0 \\ 0 & 2 \end{bmatrix}\)?')


@pytest.mark.parametrize('text', [
    'A car goes 25 m/s for 2 s.',
    'A 60° angle and 3 apples.',
    'Costs $5 + $10 today.',
    'The x-axis crosses at 4.',
    'Is 24/7 support worth it?',
])
def test_what_only_looks_like_math_stays_text(text):
    assert to_latex(text, 'physics') == text


@pytest.mark.parametrize('tree', ['finance', 'cooking', 'career', 'coding', 'history'])
def test_a_tree_with_no_math_is_left_alone(tree):
    for text in ('Spend $5 + $10 = $15.', 'Solve x^2 = 4.', 'Save 1/2 of $40 and x = 3.'):
        assert to_latex(text, tree) == text


def test_code_trees_only_get_the_unmistakable_kinds():
    assert to_latex('O(n log n) at i = 0 for n^2.', 'algorithms') == (
        r'\(O(n\log n)\) at i = 0 for \(n^{2}\).')


def test_formulas_get_subscripts_and_charges_in_chemistry():
    assert to_latex('Mass of H2O?', 'chemistry') == r'Mass of \(\mathrm{H_{2}O}\)?'
    assert to_latex('Al3+ and NO3-', 'chemistry') == r'\(\mathrm{Al}^{3+}\) and \(\mathrm{NO_{3}}^{-}\)'


def test_converting_twice_changes_nothing():
    once = to_latex('Factor x^2 - 1.', 'algebra')
    assert to_latex(once, 'algebra') == once


@pytest.mark.parametrize('plain', ['1/2', '-1/3', 'x^2 - 7x + 12', 'H2O', 'sin 45°'])
def test_to_plain_undoes_it(plain):
    tree = 'chemistry' if plain == 'H2O' else 'algebra'
    assert has_markers(to_latex(plain, tree))
    assert to_plain(to_latex(plain, tree)) == plain


def has_markers(text):
    return mathtext.has_math(text)


def test_no_dollar_sign_in_the_library_is_inside_math():
    for _tree, problem in _library():
        for field in ('prompt', 'answer', 'hint'):
            text = problem.get(field) or ''
            for piece in text.split(r'\(')[1:]:
                assert '$' not in piece.split(r'\)')[0], text


def test_trees_with_no_math_hold_no_latex():
    allowed = mathtext.MATH_TREES | mathtext.LIGHT_TREES
    for tree, problem in _library():
        if tree not in allowed:
            assert not mathtext.has_math(problem['prompt'] + problem['answer']), problem['prompt']


def test_latex_answers_still_grade_as_the_same_number():
    assert skill_check.expected(r'\(\frac{3}{4}\).') == skill_check.expected('3/4.')
    assert skill_check.grade(r'\(-\frac{1}{3}\)', '-1/3') is True
    assert skill_check.grade(r'\(\frac{1}{2}\)', r'\frac{2}{4}') is True


def test_the_rules_read_latex_as_the_math_it_stands_for():
    long_tex = {'slot': 1, 'weight': 'warmup', 'prompt': r'Factor \(\frac{1}{2}x^{2}\) now.', 'answer': r'\(\frac{1}{2}\)'}
    assert skillsteps.problem_failures(long_tex, {}) == []


# ---------------------------------------------------------------------------
# Shapes
# ---------------------------------------------------------------------------
@pytest.mark.parametrize('prompt, answer, tree, kind', [
    ('Add 2 and 3.', '5.', 'mathematics', 'integer'),
    ('How far?', '2000 N', 'physics', 'integer'),
    ('How long, to 2 decimal places?', '21.96 m.', 'trigonometry', 'decimal'),
    ('Probability of heads?', '1/2.', 'statistics', 'fraction'),
    ('Same, in LaTeX.', r'\(\frac{1}{2}\).', 'statistics', 'fraction'),
    ('What share?', '60%', 'cooking', 'percent'),
    ('Factor it.', r'\((2z - 5)^{2}\).', 'algebra', 'expression'),
    ('Solve it.', r'\(x = 3\) or -3.', 'algebra', 'expression'),
    ('Where do they meet?', '(2, 3).', 'algebra', 'coordinates'),
    ('Sort these.', '-10, -7, 0, 3.', 'mathematics', 'list'),
    ('Is 7 prime?', 'Yes.', 'mathematics', 'yesno'),
    ('Is it safe?', 'No, it is too hot.', 'cooking', 'yesno'),
    ('Why stop?', 'No need to go on.', 'life', 'phrase'),
    ('Check that x = 2 works.', 'True.', 'algebra', 'truefalse'),
    ('Which call shows the types?', 'df.info()', 'data-science', 'code'),
    ('Which organ?', 'The heart.', 'anatomy', 'word'),
    ('About how many?', 'About 20', 'foreign-language', 'integer'),
    ('What should you do?', 'Drop back to the week 2 level.', 'fitness', 'phrase'),
    ('Why?', 'Because the large gap shows the model is overfitting to the training data.',
     'machine-learning', 'sentence'),
    ('Write a paragraph on it.', ' '.join(['word'] * 18), 'writing', 'paragraph'),
    ('Why?', ' '.join(['word'] * 25), 'writing', 'paragraph'),
])
def test_classify(prompt, answer, tree, kind):
    assert skill_check.classify(prompt, answer, tree) == kind


@pytest.mark.parametrize('kind, good, bad', [
    ('integer', ['12', '-3', '2,000', '12.0', 'x = 12', '12 cm'], ['12.5', '3/4', 'twelve', '12 or 13', '']),
    ('decimal', ['2.5', '3', '-0.25 kJ'], ['1/2', 'half', '2.5 or 3']),
    ('fraction', ['3/4', '-2/4', '1 1/2', r'\frac{3}{4}'], ['0.75', '3', 'three quarters', '1/0']),
    ('percent', ['60%', '60', '0.6'], ['3/5', 'most of it', '60 or 70']),
    ('yesno', ['yes', 'No, it is too hot', 'YEP'], ['maybe', '12']),
    ('truefalse', ['true', 'F'], ['maybe']),
    ('coordinates', ['(2, 3)', '2, 3', '(a, b)'], ['2']),
    ('list', ['a, b', 'salt and pepper', '1, 2, 3'], ['salt']),
    ('expression', ['2x + 3', '(x - 1)^2', 'x = 3 or -3', '√2/2'], ['this is my answer written as words here']),
    ('word', ['Heart', 'Left atrium'], ['12', ' '.join(['word'] * 6)]),
    ('phrase', ['A few words', '12'], [' '.join(['word'] * 31)]),
    ('sentence', ['It keeps your work honest.'], ['Too short']),
    ('paragraph', [' '.join(['word'] * 15)], ['One sentence is not going to be enough here.']),
    ('code', ['print(x)'], ['']),
])
def test_shapes(kind, good, bad):
    for given in good:
        assert skill_check.refusal(kind, given) is None, given
    for given in bad:
        assert skill_check.refusal(kind, given) == skill_check.KINDS[kind]['refuse'], given


@pytest.mark.parametrize('answer, given, right', [
    ('1/2', '2/4', True),
    ('1/2', '50/100', True),
    (r'\(\frac{1}{2}\)', '2/4', True),
    ('3/2', '1 1/2', True),
    ('-1/3', '-2/6', True),
    ('1/2', '1/3', False),
    ('2000 N', '2,000', True),
    ('2000 N', '2000', True),
    ('15.', '15.0', True),
    ('60%', '60', True),
])
def test_equal_answers_count_as_equal(answer, given, right):
    assert skill_check.grade(answer, given) is right


def test_yes_or_no_goes_by_its_first_word():
    assert skill_check.grade_as('yesno', 'Yes, with eigenvalue 1.', 'yes') is True
    assert skill_check.grade_as('yesno', 'Yes, with eigenvalue 1.', 'Yeah, it is') is True
    assert skill_check.grade_as('yesno', 'No.', 'yes') is False
    assert skill_check.grade_as('truefalse', 'True.', 'T') is True
    assert skill_check.grade_as('truefalse', 'True.', 'false') is False


def test_every_answer_in_the_library_fits_its_own_shape():
    missing, wrong, unknown = [], [], []
    for _tree, problem in _library():
        kind = problem.get('answer_kind')
        if not kind:
            missing.append(problem['prompt'])
        elif kind not in skill_check.KINDS:
            unknown.append(kind)
        elif skill_check.refusal(kind, problem['answer']):
            wrong.append((kind, problem['answer']))
    assert missing == []
    assert unknown == []
    assert wrong == []


def test_the_shape_words_read_like_a_person():
    for entry in skill_check.KINDS.values():
        for words in entry.values():
            assert '—' not in words and '“' not in words


def test_finish_problem_is_safe_twice():
    once = skillsteps.finish_problem({'prompt': 'Solve x^2 = 4.', 'answer': 'x = 2 or -2.', 'hint': ''}, 'algebra')
    assert once['answer_kind'] == 'expression'
    assert skillsteps.finish_problem(once, 'algebra') == once


def test_an_answer_that_breaks_its_own_shape_fails_the_rules():
    problem = {'slot': 1, 'weight': 'warmup', 'prompt': 'What is 2 + 2 today?', 'answer': '4', 'answer_kind': 'fraction'}
    assert any(reason.startswith('format:') for reason in skillsteps.problem_failures(problem, {}))


# ---------------------------------------------------------------------------
# The check, end to end
# ---------------------------------------------------------------------------
_STEP = {
    'title': 'Fractions in a row', 'mastery': 'Add fractions with unlike denominators.',
    'practice': 'Work 12 mixed sums of 3-digit numbers, then check each one by estimating.',
    'detail': 'Estimate first so a wrong place value shows up before you finish the sum.',
    'proof': 'All 12 sums right on the first pass.',
    'pitfall': 'Dropping a carried 1 when the column already holds a 9.',
    'minutes': 15, 'tree_id': 'mathematics', 'tier': 'foundation', 'model': 'authored',
    'generated_at': '2026-10-01T00:00:00', 'attempts': 1, 'verified_at': '2026-10-01T00:00:00',
    'verifier': 'rules+authored', 'checks': list(skillsteps.RULE_CHECKS),
}


def _seed_shapes():
    """A node whose every step asks one question of one shape."""
    from backend.database import connection as db
    answers = [(r'\(\frac{1}{2}\)', 'fraction'), ('12.', 'integer'), ('Yes.', 'yesno'),
               ('2.5.', 'decimal'), (' '.join(['word'] * 22) + '.', 'paragraph')]
    db.save_node_steps('m.arith', [{**_STEP, 'ordinal': n, 'title': 'Step {} of the drill'.format(n)}
                                   for n in range(1, 6)])
    for n, (answer, kind) in enumerate(answers, start=1):
        db.save_step_problems('m.arith', n, [{
            'slot': slot, 'weight': weight, 'prompt': 'Question {} in step {}?'.format(slot, n),
            'answer': answer, 'answer_kind': kind, 'hint': '', 'tree_id': 'mathematics', 'model': 'authored',
            'generated_at': '2026-10-01T00:00:00', 'verified_at': '2026-10-01T00:00:00',
            'verifier': 'rules+authored', 'checks': ['concrete'],
        } for slot, weight in ((1, 'core'), (2, 'stretch'))])


def _start(client):
    reply = client.post('/api/skill-checks/start', json={'node_id': 'm.arith'}).json()
    assert reply['success'], reply
    return reply['check']


def _say(client, check, index, given, **extra):
    return client.post('/api/skill-checks/answer', json={
        'id': check['id'], 'index': index, 'given': given, **extra}).json()


def test_a_question_says_what_shape_its_answer_takes(client):
    _seed_shapes()
    questions = _start(client)['questions']
    assert [one['format']['kind'] for one in questions] == ['fraction', 'integer', 'yesno', 'decimal', 'paragraph']
    assert questions[0]['format']['label'] == 'Fraction'
    assert questions[0]['format']['note']
    assert 'answer' not in questions[0]
    assert [one['auto'] for one in questions] == [True, True, True, True, False]


def test_the_wrong_shape_is_refused_and_not_counted(client):
    _seed_shapes()
    check = _start(client)
    reply = _say(client, check, 0, '0.5')
    assert reply['success']
    assert reply['invalid'] == {'index': 0, 'message': skill_check.KINDS['fraction']['refuse']}
    assert 'result' not in reply
    assert reply['check']['questions'][0]['result'] is None
    assert reply['check']['correct'] == 0

    fixed = _say(client, check, 0, '2/4')
    assert fixed['result']['right'] is True
    assert fixed['result']['how'] == 'auto'


def test_a_wrong_answer_of_the_right_shape_is_a_miss(client):
    _seed_shapes()
    check = _start(client)
    assert _say(client, check, 0, '1/3')['result']['right'] is False
    assert _say(client, check, 1, '12.5')['invalid']['message'] == skill_check.KINDS['integer']['refuse']
    assert _say(client, check, 1, '13')['result']['right'] is False


def test_yes_or_no_grades_itself(client):
    _seed_shapes()
    check = _start(client)
    assert _say(client, check, 2, 'maybe')['invalid']
    assert _say(client, check, 2, 'yes it is')['result']['right'] is True


def test_a_paragraph_is_held_to_a_paragraph(client):
    _seed_shapes()
    check = _start(client)
    assert _say(client, check, 4, 'Too short.')['invalid']['message'] == skill_check.KINDS['paragraph']['refuse']
    long_answer = ' '.join(['word'] * 300)
    reveal = _say(client, check, 4, long_answer)
    assert reveal['reveal']['answer']
    assert _say(client, check, 4, long_answer, mark='right')['result']['how'] == 'self'


def test_a_refused_answer_can_still_be_skipped(client):
    _seed_shapes()
    check = _start(client)
    assert _say(client, check, 0, '', skip=True)['result']['how'] == 'skipped'


def test_the_panel_gets_the_shape_with_each_problem(client):
    _seed_shapes()
    reply = client.get('/api/skill-steps?nodes=m.arith').json()
    steps = reply.get('programmes', reply.get('steps', reply))
    text = json.dumps(steps)
    assert '"label": "Fraction"' in text

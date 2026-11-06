"""Marking answers that are not one number: backend/tracking/answer_match.py.

The library tests read data/skill_steps_seed.json, so a batch whose grading
marks its own answer wrong, or accepts the answer to the problem next to it,
fails here.
"""
import json
import os

import pytest

from backend.tracking import answer_match as match
from backend.tracking import skill_check

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _library():
    with open(os.path.join(ROOT, 'data', 'skill_steps_seed.json')) as handle:
        seed = json.load(handle)['programmes']
    for node_id, entry in seed.items():
        for step in entry['steps']:
            problems = step.get('problems') or []
            for problem in problems:
                yield node_id, step, problem, problems


# ---------------------------------------------------------------------------
# Math
# ---------------------------------------------------------------------------
@pytest.mark.parametrize('answer, given', [
    (r'\(\frac{\sqrt{6} + \sqrt{2}}{4}\).', '(sqrt(6)+sqrt(2))/4'),
    (r'\(\frac{\sqrt{6} + \sqrt{2}}{4}\).', '(√6+√2)/4'),
    (r'\(y = - x^{2} + 3\).', 'y = 3 - x^2'),
    (r'\(y = - x^{2} + 3\).', '3-x²'),
    (r'\(-\frac{1}{2x^{2}} + C\).', '-1/(2x^2) + C'),
    (r'\(-1 \le t < 2\).', 't >= -1 and t < 2'),
    (r'\(x > 6\).', '6 < x'),
    (r'\(5 + 2i\).', '5+2i'),
    (r'\(\sqrt{14}\).', 'sqrt14'),
    ('x = 2 or -2.', 'x = -2 or x = 2'),
    ('x = 2 or -2.', '2, -2'),
    (r"\(x' = y\) and \(y' = - 4x\)", "x' = y, y' = -4x"),
    ('(5, 5).', '(5,5)'),
    (r'\(e^{-2t}\)', 'e^(-2t)'),
    (r'\(\sin^{2}\theta\)', '(sin θ)^2'),
    (r'\(2\sin x\cos x\)', 'sin(2x)'),
    ('9 - 6 = 3.', '3'),
    (r'\(\begin{bmatrix} 2 & 0 \\ 0 & 3 \end{bmatrix}\)', '[[2,0],[0,3]]'),
    (r'\(\log_{2} 8\)', '3'),
    (r'\(\sqrt[3]{8}\)', '2'),
    (r'\(5!\)', '120'),
])
def test_the_same_math_written_another_way_is_right(answer, given):
    assert match.same_math(answer, given) is True


@pytest.mark.parametrize('answer, given', [
    (r'\(\frac{\sqrt{6} + \sqrt{2}}{4}\).', '0.9659'),
    (r'\(y = - x^{2} + 3\).', 'y = x^2 + 3'),
    (r'\(-\frac{1}{2x^{2}} + C\).', '-1/(2x^2)'),
    (r'\(-1 \le t < 2\).', '-1 < t < 2'),
    (r'\(x > 6\).', 'x >= 6'),
    (r'\(5 + 2i\).', '5-2i'),
    ('x = 2 or -2.', 'x = 2'),
    ('(-2,-9).', '(-2, 9)'),
    ('(5, 5).', 'hello'),
])
def test_different_math_is_wrong(answer, given):
    assert match.same_math(answer, given) is False


def test_matrix_products_are_not_read_as_numbers():
    """AB is not BA, so sampling numbers for A and B would pass the wrong order."""
    assert match.same_math(r'\(B^{T}A^{T}\).', 'A^T B^T') is None


# ---------------------------------------------------------------------------
# Words, picks and lists
# ---------------------------------------------------------------------------
def test_a_word_takes_its_answer_give_or_take_a_few_words():
    assert match.grade('word', 'The effector.', 'effector', None) is True
    assert match.grade('word', 'It doubles.', 'it doubled', None) is True
    assert match.grade('word', 'It doubles.', 'halves', None) is False
    assert match.grade('word', 'A minor.', 'a minor', None) is True
    assert match.grade('word', 'A minor.', 'C minor', None) is False


def test_a_not_in_front_cancels_an_idea():
    keys = {'keys': [['index error', 'indexerror']]}
    assert match.grade('sentence', 'It raises IndexError.', 'it raises an index error', keys) is True
    assert match.grade('sentence', 'It raises IndexError.', 'it does not raise an index error', keys) is False


def test_a_sentence_needs_every_key_idea():
    keys = {'keys': [['index error', 'indexerror'], ['5']]}
    answer = 'It raises IndexError, the valid indices are 0 to 5.'
    assert match.grade('sentence', answer, 'An IndexError, because 5 is the last index', keys) is True
    assert match.grade('sentence', answer, 'An IndexError', keys) is False
    assert match.grade('sentence', answer, 'An IndexError', {**keys, 'need': 1}) is True


def test_a_choice_is_one_option_and_not_both():
    grading = {'choices': ['Homologous', 'Analogous']}
    assert match.grade('choice', 'Analogous', 'Analogous', grading) is True
    assert match.grade('choice', 'Analogous', 'Homologous', grading) is False
    assert match.grade('choice', 'Analogous', 'homologous and analogous', grading) is False
    assert skill_check.refusal('choice', 'Maybe', grading) is not None
    assert skill_check.refusal('choice', 'Analogous', grading) is None


def test_a_rejected_word_makes_an_answer_wrong():
    grading = {'accept': ['dolly'], 'reject': ['zoom']}
    assert match.grade('word', 'A dolly.', 'dolly', grading) is True
    assert match.grade('word', 'A dolly.', 'dolly or zoom', grading) is False


def test_a_list_has_every_item_and_nothing_else():
    notes = {'keys': [['c'], ['d'], ['e'], ['g'], ['a']]}
    assert match.grade('list', 'C, D, E, G, A', 'C D E G A', notes) is True
    assert match.grade('list', 'C, D, E, G, A', 'A, G, E, D, C', notes) is True
    assert match.grade('list', 'C, D, E, G, A', 'C, D, E, F, G, A', notes) is False
    assert match.grade('list', 'C, D, E, G, A', 'A, G, E, D, C', {**notes, 'order': True}) is False


def test_a_list_of_numbers_goes_by_value():
    assert match.grade('list', '[1, 2, 3, 4, 7, 9].', '1,2,3,4,7,9', {'order': True}) is True
    assert match.grade('list', '[1, 2, 3, 4, 7, 9].', '1,2,3,4,9,7', {'order': True}) is False
    assert match.grade('list', '0°, 30°, 150°, 180°', '180, 0, 30, 150', None) is True


def test_code_ignores_spacing_and_quote_marks():
    grading = {'accept': ["items[len(items) - 1]", 'items[-1]']}
    assert match.grade('code', 'items[-1].', 'items[ -1 ]', grading) is True
    assert match.grade('code', 'items[-1].', 'items[len(items)-1]', grading) is True
    assert match.grade('code', 'items[-1].', 'items[0]', grading) is False


def test_a_number_said_with_words_is_marked_on_the_number():
    assert skill_check.grade_as('integer', 'About 20.', '20') is True
    assert skill_check.grade_as('integer', 'About 20.', '21') is False


def test_malformed_grading_is_named():
    assert match.grading_failures('choice', 'Yes', {'choices': ['Yes']})
    assert match.grading_failures('word', 'Dorian', {'accept': 'dorian'})
    assert match.grading_failures('sentence', 'x', {'keys': [['a b']], 'need': 3})
    assert match.grading_failures('word', 'Dorian.', {'accept': ['lydian']})
    assert match.grading_failures('word', 'Dorian.', {'accept': ['dorian']}) == []


# ---------------------------------------------------------------------------
# The library
# ---------------------------------------------------------------------------
def test_every_problem_in_the_library_passes_its_own_marking():
    wrong = []
    for node_id, step, problem, _ in _library():
        kind = problem.get('answer_kind') or 'phrase'
        grading = problem.get('grading') or {}
        bad = match.grading_failures(kind, problem['answer'], grading)
        if bad:
            wrong.append((node_id, step['title'], problem['slot'], bad))
            continue
        if skill_check.auto_graded(kind, problem['answer'], grading):
            # Typed the way a reader types what they see: math as plain math.
            typed = match.typed_form(kind, skill_check.shape_of(kind, problem['answer'], grading))
            if skill_check.grade_as(kind, problem['answer'], typed, grading, problem['prompt']) is False:
                wrong.append((node_id, step['title'], problem['slot'], 'its own answer is marked wrong'))
    assert wrong == []


#: Shapes marked by an accepted answer. A sentence marked by its key ideas may
#: share them with the problem next to it, which asks about the same thing.
_ACCEPTED = ('word', 'choice', 'code')


def test_no_marking_in_the_library_takes_the_next_problems_answer():
    """An accepted answer that would pass the answer to a different question
    passes anything."""
    loose = []
    for node_id, step, problem, problems in _library():
        kind = problem.get('answer_kind') or 'phrase'
        grading = problem.get('grading') or {}
        if kind not in _ACCEPTED or not skill_check.auto_graded(kind, problem['answer'], grading):
            continue
        mine = match.to_plain(problem['answer']).strip().lower()
        for other in problems:
            if other is problem:
                continue
            theirs = match.to_plain(other['answer'])
            if theirs.strip().lower() == mine or mine in theirs.lower() or theirs.lower() in mine:
                continue
            if skill_check.refusal(kind, theirs, grading):
                continue
            if match.tokens(theirs) == match.tokens(problem['answer']):
                continue
            if skill_check.grade_as(kind, problem['answer'], theirs, grading, problem['prompt']):
                loose.append((node_id, step['title'], problem['slot'], theirs[:60]))
    assert loose == []

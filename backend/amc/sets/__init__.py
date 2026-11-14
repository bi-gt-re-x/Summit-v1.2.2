r"""The Summit Mock sets: five AMC 10s, five AMC 12s and five AIMEs, written for
this site in the shape of the real papers.

Each set is a full paper in real problem order: problem n is written to sit
where problem n sits on a real contest, and is rated from its number on the
AoPS scale (backend/amc/scale.py). As on the real A and B papers, each AMC 12
set shares eight problems with the AMC 10 set of the same number, moved up
the paper the way the real shared problems move.

These are original problems, not MAA ones. tests/test_amc_sets.py recomputes
every answer by brute force or exact arithmetic.

A set file lists its problems with `P(...)`:

    P(number, topic, also, technique, statement, choices, correct, steps, insight, trap)

`choices` are the five answer choices in order and `correct` is the right
one, written exactly as in `choices`; the letter is worked out from it. An
AIME problem has `choices=None` and `correct` the integer. `steps` is the
solution without its last line: the line that states the answer is added
here, so a solution can never announce a different answer from the key.
An AMC 12 set lists a problem it shares with its AMC 10 as `S(number, amc10_number)`.
"""
import re

from backend.amc.scale import rating_at

LETTERS = 'ABCDE'

#: (level, id prefix, contest id prefix, display name).
FAMILIES = [
    ('AMC 10', 'mock10', 'mock-10', 'Summit Mock AMC 10'),
    ('AMC 12', 'mock12', 'mock-12', 'Summit Mock AMC 12'),
    ('AIME', 'mockaime', 'mock-aime', 'Summit Mock AIME'),
]
SET_COUNT = 5


def P(number, topic, also, technique, statement, choices, correct, steps, insight, trap):
    return {'number': number, 'topic': topic, 'also': list(also), 'technique': technique,
            'statement': statement, 'choices': choices, 'correct': correct, 'steps': list(steps),
            'insight': insight, 'trap': trap}


def S(number, amc10_number):
    """An AMC 12 problem that is problem `amc10_number` of the paired AMC 10."""
    return {'number': number, 'shared': amc10_number}


def _tier(rating):
    from backend.amc.solutions import tier
    return tier(rating)


def _finish(row, level, pid):
    """A bank-shaped problem from a P(...) row."""
    rating = rating_at(level, row['number'])
    steps = list(row['steps'])
    if row['choices'] is None:
        answer = int(row['correct'])
        steps.append(r'The answer is $\boxed{%03d}$.' % answer)
    else:
        assert len(row['choices']) == 5, pid
        assert row['choices'].count(row['correct']) == 1, (pid, row['correct'])
        answer = LETTERS[row['choices'].index(row['correct'])]
        value = row['correct']
        whole_math = re.fullmatch(r'\$((?:[^$\\]|\\.)*)\$', value)   # $...$, escaped \$ allowed inside
        value = whole_math.group(1) if whole_math else r'\text{%s}' % value
        steps.append(r'The answer is $\textbf{(%s)}\ %s$.' % (answer, value))
    return {
        'id': pid, 'level': level, 'topic': row['topic'], 'also': row['also'],
        'technique': row['technique'], 'statement': row['statement'], 'choices': row['choices'],
        'answer': answer, 'insight': row['insight'], 'trap': row['trap'],
        'rating': rating, 'difficulty': _tier(rating), 'solution': steps,
    }


def _load():
    from importlib import import_module
    problems, mocks = [], []
    built = {}
    for level, prefix, cid, name in FAMILIES:
        for n in range(1, SET_COUNT + 1):
            base = {'AMC 10': 'amc10', 'AMC 12': 'amc12', 'AIME': 'aime'}[level]
            try:
                module = import_module('backend.amc.sets.{}_{}'.format(base, n))
            except ModuleNotFoundError as missing:      # a set not written yet
                if missing.name != 'backend.amc.sets.{}_{}'.format(base, n):
                    raise
                continue
            ids = []
            for row in sorted(module.PROBLEMS, key=lambda r: r['number']):
                if 'shared' in row:
                    pid = built[('AMC 10', n, row['shared'])]['id']
                else:
                    pid = '{}-{}-{:02d}'.format(prefix, n, row['number'])
                    p = _finish(row, level, pid)
                    problems.append(p)
                    built[(level, n, row['number'])] = p
                ids.append(pid)
            assert [r['number'] for r in sorted(module.PROBLEMS, key=lambda r: r['number'])] == \
                list(range(1, len(ids) + 1)), (cid, n)
            mocks.append({'id': '{}-{}'.format(cid, n), 'name': '{} · Set {}'.format(name, n), 'level': level,
                          'set': n, 'family': 'summit', 'problems': ids})
    return problems, mocks


PROBLEMS, MOCKS = _load()

"""The problem bank's answers, recomputed.

Every answer that can be brute-forced is, so a typo in backend/amc/bank.py
fails here rather than marking a student wrong for being right. The rest are
checked for shape: five choices and a letter, or an integer from 0 to 999.
"""
from fractions import Fraction
from itertools import combinations, permutations, product
from math import gcd

import pytest

from backend.amc import catalog, engine
from backend.amc.bank import BY_ID, PROBLEMS


def letter(pid, value):
    """The choice letter whose text is `value`."""
    choices = BY_ID[pid]['choices']
    return 'ABCDE'[choices.index(value)]


def test_every_problem_is_well_formed():
    assert len({p['id'] for p in PROBLEMS}) == len(PROBLEMS)
    for p in PROBLEMS:
        assert p['level'] in catalog.FORMATS
        assert 1 <= p['difficulty'] <= 5
        assert p['statement'] and p['solution'] and p['insight'] and p['trap']
        if p['choices'] is None:
            assert p['level'] == 'AIME'
            assert isinstance(p['answer'], int) and 0 <= p['answer'] <= 999
        else:
            assert len(p['choices']) == 5 and len(set(p['choices'])) == 5
            assert p['answer'] in 'ABCDE'
        # No stray backslash-quote left over from escaping.
        for key in ('statement', 'solution', 'insight', 'trap'):
            assert "\\'" not in p[key], (p['id'], key)


COMPUTED = {
    'step-10-01': ('$27$', Fraction(27)),
    'step-10-06': ('$40$', sum(1 for n in range(1, 100) if (n % 3 == 0) != (n % 5 == 0))),
    'step-10-08': ('$60$', sum(1 for n in range(100, 1000)
                               if all(int(d) % 2 for d in str(n)) and len(set(str(n))) == 3)),
    'step-10-09': ('$170$', sum(map(int, str(10 ** 20 - 20)))),
    'step-10-13': ('$4$', pow(3, 100, 7)),
    'step-10-19': ('$12$', sum(1 for a in range(5) for b in range(4) for c in range(3)
                               if a % 2 == b % 2 == c % 2 == 0)),
    'step-10-21': ('$9$', sum(1 for x in range(7, 50) for y in range(7, 50) if 6 * (x + y) == x * y)),
    'step-10-23': ('$144$', sum(1 for m in range(1 << 10) if m & (m >> 1) == 0)),
    'step-12-12': ('$100$', sum(1 for a in range(1, 1001) for b in range(1, 1001)
                                if 1000 % a == 0 and (1000 // a) % b == 0)),
    'step-drill-02': ('$63$', sum(1 for n in range(1, 1000) if sum(map(int, str(n))) == 10)),
    'step-drill-04': ('$49$', pow(7, 2026, 100)),
    'step-drill-05': ('$6$', sum(1 for n in range(1, 101) if (n * n + 1) % 65 == 0)),
    'step-12-15': ('$31$', sum(1 for n in range(1, 101) if (n ** 3 - n) % 48 == 0)),
    'step-12-17': ('$21$', next(x * y for x in range(11) for y in range(11) if x + y == 10 and x ** 3 + y ** 3 == 370)),
    'step-12-18': ('$441$', sum(1 for a in range(7) for b in range(a + 1, 7) for c in range(7) for d in range(c + 1, 7))),
    'step-10-26': ('$178$', sum(1 for s in product('AB', repeat=10)
                                 if not any(s[i] == s[i + 1] == s[i + 2] for i in range(8)))),
    'step-10-27': ('$90$', sum(1 for p in permutations(range(1, 7)) if all(abs(p[i] - p[i + 1]) != 1 for i in range(5)))),
}


@pytest.mark.parametrize('pid', sorted(COMPUTED))
def test_counted_answers(pid):
    text, value = COMPUTED[pid]
    assert text == '${}$'.format(value)
    assert BY_ID[pid]['answer'] == letter(pid, text)


def test_fraction_answers():
    tri = sum(1 for a, b, c in combinations(range(1, 11), 3) if a + b > c)
    assert Fraction(tri, 120) == Fraction(5, 12)
    assert BY_ID['step-10-24']['answer'] == letter('step-10-24', r'$\frac{5}{12}$')

    der = sum(1 for p in permutations(range(6)) if all(p[i] != i for i in range(6)))
    assert Fraction(der, 720) == Fraction(53, 144)
    assert BY_ID['step-12-11']['answer'] == letter('step-12-11', r'$\frac{53}{144}$')

    two_dice = sum(1 for a in range(1, 7) for b in range(1, 7) if a * b % 3 == 0)
    assert Fraction(two_dice, 36) == Fraction(5, 9)
    assert BY_ID['step-10-10']['answer'] == letter('step-10-10', r'$\frac{5}{9}$')


AIME = {
    'step-aime-01': sum(1 for n in range(1, 1001) if n % 6 == 0 and n % 4 and n % 9),
    'step-aime-04': sum(1 for a in range(1, 100) if gcd(a, 100 - a) == 1),
    'step-aime-05': sum(1000 // 5 ** k for k in range(1, 6)),
    'step-aime-06': sum(1 for c in combinations(range(1, 10), 4)),
    'step-aime-08': (lambda f: f.numerator + f.denominator)(Fraction(78 + 6, 52 * 51 // 2)),
    'step-aime-09': sum(1 for n in range(1, 1000) if (n.bit_length() - 1) % 2 == 0),
    'step-aime-10': 6 * 7 + 6 * 8 + 7 * 8,
    'step-aime-11': pow(2, 2026, 1000),
    'step-aime-12': (lambda f: f.numerator + f.denominator)(
        Fraction(65, 8) * (Fraction(65, 8) - 2 * 4)),
    'step-aime-14': next(k for k in range(1, 200) if pow(2, k, 125) == 1),
    'step-aime-16': sum(1 for a in range(1, 51) for b in range(1, 51) if (a * a + b * b) % 13 == 0),
    'step-aime-18': ((4 ** 7 - 1) // 3) % 1000,
    'step-aime-15': sum(1 for m in range(1 << 9) if sum(i + 1 for i in range(9) if m >> i & 1) % 3 == 0),
}


@pytest.mark.parametrize('pid', sorted(AIME))
def test_aime_answers(pid):
    assert BY_ID[pid]['answer'] == AIME[pid]


def test_the_harder_problems_by_computation():
    import cmath
    import math

    # step-10-28: the frog lands on 7.
    p = [Fraction(1), Fraction(1, 2)]
    for _ in range(2, 8):
        p.append(p[-1] / 2 + p[-2] / 2)
    assert BY_ID['step-10-28']['answer'] == letter('step-10-28', r'$\frac{%d}{%d}$' % (p[7].numerator, p[7].denominator))

    # step-12-13: sign changes of sin x - x/30 on [-31, 31], counting x = 0 once.
    xs = [i / 2000 for i in range(-62000, 62001)]
    vals = [math.sin(x) - x / 30 for x in xs]
    crossings = sum(1 for a, b in zip(vals, vals[1:]) if a == 0 or a * b < 0)
    assert '$%d$' % crossings == BY_ID['step-12-13']['choices']['ABCDE'.index(BY_ID['step-12-13']['answer'])]

    # step-12-14: the same value for every 7th root of unity but 1.
    for k in range(1, 7):
        z = cmath.exp(2j * math.pi * k / 7)
        assert abs(abs(1 + z + z ** 2 + z ** 4) ** 2 - 2) < 1e-9
    assert BY_ID['step-12-14']['answer'] == letter('step-12-14', '$2$')

    # step-12-16: run the recursion.
    a = 1.0
    for _ in range(99):
        a += 1 / a
    assert BY_ID['step-12-16']['answer'] == letter('step-12-16', '$%d$' % (2 * round(a / 2)))

    # step-aime-17: P(HHH before THT) = 5/12 by simulation of the exact chain.
    states = {'': 0, 'H': 0, 'HH': 0, 'T': 0, 'TH': 0}
    prob = dict.fromkeys(states, Fraction(1, 2))
    for _ in range(200):
        prob = {
            '': (prob['H'] + prob['T']) / 2, 'H': (prob['HH'] + prob['T']) / 2,
            'HH': (1 + prob['T']) / 2, 'T': (prob['TH'] + prob['T']) / 2, 'TH': prob['HH'] / 2,
        }
    assert abs(float(prob['']) - 5 / 12) < 1e-12
    assert BY_ID['step-aime-17']['answer'] == 5 + 12


def test_grading_normalizes_answers():
    choice = BY_ID['step-10-01']
    assert engine.is_correct(choice, 'd') and engine.is_correct(choice, ' D ')
    assert not engine.is_correct(choice, '') and not engine.is_correct(choice, 'Z')
    aime = BY_ID['step-aime-01']
    assert engine.is_correct(aime, '055') and engine.is_correct(aime, 55)
    assert not engine.is_correct(aime, '56')


def test_mocks_are_full_contests():
    for mock in catalog.MOCKS:
        assert len(mock['problems']) == catalog.FORMATS[mock['level']]['count']
        assert len(set(mock['problems'])) == len(mock['problems'])


def test_past_contests_cover_every_sitting():
    names = {c['name'] for c in catalog.PAST}
    assert '2000 AMC 10' in names and '2002 AMC 10A' in names
    assert '2021 Fall AMC 12B' in names and '2021 Spring AMC 10A' in names
    assert '2025 AIME II' in names
    assert len({c['id'] for c in catalog.PAST}) == len(catalog.PAST)


def test_every_problem_has_an_aops_rating_and_a_matching_tier():
    from backend.amc.solutions import tier
    for p in PROBLEMS:
        assert 1 <= p['rating'] <= 10 and (p['rating'] * 2) == int(p['rating'] * 2), p['id']
        assert p['difficulty'] == tier(p['rating'])


def test_every_solution_is_steps_ending_on_the_answer():
    for p in PROBLEMS:
        steps = p['solution']
        assert isinstance(steps, list) and len(steps) >= 2, p['id']
        assert all(isinstance(s, str) and s.strip() for s in steps), p['id']
        last = steps[-1]
        if p['choices']:
            assert '\\textbf{(%s)}' % p['answer'] in last, (p['id'], last)
            # Only the right letter is announced.
            others = [x for x in 'ABCDE' if x != p['answer'] and '\\textbf{(%s)}' % x in last]
            assert not others, p['id']
        else:
            assert '\\boxed{%03d}' % p['answer'] in last, (p['id'], last)
        for s in steps:
            assert "\\'" not in s, p['id']
            assert s.count('$') % 2 == 0 or '\\$' in s, (p['id'], s)


def test_official_positions_follow_the_aops_bands():
    from backend.amc import official
    assert [official.rating_at('AMC 10', n) for n in (1, 6, 11, 16, 21, 25)] == [1, 1.5, 2, 2.5, 3, 4]
    assert [official.rating_at('AMC 12', n) for n in (1, 10, 20, 25)] == [1, 2, 3.5, 4.5]
    assert [official.rating_at('AIME', n) for n in (1, 4, 7, 11, 15)] == [2.5, 3.5, 4, 5, 6.5]
    for level, table in official.RATING_BY_NUMBER.items():
        assert len(table) == {'AIME': 15}.get(level, 25)
        assert table == sorted(table), level            # never easier further in
        assert all(1 <= r <= 10 and r * 2 == int(r * 2) for r in table)


def test_every_rating_is_on_the_one_to_ten_scale():
    for p in PROBLEMS:
        assert 1 <= p['rating'] <= 10 and p['rating'] * 2 == int(p['rating'] * 2), p['id']


def test_mocks_run_in_rating_order():
    for mock in catalog.MOCKS:
        ratings = [BY_ID[pid]['rating'] for pid in mock['problems']]
        assert ratings == sorted(ratings), mock['id']

"""Step three of the goal matcher: one cheap, stable form for every title."""
import pytest

from backend.goal_matcher import normalize as norm
from backend.goal_matcher.normalize import ABBREVIATIONS, normalize, words


@pytest.mark.parametrize('raw, plain', [
    # The example the design names.
    ('AMC 8 Geometry Practice #4', 'amc 8 geometry practice 4'),
    # Punctuation and separators people put in titles.
    ('Geometry—practice / set_2 | review: ch.3', 'geometry practice set 2 review ch 3'),
    ('  lots   of\tspace\n', 'lot of space'),
    ('AMC 8 24+', 'amc 8 24'),
    # Letters and digits run together are the same words written apart.
    ('AMC8 prep', 'amc 8 prep'),
    ('USACO silver P3', 'usaco silver p 3'),
    # ...except an ordinal, which is one word.
    ('Read the 7th chapter', 'read the 7th chapter'),
    # An apostrophe joins rather than splits, and the possessive then folds
    # like a plural, so "Euler's" and "Euler" are one word.
    ("Euler's formula", 'euler formula'),
    ('Euler’s formula', 'euler formula'),
    # Plurals fold to one form, so a goal's "models" is a task's "model".
    ('Transformer models', 'transformer model'),
    ('Open-source contributions', 'open source contribution'),
    ('Number theories', 'number theory'),
    ('Glasses and processes', 'glass and process'),
    # ...but short words, words ending -ss/-us/-is, and listed words are kept.
    ('Physics analysis of gas: does it pass', 'physic analysis of gas does it pass'),
    ('Calculus bonus', 'calculus bonus'),
    ('Problems and exercises', 'problems and exercises'),
    # Accents are not a different word.
    ('Étude in E minor', 'etude in e minor'),
    # Names whose punctuation is the name.
    ('Learn C++ templates', 'learn cpp template'),
    ('Unity scripting (C#)', 'unity scripting csharp'),
    # Abbreviations, whole words only.
    ('Calc HW 5', 'calculus homework 5'),
    ('geom prac', 'geometry practice'),
    ('ML reading', 'machine learning reading'),
    ('Algorithms', 'algorithm'),  # "alg" inside a word is left alone
    ('', ''),
    (None, ''),
    ('!!! — ###', ''),
])
def test_titles_normalise_to_plain_words(raw, plain):
    assert normalize(raw) == plain


def test_the_same_thing_written_differently_is_the_same():
    variants = ['AMC 8 geometry', 'amc8 Geometry', 'AMC-8: geometry', '  AMC_8   GEOMETRY ']
    assert {normalize(v) for v in variants} == {'amc 8 geometry'}


@pytest.mark.parametrize('raw', [
    'AMC 8 Geometry Practice #4', "Euler's C++ calc HW (C#)", 'Étude—7th, AMC8', 'ml hw',
])
def test_normalising_twice_changes_nothing(raw):
    once = normalize(raw)
    assert normalize(once) == once


def test_no_expansion_is_itself_an_abbreviation():
    """Otherwise normalising twice would expand twice."""
    for expansion in ABBREVIATIONS.values():
        assert not set(expansion.split()) & set(ABBREVIATIONS)


def test_words_are_the_normalised_words_in_order():
    assert words('Calc HW: related rates, calc') == (
        'calculus', 'homework', 'related', 'rate', 'calculus')


def test_it_is_memoised_so_a_repeated_title_costs_nothing():
    norm.normalize.cache_clear()
    for _ in range(50):
        normalize('AMC 8 Geometry Practice #4')
    info = norm.cache_info()
    assert (info.misses, info.hits) == (1, 49)


def test_the_memo_is_bounded():
    assert norm.normalize.cache_info().maxsize == norm._CACHE_SIZE


def test_it_is_cheap_enough_to_run_on_every_write():
    """Twenty thousand distinct titles, uncached, well inside a second."""
    import time
    norm.normalize.cache_clear()
    titles = ['AMC {} Geometry Practice #{} — review/set_{}'.format(i % 12, i, i) for i in range(20000)]
    started = time.perf_counter()
    for title in titles:
        norm.normalize.__wrapped__(title)
    assert time.perf_counter() - started < 1.0

"""Turn a task or goal title into the plain words the matcher compares.

    normalize("AMC 8 Geometry Practice #4")  →  "amc 8 geometry practice 4"

Cheap on purpose: a handful of string passes, no regex backtracking, no model.
It runs once when a task is written, not while anything renders, and it is
memoised because the same titles come back constantly — a goal's name is
normalised for every task compared against it, and recurring tasks share
titles.

What it does, in order:

  1. Apostrophes removed without a gap ("Euler's" → "eulers"), since a space
     would leave a stray "s" behind. First, because step 2 would turn a curly
     one into a space.
  2. Unicode folded to plain ASCII where it has an equivalent ("Étude" →
     "etude"), so an accent is not a different word. Lowercased.
  3. A few names whose punctuation *is* the name kept as words before the
     punctuation goes: "C++" → "cpp", "C#" → "csharp". Otherwise both would
     become "c", which is also every other one-letter token.
  4. Every other character that is not a letter or digit becomes a space.
     That covers punctuation and the separators people put in titles: - _ / |
     : · – — and the rest.
  5. Letters and digits run together are split, so "AMC8" and "AMC 8" are
     the same two words. Ordinals are left whole ("7th"), since "th" on its
     own is nothing.
  6. Whitespace collapsed.
  7. A short list of abbreviations expanded, whole words only ("hw" →
     "homework", "prac" → "practice"), so the same thing written two ways is
     one word. Deliberately short: an expansion that guesses ("comp" —
     competition or computer?) is worse than none.
  8. Plurals folded to one form ("contributions" → "contribution", "theories"
     → "theory"), so a goal's "models" is a task's "model". Crude on purpose —
     it only has to turn both spellings into the *same* word, not the right
     one — and it skips every word already on a list in config.py.

It is idempotent: normalising a normalised string changes nothing.
"""
import re
import unicodedata
from functools import lru_cache
from typing import Tuple

from backend.goal_matcher.config import GENERIC, IGNORED, WEAK

# Every word the matcher has an opinion about. Plural folding leaves these
# alone, so "does" stays "does" rather than becoming "doe".
_LISTED = IGNORED | GENERIC | WEAK

# Kept before punctuation is stripped. Lowercase keys, matched as whole tokens
# of the lowercased text so "c++" in "learn c++ basics" becomes "cpp" and the
# "c" of "abc" is left alone.
_SYMBOL_NAMES = {
    'c++': 'cpp',
    'c#': 'csharp',
    'f#': 'fsharp',
    '.net': 'dotnet',
}

# Whole-word expansions, applied after everything else. Each is one a student
# actually writes and each has only one reading.
ABBREVIATIONS = {
    'hw': 'homework',
    'prac': 'practice',
    'qs': 'questions',
    'probs': 'problems',
    'geom': 'geometry',
    'alg': 'algebra',
    'calc': 'calculus',
    'chem': 'chemistry',
    'bio': 'biology',
    'phys': 'physics',
    'lit': 'literature',
    'vocab': 'vocabulary',
    'lc': 'leetcode',
    'cf': 'codeforces',
    'ml': 'machine learning',
}

_APOSTROPHES = "'’‘`"

# What may sit around a symbol name and still leave it whole: "(C++)" and
# "C#," are the name.
_WRAPPING = '()[]{},;:!?"'

_RUNS = re.compile(r'[a-z]+|[0-9]+')
_ORDINAL = re.compile(r'[0-9]+(st|nd|rd|th)')

# The memo is bounded: titles are short, and a few thousand of them is well
# under a megabyte, where an unbounded cache over a long-running server would
# only ever grow.
_CACHE_SIZE = 4096


def _fold(text: str) -> str:
    """Accents off, and anything with no ASCII form dropped to a space."""
    decomposed = unicodedata.normalize('NFKD', text)
    return ''.join(
        ch if ord(ch) < 128 else ' '
        for ch in decomposed
        if not unicodedata.combining(ch))


@lru_cache(maxsize=_CACHE_SIZE)
def normalize(text: str) -> str:
    """The plain-words form of `text`. Empty for None or nothing."""
    if not text:
        return ''
    # Apostrophes first: the fold below turns a curly one into a space,
    # which would split "Euler’s" into "euler s".
    text = str(text)
    for mark in _APOSTROPHES:
        text = text.replace(mark, '')
    lowered = _fold(text).lower()

    tokens = []
    for raw in lowered.split():
        name = _SYMBOL_NAMES.get(raw.strip(_WRAPPING))
        tokens.append(name if name else raw)
    lowered = ' '.join(tokens)

    plain = ''.join(ch if ch.isalnum() else ' ' for ch in lowered)
    out = []
    for word in plain.split():
        if word.isalpha() or word.isdigit() or _ORDINAL.fullmatch(word):
            out.extend(ABBREVIATIONS.get(word, word).split())
        else:
            for run in _RUNS.findall(word):
                out.extend(ABBREVIATIONS.get(run, run).split())
    return ' '.join(_singular(word) for word in out)


def _singular(word: str) -> str:
    """One form for a word and its plural. Never ends in a foldable "s"."""
    if len(word) <= 3 or not word.isalpha() or word in _LISTED or not word.endswith('s'):
        return word
    if word.endswith('ies'):
        return word[:-3] + 'y'
    if word.endswith('sses'):
        return word[:-2]
    if word.endswith(('ss', 'us', 'is')):
        return word
    return word[:-1]


def words(text: str) -> Tuple[str, ...]:
    """The words of `text`, normalised, in order. Repeats are kept."""
    return tuple(normalize(text).split())


def cache_info():
    """Hits and misses, for the matcher's metrics."""
    return normalize.cache_info()


# ---------------------------------------------------------------------------
# What a word is worth to the matcher
# ---------------------------------------------------------------------------
# The tiers themselves are word lists in config.py; this only sorts a word
# into one.

# 'key' is a word that says what something is about: "aime", "violin",
# "usaco". Everything else is weaker, down to 'ignored', which is not
# evidence of anything.
KINDS = ('key', 'weak', 'number', 'generic', 'ignored')


@lru_cache(maxsize=_CACHE_SIZE)
def kind_of(word: str) -> str:
    """Which tier a normalised word falls in."""
    if not word or word in IGNORED:
        return 'ignored'
    if word.isdigit():
        return 'number'
    if _ORDINAL.fullmatch(word):
        return 'weak'
    # One letter is never a word worth matching on: the "i" of "AIME I", the
    # "v" of "v2" and the "p" of "P3" are all noise on their own.
    if len(word) == 1:
        return 'ignored'
    if word in GENERIC:
        return 'generic'
    if word in WEAK:
        return 'weak'
    return 'key'


def kept(tokens):
    """The words that can be evidence of anything, in order."""
    return tuple(word for word in tokens if kind_of(word) != 'ignored')


def key_pairs(tokens):
    """Adjacent pairs, ignored words skipped, that include a key word.

    "Reach USACO Gold" gives ("reach", "usaco") and ("usaco", "gold"); "AMC 10
    practice" gives ("amc", "10"). A pair of two weak words — "rating 2000" —
    is left out, because "chess rating 2000" is not a Codeforces goal.
    """
    words = kept(tokens)
    return frozenset(
        (a, b) for a, b in zip(words, words[1:])
        if 'key' in (kind_of(a), kind_of(b)))

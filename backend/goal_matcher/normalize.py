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

It is idempotent: normalising a normalised string changes nothing.
"""
import re
import unicodedata
from functools import lru_cache
from typing import Tuple

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
            out.append(ABBREVIATIONS.get(word, word))
        else:
            out.extend(ABBREVIATIONS.get(run, run) for run in _RUNS.findall(word))
    return ' '.join(out)


def words(text: str) -> Tuple[str, ...]:
    """The words of `text`, normalised, in order. Repeats are kept."""
    return tuple(normalize(text).split())


def cache_info():
    """Hits and misses, for the matcher's metrics."""
    return normalize.cache_info()

"""The skill check: a short quiz that proves a node is mastered.

## The shape

Three to five of the node's written problems, one screen each. Pass and the
tile is mastered (backend/tracking/skill_progress.py); miss and the problems
still count, because every answer is also a row in `skill_attempts` and moves
the step's level.

## Which problems

One per step, spread across the programme, so a check on a five-step node
touches all five and one on a nine-step node samples the ladder rather than
the first five rungs. A node with fewer steps than CHECK_SIZE takes a second
problem from its harder steps. Within a step, core and stretch come before
warmup (a warmup is the easy way in, not proof), and anything asked on the last
try comes last, so a retake is a different check. In step order, so the check
climbs.

## Grading

A written answer is a sentence more often than a number, and a sentence cannot
be marked by string comparison without marking right answers wrong. So:

    the answer is one number      graded here, on the number the reader typed
    (with a unit or %, or not)    ("15.", "-60 kJ.", "3/4", "60%")

    anything else                 the reader sees the worked answer and says
                                  whether theirs matched

The same split Khan Academy's free-response items make between a numeric
input and a self-graded one. A number is compared exactly where the answer is
a whole number, and to the answer's own last decimal place where it is not, so
24.73 accepts 24.734 and 15 does not accept 15.4. A fraction accepts a decimal
that is right to the places typed (1/6 takes 0.17 or 0.1667, not 0.2).

PASS_SHARE of the questions right passes: 3 of 3, 3 of 4, 4 of 5.
"""
import math
import random
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

#: Questions in a check, when the node has that many problems.
CHECK_SIZE = 5
#: Fewer problems than this and a node has no check.
CHECK_MIN = 3
#: The share right that passes, rounded up.
PASS_SHARE = 0.75

WEIGHT_ORDER = {'warmup': 0, 'core': 1, 'stretch': 2}


def pass_mark(asked: int) -> int:
    return max(1, math.ceil(PASS_SHARE * asked))


# --------------------------------------------------------------------------
# Choosing
# --------------------------------------------------------------------------
def problem_key(ordinal: Any, slot: Any) -> str:
    return '{}:{}'.format(int(ordinal), int(slot))


def pick(steps: Sequence[Dict[str, Any]], recent: Sequence[str] = (),
         rng: Optional[random.Random] = None) -> List[Dict[str, Any]]:
    """The check's questions: `[{ordinal, slot, weight}]`, in step order.

    `steps` is a node's programme as backend/tracking/skillsteps reads it
    (each with `ordinal` and `problems`). `recent` is the problem keys asked
    on the last try. Empty when the node has fewer than CHECK_MIN problems.
    """
    rng = rng or random.Random()
    usable = sorted((step for step in steps if step.get('problems')), key=lambda s: s['ordinal'])
    total = sum(len(step['problems']) for step in usable)
    if total < CHECK_MIN:
        return []
    size = min(CHECK_SIZE, total)
    seen = set(recent)

    if len(usable) >= size:
        last = len(usable) - 1
        order = [usable[round(index * last / (size - 1))] for index in range(size)]
    else:
        # Every step once, then the harder steps again until the check is full.
        order = list(usable)
        extra = sorted(usable, key=lambda s: -s['ordinal'])
        while len(order) < size:
            for step in extra:
                if len(order) >= size:
                    break
                taken = sum(1 for one in order if one is step)
                if taken < len(step['problems']):
                    order.append(step)

    used = set()
    chosen = []
    for step in order:
        left = [one for one in step['problems'] if problem_key(step['ordinal'], one['slot']) not in used]
        if not left:
            continue

        def rank(problem):
            key = problem_key(step['ordinal'], problem['slot'])
            return (key in seen, problem.get('weight') == 'warmup')

        best = min(rank(one) for one in left)
        problem = rng.choice([one for one in left if rank(one) == best])
        used.add(problem_key(step['ordinal'], problem['slot']))
        chosen.append({'ordinal': int(step['ordinal']), 'slot': int(problem['slot']),
                       'weight': problem.get('weight') or 'core'})
    chosen.sort(key=lambda one: (one['ordinal'], WEIGHT_ORDER.get(one['weight'], 1), one['slot']))
    return chosen


# --------------------------------------------------------------------------
# Grading
# --------------------------------------------------------------------------
#: Units an auto-graded answer may carry. Kept to measurements: a word after a
#: number that is not one of these ("3 tens", "2 pi", "8 bars") changes what
#: the number means, so that answer is self-graded.
UNITS = frozenset('''
% cm mm m km in ft yd mi kg g mg lb oz s ms sec secs second seconds min mins
minute minutes h hr hrs hour hours day days week weeks year years v mv a ma w kw
j kj cal kcal n kn pa kpa atm hz khz mhz nm um l ml mol k c f deg degree degrees
° °c °f bpm db mph kph rpm px kb mb gb
'''.split())

_SPACES = re.compile(r'[\s   ]+')
_NUMBER = r'[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:/\d+)?'
_EXPECT = re.compile(r'^\$?(?P<num>' + _NUMBER + r')\s*(?P<unit>%|°[cf]?|[a-zµ]{1,8})?\.?$')
# A number in what the reader typed. Not inside a word ("x2"), but a unit may
# follow with no space ("3cm").
_FOUND = re.compile(r'(?<![\w.])[-+]?(?:\d{1,3}(?:,\d{3})+(?!\d)|\d+)?(?:\.\d+)?(?:/\d+)?(?!\d)')


def _clean(text: str) -> str:
    text = str(text or '').strip().lower()
    text = text.replace('−', '-').replace('–', '-').replace('−', '-')
    return _SPACES.sub(' ', text).strip()


def _value(raw: str) -> Optional[Tuple[float, int, bool]]:
    """(value, decimal places, is a fraction), or None."""
    raw = raw.replace(',', '')
    if not raw or raw in '+-' or not re.search(r'\d', raw):
        return None
    try:
        if '/' in raw:
            top, bottom = raw.split('/', 1)
            if not bottom or float(bottom) == 0 or top in ('', '+', '-'):
                return None
            return float(top) / float(bottom), 0, True
        places = len(raw.split('.', 1)[1]) if '.' in raw else 0
        return float(raw), places, False
    except ValueError:
        return None


def expected(answer: str) -> Optional[Dict[str, Any]]:
    """The number an answer is, when it is one: `{value, places, fraction,
    unit}`. None for an answer that is a sentence, a list or an expression."""
    text = _clean(answer)
    match = _EXPECT.match(text)
    if not match:
        return None
    unit = (match.group('unit') or '').strip()
    if unit and unit not in UNITS:
        return None
    found = _value(match.group('num'))
    if not found:
        return None
    value, places, fraction = found
    return {'value': value, 'places': places, 'fraction': fraction, 'unit': unit}


def gradable(answer: str) -> bool:
    return expected(answer) is not None


def grade(answer: str, given: str) -> Optional[bool]:
    """Whether `given` is right, for an answer this module can grade; None for
    one the reader has to mark. An empty or many-numbered reply is wrong."""
    want = expected(answer)
    if want is None:
        return None
    text = _clean(given).lstrip('$')
    # "x = 3" and "about 3" are both the number 3; "3 or 4" is a hedge.
    numbers = [raw for raw in _FOUND.findall(text) if re.search(r'\d', raw)]
    if len(numbers) != 1:
        return False
    found = _value(numbers[0])
    if not found:
        return False
    value, places, fraction = found
    target = want['value']
    if want['unit'] == '%' and '%' not in text and abs(value) <= 1 and abs(target) > 1:
        value *= 100
    if math.isclose(value, target, rel_tol=1e-9, abs_tol=1e-9):
        return True
    if want['fraction'] and not fraction:
        # 1/6 typed as 0.17 or 0.1667: right to the places typed, with at
        # least two, so 0.2 is not a reading of 1/6.
        return places >= 2 and abs(value - target) <= 0.5 * 10 ** -places + 1e-12
    if want['fraction'] or want['places'] == 0:
        return False
    # 24.73 accepts 24.734 (and 1/3 accepts 0.33): right to the answer's
    # own last place.
    return abs(value - target) <= 0.5 * 10 ** -want['places'] + 1e-12

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

Every answer the library can mark is marked here, and the reader only marks
their own where there is nothing to mark it by. Which is which goes by shape:

    one number                    graded here, on the number the reader typed
    (with a unit or %, or not)    ("15.", "-60 kJ.", "3/4", "60%")

    yes or no, true or false      by the first word

    math, coordinates, a list,    backend/tracking/answer_match.py: the same
    a word, a choice, code, a     value, the same items, an accepted answer, or
    sentence with key ideas       every key idea the problem names

    a sentence with no key ideas  the reader sees the worked answer and says
                                  whether theirs matched

A number is compared exactly where the answer is a whole number, and to the
answer's own last decimal place where it is not, so 24.73 accepts 24.734 and
15 does not accept 15.4. A fraction accepts a decimal that is right to the
places typed (1/6 takes 0.17 or 0.1667, not 0.2). A problem stores how it is
marked in `grading` (skill_problems.grading), and the library tests hold every
stored answer to passing its own marking.

PASS_SHARE of the questions right passes: 3 of 3, 3 of 4, 4 of 5.

## Every answer says what shape it takes

`classify` gives each problem one of KINDS: whole number, fraction, paragraph
and so on. It's stored on the problem (`skill_problems.answer_kind`), shown next
to the answer box, and `refusal` holds the reader to it before anything is
graded. A refusal isn't a miss. They see what's wanted and try again, because
typing 0.5 where a fraction was asked for says nothing about what they know.

The shape comes first and the value second, so a fraction question takes 2/4
for 1/2 and refuses 0.5, while a yes or no goes by its first word.
"""
import math
import random
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

from backend.tracking import answer_match
from backend.tracking.mathtext import has_math, to_plain, typed_plain

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
    text = typed_plain(text).strip().lower()
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


def _unmixed(text: str) -> str:
    """1 1/2 is one number, written as 3/2 so the rest only sees a fraction."""
    def whole(match):
        sign, units, top, bottom = match.group(1), int(match.group(2)), int(match.group(3)), int(match.group(4))
        return '{}{}/{}'.format(sign, units * bottom + top, bottom) if bottom else match.group(0)
    return re.sub(r'(?<![\w./])(-?)(\d+)\s+(\d+)/(\d+)(?![\w/])', whole, text)


def _numbers(text: str) -> List[str]:
    return [raw for raw in _FOUND.findall(_unmixed(text)) if re.search(r'\d', raw)]


def grade(answer: str, given: str) -> Optional[bool]:
    """Whether `given` is right, for an answer this module can grade; None for
    one the reader has to mark. An empty or many-numbered reply is wrong."""
    want = expected(answer)
    if want is None:
        return None
    text = _clean(given).lstrip('$')
    # "x = 3" and "about 3" are both the number 3; "3 or 4" is a hedge.
    numbers = _numbers(text)
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


# --------------------------------------------------------------------------
# What shape an answer takes
# --------------------------------------------------------------------------
#: The shapes, and the words a reader sees. `note` sits by the answer box and
#: `refuse` comes back when what they typed isn't that shape.
KINDS = {
    'integer': {'label': 'Whole number', 'note': 'Like 12. A unit is fine.',
                'refuse': 'This one needs one whole number, like 12.'},
    'decimal': {'label': 'Decimal', 'note': 'Like 2.5. A unit is fine.',
                'refuse': 'This one needs one decimal, like 2.5. Fractions won\'t work here.'},
    'fraction': {'label': 'Fraction', 'note': 'Like 3/4. Any equal fraction counts.',
                 'refuse': 'This one needs a fraction, like 3/4.'},
    'percent': {'label': 'Percent', 'note': 'Like 60%.',
                'refuse': 'This one needs one percent, like 60%.'},
    'expression': {'label': 'Math expression', 'note': 'Like 2x + 3 or (x + 1)/2. Use ^ for powers.',
                   'refuse': 'This one needs math, like 2x + 3. Skip the full sentence.'},
    'coordinates': {'label': 'Coordinates', 'note': 'Like (2, 3).',
                    'refuse': 'This one needs coordinates, like (2, 3).'},
    'list': {'label': 'List', 'note': 'Separate the items with commas.',
             'refuse': 'This one needs a list. Separate the items with commas.'},
    'yesno': {'label': 'Yes or no', 'note': 'Start with yes or no. You can add why.',
              'refuse': 'Start this one with yes or no.'},
    'truefalse': {'label': 'True or false', 'note': 'Start with true or false.',
                  'refuse': 'Start this one with true or false.'},
    'code': {'label': 'Code', 'note': 'Type the code itself.',
             'refuse': 'This one needs code.'},
    'choice': {'label': 'Pick one', 'note': 'Choose one of the options.',
               'refuse': 'Pick one of the options.'},
    'word': {'label': 'Word or term', 'note': 'A word or two is enough.',
             'refuse': 'Keep this one to a word or short term.'},
    'phrase': {'label': 'Short answer', 'note': 'A few words is enough.',
               'refuse': 'Keep this one short. A few words will do.'},
    'sentence': {'label': 'Full sentence', 'note': 'Write it as a sentence.',
                 'refuse': 'This one needs a full sentence.'},
    'paragraph': {'label': 'Paragraph', 'note': 'Write a few sentences.',
                  'refuse': 'This one needs a short paragraph. Write at least 15 words.'},
}

#: How many words each written shape may or must have.
WORD_MAX = 5
PHRASE_MAX = 30
SENTENCE_MIN = 4
PARAGRAPH_MIN = 15

#: Trees where a short answer with brackets in it is usually code.
_CODE_TREES = frozenset('''
coding python java web databases algorithms competitive-programming systems app-dev
game-dev cybersecurity networking spreadsheets data-science machine-learning graphs
'''.split())
_CODE_MARK = re.compile(r'\w\(|\w\.\w|\w_\w|[{};]|\bint\b|==|\w=\S|\w\[|\bfor\s\w+\sin\b')
_WRITES_CODE = re.compile(r'\s*(?:write|implement|code)\b', re.I)
_BIG_O = re.compile(r'\bO\([^)]*\)')
_ARITHMETIC = re.compile(r'[-\d\s+*/=().,×÷]*\d[-\d\s+*/=().,×÷]*[+*/=×÷-][-\d\s+*/=().,×÷]*')
_NUMBER_ONLY = re.compile(r'-?\d[\d.,/]*')
_YES_NO = re.compile(r'(?:yes|no)(?:[,.:;!\s]*$|[,.:;!]\s)', re.I)
_TRUE_FALSE = re.compile(r'true|false', re.I)
_YES = frozenset('yes y yep yeah yup'.split())
_NO = frozenset('no n nope nah'.split())
_OPEN_QUESTION = re.compile(r'^\s*(?:why|what|how|which|when|where|who|name|give|list|explain|describe)\b', re.I)
_CELL = r'(?:-?[\d./√π]+|-?[a-zA-Z]|-?\d*sqrt\(\d+\))'
_POINT = re.compile(r'^\(\s*{0}\s*(?:,\s*{0}\s*)+\)$'.format(_CELL))
_ROW = re.compile(r'^\[.*\]$|^-?\d[\d./]*(?:\s*(?:,|, and|and)\s*-?\d[\d./]*)+$')
_MANY = re.compile(r'\b(?:paragraph|(?:two|three|2|3)\s+sentences)\b', re.I)
_ONE_SENTENCE = re.compile(r'\b(?:one|1)\s+sentence\b', re.I)
_NAMES_SEVERAL = re.compile(r'^\s*(?:name|list|give)\s+(?:\w+\s+){0,2}?(?:two|three|four|five|2|3|4|5)\b', re.I)
_CONNECTORS = re.compile(r'\b(?:or|and)\b|[\s.,;:]+')


def _word_count(text: str) -> int:
    return len(re.findall(r"[\w'%-]+", to_plain(str(text or ''))))


def _first_word(text: str) -> str:
    match = re.match(r'\s*([a-zA-Z]+)', str(text or ''))
    return match.group(1).lower() if match else ''


def _only_math(answer: str) -> bool:
    """Whether a stored answer is math and nothing but: x = 3 or -3."""
    if not has_math(answer):
        return False
    rest = re.sub(r'\\\(.*?\\\)', ' ', answer)
    rest = re.sub(r'-?\d[\d.,]*', ' ', rest)
    return not _CONNECTORS.sub('', rest).strip()


def classify(prompt: str, answer: str, tree: str = '') -> str:
    """The shape a problem's answer takes, read off the answer itself. Whatever
    this says, the answer has to fit: tests hold the whole library to that."""
    asked = str(prompt or '')
    text = to_plain(str(answer or '')).strip()
    bare = text.rstrip('. ')
    found = expected(text)
    if found:
        if found['fraction']:
            return 'fraction'
        if found['unit'] == '%':
            return 'percent'
        return 'decimal' if found['places'] else 'integer'

    open_question = bool(_OPEN_QUESTION.match(asked))
    if _YES_NO.match(bare) and not open_question:
        return 'yesno'
    if _TRUE_FALSE.fullmatch(bare):
        return 'truefalse'
    if _POINT.match(bare):
        return 'coordinates'
    if _ROW.match(bare):
        return 'list'
    words = _word_count(bare)
    code_tree = tree in _CODE_TREES
    if code_tree and _WRITES_CODE.match(asked) and _CODE_MARK.search(bare):
        return 'code'
    if (_only_math(str(answer or '')) and 'mathrm' not in str(answer)) or _ARITHMETIC.fullmatch(bare):
        return 'expression'
    if code_tree and words <= 8 and _CODE_MARK.search(_BIG_O.sub('', bare)) and not re.match(r'[A-Z][a-z]+\s', bare):
        return 'code'

    if _MANY.search(asked) and words >= PARAGRAPH_MIN:
        return 'paragraph'
    if words > 20:
        return 'paragraph'
    if _ONE_SENTENCE.search(asked) and words >= SENTENCE_MIN:
        return 'sentence'
    pieces = [piece.strip() for piece in re.split(r',|;|\band\b', bare) if piece.strip()]
    short_items = all(len(piece.split()) <= 3 for piece in pieces)
    if _NAMES_SEVERAL.match(asked) and len(pieces) >= 2:
        return 'list'
    if len(pieces) >= 3 and short_items and not any(_NUMBER_ONLY.fullmatch(piece) for piece in pieces):
        return 'list'
    # "About 20" and "50 microcoulombs" want a number, marked by the reader.
    digits = _numbers(_clean(bare))
    if words <= 3 and len(digits) == 1 and not re.search(r'[:\-(]', re.sub(r'^-', '', bare)):
        found = _value(digits[0])
        if found:
            return 'fraction' if found[2] else 'decimal' if found[1] else 'integer'
    if words <= 3 and len(bare) <= 30 and not re.search(r'\d', bare):
        return 'word'
    return 'phrase' if words <= 8 else 'sentence'


def format_of(kind: str) -> Dict[str, str]:
    """What the page shows for a shape."""
    entry = KINDS.get(kind) or KINDS['phrase']
    return {'kind': kind if kind in KINDS else 'phrase', 'label': entry['label'], 'note': entry['note']}


def fits(kind: str, given: str, grading: Optional[Dict[str, Any]] = None) -> bool:
    """Whether what was typed is the shape asked for. Says nothing on whether
    it's right."""
    text = typed_plain(given).strip()
    if not text:
        return False
    if kind == 'choice':
        choices = (grading or {}).get('choices') or []
        return not choices or answer_match.matches_one(text, choices, answer_match.SLACK['choice'])
    clean = _clean(text).lstrip('$')
    if kind in ('integer', 'decimal', 'fraction', 'percent'):
        numbers = _numbers(clean)
        if len(numbers) != 1:
            return False
        found = _value(numbers[0])
        if not found:
            return False
        value, _places, fraction = found
        if kind == 'fraction':
            return fraction
        if fraction:
            return False
        if kind == 'integer':
            return math.isclose(value, round(value), abs_tol=1e-9)
        return True
    if kind == 'yesno':
        return _first_word(text) in _YES | _NO
    if kind == 'truefalse':
        return _first_word(text) in ('true', 'false', 't', 'f')
    if kind == 'coordinates':
        return len(re.findall(r'[-\w./√π]+', text)) >= 2 and ',' in text
    if kind == 'list':
        if text.startswith('['):
            return True
        return len(re.findall(r'[^,;\n]+', re.sub(r'\band\b', ',', text))) >= 2 or len(_numbers(clean)) >= 2
    words = _word_count(text)
    if kind == 'expression':
        # Math may hold a word or two ("x = 3 or -3"). A sentence isn't math.
        return bool(re.search(r'[\w√π∞]', text)) and len(re.findall(r'[a-zA-Z]{4,}', text)) <= 3
    if kind == 'word':
        return not _NUMBER_ONLY.fullmatch(text.rstrip('.')) and words <= WORD_MAX
    if kind == 'phrase':
        return words <= PHRASE_MAX
    if kind == 'sentence':
        return words >= SENTENCE_MIN
    if kind == 'paragraph':
        return words >= PARAGRAPH_MIN
    return True


def shape_of(kind: str, answer: str, grading: Optional[Dict[str, Any]] = None) -> str:
    """What a stored answer has to fit: the number it's marked on, for a number
    problem whose worked answer explains itself; otherwise the answer."""
    if kind in _NUMBER_KINDS:
        return number_answer(kind, answer, grading) or answer
    accepted = (grading or {}).get('accept') or []
    return accepted[0] if accepted else answer


def refusal(kind: str, given: str, grading: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """The message for an answer of the wrong shape, or None if it's fine."""
    if fits(kind, given, grading):
        return None
    return (KINDS.get(kind) or KINDS['phrase'])['refuse']


_NUMBER_KINDS = ('integer', 'decimal', 'fraction', 'percent')


def number_answer(kind: str, answer: str, grading: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """The number a number-shaped problem wants: the first of its accepted
    answers when it names one, so the worked answer can explain itself ("214082.
    The tens digit of 407 is 0..."), or else the answer, when it says one number
    with words around it ("About 20.", "x = 15", "50 microcoulombs.")."""
    if kind not in _NUMBER_KINDS:
        return None
    accepted = [one for one in (grading or {}).get('accept') or [] if gradable(one)]
    if accepted:
        return accepted[0]
    if gradable(answer):
        return answer
    found = _numbers(_clean(to_plain(answer)))
    return found[0] if len(found) == 1 else None


def auto_graded(kind: str, answer: str, grading: Optional[Dict[str, Any]] = None) -> bool:
    """Whether the server marks this problem, rather than asking the reader."""
    if kind in ('yesno', 'truefalse') or number_answer(kind, answer, grading):
        return True
    if gradable(answer) and kind not in ('code', 'choice', 'list', 'expression', 'coordinates'):
        return True
    return answer_match.can_grade(kind, answer, grading)


def grade_as(kind: str, answer: str, given: str,
             grading: Optional[Dict[str, Any]] = None, prompt: str = '') -> Optional[bool]:
    """Right or wrong, by the problem's shape: a number by its value, a yes or
    no by its first word, everything else by backend/tracking/answer_match.py.
    None only for a problem that has nothing to be marked by."""
    if kind == 'yesno':
        want, got = _first_word(to_plain(answer)), _first_word(given)
        right = (want in _YES and got in _YES) or (want in _NO and got in _NO)
        return right and not answer_match.rejected(given, (grading or {}).get('reject') or [])
    if kind == 'truefalse':
        return _first_word(to_plain(answer))[:1] == _first_word(given)[:1] != ''
    number = number_answer(kind, answer, grading)
    if number:
        return grade(number, given)
    # Code, picks, lists and math are marked by their own rules even when the
    # answer happens to be a number: f'{1234567:,}' wants "1,234,567", commas
    # and all, not the number 1234567.
    if kind not in ('code', 'choice', 'list', 'expression', 'coordinates'):
        found = grade(answer, given)
        if found is not None:
            return found
    return answer_match.grade(kind, answer, given, grading, prompt)

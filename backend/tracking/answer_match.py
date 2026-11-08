"""Marking an answer that is not one number.

backend/tracking/skill_check.py grades a number on the number. Everything else
used to go back to the reader: they saw the worked answer and said whether
theirs matched. That works for an honest reader and lets anybody else pass a
check by pressing "I got it". So this module marks the rest, each shape by what
it is:

    expression    the same value at several random points, so 2x + 2 takes
                  2(x + 1); an equation or inequality by its sides
    coordinates   each part by its value: (√2, 1/2) takes (1.414, 0.5)
    list          every item said, nothing extra, in order where order matters
    choice        one of the options the question offered
    word, phrase  one of the answers the problem accepts
    code          the same code once spacing and quote marks are set aside
    sentence      every key idea the problem names, said without a "not"

## What a problem says about its own marking

`grading`, stored on the problem as JSON. Every part is optional:

    accept    whole answers that count: ["dorian", "the dorian mode"]
    keys      the ideas an answer must say, each a list of ways to say it:
              [["indexerror", "index error"], ["0 to 5", "5 is the last"]]
    need      how many of `keys` must be there, when not all of them
    choices   the options shown as buttons, for a choice
    reject    words that make an answer wrong whatever else it says: the
              other option in an either/or question
    order     a list has to be in this order

A problem with nothing here is marked from its answer alone where that can be
done (a word, an expression, a list of numbers), and otherwise still goes back
to the reader. backend/tracking/skillsteps.py holds the library to marking
every problem it can.

## Words

Both sides go through the same small normalizer: lower case, no articles,
number words as digits, light stemming so "doubles" meets "doubled". A word or
phrase answer is right when an accepted answer is in it and it isn't much
longer, so "the Dorian mode" passes for "Dorian" and a paragraph that mentions
Dorian somewhere does not. A "not" or "never" just before a key idea cancels
it: "it does not double" is not "doubles".
"""
import cmath
import math
import random
import re
import unicodedata
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from backend.tracking.mathtext import to_plain, typed_plain  # noqa: F401 (to_plain is used by the tests too)

# --------------------------------------------------------------------------
# Words
# --------------------------------------------------------------------------
#: Dropped from both sides. Not "a", which is also the note A.
ARTICLES = frozenset('an the'.split())
#: What can follow the note A, so "A minor" keeps its A when cores() drops a
#: leading article.
_AFTER_A = frozenset('''major minor maj min dim diminished aug augmented sharp flat natural
string note notes blues pentatonic chord chords harmonic melodic dorian phrygian lydian
mixolydian aeolian locrian ionian scale scales m m7 maj7 7 # b'''.split())
NEGATIONS = frozenset('not no never none neither nor cannot without nothing'.split())
_NUMBER_WORDS = {
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
    'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
    'eleven': '11', 'twelve': '12', 'first': '1st', 'second': '2nd', 'third': '3rd',
    'fourth': '4th', 'fifth': '5th', 'once': '1x', 'twice': '2x', 'half': '1/2',
}
#: Spellings that mean the same thing, folded before anything is compared.
_SAME = {
    'diminished': 'dim', 'augmented': 'aug', 'major': 'maj', 'minor': 'min',
    'percent': '%', 'per cent': '%', 'okay': 'ok', '&': 'and', 'colour': 'color',
    'centre': 'center', 'practise': 'practice', 'maths': 'math', 'grey': 'gray',
    'favourite': 'favorite', 'behaviour': 'behavior', 'analyse': 'analyze',
    'organise': 'organize', 'realise': 'realize', 'recognise': 'recognize',
}
_QUOTES = str.maketrans({'‘': "'", '’': "'", '“': '"', '”': '"', '♯': '#', '♭': 'b', '–': '-', '−': '-'})
# A minus on a number is part of it ("-1/4" is not "1/4"); a hyphen inside a
# word ("x-2", "left-to-right") is not.
# An ion keeps its charge ("ca2+" is not "ca2-"); a hyphen between two words
# is still a break.
_TOKEN = re.compile(r"(?<![a-z0-9.])-?\d+\.\d+|(?<![a-z0-9])-\d+|[a-z0-9]+(?:'[a-z]+)?#?(?:\+|-(?![a-z0-9]))?|%|\+\+|==|\[\]|#|[≤≥<>≠]")
#: How many words longer than an accepted answer a reply may run.
SLACK = {'word': 3, 'phrase': 6, 'choice': 2}


def stem(token: str) -> str:
    """Enough stemming for "doubles", "doubled" and "doubling" to meet. Both
    sides go through it, so it only has to be consistent, not correct."""
    if len(token) <= 3 or not token.isalpha():
        return token
    if token.endswith('ies') and len(token) > 4:
        token = token[:-3] + 'y'
    elif token.endswith('sses'):
        token = token[:-2]
    elif token.endswith(('ches', 'shes', 'xes', 'zes')):
        token = token[:-2]
    elif token.endswith('s') and not token.endswith(('ss', 'us', 'is')):
        token = token[:-1]
    if token.endswith('ing') and len(token) > 5:
        token = token[:-3]
    elif token.endswith('ed') and len(token) > 4:
        token = token[:-2]
    if token.endswith('e') and len(token) > 4:
        token = token[:-1]
    if len(token) > 3 and token[-1] == token[-2] and token[-1] not in 'slz':
        token = token[:-1]
    return token


_GREEK_WORDS = {'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'Γ': 'gamma', 'δ': 'delta', 'Δ': 'delta',
                'θ': 'theta', 'λ': 'lambda', 'μ': 'mu', 'σ': 'sigma', 'Σ': 'sum', 'π': 'pi',
                'ρ': 'rho', 'ω': 'omega', 'φ': 'phi', 'ε': 'epsilon', 'τ': 'tau', 'χ': 'chi'}
_INFINITY = ((re.compile(r'(?:-|minus |negative )\s*(?:∞|infinity\b|inf\b)'), ' neginf '),
             (re.compile(r'(?:\+|plus |positive )\s*(?:∞|infinity\b|inf\b)'), ' posinf '),
             (re.compile(r'∞'), ' infinity '))
_NOTES = ((re.compile(r'\b([a-g]) ?flat\b'), r'\1b'), (re.compile(r'\b([a-g]) ?sharp\b'), r'\1#'))


_LATIN_SPECIAL = {'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th'}


def _latin_letter(mark: str) -> str:
    if mark in _LATIN_SPECIAL:
        return _LATIN_SPECIAL[mark]
    return ''.join(part for part in unicodedata.normalize('NFKD', mark) if not unicodedata.combining(part))


def _fold(text: str) -> str:
    text = str(text or '').translate(_QUOTES).lower()
    # Accented Latin letters lose their accents, so "estación" is one word and
    # matches "estacion" typed without them. Only the Latin range, so ≠ and
    # the Greek letters below keep their meaning.
    text = re.sub(r'[\u00c0-\u024f]', lambda found: _latin_letter(found.group(0)), text)
    text = text.replace('>=', '≥').replace('<=', '≤').replace('!=', '≠').replace('=<', '≤').replace('=>', '≥')
    text = text.replace('²', '^2').replace('³', '^3')
    for mark, word in (('∀', ' for all '), ('∃', ' there exists '), ('¬', ' not '), ('∧', ' and '),
                       ('∨', ' or '), ('→', ' implies '), ('->', ' implies ')):
        text = text.replace(mark, word)
    # Greek reads as its name, so "α + 1" and "alpha + 1" are the same words.
    for mark, name in _GREEK_WORDS.items():
        text = text.replace(mark, ' {} '.format(name))
    # 33,898 is one number.
    text = re.sub(r'(?<=\d),(?=\d{3}(?!\d))', '', text)
    for pattern, word in _INFINITY:
        text = pattern.sub(word, text + ' ').strip()
    for pattern, note in _NOTES:
        text = pattern.sub(note, text)
    # CO_2 and CO2, H_{2} and H2: a subscript digit is part of the word.
    text = re.sub(r'([a-z])_\{?(\d+)\}?', r'\1\2', text)
    # "x = - 1" is how a stored answer spaces a negative; it's still -1.
    text = re.sub(r'(^|[=(,;:≤≥<>≠])\s*-\s+(?=\d)', r'\1 -', text)
    for long, short in _SAME.items():
        if ' ' in long or not long.isalpha():
            text = text.replace(long, ' {} '.format(short))
    return text


def tokens(text: str, typed: bool = False) -> List[str]:
    """The words of an answer, normalized and stemmed, articles dropped."""
    plain = typed_plain(text) if typed else to_plain(str(text or ''))
    out = []
    for raw in _TOKEN.findall(_fold(plain)):
        raw = _SAME.get(raw, raw)
        if raw in ARTICLES:
            continue
        if raw in _NUMBER_WORDS:
            out.append(_NUMBER_WORDS[raw])
            continue
        word = stem(raw)
        out.append(_NUMBER_WORDS.get(word, word))
    return out


_BREAKS = frozenset('or and but so because then while'.split())


def _negated(token: str) -> bool:
    return token in NEGATIONS or token.endswith("n't")


def _same_word(have: str, want: str) -> bool:
    """A word matches itself, and a key of 5 letters or more also matches the
    longer words it starts: "oscillat" meets "oscillation". Only from the
    front, so "polar" never meets "nonpolar"."""
    return have == want or (len(want) >= 5 and want.isalpha() and have.startswith(want))


def _find(haystack: Sequence[str], needle: Sequence[str]) -> List[int]:
    """Every place `needle` starts in `haystack`."""
    if not needle or len(needle) > len(haystack):
        return []
    size = len(needle)
    return [at for at in range(len(haystack) - size + 1)
            if all(_same_word(haystack[at + k], needle[k]) for k in range(size))]


def says(given: Sequence[str], idea: Sequence[str]) -> bool:
    """Whether the reply says `idea`, and not straight after a "not"."""
    for at in _find(given, idea):
        if any(_negated(one) for one in idea):
            return True
        # A "not" up to 3 words back cancels the idea, unless an "or" or an
        # "and" comes between: "none or infinitely many" says both.
        before = []
        for word in reversed(given[max(0, at - 3):at]):
            if word in _BREAKS:
                break
            before.append(word)
        if not any(_negated(one) for one in before):
            return True
    return False


#: Words a reply may wrap an accepted answer in without changing it.
FILLER = frozenset(stem(word) for word in """
it its it's is are was were be been they they're them this that that's these those there there's
i i'd i'm think answer my called named would will should you you'd we our just
""".split())


def matches_one(given: str, accepted: Iterable[str], slack: int, context: Iterable[str] = ()) -> bool:
    """A short reply that is one of the accepted answers, give or take a few
    words around it. The words around it have to be filler ("it's") or come
    from the question itself ("the Dorian mode" when the question asked which
    mode), so "O(n^2)" is not "O(n)" and "from Zn to Cu" is not "Zn"."""
    said = tokens(given, typed=True)
    if not said:
        return False
    allowed = FILLER | {word for word in context if not word.isdigit()} - {'or', 'and', 'not', 'no'}
    for one in accepted:
        want = tokens(one)
        if not want:
            continue
        if said == want:
            return True
        if len(said) <= len(want) + slack and says(said, want):
            extra = list(said)
            for at in _find(said, want)[:1]:
                extra = said[:at] + said[at + len(want):]
            if all(word in allowed for word in extra):
                return True
    return False


#: How much of a question a reply may repeat before it counts as the
#: question typed back.
ECHO_SHARE = 0.7


def echoes(given: str, context: Sequence[str]) -> bool:
    """Whether a reply is mostly the question itself: it repeats ECHO_SHARE
    of the question's words and adds little of its own."""
    asked = set(context)
    if len(asked) < 5:
        return False
    said = tokens(given, typed=True)
    if not said:
        return False
    covered = len(asked & set(said)) / len(asked)
    added = len([word for word in said if word not in asked])
    if covered < ECHO_SHARE or added > max(2, len(said) // 4):
        return False
    # The question typed back keeps its order. A merge of "1, 4, 7 and 2, 3,
    # 9" reuses every number in a new order, and is an answer.
    shared = [word for word in said if word in asked]
    return _common(shared, list(context)) >= 0.8 * len(shared)


def _common(left: Sequence[str], right: Sequence[str]) -> int:
    """The longest common subsequence of two short word lists."""
    best = [0] * (len(right) + 1)
    for one in left:
        last = 0
        for at, other in enumerate(right, start=1):
            keep = best[at]
            best[at] = last + 1 if one == other else max(best[at], best[at - 1])
            last = keep
    return best[-1]


def rejected(given: str, reject: Iterable[str]) -> bool:
    said = tokens(given, typed=True)
    return any(says(said, tokens(one)) for one in reject or () if tokens(one))


_PROSE_WORDS = frozenset('the a an is are was it this that so because which with of to and or but when they its can'.split())


def _prose(text: str) -> bool:
    """Whether a reply reads as sentences rather than code."""
    words = re.findall(r"[A-Za-z']+", str(text or ''))
    if len(words) < 8:
        return False
    return sum(1 for word in words if word.lower() in _PROSE_WORDS) >= 0.25 * len(words)


def key_ideas(given: str, keys: Sequence[Sequence[str]], need: Optional[int] = None) -> bool:
    """Whether the reply says enough of the key ideas: `need` of them, or all."""
    groups = [group for group in keys or () if group]
    if not groups:
        return False
    said = tokens(given, typed=True)
    hit = sum(1 for group in groups
              if any(says(said, tokens(way)) for way in group if tokens(way)))
    return hit >= (need if need else len(groups))


# --------------------------------------------------------------------------
# Math
# --------------------------------------------------------------------------
class Unreadable(ValueError):
    """Text that isn't math this reader can follow."""


_SUPER = {'⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6',
          '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+', 'ⁿ': 'n'}
_SUB = {'₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6',
        '₇': '7', '₈': '8', '₉': '9', 'ₙ': 'n'}
_GREEK = {'π': 'pi', 'θ': 'theta', 'α': 'alpha', 'β': 'beta', 'λ': 'lambda',
          'μ': 'mu', 'σ': 'sigma', 'ω': 'omega', 'φ': 'phi', 'Δ': 'Delta', 'δ': 'delta',
          'γ': 'gamma', 'ρ': 'rho', 'τ': 'tau', 'ε': 'epsilon', '∞': 'inf'}
FUNCTIONS = {
    'arcsin': cmath.asin, 'arccos': cmath.acos, 'arctan': cmath.atan,
    'asin': cmath.asin, 'acos': cmath.acos, 'atan': cmath.atan,
    'sinh': cmath.sinh, 'cosh': cmath.cosh, 'tanh': cmath.tanh,
    'sin': cmath.sin, 'cos': cmath.cos, 'tan': cmath.tan,
    'sec': lambda z: 1 / cmath.cos(z), 'csc': lambda z: 1 / cmath.sin(z),
    'cot': lambda z: 1 / cmath.tan(z),
    'sqrt': cmath.sqrt, 'ln': cmath.log, 'log': cmath.log10, 'exp': cmath.exp,
    'abs': abs,
}
CONSTANTS = {'pi': math.pi, 'e': math.e, 'i': 1j, 'inf': float('inf'), 'infinity': float('inf')}
_NAMES = sorted(list(FUNCTIONS) + ['pi', 'theta', 'alpha', 'beta', 'lambda', 'mu', 'sigma',
                                   'omega', 'phi', 'Delta', 'delta', 'gamma', 'rho', 'tau',
                                   'epsilon', 'inf', 'infinity'], key=len, reverse=True)
RELATIONS = ('<=', '>=', '!=', '=', '<', '>')
_LEX = re.compile(r"\s*(?:(?P<num>\d+(?:\.\d+)?|\.\d+)|(?P<name>[A-Za-z]+)|(?P<op><=|>=|!=|==|\*\*|[-+*/^()\[\],=<>!|√'°]|_))")


def _group(text: str, at: int) -> Tuple[str, int]:
    """The braced group starting at `at` (which is a "{"), and where it ends."""
    depth = 0
    for spot in range(at, len(text)):
        if text[spot] == '{':
            depth += 1
        elif text[spot] == '}':
            depth -= 1
            if depth == 0:
                return text[at + 1:spot], spot + 1
    raise Unreadable('unclosed brace')


def _matrix(body: str) -> str:
    rows = [row.strip() for row in body.split('\\\\') if row.strip()]
    return '[' + ', '.join('[' + ', '.join(cell.strip() for cell in row.split('&')) + ']' for row in rows) + ']'


_LATEX_NAMES = frozenset('pi theta alpha beta lambda mu sigma omega phi delta Delta gamma rho tau epsilon'.split())
_COMMANDS = {
    'cdot': '*', 'times': '*', 'div': '/', 'le': '<=', 'leq': '<=', 'ge': '>=', 'geq': '>=',
    'ne': '!=', 'neq': '!=', 'approx': '=', 'infty': 'inf', 'left': '', 'right': '',
    ',': ' ', ';': ' ', '!': '', 'quad': ' ', 'qquad': ' ', 'circ': '', 'degree': '',
}


def delatex(text: str) -> str:
    """LaTeX that to_plain left alone (a fraction with a power inside it, say)
    as plain math: \\frac{a}{b} is ((a)/(b)), \\sqrt{a} is sqrt(a)."""
    text = str(text or '').replace('\\(', ' ').replace('\\)', ' ')
    text = text.replace('^{\\circ}', '°').replace('^\\circ', '°')
    out, at = [], 0
    while at < len(text):
        char = text[at]
        if char == '\\':
            match = re.match(r'\\([A-Za-z]+|.)', text[at:])
            name = match.group(1)
            at += len(match.group(0))
            if name in ('frac', 'dfrac', 'tfrac'):
                while at < len(text) and text[at] == ' ':
                    at += 1
                top, at = _group(text, at)
                while at < len(text) and text[at] == ' ':
                    at += 1
                bottom, at = _group(text, at)
                out.append('(({})/({}))'.format(delatex(top), delatex(bottom)))
            elif name == 'sqrt':
                index = ''
                if at < len(text) and text[at] == '[':
                    close = text.index(']', at)
                    index, at = text[at + 1:close], close + 1
                inner, at = _group(text, at)
                out.append('sqrt[{}]({})'.format(index, delatex(inner)) if index else 'sqrt({})'.format(delatex(inner)))
            elif name in ('text', 'mathrm', 'mathbf', 'operatorname', 'mathit'):
                inner, at = _group(text, at)
                out.append(' {} '.format(inner))
            elif name == 'begin':
                env, at = _group(text, at)
                end = text.index('\\end{' + env + '}', at)
                out.append(_matrix(text[at:end]) if env.endswith('matrix') else text[at:end])
                at = end + len('\\end{' + env + '}')
            elif name in _COMMANDS:
                out.append(_COMMANDS[name])
            elif name in FUNCTIONS or name in _LATEX_NAMES:
                out.append(' {} '.format(name))
            elif name.isalpha():
                # An arrow, a set, Gamma: not math this module can put a
                # number to.
                raise Unreadable(name)
        elif char == '{':
            inner, at = _group(text, at)
            out.append('({})'.format(delatex(inner)))
        else:
            out.append(char)
            at += 1
    return ''.join(out)


def _prepare(text: str) -> str:
    text = str(text or '').strip().rstrip('.').strip()
    if '\\' in text:
        text = delatex(text)
    # 2.26 × 10^6, 2.26 x 10^6 and 2.26e6 are one number; so is 2,260,000.
    text = re.sub(r'(\d)\s*[x×*]\s*10\s*\^', r'\1*10^', text)
    text = re.sub(r'(?<![a-zA-Z])(\d(?:\.\d+)?)[eE]([-+]?\d+)(?![\w.])', r'(\1*10^(\2))', text)
    text = re.sub(r'(?<=\d),(?=\d{3}(?!\d))', '', text)
    text = text.replace('−', '-').replace('–', '-').replace('×', '*').replace('·', '*').replace('÷', '/')
    text = text.replace('≤', '<=').replace('≥', '>=').replace('≠', '!=').replace('≈', '=')
    # Degrees inside a trig function are degrees: sin 30° is 1/2. Anywhere
    # else the mark goes, so "30°, 150°" and "30, 150" are the same list.
    if re.search(r'(?:sin|cos|tan|sec|csc|cot)', text):
        text = text.replace('°', ' ° ')
    else:
        text = text.replace('°', '')
    text = text.replace('\\', '')
    text = re.sub(r'\s*\+\s*-\s*', ' - ', text)
    for mark, word in _GREEK.items():
        text = text.replace(mark, ' {} '.format(word))
    run = re.compile('[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿ]+')
    text = run.sub(lambda m: '^(' + ''.join(_SUPER[c] for c in m.group(0)) + ')', text)
    text = re.sub('[₀₁₂₃₄₅₆₇₈₉ₙ]+', lambda m: '_' + ''.join(_SUB[c] for c in m.group(0)), text)
    text = text.replace('{', '(').replace('}', ')')
    return text


def _lex(text: str) -> List[Tuple[str, str]]:
    out = []
    at = 0
    text = text.rstrip()
    while at < len(text):
        match = _LEX.match(text, at)
        if not match or match.end() == at:
            raise Unreadable(text[at:at + 10])
        at = match.end()
        if match.group('num'):
            out.append(('num', match.group('num')))
        elif match.group('name'):
            word = match.group('name')
            # A run of letters is names where it spells one ("sinx" is sin x)
            # and single-letter variables otherwise ("xy" is x times y).
            spot = 0
            while spot < len(word):
                for name in _NAMES:
                    if word.startswith(name, spot) and (len(name) > 1 or name in word[spot:spot + 1]):
                        out.append(('name', name))
                        spot += len(name)
                        break
                else:
                    out.append(('name', word[spot]))
                    spot += 1
            # c1 and x0, typed with no space, are c_1 and x_0.
            digits = re.match(r'\d+(?![.\d])', text[at:])
            last = out[-1][1]
            if digits and len(last) == 1 and last not in 'ei':
                out[-1] = ('name', '{}_{}'.format(last, digits.group(0)))
                at += len(digits.group(0))
        else:
            out.append(('op', match.group('op')))
    return out


class _Parser:
    """A small Pratt parser over plain math: + - * / ^, implicit products,
    functions, √, |x|, factorials, primes and subscripts on variables, and
    tuples in brackets."""

    def __init__(self, items):
        self.items = items
        self.at = 0

    def peek(self, ahead=0):
        spot = self.at + ahead
        return self.items[spot] if spot < len(self.items) else (None, None)

    def take(self, value=None):
        item = self.peek()
        if item[0] is None or (value is not None and item[1] != value):
            raise Unreadable('expected {}'.format(value))
        self.at += 1
        return item

    def done(self):
        return self.at >= len(self.items)

    def expression(self):
        node = self.term()
        while self.peek()[1] in ('+', '-'):
            op = self.take()[1]
            node = (op, node, self.term())
        return node

    def _starts(self):
        kind, value = self.peek()
        if value == '|':
            # Inside |...| the next bar closes it; outside, a bar opens one.
            return not getattr(self, 'bars', 0)
        return kind in ('num', 'name') or value in ('(', '√', '[')

    def term(self):
        node = self.implicit()
        while self.peek()[1] in ('*', '/'):
            op = self.take()[1]
            node = (op, node, self.implicit())
        return node

    def implicit(self):
        # Written side by side binds before * and /, the way it reads:
        # dy/dx is dy over dx, and 3/2x is 3 over 2x.
        node = self.unary()
        while self._starts():
            node = ('*', node, self.power())
        return node

    def unary(self):
        if self.peek()[1] in ('-', '+'):
            op = self.take()[1]
            inner = self.unary()
            return ('neg', inner) if op == '-' else inner
        return self.power()

    def power(self):
        base = self.postfix()
        if self.peek()[1] in ('^', '**'):
            self.take()
            return ('^', base, self.unary())
        return base

    def postfix(self):
        node = self.primary()
        while self.peek()[1] in ('!', '°'):
            mark = self.take()[1]
            node = ('!', node) if mark == '!' else ('*', node, ('num', math.pi / 180))
        return node

    def primary(self):
        kind, value = self.peek()
        if kind == 'num':
            self.take()
            return ('num', float(value))
        if value == '√':
            self.take()
            return ('fn', 'sqrt', self.postfix())
        if value == '|':
            self.take()
            self.bars = getattr(self, 'bars', 0) + 1
            inner = self.expression()
            self.take('|')
            self.bars -= 1
            return ('fn', 'abs', inner)
        if value in ('(', '['):
            close = ')' if value == '(' else ']'
            self.take()
            parts = [self.expression()]
            while self.peek()[1] == ',':
                self.take()
                parts.append(self.expression())
            self.take(close)
            return parts[0] if len(parts) == 1 and close == ')' else ('tuple', parts)
        if kind == 'name':
            self.take()
            if value in FUNCTIONS:
                return self._call(value)
            name = value
            if self.peek()[1] == '_':
                self.take()
                if self.peek()[1] == '(':
                    # c_(1), from c_{1}: the subscript is part of the name.
                    self.take()
                    inside = []
                    while self.peek()[1] not in (')', None):
                        inside.append(self.take()[1])
                    self.take(')')
                    name += '_' + ''.join(inside)
                else:
                    name += '_' + self.take()[1]
            while self.peek()[1] == "'":
                self.take()
                name += "'"
            if name in CONSTANTS:
                return ('num', CONSTANTS[name])
            return ('var', name)  # may already be c_1, from "c1"
        raise Unreadable('unexpected {}'.format(value))

    def _call(self, name):
        base = root = None
        if name == 'log' and self.peek()[1] == '_':
            self.take()
            base = self.primary()
        if name == 'sqrt' and self.peek()[1] == '[':
            # sqrt[3](8), which is how a cube root reads once it is plain.
            self.take()
            root = self.expression()
            self.take(']')
        power = None
        if self.peek()[1] == '^':
            self.take()
            power = self.unary()
        if self.peek()[1] == '(':
            argument = self.primary()
        else:
            # sin 2x is sin(2x): the argument is the product that follows,
            # up to the next sign or the next function.
            argument = self.power()
            while self.peek()[0] == 'num' or (self.peek()[0] == 'name' and self.peek()[1] not in FUNCTIONS):
                argument = ('*', argument, self.power())
        if base is not None:
            node = ('log', base, argument)
        elif root is not None:
            node = ('^', argument, ('/', ('num', 1.0), root))
        else:
            node = ('fn', name, argument)
        return ('^', node, power) if power is not None else node


def parse(text: str):
    """Plain math → a tree, or Unreadable."""
    parser = _Parser(_lex(_prepare(text)))
    node = parser.expression()
    if not parser.done():
        raise Unreadable('left over')
    return node


def variables(node) -> set:
    if not isinstance(node, tuple):
        return set()
    if node[0] == 'var':
        return {node[1]}
    found = set()
    for part in node[1:]:
        if isinstance(part, list):
            for one in part:
                found |= variables(one)
        else:
            found |= variables(part)
    return found


def evaluate(node, env: Dict[str, complex]):
    kind = node[0]
    if kind == 'num':
        return node[1]
    if kind == 'var':
        return env[node[1]]
    if kind == 'neg':
        return -evaluate(node[1], env)
    if kind == 'tuple':
        return tuple(evaluate(one, env) for one in node[1])
    if kind == 'fn':
        return FUNCTIONS[node[1]](evaluate(node[2], env))
    if kind == 'log':
        return cmath.log(evaluate(node[2], env)) / cmath.log(evaluate(node[1], env))
    if kind == '!':
        value = evaluate(node[1], env)
        real = value.real if isinstance(value, complex) else value
        if abs(real - round(real)) > 1e-9 or real < 0 or real > 170:
            raise Unreadable('factorial')
        return float(math.factorial(int(round(real))))
    left, right = evaluate(node[1], env), evaluate(node[2], env)
    if isinstance(left, tuple) or isinstance(right, tuple):
        raise Unreadable('arithmetic on a tuple')
    if kind == '+':
        return left + right
    if kind == '-':
        return left - right
    if kind == '*':
        return left * right
    if kind == '/':
        return left / right
    if kind == '^':
        if not isinstance(right, complex) and float(right).is_integer() and abs(right) < 400:
            return left ** int(right)
        if not isinstance(left, complex) and not isinstance(right, complex) and left > 0:
            return left ** right
        return complex(left) ** complex(right)
    raise Unreadable(kind)


def _close(a, b) -> bool:
    if isinstance(a, tuple) or isinstance(b, tuple):
        if not (isinstance(a, tuple) and isinstance(b, tuple)) or len(a) != len(b):
            return False
        return all(_close(x, y) for x, y in zip(a, b))
    a, b = complex(a), complex(b)
    if cmath.isinf(a) or cmath.isinf(b):
        return a == b
    return abs(a - b) <= 1e-7 * max(1.0, abs(a), abs(b))


def _points(names, count=7, seed=7):
    rng = random.Random(seed)
    return [{name: rng.uniform(0.35, 2.4) for name in names} for _ in range(count)]


def same_value(a, b) -> bool:
    """Whether two math trees agree wherever the first one is defined."""
    names = sorted(variables(a) | variables(b))
    agreed = 0
    for env in _points(names):
        try:
            want = evaluate(a, env)
        except (Unreadable, ZeroDivisionError, OverflowError, ValueError, KeyError):
            continue
        try:
            got = evaluate(b, env)
        except (Unreadable, ZeroDivisionError, OverflowError, ValueError, KeyError):
            return False
        if not _close(want, got):
            return False
        agreed += 1
        if not names:
            break
    return agreed > 0


def _scaled(a, b, positive: bool) -> bool:
    """Whether a = k·b for one constant k (positive, if asked)."""
    names = sorted(variables(a) | variables(b))
    ratio = None
    seen = 0
    for env in _points(names, 9):
        try:
            x, y = complex(evaluate(a, env)), complex(evaluate(b, env))
        except (Unreadable, ZeroDivisionError, OverflowError, ValueError, KeyError, TypeError):
            continue
        if abs(x) < 1e-12 and abs(y) < 1e-12:
            seen += 1
            continue
        if abs(y) < 1e-12 or abs(x) < 1e-12:
            return False
        k = x / y
        if ratio is None:
            ratio = k
        elif not _close(k, ratio):
            return False
        seen += 1
    if seen == 0:
        return False
    if ratio is None:
        return True
    return not positive or (abs(ratio.imag) < 1e-9 and ratio.real > 0)


_FLIP = {'>': '<', '>=': '<='}


def _relations(items: List[Tuple[str, str]]):
    """Split a lexed statement on its relation marks: [side, op, side, ...]."""
    pieces, current, depth = [], [], 0
    for item in items:
        value = item[1]
        if value in ('(', '['):
            depth += 1
        elif value in (')', ']'):
            depth -= 1
        if depth == 0 and item[0] == 'op' and value in RELATIONS + ('==',):
            pieces.append(current)
            pieces.append('=' if value == '==' else value)
            current = []
        else:
            current.append(item)
    pieces.append(current)
    return pieces


def _side(items):
    parser = _Parser(items)
    node = parser.expression()
    if not parser.done():
        raise Unreadable('left over')
    return node


def _uppercase(node) -> set:
    return {name for name in variables(node) if name[:1].isupper() and name not in ('C', 'K')}


def _plain_numbers_only(node):
    """Refuse math whose value the sampling can't stand for: a product of two
    matrices (AB is not BA) or a transpose written as a power of T."""
    if not isinstance(node, tuple):
        return
    if node[0] == '*' and _uppercase(node[1]) and _uppercase(node[2]):
        raise Unreadable('a product of matrices')
    if node[0] == '^' and node[2][0] == 'var' and node[2][1] in ('T', 'H'):
        raise Unreadable('a transpose')
    for part in node[1:]:
        if isinstance(part, list):
            for one in part:
                _plain_numbers_only(one)
        else:
            _plain_numbers_only(part)


def statement(text: str):
    """One part of a math answer: ('expr', tree), or ('rel', [(op, f)...],
    sides) where each f is left minus right, written with < or <=. Arithmetic
    shown on the way to a value ("9 - 6 = 3") is that value."""
    pieces = _relations(_lex(_prepare(text)))
    sides = [_side(one) for one in pieces[0::2]]
    for side in sides:
        _plain_numbers_only(side)
    if len(pieces) == 1:
        return ('expr', sides[0])
    ops = pieces[1::2]
    if set(ops) == {'='} and not any(variables(side) for side in sides):
        return ('expr', sides[-1])
    out = []
    for at, op in enumerate(ops):
        left, right = sides[at], sides[at + 1]
        if op in _FLIP:
            left, right, op = right, left, _FLIP[op]
        out.append((op, ('-', left, right)))
    return ('rel', out, sides)


def atoms(found):
    """A statement list with every chain broken into single relations, so
    -1 <= t < 2 and "t >= -1 and t < 2" are the same two facts."""
    out = []
    for one in found:
        if one[0] == 'rel' and len(one[1]) > 1:
            for at, relation in enumerate(one[1]):
                out.append(('rel', [relation], one[2][at:at + 2]))
        else:
            out.append(one)
    return out


_JOINERS = re.compile(r'\s*(?:;|,?\s+\bor\b|,?\s+\band\b|,)\s*', re.I)


def _split_top(text: str) -> List[str]:
    """Split "x = 3 or x = -3" and "(1, 2) and (3, 4)" into their parts, but
    never inside brackets."""
    out, last = [], 0
    for match in _JOINERS.finditer(text):
        before = text[:match.start()]
        depth = before.count('(') + before.count('[') - before.count(')') - before.count(']')
        if depth == 0:
            out.append(text[last:match.start()])
            last = match.end()
    out.append(text[last:])
    return [one.strip() for one in out if one.strip()]


def statements(text: str) -> List[Any]:
    """Every part of a math answer. A bare value after an equation reuses the
    equation's left side: "x = 3 or -3" is x = 3 and x = -3."""
    parts = []
    for part in _split_top(_prepare(text)):
        # x = -1 ± √3 is two answers.
        part = re.sub(r'\+\s*/\s*-|\bplus or minus\b', '±', part)
        if '±' in part:
            parts.extend([part.replace('±', '+', 1), part.replace('±', '-', 1)])
        else:
            parts.append(part)
    out = []
    lead = None
    for part in parts:
        found = statement(part)
        if found[0] == 'rel':
            lead = found[2][0] if len(found[1]) == 1 and found[1][0][0] == '=' else None
        elif lead is not None:
            found = ('rel', [('=', ('-', lead, found[1]))], [lead, found[1]])
        out.append(found)
    return out


def _named(side) -> bool:
    """A left side that names what the answer is: y, f(x), y', x_1."""
    if side[0] == 'var':
        return True
    return side[0] == '*' and side[1][0] == 'var' and side[2][0] == 'var'


def same_statement(want, got) -> bool:
    if want[0] == 'expr' and got[0] == 'expr':
        return same_value(want[1], got[1])
    if want[0] == 'rel' and got[0] == 'expr':
        # "y = 2x + 3" answered "2x + 3", and "x = 4" answered "4".
        if len(want[1]) == 1 and want[1][0][0] == '=' and _named(want[2][0]):
            return same_value(want[2][1], got[1])
        return False
    if want[0] == 'expr' and got[0] == 'rel':
        if len(got[1]) == 1 and got[1][0][0] == '=' and _named(got[2][0]):
            return same_value(want[1], got[2][1])
        return False
    if len(want[1]) != len(got[1]):
        return False
    unused = list(got[1])
    for op, f in want[1]:
        for other in unused:
            if other[0] == op and _scaled(f, other[1], positive=op != '='):
                unused.remove(other)
                break
        else:
            return False
    return True


def _stored(answer: str) -> str:
    """A stored answer as plain math. Its LaTeX is read here rather than by
    to_plain, which flattens log_{10}25 into log_1025."""
    text = str(answer or '')
    if '\\' in text:
        try:
            return delatex(text)
        except (Unreadable, ValueError):
            # Not math it can read. to_plain's reading goes on to the parser,
            # which refuses it in turn.
            return '\u0000' + to_plain(text)
    return to_plain(text)


def typed_form(kind: str, answer: str) -> str:
    """A stored answer the way a reader would type it back: math as plain
    math, anything else as plain words. For tests that hold the library to
    passing its own marking."""
    if kind in ('expression', 'coordinates') or (kind == 'list' and number_list(answer)):
        return _stored(answer).lstrip('\u0000')
    return to_plain(answer)


def _rename(node, mapping):
    if not isinstance(node, tuple):
        return node
    if node[0] == 'var':
        return ('var', mapping.get(node[1], node[1]))
    return tuple(_rename(part, mapping) if isinstance(part, tuple)
                 else [_rename(one, mapping) for one in part] if isinstance(part, list) else part
                 for part in node)


def _names(found) -> set:
    out = set()
    for one in found:
        out |= variables(one[1]) if one[0] == 'expr' else set().union(*(variables(side) for side in one[2]))
    return out


def _matched(want, got) -> bool:
    unused = list(got)
    for one in want:
        for other in unused:
            try:
                if same_statement(one, other):
                    unused.remove(other)
                    break
            except (Unreadable, ZeroDivisionError, OverflowError, ValueError, TypeError):
                continue
        else:
            return False
    return True


def same_math(answer: str, given: str) -> Optional[bool]:
    """Whether a typed answer is the same math as the stored one. None when the
    stored answer isn't math this module can read."""
    try:
        want = statements(_stored(answer))
    except (Unreadable, ZeroDivisionError, OverflowError, ValueError, IndexError):
        return None
    if not want:
        return None
    try:
        got = statements(typed_plain(given))
    except (Unreadable, ZeroDivisionError, OverflowError, ValueError, IndexError):
        return False
    want, got = atoms(want), atoms(got)
    if len(want) != len(got):
        return False
    if _matched(want, got):
        return True
    # Constants have no fixed names: A and B are c_1 and c_2, and C is K.
    import itertools
    extra, missing = sorted(_names(got) - _names(want)), sorted(_names(want) - _names(got))
    if not extra or len(extra) != len(missing) or len(extra) > 3:
        return False
    for order in itertools.permutations(missing):
        mapping = dict(zip(extra, order))
        renamed = [(one[0], _rename(one[1], mapping)) if one[0] == 'expr'
                   else ('rel', [(op, _rename(f, mapping)) for op, f in one[1]], [_rename(side, mapping) for side in one[2]])
                   for one in got]
        if _matched(want, renamed):
            return True
    return False


def readable_math(answer: str) -> bool:
    """Whether `same_math` can mark this stored answer: it parses, and it has
    a value somewhere."""
    try:
        found = statements(_stored(answer))
    except (Unreadable, ZeroDivisionError, OverflowError, ValueError, IndexError):
        return False
    if not found:
        return False
    for one in found:
        tree = one[1] if one[0] == 'expr' else one[1][0][1]
        names = sorted(variables(tree))
        ok = False
        for env in _points(names, 5):
            try:
                evaluate(tree, env)
                ok = True
                break
            except (Unreadable, ZeroDivisionError, OverflowError, ValueError, KeyError, TypeError):
                continue
        if not ok:
            return False
    return True


def _squash(text: str) -> str:
    text = _fold(text)
    return re.sub(r"[\s.]+", '', text.replace('"', "'"))


def same_code(accepted: Iterable[str], given: str) -> bool:
    got = _squash(typed_plain(given))
    return any(got == _squash(to_plain(one)) for one in accepted if one)


# --------------------------------------------------------------------------
# Lists
# --------------------------------------------------------------------------
_ITEM_SPLIT = re.compile(r'\s*(?:[,;\n]|\band\b|\bthen\b|→|->)\s*', re.I)


def items_of(text: str) -> List[str]:
    """The items of a list, split at commas, "and", "then" and arrows, but
    never inside brackets: "(x + 3)^2 - 8, vertex (-3, -8)" is two items."""
    text = str(text or '').strip().rstrip('.').strip()
    if text.startswith('[') and text.endswith(']') and not text.startswith('[['):
        text = text[1:-1]
    out, last = [], 0
    for match in _ITEM_SPLIT.finditer(text):
        before = text[:match.start()]
        if before.count('(') + before.count('[') - before.count(')') - before.count(']') == 0:
            out.append(text[last:match.start()])
            last = match.end()
    out.append(text[last:])
    return [one.strip() for one in out if one.strip()]


def _number_of(text: str) -> Optional[complex]:
    try:
        node = parse(str(text).replace('%', ''))
        if variables(node):
            return None
        value = evaluate(node, {})
        return None if isinstance(value, tuple) else complex(value)
    except (Unreadable, ZeroDivisionError, OverflowError, ValueError, KeyError, TypeError, IndexError):
        return None


def number_list(answer: str) -> Optional[List[complex]]:
    """The stored answer as numbers, if every item is one."""
    found = [_number_of(one) for one in items_of(_stored(answer))]
    return found if len(found) >= 2 and all(one is not None for one in found) else None


_LABEL_WORD = re.compile(r'\b[A-Za-z]{2,}\b')


def _labeled_number(item: str, labels: Set[str]) -> Optional[complex]:
    """A number said with a label the question or answer uses, like "day 3"
    when the answer is "Day 3, day 7": the label words go, the number stays.
    Only whole words of 2 letters or more, so a variable like x is never
    taken for a label."""
    found = _number_of(item)
    if found is not None or not labels:
        return found
    bare = _LABEL_WORD.sub(lambda m: '' if m.group(0).lower() in labels else m.group(0), item).strip()
    return _number_of(bare) if bare and bare != item.strip() else None


def same_numbers(answer: str, given: str, order: bool, prompt: str = '') -> bool:
    want = number_list(answer) or []
    labels = {word.lower() for word in _LABEL_WORD.findall(_stored(answer) + ' ' + str(prompt or ''))}
    got = [_labeled_number(one, labels) for one in items_of(typed_plain(given))]
    if len(got) != len(want) or any(one is None for one in got):
        return False
    if order:
        return all(_close(a, b) for a, b in zip(want, got))
    left = list(got)
    for one in want:
        for other in left:
            if _close(one, other):
                left.remove(other)
                break
        else:
            return False
    return True


def same_items(groups: Sequence[Sequence[str]], given: str, order: bool, need: Optional[int]) -> bool:
    """Every item said is one of the groups, each group at most once, enough
    groups said, and in order where that matters."""
    said = items_of(typed_plain(given))
    if not said:
        return False
    if len(said) == 1 and len(groups) > 1 and all(len(tokens(way)) == 1 for group in groups for way in group):
        # "C D E G A" for five notes.
        said = said[0].split()
    hit = []
    for item in said:
        words = tokens(item, typed=True)
        found = None
        for at, group in enumerate(groups):
            if at in hit:
                continue
            for way in group:
                want = tokens(way)
                if want and (words == want or says(words, want)):
                    found = at
                    break
            if found is not None:
                break
        if found is None:
            return False
        hit.append(found)
    if len(hit) < (need if need else len(groups)):
        return False
    return not order or hit == sorted(hit)


# --------------------------------------------------------------------------
# A problem's own marking
# --------------------------------------------------------------------------
_LEAD = re.compile(r"^(?:it's|it is|it|they're|they are|they|you|he|she|this is|that's|that is)\s+", re.I)


def cores(answer: str) -> List[str]:
    """What a short stored answer accepts by itself: the answer, without a
    leading "It" and without what follows a comma or a bracket."""
    text = to_plain(str(answer or '')).strip().rstrip('.!').strip().strip('"\'')
    out = [text]
    head = re.split(r',|;|\(|\s+-\s+|:\s', text)[0].strip().rstrip('.')
    if head and head != text:
        out.append(head)
    for one in list(out):
        bare = _LEAD.sub('', one)
        if bare != one:
            out.append(bare)
    for one in list(out):
        words = one.split()
        if len(words) > 1 and words[0] == 'A' and words[1].lower().strip('.,') not in _AFTER_A \
                and not re.match(r'[#b\d]', words[1]):
            out.append(' '.join(words[1:]))
    for one in list(out):
        if re.search(r'\s+or\s+', one) and len(one.split()) <= 7:
            out.extend(piece.strip() for piece in re.split(r'\s+or\s+', one) if piece.strip())
    return list(dict.fromkeys(one for one in out if one))


def grade(kind: str, answer: str, given: str, grading: Optional[Dict[str, Any]],
          prompt: str = '') -> Optional[bool]:
    """Right or wrong for a shape that isn't a number, or None when there is
    nothing to mark it by and the reader has to. `prompt` is the question,
    whose words a short reply may repeat around its answer."""
    grading = grading or {}
    context = tokens(prompt)
    accepted_exactly = any(tokens(given, typed=True) == tokens(one) for one in grading.get('accept') or [])
    if echoes(given, context) and not accepted_exactly:
        return False
    accept = [str(one) for one in grading.get('accept') or []]
    keys = [[str(way) for way in group] for group in grading.get('keys') or []]
    need = grading.get('need')
    order = bool(grading.get('order'))
    reject = grading.get('reject') or []
    if reject and rejected(given, reject):
        return False

    if kind == 'choice':
        choices = grading.get('choices') or []
        wanted = accept or cores(answer)
        # A button sends its own words. Taken exactly, they decide, even where
        # two options differ only by case: Homo sapiens and homo Sapiens.
        exact = [one for one in choices if given.strip() == one.strip()]
        if exact:
            return exact[0].strip() in [one.strip() for one in wanted]
        # A pick is one of the buttons, so the question's words don't pad it:
        # with "-4, 1/4, -1/4 or 4" asked, "-1/4" must not read as "4".
        return matches_one(given, wanted, SLACK['choice']) and not any(
            matches_one(given, [one], SLACK['choice']) for one in choices
            if not matches_one(one, wanted, 0))

    if kind in ('expression', 'coordinates'):
        if kind == 'coordinates' and not given.strip().startswith(('(', '[')):
            given = '({})'.format(given.strip())
        found = same_math(answer, given)
        if found is None:
            found = any(same_math(one, given) for one in accept) or (
                bool(accept) and same_code(accept + [answer], given))
            if not accept:
                return None
        elif not found and accept:
            found = any(same_math(one, given) for one in accept) or same_code(accept, given)
        if found and grading.get('form'):
            found = in_form(grading['form'], accept[0] if accept else answer, given)
        if found and keys:
            found = key_ideas(given, keys, need)
        return found

    if kind == 'list':
        if keys:
            return same_items(keys, given, order, need)
        source = accept[0] if accept and number_list(accept[0]) else answer
        if number_list(source):
            return same_numbers(source, given, order, ' '.join([answer, prompt]))
        if accept:
            return matches_one(given, accept, SLACK['phrase'], context)
        return None

    if kind == 'code':
        if accept or keys:
            if same_code(accept + [answer], given):
                return True
            # Key fragments mark code, so an explanation that happens to
            # name them isn't code.
            return bool(keys) and not _prose(given) and key_ideas(given, keys, need)
        return None

    if kind in ('word', 'phrase'):
        if accept and matches_one(given, accept, SLACK[kind], context):
            return True
        if keys:
            return key_ideas(given, keys, need)
        if accept:
            return False
        if kind == 'word':
            return matches_one(given, cores(answer), SLACK['word'], context)
        return None

    if kind in ('sentence', 'paragraph'):
        if keys:
            return key_ideas(given, keys, need)
        if accept:
            return matches_one(given, accept, SLACK['phrase'], context)
        return None
    return None


def can_grade(kind: str, answer: str, grading: Optional[Dict[str, Any]]) -> bool:
    """Whether `grade` marks this problem without asking the reader."""
    grading = grading or {}
    if kind == 'choice':
        return bool(grading.get('choices'))
    if kind in ('expression', 'coordinates'):
        return readable_math(answer) or bool(grading.get('accept'))
    if kind == 'list':
        return bool(grading.get('keys') or number_list(answer) or grading.get('accept'))
    if kind == 'code':
        return bool(grading.get('accept') or grading.get('keys'))
    if kind == 'word':
        return True
    if kind in ('phrase', 'sentence', 'paragraph'):
        return bool(grading.get('accept') or grading.get('keys'))
    return False


GRADING_FIELDS = frozenset(('accept', 'keys', 'need', 'choices', 'reject', 'order', 'form'))

#: What `form` can ask of math, on top of its value. Value alone would pass a
#: "factor this" question answered with the question.
FORMS = ('product', 'expanded', 'exact', 'short', 'log', 'nofraction')


def _is_sum(node) -> bool:
    node = _top(node)
    return node[0] in ('+', '-') and len(node) == 3


def _unexpanded(node) -> bool:
    """A product, power or function of a sum somewhere inside: (x + 1)(x - 2),
    (x + 5)^2, sin(x + 60)."""
    if not isinstance(node, tuple):
        return False
    kind = node[0]
    if kind == '*' and (_is_sum(node[1]) or _is_sum(node[2])):
        return True
    if kind == '^' and _is_sum(node[1]) and node[2][0] == 'num' and float(node[2][1]).is_integer():
        return True
    if kind == 'fn' and node[1] != 'sqrt' and _is_sum(node[2]):
        return True
    return any(_unexpanded(part) for part in node[1:] if isinstance(part, tuple))


def _top(node):
    while node[0] == 'neg':
        node = node[1]
    return node


def in_form(form: str, answer: str, given: str) -> bool:
    """Whether a reply that has the right value is also written the way the
    question asked: factored, expanded, exact, no longer than the answer, or
    as one logarithm."""
    if not form:
        return True
    text = typed_plain(given)
    try:
        parts = statements(text)
    except (Unreadable, ZeroDivisionError, OverflowError, ValueError, IndexError):
        return False
    trees = [part[1] if part[0] == 'expr' else part[2][-1] for part in parts]
    if form == 'product':
        return all(_top(tree)[0] in ('*', '^') for tree in trees)
    if form == 'expanded':
        return not any(_unexpanded(tree) for tree in trees)
    if form == 'exact':
        return not re.fullmatch(r'\s*[-+]?\d*\.\d+\s*', text) and not re.search(r'\d\.\d{3,}', text)
    if form == 'log':
        return len(re.findall(r'\b(?:log|ln)', text)) == 1
    if form == 'nofraction':
        return '/' not in text and '÷' not in text
    if form == 'short':
        try:
            return len(_lex(_prepare(text))) <= len(_lex(_prepare(_stored(answer)))) + 2
        except Unreadable:
            return False
    return True


def grading_failures(kind: str, answer: str, grading: Optional[Dict[str, Any]]) -> List[str]:
    """Every way a problem's `grading` is malformed or marks its own answer
    wrong. Empty (or no grading) passes."""
    if not grading:
        return []
    if not isinstance(grading, dict):
        return ['grading:not an object']
    bad = []
    unknown = set(grading) - GRADING_FIELDS
    if unknown:
        bad.append('grading:unknown field(s) {}'.format(', '.join(sorted(unknown))))
    for name in ('accept', 'choices', 'reject'):
        value = grading.get(name)
        if value is not None and (not isinstance(value, list) or not all(isinstance(one, str) and one.strip() for one in value)):
            bad.append('grading:{} is not a list of words'.format(name))
    keys = grading.get('keys')
    if keys is not None and (not isinstance(keys, list) or not all(
            isinstance(group, list) and group and all(isinstance(way, str) and tokens(way) for way in group)
            for group in keys)):
        bad.append('grading:keys is not a list of lists of words')
    need = grading.get('need')
    if need is not None and (not isinstance(need, int) or not keys or not 1 <= need <= len(keys)):
        bad.append('grading:need is not between 1 and the number of keys')
    if kind == 'choice':
        choices = grading.get('choices') or []
        if len(choices) < 2:
            bad.append('grading:a choice needs 2 or more choices')
    if grading.get('form') and grading['form'] not in FORMS:
        bad.append('grading:form {!r} is not one of {}'.format(grading['form'], '/'.join(FORMS)))
    if bad:
        return bad
    accepted = grading.get('accept') or []
    typed = typed_form(kind, accepted[0] if accepted else answer)
    if grade(kind, answer, typed, grading) is False:
        bad.append('grading:the answer fails its own marking')
    # The worked answer and what's accepted have to agree: the reader sees
    # one and is marked on the other.
    said = tokens(answer)
    if accepted and kind in ('word', 'phrase', 'choice') and not any(
            says(said, tokens(one)) for one in accepted if tokens(one)):
        bad.append('grading:the worked answer says none of the accepted answers')
    if accepted and kind in ('integer', 'decimal', 'fraction', 'percent'):
        want = _number_of(accepted[0].rstrip('.'))
        text = to_plain(answer) + ' ' + _stored(answer)
        text = re.sub(r'([=(,:]\s*)-\s+(?=\d)', r'\1-', text)
        found = [_number_of(one) for one in re.findall(r'-?\d[\d,]*(?:\.\d+)?(?:/\d+)?', text.replace(',', ''))]
        if want is None or not any(one is not None and _close(one, want) for one in found):
            bad.append('grading:the worked answer does not say the accepted number')
    return bad

"""Math in a skill problem: LaTeX on the page, plain text everywhere else.

A problem's prompt, answer and hint are stored with their math in LaTeX, marked
off by `\\( ... \\)`, and components/SkillTree/MathText.tsx draws it with KaTeX.

    Factor \\(4z^{2} - 20z + 25\\).

## Why `\\(` and never `$`

Problems in Finance, Cooking and Career are full of dollar signs. With `$` as
the delimiter "$5 and $10" would come out as math, and no rule could tell which
dollar was which. Nothing in the library writes `\\(` as prose, so `\\(` means
math everywhere and a `$` always means money.

## Why models don't write the LaTeX

`to_latex` is run over what comes back from a model or a hand-written file. A
model that writes `\\frac` inside JSON has written a form feed followed by
"rac", which parses cleanly and draws garbage. Plain math in, and this one
converter out, means there's one way for math to go wrong and it can be tested.

## What counts as math

`to_latex` only touches trees in MATH_TREES, and only a run of words that reads
as math: an equation, a power, a function call, a fraction. It leaves a lone
number alone, since "60 degrees" reads fine as it is. When it can't tell, it
leaves the text as written, because `x^2` on a page is ugly and a sentence set
in math italics is broken.

`to_plain` goes the other way, for everything that reads the words rather than
the drawing: the grader, the content rules and search.
"""
import re

#: Trees where math gets drawn as math. Everything else keeps its text as is.
MATH_TREES = frozenset('''
algebra calculus chemistry competition-math differential-equations discrete
electronics engineering geometry linear-algebra mathematics olympiad-science
organic-chemistry physics precalculus statistics test-prep trigonometry biochemistry
'''.split())

#: Trees where a stray `i = 0` is code rather than math. Only the unmistakable
#: kinds are drawn: powers, big-O, real math symbols.
LIGHT_TREES = frozenset('''
algorithms competitive-programming graphs machine-learning data-science
'''.split())

#: Chemical formulas get subscripts in these.
CHEM_TREES = frozenset('chemistry organic-chemistry biochemistry olympiad-science'.split())

ELEMENTS = frozenset('''
H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn
Ga Ge As Se Br Kr Rb Sr Ag Cd Sn Sb I Xe Cs Ba Pt Au Hg Pb U
'''.split())

_FUNCTIONS = {
    'sin': r'\sin', 'cos': r'\cos', 'tan': r'\tan', 'cot': r'\cot', 'sec': r'\sec',
    'csc': r'\csc', 'arcsin': r'\arcsin', 'arccos': r'\arccos', 'arctan': r'\arctan',
    'sinh': r'\sinh', 'cosh': r'\cosh', 'tanh': r'\tanh', 'ln': r'\ln', 'log': r'\log',
    'exp': r'\exp', 'lim': r'\lim', 'det': r'\det', 'gcd': r'\gcd', 'max': r'\max',
    'min': r'\min',
}
#: A letter pair that reads as two variables multiplied, not as a word.
_PAIRS = frozenset('''xy xz yz ab ac bc dx dy dt du dv dA dV mx ax bx cx kx mn pq Ax Ay Bx Ab
mg mv ma vt ut gh mc IR kt rt'''.split())
#: A pair that is only math right after an operator: "v = u + at".
_AFTER_OP = frozenset('at'.split())
#: Words a probability may hold: P(A and B).
_PROB_WORDS = frozenset('and or given not'.split())
_GREEK = {'lambda': r'\lambda', 'theta': r'\theta', 'alpha': r'\alpha', 'beta': r'\beta',
          'gamma': r'\gamma', 'delta': r'\Delta', 'sigma': r'\sigma', 'omega': r'\omega',
          'mu': r'\mu', 'rho': r'\rho', 'phi': r'\phi', 'epsilon': r'\varepsilon'}
#: What a slash between these means is a unit, not a fraction: m/s, km/h, g/mol.
_UNIT_NAME = (r'(?:m|s|h|g|L|N|J|W|V|A|K|C|kg|km|cm|mm|nm|mg|ml|mL|kJ|kW|kN|kPa|Pa|Hz|min|mol|rad|'
              r'ft|in|mi|lb|oz|yd|gal|hr|sec|deg)')
_UNIT = re.compile(r'{0}(?:[\^]?[²³23])?(?:/{0}(?:[\^]?[²³23])?)?$'.format(_UNIT_NAME))
#: These are English words too, so they only count with a bracket: max(a, b).
_WORD_FUNCTIONS = frozenset(('max', 'min'))
#: A lone letter that's a variable when it stands by itself in a sentence.
_LONE = frozenset('xyzn')

_SYMBOLS = {
    '×': r'\times', '÷': r'\div', '·': r'\cdot', '≤': r'\le', '≥': r'\ge', '≠': r'\ne',
    '≈': r'\approx', '±': r'\pm', '→': r'\to', '∞': r'\infty', '∫': r'\int', '∑': r'\sum',
    'Σ': r'\Sigma', '∂': r'\partial', '∈': r'\in', '∪': r'\cup', '∩': r'\cap', '∅': r'\emptyset',
    'π': r'\pi', 'θ': r'\theta', 'α': r'\alpha', 'β': r'\beta', 'γ': r'\gamma', 'δ': r'\delta',
    'Δ': r'\Delta', 'Γ': r'\Gamma', 'λ': r'\lambda', 'μ': r'\mu', 'σ': r'\sigma', 'φ': r'\phi', 'ω': r'\omega',
    'ρ': r'\rho', 'ε': r'\varepsilon', 'τ': r'\tau', '…': r'\dots', '−': '-', '–': '-',
}
_BACK = {value: key for key, value in _SYMBOLS.items() if value.startswith('\\')}

_POWERS = str.maketrans('23', '²³')
_SUPER = str.maketrans('⁰¹²³⁴⁵⁶⁷⁸⁹⁻ⁿ', '0123456789-n')
_SUB = str.maketrans('₀₁₂₃₄₅₆₇₈₉ₙ', '0123456789n')
_SUPER_RUN = re.compile('[⁰¹²³⁴⁵⁶⁷⁸⁹⁻ⁿ]+')
_SUB_RUN = re.compile('[₀₁₂₃₄₅₆₇₈₉ₙ]+')

_MATH_CHARS = re.compile('[√²³⁴⁻₀₁₂₃₄×÷≤≥≠≈±→∞∫∑Σ∂∈∪∩πθαβγδΔΓλμσφωρε^]')
#: A unit that already reads right: "6 m/s²", "4 cm²". Left alone, so the
#: grader still sees a number and a unit.
_UNIT_POWER = re.compile(r'^[a-zA-Zµ]{1,4}(?:/[a-zA-Zµ]{1,4})?[²³]$')
_ARROW_OPS = {'->': '→', '<=': '≤', '>=': '≥', '!=': '≠'}
_OPS = frozenset('+ - − – = < > ≤ ≥ ≠ ≈ × ÷ * / ± → · <= >= != -> <-> ∈ ∪ ∩'.split())
_RELATIONS = frozenset('= < > ≤ ≥ ≠ ≈ <= >= != ∈'.split())
_MATRIX = re.compile(r'\[\[[-\d\s,.\[\]a-z/]+\]\]')
_FROZEN = re.compile(r'\\\(.*?\\\)|\\\[.*?\\\]|`[^`]*`')
#: "1 hour 20/30" is rare; these slashes never mean a fraction.
_NOT_FRACTIONS = frozenset(('24/7', '9/11', '50/50'))
_FORMULA = re.compile(r'(?:\(?(?:[A-Z][a-z]?\d*)+\)?\d*)+')


def has_math(text):
    return bool(text) and '\\(' in text


_CHEM_OPS = frozenset(('+', '->', '→', '<->', '⇌'))
_STATE = re.compile(r'\((?:s|l|g|aq)\)$')


def _chem_parts(token):
    """(coefficient, formula, charge, state) when `token` is a formula."""
    token = token.translate(_SUB)
    state = ''
    match = _STATE.search(token)
    if match:
        state = match.group(0)
        token = token[:match.start()]
    coefficient = re.match(r'\d+', token)
    number = coefficient.group(0) if coefficient else ''
    token = token[len(number):]
    charge = ''
    explicit = re.search(r'\^(\d*[+-])$', token)
    if explicit:
        charge = explicit.group(1)
        token = token[:explicit.start()]
    else:
        sign = re.search(r'(\d*)([+-])$', token)
        if sign:
            token = token[:sign.start()]
            # Al3+ has a charge of three. NO3- is three oxygens and a charge of one.
            if len(re.findall(r'[A-Z][a-z]?', token)) == 1:
                charge = sign.group(1) + sign.group(2)
            else:
                token += sign.group(1)
                charge = sign.group(2)
    if not token or not _FORMULA.fullmatch(token) or len(token) > 16:
        return None
    pieces = re.findall(r'[A-Z][a-z]?', token)
    if not pieces or any(piece not in ELEMENTS for piece in pieces):
        return None
    return number, token, charge, state


def _chem_word(token):
    """Whether a word is a chemical formula. "NaCl" has two elements and "H2" a
    count, while "Be", "He" and "CO" with nothing on them could be words."""
    parts = _chem_parts(token)
    if not parts or token.startswith('('):
        return False
    _number, formula, charge, _state = parts
    if charge:
        return True
    if re.search(r'\d', formula):
        return True
    return bool(re.search(r'[a-z]', formula)) and len(re.findall(r'[A-Z][a-z]?', formula)) >= 2


def _formula_latex(token):
    number, formula, charge, state = _chem_parts(token)
    body = re.sub(r'(?<=[A-Za-z)])(\d+)', r'_{\1}', formula)
    out = r'{}\mathrm{{{}}}'.format(number, body)
    if charge:
        out += '^{{{}}}'.format(charge)
    return out + state


def _chem_run(words):
    """A run with a formula in it: one formula, or a whole reaction."""
    words = list(words)
    head, tail = [], []
    while words and words[0] in _OPS:
        head.append(words.pop(0))
    while words and words[-1] in _OPS:
        tail.insert(0, words.pop())
    parts = []
    for word in words:
        if word in _OPS or word in _CHEM_OPS:
            parts.append(_OP_LATEX.get(word, word))
        elif _chem_parts(word):
            parts.append(_formula_latex(word))
        elif word == 'e-':
            parts.append('e^{-}')
        else:
            parts.append(word)
    return ' '.join(head + [r'\({}\)'.format(' '.join(parts))] + tail)


# --------------------------------------------------------------------------
# One math run -> LaTeX. A small scanner rather than a regex pile, because the
# fractions and powers nest and a regex can't count parentheses.
# --------------------------------------------------------------------------
class _Scan:
    def __init__(self, text):
        self.text = text
        self.at = 0

    def peek(self):
        return self.text[self.at] if self.at < len(self.text) else ''

    def done(self):
        return self.at >= len(self.text)

    def group(self, close=')'):
        """The inside of a bracket, with `self.at` just past its opener."""
        depth, start = 1, self.at
        opener = {')': '(', ']': '['}.get(close)
        while self.at < len(self.text):
            char = self.text[self.at]
            if char == opener:
                depth += 1
            elif char == close:
                depth -= 1
                if depth == 0:
                    inner = self.text[start:self.at]
                    self.at += 1
                    return inner
            self.at += 1
        raise ValueError('unbalanced')


def _power(scan):
    """What follows a `^` or `_`: one primary, or a bracket with its bracket
    dropped, since the raised position already groups it."""
    char = scan.peek()
    if char == '(':
        scan.at += 1
        return _expression(scan.group())
    if char == '{':
        scan.at += 1
        return _expression(scan.group('}'))
    match = re.match(r'[-+]?(?:\d+(?:\.\d+)?|[a-zA-Z]|[πθαβγδλμσφω])', scan.text[scan.at:])
    if not match:
        raise ValueError('nothing to raise to')
    scan.at += match.end()
    return _expression(match.group(0))


def _postfix(scan, base):
    """Powers, subscripts, factorials and primes hanging off a primary."""
    while not scan.done():
        char = scan.peek()
        if char == '^':
            scan.at += 1
            base += '^{{{}}}'.format(_power(scan))
        elif char == '_':
            scan.at += 1
            base += '_{{{}}}'.format(_power(scan))
        elif char in '²³⁴⁵⁶⁷⁸⁹⁰¹⁻ⁿ':
            run = _SUPER_RUN.match(scan.text, scan.at)
            scan.at = run.end()
            base += '^{{{}}}'.format(run.group(0).translate(_SUPER))
        elif char in '₀₁₂₃₄₅₆₇₈₉ₙ':
            run = _SUB_RUN.match(scan.text, scan.at)
            scan.at = run.end()
            base += '_{{{}}}'.format(run.group(0).translate(_SUB))
        elif char == '°':
            scan.at += 1
            base += r'^{\circ}'
        elif char in "!'":
            scan.at += 1
            base += char
        elif char == '%':
            scan.at += 1
            base += r'\%'
        else:
            break
    return base


def _primary(scan):
    """One thing: a number, a name, a bracket, a root. Returns (latex, plain),
    where `plain` is its inside when it was a bare bracket, so that a fraction
    can drop the bracket a division needed and a stacked bar doesn't."""
    char = scan.peek()
    if char == '(':
        scan.at += 1
        inner = _expression(scan.group())
        grouped = '({})'.format(inner)
        after = _postfix(scan, grouped)
        return after, (inner if after == grouped else after)
    if char == '|':
        scan.at += 1
        end = scan.text.find('|', scan.at)
        if end == -1:
            # A lone bar: "P(A|B)".
            return r'\mid ', r'\mid '
        inner = _expression(scan.text[scan.at:end])
        scan.at = end + 1
        out = _postfix(scan, '|{}|'.format(inner))
        return out, out
    if char == '√':
        scan.at += 1
        if scan.peek() == '(':
            scan.at += 1
            inside = _expression(scan.group())
        else:
            match = re.match(r'\d+(?:\.\d+)?|[a-zA-Z]', scan.text[scan.at:])
            if not match:
                raise ValueError('a root of nothing')
            scan.at += match.end()
            inside = _expression(match.group(0))
        out = _postfix(scan, r'\sqrt{{{}}}'.format(inside))
        return out, out
    if char in _SYMBOLS:
        scan.at += 1
        # μs and μk are the friction coefficients.
        if char == 'μ' and re.match(r'[sk](?![a-zA-Z])', scan.text[scan.at:]):
            scan.at += 1
            return _SYMBOLS[char] + '_{{{}}}'.format(scan.text[scan.at - 1]), _SYMBOLS[char]
        out = _postfix(scan, _SYMBOLS[char])
        return out + ' ', out + ' '
    number = re.match(r'\d[\d,]*(?:\.\d+)?|\.\d+', scan.text[scan.at:])
    if number:
        raw = number.group(0)
        # A comma that isn't a thousands mark ends the number.
        if ',' in raw and not re.fullmatch(r'\d{1,3}(?:,\d{3})+(?:\.\d+)?', raw):
            raw = raw.split(',', 1)[0]
        scan.at += len(raw)
        out = _postfix(scan, raw.replace(',', '{,}'))
        return out, out
    word = re.match(r'[a-zA-Z]+', scan.text[scan.at:])
    if word:
        return _name(scan, word.group(0))
    raise ValueError('cannot read {!r}'.format(char))


def _name(scan, word):
    lower = word.lower()
    if lower == 'sqrt' and scan.text[scan.at + 4:scan.at + 5] == '(':
        scan.at += 5
        out = _postfix(scan, r'\sqrt{{{}}}'.format(_expression(scan.group())))
        return out, out
    if lower == 'pi':
        scan.at += 2
        out = _postfix(scan, r'\pi') + ' '
        return out, out
    if lower in _GREEK:
        scan.at += len(word)
        # Gamma(2) is the function and gamma is the letter. Delta U is the one
        # exception: written either way, it means the capital.
        name = _GREEK[lower]
        if word[0].isupper() and name[1].islower():
            name = '\\' + name[1].upper() + name[2:]
        out = _postfix(scan, name) + ' '
        return out, out
    if lower == 'mod':
        scan.at += 3
        return r'\bmod ', r'\bmod '
    if lower in _PROB_WORDS:
        scan.at += len(word)
        return r'\text{{ {} }}'.format(lower), r'\text{{ {} }}'.format(lower)
    if lower in _FUNCTIONS:
        scan.at += len(word)
        out = _FUNCTIONS[lower]
        # log4 2 and log2(8): a base that lost its subscript.
        base = re.match(r'\d+', scan.text[scan.at:])
        if lower == 'log' and base:
            scan.at += base.end()
            out += '_{{{}}}'.format(base.group(0))
        out = _postfix(scan, out)
        return out + ' ', out + ' '
    if len(word) >= 3:
        if not word.isupper():
            raise ValueError('a word, not a name')
        scan.at += len(word)
        out = _postfix(scan, r'\mathrm{{{}}}'.format(word))
        return out, out
    # One letter takes the power, not the whole run: "2xy^2".
    scan.at += len(word)
    out = _postfix(scan, word)
    return out, out


_OP_LATEX = {
    '<=': r'\le', '>=': r'\ge', '!=': r'\ne', '<->': r'\leftrightarrow', '->': r'\to', '*': r'\cdot', '−': '-', '–': '-',
    '×': r'\times', '÷': r'\div', '≤': r'\le', '≥': r'\ge', '≠': r'\ne', '≈': r'\approx',
    '±': r'\pm', '→': r'\to', '·': r'\cdot', '∈': r'\in', '∪': r'\cup', '∩': r'\cap',
}
_OP = re.compile(r'<->|<=|>=|!=|->|[-+=<>*/−–×÷≤≥≠≈±→·∈∪∩,]')


def _expression(text):
    """A whole run as LaTeX. Raises ValueError for what it can't read, and the
    caller leaves that text alone."""
    scan = _Scan(text.strip())
    out = []
    ends = []
    while not scan.done():
        char = scan.peek()
        if char.isspace():
            scan.at += 1
            continue
        if char == 'x' and out and re.search(r'[\d)]\}?$', out[-1]) and re.match(
                r'x\s+[\d(A-Z]', scan.text[scan.at:]) and scan.text[scan.at - 1:scan.at].isspace():
            # "3 x 4" and "9x 10^9" are times. "4x - 9" isn't.
            scan.at += 1
            out.append(r'\times')
            ends.append(scan.at)
            continue
        op = _OP.match(scan.text, scan.at)
        if op:
            scan.at = op.end()
            token = op.group(0)
            out.append(_OP_LATEX.get(token, '{,}' if token == ',' else token))
            ends.append(-1)
            continue
        start = scan.at
        if char == 'x' and out and re.search(r'\d$', out[-1]) and re.match(r'x\s+\d', scan.text[scan.at:]):
            scan.at += 1
            out.append(r'\times')
            ends.append(scan.at)
            continue
        latex, bare = _primary(scan)
        # A division written tight is a fraction: 3/4, 1/(x + 4), dy/dx.
        # "8 / 2" keeps its slash, because it reads as a step of working.
        # sin x/cos x keeps its slash: a function can't sit alone under a bar.
        if scan.peek() == '/' and not _FUNCTION_NAME.match(
                re.match(r'[a-zA-Z]*', scan.text[scan.at + 1:]).group(0) or '0'):
            scan.at += 1
            if scan.peek().isspace() or scan.done():
                raise ValueError('a slash at the end')
            below, bare_below = _primary(scan)
            # Δx is one thing under the bar.
            if bare_below.startswith(r'\Delta') and re.match(r'[a-zA-Z]', scan.peek() or ' '):
                extra, _ = _primary(scan)
                bare_below = bare_below.rstrip() + ' ' + extra
            # What's written tight against it goes on top too: 5pi/4 is one
            # fraction, not 5 next to pi/4.
            top = ''
            if ends and ends[-1] == start:
                top = out.pop() + top
                ends.pop()
            latex = r'\frac{{{}}}{{{}}}'.format(top + (latex if top else bare), bare_below)
        out.append(latex)
        ends.append(scan.at)
    return _join(out)


def _join(parts):
    text = ''
    for part in parts:
        if part == '{,}':
            text = text.rstrip() + ', '
            continue
        spaced = part in ('+', '-', '=', '<', '>') or part.startswith(('\\leftrightarrow', '\\le', '\\ge', '\\ne', '\\to', '\\times', '\\div', '\\cdot', '\\approx', '\\pm', '\\in', '\\cup', '\\cap'))
        if spaced and text:
            text = text.rstrip() + ' ' + part + ' '
        elif spaced:
            text = part + ('' if part in '+-' else ' ')
        else:
            text += part
    return re.sub(r'\s+', ' ', text).replace(' }', '}').strip()


def _matrix(raw):
    rows = re.findall(r'\[([^\[\]]*)\]', raw[1:-1])
    body = r' \\ '.join(' & '.join(cell.strip() for cell in row.split(',')) for row in rows)
    return r'\(\begin{{bmatrix}} {} \end{{bmatrix}}\)'.format(body)


# --------------------------------------------------------------------------
# Finding the runs in a sentence
# --------------------------------------------------------------------------
_EDGE = '.,;:?!'


def _atom_kind(core, light):
    """'op', 'num', 'var' or 'term' when a word can sit in a math run, or None."""
    if core in _OPS:
        return 'op'
    if core in _ARROW_OPS:
        return 'op'
    if re.fullmatch(r'\(?[-+−]?\d[\d,]*(?:\.\d+)?[%°]?\)?', core):
        return 'num'
    if re.fullmatch(r'\(?[a-zA-Z]\)?', core):
        return 'var'
    if core.lower() in _GREEK or core == 'mod':
        return 'term' if not light else None
    if _UNIT.match(core.strip('()')):
        return None
    if not re.search(r'[0-9a-zA-Z√πθαβγδΔΓλμσφωΣ∑∫∞]', core):
        return None
    if re.search(r'[^0-9a-zA-Z.(){}^/_!\'|²³⁴⁵⁶⁷⁸⁹⁰¹⁻ⁿ₀₁₂₃₄₅₆₇₈₉ₙ°%√πθαβγδΔΓλμσφωρεΣ∑∫∞∂+\-−=<>≤≥≠≈×÷·,*]', core):
        return None
    if core.endswith(('/', '^', '_')) or core.startswith(('/', '^')):
        return None
    if _UNIT_POWER.match(core):
        return None
    # Every run of letters has to be a known name, a variable, or capitals.
    for run in re.findall(r'[a-zA-Z]+', core):
        lower = run.lower()
        if lower in _WORD_FUNCTIONS and f'{lower}(' not in core.lower():
            return None
        if lower in _FUNCTIONS or lower in ('sqrt', 'pi') or lower in _GREEK:
            continue
        if len(run) == 1:
            continue
        if run.lower() == 'o' or (len(run) == 2 and run in _PAIRS):
            continue
        if run.isupper() and len(run) <= 5 and re.search(r'[=+\-(0-9^]', core):
            continue
        if len(run) == 2 and re.fullmatch(r'\d+[a-z]{2}(?:[\^²³].*)?', core) and run not in (
                'cm', 'mm', 'km', 'kg', 'mg', 'ml', 'kj', 'hz', 'ms', 'in', 'ft', 'yd', 'mi', 'lb', 'oz', 'st', 'nd', 'rd', 'th'):
            continue
        return None
    # A hyphenated range or label ("3-4", "x-axis") isn't a sum.
    if re.fullmatch(r'\d+[-–]\d+', core):
        return None
    return 'term'


def _strong(words, light):
    """Whether a run is math, rather than a number that happened to be nearby."""
    joined = ' '.join(words)
    if _MATH_CHARS.search(joined):
        return True
    if re.search(r'\bO\([^)]*\)', joined):
        return True
    if light:
        return False
    if any(_FUNCTION_NAME.match(word) for word in words) and len(words) + joined.count('(') >= 2:
        return True
    if re.search(r'\bsqrt\(', joined):
        return True
    if re.search(r'\b[a-zA-Z]{1,2}\([^)]*\)', joined) or re.search(r"\b[a-zA-Z]'+\(", joined):
        return True
    if any(word in _RELATIONS for word in words) and len(words) >= 3:
        return True
    if any(word in _OPS for word in words) and len(words) >= 3:
        return True
    if re.search(r'\d\s+x\s+\d', joined):
        return True
    for word in words:
        slash = re.fullmatch(r'\(?(-?\d+)/(\d+)\)?', word)
        if slash and word not in _NOT_FRACTIONS:
            return True
        if re.fullmatch(r'-?[a-zA-Z0-9!]+/[a-zA-Z0-9(][a-zA-Z0-9()+\-]*', word) and re.search(r'[a-zA-Z]', word) and (
                re.fullmatch(r'\(?-?\d*[a-zA-Z]{0,2}\)?/\(?\d*[a-zA-Z]{0,2}\)?', word) or '(' in word):
            return True
    if re.fullmatch(r'\d+[a-zA-Z]', joined) and joined[-1] in 'xyzn':
        return True
    if re.fullmatch(r'-?\d*[a-z](?:\^\d+)?[-+*]\d*[a-z0-9]+', joined):
        return True
    return len(words) == 1 and len(words[0]) == 1 and words[0] in _LONE


def _run(words, light):
    """One run of words as text: `\\(...\\)`, or as written if it isn't math."""
    original = ' '.join(words)
    trimmed = list(words)
    head, tail = [], []
    while trimmed and trimmed[0] in _OPS and trimmed[0] not in ('-', '−'):
        head.append(trimmed.pop(0))
    while trimmed and trimmed[-1] in _OPS:
        tail.insert(0, trimmed.pop())
    if not trimmed or not _strong(trimmed, light):
        return original
    joined = ' '.join(trimmed)
    if joined.count('(') != joined.count(')'):
        return original
    try:
        latex = _expression(joined)
    except (ValueError, IndexError):
        return original
    if not latex:
        return original
    return ' '.join(head + [r'\({}\)'.format(latex)] + tail)


#: Text ending in a number or a unit, so a unit's power comes next: "4 kg m^2".
_AFTER_NUMBER = re.compile(r'(?:\d|\b{})\s*$'.format(_UNIT_NAME))


def _peel(piece, quoted=False):
    """A word and the punctuation after it. "x!" keeps a factorial's bang only
    in a short tight token like "5!"."""
    core, tail = piece, ''
    while core and (core[-1] in _EDGE or core[-1] == '"' or (core[-1] == "'" and quoted)):
        if core[-1] == '!' and re.fullmatch(r'[a-z0-9]{1,3}!', core):
            break
        tail = core[-1] + tail
        core = core[:-1]
    return core, tail


def _sentence(text, tree, light):
    """Math runs in a stretch of plain text with nothing frozen in it."""
    chem = tree in CHEM_TREES
    tokens = re.findall(r'\S+|\s+', text)
    out, run, kinds = [], [], []
    gap = ''
    quoted = False

    def flush():
        if not run:
            return
        made = _chem_run(run) if 'chem' in kinds else _run(run, light)
        out.append(made)
        run.clear()
        kinds.clear()

    for at, piece in enumerate(tokens):
        if piece.isspace():
            if run:
                gap = piece
            else:
                out.append(piece)
            continue
        # An opening quote stays text, so that the math after it still reads.
        head = re.match(r"['\"]*", piece).group(0)
        if head:
            flush()
            out.append(gap)
            gap = ''
            out.append(head)
            piece = piece[len(head):]
            quoted = quoted or "'" in head
        core, tail = _peel(piece, quoted)
        if "'" in tail:
            quoted = False
        kind = None
        if chem and core:
            before = run[-1] if run else ''
            after = tokens[at + 2] if at + 2 < len(tokens) else ''
            if _chem_word(core) or (
                    len(core) == 2 and core in ELEMENTS
                    and (before in _CHEM_OPS or after in _CHEM_OPS)):
                kind = 'chem'
        if kind is None and core:
            depth = ' '.join(run + [core]).count('(') - ' '.join(run + [core]).count(')')
            unit_side = (bool(kinds) and kinds[-1] == 'num') or bool(_AFTER_NUMBER.search(''.join(out)))
            if not light and core in _AFTER_OP and kinds and kinds[-1] == 'op':
                kind = 'term'
            elif not light and core in _PROB_WORDS and depth > 0 and run and run[0].startswith('P('):
                kind = 'term'
            elif core.lower() in _FUNCTIONS and core.lower() not in _WORD_FUNCTIONS:
                kind = 'term'
            elif _UNIT.match(core) and '/' not in core and unit_side:
                kind = None
            elif _UNIT.match(core) and '/' not in core and re.search(r'[\^²³]', core):
                kind = 'term'
            else:
                kind = _atom_kind(core, light)
        if kind is None:
            before_number = (bool(kinds) and kinds[-1] == 'num') or bool(_AFTER_NUMBER.search(''.join(out)))
            flush()
            out.append(gap)
            gap = ''
            # A unit keeps its power as text: "0.02 m^3" reads 0.02 m³.
            if before_number and _UNIT.match(core) and '^' in core:
                piece = re.sub(r'\^([23])', lambda m: m.group(1).translate(_POWERS), core) + tail
            out.append(piece)
            continue
        inside = ' '.join(run).count('(') > ' '.join(run).count(')')
        if run and not inside and not _joins(kinds[-1], kind, run[-1], core):
            flush()
        out.append(gap) if not run else None
        gap = ''
        run.append(core)
        kinds.append(kind)
        if tail:
            depth = ' '.join(run).count('(') - ' '.join(run).count(')')
            if tail == ',' and depth > 0:
                run[-1] = core + tail
                continue
            flush()
            out.append(tail)
    flush()
    out.append(gap)
    return ''.join(out)


_FUNCTION_NAME = re.compile(r'-?\d*(?:{}|log_?[\d₀-₉]+)(?:\^-?\d+)?(?:\(|$)'.format(
    '|'.join(name for name in _FUNCTIONS if name not in _WORD_FUNCTIONS)), re.I)


def _joins(left_kind, right_kind, left, right):
    """Whether two neighbors are one run. Operators join anything. Two values
    only join as a function and its argument, or "3 x 4"."""
    if left_kind == 'op' or right_kind == 'op':
        return True
    if _FUNCTION_NAME.match(left) or _FUNCTION_NAME.match(right):
        return True
    if right.lower().startswith('(') and left.endswith(')'):
        return True
    # "3 x 4" and "2/5 x 1/4" are times, and the scanner reads them that way.
    if right == 'x':
        return left[-1:].isdigit() or left[-1:] == ')' or left_kind == 'term'
    if left == 'x':
        return right[:1].isdigit() or right[:1] == '(' or right_kind == 'term'
    if left[-1:] == ')' and right_kind == 'term':
        return True
    if left.lower() in _GREEK and right_kind == 'var':
        return True
    if left == 'mod' or right == 'mod':
        return True
    if left_kind == 'num' and re.match(r'√|sqrt\(', right):
        return True
    if left_kind == 'var' and right_kind == 'term' and left in _LONE:
        return True
    if re.fullmatch(r'\d+(?:\.\d+)?x', left) and right[:1].isdigit():
        return True
    # Two written terms side by side multiply: "3x dy/dx", "(-1)^n n/(n + 1)".
    return left_kind == 'term' and right_kind == 'term'


_LOOSE_TEX = re.compile(r'\\(le|ge|ne|pm|times|cdot|div|approx|to|pi|theta|infty)(?![a-zA-Z])')
_LOOSE_NAMES = {'le': '≤', 'ge': '≥', 'ne': '≠', 'pm': '±', 'times': '×', 'cdot': '·', 'div': '÷',
                'approx': '≈', 'to': '→', 'pi': 'π', 'theta': 'θ', 'infty': '∞'}


def _untex(text):
    """LaTeX commands a writer typed with no markers around them go back to
    what they stand for, so the one path below writes them out properly."""
    if '\\' not in text or '\\(' in text:
        return text
    text = re.sub(r'\\d?frac' + _BRACED + _BRACED, r'(\1)/(\2)', text)
    text = re.sub(r'\\sqrt\{([^{}]*)\}', r'√(\1)', text)
    return _LOOSE_TEX.sub(lambda m: _LOOSE_NAMES[m.group(1)], text)


def to_latex(text, tree=''):
    """`text` with its math marked up, for a tree that has math in it."""
    if not isinstance(text, str) or not text or '\\(' in text:
        return text
    light = tree in LIGHT_TREES
    if tree not in MATH_TREES and not light:
        return text
    text = text.replace('\u2011', '-').replace('\u2010', '-')
    text = _untex(text)
    text = _MATRIX.sub(lambda match: _matrix(match.group(0)), text)
    out = []
    at = 0
    for frozen in _FROZEN.finditer(text):
        out.append(_sentence(text[at:frozen.start()], tree, light))
        out.append(frozen.group(0))
        at = frozen.end()
    out.append(_sentence(text[at:], tree, light))
    return ''.join(out)


# --------------------------------------------------------------------------
# The other way
# --------------------------------------------------------------------------
_INLINE = re.compile(r'\\\((.*?)\\\)|\\\[(.*?)\\\]', re.S)
_BRACED = r'\{((?:[^{}]|\{[^{}]*\})*)\}'
_FRAC = re.compile(r'\\d?frac' + _BRACED + _BRACED)
_SQRT = re.compile(r'\\sqrt' + _BRACED)
_MROW = re.compile(r'\\begin\{bmatrix\}(.*?)\\end\{bmatrix\}', re.S)


def _bracket(part):
    part = part.strip()
    if part.startswith('\\pi'):
        part = 'π' + part[3:].strip()
    return part if re.fullmatch(r'[-\w.!√π]+|\\?\w+|[-\w.]+\^[-\w]+', part) else '({})'.format(part)


def _plain_math(math):
    def matrix(match):
        rows = [row.strip() for row in match.group(1).split('\\\\')]
        return '[{}]'.format(', '.join(
            '[{}]'.format(', '.join(cell.strip() for cell in row.split('&'))) for row in rows))

    out = _MROW.sub(matrix, math)
    for _ in range(6):
        was = out
        out = _FRAC.sub(lambda m: '{}/{}'.format(_bracket(m.group(1)), _bracket(m.group(2))), out)
        out = _SQRT.sub(lambda m: '√{}'.format(_bracket(m.group(1))), out)
        out = re.sub(r'\\mathrm' + _BRACED + r'(?:\^\{([^{}]*)\})?', lambda m: (
            re.sub(r'_\{(\d+)\}', r'\1', m.group(1)) + (m.group(2) or '')), out)
        out = re.sub(r'\\text' + _BRACED, r'\1', out)
        out = out.replace(r'\bmod', ' mod ')
        if out == was:
            break
    out = out.replace(r'\leftrightarrow', '<->').replace(r'^{\circ}', '°').replace(r'\%', '%').replace(r'{,}', ',').replace(r'\mid', '|')
    out = re.sub(r'\^\{([^{}]*)\}', lambda m: '^' + (m.group(1) if re.fullmatch(r'-?(?:\d+|[a-zA-Z])', m.group(1)) else '({})'.format(m.group(1))), out)
    out = re.sub(r'_\{([^{}]*)\}', lambda m: '_' + m.group(1), out)
    for name, symbol in sorted(_BACK.items(), key=lambda item: -len(item[0])):
        out = re.sub(re.escape(name) + r'(?![a-zA-Z])', symbol, out)
    out = re.sub(r'\\(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|lim|det|gcd|max|min)(?![a-zA-Z])', r'\1', out)
    out = out.replace(r'\,', ' ').replace(r'\ ', ' ')
    return re.sub(r'\s+', ' ', out).strip()


def typed_plain(text):
    """`to_plain` for what a reader typed, who may write \\frac{1}{2} with no
    markers around it."""
    text = str(text or '')
    if '\\' not in text:
        return text
    return to_plain(text) if has_math(text) else _plain_math(text)


def to_plain(text):
    """`text` with the LaTeX turned back into what you'd type."""
    if not isinstance(text, str) or '\\' not in text:
        return text
    return _INLINE.sub(lambda m: _plain_math(m.group(1) if m.group(1) is not None else m.group(2)), text)

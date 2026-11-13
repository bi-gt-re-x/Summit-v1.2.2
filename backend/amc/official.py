r"""Official AMC and AIME problems, imported by pasting them in.

## Why pasting, not fetching

The obvious design is for the server to fetch each contest from the AoPS wiki
on demand. It cannot: the wiki sits behind a Cloudflare bot check that answers
every non-browser request (the API, `action=raw`, the rendered page) with a
challenge page, and getting around a bot check is not something this app does.
So a contest comes in the way a person reads it: open the AoPS page, choose
"View source", copy, paste. The answer key comes the same way.

The problem text is the Mathematical Association of America's. It is stored in
this install's own database (table `amc_official`), shared by every account on
it, and is not part of the repository.

## What the parser accepts

* **AoPS wiki source** — `==Problem 1==` headings, math in `<math>`, `$...$`
  or `<cmath>`, choices as `\textbf{(A)}` (or `\mathrm`, `\text`, `\qquad`
  separated), `[[...|Solution]]` links, and `<asy>` diagrams.
* **Plain text** copied from a PDF or a page — `1.` / `Problem 1` headings and
  `(A) ... (E)` choices.

Answer keys: AoPS's `# B` list, `1. B` lines, `1B 2C ...`, or the bare letters
(`BCDAE...`). AIME keys are integers.

Asymptote diagrams cannot be drawn here (that needs the Asymptote compiler), so
a problem with one is flagged and its source kept, and the page says so.
"""
import json
import re
import time
from datetime import datetime

from backend.amc import catalog
from backend.config.settings import database_url
from backend.database.connection import connect

LETTERS = 'ABCDE'


# ---------------------------------------------------------------------------
# Parsing a contest
# ---------------------------------------------------------------------------
_CHOICE_MARK = re.compile(
    r'(?:\\(?:textbf|mathrm|text|textrm|mathbf|bf|rm)\s*\{\s*\(\s*([A-E])\s*\)\s*\}'   # \textbf{(A)}
    r'|\(\s*\\(?:textbf|mathrm|text|textrm|mathbf)\s*\{\s*([A-E])\s*\}\s*\)'               # (\mathrm{A})
    r'|\\(?:textbf|mathrm|text|textrm|mathbf)\s*\{\s*([A-E])\s*\}'                          # \textbf{A}
    r'|\(\s*([A-E])\s*\))')                                                                 # (A)


def _math_to_dollars(text):
    """<math>, <cmath> and \\[ \\] into $...$ / $$...$$."""
    text = re.sub(r'<cmath>(.*?)</cmath>', lambda m: '$$' + m.group(1).strip() + '$$', text, flags=re.S)
    text = re.sub(r'<math>(.*?)</math>', lambda m: '$' + m.group(1).strip() + '$', text, flags=re.S)
    text = re.sub(r'\\\[(.*?)\\\]', lambda m: '$$' + m.group(1).strip() + '$$', text, flags=re.S)
    return text


def _clean_wiki(text):
    """Wiki markup that is not math, removed or reduced to its words."""
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    text = re.sub(r'\[\[(?:Image|File):[^\]]*\]\]', '', text, flags=re.I)
    text = re.sub(r'\[\[[^\]|]*\|\s*Solution[^\]]*\]\]', '', text, flags=re.I)
    text = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', r'\1', text)
    text = re.sub(r'\[https?://\S+\s+([^\]]*)\]', r'\1', text)
    text = re.sub(r"'''?", '', text)
    text = re.sub(r'</?(?:center|div|span|p|br|small|big|sup|sub)[^>]*>', ' ', text, flags=re.I)
    text = re.sub(r'\{\{[^}]*\}\}', '', text)
    return text


def _split_choices(block):
    """`\\textbf{(A) } 3 \\qquad \\textbf{(B) } 4 ...` into five strings, or None."""
    marks = list(_CHOICE_MARK.finditer(block))
    letters = [next(g for g in m.groups() if g) for m in marks]
    # The first run of A, B, C, D, E in order.
    for start in range(len(marks)):
        if letters[start:start + 5] == list(LETTERS):
            picked = marks[start:start + 5]
            break
    else:
        return None
    out = []
    for i, m in enumerate(picked):
        end = picked[i + 1].start() if i + 1 < 5 else len(block)
        part = block[m.end():end]
        part = re.sub(r'\\(?:qquad|quad|hspace\{[^}]*\}|hfill|\\|newline|;|,|:)|~|&', ' ', part)
        part = re.sub(r'\\ ', ' ', part)
        part = part.replace('$$', ' ').replace('$', ' ')
        part = re.sub(r'\s+', ' ', part).strip().rstrip(',;').strip()
        if not part:
            return None
        out.append(part)
    return out


def _choice_text(raw):
    """One choice as display text: math if it looks like math, words if not."""
    if re.fullmatch(r'[A-Za-z][A-Za-z ,.\'-]*', raw) and ' ' in raw:
        return raw
    if raw.startswith('\\text{') and raw.endswith('}'):
        return raw[6:-1]
    return '$' + raw + '$'


def _find_choices(body):
    """The choices in a problem body, and the body without them."""
    # Math blocks first: AoPS writes the choices as one (sometimes two) of them.
    blocks = list(re.finditer(r'\$\$(.+?)\$\$|\$(.+?)\$', body, flags=re.S))
    for i, m in enumerate(blocks):
        inner = m.group(1) or m.group(2)
        if not _CHOICE_MARK.search(inner):
            continue
        # Join this block with the ones right after it, for choices split
        # across lines (A-C on one, D-E on the next).
        joined, end = inner, m.end()
        for nxt in blocks[i + 1:i + 3]:
            between = body[end:nxt.start()]
            if between.strip():
                break
            joined += ' ' + (nxt.group(1) or nxt.group(2))
            end = nxt.end()
        choices = _split_choices(joined)
        if choices:
            return [_choice_text(c) for c in choices], (body[:m.start()] + body[end:]).strip()
    # Plain text: (A) 3 (B) 4 ...
    choices = _split_choices(body)
    if choices:
        first = _CHOICE_MARK.search(body)
        return [_choice_text(c) if re.search(r'[\\^_{}]', c) else c for c in choices], body[:first.start()].strip()
    return None, body


def _tidy(text):
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _split_problems(source):
    """{number: body} from `==Problem N==` headings, or `N.` / `Problem N` lines."""
    heads = list(re.finditer(r'^\s*==+\s*Problem\s*(\d+)\s*==+\s*$', source, flags=re.M | re.I))
    if not heads:
        heads = list(re.finditer(r'^\s*(?:Problem\s+(\d+)\s*[:.]?|(\d+)\s*[.)])\s+', source, flags=re.M | re.I))
    out = {}
    for i, h in enumerate(heads):
        number = int(next(g for g in h.groups() if g))
        end = heads[i + 1].start() if i + 1 < len(heads) else len(source)
        body = source[h.end():end]
        # A later `==See also==` or similar section ends the last problem.
        body = re.split(r'^\s*==+\s*(?:See also|Solution|Answer|Video)', body, flags=re.M | re.I)[0]
        if number not in out:
            out[number] = body
    return out


def parse_contest(source, level):
    """The pasted page as [{'number', 'statement', 'choices', 'diagram'}]."""
    count = catalog.FORMATS[level]['count']
    problems = []
    for number, body in sorted(_split_problems(source).items()):
        if not 1 <= number <= count:
            continue
        diagrams = re.findall(r'<asy>(.*?)</asy>', body, flags=re.S)
        body = re.sub(r'<asy>.*?</asy>', '', body, flags=re.S)
        has_image = bool(re.search(r'\[\[(?:Image|File):', body, flags=re.I))
        body = _math_to_dollars(_clean_wiki(body))
        choices = None
        if level != 'AIME':
            choices, body = _find_choices(body)
        problems.append({
            'number': number,
            'statement': _tidy(body),
            'choices': choices,
            'diagram': '\n\n'.join(d.strip() for d in diagrams) or ('image' if has_image else ''),
        })
    return problems


def parse_key(source, level):
    """The answer key as a list: letters for the AMC, integers for the AIME."""
    count = catalog.FORMATS[level]['count']
    text = re.sub(r'<[^>]+>|\{\{[^}]*\}\}', ' ', source)
    if level == 'AIME':
        found = []
        for line in text.splitlines():
            line = line.strip().lstrip('#*').strip()
            m = re.fullmatch(r'(?:\d+\s*[.):-]\s*)?(\d{1,3})', line)
            if m:
                found.append(int(m.group(1)))
        if len(found) < count:
            found = [int(x) for x in re.findall(r'\b\d{1,3}\b', text)]
            # "1. 204 2. 33 ..." — every other number is the problem number.
            if len(found) == 2 * count and found[0::2] == list(range(1, count + 1)):
                found = found[1::2]
        return found[:count] if len(found) >= count else found
    found = []
    for line in text.splitlines():
        line = line.strip().lstrip('#*').strip()
        m = re.fullmatch(r'(?:\d+\s*[.):-]?\s*)?\(?([A-E])\)?', line)
        if m:
            found.append(m.group(1))
    if len(found) < count:
        compact = re.sub(r'\s+', '', text)
        if re.fullmatch(r'[A-E]+', compact):
            found = list(compact)
        else:
            found = re.findall(r'(?:^|[^A-Za-z])([A-E])(?![A-Za-z])', text)
    return found[:count] if len(found) >= count else found


# ---------------------------------------------------------------------------
# Tagging: what topic and how hard
# ---------------------------------------------------------------------------
#: Keyword rules, first match wins. A guess, and the pages say so: amcstep's
#: tags are a person's judgment and these are a regex's.
_TOPIC_RULES = [
    ('probability', r'probabilit|at random|randomly|fair (?:coin|die|dice)|expected'),
    ('expected-value', r'expected value'),
    ('circles', r'circle|radius|diameter|tangent|chord|inscribed|circumscribed|arc\b'),
    ('trigonometry', r'\\sin|\\cos|\\tan|sine|cosine'),
    ('logarithms', r'\\log|logarithm'),
    ('complex-numbers', r'complex number|\bi\^|\bz\^|imaginary'),
    ('solid-geometry', r'cube|sphere|cylinder|cone|prism|pyramid|tetrahedr|volume'),
    ('coordinate-geometry', r'coordinate|\bxy-plane|\(\s*-?\d+\s*,\s*-?\d+\s*\)|slope|parabola|graph of'),
    ('similar-triangles', r'similar|parallel to'),
    ('right-triangles', r'right triangle|hypotenuse|pythag'),
    ('triangles', r'triangle'),
    ('polygons', r'hexagon|pentagon|octagon|polygon|regular'),
    ('area', r'\barea\b|perimeter|square|rectangle|trapezoid|rhombus'),
    ('modular-arithmetic', r'remainder|divided by|\\pmod|\bmod\b|last (?:two )?digits?|units digit'),
    ('digits-bases', r'\bdigits?\b|base[- ]\d|palindrom'),
    ('factors-divisors', r'divisors?|factors?|prime factor|\\gcd|greatest common|least common multiple|lcm'),
    ('divisibility', r'divisible|prime|multiple of|integer'),
    ('sequences-series', r'sequence|arithmetic progression|geometric|terms?\b|sum of the first'),
    ('polynomials', r'polynomial|roots?\b|zeros? of'),
    ('quadratics', r'x\^2|quadratic'),
    ('functions', r'f\(|function'),
    ('inequalities', r'minimum|maximum|least possible|greatest possible|inequalit|\\le|\\ge'),
    ('statistics', r'mean|median|mode|average'),
    ('permutations', r'arrange|permutation|order(?:ings?|ed)'),
    ('combinations', r'how many ways|choose|committee|subsets?|select'),
    ('basic-counting', r'how many'),
    ('word-problems', r'percent|\\%|rate|speed|mph|miles|hours?|minutes|cost|dollars|\\\$|price|ratio'),
    ('logic', r'truth|liar|knight|knave|always tells|statements?'),
    ('linear-equations', r'.'),
]


def guess_topic(statement):
    low = statement.lower()
    for topic, pattern in _TOPIC_RULES:
        if re.search(pattern, low):
            return topic
    return 'linear-equations'


def difficulty_at(level, number):
    """Difficulty from position: AMC 1-5 is a 1 and 21-25 a 5; AIME runs 2-5."""
    if level == 'AIME':
        return 2 if number <= 3 else 3 if number <= 7 else 4 if number <= 11 else 5
    return min(5, (number - 1) // 5 + 1)


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------
def problem_id(contest_id, number):
    return '{}-{}'.format(contest_id, number)


def split_id(pid):
    """('2023-amc-10a', 5), or None for anything that is not an official id."""
    head, _, tail = pid.rpartition('-')
    if head in catalog.PAST_BY_ID and tail.isdigit():
        return head, int(tail)
    return None


def _shape(row):
    contest = catalog.PAST_BY_ID[row['contest_id']]
    number = int(row['number'])
    answer = row['answer']
    if contest['level'] == 'AIME':
        answer = int(answer)
    choices = json.loads(row['choices']) if row.get('choices') else None
    return {
        'id': problem_id(row['contest_id'], number),
        'level': contest['level'],
        'topic': row.get('topic') or guess_topic(row['statement']),
        'also': [],
        'technique': 'official',
        'difficulty': difficulty_at(contest['level'], number),
        'statement': row['statement'],
        'choices': choices,
        'answer': answer,
        'solution': None, 'insight': None, 'trap': None,
        'official': True,
        'contest': row['contest_id'],
        'number': number,
        'diagram': row.get('diagram') or '',
    }


#: The imported problems, read once and kept. Keyed by which database they came
#: from (the tests switch databases between cases) and re-read after a minute,
#: so a contest imported through another server process shows up here too.
_cache = {'rows': None, 'source': None, 'at': 0.0}
CACHE_SECONDS = 60


def forget():
    _cache['rows'] = None


def _source():
    from backend.database import connection
    return database_url() or connection.DB_PATH


def all_problems():
    """Every imported problem, in contest order (newest contest first)."""
    now = time.monotonic()
    if (_cache['rows'] is None or _cache['source'] != _source()
            or now - _cache['at'] > CACHE_SECONDS):
        _cache['source'] = _source()
        _cache['at'] = now
        con = connect()
        try:
            rows = [dict(zip(r.keys(), tuple(r))) for r in con.execute(
                'SELECT contest_id, number, statement, choices, answer, diagram, topic '
                'FROM amc_official ORDER BY contest_id DESC, number').fetchall()]
        finally:
            con.close()
        order = {c['id']: i for i, c in enumerate(catalog.PAST)}
        rows.sort(key=lambda r: (order.get(r['contest_id'], 10 ** 6), int(r['number'])))
        _cache['rows'] = [_shape(r) for r in rows if r['contest_id'] in catalog.PAST_BY_ID]
    return _cache['rows']


def get(pid):
    if not split_id(pid):
        return None
    for p in all_problems():
        if p['id'] == pid:
            return p
    return None


def imported_contests():
    """{contest_id: number of problems imported}."""
    out = {}
    for p in all_problems():
        out[p['contest']] = out.get(p['contest'], 0) + 1
    return out


def save(contest_id, problems, key, username):
    """Store a parsed contest with its key, replacing any earlier import."""
    now = datetime.now().isoformat(timespec='seconds')
    con = connect()
    try:
        with con:
            con.execute('DELETE FROM amc_official WHERE contest_id = ?', (contest_id,))
            for p in problems:
                con.execute(
                    'INSERT INTO amc_official (contest_id, number, statement, choices, answer, diagram, topic, '
                    'imported_by, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    (contest_id, p['number'], p['statement'],
                     json.dumps(p['choices']) if p['choices'] else None,
                     str(key[p['number'] - 1]), p['diagram'], guess_topic(p['statement']), username, now))
    finally:
        con.close()
    forget()


def remove(contest_id):
    con = connect()
    try:
        with con:
            con.execute('DELETE FROM amc_official WHERE contest_id = ?', (contest_id,))
    finally:
        con.close()
    forget()

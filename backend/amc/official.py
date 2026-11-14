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


def check(contest_id, problems_source, key_source):
    """Parse one contest's problems and key: (problems, key, issues, complete).

    `complete` means it can be saved: every problem found with text, and a full
    answer key. Missing answer choices are reported but do not block it.
    """
    c = catalog.PAST_BY_ID[contest_id]
    level, count = c['level'], c['count']
    parsed = [p for p in parse_contest(problems_source, level) if 1 <= p['number'] <= count]
    key = parse_key(key_source, level)
    numbers = {p['number'] for p in parsed}
    missing = [n for n in range(1, count + 1) if n not in numbers]
    no_choices = [p['number'] for p in parsed if level != 'AIME' and not p['choices']]
    empty = [p['number'] for p in parsed if not p['statement']]
    key_ok = len(key) == count
    issues = []
    if missing:
        issues.append('Problems {} were not found.'.format(', '.join(map(str, missing))))
    if no_choices:
        issues.append('Problems {} have no answer choices.'.format(', '.join(map(str, no_choices))))
    if empty:
        issues.append('Problems {} have no text.'.format(', '.join(map(str, empty))))
    if not key_ok:
        issues.append('The answer key has {} of {} answers.'.format(len(key), count))
    return parsed, key, issues, not (missing or empty or not key_ok)


# ---------------------------------------------------------------------------
# Many contests at once, from the AoPS wiki's API
# ---------------------------------------------------------------------------
API = 'https://artofproblemsolving.com/wiki/api.php'
#: Contests per batch link: two pages each (problems and answer key), and a
#: size the browser shows and copies without trouble (about 1 MB).
BATCH = 8


def _page_index():
    """{'2023_AMC_10A_Problems': (contest_id, 'problems'), ...}."""
    out = {}
    for c in catalog.PAST:
        out[c['problems_url'].rsplit('/', 1)[1]] = (c['id'], 'problems')
        out[c['answers_url'].rsplit('/', 1)[1]] = (c['id'], 'key')
    return out


def batch_urls(contest_ids):
    """Links to the AoPS API that return the wiki source of these contests'
    problem pages and answer keys, BATCH contests to a link. Opened in a
    browser, each is one page of JSON to copy and paste into the importer."""
    from urllib.parse import urlencode
    rows = [catalog.PAST_BY_ID[cid] for cid in contest_ids if cid in catalog.PAST_BY_ID]
    out = []
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        titles = []
        for c in chunk:
            titles += [c['problems_url'].rsplit('/', 1)[1], c['answers_url'].rsplit('/', 1)[1]]
        query = urlencode({'action': 'query', 'prop': 'revisions', 'rvprop': 'content', 'rvslots': 'main',
                           'format': 'json', 'formatversion': '2', 'redirects': '1', 'titles': '|'.join(titles)})
        out.append({'url': API + '?' + query, 'contests': [c['id'] for c in chunk],
                    'label': '{} – {}'.format(chunk[0]['name'], chunk[-1]['name']) if len(chunk) > 1 else chunk[0]['name']})
    return out


def _json_blobs(text):
    """Every JSON object in the pasted text (one per batch page), skipping
    whatever the browser put around them."""
    decoder = json.JSONDecoder()
    i, out = 0, []
    while True:
        i = text.find('{', i)
        if i < 0:
            return out
        try:
            obj, end = decoder.raw_decode(text, i)
        except ValueError:
            i += 1
            continue
        if isinstance(obj, dict):
            out.append(obj)
        i = end


def _pages(blob):
    """[(title, wiki source)] from one API reply, formatversion 1 or 2, with
    each redirect's original title kept alongside its target."""
    query = blob.get('query') or {}
    pages = query.get('pages') or []
    if isinstance(pages, dict):
        pages = list(pages.values())
    aliases = {}
    for r in (query.get('normalized') or []) + (query.get('redirects') or []):
        aliases.setdefault(r.get('to'), []).append(r.get('from'))
    out = []
    for page in pages:
        revs = page.get('revisions') or []
        if not revs:
            continue
        rev = revs[0]
        content = (((rev.get('slots') or {}).get('main') or {}).get('content')
                   or ((rev.get('slots') or {}).get('main') or {}).get('*') or rev.get('content') or rev.get('*'))
        if not content:
            continue
        titles = [page.get('title', '')]
        frontier = list(titles)
        while frontier:
            t = frontier.pop()
            for older in aliases.get(t, []):
                if older not in titles:
                    titles.append(older)
                    frontier.append(older)
        out.append((titles, content))
    return out


def read_bundle(text):
    """{contest_id: {'problems': source, 'key': source}} from pasted API JSON."""
    index = _page_index()
    found = {}
    for blob in _json_blobs(text):
        for titles, content in _pages(blob):
            for title in titles:
                hit = index.get((title or '').replace(' ', '_'))
                if hit:
                    found.setdefault(hit[0], {})[hit[1]] = content
                    break
    return found


def import_bundle(text, save, username):
    """Check every contest in the pasted batches; with `save`, store the
    complete ones. One row per contest found, in catalogue order."""
    found = read_bundle(text)
    order = {c['id']: i for i, c in enumerate(catalog.PAST)}
    rows = []
    for cid in sorted(found, key=lambda x: order[x]):
        pages = found[cid]
        parsed, key, issues, complete = check(cid, pages.get('problems', ''), pages.get('key', ''))
        if 'problems' not in pages:
            issues = ['The problems page was not in the paste.'] + issues
        if 'key' not in pages:
            issues = ['The answer key was not in the paste.'] + [x for x in issues if not x.startswith('The answer key has')]
        saved = False
        if save and complete:
            save_contest(cid, parsed, key, username)
            saved = True
        rows.append({'id': cid, 'name': catalog.PAST_BY_ID[cid]['name'], 'problems': len(parsed),
                     'count': catalog.PAST_BY_ID[cid]['count'], 'answers': len(key), 'complete': complete,
                     'diagrams': sum(1 for p in parsed if p['diagram']), 'issues': issues, 'saved': saved})
    return rows


# ---------------------------------------------------------------------------
# Tagging: what topic and how hard
# ---------------------------------------------------------------------------
#: Keyword rules, in priority order. The first match is the problem's topic and
#: the next two distinct matches its secondary topics. A guess, and the pages
#: say so: amcstep's tags are a person's judgment and these are a regex's.
_TOPIC_RULES = [
    ('expected-value', r'expected (?:value|number)'),
    ('conditional-probability', r'given that|conditional'),
    ('geometric-probability', r'(?:random|uniformly).{0,80}(?:interval|inside|interior|on the segment|in the square|in the region|real number)'),
    ('probability', r'probabilit|at random|randomly|fair (?:coin|die|dice)'),
    ('games-strategy', r'\bgame\b|takes turns|winning strategy|players? (?:alternate|take)|guarantee a win'),
    ('clocks-calendars', r'clock|o\'clock|calendar|day of the week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|a\.m\.|p\.m\.'),
    ('data-graphs', r'bar graph|pie chart|the table|histogram|the graph shows|venn'),
    ('conics', r'ellipse|hyperbola|parabola|focus|foci|directrix'),
    ('cyclic-quadrilaterals', r'cyclic|inscribed (?:in|quadrilateral)[^.]{0,40}quadrilateral|quadrilateral[^.]{0,60}inscribed'),
    ('trigonometry', r'\\sin|\\cos|\\tan|\\cot|\\sec|\\csc|sine|cosine|tangent of'),
    ('logarithms', r'\\log|logarithm|\\ln'),
    ('complex-numbers', r'complex number|\bi\^|\bz\^|imaginary|\\overline\{z\}|\bi\s*=\s*\\sqrt\{-1\}'),
    ('solid-geometry', r'cube|sphere|cylinder|cone|prism|pyramid|tetrahedr|volume|octahedr|faces?\b'),
    ('lattice-paths', r'lattice|grid|path[s]? from|unit steps|moves? (?:up|right)'),
    ('triangle-centers', r'incenter|circumcenter|centroid|orthocenter|angle bisector|median|altitude|incircle|circumcircle'),
    ('circles', r'circle|radius|radii|diameter|tangent|chord|inscribed|circumscribed|\barcs?\b|semicircle'),
    ('area-ratios', r'ratio of the areas?|area of triangle [a-z]+ to|fraction of the area'),
    ('coordinate-geometry', r'coordinate|\bxy-plane|cartesian|\(\s*-?\d+\s*,\s*-?\d+\s*\)|slope|\by\s*=\s*\d*x|line through'),
    ('transformations', r'reflect|rotat|translat|symmetr'),
    ('similar-triangles', r'similar|parallel to'),
    ('right-triangles', r'right triangle|hypotenuse|pythag|right angle|\\angle [a-z]+\s*=\s*90'),
    ('angle-chasing', r'\\angle|degrees|\^\\circ|\bangles?\b'),
    ('triangles', r'triangle'),
    ('quadrilaterals', r'trapezoid|rhombus|parallelogram|kite|quadrilateral|rectangle'),
    ('polygons', r'hexagon|pentagon|octagon|polygon|regular|decagon|dodecagon|-gon\b'),
    ('area', r'\barea\b|perimeter|square'),
    ('factorials', r'\d!|n!|factorial|trailing zeros|zeros at the end'),
    ('decimals-fractions', r'repeating decimal|decimal (?:expansion|representation)|\\overline\{\d|terminating'),
    ('gcd-lcm', r'\\gcd|\\operatorname\{lcm\}|\\text\{lcm\}|greatest common (?:divisor|factor)|least common multiple|relatively prime'),
    ('modular-arithmetic', r'remainder|divided by|\\pmod|\\bmod|\bmod\b|last (?:two |three )?digits?|units digit|ones digit'),
    ('digits-bases', r'\bdigits?\b|base[- ]\d|base \$|palindrom'),
    ('perfect-powers', r'perfect (?:square|cube|power)|square of an integer|squares? of integers'),
    ('factors-divisors', r'divisors?|factors?|prime factor'),
    ('diophantine', r'ordered pairs? of (?:positive )?integers|integer solutions|in integers|ordered triples? of (?:positive )?integers'),
    ('parity', r'\bodd\b|\beven\b'),
    ('divisibility', r'divisible|prime|multiple of'),
    ('floor-ceiling', r'\\lfloor|\\lceil|greatest integer|floor'),
    ('absolute-value', r'\|x|\|\s*[a-z]\s*[-+]|absolute value|\\lvert'),
    ('binomial-theorem', r'expansion of|coefficient of|\(\s*[a-z0-9]+\s*[+-]\s*[a-z0-9]+\s*\)\^\{?\d{2,}'),
    ('binomial-coefficients', r'\\binom|pascal|\\choose'),
    ('sequences-series', r'sequence|arithmetic progression|geometric (?:sequence|series|progression)|\ba_\{?n|sum of the first|\\sum'),
    ('polynomials', r'polynomial|roots?\b|zeros? of|\bp\(x\)|cubic'),
    ('quadratics', r'x\^2|quadratic'),
    ('functions', r'f\(|function|g\('),
    ('graphs-transformations', r'graph'),
    ('nonlinear-systems', r'xy\s*=|x\^2\s*\+\s*y\^2|system of equations'),
    ('inequalities', r'minimum|maximum|least possible|greatest possible|largest possible|smallest possible|inequalit|\\le|\\ge'),
    ('statistics', r'\bmean\b|median|\bmode\b|average|arithmetic mean'),
    ('pigeonhole', r'guarantee|must be (?:at least|true)|at least two of'),
    ('graph-theory', r'tournament|round[- ]robin|handshake|shook hands|edges?\b|vertices of a graph|friends?\b'),
    ('symmetry-counting', r'rotations? (?:are|is) considered|indistinguishable|up to rotation|colou?r(?:ed|ings?)'),
    ('invariants', r'repeatedly|operation|replaced? (?:by|with)|step(?:s)? (?:is|are) repeated|process'),
    ('logic', r'truth|liar|knight|knave|always tells|statements?|exactly one of'),
    ('permutations', r'arrange|permutation|orderings?\b|in what order|lineup|in a row|seat'),
    ('combinations', r'how many ways|choose|committee|subsets?|select'),
    ('basic-counting', r'how many'),
    ('word-problems', r'percent|\\%|\brate\b|speed|mph|miles|hours?|minutes|cost|dollars|\\\$|price|ratio'),
    ('estimation', r'closest to|approximately|nearest'),
    ('arithmetic', r'\\frac|\\cdot|\\times|value of'),
    ('linear-equations', r'.'),
]


def guess_topics(statement):
    """[primary, up to two secondary] topic ids for a problem's text."""
    low = statement.lower()
    found = []
    for topic, pattern in _TOPIC_RULES:
        if topic not in found and re.search(pattern, low):
            found.append(topic)
            if len(found) == 3:
                break
    if len(found) > 1 and found[-1] == 'linear-equations':
        found.pop()
    return found or ['linear-equations']


def guess_topic(statement):
    return guess_topics(statement)[0]


from backend.amc.scale import RATING_BY_NUMBER  # noqa: E402  (the per-number curve)


def _bands(level):
    """[(last problem number, rating)] runs, for the contest guide."""
    out = []
    for number, rating in enumerate(RATING_BY_NUMBER[level], start=1):
        if out and out[-1][1] == rating:
            out[-1] = (number, rating)
        else:
            out.append((number, rating))
    return out


RATING_BANDS = {level: _bands(level) for level in RATING_BY_NUMBER}


def rating_at(level, number):
    """The AoPS-scale rating (1-10) for problem `number` of a `level` paper."""
    table = RATING_BY_NUMBER[level]
    return table[min(max(number, 1), len(table)) - 1]


def difficulty_at(level, number):
    """The 1-5 difficulty, from the position's AoPS rating."""
    from backend.amc.solutions import tier
    return tier(rating_at(level, number))


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
    # Tagged from the text each time it is read, so better rules reach
    # contests imported before them.
    tags = guess_topics(row['statement'])
    return {
        'id': problem_id(row['contest_id'], number),
        'level': contest['level'],
        'topic': tags[0],
        'also': tags[1:],
        'technique': 'official',
        'rating': rating_at(contest['level'], number),
        'difficulty': difficulty_at(contest['level'], number),
        'statement': row['statement'],
        'choices': choices,
        'answer': answer,
        'solution': None, 'insight': None, 'trap': None,
        'official': True,
        'contest': row['contest_id'],
        'number': number,
        'diagram': row.get('diagram') or '',
        'aops_url': '{}/Problem_{}'.format(contest['problems_url'], number),
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


def save_contest(contest_id, problems, key, username):
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


save = save_contest


def remove(contest_id):
    con = connect()
    try:
        with con:
            con.execute('DELETE FROM amc_official WHERE contest_id = ?', (contest_id,))
    finally:
        con.close()
    forget()

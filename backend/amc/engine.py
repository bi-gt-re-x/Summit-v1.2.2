"""The rules: grading, the review schedule, scores, projections, the study
plan and search. Pure functions over catalog content and an account's rows
(store.py), so every rule can be tested without a database.
"""
import re
from datetime import date, timedelta

from backend.amc import catalog
from backend.amc import problems as bank_of

LETTERS = 'ABCDE'

#: Days until a missed problem comes back, by stage. Passing the last one
#: marks it mastered.
INTERVALS = [3, 10, 21]

#: Default goals: the AIME qualifying score, which from the 2026-27 contests
#: is fixed at 100 on the AMC 10 and 85 on the AMC 12 (it used to move every
#: year with the score distribution), and a solid AIME score.
DEFAULT_GOALS = {'AMC 10': 100, 'AMC 12': 85, 'AIME': 7}

#: Chance of solving a problem of each difficulty with no history yet.
PRIOR = {1: 0.9, 2: 0.75, 3: 0.55, 4: 0.35, 5: 0.15}
PRIOR_WEIGHT = 3

#: Problems answered before a projected score is shown at all.
PROJECTION_MIN = 5


# ---------------------------------------------------------------------------
# Grading and presenting problems
# ---------------------------------------------------------------------------
def normalize_answer(problem, answer):
    """The canonical form of a submitted answer, or '' for a blank."""
    text = str(answer if answer is not None else '').strip()
    if not text:
        return ''
    if problem['choices']:
        letter = text[:1].upper()
        return letter if letter in LETTERS else ''
    digits = re.sub(r'[^0-9]', '', text)
    return str(int(digits)) if digits else ''


def is_correct(problem, answer):
    given = normalize_answer(problem, answer)
    return given != '' and given == str(problem['answer'])


_SYMBOLS = {
    'le': '≤', 'leq': '≤', 'ge': '≥', 'geq': '≥', 'ne': '≠', 'neq': '≠', 'cdot': '·', 'times': '×',
    'pi': 'π', 'theta': 'θ', 'omega': 'ω', 'varphi': 'φ', 'ldots': '…', 'dots': '…', 'cdots': '⋯',
    'infty': '∞', 'circ': '°', 'sum': 'Σ', 'displaystyle': '', 'left': '', 'right': '', 'lfloor': '⌊', 'rfloor': '⌋', 'pm': '±', 'equiv': '≡', 'angle': '∠', 'triangle': '△',
}
_SUPERSCRIPT = str.maketrans('0123456789+-n', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ')


_OPERATORS = {'sin', 'cos', 'tan', 'log', 'ln', 'gcd', 'lcm', 'max', 'min', 'operatorname', 'mathrm', 'bmod', 'pmod'}


def plain(text):
    """Statement text with the TeX turned into readable plain text, for search
    and one-line previews: `$n \\le 100$` reads "n ≤ 100", `x^2` reads "x²"."""
    text = text.replace('\\$', '\x00').replace('\\%', '%').replace('\\{', '\x01').replace('\\}', '\x02')
    text = re.sub(r'\\[,;:! ]', '', text)
    text = re.sub(r'\^\\circ', '°', text)
    text = re.sub(r'\^\{(-?[0-9n]{1,4})\}', lambda m: m.group(1).translate(_SUPERSCRIPT), text)
    text = re.sub(r'\^([0-9n])', lambda m: m.group(1).translate(_SUPERSCRIPT), text)
    for _ in range(2):  # a fraction inside a fraction
        text = re.sub(r'\\(?:dfrac|frac|tfrac)\{([^{}]*)\}\{([^{}]*)\}', r'(\1)/(\2)', text)
    text = re.sub(r'\(([A-Za-z0-9.]+)\)/', r'\1/', text)
    text = re.sub(r'/\(([A-Za-z0-9.]+)\)', r'/\1', text)
    text = re.sub(r'\\sqrt\{([^{}]*)\}', r'√\1', text)
    text = re.sub(r'\\([a-zA-Z]+)',
                  lambda m: _SYMBOLS.get(m.group(1)) or (m.group(1) + ' ' if m.group(1) in _OPERATORS else ' '),
                  text)
    text = re.sub(r'[{}\\_$]', '', text)
    text = text.replace('\x00', '$').replace('\x01', '{').replace('\x02', '}')
    text = re.sub(r'\s+', ' ', text).strip()
    return re.sub(r'\s([,.?])', r'\1', text)


def public(problem, reveal=False):
    """A problem as the client sees it. The answer and write-up only once the
    account has answered it (or asked to see it)."""
    topic = catalog.TOPIC_BY_ID[problem['topic']]
    out = {
        'id': problem['id'],
        'level': problem['level'],
        'topic': topic['id'],
        'topic_name': topic['name'],
        'category': topic['category'],
        'category_name': catalog.CATEGORY_BY_ID[topic['category']]['name'],
        'also': [{'id': t, 'name': catalog.TOPIC_BY_ID[t]['name']} for t in problem['also']],
        'technique': problem['technique'],
        'technique_name': catalog.technique_name(problem['technique']),
        'difficulty': problem['difficulty'],
        'rating': problem.get('rating'),
        'statement': problem['statement'],
        'choices': problem['choices'],
        'format': 'choice' if problem['choices'] else 'integer',
        'sources': catalog.sources(problem['id']),
        'official': bool(problem.get('official')),
        'diagram': problem.get('diagram') or '',
        'aops_url': problem.get('aops_url'),
    }
    if reveal:
        out.update(answer=problem['answer'], solution=problem['solution'],
                   insight=problem['insight'], trap=problem['trap'])
    return out


# ---------------------------------------------------------------------------
# An account's history
# ---------------------------------------------------------------------------
def history(attempts):
    """Per problem: attempts, first result, latest result, ever solved."""
    out = {}
    for row in attempts:
        pid = row['problem_id']
        h = out.setdefault(pid, {'attempts': 0, 'first_correct': bool(row['correct']),
                                 'solved': False, 'last_correct': False, 'last_at': '',
                                 'seconds': 0})
        h['attempts'] += 1
        h['solved'] = h['solved'] or bool(row['correct'])
        h['last_correct'] = bool(row['correct'])
        h['last_at'] = row['at']
        h['seconds'] += int(row.get('seconds') or 0)
    return out


def status_of(pid, hist, review_by_id):
    """'review' (in the error log), 'solved', 'missed' or 'new'."""
    rev = review_by_id.get(pid)
    if rev and rev['status'] == 'active':
        return 'review'
    h = hist.get(pid)
    if not h:
        return 'new'
    return 'solved' if h['solved'] else 'missed'


def streak(attempts, today):
    """Days in a row with at least one answer, ending today or yesterday."""
    days = {row['at'][:10] for row in attempts}
    cursor = today if today.isoformat() in days else today - timedelta(days=1)
    count = 0
    while cursor.isoformat() in days:
        count += 1
        cursor -= timedelta(days=1)
    return count


def accuracy_by_difficulty(hist):
    """Smoothed chance of solving each difficulty, from first attempts only:
    an answer after seeing the solution says nothing about contest day."""
    seen = {d: [0, 0] for d in PRIOR}
    for pid, h in hist.items():
        p = bank_of.get(pid)
        if not p:
            continue
        bucket = seen[p['difficulty']]
        bucket[0] += 1 if h['first_correct'] else 0
        bucket[1] += 1
    return {d: (c + PRIOR[d] * PRIOR_WEIGHT) / (n + PRIOR_WEIGHT) for d, (c, n) in seen.items()}


def _chance(acc, difficulty):
    """Interpolate between integer difficulties."""
    lo = max(1, min(5, int(difficulty)))
    hi = min(5, lo + 1)
    frac = difficulty - lo
    return acc[lo] * (1 - frac) + acc[hi] * frac


def projected(hist, level):
    """Expected score on a contest at `level` with an answer-or-skip strategy.

    Difficulty rises along the paper (about 1.0 at #1 to 4.6 at #25 on the AMC
    10; the AMC 12 runs half a step harder; the AIME from 2 to 5). On the AMC
    a problem is worth answering when the chance of being right beats the 1.5
    points for a blank (p > 0.25).
    """
    acc = accuracy_by_difficulty(hist)
    if level == 'AIME':
        total = sum(_chance(acc, 2 + 3 * i / 14) for i in range(15))
        return round(total, 1)
    shift = 0.5 if level == 'AMC 12' else 0
    total = 0
    for i in range(25):
        p = _chance(acc, min(5, 1 + 3.6 * i / 24 + shift))
        total += 6 * p if p > 0.25 else 1.5
    return round(total * 2) / 2


def topic_stats(hist, review_by_id):
    """Per topic: problems, attempted, solved, first-try accuracy, in review."""
    out = {t['id']: {'problems': 0, 'attempted': 0, 'solved': 0, 'first_right': 0, 'review': 0}
           for t in catalog.TOPICS}
    for p in bank_of.all_problems():
        for tid in [p['topic']] + p['also']:
            row = out[tid]
            row['problems'] += 1
            h = hist.get(p['id'])
            if h:
                row['attempted'] += 1
                row['solved'] += 1 if h['solved'] else 0
                row['first_right'] += 1 if h['first_correct'] else 0
            rev = review_by_id.get(p['id'])
            if rev and rev['status'] == 'active':
                row['review'] += 1
    for row in out.values():
        row['accuracy'] = round(row['first_right'] / row['attempted'], 3) if row['attempted'] else None
        # 0-1: the share of the topic's problems solved first time. Unseen
        # problems count as not yet in hand, so one lucky answer is not mastery.
        row['mastery'] = round(row['first_right'] / row['problems'], 3) if row['problems'] else 0
    return out


def category_stats(tstats):
    out = []
    for cat in catalog.CATEGORIES:
        rows = [tstats[t['id']] for t in catalog.TOPICS if t['category'] == cat['id']]
        attempted = sum(r['attempted'] for r in rows)
        right = sum(r['first_right'] for r in rows)
        out.append({**cat, 'problems': sum(r['problems'] for r in rows), 'attempted': attempted,
                    'solved': sum(r['solved'] for r in rows),
                    'accuracy': round(right / attempted, 3) if attempted else None})
    return out


# ---------------------------------------------------------------------------
# The review schedule
# ---------------------------------------------------------------------------
def after_answer(existing, problem_id, correct, today, manual=False):
    """The review row after an answer, or None when it does not change.

    Wrong: into the log (or back to the start of it), due in 3 days.
    Right on a due review: up a stage; past the last stage, mastered.
    Right any other time: no change — reviewing early does not count.
    """
    if manual:
        if existing and existing['status'] == 'active':
            return None
        return {'problem_id': problem_id, 'stage': 0, 'due': today.isoformat(), 'status': 'active',
                'note': (existing or {}).get('note', ''), 'misses': (existing or {}).get('misses', 0),
                'added_at': (existing or {}).get('added_at')}
    if not correct:
        return {'problem_id': problem_id, 'stage': 0,
                'due': (today + timedelta(days=INTERVALS[0])).isoformat(), 'status': 'active',
                'note': (existing or {}).get('note', ''),
                'misses': int((existing or {}).get('misses') or 0) + 1,
                'added_at': (existing or {}).get('added_at')}
    if not existing or existing['status'] != 'active' or existing['due'] > today.isoformat():
        return None
    stage = int(existing['stage']) + 1
    if stage >= len(INTERVALS):
        return {**existing, 'stage': len(INTERVALS), 'status': 'mastered'}
    return {**existing, 'stage': stage, 'due': (today + timedelta(days=INTERVALS[stage])).isoformat()}


# ---------------------------------------------------------------------------
# Contests
# ---------------------------------------------------------------------------
def score_mock(mock, answers):
    """Grade a mock. `answers` maps "1".."25" to a letter/integer or ''."""
    level = mock['level']
    rows = []
    correct = wrong = blank = 0
    for number, pid in enumerate(mock['problems'], start=1):
        problem = bank_of.get(pid)
        given = normalize_answer(problem, answers.get(str(number), ''))
        if given == '':
            result = 'blank'
            blank += 1
        elif given == str(problem['answer']):
            result = 'correct'
            correct += 1
        else:
            result = 'wrong'
            wrong += 1
        rows.append({'number': number, 'problem_id': pid, 'given': given,
                     'answer': problem['answer'], 'result': result,
                     'topic': problem['topic'], 'difficulty': problem['difficulty']})
    score = correct if level == 'AIME' else correct * 6 + blank * 1.5
    return {'score': score, 'correct': correct, 'wrong': wrong, 'blank': blank, 'rows': rows}


def mock_report(mock, graded):
    """Where the points went: by topic, and by fifth of the paper."""
    full = 1 if mock['level'] == 'AIME' else 6
    blank_pts = 0 if mock['level'] == 'AIME' else 1.5
    by_topic = {}
    for row in graded['rows']:
        t = by_topic.setdefault(row['topic'], {'topic': row['topic'],
                                               'name': catalog.TOPIC_BY_ID[row['topic']]['name'],
                                               'total': 0, 'correct': 0, 'lost': 0})
        t['total'] += 1
        if row['result'] == 'correct':
            t['correct'] += 1
        else:
            t['lost'] += full - (blank_pts if row['result'] == 'blank' else 0)
    size = 5 if mock['level'] != 'AIME' else 3
    bands = []
    for start in range(0, len(graded['rows']), size):
        chunk = graded['rows'][start:start + size]
        lost = sum(full - (blank_pts if r['result'] == 'blank' else 0) for r in chunk if r['result'] != 'correct')
        bands.append({'label': '#{}-{}'.format(start + 1, start + len(chunk)),
                      'correct': sum(1 for r in chunk if r['result'] == 'correct'),
                      'total': len(chunk), 'lost': lost})
    topics = sorted(by_topic.values(), key=lambda t: (-t['lost'], t['name']))
    return {'topics': topics, 'bands': bands}


# ---------------------------------------------------------------------------
# The study plan
# ---------------------------------------------------------------------------
def _monday(day):
    return day - timedelta(days=day.weekday())


def plan_weeks(settings, tstats, mocks_taken, today):
    """The week-by-week plan from today to the exam.

    Phases: Foundations (first ~40%), Core (~35%), Contest mode (the rest),
    and a taper in the exam's own week. Each week takes the two highest
    priority topics not yet covered — priority being how often a topic appears
    times how much of it is not yet in hand — and a mock every third week of
    Core and every week of Contest mode.
    """
    exam = date.fromisoformat(settings['exam_date'])
    level = settings['target']
    start = _monday(today)
    last = _monday(exam)
    count = max(1, (last - start).days // 7 + 1)

    relevant = [t for t in catalog.TOPICS if level in t['levels']]

    def priority(t):
        s = tstats[t['id']]
        known = (s['first_right'] / s['problems']) if s['problems'] else 0
        return t['weight'] * (1.05 - known)

    ranked = sorted(relevant, key=lambda t: (-priority(t), t['name']))
    # The AI coach's order, when there is one, goes first: it has heard what
    # the arithmetic cannot (backend/amc/coach.py). Topics it left out follow
    # in the usual order.
    coached = (settings.get('coach') or {}).get('focus_order') or []
    if coached:
        first = [t for tid in coached for t in relevant if t['id'] == tid]
        ranked = first + [t for t in ranked if t not in first]
    foundations = max(1, round(count * 0.4)) if count >= 4 else 0
    core = max(1, round(count * 0.35)) if count >= 3 else 0
    per_week = max(5, int(settings['hours']) * 6)
    taken = {m['at'][:10] for m in mocks_taken}

    weeks = []
    cursor = 0
    for i in range(count):
        week_start = start + timedelta(days=7 * i)
        if i == count - 1:
            phase = 'Taper'
        elif i < foundations:
            phase = 'Foundations'
        elif i < foundations + core:
            phase = 'Core'
        else:
            phase = 'Contest mode'
        if phase == 'Taper':
            focus = []
        else:
            focus = [ranked[(cursor + k) % len(ranked)] for k in range(2)] if ranked else []
            cursor += 2
        mock = phase == 'Contest mode' or (phase == 'Core' and (i - foundations) % 3 == 2)
        week_end = week_start + timedelta(days=6)
        mock_done = any(week_start.isoformat() <= d <= week_end.isoformat() for d in taken)
        notes = {
            'Foundations': 'Learn each focus topic, then do its easier problems untimed.',
            'Core': 'Focus topics plus review. Aim for under 3 minutes on #1-15.',
            'Contest mode': 'One timed mock, then work on what you missed.',
            'Taper': 'Light review only. Nothing new. Sleep well.',
        }
        weeks.append({
            'number': i + 1, 'start': week_start.isoformat(), 'end': week_end.isoformat(),
            'phase': phase, 'note': notes[phase],
            'focus': [{'id': t['id'], 'name': t['name'], 'category': t['category']} for t in focus],
            'problems': 0 if phase == 'Taper' else per_week,
            'mock': mock, 'mock_done': mock and mock_done,
            'current': week_start <= today <= week_end,
            'past': week_end < today,
        })
    return weeks


def today_items(settings, weeks, due_count, today, checks, practiced_today):
    """`practiced_today` is the set of problem ids practised today."""
    """The checklist for today, from the current week of the plan."""
    week = next((w for w in weeks if w['current']), weeks[0] if weeks else None)
    level = settings['target']
    daily = max(3, round((week['problems'] if week else 10) / 6)) if week and week['problems'] else 0
    ticked = set(checks.get(today.isoformat(), []))
    items = []
    if due_count:
        items.append({'key': 'review', 'label': 'Clear {} due review{}'.format(due_count, '' if due_count == 1 else 's'),
                      'to': '/review', 'auto': False})
    if week and week['focus']:
        focus = week['focus'][0]
        items.append({'key': 'read', 'label': 'Read the ideas for {}'.format(focus['name']),
                      'to': '/topics/' + focus['id'], 'auto': False})
        done = sum(1 for pid in practiced_today
                   if bank_of.get(pid) and focus['id'] in [bank_of.get(pid)['topic']] + bank_of.get(pid)['also'])
        items.append({'key': 'practice', 'label': 'Solve {} problems in {}'.format(daily, focus['name']),
                      'to': '/problems?topic=' + focus['id'], 'auto': False,
                      'progress': min(done, daily), 'goal': daily})
    if week and week['mock'] and not week['mock_done']:
        mock_id = {'AMC 10': 'step-mock-10', 'AMC 12': 'step-mock-12', 'AIME': 'step-mock-aime'}[level]
        items.append({'key': 'mock', 'label': "Sit this week's timed mock", 'to': '/contests/' + mock_id,
                      'auto': False})
    if week and week['phase'] == 'Taper':
        items.append({'key': 'formulas', 'label': 'Skim the ideas for every topic', 'to': '/topics', 'auto': False})
    for item in items:
        item['done'] = item['key'] in ticked or (
            'goal' in item and item['progress'] >= item['goal'])
    return items


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------
PAGES = [
    {'name': 'Dashboard', 'to': '/dashboard', 'words': 'home overview progress score'},
    {'name': 'Review', 'to': '/review', 'words': 'error log mistakes spaced repetition due'},
    {'name': 'Problems', 'to': '/problems', 'words': 'practice problem bank drill'},
    {'name': 'Topics', 'to': '/topics', 'words': 'topics algebra geometry number theory counting probability'},
    {'name': 'Mock Contests', 'to': '/mock-contests', 'words': 'mock contests practice test exam timed sets amc 10 amc 12 aime'},
    {'name': 'Past Contests', 'to': '/contests', 'words': 'contests past papers official exam amc aime'},
    {'name': 'Study Plan', 'to': '/study-plan', 'words': 'study plan schedule weeks calendar goal'},
    {'name': 'Analytics', 'to': '/analytics', 'words': 'analytics performance accuracy trend stats cutoff format prepare goal'},
    {'name': 'Settings', 'to': '/settings', 'words': 'settings account preferences theme'},
]


def _tokens(text):
    return [t for t in re.split(r'[^a-z0-9]+', text.lower()) if t]


def _score(query_tokens, haystack, title=''):
    hay = haystack.lower()
    head = title.lower()
    points = 0
    for tok in query_tokens:
        if tok in head:
            points += 3
        elif re.search(r'\b' + re.escape(tok), hay):
            points += 2
        elif tok in hay:
            points += 1
        else:
            return 0
    return points


def search(query, limit=20):
    """Problems, topics, contests and pages matching every word of `query`."""
    toks = _tokens(query)
    if not toks:
        return {'problems': [], 'topics': [], 'contests': [], 'pages': []}
    problems = []
    for p in bank_of.all_problems():
        topic = catalog.TOPIC_BY_ID[p['topic']]
        sources = catalog.sources(p['id'])
        hay = ' '.join([p['id'], p['level'], plain(p['statement']), topic['name'], p['topic'],
                        catalog.technique_name(p['technique']),
                        ' '.join(catalog.TOPIC_BY_ID[t]['name'] for t in p['also']),
                        ' '.join('{} {}'.format(s['name'], s['number']) for s in sources)])
        pts = _score(toks, hay, p['id'])
        if pts:
            problems.append((pts, {'id': p['id'], 'level': p['level'], 'topic_name': topic['name'],
                                   'difficulty': p['difficulty'], 'rating': p.get('rating'), 'preview': plain(p['statement'])[:140],
                                   'source': '{} #{}'.format(sources[0]['name'], sources[0]['number']) if sources else 'Drill'}))
    topics = []
    for t in catalog.TOPICS:
        pts = _score(toks, ' '.join([t['name'], t['summary'], ' '.join(t['ideas']), t['category'],
                                     catalog.CATEGORY_BY_ID[t['category']]['name']]), t['name'])
        if pts:
            topics.append((pts, {'id': t['id'], 'name': t['name'], 'summary': t['summary'],
                                 'category_name': catalog.CATEGORY_BY_ID[t['category']]['name']}))
    contests = []
    for c in catalog.MOCKS + catalog.PAST:
        name = c['name']
        pts = _score(toks, ' '.join([name, c['level'], c.get('blurb', ''), name.replace(' ', '')]), name)
        if pts:
            contests.append((pts, {'id': c['id'], 'name': name, 'level': c['level'],
                                   'kind': 'mock' if c['id'] in catalog.MOCK_BY_ID else 'past'}))
    pages = []
    for page in PAGES:
        pts = _score(toks, page['name'] + ' ' + page['words'], page['name'])
        if pts:
            pages.append((pts, {'name': page['name'], 'to': page['to']}))

    def top(rows, n):
        return [r for _, r in sorted(rows, key=lambda x: -x[0])[:n]]

    return {'problems': top(problems, limit), 'topics': top(topics, 8),
            'contests': top(contests, 8), 'pages': top(pages, 4)}

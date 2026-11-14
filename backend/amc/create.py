r"""AI-written practice problems, kept only when a second solve agrees.

A model that writes a problem and its answer in one breath gets the answer
wrong often enough to matter. So creating a problem is three steps:

1. **Write.** The model is given a level, topic, technique and target rating
   (and, for "more like this", the problem to vary) and returns a statement,
   five increasing choices (or none, for the AIME), the right answer, a
   step-by-step solution, the key insight and the common trap.
2. **Check the shape here.** Five distinct choices, a valid letter or an
   integer 0-999, balanced $...$, a known topic and technique.
3. **Solve it again, blind.** A fresh call sees only the statement and choices
   and must solve it. The problem is stored only if that answer matches; one
   rewrite is attempted when it does not.

Stored problems (table `amc_generated`) are shared by every account, served
with ids `ai-xxxxxxxx` through backend/amc/problems.py, and practiced,
reviewed and searched like any other problem.
"""
import json
import time
import uuid
from datetime import datetime

from backend.amc import ai, catalog
from backend.amc.solutions import tier
from backend.database.connection import connect

LETTERS = 'ABCDE'

WRITE_SYSTEM = """\
You write original contest problems for students preparing for the AMC 10,
AMC 12 and AIME. A problem must be new: never copy or lightly reword a real
MAA problem. It must have exactly one correct answer, be solvable by hand in
the time a real problem at that position takes, and need no diagram.

Difficulty uses the AoPS 1-10 scale: AMC 10 problems run from 1 (#1-4) to 4
(#25), AMC 12 from 1 to 4.5, AIME from 2.5 (#1) to 6.5 (#15). Match the target
rating honestly: a 1 is a quick computation, a 3 needs a real idea, a 5 needs
two ideas put together.

For an AMC problem give exactly five answer choices in increasing order (or a
sensible order for expressions), all different, with plausible wrong answers
that come from real mistakes. For an AIME problem give no choices; the answer
is an integer from 0 to 999.

Work the problem completely yourself before you answer, and make sure the
answer you give is the one your solution reaches.
""" + ai.VOICE

WRITE_SCHEMA = {
    'type': 'object',
    'properties': {
        'statement': {'type': 'string'},
        'choices': {'type': 'array', 'items': {'type': 'string'},
                    'description': 'Five choices in $...$ for an AMC problem; empty for an AIME problem.'},
        'answer': {'type': 'string', 'description': 'The letter A-E of the right choice, or the AIME integer.'},
        'solution': {'type': 'array', 'items': {'type': 'string'},
                     'description': 'Two to six steps, each one move. The last states the answer.'},
        'insight': {'type': 'string', 'description': 'The one idea that unlocks it, in a sentence.'},
        'trap': {'type': 'string', 'description': 'The most common wrong path, in a sentence.'},
    },
    'required': ['statement', 'choices', 'answer', 'solution', 'insight', 'trap'],
    'additionalProperties': False,
}

SOLVE_SYSTEM = """\
You are a careful contest solver. Solve the problem completely, checking your
work, then give the final answer only: a letter A-E for a multiple-choice
problem, or an integer 0-999 for an AIME problem."""

SOLVE_SCHEMA = {
    'type': 'object',
    'properties': {
        'work': {'type': 'string', 'description': 'Brief working.'},
        'answer': {'type': 'string'},
    },
    'required': ['work', 'answer'],
    'additionalProperties': False,
}


class CreateFailed(ai.AIUnavailable):
    pass


def _clean_answer(raw, aime):
    raw = str(raw or '').strip().upper().replace('(', '').replace(')', '')
    if aime:
        digits = ''.join(ch for ch in raw if ch.isdigit())
        if not digits or int(digits) > 999:
            return None
        return str(int(digits))
    return raw[:1] if raw[:1] in LETTERS else None


def _checked(found, level):
    """The model's draft as a problem, or None if its shape is wrong."""
    aime = level == 'AIME'
    statement = ai.text(found.get('statement'), 2500)
    choices = ai.strings(found.get('choices'), limit=5, length=200)
    answer = _clean_answer(found.get('answer'), aime)
    steps = ai.strings(found.get('solution'), limit=8, length=900)
    if not statement or not answer or len(steps) < 2:
        return None
    if aime:
        choices = None
    elif len(choices) != 5 or len(set(choices)) != 5:
        return None
    for piece in [statement] + (choices or []) + steps:
        if piece.replace('\\$', '').count('$') % 2:
            return None
    return {'statement': statement, 'choices': choices, 'answer': answer, 'solution': steps,
            'insight': ai.text(found.get('insight'), 400), 'trap': ai.text(found.get('trap'), 400)}


def _brief(level, topic, technique, rating, like):
    t = catalog.TOPIC_BY_ID[topic]
    lines = [
        'Contest: {}.'.format(level),
        'Topic: {} ({}).'.format(t['name'], t['summary']),
        'Technique it should reward: {} ({}).'.format(catalog.technique_name(technique),
                                                        catalog.TECHNIQUE_IDEA.get(technique, '')),
        'Target difficulty: {} on the AoPS 1-10 scale.'.format(rating),
    ]
    if like:
        lines.append('Write a new problem in the same spirit as this one, with different numbers and a '
                     'different setting, so that solving one helps with the other:\n' + like['statement'])
        if like.get('choices'):
            lines.append('Its choices were: ' + ' | '.join(like['choices']))
    return '\n'.join(lines)


def _solve(user, problem, level):
    text = problem['statement']
    if problem['choices']:
        text += '\n\n' + '\n'.join('({}) {}'.format(LETTERS[i], c) for i, c in enumerate(problem['choices']))
    found = ai.ask(user, SOLVE_SYSTEM, text, SOLVE_SCHEMA, instruction='Solve this problem.', max_tokens=2500)
    return _clean_answer(found.get('answer'), level == 'AIME')


def create(user, level, topic, technique='', rating=None, like=None):
    """Write, check and store one problem; return its id. Raises CreateFailed."""
    if level not in ('AMC 10', 'AMC 12', 'AIME'):
        raise CreateFailed('Choose AMC 10, AMC 12 or AIME.')
    if topic not in catalog.TOPIC_BY_ID:
        raise CreateFailed('No such topic.')
    if technique not in catalog.TECHNIQUE_FAMILY:
        technique = 'direct-computation'
    lo, hi = {'AMC 10': (1, 4), 'AMC 12': (1, 4.5), 'AIME': (2.5, 6.5)}[level]
    rating = rating if isinstance(rating, (int, float)) else (lo + hi) / 2
    rating = min(hi, max(lo, round(float(rating) * 2) / 2))

    brief = _brief(level, topic, technique, rating, like)
    for attempt in range(2):
        found = ai.ask(user, WRITE_SYSTEM, brief, WRITE_SCHEMA,
                       instruction='Write one new problem.' if attempt == 0 else
                       'Write one new problem. Your last draft’s answer did not survive an independent check, '
                       'so work it through carefully.', max_tokens=4000)
        draft = _checked(found, level)
        if not draft:
            continue
        if _solve(user, draft, level) != draft['answer']:
            continue
        return _save(user, level, topic, technique, rating, draft, like)
    raise CreateFailed('The AI could not write a problem whose answer held up to a second solve. Try again.')


def _save(user, level, topic, technique, rating, draft, like):
    pid = 'ai-' + uuid.uuid4().hex[:10]
    steps = list(draft['solution'])
    if draft['choices']:
        letter = draft['answer']
        last = r'The answer is $\textbf{(%s)}$.' % letter
    else:
        last = r'The answer is $\boxed{%03d}$.' % int(draft['answer'])
    if not steps[-1].startswith('The answer is'):
        steps.append(last)
    else:
        steps[-1] = last
    con = connect()
    try:
        with con:
            con.execute(
                'INSERT INTO amc_generated (id, created_by, level, topic, technique, rating, statement, choices, '
                'answer, solution, insight, trap, based_on, provider, created_at) '
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (pid, user, level, topic, technique, rating, draft['statement'],
                 json.dumps(draft['choices']) if draft['choices'] else None, draft['answer'],
                 json.dumps(steps), draft['insight'], draft['trap'], (like or {}).get('id', ''),
                 ai.label(), datetime.now().isoformat(timespec='seconds')))
    finally:
        con.close()
    forget()
    return pid


# ---------------------------------------------------------------------------
# Reading them back
# ---------------------------------------------------------------------------
_cache = {'rows': None, 'at': 0.0, 'source': None}


def forget():
    _cache['rows'] = None


def _source():
    from backend.config.settings import database_url
    from backend.database import connection
    return database_url() or connection.DB_PATH


def all_problems():
    if _cache['rows'] is None or time.monotonic() - _cache['at'] > 60 or _cache['source'] != _source():
        con = connect()
        try:
            rows = [dict(zip(r.keys(), tuple(r))) for r in con.execute(
                'SELECT * FROM amc_generated ORDER BY created_at, id').fetchall()]
        finally:
            con.close()
        _cache.update(rows=[_shape(r) for r in rows if r['topic'] in catalog.TOPIC_BY_ID],
                      at=time.monotonic(), source=_source())
    return _cache['rows']


def _shape(row):
    rating = float(row['rating'])
    answer = int(row['answer']) if row['level'] == 'AIME' else row['answer']
    return {
        'id': row['id'], 'level': row['level'], 'topic': row['topic'], 'also': [],
        'technique': row['technique'] if row['technique'] in catalog.TECHNIQUE_FAMILY else 'direct-computation',
        'rating': rating, 'difficulty': tier(rating),
        'statement': row['statement'], 'choices': json.loads(row['choices']) if row['choices'] else None,
        'answer': answer, 'solution': json.loads(row['solution']), 'insight': row['insight'] or '',
        'trap': row['trap'] or '', 'ai': True, 'based_on': row.get('based_on') or '',
        'created_at': row['created_at'],
    }


def get(pid):
    if not pid.startswith('ai-'):
        return None
    return next((p for p in all_problems() if p['id'] == pid), None)

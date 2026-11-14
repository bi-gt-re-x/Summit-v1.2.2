"""Problems and solutions posted by hand, written in LaTeX the way AoPS writes them.

A post is one AMC 10, AMC 12 or AIME problem with its answer and, usually, a
solution. It is stored in `amc_posts` (PostgreSQL in production, SQLite in
tests) and shared by every account. Only its author, or an importer account,
may change or delete it.

Text is saved in the site's one math convention, `$...$` inline and `$$...$$`
on its own line, so the same renderer draws it everywhere. What people paste
from AoPS (`<math>`, `<cmath>`, `\\[...\\]`, `\\(...\\)`) is converted on the
way in, and an AMC problem pasted with its choices line still in it has the
five choices pulled out, the same way an imported paper's are.
"""
import json
import re
import uuid
from datetime import datetime

from backend.amc import official
from backend.database.connection import connect

LEVELS = ('AMC 10', 'AMC 12', 'AIME')
LIMITS = {'title': 120, 'statement': 8000, 'choice': 400, 'solution': 20000}


class Invalid(ValueError):
    """A post that cannot be saved; the message is the sentence the page shows."""


def to_dollars(text):
    """AoPS math markup into `$...$` and `$$...$$`."""
    text = (text or '').replace('\r\n', '\n').strip()
    text = official._math_to_dollars(text)
    return re.sub(r'\\\((.*?)\\\)', lambda m: '$' + m.group(1).strip() + '$', text, flags=re.S)


def _unbalanced(text):
    """True when the `$` signs (not counting `\\$`) do not pair up."""
    return len(re.findall(r'(?<!\\)\$', text.replace('$$', ''))) % 2 == 1


def split(statement):
    """A pasted statement with an AoPS choices line in it, as (stem, choices)."""
    text = to_dollars(statement)
    choices, stem = official._find_choices(text)
    return (stem, choices) if choices else (text, None)


def clean(level, title, statement, choices, answer, solution):
    """The post as it will be stored, or Invalid with the reason."""
    if level not in LEVELS:
        raise Invalid('Pick AMC 10, AMC 12 or AIME.')
    title = re.sub(r'\s+', ' ', (title or '')).strip()[:LIMITS['title']]
    statement = to_dollars(statement)
    solution = to_dollars(solution)
    if not statement:
        raise Invalid('Write the problem first.')
    if len(statement) > LIMITS['statement']:
        raise Invalid('The problem is too long (8000 characters at most).')
    if len(solution) > LIMITS['solution']:
        raise Invalid('The solution is too long (20000 characters at most).')
    answer = str(answer or '').strip().upper()
    if level == 'AIME':
        choices = None
        if not re.fullmatch(r'\d{1,3}', answer):
            raise Invalid('An AIME answer is a whole number from 0 to 999.')
        answer = str(int(answer))
    else:
        choices = [to_dollars(c) for c in (choices or [])]
        if not any(choices):
            stem, found = split(statement)
            if found:
                statement, choices = stem, found
        if len(choices) != 5 or not all(choices):
            raise Invalid('An AMC problem needs all five answer choices.')
        if any(len(c) > LIMITS['choice'] for c in choices):
            raise Invalid('An answer choice is too long.')
        if len(set(choices)) != 5:
            raise Invalid('Two of the answer choices are the same.')
        if answer not in official.LETTERS:
            raise Invalid('Pick the right answer, A to E.')
    for name, text in [('problem', statement), ('solution', solution)] + [
            ('choice ' + 'ABCDE'[i], c) for i, c in enumerate(choices or [])]:
        if _unbalanced(text):
            raise Invalid('The {} has an unmatched $ sign.'.format(name))
    return {'level': level, 'title': title, 'statement': statement, 'choices': choices,
            'answer': answer, 'solution': solution}


def _row(row):
    pid, author, level, title, statement, choices, answer, solution, created, updated = tuple(row)
    return {'id': pid, 'author': author, 'level': level, 'title': title or '', 'statement': statement,
            'choices': json.loads(choices) if choices else None, 'answer': answer, 'solution': solution or '',
            'created_at': created, 'updated_at': updated}


_COLUMNS = 'id, author, level, title, statement, choices, answer, solution, created_at, updated_at'


def all_posts(level=''):
    con = connect()
    try:
        if level:
            rows = con.execute('SELECT {} FROM amc_posts WHERE level = ? ORDER BY created_at DESC'.format(_COLUMNS),
                               (level,)).fetchall()
        else:
            rows = con.execute('SELECT {} FROM amc_posts ORDER BY created_at DESC'.format(_COLUMNS)).fetchall()
    finally:
        con.close()
    return [_row(r) for r in rows]


def get(post_id):
    con = connect()
    try:
        row = con.execute('SELECT {} FROM amc_posts WHERE id = ?'.format(_COLUMNS), (post_id,)).fetchone()
    finally:
        con.close()
    return _row(row) if row else None


def _now():
    return datetime.now().isoformat(timespec='seconds')


def create(author, post):
    pid = 'post-' + uuid.uuid4().hex[:10]
    now = _now()
    con = connect()
    try:
        with con:
            con.execute('INSERT INTO amc_posts ({}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'.format(_COLUMNS),
                        (pid, author, post['level'], post['title'], post['statement'],
                         json.dumps(post['choices']) if post['choices'] else None,
                         post['answer'], post['solution'], now, now))
    finally:
        con.close()
    return get(pid)


def update(post_id, post):
    con = connect()
    try:
        with con:
            con.execute('UPDATE amc_posts SET level = ?, title = ?, statement = ?, choices = ?, answer = ?, '
                        'solution = ?, updated_at = ? WHERE id = ?',
                        (post['level'], post['title'], post['statement'],
                         json.dumps(post['choices']) if post['choices'] else None,
                         post['answer'], post['solution'], _now(), post_id))
    finally:
        con.close()
    return get(post_id)


def delete(post_id):
    con = connect()
    try:
        with con:
            con.execute('DELETE FROM amc_posts WHERE id = ?', (post_id,))
    finally:
        con.close()

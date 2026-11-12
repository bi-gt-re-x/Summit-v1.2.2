"""Reads and writes for the AMC tables (data/sql/amc.sql).

Plain SQL with `?` placeholders, which both backends speak: SQLite natively
and Postgres through backend/database/pg.py. Every function is scoped to one
account, and the account is always the signed-in one (backend/api/guard.py).
"""
import json
import uuid
from datetime import datetime

from backend.database.connection import connect


def _now():
    return datetime.now().isoformat(timespec='seconds')


def _rows(cursor):
    return [dict(zip(row.keys(), tuple(row))) for row in cursor.fetchall()]


def _read(sql, params=()):
    con = connect()
    try:
        return _rows(con.execute(sql, params))
    finally:
        con.close()


def _write(statements):
    """Run (sql, params) pairs in one transaction."""
    con = connect()
    try:
        with con:
            for sql, params in statements:
                con.execute(sql, params)
    finally:
        con.close()


# -- Attempts ---------------------------------------------------------------
def attempts(user):
    return _read('SELECT problem_id, answer, correct, seconds, source, at FROM amc_attempts '
                 'WHERE user_id = ? ORDER BY at, rowid', (user,))


def attempt_rows(user, problem_id, answer, correct, seconds, source):
    return ('INSERT INTO amc_attempts (id, user_id, problem_id, answer, correct, seconds, source, at) '
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            (uuid.uuid4().hex, user, problem_id, str(answer), 1 if correct else 0,
             int(seconds or 0), source, _now()))


# -- Reviews ----------------------------------------------------------------
def reviews(user):
    return _read('SELECT problem_id, stage, due, status, note, misses, added_at, updated_at '
                 'FROM amc_reviews WHERE user_id = ?', (user,))


def review(user, problem_id):
    rows = _read('SELECT problem_id, stage, due, status, note, misses, added_at, updated_at '
                 'FROM amc_reviews WHERE user_id = ? AND problem_id = ?', (user, problem_id))
    return rows[0] if rows else None


def review_upsert(user, row):
    """Insert or replace one account's review row (the full row is passed)."""
    now = _now()
    return [
        ('DELETE FROM amc_reviews WHERE user_id = ? AND problem_id = ?', (user, row['problem_id'])),
        ('INSERT INTO amc_reviews (user_id, problem_id, stage, due, status, note, misses, added_at, updated_at) '
         'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
         (user, row['problem_id'], int(row['stage']), row['due'], row['status'], row.get('note') or '',
          int(row.get('misses') or 0), row.get('added_at') or now, now)),
    ]


def review_delete(user, problem_id):
    _write([('DELETE FROM amc_reviews WHERE user_id = ? AND problem_id = ?', (user, problem_id))])


def review_note(user, problem_id, note):
    _write([('UPDATE amc_reviews SET note = ?, updated_at = ? WHERE user_id = ? AND problem_id = ?',
             (note, _now(), user, problem_id))])


# -- Mocks ------------------------------------------------------------------
def mocks(user):
    rows = _read('SELECT id, contest_id, kind, answers, score, correct, wrong, blank, seconds, note, at '
                 'FROM amc_mocks WHERE user_id = ? ORDER BY at DESC, rowid DESC', (user,))
    for row in rows:
        try:
            row['answers'] = json.loads(row.get('answers') or '{}')
        except ValueError:
            row['answers'] = {}
    return rows


def mock(user, mock_id):
    for row in mocks(user):
        if row['id'] == mock_id:
            return row
    return None


def mock_row(user, contest_id, kind, answers, score, correct, wrong, blank, seconds, note=''):
    mock_id = uuid.uuid4().hex
    return mock_id, (
        'INSERT INTO amc_mocks (id, user_id, contest_id, kind, answers, score, correct, wrong, blank, seconds, note, at) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (mock_id, user, contest_id, kind, json.dumps(answers), float(score), int(correct), int(wrong),
         int(blank), int(seconds or 0), note, _now()))


def mock_delete(user, mock_id):
    _write([('DELETE FROM amc_mocks WHERE user_id = ? AND id = ?', (user, mock_id))])


# -- Plan -------------------------------------------------------------------
def plan(user):
    rows = _read('SELECT target, exam_date, goal_score, hours, checks, created_at, updated_at '
                 'FROM amc_plans WHERE user_id = ?', (user,))
    if not rows:
        return None
    row = rows[0]
    try:
        row['checks'] = json.loads(row.get('checks') or '{}')
    except ValueError:
        row['checks'] = {}
    return row


def save_plan(user, target, exam_date, goal_score, hours, checks):
    now = _now()
    existing = plan(user)
    created = existing['created_at'] if existing else now
    _write([
        ('DELETE FROM amc_plans WHERE user_id = ?', (user,)),
        ('INSERT INTO amc_plans (user_id, target, exam_date, goal_score, hours, checks, created_at, updated_at) '
         'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
         (user, target, exam_date, float(goal_score), int(hours), json.dumps(checks), created, now)),
    ])


def delete_plan(user):
    _write([('DELETE FROM amc_plans WHERE user_id = ?', (user,))])


def write(statements):
    _write(statements)

"""A local demo account for the AMC prep pages, with some history on it.

    .venv-fastapi/bin/python scripts/seed_amc_demo.py           # create / refresh
    .venv-fastapi/bin/python scripts/seed_amc_demo.py --clear   # remove it

Development only. Writes to whatever database the app is configured for
(.env's DATABASE_URL, or the SQLite file), so never point it at production.

The account (below) gets: answers to about half of the Step Mock AMC 10 with a
realistic miss rate, a few misses already due for review, one graded mock, a
logged past-contest score and a study plan. Re-running replaces its AMC rows.
"""
import os
import sys
import uuid
from datetime import date, datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend.config import settings  # noqa: E402

settings.load_dotenv()

from backend.amc import catalog, engine, store  # noqa: E402
from backend.amc.bank import BY_ID  # noqa: E402
from backend.database import connection as db  # noqa: E402
from backend.tracking import auth  # noqa: E402

USERNAME = 'amc-demo'
PASSWORD = 'amc-demo-password'  # a local test value, not a real credential
TABLES = ('amc_attempts', 'amc_reviews', 'amc_mocks', 'amc_plans')


def clear():
    store.write([('DELETE FROM {} WHERE user_id = ?'.format(t), (USERNAME,)) for t in TABLES])


def ensure_account():
    existing = [u for u in db.users() if u.get('username') == USERNAME]
    if existing:
        return
    db.insert_row('users', {
        'id': db.new_id('users'), 'username': USERNAME, 'email': 'amc-demo@example.test',
        'password_hash': auth.hash_password(PASSWORD), 'email_verified': True,
        'profile_complete': True, 'xp': 0, 'level': 1, 'tasks_completed': 0, 'theme': 'light',
        'created_at': datetime.now().isoformat(timespec='seconds'),
    })


def at(days_ago, hour=17):
    return (datetime.now() - timedelta(days=days_ago)).replace(hour=hour, minute=0, second=0).isoformat(timespec='seconds')


def seed():
    ensure_account()
    clear()
    today = date.today()
    rows, reviews = [], {}
    # Problems 1-14 of the AMC 10 mock over the last two weeks; a few misses.
    misses = {'step-10-04', 'step-10-09', 'step-10-12', 'step-10-13'}
    for i, n in enumerate(range(1, 15)):
        pid = 'step-10-{:02d}'.format(n)
        p = BY_ID[pid]
        days_ago = 13 - i
        right = pid not in misses
        given = p['answer'] if right else ('A' if p['answer'] != 'A' else 'B')
        rows.append(('INSERT INTO amc_attempts (id, user_id, problem_id, answer, correct, seconds, source, at) '
                     'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                     (uuid.uuid4().hex, USERNAME, pid, given, 1 if right else 0, 60 + 20 * p['difficulty'],
                      'practice', at(days_ago))))
        if not right:
            reviews[pid] = engine.after_answer(None, pid, False, today - timedelta(days=days_ago))
    for pid in ('step-aime-01', 'step-aime-03', 'step-12-01', 'step-12-02'):
        rows.append(('INSERT INTO amc_attempts (id, user_id, problem_id, answer, correct, seconds, source, at) '
                     'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                     (uuid.uuid4().hex, USERNAME, pid, str(BY_ID[pid]['answer']), 1, 240, 'practice', at(1))))
    for row in reviews.values():
        rows += store.review_upsert(USERNAME, row)
    # One graded mock: 17 right, 3 wrong, 5 blank.
    mock = catalog.MOCK_BY_ID['step-mock-10']
    answers = {}
    for n, pid in enumerate(mock['problems'], start=1):
        if n <= 17:
            answers[str(n)] = BY_ID[pid]['answer']
        elif n <= 20:
            answers[str(n)] = 'A' if BY_ID[pid]['answer'] != 'A' else 'B'
        else:
            answers[str(n)] = ''
    graded = engine.score_mock(mock, answers)
    _, insert = store.mock_row(USERNAME, mock['id'], 'mock', answers, graded['score'], graded['correct'],
                               graded['wrong'], graded['blank'], 4200)
    rows.append(insert)
    _, logged = store.mock_row(USERNAME, '2024-amc-10a', 'logged', {}, 91.5, 0, 0, 0, 0, 'Timed, at home')
    rows.append(logged)
    store.write(rows)
    exam = date(today.year + (1 if today >= date(today.year, 11, 5) else 0), 11, 5)
    if (exam - today).days < 21:
        exam = exam.replace(year=exam.year + 1)
    store.save_plan(USERNAME, 'AMC 10', exam.isoformat(), 105, 6, {})
    print('Seeded {}. Sign in locally with the password in this script.'.format(USERNAME))


if __name__ == '__main__':
    if '--clear' in sys.argv:
        clear()
        print('Cleared AMC rows for {}.'.format(USERNAME))
    else:
        seed()

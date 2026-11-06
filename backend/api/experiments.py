"""The weekly review and the experiments it bets on.

    GET  /api/weekly_review                  the week under review, its bets and proposals
    POST /api/weekly_review                  mark the week reviewed, with a note
    POST /api/experiments                    start a test
    POST /api/experiments/{id}/stop          stop one early
    POST /api/experiments/{id}/extend        run one another week
    POST /api/experiments/{id}/decide        keep it or drop it, once it's done

The GET only reads (tests/test_get_requests_do_not_write.py): a test's result is worked
out from the tasks each time. The rules are backend/tracking/experiments.py and
backend/tracking/weekly.py.
"""
from datetime import date, datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.next import _name_of, _record, _sittings
from backend.api.reply import fail, ok
from backend.database import connection as db
from backend.tracking import experiments, priority, weekly
from backend.tracking.auth import load_user
from backend.tracking.plainwords import plain

router = APIRouter(tags=['experiments'])

#: Which goal comes first doesn't depend on the minutes, so any budget will do.
DECISION_MINUTES = 60
#: Longest note on a review, and longest title a reader can give a test.
NOTE, TITLE = 1000, 120


def _signed_in(username: str) -> bool:
    _, user = load_user((username or '').strip())
    return bool(user)


def _state(username: str):
    tasks, goals = _record(username)
    sittings = _sittings(username)
    name_of = _name_of(username)
    rows = db.topic_library_for(username)[0]
    decision = priority.decide(goals, tasks, datetime.now(), DECISION_MINUTES, sittings, name_of, rows)
    return tasks, goals, sittings, name_of, decision


def _tests(username: str):
    return db.rows_for('experiments', username)


@router.get('/api/weekly_review')
def get_weekly_review(username: str = Depends(current_username)):
    """The week under review: what moved, what stalled, and the bets."""
    if not _signed_in(username):
        return fail('Sign in to see this.')
    tasks, goals, sittings, name_of, decision = _state(username)
    return ok(**weekly.read(tasks, goals, sittings, db.rows_for('records', username), decision,
                            _tests(username), db.rows_for('weekly_reviews', username), date.today(), name_of))


class Review(BaseModel):
    note: str = ''


@router.post('/api/weekly_review')
def save_weekly_review(body: Review, username: str = Depends(current_username)):
    """Mark the week under review as done. Saving again updates the note."""
    if not _signed_in(username):
        return fail('Sign in to save this.')
    week = weekly.week_of(date.today())['start'].isoformat()
    running = [row for row in _tests(username) if (row.get('status') or 'running') == 'running']
    running.sort(key=lambda row: str(row.get('created_at') or ''), reverse=True)
    note = plain(str(body.note or '').strip())[:NOTE]
    row = {'user_id': username, 'week_start': week, 'note': note,
           'bet_id': running[0]['id'] if running else None,
           'done_at': datetime.now().isoformat(timespec='seconds')}
    if any(str(one.get('week_start'))[:10] == week for one in db.rows_for('weekly_reviews', username)):
        db.update_row('weekly_reviews', week, {'note': note, 'bet_id': row['bet_id']}, user_id=username,
                      key='week_start')
    else:
        db.insert_row('weekly_reviews', row, key='week_start')
    return ok(week_start=week)


class Start(BaseModel):
    kind: str
    params: Dict[str, Any] = {}
    goal: str = ''
    subject: str = ''
    title: str = ''
    why: str = ''
    days: int = experiments.DAYS


@router.post('/api/experiments')
def start_experiment(body: Start, username: str = Depends(current_username)):
    """Start testing a change. Refuses a duplicate, or one test too many."""
    if not _signed_in(username):
        return fail('Sign in to start a test.')
    params = {key: value for key, value in (body.params or {}).items()
              if key in ('part', 'reason', 'minutes', 'measure', 'how')}
    problem = experiments.validate(body.kind, params)
    if problem:
        return fail(problem)
    title = plain(str(body.title or '').strip())[:TITLE]
    if not title:
        return fail('Say what you want to try.')
    if body.days not in experiments.LENGTHS:
        return fail('Pick 1, 2, 3 or 4 weeks.')
    goal, subject = str(body.goal or '')[:64], str(body.subject or '')[:64]
    running = [row for row in _tests(username) if (row.get('status') or 'running') == 'running']
    today = date.today()
    live = [row for row in running if experiments.window(row, today)['ends'] >= today]
    if any(row['kind'] == body.kind and row.get('goal_id', '') == goal and row.get('subject', '') == subject
           and body.kind != 'custom' for row in live):
        return fail("You're already testing that.")
    if len(live) >= experiments.MOST_RUNNING:
        return fail('Three tests at once is the most. Finish or stop one first.')
    row = {
        'id': 'x{}'.format(int(datetime.now().timestamp() * 1000)),
        'user_id': username, 'kind': body.kind, 'params': params, 'goal_id': goal, 'subject': subject,
        'title': title, 'why': plain(str(body.why or '').strip())[:300], 'status': 'running',
        'started_on': today.isoformat(), 'ends_on': (today + timedelta(days=body.days - 1)).isoformat(),
        'created_at': datetime.now().isoformat(timespec='seconds'),
    }
    db.insert_row('experiments', row)
    return ok(id=row['id'], ends_on=row['ends_on'])


def _mine(username: str, test_id: str) -> Optional[dict]:
    return next((row for row in _tests(username) if row['id'] == test_id), None)


@router.post('/api/experiments/{test_id}/stop')
def stop_experiment(test_id: str, username: str = Depends(current_username)):
    row = _mine(username, test_id)
    if not row:
        return fail("That test isn't there any more.")
    if row.get('status') != 'running':
        return fail("That test isn't running.")
    db.update_row('experiments', test_id, {'status': 'stopped', 'decided_at': datetime.now().isoformat(timespec='seconds')},
                  user_id=username)
    return ok()


@router.post('/api/experiments/{test_id}/extend')
def extend_experiment(test_id: str, username: str = Depends(current_username)):
    """Another week, for a test that leans one way and needs more to be sure."""
    row = _mine(username, test_id)
    if not row or row.get('status') != 'running':
        return fail("That test can't be extended.")
    today = date.today()
    ends = max(experiments.window(row, today)['ends'], today) + timedelta(days=experiments.EXTEND)
    db.update_row('experiments', test_id, {'ends_on': ends.isoformat()}, user_id=username)
    return ok(ends_on=ends.isoformat())


class Decide(BaseModel):
    keep: bool


@router.post('/api/experiments/{test_id}/decide')
def decide_experiment(test_id: str, body: Decide, username: str = Depends(current_username)):
    """Keep the change or drop it. The result is written down as it stands now."""
    row = _mine(username, test_id)
    if not row or row.get('status') != 'running':
        return fail("That test isn't waiting on you.")
    today = date.today()
    if experiments.window(row, today)['ends'] >= today:
        return fail("It isn't finished yet. Stop it if you're done with it.")
    tasks, goals = _record(username)
    found = experiments.describe(row, tasks, goals, today, _name_of(username))
    db.update_row('experiments', test_id, {
        'status': 'done', 'kept': 1 if body.keep else 0, 'verdict': found['verdict'],
        'result': {key: found[key] for key in ('headline', 'chart', 'adherence', 'evidence', 'compared_with', 'sessions')},
        'decided_at': datetime.now().isoformat(timespec='seconds'),
    }, user_id=username)
    return ok(verdict=found['verdict'])

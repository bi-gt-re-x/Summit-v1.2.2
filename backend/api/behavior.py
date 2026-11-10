"""Behavior: patterns a reader is working to stop, the sessions checked against them, the fixes.

    GET  /api/behavior                  every pattern read, the summary, what Summit spotted, today's reminders
    GET  /api/behavior/for_task         the patterns a finished task can be checked against
    POST /api/behavior/add              name a pattern (with a first fix, optionally)
    POST /api/behavior/update           change its name, its words or where it shows up
    POST /api/behavior/status           open, resolved or archived
    POST /api/behavior/delete           a pattern and everything recorded for it
    POST /api/behavior/fix              start a fix (one live at a time; a new one replaces it)
    POST /api/behavior/fix/end          end the live fix, kept or dropped
    POST /api/behavior/check            log one session by hand, or change one
    POST /api/behavior/check/delete     take a logged session out
    POST /api/behavior/checks           the answers from the question after a task

The GETs only read (tests/test_get_requests_do_not_write.py): everything a pattern says is
worked out from its rows and the tasks each time. The rules are backend/tracking/behavior.py.
"""
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.next import _name_of
from backend.api.reply import fail, ok
from backend.database import connection as db
from backend.tracking import behavior
from backend.tracking.auth import load_user

router = APIRouter(tags=['behavior'])

#: What the rules read off a task.
TASK_FIELDS = ('id', 'title', 'status', 'subject', 'due_date', 'created_at', 'completed_at', 'execution',
               'difficulty', 'completion_seconds', 'reason', 'score_got', 'score_of', 'show_on_calendar')


def _signed_in(username: str) -> bool:
    _, user = load_user((username or '').strip())
    return bool(user)


def _now() -> str:
    return datetime.now().isoformat(timespec='seconds')


def _rows(username: str):
    return (db.rows_for('behaviors', username), db.rows_for('behavior_checks', username),
            db.rows_for('behavior_interventions', username))


def _mine(username: str, behavior_id) -> Optional[dict]:
    if not behavior_id:
        return None
    row = db.find_row('behaviors', str(behavior_id), user_id=username)
    return row if row and row.get('status') != 'archived' else None


def _day(raw, fallback: date) -> date:
    found = behavior._day(raw)
    return found if found and found <= fallback else fallback


def _clean_scope(scope, subject, words):
    scope = scope if scope in behavior.SCOPES else 'study'
    subject = str(subject or '').strip()[:80]
    words = behavior.words_of(words)
    if scope == 'subject' and not subject:
        return None, 'Pick the subject it shows up in.'
    if scope == 'words' and not words:
        return None, 'Add a word that tasks it shows up in are named with.'
    return {'scope': scope, 'subject': subject if scope == 'subject' else '',
            'words': ','.join(words) if scope == 'words' else ''}, None


@router.get('/api/behavior')
def get_behavior(username: str = Depends(current_username)):
    """Every pattern, read from its checks and the record, and what goes around them."""
    if not _signed_in(username):
        return fail('Sign in to see this.')
    rows, checks, fixes = _rows(username)
    tasks = db.columns_for('tasks', username, TASK_FIELDS)
    entries = db.rows_for('log_entries', username)
    insights = [row for row in db.rows_for('log_insights', username) if row.get('status') == 'active']
    today = date.today()
    name_of = _name_of(username)
    context = behavior.context_for(tasks, entries)
    shown = [row for row in rows if row.get('status') != 'archived']
    read = [behavior.describe(row, checks, fixes, tasks, context, today, name_of) for row in shown]
    order = {'identified': 0, 'intervening': 1, 'improving': 2, 'resolved': 3}
    read.sort(key=lambda one: (order[one['status']], -one['frequency']['times'], one['title'].lower()))
    return ok(
        behaviors=read,
        summary=behavior.summary(read, today),
        suggestions=behavior.suggest(tasks, insights, rows, today),
        today=behavior.reminders(shown, fixes, tasks, today),
        scopes=[{'key': key, 'label': label} for key, label in behavior.SCOPES.items()],
        statuses=[{'key': key, 'label': label} for key, label in behavior.STATUSES.items()],
        library=[{'key': one['key'], 'title': one['title'], 'how': one['how']} for one in behavior.LIBRARY],
    )


@router.get('/api/behavior/for_task')
def behavior_for_task(task_id: str = '', username: str = Depends(current_username)):
    """The open patterns a finished task can be checked against, and any answers already given."""
    task = db.find_row('tasks', str(task_id), user_id=username) if task_id else None
    if not task:
        return ok(behaviors=[])
    rows, checks, fixes = _rows(username)
    return ok(behaviors=behavior.for_task(rows, fixes, checks, task))


class AddPattern(BaseModel):
    title: str = ''
    detail: str = ''
    scope: str = 'study'
    subject: str = ''
    words: Optional[List[str]] = None
    source: str = 'own'
    source_ref: str = ''
    fix_title: str = ''
    fix_how: str = ''


@router.post('/api/behavior/add')
def add_pattern(body: AddPattern, username: str = Depends(current_username)):
    """Name a pattern to track, and optionally the first fix to try."""
    if not _signed_in(username):
        return fail('Sign in to do this.')
    title = body.title.strip()[:behavior.TITLE_MAX]
    if not title:
        return fail('Say what keeps happening.')
    rows = db.rows_for('behaviors', username)
    if sum(1 for row in rows if row.get('status') == 'open') >= behavior.RULE['most_open']:
        return fail('That\'s {} open already. Resolve or archive one first, so each gets attention.'.format(
            behavior.RULE['most_open']))
    source = body.source if body.source in behavior.SOURCES else 'own'
    ref = str(body.source_ref or '')[:80]
    if source != 'own' and any(row.get('status') != 'archived' and row.get('source') == source
                               and str(row.get('source_ref') or '') == ref for row in rows):
        return fail("You're already tracking that one.")
    place, problem = _clean_scope(body.scope, body.subject, body.words)
    if problem:
        return fail(problem)
    stamp, today = _now(), date.today().isoformat()
    row = db.insert_row('behaviors', {
        'id': str(db.new_id('behaviors')), 'user_id': username, 'title': title,
        'detail': body.detail.strip()[:behavior.DETAIL_MAX], **place, 'source': source, 'source_ref': ref,
        'status': 'open', 'identified_on': today, 'resolved_on': None, 'came_back': 0,
        'created_at': stamp, 'updated_at': stamp,
    })
    fix_title = body.fix_title.strip()[:behavior.TITLE_MAX]
    if fix_title:
        _start_fix(username, row['id'], fix_title, body.fix_how)
    return ok(id=row['id'])


class UpdatePattern(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    detail: Optional[str] = None
    scope: Optional[str] = None
    subject: Optional[str] = None
    words: Optional[List[str]] = None


@router.post('/api/behavior/update')
def update_pattern(body: UpdatePattern, username: str = Depends(current_username)):
    row = _mine(username, body.id)
    if not row:
        return fail("That pattern isn't there any more.")
    changes = {}
    if body.title is not None:
        title = body.title.strip()[:behavior.TITLE_MAX]
        if not title:
            return fail('Say what keeps happening.')
        changes['title'] = title
    if body.detail is not None:
        changes['detail'] = body.detail.strip()[:behavior.DETAIL_MAX]
    if body.scope is not None:
        place, problem = _clean_scope(body.scope, body.subject, body.words)
        if problem:
            return fail(problem)
        changes.update(place)
    if changes:
        changes['updated_at'] = _now()
        db.update_row('behaviors', row['id'], changes, user_id=username)
    return ok(id=row['id'])


class SetStatus(BaseModel):
    id: Optional[str] = None
    status: str = ''


@router.post('/api/behavior/status')
def set_status(body: SetStatus, username: str = Depends(current_username)):
    """Resolved when it's stopped, open again when it hasn't, archived to put it away."""
    row = db.find_row('behaviors', str(body.id or ''), user_id=username) if body.id else None
    if not row:
        return fail("That pattern isn't there any more.")
    if body.status not in ('open', 'resolved', 'archived'):
        return fail('Pick open, resolved or archived.')
    changes = {'status': body.status, 'updated_at': _now()}
    if body.status == 'resolved':
        changes['resolved_on'] = date.today().isoformat()
        # A fix that got it here is kept, by definition.
        _end_fix(username, row['id'], 'kept')
    elif body.status == 'open':
        changes['resolved_on'] = None
    db.update_row('behaviors', row['id'], changes, user_id=username)
    return ok(id=row['id'], status=body.status)


class PatternId(BaseModel):
    id: Optional[str] = None


@router.post('/api/behavior/delete')
def delete_pattern(body: PatternId, username: str = Depends(current_username)):
    """A pattern and every session and fix recorded for it."""
    row = db.find_row('behaviors', str(body.id or ''), user_id=username) if body.id else None
    if not row:
        return fail("That pattern isn't there any more.")
    for table in ('behavior_checks', 'behavior_interventions'):
        for one in db.rows_for(table, username):
            if str(one.get('behavior_id')) == str(row['id']):
                db.delete_row(table, one['id'], user_id=username)
    db.delete_row('behaviors', row['id'], user_id=username)
    return ok(id=row['id'])


def _live_fix(username: str, behavior_id) -> Optional[dict]:
    mine = [one for one in db.rows_for('behavior_interventions', username)
            if str(one.get('behavior_id')) == str(behavior_id) and not one.get('ended_on')]
    return mine[-1] if mine else None


def _end_fix(username: str, behavior_id, outcome: str) -> Optional[dict]:
    live = _live_fix(username, behavior_id)
    if live:
        db.update_row('behavior_interventions', live['id'],
                      {'ended_on': date.today().isoformat(), 'outcome': outcome}, user_id=username)
    return live


def _start_fix(username: str, behavior_id, title: str, how: str) -> dict:
    _end_fix(username, behavior_id, 'replaced')
    return db.insert_row('behavior_interventions', {
        'id': str(db.new_id('behavior_interventions')), 'user_id': username, 'behavior_id': str(behavior_id),
        'title': title[:behavior.TITLE_MAX], 'how': str(how or '').strip()[:behavior.DETAIL_MAX],
        'started_on': date.today().isoformat(), 'ended_on': None, 'outcome': '', 'created_at': _now(),
    })


class StartFix(BaseModel):
    id: Optional[str] = None
    title: str = ''
    how: str = ''


@router.post('/api/behavior/fix')
def start_fix(body: StartFix, username: str = Depends(current_username)):
    """Start a fix. One runs at a time, so a fix already running ends as replaced."""
    row = _mine(username, body.id)
    if not row:
        return fail("That pattern isn't there any more.")
    title = body.title.strip()
    if not title:
        return fail('Say what the fix is.')
    made = _start_fix(username, row['id'], title, body.how)
    if row.get('status') == 'resolved':
        db.update_row('behaviors', row['id'], {'status': 'open', 'resolved_on': None, 'updated_at': _now()},
                      user_id=username)
    return ok(id=made['id'])


class EndFix(BaseModel):
    id: Optional[str] = None
    outcome: str = 'dropped'


@router.post('/api/behavior/fix/end')
def end_fix(body: EndFix, username: str = Depends(current_username)):
    row = _mine(username, body.id)
    if not row:
        return fail("That pattern isn't there any more.")
    if body.outcome not in ('kept', 'dropped'):
        return fail('Say whether you kept it or dropped it.')
    if not _end_fix(username, row['id'], body.outcome):
        return fail("There's no fix running on it.")
    return ok(id=row['id'])


def _record_check(username: str, row: dict, task_id: str, day: date, times: int, used: Optional[bool],
                  label: str = '', note: str = '', check_id: Optional[str] = None) -> dict:
    """Add or change one check. A slip after a pattern was resolved opens it again."""
    times = max(0, min(50, int(times or 0)))
    live = _live_fix(username, row['id'])
    fix_id = live['id'] if live and (behavior._day(live.get('started_on')) or day) <= day else ''
    fields = {'day': day.isoformat(), 'times': times, 'used': None if used is None or not fix_id else (1 if used else 0),
              'intervention_id': fix_id, 'label': str(label or '').strip()[:behavior.LABEL_MAX],
              'note': str(note or '').strip()[:behavior.DETAIL_MAX]}
    existing = None
    if check_id:
        existing = db.find_row('behavior_checks', str(check_id), user_id=username)
    elif task_id:
        existing = next((one for one in db.rows_for('behavior_checks', username)
                         if str(one.get('behavior_id')) == str(row['id']) and str(one.get('task_id') or '') == task_id), None)
    if existing and str(existing.get('behavior_id')) == str(row['id']):
        db.update_row('behavior_checks', existing['id'], fields, user_id=username)
        saved = {**existing, **fields}
    else:
        saved = db.insert_row('behavior_checks', {
            'id': str(db.new_id('behavior_checks')), 'user_id': username, 'behavior_id': str(row['id']),
            'task_id': task_id, **fields, 'created_at': _now()})
    resolved = behavior._day(row.get('resolved_on'))
    if times > 0 and row.get('status') == 'resolved' and (resolved is None or day > resolved):
        db.update_row('behaviors', row['id'], {'status': 'open', 'resolved_on': None,
                                               'came_back': int(row.get('came_back') or 0) + 1,
                                               'updated_at': _now()}, user_id=username)
    return saved


class LogCheck(BaseModel):
    id: Optional[str] = None
    behavior_id: Optional[str] = None
    day: str = ''
    times: int = 0
    used: Optional[bool] = None
    label: str = ''
    note: str = ''


@router.post('/api/behavior/check')
def log_check(body: LogCheck, username: str = Depends(current_username)):
    """One session logged by hand: a test at school, a practice set done on paper."""
    row = _mine(username, body.behavior_id)
    if not row:
        return fail("That pattern isn't there any more.")
    if body.times < 0:
        return fail("That can't be fewer than none.")
    today = date.today()
    saved = _record_check(username, row, '', _day(body.day, today), body.times, body.used,
                          body.label, body.note, check_id=body.id)
    return ok(id=saved['id'])


@router.post('/api/behavior/check/delete')
def delete_check(body: PatternId, username: str = Depends(current_username)):
    row = db.find_row('behavior_checks', str(body.id or ''), user_id=username) if body.id else None
    if not row:
        return fail("That session isn't there any more.")
    db.delete_row('behavior_checks', row['id'], user_id=username)
    return ok(id=row['id'])


class TaskAnswer(BaseModel):
    behavior_id: Optional[str] = None
    times: Optional[int] = None
    used: Optional[bool] = None


class TaskChecks(BaseModel):
    task_id: str = ''
    checks: List[TaskAnswer] = []


@router.post('/api/behavior/checks')
def task_checks(body: TaskChecks, username: str = Depends(current_username)):
    """The answers from the question after a task: did it happen, and was the fix used.
    Only patterns the task is in scope for are kept, whatever the page sent."""
    task = db.find_row('tasks', str(body.task_id or ''), user_id=username) if body.task_id else None
    if not task:
        return fail("That task isn't there any more.")
    day = _day(task.get('completed_at'), date.today())
    saved = []
    for answer in body.checks[:8]:
        row = _mine(username, answer.behavior_id)
        if not row or answer.times is None or not behavior.in_scope(row, task):
            continue
        made = _record_check(username, row, str(task['id']), day, answer.times, answer.used)
        saved.append(made['id'])
    return ok(saved=saved)

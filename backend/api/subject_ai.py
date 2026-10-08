"""The subject page's interpretation layer, and the loop that checks it.

## Three endpoints, and only one of them costs anything

    POST /api/subject_reading      the model's reading. Costs a call.
    GET  /api/subject_recommendations   what has been recommended, and what came of it
    POST /api/subject_recommendation    the reader acted on one

The first is the expensive one and is pressed rather than automatic. The other
two are the loop around it: a recommendation nobody kept is a recommendation
whose effectiveness can never be checked, and "which kind of session actually
moves this account" is the question that makes the system more personal over
time rather than merely more talkative.

## The figures come from the client, and that is the right way round

They are the account's own numbers, computed in the browser from the account's
own tasks — `subjectState` in frontend/src/components/Subject/state.ts — and
this sends them to a model and hands the reading back to the same page that
sent them. Nothing is authorised off them and no other account can see them.

Recomputing them here would mean a second implementation of thirty figures
that would drift from the first, and the page would then be showing one set
and quoting another. The same argument `/api/subject_brief` in analytics.py
makes, at more length.

## What is stored, and why it is only this

`execution_at` — the subject's execution figure on the day the advice was
given. Held rather than recomputed, because the window the reader is looking
at moves, and a change measured against a moving baseline is not a change.
Everything else the model produced is prose over figures already on screen,
and storing prose would mean a page that quotes yesterday's numbers.
"""
import json
from datetime import datetime
from hashlib import sha1
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.database import connection as db
from backend.api.tasks import CreateTask, _create as create_task
from backend.api import subjects as user_subjects
from backend.config import subjects as subject_catalogue
from backend.tracking import next_sessions
from backend.tracking import session_plan
from backend.tracking import subject_ai
from backend.tracking.auth import load_user

router = APIRouter()

#: Long enough for a subject name, an area or a window label; short enough
#: that no single field can carry a paragraph into the prompt.
TEXT = 120

#: Rows of each kind the brief carries. The model reads better over a short
#: table than a long one, and the page draws fewer than this anyway.
DIMENSIONS = 8
RUNGS = 5
REASONS = 6
GOALS = 3
LEVERS = 4
VOCABULARY = 24

#: Recommendations kept per subject when reading them back. Enough for the
#: outcomes table to mean something, few enough that the brief stays a brief.
HISTORY = 12

#: Rows of real work the brief carries. Mirrors `SAMPLE` in
#: frontend/src/components/Subject/recentWork — the client decides which
#: forty, and this is the ceiling it is held to rather than trusted on.
WORK = 40

#: A task's own note, as much of it as goes to the model. Free text with no
#: ceiling in the database, and forty unbounded ones would be the whole
#: brief. Long enough for the sentence somebody actually writes in that box.
NOTE = 200

#: Name groups of the whole window's work, as the page counted them. Enough
#: to cover an account's distinct kinds of task in one subject; past this the
#: smallest groups are dropped by the page before they are sent.
WORK_GROUPS = 25

#: The most recommendations the panel holds at once. A batch is three, and
#: "Generate 3 more" adds a second batch under the first; past six the
#: reader is asked to act on some or start over, because a list longer than
#: that is a backlog rather than a plan.
MAX_STEPS = 6


# --------------------------------------------------------------------------
# What the page sends
# --------------------------------------------------------------------------
class Dimension(BaseModel):
    label: str = ''
    value: Optional[float] = None
    meaning: str = ''
    evidence: List[str] = []


class Rung(BaseModel):
    level: Optional[int] = None
    label: str = ''
    done: Optional[int] = None
    execution: Optional[int] = None
    quality: Optional[int] = None
    cleared: Optional[int] = None
    minutes: Optional[float] = None


class Curve(BaseModel):
    rungs: List[Rung] = []
    best: Optional[Rung] = None
    threshold: Optional[Rung] = None
    drop: Optional[int] = None


class TimeRead(BaseModel):
    known: bool = False
    typical: Optional[float] = None
    hours: Optional[float] = None
    drift: Optional[float] = None
    efficiency: Optional[int] = None
    quicker: Optional[int] = None
    rushed: Optional[int] = None
    thorough: Optional[int] = None


class MomentumRead(BaseModel):
    known: bool = False
    earlier: Optional[int] = None
    later: Optional[int] = None
    change: Optional[int] = None
    direction: str = ''


class Mistake(BaseModel):
    label: str = ''
    count: Optional[int] = None
    share: Optional[int] = None


class GoalRead(BaseModel):
    title: str = ''
    progress: Optional[int] = None
    deadline: str = ''
    standing: str = ''
    levers: List[str] = []


class WorkRow(BaseModel):
    """One finished task, as the page sampled it.

    No note here: the description is looked up on this side from `id`, so a
    field the browser is deliberately never sent (see `ANALYTICS_TASK_FIELDS`
    in api/analytics.py) does not have to travel there and back to reach the
    model.
    """

    id: str = ''
    title: str = ''
    on: str = ''
    difficulty: Optional[int] = None
    execution: Optional[int] = None
    minutes: Optional[int] = None
    reason: str = ''


class WorkGroup(BaseModel):
    """Every finished task in the window sharing one name, counted by the page.

    See `workGroups` in frontend/src/components/Subject/recentWork.ts for how
    the names are folded together and what each figure is over.
    """

    name: str = ''
    count: int = 0
    examples: List[str] = []
    rated: int = 0
    difficulty: Optional[float] = None
    execution: Optional[float] = None
    minutes: Optional[int] = None
    well: int = 0
    badly: int = 0
    reasons: List[str] = []
    last: str = ''


class SubjectStateBody(BaseModel):
    """The whole deterministic state, as the page computed it."""

    subject: str = ''
    #: The catalogue id ("music") beside the display name, for finding the
    #: tasks, notes and library items filed under it. See `_owned`.
    subject_id: str = ''
    span: str = ''
    aim: str = ''
    level: str = ''
    overall: Optional[int] = None
    finished: Optional[int] = None
    finished_before: Optional[int] = None
    rated: Optional[int] = None
    active_days: Optional[int] = None
    dimensions: List[Dimension] = []
    curve: Optional[Curve] = None
    time: Optional[TimeRead] = None
    momentum: Optional[MomentumRead] = None
    mistakes: List[Mistake] = []
    #: The relationships between everything above, worked out by the page.
    #:
    #: Passed through rather than parsed into a model of its own. Every field
    #: is arithmetic the client already did and the brief only prints — adding
    #: a schema here would mean a second copy of a shape that lives in
    #: frontend/src/components/Subject/performance, kept in step by hand. What
    #: matters is bounded before it reaches the prompt, in `brief_from`.
    performance: Dict[str, Any] = {}
    goals: List[GoalRead] = []
    #: The authored skill tree's area names. A curriculum, not a measurement —
    #: the prompt says so at length.
    vocabulary: List[str] = []
    #: The most recently finished tasks, newest first. The only input to the
    #: reading that is not a measurement, and the only one that says what the
    #: work actually is. See `_work` and the note on it.
    recent_work: List[WorkRow] = []
    #: Every finished task in the window, grouped by name and counted.
    work_groups: List[WorkGroup] = []
    #: What this call is for. `fresh` replaces the steps on screen with a new
    #: three; `more` adds three under the ones already there, up to
    #: `MAX_STEPS`; both ask for steps alone (`subject_ai.plan`). `read` is
    #: the record's own button: the whole reading, leaving any steps on screen
    #: exactly as they are, and filling them from the reading when there are
    #: none. The default, so a caller that names no mode gets what it always
    #: got.
    mode: str = 'read'


def _text(value, cap=TEXT):
    return str(value or '').strip()[:cap]


def _rung(rung):
    return None if rung is None else {
        'level': rung.level, 'label': _text(rung.label), 'done': rung.done,
        'execution': rung.execution, 'quality': rung.quality,
        'cleared': rung.cleared, 'minutes': rung.minutes,
    }


def _work(username: str, rows: List[WorkRow]):
    """The sampled tasks, bounded, with each one's own note added.

    ## Why the note is fetched here rather than sent

    `description` is the one task field the analytics endpoint deliberately
    withholds: unbounded free text on every row, which nothing on those pages
    reads, and which was most of the payload when it was included. Sending it
    to the browser so the browser could send it back would put it on the wire
    twice to reach a place it can be read from the database once.

    So the client sends ids and this joins the notes on. One indexed query,
    on the one action in the app that was already going to cost a model call.

    ## Everything is cut on this side

    The caps here are not validation theatre — the client is the thing being
    bounded. A title is a line, not a paragraph, and a note is the sentence
    somebody wrote in the box rather than the essay they could have.
    """
    kept = [row for row in rows[:WORK] if _text(row.title)]
    if not kept:
        return []

    notes = db.columns_by_ids('tasks', username,
                              [row.id for row in kept if row.id],
                              ('id', 'description'))

    out = []
    for row in kept:
        entry = {
            'title': _text(row.title),
            'on': _text(row.on, 10),
            # Absent rather than nought: a rating nobody gave is not a bad
            # one, and a minute count nobody recorded is not an instant task.
            'difficulty': row.difficulty if row.difficulty in range(1, 6) else None,
            'execution': row.execution if row.execution in range(1, 6) else None,
            'minutes': row.minutes if (row.minutes or 0) > 0 else None,
            'reason': _text(row.reason, 40),
            'note': _text((notes.get(row.id) or {}).get('description'), NOTE),
        }
        out.append(entry)
    return out


def _group(entry: WorkGroup) -> dict:
    """One name group, bounded. Absent figures stay absent rather than nought."""
    def level(value):
        return round(value, 1) if value is not None and 1 <= value <= 5 else None

    return {
        'name': _text(entry.name),
        'count': max(0, entry.count),
        'examples': [_text(title) for title in entry.examples[:4] if _text(title)],
        'rated': max(0, entry.rated),
        'difficulty': level(entry.difficulty),
        'execution': level(entry.execution),
        'minutes': entry.minutes if (entry.minutes or 0) > 0 else None,
        'well': max(0, entry.well),
        'badly': max(0, entry.badly),
        'reasons': [_text(reason, 60) for reason in entry.reasons[:3] if _text(reason)],
        'last': _text(entry.last, 10),
    }


# --------------------------------------------------------------------------
# What the reader already studies from
# --------------------------------------------------------------------------
def _owned(username: str, subject_id: str, subject: str) -> list:
    """The links this account already keeps for the subject.

    Read here rather than sent, for the reason `_work` gives: descriptions and
    note bodies never go to the browser, and this is the one action that was
    going to cost a model call anyway. Tasks are newest first, so a link from
    this week's work outranks one from last year's. Picking the links out is
    `subject_ai.owned_resources`.
    """
    wanted = {value.strip().lower() for value in
              (subject_id, subject, subject.replace(' ', '_')) if value.strip()}
    if not wanted:
        return []

    tasks = [row for row in db.columns_for(
                 'tasks', username, ('id', 'subject', 'title', 'description'),
                 order='rowid DESC')
             if str(row.get('subject') or '').strip().lower() in wanted]
    task_ids = {row.get('id') for row in tasks}

    def filed_here(note):
        ids = {part.strip().lower() for part in
               str(note.get('subject_ids') or '').split(',') if part.strip()}
        return bool(ids & wanted) or note.get('task_id') in task_ids

    notes = [row for row in db.columns_for(
                 'notes', username, ('title', 'body', 'subject_ids', 'task_id'),
                 order='rowid DESC')
             if filed_here(row)]

    def tagged_here(item):
        tags = item.get('tags')
        if isinstance(tags, str):
            try:
                tags = json.loads(tags or '[]')
            except ValueError:
                tags = []
        named = {str(tag).strip().lower() for tag in (tags or [])}
        return not item.get('archived') and bool(named & wanted)

    library = [row for row in db.rows_for('library_items', username)
               if tagged_here(row)]

    return subject_ai.owned_resources(
        [row for row in tasks if 'http' in str(row.get('description') or '')],
        [row for row in notes if 'http' in str(row.get('body') or '')],
        library)


#: What a reading holds when nothing has been read yet — the shape the page
#: draws, empty, so a plan with no reading around it still draws.
EMPTY_READING = {'diagnosis': [], 'priorities': [], 'next_steps': [], 'insights': []}


def _saved_reading(username: str, subject: str) -> dict:
    """The saved reading for this subject, or an empty one."""
    row = next((row for row in db.rows_for('subject_readings', username)
                if (row.get('subject') or '') == subject), None)
    if not row:
        return dict(EMPTY_READING)
    try:
        read = json.loads(row.get('body') or '')
    except (TypeError, ValueError):
        return dict(EMPTY_READING)
    return {**EMPTY_READING, **read} if isinstance(read, dict) else dict(EMPTY_READING)


def _saved_steps(username: str, subject: str) -> list:
    """The steps on the reader's screen: the saved reading's, newest batch last."""
    steps = _saved_reading(username, subject).get('next_steps')
    return [step for step in (steps or []) if isinstance(step, dict)][:MAX_STEPS]


# --------------------------------------------------------------------------
# What has been recommended before
# --------------------------------------------------------------------------
def _history(username: str, subject: str):
    """This subject's recommendations, newest first."""
    rows = [row for row in db.rows_for('subject_recommendations', username)
            if (row.get('subject') or '') == subject]
    rows.sort(key=lambda row: row.get('given_at') or '', reverse=True)
    return rows[:HISTORY]


def _outcomes(rows, execution_now):
    """How each kind of session has gone for this account.

    One row per kind, with how many were given, how many were acted on, and
    what execution has done since — against `execution_at`, the figure held on
    the day the advice was given, rather than against a window that has moved.

    Counted here rather than by the model, because it is arithmetic. The model
    is handed the answer and asked what to make of it, which is the division
    the whole feature is built on.
    """
    by_kind = {}
    for row in rows:
        kind = row.get('kind') or 'targeted_practice'
        entry = by_kind.setdefault(kind, {'type': kind, 'given': 0, 'taken': 0,
                                          'moves': []})
        entry['given'] += 1
        if row.get('taken_at'):
            entry['taken'] += 1
            was = row.get('execution_at')
            if was is not None and execution_now is not None:
                entry['moves'].append(execution_now - was)

    out = []
    for entry in by_kind.values():
        moves = entry.pop('moves')
        # Only the ones that were actually acted on can say anything about
        # what acting on them did. A kind recommended six times and never
        # taken has no change to report, and reporting nought would read as
        # "it did not work" rather than "it was never tried".
        entry['change'] = round(sum(moves) / len(moves)) if moves else None
        out.append(entry)
    return sorted(out, key=lambda entry: -entry['given'])


# --------------------------------------------------------------------------
# The reading
# --------------------------------------------------------------------------
@router.get('/api/subject_reading')
def reading_available(username: str = Depends(current_username)):
    """Whether the button can do anything, asked before it is drawn."""
    _, user = load_user(username)
    if not user:
        return fail('User not found')
    return ok(available=subject_ai.configured())


@router.post('/api/subject_reading')
def write_reading(body: SubjectStateBody, username: str = Depends(current_username)):
    """A model's reading of one subject's state, and what to do next.

    Every failure comes back as a readable message rather than an error
    status, because the page prints it in the panel — the same contract
    `/api/subject_brief` keeps. A reading that cannot be made is not a broken
    request; the analytics under it were already complete.

    The recommendations that come back are stored, and only them. See the note
    at the top of this file.
    """
    _, user = load_user(username)
    if not user:
        return fail('User not found')

    subject = _text(body.subject)
    if not subject:
        return fail('There is no subject to read.')

    execution_now = next(
        (int(entry.value) for entry in body.dimensions
         if entry.label.lower() == 'execution' and entry.value is not None),
        None)

    history = _history(username, subject)
    # So a planned session finished since the last visit counts as taken.
    _sync(username, history)
    curve = body.curve

    mode = body.mode if body.mode in ('fresh', 'more', 'read') else 'read'
    on_screen = _saved_steps(username, subject) if mode in ('more', 'read') else []
    if mode == 'more' and len(on_screen) >= MAX_STEPS:
        return fail('Six is the most this holds at once. Act on some of these, '
                    'or start over with a fresh three.')

    state = {
        'subject': subject,
        'span': _text(body.span),
        'aim': _text(body.aim, TEXT * 2),
        'level': _text(body.level, TEXT * 2),
        'overall': body.overall,
        'finished': body.finished,
        'finished_before': body.finished_before,
        'rated': body.rated,
        'active_days': body.active_days,
        'dimensions': [
            {'label': _text(entry.label), 'value': entry.value,
             'meaning': _text(entry.meaning, TEXT * 2),
             'evidence': [_text(item) for item in entry.evidence[:4]]}
            for entry in body.dimensions[:DIMENSIONS]
        ],
        'curve': {
            'rungs': [_rung(rung) for rung in curve.rungs[:RUNGS]],
            'best': _rung(curve.best),
            'threshold': _rung(curve.threshold),
            'drop': curve.drop,
        } if curve else {},
        'time': body.time.model_dump() if body.time else {},
        'momentum': body.momentum.model_dump() if body.momentum else {},
        'mistakes': [entry.model_dump() for entry in body.mistakes[:REASONS]],
        'performance': body.performance or {},
        'goals': [
            {'title': _text(goal.title), 'progress': goal.progress,
             'deadline': _text(goal.deadline), 'standing': _text(goal.standing),
             'levers': [_text(item, TEXT * 3) for item in goal.levers[:LEVERS]]}
            for goal in body.goals[:GOALS]
        ],
        'vocabulary': [_text(item, 60) for item in body.vocabulary[:VOCABULARY]],
        'recent_work': _work(username, body.recent_work),
        'work_groups': [_group(entry) for entry in body.work_groups[:WORK_GROUPS]
                        if _text(entry.name)],
        'previous': [
            {'title': row.get('title'), 'type': row.get('kind'),
             'difficulty': row.get('difficulty'), 'minutes': row.get('minutes'),
             'on': (row.get('given_at') or '')[:10]}
            for row in history[:6]
        ],
        'outcomes': _outcomes(history, execution_now),
        'showing': [_text(step.get('title')) for step in on_screen],
        'owned_resources': _owned(username, _text(body.subject_id), subject),
    }

    # The record's button asks for the whole reading. The Recommendations
    # panel asks for steps alone, from a smaller brief, and keeps whatever
    # reading is already saved around them — see `subject_ai.plan`.
    try:
        if mode == 'read':
            read = subject_ai.read(state)
        else:
            read = {**_saved_reading(username, subject),
                    'next_steps': subject_ai.plan(state)}
    except subject_ai.BriefUnavailable as exc:
        return fail(str(exc))

    # ---- Keep the recommendations, and only them -------------------------
    now = datetime.now().isoformat(timespec='seconds')
    span = _text(body.span, 64)

    # The record's own button wants findings, not a new plan: the steps on
    # screen stay, and nothing is added to the ledger.
    if mode == 'read' and on_screen:
        read['next_steps'] = on_screen
        _keep_reading(username, subject, read, now, span)
        return ok(reading=read)

    # A second batch goes under the first, without repeating a title already
    # there, and never past MAX_STEPS.
    seen = {str(step.get('title') or '').strip().lower() for step in on_screen}
    room = MAX_STEPS - len(on_screen) if mode == 'more' else MAX_STEPS
    fresh = []
    for step in read.get('next_steps') or []:
        key = step['title'].strip().lower()
        if key in seen or len(fresh) >= min(room, subject_ai.NEXT_STEPS):
            continue
        seen.add(key)
        fresh.append(step)

    kept = _record(username, subject, fresh, now, execution_now)
    read['next_steps'] = (on_screen + kept) if mode == 'more' else kept
    _keep_reading(username, subject, read, now, span)
    return ok(reading=read)


def _record(username: str, subject: str, steps: list, now: str,
            execution_now=None) -> list:
    """Put new steps in the ledger, and hand them back with their ids."""
    kept = []
    for at, step in enumerate(steps):
        row = {
            'id': 'r{}{}'.format(int(datetime.now().timestamp() * 1000), at),
            'user_id': username,
            'subject': subject,
            'given_at': now,
            'title': step['title'],
            'focus': step['focus'],
            'kind': step['type'],
            'difficulty': step['difficulty'],
            'minutes': step['minutes'],
            'reason': step['reason'],
            'signal': step.get('signal', ''),
            'execution_at': execution_now,
        }
        db.insert_row('subject_recommendations', row)
        kept.append({**step, 'id': row['id']})
    return kept


# --------------------------------------------------------------------------
# Surviving a refresh
# --------------------------------------------------------------------------
# A reading costs a call, and until now it lived in a `useState` — so reloading
# the page threw away work the reader had paid for, and the panel came back
# empty with the button still offering to do it again. The steps were on record
# the whole time, in `subject_recommendations`, but that table is a ledger of
# what was advised rather than a copy of what was written: no diagnosis, no
# priorities, no insights, no drills. A page rebuilt from it would come back
# missing three sections out of four.
#
# So the whole answer is kept, one row per subject, and the page asks for it on
# load. The ledger next door is untouched and still never rewritten.
def _keep_reading(username: str, subject: str, read: dict, when: str,
                  span: str = '') -> None:
    """Hold this reading as the current one for this subject.

    Replaces rather than appends. This is a restore point for a panel, not a
    history — the history is `subject_recommendations`, which is what the
    outcome loop reads and the one nothing overwrites.

    A failure here is deliberately silent. The reading has already been made
    and is already on its way back to the page; losing the ability to restore
    it after a refresh is not worth turning a call that worked into an error.
    """
    try:
        body = json.dumps(read)
    except (TypeError, ValueError):
        return

    fields = {'user_id': username, 'subject': subject, 'span': span,
              'written_at': when, 'body': body}
    # Found by subject rather than by the id derived below: the table is one
    # row per (user, subject), and an id hashed from the username stops
    # matching the moment the account is renamed — after which an insert hits
    # that constraint and the reading the model just wrote is lost.
    existing = next((row for row in db.rows_for('subject_readings', username)
                     if (row.get('subject') or '') == subject), None)
    if existing:
        db.update_row('subject_readings', existing['id'], fields, user_id=username)
        return
    row_id = 'sr{}'.format(sha1(
        '{}|{}'.format(username, subject).encode('utf-8')).hexdigest()[:24])
    db.insert_row('subject_readings', {'id': row_id, **fields})


@router.get('/api/subject_reading_saved')
def saved_reading(subject: str = '', username: str = Depends(current_username)):
    """The last reading written for this subject, if there is one.

    `reading` comes back null rather than absent when there is none: the page
    has to tell "nothing has been asked for yet" from "the request failed",
    and those two read the same if the key simply goes missing.
    """
    _, user = load_user(username)
    if not user:
        return fail('User not found')

    name = _text(subject)
    if not name:
        return ok(reading=None, written_at='', span='')

    row = next((row for row in db.rows_for('subject_readings', username)
                if (row.get('subject') or '') == name), None)
    if not row:
        return ok(reading=None, written_at='', span='')

    try:
        read = json.loads(row.get('body') or '')
    except (TypeError, ValueError):
        # A row that cannot be read is a row that is not there. It is not
        # deleted: the next reading replaces it anyway, and a corrupt cache is
        # worth leaving in place long enough to be noticed.
        return ok(reading=None, written_at='', span='')

    return ok(reading=read, written_at=row.get('written_at') or '',
              span=row.get('span') or '')


# --------------------------------------------------------------------------
# The loop
# --------------------------------------------------------------------------
def _sync(username: str, rows: list, persist: bool = True) -> dict:
    """Each recommendation's state, read off the task it was planned as.

    A step planned as a session is locked to that task. Finished, it counts as
    taken (stamped here, if completion got there first); deleted, the link is
    dropped and the step can be planned again; still open, it stays planned.
    Read on every listing rather than hooked into each way a task can be
    deleted, so no path can leave a step locked to a task that is gone.

    Returns {id: {'state', 'task'}} where state is open, planned or done.

    `persist=False` works the same answer out without writing it down, for
    the GETs: a GET never writes (tests/test_get_requests_do_not_write.py).
    The next POST that reads these rows (a reading, a plan, a suggestion)
    writes it.
    """
    linked = [row for row in rows if row.get('task_id') and not row.get('taken_at')]
    tasks = db.columns_by_ids('tasks', username, [row['task_id'] for row in linked],
                              ('id', 'status', 'created_at', 'due_date',
                               'completed_at', 'xp_value')) if linked else {}
    out = {}
    for row in rows:
        if row.get('taken_at'):
            out[row['id']] = {'state': 'done', 'task': None}
            continue
        task = tasks.get(row.get('task_id')) if row.get('task_id') else None
        if row.get('task_id') and not task:
            if persist:
                db.update_row('subject_recommendations', row['id'], {'task_id': None},
                              user_id=username)
            row['task_id'] = None
        if not task:
            out[row['id']] = {'state': 'open', 'task': None}
        elif task.get('status') == 'done':
            row['taken_at'] = (task.get('completed_at')
                               or datetime.now().isoformat(timespec='seconds'))
            if persist:
                db.update_row('subject_recommendations', row['id'],
                              {'taken_at': row['taken_at']}, user_id=username)
            out[row['id']] = {'state': 'done', 'task': None}
        else:
            out[row['id']] = {'state': 'planned', 'task': {
                'id': task.get('id'), 'start': task.get('created_at') or '',
                'end': task.get('due_date') or '',
                'xp': task.get('xp_value') or 0}}
    return out


@router.get('/api/subject_recommendations')
def list_recommendations(subject: str = '', username: str = Depends(current_username)):
    """What has been recommended for this subject, and how each kind has gone."""
    _, user = load_user(username)
    if not user:
        return fail('User not found')

    name = _text(subject)
    rows = _history(username, name)
    states = _sync(username, rows, persist=False)
    return ok(
        recommendations=[
            {'id': row.get('id'), 'title': row.get('title'),
             'focus': row.get('focus'), 'type': row.get('kind'),
             'difficulty': row.get('difficulty'), 'minutes': row.get('minutes'),
             'reason': row.get('reason'), 'signal': row.get('signal') or '',
             'on': (row.get('given_at') or '')[:10],
             'taken': bool(row.get('taken_at')),
             'taken_on': (row.get('taken_at') or '')[:10],
             # Execution on the day it was advised. The page holds the figure
             # for now and reads the two against each other — which is the
             # whole of "did this work", and it needs both ends or neither.
             'was': row.get('execution_at'),
             'task_id': row.get('task_id'),
             'state': states[row['id']]['state'],
             'task': states[row['id']]['task']}
            for row in rows
        ],
        outcomes=_outcomes(rows, None),
    )


class PlanSession(BaseModel):
    id: str = ''
    #: The catalogue id the page is showing, for filing the task. Checked by
    #: the task API's own `_subject`, so a stale one is dropped, not stored.
    subject_id: str = ''


@router.post('/api/subject_recommendation/plan')
def plan_session(body: PlanSession, username: str = Depends(current_username)):
    """Book one recommended session onto the calendar as a task.

    The minutes, the XP and the slot are `session_plan`'s rules. The step is
    then locked to the task: it cannot be planned a second time until that
    task is deleted (and it opens again) or completed (and it counts as done).
    """
    _, user = load_user(username)
    if not user:
        return fail('User not found')

    row = db.find_row('subject_recommendations', _text(body.id), user_id=username)
    if not row:
        return fail('That recommendation is no longer on record.')

    state = _sync(username, [row])[row['id']]['state']
    if state == 'planned':
        return fail('This session is already planned. Complete or delete that task '
                    'to plan another.')
    if state == 'done':
        return fail('This session is already done.')

    minutes = session_plan.estimate_minutes(row.get('minutes'), row.get('difficulty'))
    xp = session_plan.xp_for(minutes, row.get('difficulty'))
    now = datetime.now()
    busy = session_plan.busy_spans(
        db.columns_for('tasks', username, ('show_on_calendar', 'created_at', 'due_date')),
        db.calendar_document(username), now)
    slot = session_plan.next_slot(minutes, busy, now)
    if not slot:
        return fail('There is no free {}-minute slot in the next two weeks.'.format(minutes))
    start, end = slot

    # A session planned across every subject names its subject in `focus`
    # (subject_ai.OVERALL_NOTE); file it there when the page had none to send.
    subject_id = _text(body.subject_id, 64)
    if not subject_id and row.get('subject') == next_sessions.OVERALL:
        subject_id = next_sessions.subject_named(row.get('focus'), _subject_names(username)) or ''

    made = create_task(CreateTask(
        name=row.get('title') or 'Practice session',
        priority=session_plan.priority_for(xp),
        xp_reward=xp,
        due_date=end.isoformat(timespec='seconds'),
        created_at=start.isoformat(timespec='seconds'),
        show_on_calendar=True,
        subject=subject_id or None,
    ), username)
    task_id = made.get('task_id') if isinstance(made, dict) else None
    if not task_id:
        return fail('Could not add that session. Try again.')

    # What to actually do, from the step as it was written, onto the task.
    step = next((one for one in _saved_steps(username, row.get('subject') or '')
                 if one.get('id') == row['id']), {})
    note = ' · '.join(_text(step.get(key), 200) for key in ('problems', 'pace', 'resource')
                      if _text(step.get(key)))
    if note:
        db.update_row('tasks', task_id, {'description': note}, user_id=username)

    db.update_row('subject_recommendations', row['id'], {'task_id': task_id},
                  user_id=username)
    return ok(id=row['id'], task={'id': task_id,
                                  'start': start.isoformat(timespec='seconds'),
                                  'end': end.isoformat(timespec='seconds'),
                                  'xp': xp, 'subject': subject_id}, minutes=minutes)


class TakeRecommendation(BaseModel):
    id: str = ''
    #: The task this became, when the reader made one from it.
    task_id: str = ''


@router.post('/api/subject_recommendation')
def take_recommendation(body: TakeRecommendation,
                        username: str = Depends(current_username)):
    """Record that the reader acted on one.

    The half of the loop that makes the other half worth anything: without it
    every recommendation reads as untaken, and "this kind of session did not
    work" is indistinguishable from "this kind of session was never tried".
    """
    _, user = load_user(username)
    if not user:
        return fail('User not found')

    row_id = _text(body.id)
    if not row_id:
        return fail('There is no recommendation to record.')

    found = db.find_row('subject_recommendations', row_id, user_id=username)
    if not found:
        return fail('That recommendation is no longer on record.')

    db.update_row('subject_recommendations', row_id, {
        'taken_at': datetime.now().isoformat(timespec='seconds'),
        'task_id': _text(body.task_id, 64),
    }, user_id=username)
    return ok(id=row_id)


# --------------------------------------------------------------------------
# Three next sessions, from the dashboard and the Recommendations tab
# --------------------------------------------------------------------------
# The subject page's panel, offered where there is no subject page behind it:
# for any one subject, or across all of them ("All subjects"). The brief is
# counted here from the tasks (backend/tracking/next_sessions) rather than
# sent, because neither page has the figures the subject page sends. The
# steps go in the same ledger and the same saved reading as the subject
# page's, keyed by the subject's name — so three planned for Mathematics on
# the dashboard are the three the Mathematics page shows, and planning and
# "I did this" are the endpoints above.
TASK_COLUMNS = ('id', 'title', 'description', 'status', 'subject', 'completed_at',
                'completion_seconds', 'difficulty', 'execution', 'reason',
                'created_at', 'due_date', 'show_on_calendar')


def _subject_names(username: str) -> dict:
    """Every subject this account can file under, id to name."""
    names = {entry['id']: entry['name'] for entry in subject_catalogue.SUBJECTS}
    for subject_id, row in user_subjects._rows(username).items():
        if row.get('custom'):
            names[subject_id] = row.get('name') or subject_id
    return names


def _steps_with_state(username: str, subject: str) -> list:
    """The steps on screen for a subject, each with where it stands."""
    steps = _saved_steps(username, subject)
    if subject == next_sessions.OVERALL:
        steps = [next_sessions.unbracket(step) for step in steps]
    states = _sync(username, _history(username, subject), persist=False)
    return [{**step, 'state': (states.get(step.get('id')) or {}).get('state', 'open'),
             'task': (states.get(step.get('id')) or {}).get('task')}
            for step in steps]


@router.get('/api/next_sessions')
def list_next_sessions(subject_id: str = '', username: str = Depends(current_username)):
    """The sessions already suggested for a subject (or every subject, with no
    id), the subjects there is work in to choose from, and whether a model is
    there to suggest more."""
    _, user = load_user(username)
    if not user:
        return fail('User not found')
    names = _subject_names(username)
    subject_id = _text(subject_id, 64)
    if subject_id and subject_id not in names:
        return fail('That subject is not one of yours.')
    subject = names[subject_id] if subject_id else next_sessions.OVERALL
    tasks = db.columns_for('tasks', username, ('status', 'title', 'subject', 'completed_at'))
    return ok(subject=subject, subject_id=subject_id,
              steps=_steps_with_state(username, subject),
              subjects=next_sessions.subjects_in(tasks, names),
              available=subject_ai.configured())


class NextSessionsBody(BaseModel):
    subject_id: str = ''


@router.post('/api/next_sessions')
def suggest_next_sessions(body: NextSessionsBody, username: str = Depends(current_username)):
    """Three new sessions for a subject, or across every subject, replacing the
    ones on screen. Costs a model call."""
    _, user = load_user(username)
    if not user:
        return fail('User not found')
    names = _subject_names(username)
    subject_id = _text(body.subject_id, 64)
    if subject_id and subject_id not in names:
        return fail('That subject is not one of yours.')
    subject = names[subject_id] if subject_id else next_sessions.OVERALL

    tasks = db.columns_for('tasks', username, TASK_COLUMNS)
    state = next_sessions.state_for(tasks, subject_id or None, subject, names)
    if not state['finished']:
        return fail('There is no finished work {} in the last {} days to plan from yet.'.format(
            'in ' + subject if subject_id else 'anywhere', next_sessions.WINDOW_DAYS))

    history = _history(username, subject)
    _sync(username, history)
    state.update({
        'previous': [
            {'title': row.get('title'), 'type': row.get('kind'),
             'difficulty': row.get('difficulty'), 'minutes': row.get('minutes'),
             'on': (row.get('given_at') or '')[:10]}
            for row in history[:6]
        ],
        'outcomes': _outcomes(history, None),
        'showing': [],
        'owned_resources': _owned(username, subject_id, subject) if subject_id else [],
    })

    try:
        steps = subject_ai.plan(state, overall=not subject_id)
    except subject_ai.BriefUnavailable as exc:
        return fail(str(exc))
    if not subject_id:
        steps = [next_sessions.unbracket(step) for step in steps]

    now = datetime.now().isoformat(timespec='seconds')
    kept = _record(username, subject, steps[:subject_ai.NEXT_STEPS], now)
    _keep_reading(username, subject, {**_saved_reading(username, subject), 'next_steps': kept},
                  now, state['span'])
    return ok(subject=subject, subject_id=subject_id,
              steps=[{**step, 'state': 'open', 'task': None} for step in kept])

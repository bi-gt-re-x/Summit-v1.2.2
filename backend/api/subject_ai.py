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


class SubjectStateBody(BaseModel):
    """The whole deterministic state, as the page computed it."""

    subject: str = ''
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


def _text(value, cap=TEXT):
    return str(value or '').strip()[:cap]


def _rung(rung):
    return None if rung is None else {
        'level': rung.level, 'label': _text(rung.label), 'done': rung.done,
        'execution': rung.execution, 'quality': rung.quality,
        'cleared': rung.cleared, 'minutes': rung.minutes,
    }


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
    curve = body.curve

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
        'previous': [
            {'title': row.get('title'), 'type': row.get('kind'),
             'difficulty': row.get('difficulty'), 'minutes': row.get('minutes'),
             'on': (row.get('given_at') or '')[:10]}
            for row in history[:6]
        ],
        'outcomes': _outcomes(history, execution_now),
    }

    try:
        read = subject_ai.read(state)
    except subject_ai.BriefUnavailable as exc:
        return fail(str(exc))

    # ---- Keep the recommendations, and only them -------------------------
    now = datetime.now().isoformat(timespec='seconds')
    kept = []
    for at, step in enumerate(read.get('next_steps') or []):
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

    read['next_steps'] = kept
    _keep_reading(username, subject, read, now, _text(body.span, 64))
    return ok(reading=read)


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

    row_id = 'sr{}'.format(sha1(
        '{}|{}'.format(username, subject).encode('utf-8')).hexdigest()[:24])
    fields = {'user_id': username, 'subject': subject, 'span': span,
              'written_at': when, 'body': body}
    if db.find_row('subject_readings', row_id, user_id=username):
        db.update_row('subject_readings', row_id, fields, user_id=username)
    else:
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
@router.get('/api/subject_recommendations')
def list_recommendations(subject: str = '', username: str = Depends(current_username)):
    """What has been recommended for this subject, and how each kind has gone."""
    _, user = load_user(username)
    if not user:
        return fail('User not found')

    name = _text(subject)
    rows = _history(username, name)
    return ok(
        recommendations=[
            {'id': row.get('id'), 'title': row.get('title'),
             'focus': row.get('focus'), 'type': row.get('kind'),
             'difficulty': row.get('difficulty'), 'minutes': row.get('minutes'),
             'reason': row.get('reason'), 'signal': row.get('signal') or '',
             'on': (row.get('given_at') or '')[:10],
             'taken': bool(row.get('taken_at')), 'task_id': row.get('task_id')}
            for row in rows
        ],
        outcomes=_outcomes(rows, None),
    )


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

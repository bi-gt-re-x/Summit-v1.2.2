"""Focus — the dashboard's Focus panel and the calendar's Weekly Focus Time.

There is no /focus page yet: the timer is a panel on the dashboard. What it
needs from the server is a place to mirror each day's total into, and a way to
read those totals back for a date range.

Two ways in, and the difference between them matters:

    /api/focus_sync   the timer mirroring itself. Takes the larger of what is
                      held and what is sent, so a stale tab cannot shrink a day.
    /api/focus_log    a person typing in work they did and did not track. Adds.

They are not the same claim — see `log_day` in backend/tracking/focus.py — so
they are not the same endpoint with a flag.

The sittings are the third thing: one row per focus sitting, with the task it
was for, which the Timer page reads. They used to live only in the browser
that ran them, so a second device or a cleared cache started from nothing.

    /api/focus/sittings         GET the newest; POST the ones the server lacks
    /api/focus/sittings/amend   what came of one sitting's intention
"""
import re
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.tracking import focus as focus_tracking

router = APIRouter(tags=['focus'])

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')

# A day can hold at most 24h of focus, and a daily goal is 30 min to 12 hours.
MAX_FOCUS_SECONDS = 86400.0
MIN_GOAL_HOURS = 0.5
MAX_GOAL_HOURS = 12.0


class FocusSync(BaseModel):
    date: Optional[str] = None
    # Read as strings-or-numbers and coerced below, so junk lands on the
    # "Invalid focus values" reply rather than a 422 the client can't read.
    focused_seconds: Optional[object] = 0
    goal_hours: Optional[object] = 2.0


@router.post('/api/focus_sync')
def focus_sync(body: FocusSync, username: str = Depends(current_username)):
    """Mirror a day's focus total from the client into the account."""
    day = str(body.date or '')

    if not username or not DATE_RE.match(day):
        return fail('Username and date required')

    try:
        seconds = max(0.0, min(MAX_FOCUS_SECONDS, float(body.focused_seconds)))
        goal_hours = max(MIN_GOAL_HOURS, min(MAX_GOAL_HOURS, float(body.goal_hours)))
    except (TypeError, ValueError):
        return fail('Invalid focus values')

    record = focus_tracking.record_day(username, day, seconds, goal_hours)
    if record is None:
        return fail('User not found')
    return ok(focus=record)


class FocusLog(BaseModel):
    """One past day's work, typed in rather than timed.

    Read as strings-or-numbers for the same reason FocusSync is: junk should
    land on a reply the client can read rather than on a 422 it cannot.
    """
    date: Optional[str] = None
    #: How long, in minutes. The dashboard asks in hours and minutes and adds
    #: them up before sending, because one figure is one thing to validate.
    minutes: Optional[object] = 0
    #: The goal to give the day, used only if it has no row yet.
    goal_hours: Optional[object] = 2.0


#: The most one catch-up entry may claim. A day holds 24 hours and a person
#: typing 2000 into a minutes box has slipped, not worked.
MAX_LOG_MINUTES = 1440.0


@router.post('/api/focus_log')
def focus_log(body: FocusLog, username: str = Depends(current_username)):
    """Add hand-entered focus time to one past day.

    This is what the dashboard's catch-up prompt writes: the reader is asked
    what they did on the days since they were last here, and the answer lands
    in the same table the timer writes to, so it reaches consistency, the
    focus score, the growth series and every "days you worked" count in the
    app without any of them needing to know where it came from.
    """
    day = str(body.date or '')

    if not username or not DATE_RE.match(day):
        return fail('Username and date required')

    try:
        minutes = max(0.0, min(MAX_LOG_MINUTES, float(body.minutes)))
        goal_hours = max(MIN_GOAL_HOURS, min(MAX_GOAL_HOURS, float(body.goal_hours)))
    except (TypeError, ValueError):
        return fail('Invalid focus values')

    if minutes <= 0:
        return fail('Nothing to log')

    record = focus_tracking.log_day(username, day, minutes * 60.0, goal_hours)
    if record is None:
        return fail('User not found')
    return ok(focus=record)


@router.get('/api/focus_history')
def focus_history(username: str = Depends(current_username), start: str = '', end: str = ''):
    """Tracked focus for a date range: {iso: {seconds, goal_hours}}.

    The calendar's Weekly Focus Time panel reads this to show focused time
    against the time that was planned.
    """

    days = focus_tracking.history_range(username, start or '', end or '')
    if days is None:
        return fail('User not found')
    return ok(days=days)


# --------------------------------------------------------------------------
# The sittings
# --------------------------------------------------------------------------
#: Ceilings on what one request may claim. A sitting is a pomodoro: the longest
#: style the timer has is 90 minutes, so 600 is a slip, not a sitting.
MAX_SITTING_MINUTES = 600
MAX_SITTINGS_PER_POST = 200
SITTING_TEXT_MAX = 200
ID_RE = re.compile(r'^[A-Za-z0-9_.:-]{1,80}$')
READINESS = {'low', 'normal', 'high'}
KINDS = {'deep', 'speed', 'learning', 'repetition', 'experiment', 'challenge', 'recovery'}


class Sitting(BaseModel):
    """One sitting, in the browser's own field names (see `Interval` in
    frontend/src/components/Timer/intervals.ts)."""
    id: str
    day: str
    styleId: str
    planned: float = 0
    minutes: float = 0
    pauses: int = 0
    finished: bool = False
    at: Optional[float] = None
    breaks: List[int] = Field(default_factory=list)
    taskId: Optional[str] = None
    taskTitle: Optional[str] = None
    intent: Optional[str] = None
    target: Optional[float] = None
    done: Optional[float] = None
    met: Optional[bool] = None
    readiness: Optional[str] = None
    kind: Optional[str] = None


class SittingBatch(BaseModel):
    sittings: List[Sitting] = Field(default_factory=list)


class SittingAnswer(BaseModel):
    id: str = ''
    done: Optional[float] = None
    met: Optional[bool] = None


def _text(value):
    value = (value or '').strip()
    return value[:SITTING_TEXT_MAX] or None


def _clean_sitting(sitting: Sitting):
    """The sitting, bounded, or None if it cannot be a real one."""
    if not ID_RE.match(sitting.id) or not DATE_RE.match(sitting.day):
        return None
    minutes = int(round(max(0.0, min(MAX_SITTING_MINUTES, sitting.minutes))))
    planned = int(round(max(0.0, min(MAX_SITTING_MINUTES, sitting.planned))))
    return {
        'id': sitting.id,
        'day': sitting.day,
        'styleId': sitting.styleId.strip()[:40] or 'classic',
        'planned': planned,
        'minutes': minutes,
        'pauses': max(0, min(999, sitting.pauses)),
        'finished': sitting.finished,
        'at': int(sitting.at) if sitting.at and sitting.at > 0 else None,
        'breaks': [max(0, min(MAX_SITTING_MINUTES, at)) for at in sitting.breaks[:50]],
        'taskId': _text(sitting.taskId),
        'taskTitle': _text(sitting.taskTitle),
        'intent': _text(sitting.intent),
        'target': sitting.target if sitting.target and sitting.target > 0 else None,
        'done': sitting.done if sitting.done is not None and sitting.done >= 0 else None,
        'met': sitting.met,
        'readiness': sitting.readiness if sitting.readiness in READINESS else None,
        'kind': sitting.kind if sitting.kind in KINDS else None,
    }


@router.get('/api/focus/sittings')
def focus_sittings(username: str = Depends(current_username)):
    """The account's newest sittings, oldest first."""
    sittings = focus_tracking.sittings_for(username)
    if sittings is None:
        return fail('User not found')
    return ok(sittings=sittings)


@router.post('/api/focus/sittings')
def save_focus_sittings(body: SittingBatch, username: str = Depends(current_username)):
    """Store the sittings this browser has that the account does not.

    Safe to send again: rows are keyed by the id the browser gave them, so a
    retry after a dropped connection adds nothing twice. Rows that fail the
    bounds are skipped rather than failing the batch, because one bad row from
    an old build must not stop the rest of somebody's record going up.
    """
    if len(body.sittings) > MAX_SITTINGS_PER_POST:
        return fail('Too many sessions at once')
    clean = [row for row in (_clean_sitting(s) for s in body.sittings) if row]
    added = focus_tracking.save_sittings(username, clean)
    if added is None:
        return fail('User not found')
    return ok(added=added)


@router.post('/api/focus/sittings/amend')
def amend_focus_sitting(body: SittingAnswer, username: str = Depends(current_username)):
    """Record what came of one sitting's intention."""
    if not ID_RE.match(body.id or ''):
        return fail('Which session?')
    done = body.done if body.done is not None and body.done >= 0 else None
    if not focus_tracking.amend_sitting(username, body.id, done=done, met=body.met):
        return fail("That session doesn't exist.")
    return ok(id=body.id)

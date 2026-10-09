"""The calendar — Month, Week and Day views over the same data.

Everything the three views need is here: the entries and events themselves
(backed by tracking/event.py), the per-day focus note the views share, the XP a
day earned (straight from the ledger, so "XP Earned" always means "since 12 AM
today"), and the palette bookkeeping that keeps two events from looking alike.
"""
import re
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.database import connection as db
from backend.tracking import event as event_tracking
from backend.tracking import focus as focus_tracking
from backend.tracking import xp as xp_tracking

router = APIRouter(tags=['calendar'])

DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


# --------------------------------------------------------------------------
# What the endpoints accept
#
# The two recurrence fields are hyphenated on the wire — that spelling is
# already in the database and in every calendar script — so they are aliased
# rather than renamed. `populate_by_name` lets the Python name work too.
# --------------------------------------------------------------------------
class CalendarEntry(BaseModel):
    id: Optional[str] = None
    date: str = ''
    time_block: str = ''
    task_id: Optional[str] = None


class CreateCalendarEvent(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = None
    date: Optional[str] = None
    time_block: Optional[str] = None
    recurrence_month: Optional[str] = Field(default=None, alias='recurrence-month')
    recurrence_week: Optional[str] = Field(default=None, alias='recurrence-week')
    end_date: Optional[str] = None


class SyncTaskToCalendar(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    task_id: Optional[str] = None
    date: Optional[str] = None
    time_block: Optional[str] = None
    recurrence_month: Optional[str] = Field(default=None, alias='recurrence-month')
    recurrence_week: Optional[str] = Field(default=None, alias='recurrence-week')
    end_date: Optional[str] = None
    name: Optional[str] = None


class MarkTaskCompleted(BaseModel):
    task_id: Optional[str] = None


class AddEventColor(BaseModel):
    color: Optional[str] = None


class DayFocus(BaseModel):
    date: Optional[str] = None
    text: str = ''


class CalendarDocument(BaseModel):
    """The whole calendar for one account, as the views hold it.

    `data` is not modelled further on purpose. It is the client's own store —
    day keys to a list of blocks — and every field in it (start and end times,
    subtasks, XP, a colour family, two legacy colour spellings) exists because
    some calendar written over the last two years put it there. Declaring a
    stricter shape here would mean this endpoint silently dropping whatever it
    had not been told about, which is the exact failure it was added to stop.
    """
    data: dict = Field(default_factory=dict)


# --------------------------------------------------------------------------
# Entries
# --------------------------------------------------------------------------
@router.get('/api/calendar')
def list_entries(username: str = Depends(current_username)):
    return ok(entries=event_tracking.entries_for(username))


@router.post('/api/calendar')
def create_entry(body: CalendarEntry, username: str = Depends(current_username)):
    entry_id = event_tracking.create_entry(username, body.model_dump())
    return ok(entry_id=entry_id)


@router.put('/api/calendar/{entry_id}')
def update_entry(entry_id: str, body: CalendarEntry,
                 username: str = Depends(current_username)):
    # Only the fields actually sent are applied, so the tracker is handed the
    # ones this request mentioned rather than every default.
    changes = body.model_dump(include=body.model_fields_set)
    if not event_tracking.update_entry(entry_id, username, changes):
        return fail('Calendar entry not found')
    return ok()


@router.delete('/api/calendar/{entry_id}')
def delete_entry(entry_id: str, username: str = Depends(current_username)):
    event_tracking.delete_entry(entry_id, username or None)
    return ok()


# --------------------------------------------------------------------------
# Events and task sync
# --------------------------------------------------------------------------
@router.post('/api/create_calendar_event')
def create_event(body: CreateCalendarEvent,
                 username: str = Depends(current_username)):
    if not body.name or not body.date or not body.time_block:
        return fail('Name, date, and time_block required')

    return event_tracking.create_event(
        username, body.name, body.date, body.time_block,
        recurrence_month=body.recurrence_month,
        recurrence_week=body.recurrence_week,
        end_date=body.end_date,
    )


@router.delete('/api/delete_calendar_event/{event_id}')
def delete_event(event_id: str, username: str = Depends(current_username)):
    return event_tracking.delete_event(event_id, username)


@router.get('/api/get_default_events')
def get_default_events(username: str = Depends(current_username)):
    return ok(events=event_tracking.default_events())


@router.get('/api/get_custom_events')
def get_custom_events(username: str = Depends(current_username)):
    return ok(events=event_tracking.custom_events(username))


@router.post('/api/sync_task_to_calendar')
def sync_task_to_calendar(body: SyncTaskToCalendar, username: str = Depends(current_username)):
    if not body.task_id or not username or not body.date:
        return fail('Task ID, username, and date required')

    return event_tracking.sync_task(
        body.task_id, username, body.date,
        time_block=body.time_block,
        recurrence_month=body.recurrence_month,
        recurrence_week=body.recurrence_week,
        end_date=body.end_date,
        name=body.name,
    )


@router.post('/api/mark_task_completed_in_calendar')
def mark_task_completed_in_calendar(body: MarkTaskCompleted, username: str = Depends(current_username)):
    if not body.task_id or not username:
        return fail('Task ID and username required')
    return event_tracking.mark_task_completed(body.task_id, username)


@router.get('/api/get_calendar_progress')
def get_calendar_progress(username: str = Depends(current_username)):
    return event_tracking.progress_for(username)


# --------------------------------------------------------------------------
# Event colours
# --------------------------------------------------------------------------
@router.get('/api/get_event_colors')
def get_event_colors(username: str = Depends(current_username)):
    """The colours already in use, so the client can pick a distinct new one."""
    return ok(colors=event_tracking.colors())


@router.post('/api/add_event_color')
def add_event_color(body: AddEventColor,
                    username: str = Depends(current_username)):
    colors = event_tracking.add_color(body.color)
    if colors is None:
        return fail('Invalid color', status=400)
    return ok(colors=colors)


# --------------------------------------------------------------------------
# What a day amounted to
# --------------------------------------------------------------------------
@router.get('/api/day_focus')
def get_day_focus(username: str = Depends(current_username)):
    """Every saved day-focus note for a user, keyed by ISO date."""
    notes = focus_tracking.day_notes(username)
    if notes is None:
        return fail('User not found')
    return ok(day_focus=notes)


@router.post('/api/day_focus')
def set_day_focus(body: DayFocus, username: str = Depends(current_username)):
    """Upsert one day's focus text; an empty text deletes the entry."""
    day = str(body.date or '')
    text = str(body.text or '').strip()[:200]

    if not username or not DATE_RE.match(day):
        return fail('Username and date required')
    if not focus_tracking.set_day_note(username, day, text):
        return fail('User not found')
    return ok(date=day, text=text)


# --------------------------------------------------------------------------
# The calendar itself
# --------------------------------------------------------------------------
# Until this pair existed, every event any user of this app had ever made lived
# in their browser's localStorage under `calendarData:<account>` and nowhere
# else. The month, week and day views never called the endpoints above, so
# clearing site data — or opening the app in a second browser — was a calendar
# that had never existed. The server held seven rows, all of them defaults.
#
# The endpoints above are not a home for it. They model the old coarse
# calendar: a `time_block` of 'morning', a recurrence spelled "mon, tue, wed",
# no start or end time, no subtasks, no XP, no colour. Writing the store
# through them would have dropped four fields per event on the way, so what was
# needed was somewhere to put the shape that exists — see
# `calendar_documents` in data/sql/events.sql.


@router.get('/api/calendar_store')
def get_calendar_store(username: str = Depends(current_username)):
    """One account's calendar, or `{}` if the server has never been sent one.

    An empty answer is what an account that predates this endpoint gets, and it
    is the signal the client migrates on: it means "the browser's copy is the
    only copy", not "this calendar is empty".
    """
    return ok(data=db.calendar_document(username))


@router.put('/api/calendar_store')
def put_calendar_store(body: CalendarDocument,
                       username: str = Depends(current_username)):
    """Replace one account's calendar.

    Whole-document, because that is how the client holds and edits it. There is
    no merge here and there should not be: two browsers editing one calendar is
    last-write-wins, which is what the localStorage version already was, only
    now the loser can at least get their copy back from the other machine.
    """
    db.save_calendar_document(username, body.data)
    return ok()


@router.get('/api/xp_earned_on')
def xp_earned_on(username: str = Depends(current_username), date: str = ''):
    """XP a user earned on one calendar day, straight from the ledger."""
    day = str(date or '')
    if not username or not DATE_RE.match(day):
        return fail('Username and date required')

    totals = xp_tracking.earned_on(username, day)
    return ok(date=day, **totals)

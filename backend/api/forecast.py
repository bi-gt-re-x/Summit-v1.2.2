"""Goal forecast: will each dated goal finish in time at the current pace.

Two calls. The GET is a read (tests/test_get_requests_do_not_write.py): one
forecast per active goal with a date, nearest first. The POST books the
sessions a forecast says this week is short, through the same booking as the
plan's deadline row (backend/api/next.py `book_for_goal`). The count is worked
out again here, never taken from the page. The rules are
backend/tracking/forecast.py.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.next import _name_of, _record, _sittings, book_for_goal
from backend.api.reply import fail, ok
from backend.tracking import forecast as forecast_tracking
from backend.tracking import record
from backend.tracking.auth import load_user

router = APIRouter(tags=['forecast'])

def _read(username):
    tasks, goals = _record(username)
    return tasks, goals, _sittings(username)


@router.get('/api/goal_forecast')
def goal_forecast(username: str = Depends(current_username)):
    """Each dated goal: when it'd finish at this pace, and what gets it there."""
    _, user = load_user((username or '').strip())
    if not user:
        return fail('Sign in to see your goal dates.')
    now = datetime.now()
    tasks, goals, sittings = _read(username)
    return ok(goals=forecast_tracking.forecasts(goals, tasks, sittings, now.date(), _name_of(username)))


class BookForecast(BaseModel):
    goal_id: Optional[str] = None


@router.post('/api/goal_forecast/book')
def book_forecast(body: BookForecast, username: str = Depends(current_username)):
    """Book the sessions this week is short of for one goal, one a day."""
    _, user = load_user((username or '').strip())
    if not user:
        return fail('Sign in to book sessions.')
    now = datetime.now()
    tasks, goals, sittings = _read(username)
    goal = next((row for row in goals if str(row.get('id')) == str(body.goal_id or '')), None)
    if not goal or goal.get('status') != 'active' or not record._day(goal.get('deadline')):
        return fail("That goal isn't active any more.")
    found = forecast_tracking.forecast(goal, tasks, sittings, now.date())
    if not found['to_book']:
        return fail('This week already has the sessions this goal needs.')
    read = record.read_goal(goal, tasks, now, sittings=sittings)
    booked, title, minutes = book_for_goal(username, goal, read, found['to_book'], now)
    if not booked:
        return fail("There's no free {}-minute slot in the next two weeks.".format(minutes))
    return ok(booked=booked, title=title, minutes=minutes)

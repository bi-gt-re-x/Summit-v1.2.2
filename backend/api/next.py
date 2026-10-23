"""What to do next — the one list, for every page that suggests anything.

The dashboard shows its top item and the analytics page's Recommendations tab
shows the plan in full, both from here, so the two cannot disagree. The rules
are backend/tracking/next_actions.py.
"""
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.goals import _measure_of, _milestones_of
from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.config import subjects as catalogue
from backend.database import connection as db
from backend.goal_matcher import store as goal_store
from backend.api.tasks import CreateTask, _create as create_task
from backend.tracking import growth
from backend.tracking import next_actions
from backend.tracking import record
from backend.tracking import session_plan
from backend.tracking.auth import load_user

router = APIRouter(tags=['next'])

#: What the rules read off a task, and nothing else. Twenty thousand rows on
#: the largest account, so whole rows — descriptions included — would be most
#: of this endpoint's time.
TASK_FIELDS = ('id', 'title', 'status', 'subject', 'priority', 'due_date', 'created_at',
               'completed_at', 'execution', 'difficulty', 'xp_value', 'completion_seconds',
               'milestone_id', 'goal_id', 'reason', 'score_got', 'score_of')

#: The two weeks the streak rule reads: today, and the run before it.
# Four weeks, so this fortnight can be read against the one before it.
RECENT_DAYS = 28


def _name_of(username):
    """Subject id → the name a reader knows it by: the catalogue's, or the
    account's own subject's, or the id itself."""
    own = {row['subject_id']: row.get('name') for row in db.user_subjects()
           if row.get('user_id') == username}

    def name_of(subject_id):
        known = catalogue.BY_ID.get(subject_id)
        if known:
            return known['name']
        return own.get(subject_id) or subject_id
    return name_of


def _record(username):
    """The rows the rules read: tasks with their goal links, goals with their
    measure and checkpoints."""
    tasks = goal_store.with_goal_ids(username, db.columns_for('tasks', username, TASK_FIELDS))
    goals = db.rows_for('goals', username)
    stones = db.rows_for('goal_milestones', username)
    for goal in goals:
        goal['measure'] = _measure_of(goal)
        goal['milestones'] = _milestones_of(stones, goal.get('id'))
    return tasks, goals


#: What the goal forecast reads off a focus timer (backend/tracking/forecast.py).
SITTING_FIELDS = ('id', 'day', 'minutes', 'task_id')


def _sittings(username):
    """Focus timers, which the forecast counts as sessions on a goal."""
    return db.columns_for('focus_sittings', username, SITTING_FIELDS)


def _practice(username):
    """The review queue and the skill tree summary, for the plan's rows about
    what's due to redo and what to practice next. Imported here because both
    of those modules import this one."""
    from backend.api.review import read_queue
    from backend.api.skill_plan import summary
    attempts = db.rows_for('skill_attempts', username, order='at, rowid')
    review = read_queue(username, attempts=attempts)
    return review, summary(username, review=review, attempts=attempts)


@router.get('/api/next_actions')
def get_next_actions(budget: int = next_actions.DEFAULT_BUDGET,
                     username: str = Depends(current_username)):
    """The plan for `budget` minutes, what did not fit, and the lens it was
    read through."""
    _, user = load_user((username or '').strip())
    if not user:
        return fail('Sign in to see what to do next.')
    budget = max(5, min(240, int(budget or next_actions.DEFAULT_BUDGET)))

    tasks, goals = _record(username)

    series = growth.series(username, RECENT_DAYS) or {}
    days = series.get('growth_data') or []

    lens = next_actions.leading_lens(goals, tasks)
    review, skills = _practice(username)
    plan = next_actions.build_plan(tasks, goals, days, _name_of(username), budget,
                                   now=datetime.now(), lens=lens,
                                   daily_goal=user.get('daily_goal'), best_streak=user.get('best_streak'),
                                   sittings=_sittings(username), review=review, skills=skills)
    return ok(plan=plan, lens=lens, budgets=list(next_actions.BUDGETS))


class BookSessions(BaseModel):
    goal_id: Optional[str] = None


def book_for_goal(username, goal, read, count, now):
    """Put `count` sessions for a goal on the calendar, one a day.

    Each goes in the first free slot of its day (session_plan.next_slot),
    named for the goal's next step and linked to the goal and its current
    checkpoint so the work counts toward it. `read` is record.read_goal's.
    Returns (booked, title, minutes); `booked` is empty when nothing fit.
    Shared by the plan's deadline row and the goal forecast
    (backend/api/forecast.py).
    """
    minutes = next_actions.SESSION_MINUTES
    xp = session_plan.xp_for(minutes, 3)
    title = read['next_step'] or read['checkpoint'] or '{}: practice'.format(goal.get('title') or 'Goal')
    busy = session_plan.busy_spans(
        db.columns_for('tasks', username, ('show_on_calendar', 'created_at', 'due_date')),
        db.calendar_document(username), now)
    booked, cursor = [], now
    for _ in range(count):
        slot = session_plan.next_slot(minutes, busy, cursor)
        if not slot:
            break
        start, end = slot
        made = create_task(CreateTask(
            name=title, priority=session_plan.priority_for(xp), xp_reward=xp,
            due_date=end.isoformat(timespec='seconds'), created_at=start.isoformat(timespec='seconds'),
            show_on_calendar=True, subject=(read['subjects'] or [None])[0],
            goal_id=str(goal.get('id')), milestone_id=read['checkpoint_id'],
        ), username)
        task_id = made.get('task_id') if isinstance(made, dict) else None
        if not task_id:
            break
        booked.append({'task_id': task_id, 'start': start.isoformat(timespec='minutes'),
                       'end': end.isoformat(timespec='minutes')})
        busy = sorted(busy + [(start, end)])
        # The next one on a later day: three sittings in one afternoon is a
        # cram, not a week.
        cursor = (start + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return booked, title, minutes


@router.post('/api/next_actions/book')
def book_sessions(body: BookSessions, username: str = Depends(current_username)):
    """Put the sittings a dated goal needs this week on the calendar.

    The deadline row says "book 3 sessions"; this is the button. How many, how
    long and what each is called are worked out again here from the record
    (backend/tracking/record.py), not taken from the request, so a stale page
    cannot book a week that is already done. One a day, each in the first free
    slot of its day (session_plan.next_slot), linked to the goal and its
    current checkpoint so the work counts toward it.
    """
    _, user = load_user((username or '').strip())
    if not user:
        return fail('Sign in to book sessions.')
    tasks, goals = _record(username)
    goal = next((row for row in goals if str(row.get('id')) == str(body.goal_id or '')), None)
    if not goal or goal.get('status') != 'active':
        return fail("That goal isn't active any more.")

    now = datetime.now()
    read = record.read_goal(goal, tasks, now, sittings=_sittings(username))
    if not read['to_book']:
        return fail('This week already has the sessions this goal needs.')

    booked, title, minutes = book_for_goal(username, goal, read, read['to_book'], now)
    if not booked:
        return fail("There's no free {}-minute slot in the next two weeks.".format(minutes))
    return ok(booked=booked, title=title, minutes=minutes)


class ClearLeftovers(BaseModel):
    task_ids: List[str] = []


@router.post('/api/next_actions/clear')
def clear_leftovers(body: ClearLeftovers, username: str = Depends(current_username)):
    """Delete the leftover routines the triage row named.

    Only ids that are still leftovers by the rule in
    backend/tracking/record.py `leftovers` (open, past their date, and a title
    written three or more times) are removed. Anything else in the request is
    ignored, so a page holding an old list cannot delete a task that was
    finished, moved, or never a routine.
    """
    _, user = load_user((username or '').strip())
    if not user:
        return fail('Sign in to clear tasks.')
    tasks, _ = _record(username)
    allowed = {str(task.get('id')) for task in record.leftovers(tasks, datetime.now().date())}
    cleared = [task_id for task_id in dict.fromkeys(str(one) for one in body.task_ids)
               if task_id in allowed and db.delete_row('tasks', task_id, user_id=username)]
    return ok(cleared=cleared)

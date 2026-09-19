"""Tasks — everything the dashboard's task list does.

Tasks are the unit of work the whole app is built on: they carry the XP, they
drive the streak, and completing one is the single moment that moves an
account forward. That moment is `/api/complete_task`, which in one pass:

  * stamps the task done and records how long it took and whether it beat its
    deadline (the growth report card's efficiency metric reads those);
  * awards the XP, recalculates the level and extends the streak;
  * writes a row to the XP ledger;
  * counts the completion toward the user's "complete N tasks" goals.

The older /api/add_task and /api/delete_task endpoints are kept because older
scripts still call them.
"""
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.goals import apply_task_completion
from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.api import subjects as user_subjects
from backend.config import subjects as subject_catalogue
from backend.database import connection as db
from backend.goal_matcher import service as goal_matcher
from backend.goal_matcher import store as goal_store
from backend.tracking import xp as xp_tracking
from backend.tracking.auth import load_user

router = APIRouter(tags=['tasks'])


# --------------------------------------------------------------------------
# What the endpoints accept
# --------------------------------------------------------------------------
class CreateTask(BaseModel):
    id: Optional[str] = None
    name: str = ''
    priority: str = 'medium'
    xp_reward: int = 0
    due_date: Optional[str] = None
    show_on_calendar: bool = True
    created_at: Optional[str] = None
    subject: Optional[str] = None
    #: What this task is execution for. Both columns have existed since
    #: data/sql/tasks.sql was written and everything that *reads* a link —
    #: goal health, Next Moves, the goals page's per-goal action list — has
    #: always read them; nothing could ever set one, so the only linked tasks
    #: on any account arrived by another route. Accepted here so a task can be
    #: created from the goal it belongs to. Verified against the caller's own
    #: rows in `_link`, never trusted.
    goal_id: Optional[str] = None
    milestone_id: Optional[str] = None


class UpdateTask(BaseModel):
    """Every field is optional and only the ones actually sent are applied —
    which is why this uses `model_fields_set` rather than truthiness below.
    `completed: false` has to be distinguishable from "not mentioned"."""
    name: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    xp_reward: Optional[int] = None
    timer_duration: Optional[Any] = None
    due_date: Optional[str] = None
    completed: Optional[bool] = None
    subject: Optional[str] = None
    #: What this task is execution for. Same pair as CreateTask, and the reason
    #: a task can be linked after the fact: the row on the tasks page is where
    #: somebody notices that what they just wrote down is work toward a goal.
    #: Sending `goal_id: null` clears the link — `_link` returns a pair of Nones
    #: for a missing goal, which is the same answer it gives for a bad one.
    goal_id: Optional[str] = None
    milestone_id: Optional[str] = None


class DeleteTask(BaseModel):
    id: Optional[str] = None


class TaskId(BaseModel):
    task_id: Optional[str] = None


class UpdateDueDate(BaseModel):
    id: Optional[str] = None
    due_date: Optional[str] = None


class CompleteTask(BaseModel):
    task_id: Optional[str] = None


class RateTask(BaseModel):
    """What the person thought of a task they just finished.

    Every field is optional and independent: the prompt asks two or three
    questions depending on the account's `rating_depth`, and a reader is
    allowed to answer one of them. See `rate_task`.
    """

    task_id: Optional[str] = None
    #: How hard it was, 1-5. Null means not answered.
    difficulty: Optional[int] = None
    #: How well it went, 1-5. Null means not answered.
    execution: Optional[int] = None
    #: The one thing that made the difference, from REASONS below. Only asked
    #: at rating_depth 'reasons'.
    reason: Optional[str] = None


#: What a star rating is allowed to be, both ends inclusive.
RATING_RANGE = (1, 5)

#: The third question's answers, and the only ones that may be stored.
#:
#: A fixed vocabulary rather than a text box, and that is the whole point of
#: it. "Why did that go the way it did" is only worth asking if the answers can
#: be counted afterwards — twelve spellings of "I got distracted" are twelve
#: findings of one task each, which is no finding at all. Six on each side is
#: enough to cover the usual causes and short enough to read at the moment
#: somebody has just finished something and wants to move on.
#:
#: Which side is asked follows the execution star: a task that went badly is
#: asked what made it hard, one that went well is asked what made it go well.
#: See components/Tasks/RatePrompt.
REASONS = {
    'struggle': ('distracted', 'unclear', 'underestimated',
                 'no-time', 'low-energy', 'interrupted'),
    'went-well': ('prepared', 'deep-focus', 'momentum',
                  'broken-down', 'fresh', 'familiar'),
}

#: Every valid answer, flat. Which side a reason belongs to is recoverable from
#: REASONS, so the stored value is the reason alone.
ALL_REASONS = REASONS['struggle'] + REASONS['went-well']


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _parse_dt(raw):
    """A datetime from any of the shapes a stored date can take.

    Due dates may be local ISO ("...T11:00:00") or a UTC ISO string with a
    trailing 'Z' (from JS toISOString()); strip the 'Z' so both parse.
    """
    if isinstance(raw, str) and raw.endswith('Z'):
        raw = raw[:-1]
    for fmt in ('%Y-%m-%dT%H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S',
                '%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
        try:
            return datetime.strptime(raw, fmt)
        except (ValueError, TypeError):
            continue
    return None


def _delete(task_id, username=None):
    """Remove one task, scoped to its owner. True if there was one to remove.

    A DELETE, where this was a read of every task in the table and a rewrite of
    all of them minus one.
    """
    return db.delete_row('tasks', task_id, user_id=username)


def _subject(raw, username=None):
    """A subject id this account may file a task under, or None.

    Two things can recognise one: the catalogue, and the account's own list of
    subjects it made itself (backend/api/subjects.py). Anything else — a stale
    id from an older build, a typo, a value someone posted by hand — is dropped
    rather than stored. A task with no subject is a perfectly ordinary task, so
    there is nothing to fail here; storing a value nothing can draw an icon for
    would be the worse outcome.

    The account is asked for by name because a custom subject belongs to one:
    without it, one user's `own_thesis_plan` would validate against another's.
    Called with no username the catalogue is the only answer, which is the
    behaviour this had before custom subjects existed.
    """
    found = subject_catalogue.get(raw)
    if found:
        return found['id']
    if username and raw and raw in user_subjects.own_ids(username):
        return raw
    return None


def _link(goal_id, milestone_id, username):
    """A goal and checkpoint this account actually owns, or a pair of Nones.

    Both ids come from a request body, so neither is taken on the caller's word:
    an id naming somebody else's goal, or a checkpoint that belongs to a
    different goal than the one sent, is dropped rather than stored. Dropped and
    not rejected, for the reason `_subject` gives — a task worth creating is
    still worth creating without the link, and failing the whole write over a
    stale id would lose the thing the person actually typed.
    """
    goals = {g['id']: g for g in db.goals() if g.get('user_id') == username}
    goal = goals.get(goal_id) if goal_id else None
    if not goal:
        return None, None

    if not milestone_id:
        return goal['id'], None

    stone = next(
        (
            m for m in db.goal_milestones()
            if m.get('id') == milestone_id
            and m.get('user_id') == username
            and m.get('goal_id') == goal['id']
        ),
        None,
    )
    return goal['id'], (stone['id'] if stone else None)


def _create(body: CreateTask, username: str):
    """Shared by POST /api/tasks and its older name, /api/add_task.

    `username` is passed in rather than resolved here: this is a plain
    function, and a Depends() default on one is a Depends object sitting
    where a name should be. The two routes above own the dependency."""

    goal_id, milestone_id = _link(body.goal_id, body.milestone_id, username)

    task_id = body.id or db.new_id('tasks')
    # The row comes back carrying the id actually used: `insert_row` steps past
    # a millisecond another writer took first, so the value handed to the
    # client has to be read back rather than assumed.
    task = db.insert_row('tasks', {
        "id": task_id,
        "user_id": username,
        "title": body.name,
        "description": '',
        "priority": body.priority,
        "status": "todo",
        "xp_value": body.xp_reward,
        "due_date": body.due_date,
        "show_on_calendar": body.show_on_calendar,
        # Honor a client-supplied created_at (the week calendar's drag-to-create
        # task uses it to place the block on the dragged slot); default to now.
        "created_at": body.created_at or datetime.now().isoformat(),
        "subject": _subject(body.subject, username),
        "goal_id": goal_id,
        "milestone_id": milestone_id,
    })
    # Which goals it counts toward, worked out now so no page has to later.
    # Never fails the create: see backend/goal_matcher/service.py.
    goal_matcher.after_write(username, None, task)
    return ok(task_id=task['id'])


# --------------------------------------------------------------------------
# CRUD
# --------------------------------------------------------------------------
@router.get('/api/tasks')
def list_tasks(username: str = Depends(current_username)):
    # Each task carries the goals it counts toward, read from what was stored
    # when it was written. Nothing is matched here.
    return ok(tasks=goal_store.with_goal_ids(username, db.tasks_for(username)))


@router.get('/api/tasks/search')
def search_tasks(q: str = '', limit: int = 8, open: bool = False,
                 username: str = Depends(current_username)):
    """Title search, for the top bar's search panel.

    Registered above `PUT/DELETE /api/tasks/{task_id}` in this file but not in
    conflict with them: those are other methods, and there is no
    `GET /api/tasks/{task_id}` for `search` to be mistaken for.

    The panel used to do this in the browser over the account's whole task
    list, which is most of why the top bar — on every page behind the login —
    needed that list at all. `limit` is capped rather than trusted: the panel
    shows eight, and an endpoint that will return ten thousand rows on request
    is the endpoint this change exists to remove.

    `open` drops the finished ones. The top bar passes it, because what that
    panel does with a result is take the reader to it and a finished task is
    not somewhere anybody needs taking — and because the cap is eight, so
    without it a search that matches nine done tasks and one live one comes
    back with the live one missing.
    """
    return ok(tasks=db.search_tasks(username, q,
                                    max(1, min(int(limit), 50)),
                                    open_only=bool(open)))


@router.post('/api/tasks')
def create_task(body: CreateTask,
                username: str = Depends(current_username)):
    return _create(body, username)


@router.put('/api/tasks/{task_id}')
def update_task(task_id: str, body: UpdateTask,
                username: str = Depends(current_username)):

    task = db.find_row('tasks', task_id, user_id=username)
    if not task:
        return fail('Task not found')
    # What the goal match was worked out from, to tell afterwards whether this
    # edit changed any of it. Completing or re-dating a task does not.
    before = {field: task.get(field) for field in goal_matcher.MATCH_FIELDS}

    sent = body.model_fields_set

    if 'name' in sent:
        task['title'] = body.name
    if 'description' in sent:
        task['description'] = ''
    if 'priority' in sent:
        task['priority'] = body.priority
    if 'xp_reward' in sent:
        task['xp_value'] = body.xp_reward
    if 'timer_duration' in sent:
        task['timer_duration'] = body.timer_duration
    if 'due_date' in sent:
        task['due_date'] = body.due_date
    if 'subject' in sent:
        task['subject'] = _subject(body.subject, username)
    # Resolved as a pair even when only one of them is sent, because a
    # checkpoint is only meaningful against its own goal: re-running both
    # through `_link` is what stops a task keeping a milestone belonging to the
    # goal it was just moved off.
    if 'goal_id' in sent or 'milestone_id' in sent:
        wanted_goal = body.goal_id if 'goal_id' in sent else task.get('goal_id')
        wanted_stone = body.milestone_id if 'milestone_id' in sent else task.get('milestone_id')
        task['goal_id'], task['milestone_id'] = _link(wanted_goal, wanted_stone, username)
    if 'completed' in sent:
        task['status'] = 'done' if body.completed else 'todo'
        # Record the completion time (the task's "end") when finishing; clear it
        # when re-opening. A task with no due date uses this as its calendar end.
        task['completed_at'] = datetime.now().isoformat() if body.completed else None

    db.save_task(task, username)
    goal_matcher.after_write(username, before, task)
    return ok()


@router.delete('/api/tasks/{task_id}')
def delete_task_by_id(task_id: str, username: str = Depends(current_username)):
    if not _delete(task_id, username):
        return fail('Task not found')
    return ok()


@router.post('/api/add_task')
def add_task(body: CreateTask,
             username: str = Depends(current_username)):
    """Older name for POST /api/tasks."""
    return _create(body, username)


@router.post('/api/delete_task')
def delete_task(body: DeleteTask, username: str = Depends(current_username)):
    """Older name for DELETE /api/tasks/<id>, with the id in the body."""
    if not _delete(body.id, username):
        return fail('Task not found')
    return ok()


@router.post('/api/delete_task_no_tracking')
def delete_task_no_tracking(body: DeleteTask,
                            username: str = Depends(current_username)):
    """Drop a task without any XP / streak / count side effects.

    Used when a timer is terminated: the task never happened, so nothing about
    the account's progression should move.

    Scoped to the caller: `_delete` with no username matches on the id alone,
    which is every task in the table and not just this account's.
    """
    if not _delete(body.id, username):
        return fail('Task not found')
    return ok()


@router.post('/api/update_task_due_date')
def update_task_due_date(body: UpdateDueDate, username: str = Depends(current_username)):
    """Push a task's due date out — the "add more time" button."""
    if not body.id or not username or not body.due_date:
        return fail('Missing required fields')

    task = db.find_row('tasks', body.id, user_id=username)
    if not task:
        return fail('Task not found')

    db.update_row('tasks', body.id, {'due_date': body.due_date}, user_id=username)
    return ok()


# --------------------------------------------------------------------------
# Status and timers
# --------------------------------------------------------------------------
@router.post('/api/get_task_status')
def get_task_status(body: TaskId,
                    username: str = Depends(current_username)):
    if not body.task_id:
        return fail('Task ID required')

    task = db.find_row('tasks', body.task_id, user_id=username)
    if not task:
        return fail('Task not found')

    return ok(status=task.get('status', 'todo'),
              completed=task.get('status') == 'done')


@router.post('/api/timer_expired')
def timer_expired(body: TaskId,
                  username: str = Depends(current_username)):
    """Record that a task's timer ran out before it was finished."""
    if not body.task_id:
        return fail('Task ID required')

    if not db.find_row('tasks', body.task_id, user_id=username):
        return fail('Task not found')

    db.update_row('tasks', body.task_id,
                  {'timer_expired': True, 'status': 'expired'}, user_id=username)

    return ok(message='Timer expiration recorded', task_id=body.task_id)


# --------------------------------------------------------------------------
# Completion
# --------------------------------------------------------------------------
@router.post('/api/complete_task')
def complete_task(body: CompleteTask, username: str = Depends(current_username)):
    if not username or not body.task_id:
        return fail('Username and task_id required')

    task = db.find_row('tasks', body.task_id, user_id=username)
    if not task:
        return fail('Task not found')

    _, user = load_user(username)
    if not user:
        return fail('User not found')

    xp_reward = task.get('xp_value', 0)
    now = datetime.now()

    # Stamp the task done, and record the timing the efficiency metric reads:
    # how long it took (creation -> completion) and, when it had a due date,
    # whether it beat that deadline. Tasks completed before this was added lack
    # these fields and are simply left out of the efficiency scores.
    task['status'] = 'done'
    task['completed_at'] = now.isoformat()

    created_dt = _parse_dt(task.get('created_at'))
    if created_dt is not None:
        task['completion_seconds'] = round(max(0, (now - created_dt).total_seconds()))

    due_dt = _parse_dt(task.get('due_date')) if task.get('due_date') else None
    if due_dt is not None:
        task['met_deadline'] = now <= due_dt

    # One row written, not a whole table. This used to be `db.save_tasks(tasks)`
    # + `db.save_users(users)` — a DELETE and a full re-INSERT of every task in
    # the system and every account, to mark one checkbox.
    db.save_task(task, username)

    # XP in, level recalculated, streak extended. Writes the account row itself,
    # adding in SQL so two completions at once cannot cancel each other out —
    # see the note on it.
    levels = xp_tracking.award_task_completion(user, xp_reward)

    xp_tracking.log_event(username, xp_reward, 'task_completion', tasks_completed=1)

    # Count this completion toward the user's active "complete N tasks" goals.
    apply_task_completion(username)

    return ok(
        message='Task completed successfully!',
        xp_earned=xp_reward,
        new_xp=levels['xp_in_level'],
        new_level=levels['level'],
        new_tasks_completed=user['tasks_completed'],
        xp_required=levels['xp_required'],
        current_streak=user['current_streak'],
        best_streak=user['best_streak'],
        task_id=body.task_id,
        completion_status='done',
    )


@router.post('/api/rate_task')
def rate_task(body: RateTask, username: str = Depends(current_username)):
    """Record what the person said about a task they just finished.

    A separate call from `/api/complete_task` on purpose. Completing is the act
    and the rating is an opinion about it, and the two must not share a failure:
    a task marked done has to stay done whether or not the prompt that follows
    it is answered, reaches the server, or is dismissed. Anything else would put
    somebody's XP behind a dialog.

    Both fields are optional and each is stored on its own, so a reader who
    answers one star row and closes the dialog keeps the answer they gave. Out
    of range is a failure rather than a clamp — a 7 is a caller bug, and
    silently filing it as a 5 would put a number in the record that nobody
    chose.
    """
    if not username or not body.task_id:
        return fail('Username and task_id required')

    # `is None` rather than falsiness, and the difference matters for exactly
    # one case: `reason: ""` is not an empty request, it is the answer being
    # taken back. Treating it as nothing to record made the clear below
    # unreachable.
    if body.difficulty is None and body.execution is None and body.reason is None:
        return fail('Nothing to record.')

    for name, value in (('Difficulty', body.difficulty), ('Execution', body.execution)):
        if value is not None and not (RATING_RANGE[0] <= value <= RATING_RANGE[1]):
            return fail('{} must be between {} and {}.'.format(name, *RATING_RANGE))

    task = db.find_row('tasks', body.task_id, user_id=username)
    if not task:
        return fail('Task not found')

    if body.difficulty is not None:
        task['difficulty'] = int(body.difficulty)
    if body.execution is not None:
        task['execution'] = int(body.execution)
    if body.reason is not None:
        if not body.reason:
            # An empty string is the answer being taken back — the prompt sends
            # one when the chosen chip is clicked again.
            task['reason'] = None
        elif body.reason in ALL_REASONS:
            task['reason'] = body.reason
        # A word this build has never heard of is ignored, not stored and not
        # treated as a clear. Dropped rather than rejected for the reason
        # `_subject` gives — the stars the reader did answer are worth keeping
        # — but it must not erase an answer that is already there, which is
        # what filing it as None would do.

    db.save_task(task, username)

    return ok(
        task_id=body.task_id,
        difficulty=task.get('difficulty'),
        execution=task.get('execution'),
        reason=task.get('reason'),
    )


@router.get('/api/last_task_completion')
def last_task_completion(username: str = Depends(current_username)):
    """The most recent completed-task XP. The goals page polls this so a
    dashboard completion signals through to its console."""

    latest = xp_tracking.last_task_completion(username)
    if latest is None:
        return ok(xp=None, at=None)
    return ok(xp=latest.get('amount', 0), at=str(latest.get('id')))

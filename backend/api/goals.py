"""Goals — what the account is trying to accomplish, and the checkpoints to it.

## Two kinds of goal, one table

This file began as four counters — "earn N XP", "reach an N-day streak",
"complete N tasks", "focus N minutes" — and those still work exactly as they
did. XP and task goals are fed by the app when a task is completed. Streak and
focus goals track themselves: a streak goal follows the account's live streak,
and a focus goal measures the focus time accumulated *since it was set*, by
remembering the lifetime total at creation as a baseline. Both are re-synced on
every read, so the goals page and the toast watcher polling it see live values.

What is new is the layer over them. A counter is a good way to hold "focus for
2,000 hours" and a bad way to hold "reach USACO Gold" — the second is an
outcome, and an outcome is measured either by a number the app has no way to
count (a rating, a contest score, a user count) or by the checkpoints on the
way to it. `measure` is the column that says which:

    'xp' | 'streak' | 'tasks' | 'focus'   the counters, unchanged
    'number'                              current_value against target_number
    'milestones'                          no number; checkpoints completed

An empty `measure` is a row written before the column existed and reads as its
`goal_type` — see `_measure_of`. Nothing back-fills it.

## Progress is derived, never accumulated

`progress` on a goal row is a cache of a calculation, and this module is the
only thing allowed to write it. `_recompute` is that calculation and every
write path ends in it, which is what stops a milestone being ticked off and the
goal's percentage disagreeing with its own checkpoint list.

What it deliberately does *not* do is count tasks. A goal with forty linked
tasks and four milestones is not 2.5% done when one task is finished — tasks
are evidence that the work is happening, and they belong to the health and the
analytics on the page, not to the percentage. See utils/goalHealth.ts on the
front end, which is where "is this on track" is decided.
"""
from datetime import date, datetime, timedelta
import json
import re
from typing import Any, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.config import settings
from backend.database import connection as db
from backend.goal_matcher import metrics as goal_metrics
from backend.goal_matcher import service as goal_matcher
from backend.goal_matcher.queue import work as goal_queue
from backend.tracking import focus as focus_tracking
from backend.tracking import planner
from backend.tracking import xp as xp_tracking
from backend.tracking.auth import load_user

router = APIRouter(tags=['goals'])

# The four kinds of goal, and which pair of fields each one counts with.
GOAL_FIELDS = {
    'xp': ('current_xp', 'target_xp'),
    'streak': ('current_streak', 'target_streak'),
    'tasks': ('current_tasks', 'target_tasks'),
    'focus': ('current_focus', 'target_focus'),
}

# Everything `measure` is allowed to be. The first four name a counter above;
# the last two are the outcome measures that have no counter behind them.
MEASURES = ('xp', 'streak', 'tasks', 'focus', 'number', 'milestones')

# What a goal can be about. Loose on purpose — the front end draws an icon and
# a colour per entry and falls back to 'other', so an unknown value degrades to
# a plain goal rather than to an error.
CATEGORIES = ('math', 'coding', 'ai', 'school', 'music', 'fitness',
              'projects', 'personal', 'other')

# Which chart the goal card draws. Empty means the page picks one from the
# goal's data — see frontend/src/utils/goalVisuals.ts, which owns the list.
CHARTS = ('', 'progress', 'step', 'heatmap', 'basic', 'roadmap', 'volume',
          'difficulty')

# What /api/update_goal is allowed to write straight through from the request.
EDITABLE = ('title', 'description', 'status', 'goal_type',
            'deadline', 'current_xp', 'current_streak', 'current_tasks',
            'current_focus', 'target_xp', 'target_streak', 'target_tasks',
            'target_focus',
            'category', 'why', 'start_date', 'unit', 'current_value',
            'target_number', 'subject_ids', 'chart')


# --------------------------------------------------------------------------
# What the endpoints accept
# --------------------------------------------------------------------------
class AddGoal(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    description: str = ''
    goal_type: str = 'xp'
    target_xp: int = 0
    target_streak: int = 0
    target_tasks: int = 0
    target_focus: int = 0          # minutes of tracked focus time
    priority: Any = 5
    deadline: str = ''

    # The outcome layer. `measure` defaults to the empty string so a caller
    # that predates it — the old modal still posts exactly the old fields —
    # lands on its goal_type and behaves as it always has.
    measure: str = ''
    category: str = 'other'
    why: str = ''
    start_date: str = ''
    unit: str = ''
    current_value: float = 0
    target_number: float = 0
    subject_ids: str = ''
    chart: str = ''
    # Checkpoint titles to create with the goal, in execution order.
    milestones: List[str] = []


class UpdateGoal(BaseModel):
    """Only the fields actually sent are written, so every one is optional and
    the write below reads `model_fields_set` rather than testing truthiness."""
    id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    progress: Optional[float] = None
    goal_type: Optional[str] = None
    deadline: Optional[str] = None
    current_xp: Optional[float] = None
    current_streak: Optional[float] = None
    current_tasks: Optional[float] = None
    current_focus: Optional[float] = None
    target_xp: Optional[float] = None
    target_streak: Optional[float] = None
    target_tasks: Optional[float] = None
    target_focus: Optional[float] = None
    priority: Optional[Any] = None

    measure: Optional[str] = None
    category: Optional[str] = None
    why: Optional[str] = None
    start_date: Optional[str] = None
    unit: Optional[str] = None
    current_value: Optional[float] = None
    target_number: Optional[float] = None
    subject_ids: Optional[str] = None
    chart: Optional[str] = None


class DeleteGoal(BaseModel):
    goal_id: Optional[str] = None


# ---- Milestones ----------------------------------------------------------
class AddMilestone(BaseModel):
    goal_id: Optional[str] = None
    title: Optional[str] = None
    note: str = ''
    target_date: str = ''


class UpdateMilestone(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    note: Optional[str] = None
    status: Optional[str] = None
    target_date: Optional[str] = None
    # The whole checklist, sent entire rather than as a per-step edit. It is at
    # most eight short rows, and one write of the list cannot interleave with
    # another the way "add a step" and "tick step 2" can.
    steps: Optional[List[Any]] = None


class DeleteMilestone(BaseModel):
    id: Optional[str] = None


class ReorderMilestones(BaseModel):
    goal_id: Optional[str] = None
    # Milestone ids in the order they should be executed.
    order: List[str] = []


class SuggestMilestones(BaseModel):
    """Ask the model for a goal's checkpoints. Writes nothing.

    Either identify an existing goal by `goal_id` — everything the account has
    said about it is read from the row — or pass a `title` for a goal that does
    not exist yet, which is what the creation wizard has.
    """
    goal_id: Optional[str] = None
    title: Optional[str] = None
    why: str = ''
    description: str = ''
    category: str = ''
    # For a goal not yet written. An existing goal's is read from its row.
    deadline: str = ''


class DraftGoal(BaseModel):
    """Ask the model to turn one sentence into a whole goal. Writes nothing.

    The other two suggestion bodies break down something that already exists.
    This one starts from the sentence the reader would have typed into the
    wizard's first box, and its answer fills the rest of the wizard's fields
    for them to edit.
    """
    idea: str = ''


class SuggestSteps(BaseModel):
    """Ask the model for one checkpoint's checklist. Writes nothing.

    `milestone_id` is the ordinary case and carries its goal with it. `title`
    is for a checkpoint being drafted that has no row yet, and takes
    `goal_id` alongside it so the model is told what the checkpoint is for —
    a six-word checkpoint title on its own is frequently not enough to break
    down.
    """
    milestone_id: Optional[str] = None
    goal_id: Optional[str] = None
    title: Optional[str] = None


class SetMilestones(BaseModel):
    goal_id: Optional[str] = None
    # The checkpoint titles the goal should have, in execution order.
    titles: List[str] = []


class UpdateGoalProgress(BaseModel):
    goal_id: Optional[str] = None
    xp_to_add: float = 0
    streak_to_add: float = 0
    tasks_to_add: float = 0


class AutoApplyTaskXp(BaseModel):
    xp: Any = 0


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _clamp_priority(value):
    """Priority rank 1-10 (default 5) — tolerate junk input."""
    try:
        return max(1, min(10, int(value)))
    except (ValueError, TypeError):
        return 5


def _progress(value, target):
    return round((value / target) * 100, 1) if target else 0


def _measure_of(goal):
    """How this goal's progress is read.

    A row written before `measure` existed has none, and the honest answer for
    it is its `goal_type` — that is what it was being measured by. Anything
    unrecognised falls back the same way rather than to a default, so a typo in
    a request cannot quietly turn an XP goal into a milestone one.
    """
    measure = (goal.get('measure') or '').strip()
    if measure in MEASURES:
        return measure
    goal_type = goal.get('goal_type') or 'xp'
    return goal_type if goal_type in GOAL_FIELDS else 'xp'


def _goals_of(goals, username, goal_type=None, unfinished=False):
    """This user's goals, optionally of one counter type.

    `goal_type` filters on the *measure* rather than on the column, which is
    what keeps the task automations off the outcome goals: a milestone goal
    still carries `goal_type = 'xp'` because that column's CHECK has only ever
    allowed four values, and counting a finished task toward it would advance a
    number nobody is reading.
    """
    out = []
    for goal in goals:
        if goal.get('user_id') != username:
            continue
        if goal_type and _measure_of(goal) != goal_type:
            continue
        if unfinished and goal.get('status') == 'completed':
            continue
        out.append(goal)
    return out


def _fresh_milestone_id(rows):
    """An id no row in `rows` is already using.

    `db.new_id` steps past the ids in the *table*, which is the right answer
    for one insert and the wrong one for a batch: creating a goal with four
    checkpoints allocates all four before any of them is saved, and ids are
    millisecond timestamps, so all four came back the same millisecond and the
    write failed on the primary key. This steps past what is staged as well.
    """
    taken = {str(row.get('id')) for row in rows}
    candidate = int(db.new_id('goal_milestones'))
    while str(candidate) in taken:
        candidate += 1
    return str(candidate)


def _spread_dates(count, deadline, today=None):
    """A first date for each checkpoint, from today to the goal's deadline.

    Every milestone was written with `target_date: ''`, and the only way to
    put one on was an API call nothing in the app made — so a goal created with
    five checkpoints arrived with five undated rows, and every view that orders
    by date drew them in whatever order they came out of the table.

    These are a starting position, not a plan: the reader moves any of them
    from the goal timeline. What makes them worth writing is that they are
    ordered and spaced, so the rail reads as a sequence from the moment the
    goal exists.

    With a deadline, the checkpoints divide the run-up to it evenly and the
    last one lands on the day itself — five checkpoints before a date twenty
    weeks out are four weeks apart. Without one, they fall a fortnight apart
    from today, which is a pace rather than a promise and is the honest answer
    when the reader declined to give a date.

    A deadline already past, or today, gets nothing: back-dating a checkpoint
    to before the goal was written would make the timeline open on a row that
    was late the moment it was created.
    """
    if count <= 0:
        return []
    start = (today or datetime.now()).date()

    end = None
    if deadline:
        try:
            end = date.fromisoformat(str(deadline)[:10])
        except ValueError:
            end = None
    if end is not None and end <= start:
        end = None

    if end is None:
        return [(start + timedelta(days=14 * (i + 1))).isoformat() for i in range(count)]

    span = (end - start).days
    return [
        (start + timedelta(days=round(span * (i + 1) / count))).isoformat()
        for i in range(count)
    ]


# --------------------------------------------------------------------------
# The checklist under a checkpoint
# --------------------------------------------------------------------------
# How many small pieces of work a checkpoint is broken into. Three is a floor
# rather than a default: a checkpoint you cannot name three pieces of is either
# already small enough to be a task, or has not been thought about yet, and the
# empty rows are the prompt to do that thinking. There is no way to go below
# it from the UI or from here — `_clean_steps` pads back up to three whatever
# it is handed.
MIN_STEPS = 3

# The ceiling. A checkpoint needing more than this is two checkpoints.
MAX_STEPS = 8

# One step's title. Long enough for a real sentence, short enough that the card
# can draw three of them without becoming a document.
STEP_MAX = 120

# What the three seeded rows say. They are prompts rather than content, and are
# flagged `placeholder` so every reader can tell the difference — the card draws
# them muted, and nothing counts an unfilled row as work planned.
PLACEHOLDERS = (
    'Name the first piece of work',
    'Name the second',
    'Name what finishes it',
)


def _clean_due(value):
    """An ISO day, or None.

    Anything that is not a date this app could have written is dropped rather
    than stored and printed back as a broken one — the front end sends what an
    `<input type="date">` produced, and everything else is either a client bug
    or somebody posting by hand.
    """
    text = str(value or '').strip()[:10]
    if not text:
        return None
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError:
        return None


def _fresh_step_id(taken):
    """A short id unique within one checklist. Ids are per-milestone, not global."""
    n = 1
    while f's{n}' in taken:
        n += 1
    return f's{n}'


def _clean_steps(value):
    """Whatever came in, as a checklist that satisfies the rules.

    Total about what it accepts, because it is fed three quite different
    things: a JSON string off a database row, a list off a request body, and
    NULL from a checkpoint written before this column existed. All three have
    the same honest answer — the steps that could be read, padded to `MIN_STEPS`
    with placeholders and cut at `MAX_STEPS`.

    Padding rather than rejecting is deliberate. A request that sends two steps
    is not an error to report to somebody who was editing a checklist; it is a
    checklist with a row they have not written yet.
    """
    raw = value
    if isinstance(raw, str):
        try:
            raw = json.loads(raw) if raw.strip() else []
        except (ValueError, TypeError):
            raw = []
    if not isinstance(raw, list):
        raw = []

    out, taken = [], set()
    for entry in raw[:MAX_STEPS]:
        if not isinstance(entry, dict):
            continue
        # Squashed as well as trimmed, and cut afterwards. utils/milestoneSteps
        # does exactly this on the way in, and a server that only stripped
        # would store a title the client had already shown differently.
        title = re.sub(r'\s+', ' ', str(entry.get('title') or '')).strip()[:STEP_MAX]
        step_id = str(entry.get('id') or '').strip() or _fresh_step_id(taken)
        if step_id in taken:
            step_id = _fresh_step_id(taken)
        taken.add(step_id)
        # The one task this step is execution for, if the reader linked one.
        # A step is still not a task — this is a pointer, and the step stands
        # whether or not anything is on the other end of it.
        #
        # An emptied row loses it, for the same reason it loses its tick: a
        # pointer hanging off a row with no text is a task attached to
        # nothing. utils/milestoneSteps drops it on the way in too.
        task_id = (str(entry.get('task_id') or '').strip() or None) if title else None

        # A date of its own, and only where there is nothing else holding one.
        # A step pointing at a task takes that task's due date — two dates for
        # one piece of work is two answers to "when", and the one on the task
        # is the one the calendar, the dashboard and the reminders all read.
        # So linking a task drops the step's own date rather than keeping a
        # second copy that nothing else can see.
        due = _clean_due(entry.get('due')) if (title and not task_id) else None
        out.append({
            'id': step_id,
            'title': title,
            'task_id': task_id,
            'due': due,
            'done': bool(entry.get('done')),
            # Derived, never trusted from the caller: an untitled row is a
            # placeholder and a titled one is not. Taking the client's flag
            # would let a stale one grey out work somebody had written.
            'placeholder': not title,
        })

    while len(out) < MIN_STEPS:
        title = PLACEHOLDERS[len(out)] if len(out) < len(PLACEHOLDERS) else ''
        step_id = _fresh_step_id(taken)
        taken.add(step_id)
        out.append({'id': step_id, 'title': title, 'task_id': None, 'due': None,
                    'done': False, 'placeholder': True})

    return out


def _steps_column(steps):
    """The checklist as it is stored. Placeholders are not written out."""
    return json.dumps([
        {'id': s['id'], 'title': s['title'], 'done': s['done'],
         'task_id': s['task_id'], 'due': s['due']}
        for s in steps if not s['placeholder']
    ])


def _seed_steps():
    """The column value a brand-new checkpoint is created with."""
    return _steps_column(_clean_steps([]))


def _milestones_of(rows, goal_id):
    """One goal's checkpoints, in execution order, each with its checklist.

    `steps` leaves here as a list rather than as the JSON string it is stored
    as, and always with at least `MIN_STEPS` entries — including for the rows
    that predate the column, which read as NULL and come out as three
    placeholders. The front end therefore never has to parse anything or count
    to three itself.
    """
    mine = [row for row in rows if row.get('goal_id') == goal_id]
    mine = sorted(mine, key=lambda row: (row.get('position') or 0,
                                         str(row.get('id') or '')))
    # Copies. `create_goal` runs rows through here that it has not inserted
    # yet, and parsing `steps` in place would hand the insert a Python list
    # where the column wants text.
    return [dict(row, steps=_clean_steps(row.get('steps'))) for row in mine]


def _recompute(goal, milestones=None):
    """Set a goal's `progress`, `target_value` and `status` from its own truth.

    The one place any of the three is written. Which truth depends on the
    measure: a counter reads its pair of columns, a number goal reads
    current_value against target_number, and a milestone goal counts the
    checkpoints that are done.

    Completion is derived with it rather than remembered, and that matters in
    both directions — a streak goal that breaks goes back to active, and a
    milestone goal whose last checkpoint is reopened does too. The exception is
    a goal with nothing to measure against (no target at all): it stays at
    whatever status it was given, because a goal with no target cannot be
    finished by arithmetic and only the user can say it is done.
    """
    measure = _measure_of(goal)

    if measure == 'milestones':
        rows = milestones or []
        total = len(rows)
        done = len([row for row in rows if row.get('status') == 'done'])
        goal['target_value'] = total
        goal['progress'] = _progress(done, total)
        if total:
            goal['status'] = 'completed' if done >= total else 'active'
        return goal

    if measure == 'number':
        current = float(goal.get('current_value') or 0)
        target = float(goal.get('target_number') or 0)
        goal['target_value'] = target
        goal['progress'] = min(100.0, _progress(current, target))
        if target:
            goal['status'] = 'completed' if current >= target else 'active'
        return goal

    current_field, target_field = GOAL_FIELDS[measure]
    current = float(goal.get(current_field) or 0)
    target = float(goal.get(target_field) or 0)
    goal['target_value'] = target
    goal['progress'] = min(100.0, _progress(current, target))
    if target:
        goal['status'] = 'completed' if current >= target else 'active'
    return goal


def _save_goal(goal, username):
    """Write back one goal. The row, not the table.

    Everything here used to read `db.goals()`, change one dict in the list and
    call `db.save_goals(goals)` — a DELETE and a full re-INSERT of every goal
    every account has, to move one number. Small tables, so the cost was never
    the point; the point is that two requests each rewriting the whole table
    from their own copy is how one of them silently disappears. See the note on
    `write_table` in backend/database/connection.py.
    """
    return db.update_row('goals', goal['id'],
                         {k: v for k, v in goal.items() if k != 'id'},
                         user_id=username)


def _save_stone(stone, username):
    """Write back one checkpoint. Same reasoning as `_save_goal`."""
    return db.update_row('goal_milestones', stone['id'],
                         {k: v for k, v in stone.items() if k != 'id'},
                         user_id=username)


def _recompute_goal(goal_id, username):
    """Re-derive one goal after something under it changed. Saves if it moved."""
    goal = db.find_row('goals', goal_id, user_id=username)
    if not goal:
        return None
    before = (goal.get('progress'), goal.get('status'), goal.get('target_value'))
    _recompute(goal, _milestones_of(db.rows_for('goal_milestones', username), goal_id))
    if (goal.get('progress'), goal.get('status'), goal.get('target_value')) != before:
        _save_goal(goal, username)
    return goal


# --------------------------------------------------------------------------
# Automation: what a completed task does to the user's goals
# --------------------------------------------------------------------------
def apply_task_xp(username, xp):
    """Add `xp` to every active XP goal, completing any that reach their target.

    Each XP goal means "earn N XP", so a completed task's XP counts toward all
    of them. Returns a summary of what changed.
    """
    try:
        xp = int(xp)
    except (ValueError, TypeError):
        xp = 0

    if not username or xp <= 0:
        return {"updated": [], "completed": []}

    goals = db.rows_for('goals', username)
    updated = []
    completed = []

    for goal in _goals_of(goals, username, 'xp', unfinished=True):
        target = goal.get('target_xp', 0) or 0
        new_value = (goal.get('current_xp', 0) or 0) + xp
        if target and new_value > target:
            new_value = target

        goal['current_xp'] = new_value
        _recompute(goal)
        is_done = goal['status'] == 'completed'

        info = {"id": goal.get('id'), "title": goal.get('title'),
                "current_xp": new_value, "target_xp": target,
                "status": goal['status']}
        updated.append(info)
        if is_done:
            completed.append(info)
        _save_goal(goal, username)

    return {"updated": updated, "completed": completed}


def apply_task_completion(username, count=1):
    """Count completed tasks toward every active "complete N tasks" goal.

    Mirrors how earned XP advances every active XP goal. Runs server-side on
    each completion, so the goals page reflects it whether or not it is open.
    A batch passes its size, so sixty completions are one write per goal
    rather than sixty.
    """
    if count <= 0:
        return
    for goal in _goals_of(db.rows_for('goals', username), username, 'tasks',
                          unfinished=True):
        target = goal.get('target_tasks', 0) or 0
        new_value = (goal.get('current_tasks', 0) or 0) + count
        if target and new_value > target:
            new_value = target
        goal['current_tasks'] = new_value
        _recompute(goal)
        _save_goal(goal, username)


@router.post('/api/auto_apply_task_xp')
def auto_apply_task_xp(body: AutoApplyTaskXp, username: str = Depends(current_username)):
    """Apply a completed task's XP to the user's active XP goals."""
    return ok(**apply_task_xp(username, body.xp))


# --------------------------------------------------------------------------
# Self-tracking goals
# --------------------------------------------------------------------------
def sync_streak_goals(username):
    """Keep every streak goal in lockstep with the account's live streak.

    A streak goal means "reach an N-day streak", so its current value should
    follow the real streak — the same number the dashboard shows — tracking it
    up as it grows and back down to zero when it breaks. Completion follows the
    same number: completed once the streak reaches the target, active again if
    it falls back below.
    """
    users, user = load_user(username)
    if not user:
        return
    # Decay a stale streak first so goals follow the same live value everywhere.
    if xp_tracking.refresh_streak(user):
        db.save_user(user)
    current_streak = user.get('current_streak', 0) or 0

    for goal in _goals_of(db.rows_for('goals', username), username, 'streak'):
        target = goal.get('target_streak', 0) or 0
        # Cap at the target so a completed goal reads "N / N Days".
        new_value = min(current_streak, target) if target else current_streak
        before = (goal.get('current_streak'), goal.get('status'),
                  goal.get('progress'), goal.get('target_value'))
        goal['current_streak'] = new_value
        _recompute(goal)
        if (goal.get('current_streak'), goal.get('status'),
                goal.get('progress'), goal.get('target_value')) != before:
            _save_goal(goal, username)


def sync_focus_goals(username):
    """Advance focus goals from the tracked focus history.

    A focus goal's current value is the focus time accumulated since it was set
    — the account's lifetime tracked seconds minus the baseline recorded at
    creation — and it completes on its own the moment that reaches the target.
    """
    pending = _goals_of(db.rows_for('goals', username), username, 'focus',
                        unfinished=True)
    if not pending:
        return

    total_now = focus_tracking.total_seconds(username)
    for goal in pending:
        target_min = goal.get('target_focus', 0) or 0
        try:
            baseline = max(0.0, float(goal.get('focus_baseline_seconds', 0) or 0))
        except (ValueError, TypeError):
            baseline = 0.0
        earned_min = max(0.0, (total_now - baseline) / 60.0)
        new_value = round(min(earned_min, target_min) if target_min else earned_min, 1)
        before = (goal.get('current_focus'), goal.get('status'),
                  goal.get('progress'), goal.get('target_value'))
        goal['current_focus'] = new_value
        _recompute(goal)
        if (goal.get('current_focus'), goal.get('status'),
                goal.get('progress'), goal.get('target_value')) != before:
            _save_goal(goal, username)


# --------------------------------------------------------------------------
# The API
# --------------------------------------------------------------------------
@router.get('/api/goal_matcher/metrics')
def goal_matcher_metrics(username: str = Depends(current_username)):
    """What the matcher has done since the server started. Development only.

    Counts and milliseconds, nothing about any account's work — but they are
    process-wide, so on a shared install they would describe other people's
    activity to whoever asked. Behind `dev_mode` for that reason, the same
    way the verification link is (backend/routes/auth.py).
    """
    if not settings.dev_mode():
        return fail('There is nothing here.', status=404)
    return ok(metrics=goal_metrics.snapshot(), queued=goal_queue.pending())


@router.post('/api/add_goal')
def add_goal(body: AddGoal, username: str = Depends(current_username)):
    if not username or not body.title:
        return fail('Username and title are required')

    targets = {
        'xp': body.target_xp,
        'streak': body.target_streak,
        'tasks': body.target_tasks,
        'focus': body.target_focus,
    }
    missing = {
        'xp': "Target XP is required for XP goals",
        'streak': "Target streak is required for streak goals",
        'tasks': "Target tasks is required for task goals",
        'focus': "Target focus time is required for focus goals",
        'number': "A target figure is required when you are measuring a number",
    }

    # An unrecognised measure is the caller's goal_type, which is what every
    # request written before this column existed means.
    measure = body.measure if body.measure in MEASURES else (
        body.goal_type if body.goal_type in GOAL_FIELDS else 'xp')

    if measure in targets and not targets[measure]:
        return fail(missing[measure])
    if measure == 'number' and not body.target_number:
        return fail(missing['number'])
    # A milestone goal is allowed to start with none: the wizard's last step is
    # optional and a goal you have not broken down yet is still a goal.

    goal_id = body.id or db.new_id('goals')
    category = body.category if body.category in CATEGORIES else 'other'

    goal = {
        "id": goal_id,
        "user_id": username,
        "title": body.title,
        "description": body.description,
        "progress": 0,
        "target_value": targets.get(measure, targets['xp']),
        # The column keeps its four values; `measure` is what is read.
        "goal_type": body.goal_type if body.goal_type in GOAL_FIELDS else 'xp',
        "measure": measure,
        "target_xp": targets['xp'],
        "current_xp": 0,
        "target_streak": targets['streak'],
        "current_streak": 0,
        "target_tasks": targets['tasks'],
        "current_tasks": 0,
        "target_focus": targets['focus'],
        "current_focus": 0,
        # Focus goals count time from now on, so remember the lifetime total
        # they start from: progress is (total later - this baseline).
        "focus_baseline_seconds": (focus_tracking.total_seconds(username)
                                   if measure == 'focus' else 0),
        "priority": _clamp_priority(body.priority),
        "deadline": body.deadline,
        "status": "active",
        "created_at": datetime.now().isoformat(),

        "category": category,
        "why": body.why,
        # A goal with no start date started when it was made. Pace is measured
        # from this, so it cannot be left empty and guessed at later.
        "start_date": body.start_date or datetime.now().date().isoformat(),
        "unit": body.unit,
        "current_value": body.current_value,
        "target_number": body.target_number,
        "subject_ids": body.subject_ids,
        "chart": body.chart if body.chart in CHARTS else '',
    }

    titles = [title.strip() for title in body.milestones if title and title.strip()]
    rows = db.rows_for('goal_milestones', username)
    fresh = []
    if titles:
        now = datetime.now().isoformat()
        dates = _spread_dates(len(titles), body.deadline)
        for position, title in enumerate(titles):
            fresh.append({
                "id": _fresh_milestone_id(rows + fresh),
                "goal_id": goal_id,
                "user_id": username,
                "title": title,
                "note": '',
                "position": position,
                "status": 'pending',
                "target_date": dates[position],
                "steps": _seed_steps(),
                "created_at": now,
            })

    _recompute(goal, _milestones_of(rows + fresh, goal_id))
    # Goals first: a milestone row names a goal that has to exist by the time
    # the milestone insert runs its foreign-key check. Foreign keys are ON for
    # these writes — unlike `write_table`, which has to switch them off to swap
    # a table — so the ordering is enforced rather than merely intended.
    goal = db.insert_row('goals', goal)
    for stone in fresh:
        stone['goal_id'] = goal['id']
        db.insert_row('goal_milestones', stone)
    # Existing tasks may be work toward it. They are marked and matched in the
    # background, never here — see backend/goal_matcher/service.py.
    goal_matcher.goal_changed(username, None, goal)
    return ok(message='Goal added successfully', id=goal['id'])


@router.get('/api/get_goals')
def get_goals(username: str = Depends(current_username)):

    # Bring the self-tracking goals up to date before handing them over.
    sync_streak_goals(username)
    sync_focus_goals(username)

    # Average XP per active day — the goals page's "IN PROGRESS" summary card.
    events = xp_tracking.events_for(username)
    total_xp = sum(e.get('amount', 0) or 0 for e in events)
    active_days = {day for day in (xp_tracking.event_day(e) for e in events) if day}
    avg_xp_per_day = round(total_xp / len(active_days)) if active_days else 0

    mine = db.rows_for('goals', username)
    rows = db.rows_for('goal_milestones', username)
    for goal in mine:
        # Named `measure` on the way out whatever it is on the way in, so the
        # front end never has to know that an old row leaves the column empty.
        goal['measure'] = _measure_of(goal)
        goal['milestones'] = _milestones_of(rows, goal.get('id'))

    return ok(goals=mine, avg_xp_per_day=avg_xp_per_day)


@router.post('/api/update_goal')
def update_goal(body: UpdateGoal, username: str = Depends(current_username)):
    if not body.id or not username:
        return fail('Goal ID and username required')

    goal = db.find_row('goals', body.id, user_id=username)
    if not goal:
        return fail('Goal not found')
    before = dict(goal)

    sent = body.model_fields_set
    for field in EDITABLE:
        if field in sent:
            goal[field] = getattr(body, field)
    if 'priority' in sent:
        goal['priority'] = _clamp_priority(body.priority)
    if 'measure' in sent and body.measure in MEASURES:
        goal['measure'] = body.measure
    if 'category' in sent and body.category not in CATEGORIES:
        goal['category'] = 'other'
    if 'chart' in sent and body.chart not in CHARTS:
        goal['chart'] = ''

    # `progress` and `status` are not in EDITABLE and are not taken from the
    # request: they are what the goal's own numbers come to. A caller marking a
    # goal done sends `status`, which _recompute honours only where there is no
    # target to disagree with it — see the note there.
    if 'status' in sent and body.status in ('active', 'completed'):
        goal['status'] = body.status
    _recompute(goal, _milestones_of(db.rows_for('goal_milestones', username),
                                    goal.get('id')))

    _save_goal(goal, username)
    # A new title or subject changes which tasks it would match. Queued, not
    # run: see backend/goal_matcher/service.py.
    goal_matcher.goal_changed(username, before, goal)
    return ok()


@router.post('/api/delete_goal')
def delete_goal(body: DeleteGoal, username: str = Depends(current_username)):
    if not body.goal_id:
        return fail('Goal ID required')

    # Before the delete: the tasks matched to it are found through the very
    # rows the delete is about to cascade away.
    doomed = db.find_row('goals', body.goal_id, user_id=username)
    if doomed:
        goal_matcher.goal_changed(username, doomed, None)

    # The checkpoints go with it, and they no longer have to be swept up by
    # hand: `goal_milestones.goal_id` declares ON DELETE CASCADE and this is a
    # real DELETE, so SQLite carries them. The old code deleted them itself
    # because `write_table` swaps rows with foreign keys switched off, which
    # meant the cascade never fired and orphaned checkpoints would surface as a
    # failure in some later, unrelated write to that table.
    db.delete_row('goals', body.goal_id, user_id=username)

    # The tasks stay. A task that was done for a goal was still done, and its
    # XP is already in the ledger; what it loses is the link, which is what
    # `the link` reads as "no goal" from here on.
    for task in db.tasks_for(username):
        if task.get('goal_id') == body.goal_id:
            db.update_row('tasks', task['id'],
                          {'goal_id': None, 'milestone_id': None}, user_id=username)

    return ok()


# --------------------------------------------------------------------------
# Milestones
# --------------------------------------------------------------------------
@router.post('/api/add_milestone')
def add_milestone(body: AddMilestone, username: str = Depends(current_username)):
    if not username or not body.goal_id or not body.title:
        return fail('Username, goal and title are required')

    goal = db.find_row('goals', body.goal_id, user_id=username)
    if not goal:
        return fail('Goal not found')

    rows = db.rows_for('goal_milestones', username)
    mine = _milestones_of(rows, body.goal_id)
    new_id = _fresh_milestone_id(rows)
    db.insert_row('goal_milestones', {
        "id": new_id,
        "goal_id": body.goal_id,
        "user_id": username,
        "title": body.title,
        "note": body.note,
        # On the end. A checkpoint added later is one the plan grew, not one
        # that was always meant to come third.
        "position": len(mine),
        "status": 'pending',
        "target_date": body.target_date,
        # Three empty rows, not none. See MIN_STEPS.
        "steps": _seed_steps(),
        "created_at": datetime.now().isoformat(),
    })
    _recompute_goal(body.goal_id, username)
    # A checkpoint's words are part of what tasks are matched on.
    goal_matcher.goal_changed(username, goal, goal, checkpoints_changed=True)
    # The id goes back for the same reason `/api/add_goal` returns one: the
    # caller's next move is usually about the row it just made, and finding it
    # again by title is a guess when two checkpoints are named the same thing.
    return ok(id=new_id)


@router.post('/api/update_milestone')
def update_milestone(body: UpdateMilestone, username: str = Depends(current_username)):
    if not username or not body.id:
        return fail('Username and milestone ID required')

    row = db.find_row('goal_milestones', body.id, user_id=username)
    if not row:
        return fail('Milestone not found')

    sent = body.model_fields_set
    for field in ('title', 'note', 'target_date'):
        if field in sent and getattr(body, field) is not None:
            row[field] = getattr(body, field)

    if 'steps' in sent and body.steps is not None:
        row['steps'] = _steps_column(_clean_steps(body.steps))

    if 'status' in sent and body.status in ('pending', 'active', 'done'):
        row['status'] = body.status
        # The date it was reached, kept only while it is reached. Reopening a
        # checkpoint clears it rather than leaving a completion date on
        # something that is not complete.
        row['completed_at'] = datetime.now().isoformat() if body.status == 'done' else None

        # One focus per goal. `active` is what the card reads to decide which
        # checkpoint it is drawing, and it takes the first it finds — so two
        # active rows is not a visible conflict, it is a card that quietly
        # stops following the one you last clicked. Demote the others here
        # rather than trusting every caller to send two requests in order.
        if body.status == 'active':
            for other in _milestones_of(db.rows_for('goal_milestones', username),
                                        row.get('goal_id')):
                if other.get('id') != row.get('id') and other.get('status') == 'active':
                    db.update_row('goal_milestones', other['id'],
                                  {'status': 'pending'}, user_id=username)

    _save_stone(row, username)
    goal = _recompute_goal(row.get('goal_id'), username)
    # Renaming a checkpoint changes what tasks it matches; ticking it off
    # does not.
    if 'title' in sent and goal:
        goal_matcher.goal_changed(username, goal, goal, checkpoints_changed=True)
    return ok()


@router.post('/api/delete_milestone')
def delete_milestone(body: DeleteMilestone, username: str = Depends(current_username)):
    if not username or not body.id:
        return fail('Username and milestone ID required')

    row = db.find_row('goal_milestones', body.id, user_id=username)
    if not row:
        return fail('Milestone not found')
    goal_id = row.get('goal_id')

    db.delete_row('goal_milestones', body.id, user_id=username)

    # Close the gap, so the remaining checkpoints are 0..n-1 with no hole where
    # the deleted one was. Only the ones that actually moved are written.
    kept = db.rows_for('goal_milestones', username)
    for position, remaining in enumerate(_milestones_of(kept, goal_id)):
        if remaining.get('position') != position:
            db.update_row('goal_milestones', remaining['id'],
                          {'position': position}, user_id=username)

    for task in db.tasks_for(username):
        if task.get('milestone_id') == body.id:
            db.update_row('tasks', task['id'],
                          {'milestone_id': None}, user_id=username)

    goal = _recompute_goal(goal_id, username)
    if goal:
        goal_matcher.goal_changed(username, goal, goal, checkpoints_changed=True)
    return ok()


@router.post('/api/reorder_milestones')
def reorder_milestones(body: ReorderMilestones, username: str = Depends(current_username)):
    """Write a new execution order for one goal's checkpoints.

    Ids the goal does not own are ignored rather than rejected, and any of its
    own the caller left out keep their existing order behind the ones it named.
    A reorder is a drag on a list, and a list that refuses to move because the
    page was a moment out of date is worse than one that does its best.
    """
    if not username or not body.goal_id:
        return fail('Username and goal ID required')

    # Scoped to the caller by the read, so the ownership check below is now
    # about the goal rather than about the rows.
    mine = _milestones_of(db.rows_for('goal_milestones', username), body.goal_id)
    if not mine:
        return fail('Goal has no milestones')

    by_id = {row.get('id'): row for row in mine}
    ordered = [by_id[mid] for mid in body.order if mid in by_id]
    ordered += [row for row in mine if row not in ordered]
    for position, row in enumerate(ordered):
        if row.get('position') != position:
            db.update_row('goal_milestones', row['id'],
                          {'position': position}, user_id=username)
    return ok()


@router.post('/api/suggest_milestones')
def suggest_milestones(body: SuggestMilestones, username: str = Depends(current_username)):
    """Five checkpoint titles for a goal, from the model. Writes nothing.

    A draft, not a plan: the page puts these in five editable fields and only
    /api/set_milestones below saves them. Every failure comes back as a
    readable message rather than an error status, because the page shows it on
    the goal — a suggestion that cannot be made is not a broken request.
    """

    title = (body.title or '').strip()
    why, description, category = body.why, body.description, body.category
    deadline = body.deadline
    unit = target = ''

    if body.goal_id:
        goal = db.find_row('goals', body.goal_id, user_id=username)
        if not goal:
            return fail('Goal not found')
        # The row is the better source: it has what the wizard collected, and
        # the caller only has what is on screen.
        title = title or (goal.get('title') or '')
        why = why or (goal.get('why') or '')
        description = description or (goal.get('description') or '')
        category = category or (goal.get('category') or '')
        deadline = deadline or (goal.get('deadline') or '')
        unit = goal.get('unit') or ''
        if _measure_of(goal) == 'number' and goal.get('target_number'):
            target = str(goal.get('target_number'))

    if not title:
        return fail('A goal title is required')

    try:
        titles = planner.suggest_milestones(
            title, why=why, description=description, category=category,
            unit=unit, target=target, deadline=deadline)
    except planner.PlannerUnavailable as exc:
        return fail(str(exc))
    return ok(milestones=titles)


@router.post('/api/draft_goal')
def draft_goal(body: DraftGoal, username: str = Depends(current_username)):
    """A whole goal from one sentence: title, why, category, date, checkpoints.

    Writes nothing, exactly as the two suggestion endpoints above write
    nothing — the answer lands in the creation wizard's fields and only the
    wizard's own save creates a goal. Every failure comes back as a readable
    message rather than a status, for the same reason: a draft that could not
    be made is not a broken request, it is a wizard the reader fills in
    themselves.

    The deadline is computed here rather than asked for. A model asked for a
    date returns one relative to whenever it thinks today is, which is not
    today; asked for a *duration* it answers a question it can actually
    answer, and the calendar arithmetic belongs on this side.
    """
    idea = (body.idea or '').strip()
    if not idea:
        return fail('Say what you are trying to do and this will draft the rest.')
    if len(idea) > 500:
        return fail('That is longer than this needs — a sentence is enough.')

    try:
        drafted = planner.draft_goal(idea)
    except planner.PlannerUnavailable as exc:
        return fail(str(exc))

    # `months` out, an ISO day back. `relativedelta` is not a dependency here
    # and 30-day months are close enough for a date the reader is about to
    # look at and change: this is a suggested target, not a contract.
    months = int(drafted.pop('months', 6))
    drafted['deadline'] = (date.today() + timedelta(days=months * 30)).isoformat()
    return ok(**drafted)


@router.post('/api/suggest_steps')
def suggest_steps(body: SuggestSteps, username: str = Depends(current_username)):
    """Five step titles for one checkpoint, from the model. Writes nothing.

    The same contract as `/api/suggest_milestones` above and for the same
    reasons: a draft the page puts in editable rows, and every failure back as
    a readable message rather than an error status. `/api/update_milestone`
    is what saves them, exactly as it saves a checklist typed by hand.
    """
    title = (body.title or '').strip()
    goal_id = body.goal_id
    row = None

    if body.milestone_id:
        row = db.find_row('goal_milestones', body.milestone_id, user_id=username)
        if not row:
            return fail('Checkpoint not found')
        title = title or (row.get('title') or '')
        goal_id = goal_id or row.get('goal_id')

    if not title:
        return fail('A checkpoint title is required')

    # What the goal says about itself, so the checkpoint is broken down for
    # the thing it belongs to rather than in the abstract.
    goal_title = why = description = category = unit = target = ''
    deadline = before = after = ''
    if goal_id:
        goal = db.find_row('goals', goal_id, user_id=username)
        if goal:
            goal_title = goal.get('title') or ''
            why = goal.get('why') or ''
            description = goal.get('description') or ''
            category = goal.get('category') or ''
            unit = goal.get('unit') or ''
            if _measure_of(goal) == 'number' and goal.get('target_number'):
                target = str(goal.get('target_number'))
            # The checkpoint's own date where it has one: its steps have to
            # land before it, not before the end of the whole goal.
            deadline = ((row or {}).get('target_date') or goal.get('deadline')
                        or '')
            # And the rungs either side, so its steps stay between them. See
            # `before` and `after` on planner.suggest_steps.
            if row:
                ladder = _milestones_of(db.rows_for('goal_milestones', username),
                                        goal_id)
                ids = [str(stone.get('id')) for stone in ladder]
                if str(row.get('id')) in ids:
                    at = ids.index(str(row.get('id')))
                    before = ladder[at - 1].get('title') or '' if at > 0 else ''
                    after = (ladder[at + 1].get('title') or ''
                             if at + 1 < len(ladder) else '')

    try:
        titles = planner.suggest_steps(
            title, goal=goal_title, why=why, description=description,
            category=category, unit=unit, target=target, deadline=deadline,
            before=before, after=after)
    except planner.PlannerUnavailable as exc:
        return fail(str(exc))
    return ok(steps=titles)


@router.post('/api/set_milestones')
def set_milestones(body: SetMilestones, username: str = Depends(current_username)):
    """Write a goal's whole checkpoint list at once.

    The suggestion flow's other half, and the one write that had no endpoint:
    accepting five drafts one `add_milestone` at a time would be five writes,
    five recomputes and five re-reads for a single action the user thinks of as
    one.

    Existing rows are reused by position rather than deleted and recreated, so
    a checkpoint that keeps its place keeps its id, its status and its date —
    renaming the third checkpoint does not reopen it or cut the tasks pointed
    at it loose. Rows past the end of the list are deleted, and their tasks are
    unlinked exactly as `delete_milestone` does it.

    A row this creates is created the way `add_goal` creates one: dated along
    the run-up to the goal's deadline and seeded with its three checklist
    rows. It used to be written with neither — so the model's ladder, which is
    the one that arrives through here, was the only ladder in the app with no
    dates on its timeline and a NULL checklist under every rung.
    """
    if not username or not body.goal_id:
        return fail('Username and goal ID required')

    titles = [str(title).strip() for title in body.titles if str(title).strip()]
    if not titles:
        return fail('At least one checkpoint is required')
    if len(titles) > planner.COUNT:
        return fail('A goal takes at most {} checkpoints'.format(planner.COUNT))

    goal = db.find_row('goals', body.goal_id, user_id=username)
    if not goal:
        return fail('Goal not found')

    rows = db.rows_for('goal_milestones', username)
    mine = _milestones_of(rows, body.goal_id)
    now = datetime.now().isoformat()
    # For the whole list, so a new third rung lands where a third rung of this
    # many belongs. Only the rows created below take theirs: a kept row keeps
    # the date it had, which the reader may have moved.
    dates = _spread_dates(len(titles), goal.get('deadline'))

    for position, title in enumerate(titles):
        if position < len(mine):
            db.update_row('goal_milestones', mine[position]['id'],
                          {'title': title, 'position': position}, user_id=username)
            continue
        rows.append(db.insert_row('goal_milestones', {
            "id": _fresh_milestone_id(rows),
            "goal_id": body.goal_id,
            "user_id": username,
            "title": title,
            "note": '',
            "position": position,
            "status": 'pending',
            "target_date": dates[position],
            "steps": _seed_steps(),
            "created_at": now,
        }))

    # Whatever the new list is shorter than the old one by. The tasks that
    # pointed at a dropped checkpoint lose the link and keep themselves.
    for extra in mine[len(titles):]:
        for task in db.tasks_for(username):
            if task.get('milestone_id') == extra['id']:
                db.update_row('tasks', task['id'],
                              {'milestone_id': None}, user_id=username)
        db.delete_row('goal_milestones', extra['id'], user_id=username)

    goal = _recompute_goal(body.goal_id, username)
    if goal:
        goal_matcher.goal_changed(username, goal, goal, checkpoints_changed=True)
    return ok()


@router.post('/api/update_goal_progress')
def update_goal_progress(body: UpdateGoalProgress,
                         username: str = Depends(current_username)):
    """Add to one goal's counter by hand, capped at its target."""
    if not body.goal_id:
        return fail('Goal ID required')

    # Scoped to the owner. Without that this advanced any goal in the table
    # by name, including somebody else's.
    goal = db.find_row('goals', body.goal_id, user_id=username)
    if not goal:
        return fail('Goal not found')

    goal_type = goal.get('goal_type', 'xp')
    if goal_type not in ('streak', 'tasks'):
        goal_type = 'xp'
    current_field, target_field = GOAL_FIELDS[goal_type]
    added = {'xp': body.xp_to_add,
             'streak': body.streak_to_add,
             'tasks': body.tasks_to_add}[goal_type]

    target = goal.get(target_field, 0)
    new_value = (goal.get(current_field, 0) or 0) + added
    if target and new_value > target:
        new_value = target
    status = 'completed' if (target and new_value >= target) else 'active'

    goal[current_field] = new_value
    goal['status'] = status
    goal['progress'] = _progress(new_value, target)
    goal['target_value'] = target
    _save_goal(goal, username)

    return ok(
        goal_type=goal_type,
        current=new_value,
        target=target,
        status=status,
        completed=status == 'completed',
    )

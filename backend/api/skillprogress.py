"""The skill tree's reading of real work, and the two ways to steer it.

    GET  /api/skill-progress        where the account stands on every node
    POST /api/skill-progress/book   put a session for one node on the calendar
    POST /api/skill-progress/file   say which node a task counts toward

The rules are in backend/tracking/skill_progress.py; this is the account check,
the reads and the plumbing. Both writes answer with the whole reading again, so
the page never has to work out what a booking or a move changed.

## Why booking is the main button

The tree used to have a Practice button that added XP for a click. A tile moves
now when work lands on it, so the button that helps is the one that makes the
work: a task named for the step the reader is on, filed under the node, in the
first free slot on the calendar. It carries its node in `tasks.skill_node`, so
finishing it moves this tile however the title was edited in between.
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api import booking
from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.api.tasks import CreateTask, _create as create_task
from backend.database import connection as db
from backend.tracking import session_plan
from backend.tracking import skill_progress
from backend.tracking import skillsteps
from backend.tracking.auth import load_user
from backend.tracking.plainwords import plain

router = APIRouter(tags=['skillprogress'])

TASK_COLUMNS = ('id', 'title', 'description', 'subject', 'status', 'completed_at',
                'goal_id', 'skill_node')
SITTING_COLUMNS = ('task_id', 'task_title', 'minutes', 'day')

#: How long a booked session is. Two of a step's fifteen-minute blocks plus
#: getting started, and long enough to count as a sitting on the timer.
SESSION_MINUTES = 30

#: How hard a session on a node of each tier is, on session_plan's 1-5.
TIER_LEVEL = {'foundation': 1, 'beginner': 2, 'intermediate': 3,
              'advanced': 4, 'expert': 5, 'mastery': 5}


def _known(username):
    _, user = load_user((username or '').strip())
    return bool(user)


def reading(username):
    """The account's standing, from its own rows. Never writes."""
    tasks = db.columns_for('tasks', username, TASK_COLUMNS)
    sittings = db.columns_for('focus_sittings', username, SITTING_COLUMNS)
    checks = db.rows_for('skill_checks', username)
    _tasks, goals, _matches = db.topic_inputs(username, with_tasks=False)
    return skill_progress.read(tasks, sittings, checks,
                               db.checkable_nodes(skill_progress.CHECK_MIN), goals)


@router.get('/api/skill-progress')
def read_progress(username: str = Depends(current_username)):
    if not _known(username):
        return fail('Sign in to see your skill tree.')
    return ok(**reading(username))


class Book(BaseModel):
    node_id: str = ''


@router.post('/api/skill-progress/book')
def book(body: Book, username: str = Depends(current_username)):
    """A task for the step the reader is on, in the first free slot."""
    if not _known(username):
        return fail('Sign in to plan a session.')
    node = skill_progress.catalog().get((body.node_id or '').strip())
    if not node:
        return fail("That's not a skill on any tree.")

    now = reading(username)
    figure = now['nodes'].get(node['id']) or {}
    steps = plain(skillsteps.programmes_for([node['id']]), semicolons=False).get(node['id'], [])
    step = skill_progress.step_for(int(figure.get('sessions') or 0), steps)
    if step:
        title = '{}: {}'.format(node['name'], step['title'])
        description = 'Step {} of {}. {}'.format(step['ordinal'], len(steps), step['practice'])
        if step.get('proof'):
            description += ' Done when: {}'.format(step['proof'])
    else:
        title = '{} session'.format(node['name'])
        description = 'Work on {} for {} minutes.'.format(node['name'], SESSION_MINUTES)

    level = TIER_LEVEL.get(node['tier'], 3)
    xp = session_plan.xp_for(SESSION_MINUTES, level)
    subject = skill_progress.tree_subjects().get(node['tree'])
    # Where the reader's record says this kind of work goes best, a day or
    # two from the last session for the same subject (backend/api/booking.py).
    slot = booking.Planner(username).place(SESSION_MINUTES, level, subject or 'skill:' + node['id'])
    if not slot:
        return fail('Your calendar has no free half hour in the next two weeks.')
    start, end = slot['start'], slot['end']

    goal_ids = figure.get('goal_ids') or []
    made = create_task(CreateTask(
        name=title, priority=session_plan.priority_for(xp), xp_reward=xp,
        timer_duration=SESSION_MINUTES,
        due_date=end.isoformat(timespec='seconds'), created_at=start.isoformat(timespec='seconds'),
        show_on_calendar=True, subject=subject,
        goal_id=goal_ids[0] if goal_ids else None,
    ), username)
    task_id = made.get('task_id') if isinstance(made, dict) else None
    if not task_id:
        return fail("Couldn't add that session. Try again.")
    db.update_row('tasks', task_id, {'skill_node': node['id'], 'description': description[:1000]},
                  user_id=username)
    return ok(task={'id': task_id, 'title': title, 'start': start.isoformat(timespec='minutes'),
                    'end': end.isoformat(timespec='minutes'), 'xp': xp, 'why': slot['why']},
              **reading(username))


class File(BaseModel):
    task_id: str = ''
    #: A node id, '-' for "counts toward no skill", or '' to go back to
    #: filing by name.
    node_id: Optional[str] = ''
    #: Every task with the same name too. A routine repeats its name, and
    #: moving a hundred "Orchestra rehearsal"s one at a time is not a fix.
    same_name: bool = False


@router.post('/api/skill-progress/file')
def file_task(body: File, username: str = Depends(current_username)):
    """Move a task onto a node, off every node, or back to filing by name."""
    if not _known(username):
        return fail('Sign in to change your skill tree.')
    task = db.find_row('tasks', str(body.task_id or ''), user_id=username)
    if not task:
        return fail('That task no longer exists.')
    node_id = (body.node_id or '').strip()
    if node_id not in ('', skill_progress.NO_NODE) and node_id not in skill_progress.catalog():
        return fail("That's not a skill on any tree.")
    ids = [task['id']]
    if body.same_name:
        name = skill_progress.same_name(task.get('title'))
        ids = [row['id'] for row in db.columns_for('tasks', username, ('id', 'title'))
               if skill_progress.same_name(row.get('title')) == name]
    for task_id in ids:
        db.update_row('tasks', task_id, {'skill_node': node_id or None}, user_id=username)
    return ok(task_id=task['id'], node_id=node_id, moved=len(ids), **reading(username))

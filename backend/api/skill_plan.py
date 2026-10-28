"""Skill tree plans: what to practice next in a tree, and a session to book.

Three calls. `GET /api/skill_plan?tree=` is one tree's suggestions and next
session; `GET /api/skill_plan/trees` is the top suggestion in every tree you've
practiced, for the plan and the Recommendations tab. Both only read
(tests/test_get_requests_do_not_write.py). `POST /api/skill_plan/book` puts the
session on the calendar, worked out again here rather than taken from the page.
The rules are backend/tracking/skill_plan.py.
"""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.api.review import read_queue
from backend.api.skillsteps import catalogue
from backend.api.tasks import CreateTask, _create as create_task
from backend.config import subjects as subject_catalogue
from backend.database import connection as db
from backend.tracking import session_plan, skill_plan, skillsteps
from backend.tracking.auth import load_user
from backend.tracking.plainwords import plain

router = APIRouter(tags=['skill_plan'])

#: Trees not practiced in this long drop off the summary.
SUMMARY_DAYS = 60
#: The suggestions that come from your own answers lately, which the plan
#: shows. "Start" and "ready" are offers, better made on the tree itself.
FROM_ANSWERS = ('step-back', 'ease-off', 'harder', 'continue', 'cold')

_trees = None


def trees():
    """Tree id -> {'title', 'nodes'}, built once from the node catalogue."""
    global _trees
    if _trees is None:
        _trees = {}
        for node in catalogue():
            tree = _trees.setdefault(node['tree'], {'title': node.get('treeTitle') or node['tree'], 'nodes': []})
            tree['nodes'].append(node)
    return _trees


def subject_for(tree_id):
    """The catalogue subject a tree is about, when there is one."""
    tree = trees().get(tree_id) or {}
    key = tree_id.replace('-', '_')
    if key in subject_catalogue.BY_ID:
        return key
    title = str(tree.get('title') or '').strip().lower()
    return next((sid for sid, row in subject_catalogue.BY_ID.items()
                 if str(row.get('name') or '').strip().lower() == title), None)


def _known(username):
    _, user = load_user((username or '').strip())
    return bool(user)


def read_plan(username, tree_id, budget=skill_plan.DEFAULT_BUDGET, attempts=None, review=None, today=None):
    """One tree's suggestions, session and due reviews, or None for no such tree."""
    tree = trees().get(tree_id)
    if not tree:
        return None
    today = today or date.today()
    if attempts is None:
        attempts = db.rows_for('skill_attempts', username, order='at, rowid')
    ids = {node['id'] for node in tree['nodes']}
    mine = [row for row in attempts if str(row.get('node_id')) in ids]
    library = plain(skillsteps.programmes_for(sorted(ids)), semicolons=False)
    if review is None:
        review = read_queue(username, today=today, attempts=attempts)
    due = [item for item in review['due'] if item.get('node_id') in ids]
    found, reads = skill_plan.suggestions(tree['nodes'], mine, library, today, due=due)
    plan = skill_plan.session(found, budget)
    return {
        'tree': tree_id, 'title': tree['title'], 'subject': subject_for(tree_id),
        'suggestions': found, 'session': plan,
        'session_title': skill_plan.session_title(tree['title'], plan),
        'due': due,
        'skills': len(tree['nodes']),
        'practiced': sum(1 for read in reads.values() if read['started']),
        'got': sum(1 for read in reads.values() if read['got']),
        'budgets': list(skill_plan.BUDGETS),
    }


def summary(username, today=None, review=None, attempts=None):
    """The top suggestion from your answers in each tree practiced lately,
    most recent first."""
    today = today or date.today()
    if attempts is None:
        attempts = db.rows_for('skill_attempts', username, order='at, rowid')
    if not attempts:
        return []
    by_tree = {}
    tree_of = {node['id']: node['tree'] for node in catalogue()}
    for row in attempts:
        tree = tree_of.get(str(row.get('node_id')))
        day = str(row.get('at') or '')[:10]
        if tree and day > by_tree.get(tree, ''):
            by_tree[tree] = day
    if review is None:
        review = read_queue(username, today=today, attempts=attempts)
    out = []
    for tree_id, last in sorted(by_tree.items(), key=lambda pair: pair[1], reverse=True):
        try:
            idle = (today - date.fromisoformat(last)).days
        except ValueError:
            continue
        if idle > SUMMARY_DAYS:
            continue
        plan = read_plan(username, tree_id, attempts=attempts, review=review, today=today)
        top = next((item for item in plan['suggestions'] if item['kind'] in FROM_ANSWERS), None)
        out.append({'tree': tree_id, 'title': plan['title'], 'last': last, 'idle': idle,
                    'top': top, 'due': len(plan['due']), 'practiced': plan['practiced'],
                    'got': plan['got'], 'skills': plan['skills']})
    return out


@router.get('/api/skill_plan')
def get_skill_plan(tree: str = Query(''), budget: int = Query(skill_plan.DEFAULT_BUDGET),
                   username: str = Depends(current_username)):
    """What to practice next in one tree, and one session that does it."""
    if not _known(username):
        return fail('Sign in to see your plan.')
    budget = max(10, min(120, int(budget or skill_plan.DEFAULT_BUDGET)))
    found = read_plan(username, tree, budget)
    if found is None:
        return fail("There's no skill tree called that.")
    return ok(**found)


@router.get('/api/skill_plan/trees')
def get_skill_trees_summary(username: str = Depends(current_username)):
    """Your trees, most recently practiced first, each with its top suggestion."""
    if not _known(username):
        return fail('Sign in to see your plan.')
    return ok(trees=summary(username))


class BookPlan(BaseModel):
    tree: Optional[str] = None
    budget: Optional[int] = None


@router.post('/api/skill_plan/book')
def book_skill_plan(body: BookPlan, username: str = Depends(current_username)):
    """Put a tree's next session on the calendar, in the first free slot."""
    if not _known(username):
        return fail('Sign in to book a session.')
    budget = max(10, min(120, int(body.budget or skill_plan.DEFAULT_BUDGET)))
    found = read_plan(username, body.tree or '', budget)
    if found is None:
        return fail("There's no skill tree called that.")
    plan = found['session']
    if not plan['blocks']:
        return fail('Nothing to plan in this tree yet.')
    minutes = plan['minutes']
    now = datetime.now()
    busy = session_plan.busy_spans(
        db.columns_for('tasks', username, ('show_on_calendar', 'created_at', 'due_date')),
        db.calendar_document(username), now)
    slot = session_plan.next_slot(minutes, busy, now)
    if not slot:
        return fail("There's no free {}-minute slot in the next two weeks.".format(minutes))
    start, end = slot
    xp = session_plan.xp_for(minutes, 3)
    made = create_task(CreateTask(
        name=found['session_title'], priority=session_plan.priority_for(xp), xp_reward=xp,
        due_date=end.isoformat(timespec='seconds'), created_at=start.isoformat(timespec='seconds'),
        show_on_calendar=True, subject=found['subject'],
    ), username)
    task_id = made.get('task_id') if isinstance(made, dict) else None
    if not task_id:
        return fail("That didn't book. Try again.")
    # What each block is and why, so the task says what to do when it comes up.
    db.update_row('tasks', task_id, {'description': skill_plan.session_notes(plan)}, user_id=username)
    return ok(task_id=task_id, title=found['session_title'], minutes=minutes,
              start=start.isoformat(timespec='minutes'), end=end.isoformat(timespec='minutes'))

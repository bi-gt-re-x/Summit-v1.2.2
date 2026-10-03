"""What to do next — the one list, for every page that suggests anything.

The dashboard shows its top item and the analytics page's Recommendations tab
shows the plan in full, both from here, so the two cannot disagree. The rules
are backend/tracking/next_actions.py.
"""
from datetime import datetime

from fastapi import APIRouter, Depends

from backend.api.goals import _measure_of, _milestones_of
from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.config import subjects as catalogue
from backend.database import connection as db
from backend.goal_matcher import store as goal_store
from backend.tracking import growth
from backend.tracking import next_actions
from backend.tracking.auth import load_user

router = APIRouter(tags=['next'])

#: What the rules read off a task, and nothing else. Twenty thousand rows on
#: the largest account, so whole rows — descriptions included — would be most
#: of this endpoint's time.
TASK_FIELDS = ('id', 'title', 'status', 'subject', 'priority', 'due_date', 'created_at',
               'completed_at', 'execution', 'difficulty', 'xp_value', 'completion_seconds',
               'milestone_id', 'goal_id')

#: The fortnight the streak rule reads: today, and the run before it.
RECENT_DAYS = 14


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


@router.get('/api/next_actions')
def get_next_actions(budget: int = next_actions.DEFAULT_BUDGET,
                     username: str = Depends(current_username)):
    """The plan for `budget` minutes, what did not fit, and the lens it was
    read through."""
    _, user = load_user((username or '').strip())
    if not user:
        return fail('Sign in to see what to do next.')
    budget = max(5, min(240, int(budget or next_actions.DEFAULT_BUDGET)))

    tasks = goal_store.with_goal_ids(username, db.columns_for('tasks', username, TASK_FIELDS))
    goals = db.rows_for('goals', username)
    stones = db.rows_for('goal_milestones', username)
    for goal in goals:
        goal['measure'] = _measure_of(goal)
        goal['milestones'] = _milestones_of(stones, goal.get('id'))

    series = growth.series(username, RECENT_DAYS) or {}
    days = series.get('growth_data') or []

    lens = next_actions.leading_lens(goals, tasks)
    plan = next_actions.build_plan(tasks, goals, days, _name_of(username), budget,
                                   now=datetime.now(), lens=lens)
    return ok(plan=plan, lens=lens, budgets=list(next_actions.BUDGETS))

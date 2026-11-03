"""Activity, output, progress and mastery, for the Overview tab.

One read (tests/test_get_requests_do_not_write.py). The rules, and why the four are
kept apart, are in backend/tracking/measures.py.
"""
from datetime import date

from fastapi import APIRouter, Depends

from backend.api.guard import current_username
from backend.api.next import _ready_checks, _record
from backend.api.reply import fail, ok
from backend.database import connection as db
from backend.tracking import analytics as analytics_tracking
from backend.tracking import measures as measures_tracking
from backend.tracking import skill_progress
from backend.tracking.auth import load_user

router = APIRouter(tags=['measures'])


@router.get('/api/analytics/measures')
def get_measures(username: str = Depends(current_username)):
    """The last 30 days against the 30 before, as four separate questions."""
    _, user = load_user((username or '').strip())
    if not user:
        return fail('Sign in to see this.')
    tasks, goals = _record(username)
    nodes = skill_progress.catalog()

    def name_of_node(node_id):
        return (nodes.get(node_id) or {}).get('name') or 'skill'

    return ok(**measures_tracking.read(
        tasks, goals,
        db.rows_for('records', username),
        db.rows_for('skill_attempts', username),
        db.rows_for('skill_checks', username),
        analytics_tracking.rollup_for(username),
        date.today(),
        ready=_ready_checks(username),
        name_of_node=name_of_node,
    ))

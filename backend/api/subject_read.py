"""What one subject is for, for the subject analytics page.

One read (tests/test_get_requests_do_not_write.py). The rules, and why it reads where
the work is instead of where a goal is filed, are in backend/tracking/subject_read.py.
"""
from datetime import datetime

from fastapi import APIRouter, Depends

from backend.api.guard import current_username
from backend.api.next import _name_of, _record, _sittings
from backend.api.reply import fail, ok
from backend.database import connection as db
from backend.tracking import priority
from backend.tracking import subject_read as subject_read_tracking
from backend.tracking.auth import load_user

router = APIRouter(tags=['subject-read'])

#: Which goal comes first doesn't depend on the minutes, so any budget will do.
DECISION_MINUTES = 60


@router.get('/api/analytics/subject_goal')
def get_subject_goal(subject: str = '', username: str = Depends(current_username)):
    """The goals this subject feeds, what the plan says about them and what the work shows."""
    _, user = load_user((username or '').strip())
    if not user:
        return fail('Sign in to see this.')
    subject = (subject or '').strip()[:64]
    if not subject:
        return fail("There's no subject to read.")
    now = datetime.now()
    tasks, goals = _record(username)
    sittings = _sittings(username)
    name_of = _name_of(username)
    rows = db.topic_library_for(username)[0]
    decision = priority.decide(goals, tasks, now, DECISION_MINUTES, sittings, name_of, rows)
    return ok(**subject_read_tracking.read(
        subject, name_of(subject), tasks, goals, sittings, decision, rows, now.date(), name_of))

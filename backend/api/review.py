"""The review queue: misses brought back on 1, 3, 7 and 14 days.

Two calls. The GET is a read (tests/test_get_requests_do_not_write.py): the
queue is worked out from skill attempts, scored tasks and marks already stored.
The POST stores one mark on a set or a step. A problem is reviewed by answering
it through /api/skill-attempts, like any other problem. The rules are
backend/tracking/review.py.
"""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.next import _name_of
from backend.api.reply import fail, ok
from backend.api.skillsteps import catalogue
from backend.database import connection as db
from backend.tracking import review as review_tracking
from backend.tracking import skillsteps
from backend.tracking.auth import load_user
from backend.tracking.plainwords import plain

router = APIRouter(tags=['review'])

#: What the queue reads off a task.
TASK_FIELDS = ('id', 'title', 'status', 'subject', 'completed_at', 'score_got', 'score_of')

_nodes = None


def nodes_by_id():
    """The skill catalogue by node id, built once."""
    global _nodes
    if _nodes is None:
        _nodes = {node['id']: node for node in catalogue()}
    return _nodes


def read_queue(username, today=None, attempts=None):
    """The queue for one account. Also what the plan's review row reads."""
    today = today or date.today()
    if attempts is None:
        attempts = db.rows_for('skill_attempts', username, order='at, rowid')
    tasks = db.columns_for('tasks', username, TASK_FIELDS)
    marks = db.rows_for('review_marks', username, order='at, rowid')
    ids = sorted({str(row.get('node_id')) for row in attempts if row.get('node_id')})
    # Dashes and curly quotes from older generated problems never reach a page.
    library = plain(skillsteps.programmes_for(ids), semicolons=False) if ids else {}
    return review_tracking.queue(attempts, tasks, marks, today, library=library,
                                 nodes=nodes_by_id(), name_of=_name_of(username))


@router.get('/api/review_queue')
def review_queue(username: str = Depends(current_username)):
    """What's due to redo today, and what's coming back later."""
    _, user = load_user((username or '').strip())
    if not user:
        return fail('Sign in to see what to redo.')
    return ok(**read_queue(username))


class Mark(BaseModel):
    item: Optional[str] = None
    result: Optional[str] = None


@router.post('/api/review_queue/mark')
def mark_review(body: Mark, username: str = Depends(current_username)):
    """Mark one set or step as redone: all right, or still missing some."""
    _, user = load_user((username or '').strip())
    if not user:
        return fail('Sign in to mark a review.')
    row, reason = review_tracking.clean_mark(body.model_dump())
    if reason:
        return fail(reason)
    found = read_queue(username)
    # Only something that's actually on the list. A mark for anything else
    # would sit in the table moving nothing.
    if not any(item['key'] == row['item'] for item in found['due'] + found['later']):
        return fail("That isn't on your review list any more.")
    db.insert_row('review_marks', {
        'id': str(db.new_id('review_marks')), 'user_id': username,
        'item': row['item'], 'result': row['result'],
        'at': datetime.now().isoformat(timespec='seconds'),
    })
    return ok(**read_queue(username))

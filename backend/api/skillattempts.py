"""What the reader got right and wrong on each skill.

Three endpoints over the table in data/sql/skillattempts.sql: read them all,
add one, take one back. The rules about what a believable attempt is live in
backend/tracking/skillattempts.py; this is the account check and the plumbing.

## Why the whole list, every time

The page turns these rows into a level, and a level is a function of the rows
and a date — what it is now, what it was a month ago, what it was when a period
started. Every one of those readings wants the same rows, so the page asks once
and does the arithmetic itself, the same split records.py makes and for the
same reason: nothing derived is written back, so there is nothing for the
server to keep honest beyond the rows.

## Why taking one back is a delete

A mark is a click, and a click on the wrong button is the commonest mistake the
problems screen will see. Undoing it has to leave no trace, or a reader who
pressed "Missed it" by accident carries a miss in their accuracy forever. A row
is only ever this account's, so the only thing a delete can remove is the
reader's own claim about themselves.
"""
from typing import Optional, Union

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.database import connection as db
from backend.tracking.auth import load_user
from backend.tracking.skillattempts import clean_attempt

router = APIRouter(tags=['skillattempts'])

Number = Union[int, float, str, None]


def _known(username):
    """Whether this is a real account. See the same helper in notes.py."""
    _, user = load_user((username or '').strip())
    return bool(user)


class NewAttempt(BaseModel):
    node_id: str = ''
    ordinal: Number = 0
    slot: Number = None
    weight: str = ''
    attempted: Number = 1
    correct: Number = 0
    source: str = 'problem'


class DeleteAttempt(BaseModel):
    id: Optional[str] = None


@router.get('/api/skill-attempts')
def list_attempts(username: str = Depends(current_username)):
    """Every attempt this account has logged, oldest first."""
    if not _known(username):
        return fail('Sign in to see your skill levels.')
    rows = db.rows_for('skill_attempts', username, order='at, rowid')
    return ok(attempts=rows)


@router.post('/api/skill-attempts')
def add_attempt(body: NewAttempt, username: str = Depends(current_username)):
    """Record one attempt — a marked problem, or a batch logged from elsewhere."""
    if not _known(username):
        return fail('Sign in to record practice.')

    row, reason = clean_attempt(body.model_dump())
    if reason:
        return fail(reason)

    saved = db.insert_row('skill_attempts', {
        'id': str(db.new_id('skill_attempts')),
        'user_id': username,
        **row,
    })
    return ok(attempt=saved)


@router.post('/api/skill-attempts/delete')
def delete_attempt(body: DeleteAttempt, username: str = Depends(current_username)):
    """Take one attempt back. Only ever this account's own."""
    if not _known(username):
        return fail('Sign in to change your practice.')
    if not body.id:
        return fail('Name the attempt to remove.')
    if not db.delete_row('skill_attempts', body.id, user_id=username):
        return fail('That attempt no longer exists.')
    return ok(id=body.id)

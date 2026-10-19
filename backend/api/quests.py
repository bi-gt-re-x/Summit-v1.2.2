"""Quests: what the Dashboard's quest cards read and claim.

Two calls. The GET is a read (tests/test_get_requests_do_not_write.py): it
says which first-week quests are done and claimed, and what today's quest is.
The POST pays one, once; `id: 'daily'` is today's. Both take the reader's
`day`, because their clock says when today ends. The rules, the rewards and
the double-claim guard are all in backend/tracking/quests.py; this only checks
who is asking.
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.background import head_start
from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.tracking import quests as quest_tracking

router = APIRouter(tags=['quests'])


class ClaimQuest(BaseModel):
    id: Optional[str] = None
    day: Optional[str] = None


@router.get('/api/quests')
def list_quests(day: str = '', username: str = Depends(current_username)):
    """The quest line: each quest, whether it's done and claimed, and whether
    the whole line has retired for this account. Plus today's quest, with the
    head start Analytics counts, so the card's countdown matches that page."""
    found = quest_tracking.status(username, day=day)
    if found is None:
        return fail('User not found')
    if found['daily']:
        found['daily']['head_start'] = head_start(username)
    return ok(**found)


@router.post('/api/quests/claim')
def claim_quest(body: ClaimQuest, username: str = Depends(current_username)):
    """Pay one finished quest's XP. A second claim of the same quest fails."""
    if not body.id:
        return fail('Name the quest to claim.')
    if body.id == 'daily':
        result = quest_tracking.claim_daily(username, body.day)
    else:
        result = quest_tracking.claim(username, body.id)
    if not result.pop('success'):
        return fail(result.pop('message'), **result)
    return ok(**result)

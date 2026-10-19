"""First-week quests: what the Dashboard's quest card reads and claims.

Two calls. The GET is a read (tests/test_get_requests_do_not_write.py): it
says which quests are done and which are claimed. The POST pays one, once.
The rules, the rewards and the double-claim guard are all in
backend/tracking/quests.py; this only checks who is asking.
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.tracking import quests as quest_tracking

router = APIRouter(tags=['quests'])


class ClaimQuest(BaseModel):
    id: Optional[str] = None


@router.get('/api/quests')
def list_quests(username: str = Depends(current_username)):
    """The quest line: each quest, whether it's done and claimed, and whether
    the whole line has retired for this account."""
    found = quest_tracking.status(username)
    if found is None:
        return fail('User not found')
    return ok(**found)


@router.post('/api/quests/claim')
def claim_quest(body: ClaimQuest, username: str = Depends(current_username)):
    """Pay one finished quest's XP. A second claim of the same quest fails."""
    if not body.id:
        return fail('Name the quest to claim.')
    result = quest_tracking.claim(username, body.id)
    if not result.pop('success'):
        return fail(result.pop('message'), **result)
    return ok(**result)

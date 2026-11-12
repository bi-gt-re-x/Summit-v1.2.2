"""`/api/stats`: the account's level, XP and streak.

What remains of the productivity app's dashboard API. The nametag's title is
read off the level (context/StatsProvider in the frontend), so these two routes
stay while the task list, alerts and vacation endpoints went with the pages
that read them.

## The streak decay lives on `POST /api/stats`

Asking for the account decays a streak that went stale overnight. **Exactly one
endpoint may write that**, or two requests on one page race to write the same
row. `GET /api/stats` gives the same decayed numbers and writes nothing — no GET
in this app writes (tests/test_get_requests_do_not_write.py).
"""
from fastapi import APIRouter, Depends

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.database import connection as db
from backend.tracking import xp as xp_tracking
from backend.tracking.auth import load_user

router = APIRouter(tags=['dashboard'])


def _stats_of(user):
    """The numbers every screen shows, and what the streak card draws.

    The streak half is `xp_tracking.streak_fields`: the days the run hangs on
    (a streak of 12 does not say *which* twelve days — nothing may be finished
    yet today, a forgiven day or a vacation stretches it), where its grace day
    stands, and any vacation running or to come.
    """
    return {
        "level": user.get('level', 1),
        "xp": user.get('xp', 0),
        "tasks_completed": user.get('tasks_completed', 0),
        "task_days": db.task_days(user.get('username')),
        "charge": user.get('charge', 0),
        **xp_tracking.streak_fields(user),
    }


@router.get('/api/stats')
def get_stats(username: str = Depends(current_username)):
    """The account's numbers, and nothing else — read only.

    The streak comes back as it stands today (decayed on a copy, so a streak
    lost at midnight already reads as lost), but nothing is written: a GET
    never changes the database (tests/test_get_requests_do_not_write.py).
    Writing the decay down is the POST below, which the app makes.
    """
    users, user = load_user(username)
    if not user:
        return fail('User not found')

    live = dict(user)
    xp_tracking.refresh_streak(live)
    return ok(stats=_stats_of(live))


@router.post('/api/stats')
def settle_stats(username: str = Depends(current_username)):
    """The account's numbers, with a stale streak's decay written down.

    The one place the decay is persisted — see the note at the top of this
    module. The rail and the top bar ask this (frontend/src/services/tasks
    `getStats`), so the timing is what it always was: once on arrival, and
    again after the numbers move.
    """
    users, user = load_user(username)
    if not user:
        return fail('User not found')

    if xp_tracking.refresh_streak(user):
        db.save_user(user)

    return ok(stats=_stats_of(user))

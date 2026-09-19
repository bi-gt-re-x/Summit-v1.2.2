"""The dashboard — the account's live stats and its task list.

## The three reads, and which one costs anything

`/api/stats` is six integers. `/api/alerts` is four numbers and two titles.
`/api/get_user_data` is those six integers *plus every task the account owns*,
which for the largest account in this database (9,547 tasks) is 2.9 MB of
JSON. `/api/stats` is 0.1 KB — the same six numbers, twenty thousand times
smaller.

They used to be one endpoint, and every page paid the 2.9 MB. The rail wanted
the XP for the level under the avatar; the top bar wanted counts for the bell
and a title search; the analytics page wanted nothing from it at all but held a
`useUserData()` for `username` and `reload`. None of those needed a task list,
and between them they mount on every screen behind the login.

So the split is by what the caller actually reads:

  * `/api/stats` — the rail, the top bar, anything showing level or streak.
  * `/api/alerts` — the top bar's bell. Aggregated in SQL (see
    `db.task_alert_counts`) rather than by filtering a downloaded list.
  * `/api/get_user_data` — the pages whose subject *is* the task list:
    dashboard, tasks, calendar, goals, records.

## The streak decay lives on `/api/stats`

Reading the account decays a streak that went stale overnight, so a streak lost
at midnight is gone the moment any page asks rather than whenever a task is
next completed. **Exactly one endpoint may do that**, or two reads on one page
race to write the same row.

It belongs to `/api/stats` because that is now the read every page makes: the
rail mounts outside the router and never unmounts, so `/api/stats` is fetched
once per session at exactly the moment `/api/get_user_data` used to be. The
timing of the decay is unchanged; only the endpoint carrying it moved.

`/api/get_user_data` therefore does *not* decay any more, and must not start
again — a page that reads both would otherwise write the user row twice.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.guard import current_username
from backend.api.reply import fail, ok
from backend.database import connection as db
from backend.goal_matcher import store as goal_store
from backend.tracking import xp as xp_tracking
from backend.tracking.auth import load_user

router = APIRouter(tags=['dashboard'])


class TrackDailyXp(BaseModel):
    xp_earned: int = 0
    tasks_completed: int = 0


class UpdateStats(BaseModel):
    level: Optional[int] = None
    xp: Optional[int] = None
    tasks_completed: Optional[int] = None


def _stats_of(user):
    """The six numbers every screen shows. The whole of the cheap half."""
    return {
        "level": user.get('level', 1),
        "xp": user.get('xp', 0),
        "tasks_completed": user.get('tasks_completed', 0),
        "current_streak": user.get('current_streak', 0),
        "best_streak": user.get('best_streak', 0),
        "charge": user.get('charge', 0),
    }


@router.get('/api/stats')
def get_stats(username: str = Depends(current_username)):
    """The account's numbers, and nothing else.

    This is the read the rail and the top bar make on every page, and it is the
    one that decays a stale streak — see the note at the top of this module for
    why the decay lives here and nowhere else.
    """
    users, user = load_user(username)
    if not user:
        return fail('User not found')

    if xp_tracking.refresh_streak(user):
        db.save_user(user)

    return ok(stats=_stats_of(user))


def _iso_day(value):
    """A caller-supplied `YYYY-MM-DD`, or the server's day if it is not one.

    Validated rather than trusted because it goes into a date comparison: a
    caller sending nonsense should get today's alerts, not an empty bell that
    looks like good news.
    """
    text = (value or '').strip()[:10]
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError:
        return date.today().isoformat()


@router.get('/api/alerts')
def get_alerts(day: str = '', username: str = Depends(current_username)):
    """What the top bar's bell has to say, without sending it the task list.

    `day` is the caller's local ISO day. It is a parameter rather than
    something computed here because stored stamps carry no timezone (see
    `backend/tracking/dates.py`), so the server's idea of today is only right
    when the reader happens to share its clock. A missing or malformed value
    falls back to the server's day, which is the old behaviour and is right for
    everyone in this timezone.

    `finished_today` is deliberately a boolean rather than a count: the panel
    asks whether the streak is still at risk, and one finished task settles it.
    """
    return ok(alerts=db.task_alert_counts(username, _iso_day(day)))


@router.get('/api/get_user_data')
def get_user_data(username: str = Depends(current_username)):
    """The stats block plus every task the account owns.

    The expensive read, and now only for the pages whose subject is the task
    list. It does **not** decay the streak; `/api/stats` does, and every page
    that reaches this endpoint has already made that call through the rail.
    """
    users, user = load_user(username)
    if not user:
        return fail('User not found')

    return ok(stats=_stats_of(user),
              tasks=goal_store.with_goal_ids(username, db.tasks_for(username)))


@router.post('/api/track_daily_xp')
def track_daily_xp(body: TrackDailyXp, username: str = Depends(current_username)):
    """Roll a batch of XP and completions into today's single ledger row."""

    xp_tracking.track_daily(username, body.xp_earned, body.tasks_completed)
    return ok(message='Daily XP tracked successfully')


@router.post('/api/update_stats')
def update_stats(body: UpdateStats, username: str = Depends(current_username)):
    """Write back level / XP / task count the client has recalculated."""
    users, user = load_user(username)
    if user:
        user['level'] = body.level
        user['xp'] = body.xp
        user['tasks_completed'] = body.tasks_completed
        db.save_user(user)
    return ok()

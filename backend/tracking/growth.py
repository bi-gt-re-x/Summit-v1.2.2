"""Growth: the day-by-day series behind the chart.

`series(username)` is one row per day from account creation to today, with XP,
tasks, focus minutes and running totals. Days with nothing recorded are still
rows, so the chart's x-axis is real time rather than a list of active days.

`days` is how many of the most recent to return, and **0 means all of them**.
The growth page asks for all: it lets the reader choose 7, 30, 90 or the whole
account, and every figure on it that says "vs the previous 30 days" needs the
30 before the 30 on screen. Slicing on the client rather than making a request
per range is the cheaper trade by a wide margin — a three-year-old account is
about a thousand small rows, and the alternative is six endpoints' worth of
windowing to avoid sending them.

Each row also carries what the person said about the tasks they finished that
day — see `_ratings_by_day`. Those fields are the only ones here that can be
absent for a day that had work on it, because the prompt behind them is optional
and skipping it is a supported answer; `rated_tasks` is on every row so a reader
of the series can always tell "rated badly" from "not rated".

The graded report card that shares the page lives in [analytics.py](analytics.py).
"""
from datetime import date, timedelta

from backend.database import connection as db
from backend.tracking import analytics as analytics_tracking
from backend.tracking import focus as focus_tracking
from backend.tracking import xp as xp_tracking
from backend.tracking.auth import created_date_for, find_user

# How many days the chart shows when the caller does not say.
SERIES_WINDOW = 30


def _ratings_by_day(username):
    """Per-day quality, difficulty and execution over the tasks rated that day.

    Keyed on `completed_at`, which is when the work was finished rather than
    when the prompt was answered — a task rated the next morning belongs to the
    day it was done, or the series would report quality on days nothing happened.

    Only tasks rated on both rows are counted; `rating_of` in
    backend/tracking/analytics.py is the authority on that, so the day series
    and the report card cannot disagree about what counts as rated.

    ## It is a query now

    This used to read `tasks_for` — every column of every task the account owns,
    `description` included — and loop in Python to produce about 1,800 rows of
    output from 20,000 rows of input. That was 90ms of the 141ms the whole
    growth series cost on the largest account here, paid on every page load.

    The aggregation is the same aggregation, done where the rows already are:
    see `rated_days_for` in backend/database/connection.py, which carries the
    WHERE clause that is `rating_of` in SQL and the note on why the predicate is
    written twice rather than shared. Same keys, same numbers, ~9ms.
    """
    return db.rated_days_for(username)


# --------------------------------------------------------------------------
# The day-by-day series
# --------------------------------------------------------------------------
#: The last series built, per account, and what it was built against.
#:
#: `{username: (stamp, rows, created)}` — see `_series_signature` for what the
#: stamp is made of and `series` for why this is a dict rather than anything
#: with a lifetime.
_SERIES_CACHE = {}

#: How many accounts' series are kept at once.
#:
#: A capped dict rather than an unbounded one, because each entry is every day
#: since that account was created — about 1,800 rows of twelve fields on the
#: largest here, which is not nothing to hold per user. Eight is enough that a
#: single reader moving between the growth page, the analytics page and back
#: never misses, and small enough that a busy server cannot accumulate a
#: hundred accounts' histories in a process that was only meant to serve them.
#:
#: Oldest-inserted out, not least-recently-used: `dict` keeps insertion order,
#: an eviction this coarse does not need a second structure to track, and at
#: this size the difference between the two policies is not measurable.
_SERIES_CACHE_MAX = 8


def _series_signature(username):
    """A cheap reading of everything the series is built out of.

    Four scalar aggregates. Not a figure anybody sees and never compared for
    size — only for *change*, against the value the cached series was built
    against.

    Every row the series folds comes from one of these three tables, and each
    is summed rather than counted where a row can change without being added:
    editing a task's rating moves the quality for its day and changes no count,
    and a focus session lengthening a day already on the ledger moves the focus
    minutes the same way.
    """
    return db.series_signature(username)


def series(username, days=SERIES_WINDOW):
    """The growth chart's data, or None when the account doesn't exist.

    `days` of 0 (or less) returns every day since the account was created.

    ## It is not rebuilt for every reader

    This walks every day since the account was created — 1,863 of them on the
    largest account here — and folds three tables into them. Nothing about the
    day before yesterday can change unless the record changes, and the page
    asked for the whole thing again on every load, every tab, and every time a
    reader came back to it.

    So the built rows are kept and handed back while the record they were built
    from is unchanged. The guard is a signature rather than a timestamp, for the
    reason the same pattern gives in `check_earned`
    (backend/api/achievements.py): a clock is a guess about when somebody
    finished a task, and it is wrong in both directions — rebuilding for nothing,
    or serving a series that is missing the task they just finished.

    Today is in the key as well as the signature, so the series grows a row when
    the date rolls over even on an account that did nothing.

    **In memory, and that is the honest scope of it.** It is per process, so a
    second worker builds its own and a restart drops both, which is right for a
    cache whose miss costs 49ms. Anything shared would be a table to invalidate
    and a new way for the chart to be stale.
    """
    user = find_user(db.users(), username=username)
    if not user:
        return None

    today = date.today()
    stamp = (_series_signature(username), today.isoformat())
    cached = _SERIES_CACHE.get(username)
    if cached and cached[0] == stamp:
        rows = cached[1]
        created = cached[2]
        return {
            "created_date": created.isoformat(),
            "days_since_creation": (today - created).days,
            # Sliced per call, never cached sliced: the growth page asks for 7,
            # 30, 90 and all of them off one account, and a cache holding a
            # window would miss on every one of those clicks.
            "growth_data": rows[-days:] if days and days > 0 else rows,
        }

    built = _build_series(username, user, today)
    _SERIES_CACHE[username] = (stamp, built['rows'], built['created'])
    while len(_SERIES_CACHE) > _SERIES_CACHE_MAX:
        _SERIES_CACHE.pop(next(iter(_SERIES_CACHE)))
    created = built['created']
    return {
        "created_date": created.isoformat(),
        "days_since_creation": (today - created).days,
        "growth_data": built['rows'][-days:] if days and days > 0 else built['rows'],
    }


def _build_series(username, user, today):

    """Walk every day since the account was made. The expensive half."""
    created = created_date_for(user)
    totals = xp_tracking.daily_totals(username)
    history = focus_tracking.history_for(username)
    rated = _ratings_by_day(username)

    rows = []
    cumulative_xp = 0
    cumulative_focus_min = 0
    day = min(created, today)
    day_number = 1

    while day <= today:
        iso = day.isoformat()
        bucket = totals.get(iso, {'xp': 0, 'tasks': 0})
        cumulative_xp += bucket['xp']

        record = history.get(iso) or {}
        try:
            focus_minutes = round(float(record.get('seconds', 0) or 0) / 60)
        except (TypeError, ValueError, AttributeError):
            focus_minutes = 0
        cumulative_focus_min += focus_minutes

        # Zeros rather than absent keys on an unrated day, so every row has the
        # same shape — but `rated_tasks` is what a reader must branch on, never
        # `quality_score`, because 0 there means "nobody said" and not "bad".
        say = rated.get(iso) or {
            'rated_tasks': 0,
            'quality_score': 0,
            'avg_difficulty': 0,
            'avg_execution': 0,
        }

        rows.append({
            'date': iso,
            'day_number': day_number,
            'xp_earned': bucket['xp'],
            'tasks_completed': bucket['tasks'],
            'cumulative_xp': cumulative_xp,
            'avg_task_xp': round(bucket['xp'] / bucket['tasks']) if bucket['tasks'] else 0,
            'focus_minutes': focus_minutes,
            'cumulative_focus_minutes': cumulative_focus_min,
            'rated_tasks': say['rated_tasks'],
            'quality_score': say['quality_score'],
            'avg_difficulty': say['avg_difficulty'],
            'avg_execution': say['avg_execution'],
        })
        day += timedelta(days=1)
        day_number += 1

    return {'rows': rows, 'created': created}


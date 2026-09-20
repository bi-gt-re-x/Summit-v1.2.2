"""Where one account stands against the others.

This is the aggregation the "Where You Stand" panel spent its life without.
Every other figure on the analytics page is computed from one account's own
record; these five are the only ones that need every account's, which is why
they were placeholders behind a Sample chip until now.

## What a percentile here means

The panel prints "Top N%", so a *low* number is a good one, and N is the share
of the cohort at or above the reader. It is a plain rank with no distribution
fitted to it and nothing modelled: count how many other accounts this one beats
on a measure, and turn that into a share. Ties split the difference — two
accounts on identical XP place identically rather than one of them arbitrarily
winning on row order.

## Who is in the cohort

Not every row in `users`. An account that signed up and never came back has no
measurable habit, and a cohort mostly made of those places every real account in
the top 1% of nothing. `MIN_ACTIVE_DAYS` is the bar: enough days with work on
them that there is something to compare. The reader is always placed even if
their own record is thinner than that — they are asking where they stand, and
the answer is not "you are not in the cohort" — but they are never counted as
one of the others.

Below `COHORT_FLOOR` others the endpoint reports `enough: False` and no
percentiles at all. A rank out of two accounts is arithmetically fine and
editorially worthless, and the panel would rather say the comparison does not
exist yet than print "Top 50%" and let it be read as a measurement.
"""
from datetime import date

from backend.database import connection as db
from backend.tracking import analytics as analytics_tracking
from backend.tracking import focus as focus_tracking
from backend.tracking.auth import created_date_for, find_user

# Days with work on them before an account counts as somebody to be compared to.
MIN_ACTIVE_DAYS = 3

# Other qualifying accounts needed before a placement is worth printing.
#
# This was 3, on the reasoning that the panel prints the cohort size beside the
# figures, so a small sample was disclosed rather than hidden. The disclosure is
# real and it is not enough. Against five other accounts the panel printed "Top
# 1.0%" — a figure whose finest honest step is twenty points, written to one
# decimal place, in the house style of a number that means something. A reader
# does not do that arithmetic; they read a percentile, because that is what it
# looks like. Naming the sample under a figure the figure itself misrepresents
# corrects nobody.
#
# Twenty is where a rank starts to survive one person joining or leaving: it is
# the point at which a single account is a five-point move rather than a
# twenty-point one, which is roughly the precision `_top_percent` is allowed to
# print at that size. It is a floor on being worth saying at all, not a target.
COHORT_FLOOR = 20

# The measures, in the order the panel lists them. The labels and colours are
# the frontend's business; these keys are the contract between the two.
MEASURES = ('xp', 'focus', 'consistency', 'tasks', 'score')


def _profile(user, today, ledger, focus_history, rollup):
    """One account's five measures, over the whole of its history.

    Every source is handed in rather than read here, and that is the whole
    shape of this endpoint's cost. Reading them inside meant each of the four
    reads happened once per account — and then once more per account inside the
    report card this used to call for its `score` — so the bill was the number
    of accounts multiplied by the size of everyone's history. `standing()`
    below now reads each table once, for everybody, and hands out the slices.
    """
    created = created_date_for(user)
    total_days = max((today - created).days + 1, 1)

    # Days worked, on the same three counts every other surface uses: a
    # finished task, a logged focus session, or any XP. The ledger alone is not
    # enough — a focus session earns no XP, so an account that only logs time
    # was reading as never having turned up, which both understated its
    # consistency and kept it out of the cohort under `MIN_ACTIVE_DAYS`. A task
    # finished for 0 XP files no ledger event either. See
    # frontend/src/utils/activeDay.ts, which is the client's copy of this rule.
    worked = {day for day, bucket in ledger.items() if (bucket.get('xp') or 0) > 0}
    worked |= {day for day, bucket in ledger.items() if (bucket.get('tasks') or 0) > 0}

    focus_minutes = 0.0
    for day_iso, record in focus_history.items():
        # Already a float and already floored at zero: `history_for_everyone`
        # coerces through the same `_seconds` every other focus reader goes
        # through, so the try/except this loop used to carry was guarding
        # against a shape it can no longer be handed.
        seconds = record['seconds']
        if seconds <= 0:
            continue
        focus_minutes += seconds / 60.0
        worked.add(day_iso)

    active_days = len(worked)

    # The report card's overall score, from the one scorer this app has, over
    # the window the card itself would have used. It used to come from
    # `ratings()`, which builds the whole card — five grades, five figures and
    # ten week-over-week trends — so that this line could read one integer off
    # it, and re-read `users`, the ledger, the tasks and the focus days to do
    # it. Scoring the rollup directly is the same number without the card.
    start, end = analytics_tracking.scoring_window(user, today)
    daily_goal = user.get('daily_goal') or analytics_tracking.DEFAULT_DAILY_GOAL
    score = analytics_tracking.score_window(rollup, start, end, daily_goal)['overall']

    return {
        'active_days': active_days,
        'xp': sum(bucket.get('xp') or 0 for bucket in ledger.values()),
        'tasks': sum(bucket.get('tasks') or 0 for bucket in ledger.values()),
        'focus': focus_minutes,
        # Capped at 100: an account created today with work on it would
        # otherwise read as more than every day it has existed for.
        'consistency': (min(active_days, total_days) / total_days) * 100.0,
        'score': score,
    }


def _top_percent(mine, others):
    """`mine` placed among `others`, as the "top N%" the panel prints.

    Ties count as half a win each — the standard midrank — so that a run of
    accounts on the same figure all place together instead of the comparison
    turning on the order they came out of the table.
    """
    if not others:
        return None
    beaten = sum(1 for value in others if value < mine)
    tied = sum(1 for value in others if value == mine)
    share = (beaten + tied * 0.5) / len(others)
    percent = (1.0 - share) * 100.0

    # Rounded to what the cohort can actually resolve, rather than to one
    # decimal place always. With `n` others the finest real step is 100/n, so
    # against 5 accounts every placement is a multiple of 20 and "Top 1.0%" is
    # a decimal point of pure invention. Against 500 it is genuinely a matter
    # of tenths, and this returns tenths. The figure is allowed to be as
    # precise as the sample behind it and no more.
    step = max(100.0 / len(others), 0.1)
    percent = round(percent / step) * step

    # Bounded away from both ends: "top 0%" claims the reader is beyond every
    # account that could exist, and "top 100%" is not a thing anyone wants read
    # about them.
    return max(1.0, min(99.0, round(percent, 1)))


def standing(username):
    """The five placements, the cohort behind them, or None with no account.

    ## What this reads

    Four tables, once each, whoever is being placed. The measures it compares
    are every account's, so unlike every other endpoint in this app it cannot
    scope its reads to one account — but that is an argument for reading each
    table once, not for reading it once per account, which is what this did.
    Sixteen accounts came to 132 queries and 33 MB of row dicts, and grew with
    the number of accounts multiplied by the size of everyone's history.

    The reads are hoisted here so `_profile` is handed its slices: `db.users()`
    for the created dates and daily goals, the ledger and the focus days for
    the four measures folded from them, and the daily rollups — the same
    buckets `_daily_rollup` makes, built for everybody by SQLite — for the
    fifth. An account with no rows in a table gets an empty slice, which is the
    same answer the per-account reads gave it.
    """
    users = db.users()
    me = find_user(users, username=username)
    if not me:
        return None

    today = date.today()
    ledger = db.ledger_days()
    focus_histories = focus_tracking.history_for_everyone()
    rollups = analytics_tracking.rollups_for_everyone(
        ledger=ledger, focus_histories=focus_histories)

    def profile(name, user):
        return _profile(user, today,
                        ledger.get(name) or {},
                        focus_histories.get(name) or {},
                        rollups.get(name) or {})

    mine = profile(username, me)

    others = []
    for user in users:
        name = user.get('username')
        if not name or name == username:
            continue
        other = profile(name, user)
        if other['active_days'] < MIN_ACTIVE_DAYS:
            continue
        others.append(other)

    enough = len(others) >= COHORT_FLOOR
    rows = [{
        'key': key,
        'value': round(mine[key], 1),
        'percentile': _top_percent(mine[key], [other[key] for other in others]) if enough else None,
    } for key in MEASURES]

    return {
        # The reader plus everyone they were measured against, which is what
        # "compared to N Summit users" means on the panel.
        'cohort': len(others) + 1,
        'enough': enough,
        'floor': COHORT_FLOOR,
        'rows': rows,
    }

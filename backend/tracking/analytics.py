"""Analytics: the graded report card.

Five independent metrics, each scored 0-100 with a plain letter grade, plus an
overall and week-over-week momentum for each. No streak / charge / milestone
dependencies: every number is derived from the XP ledger, the completed tasks
and the focus history.

    productivity   XP earned per day since the account was made
    quality        how well the work was done, times how hard it was
    consistency    share of days the user showed up at all — a finished task,
                   a logged focus session, or any XP earned
    efficiency     half deadlines met, half how fast tasks were finished
    focus          tracked focus time against the daily focus goal

Every computation is written to analytics.sql — one row per user per day per
metric, replacing that day's row — so the report card accumulates a history
instead of only ever showing the current number.

## What quality is measured from

Quality used to be `avg XP per task * 1.75`, under a comment that claimed it
was average task difficulty. It was not: XP is set when a task is *created*, by
the person who is about to do it, so the metric graded how ambitiously somebody
filled in a form. It never saw the work.

It is now the two things only the person who did the task knows — how well it
went and how hard it was — multiplied together, over the tasks they rated. The
product is deliberate rather than a mean of the two: an easy task done perfectly
and a brutal one botched both average to the middle, and they are not the same
week. Multiplying separates them, on a 1-25 scale where 25 is a brutal task done
excellently.

**Ratings are optional and this metric may not assume otherwise.** The prompt
after a completed task can be skipped, and about half of them are. An account
that never answers it must not be graded 0 for quality — that would turn an
optional question into a mandatory one by way of the scoreboard, and would drop
its Growth Score by up to two points for declining to answer. So quality falls
back to the old XP-per-task proxy when there is nothing rated, and `basis` says
which of the two the reader is looking at. Every surface that prints the figure
prints the basis with it; see `metricLines` on the client.
"""
from datetime import date, timedelta

from backend.database import connection as db
from backend.tracking import focus as focus_tracking
from backend.tracking import xp as xp_tracking
from backend.tracking.auth import created_date_for, find_user

METRICS = ('productivity', 'quality', 'consistency', 'efficiency', 'focus')


# --------------------------------------------------------------------------
# Grading
# --------------------------------------------------------------------------
#: The letter bands, high to low, as (floor, letter).
#:
#: The conventional school scale — ninety is an A, eighty a B, and so on down in
#: tens — with two exceptions at the top. A+ is the narrow band below a perfect
#: hundred, and S is the hundred itself: a grade you cannot reach by being very
#: good at four of the five metrics and adequate at the last, only by topping
#: all five. That is what makes it worth having.
#:
#: The bands were 95/85/72/65/40, which was neither the school scale nor any
#: other one: a 41 and a 64 shared a letter across twenty-four points while A
#: and S sat nine apart. One scale now, and it is the one a reader already knows
#: how to read. Note that it is stricter in the middle — a 73 was a B and is now
#: a C — so grades on existing accounts move down when this lands.
#:
#: frontend/src/utils/analyticalScore.ts mirrors this table. If a band moves
#: here it moves there, and `sameBandsAsBackend` is what notices if it does not.
GRADE_BANDS = (
    (100, 'S'),
    (96, 'A+'),
    (90, 'A'),
    (80, 'B'),
    (70, 'C'),
    (60, 'D'),
    (0, 'F'),
)


def grade_for_score(score):
    """Map a 0-100 score to the global letter grade."""
    for floor, letter in GRADE_BANDS:
        if score >= floor:
            return letter
    return 'F'


def _speed_score_from_minutes(minutes):
    """Map average completion time (minutes) to a 0-100 speed score."""
    if minutes <= 30:
        return 100
    if minutes <= 60:
        return 85
    if minutes <= 80:
        return 70
    if minutes <= 120:
        return 55
    return 30


def _clamp(value, low=0, high=100):
    return max(low, min(high, value))


# --------------------------------------------------------------------------
# Task ratings
# --------------------------------------------------------------------------
#: The best a single task can score: 5 for difficulty times 5 for execution.
QUALITY_MAX = 25

#: How far back the report card looks.
#:
#: It used to look at everything, and "everything" is the account's whole life:
#: `total_days` was the number of days since it was created. An account made in
#: 2021 and taken seriously in 2026 was scored on the mean of both, so the
#: five-year-old account in this repository — 4,120 tasks finished, level 60, a
#: 152-day best streak — read **"F: not enough is happening yet to score"**
#: while the same page called it the top 1% of users. The lifetime mean of a
#: long-dormant account cannot recover; there is no amount of work this month
#: that moves an average over 1,840 days.
#:
#: Ninety days is long enough that one bad week does not swing the letter and
#: short enough that a month of real work shows up in it. It is also the
#: horizon a report card is *for*: "how am I doing" means now, not since 2021.
#: Lifetime totals still exist and are still shown — on the cards that say
#: "lifetime", where the number means what it says.
SCORING_WINDOW_DAYS = 90

#: The daily XP target for an account that never chose one.
#:
#: The same 100 that Complete Profile defaults to (backend/routes/auth.py) and
#: that the settings page reads back. Named here rather than repeated, because
#: a productivity score against one number and a dashboard ring against another
#: would be two answers to "did I have a good day".
DEFAULT_DAILY_GOAL = 100


def rating_of(task):
    """A task's quality score, or None when it was not rated on both rows.

    Both halves or neither. The prompt lets somebody answer one star row and
    close the dialog, and that is a real answer to the row they filled in — but
    it is not a quality score, because half of the product is missing and there
    is no honest number to stand in for it. Treating an unanswered difficulty as
    an average one would invent the very opinion the prompt exists to collect.
    """
    difficulty = task.get('difficulty')
    execution = task.get('execution')
    if not isinstance(difficulty, (int, float)) or not isinstance(execution, (int, float)):
        return None
    if not (1 <= difficulty <= 5 and 1 <= execution <= 5):
        return None
    return int(difficulty) * int(execution)


def rating_summary(tasks):
    """Mean quality, mean difficulty, mean execution and the counts behind them.

    `rated` is the denominator that matters and is returned rather than left for
    the caller to infer: "16.2 out of 25" from four tasks and from four hundred
    are different claims, and a panel that prints the first without the second is
    inviting the wrong one.
    """
    scores = []
    difficulties = []
    executions = []
    for task in tasks:
        score = rating_of(task)
        if score is None:
            continue
        scores.append(score)
        difficulties.append(int(task['difficulty']))
        executions.append(int(task['execution']))

    rated = len(scores)
    mean = (lambda values: sum(values) / len(values) if values else 0)
    return {
        'rated': rated,
        'avg_quality': mean(scores),
        'avg_difficulty': mean(difficulties),
        'avg_execution': mean(executions),
    }


def _message(metric_scores):
    """Short qualitative note based on the strongest / weakest metric."""
    phrases = {
        'productivity': ('strong daily output', 'raise your daily XP'),
        'quality': ('hard work done well', 'take on harder tasks, or finish them better'),
        'consistency': ('showing up daily', 'show up more often'),
        'efficiency': ('fast, on-time work', 'work faster and beat deadlines'),
        'focus': ('locked-in focus sessions', 'hit your daily focus goal'),
    }
    if not metric_scores:
        return "Complete tasks to build your rating."
    best = max(metric_scores, key=metric_scores.get)
    worst = min(metric_scores, key=metric_scores.get)
    if metric_scores[worst] >= 85:
        return "Excellent across the board — keep it up."
    if best == worst:
        return phrases[best][0].capitalize() + "."
    return "{} — {}.".format(phrases[best][0].capitalize(), phrases[worst][1])


def _trend(current, previous):
    """Week-over-week movement as a direction and a percentage."""
    if previous > 0:
        pct = round((current - previous) / previous * 100)
    elif current > 0:
        pct = 100
    else:
        pct = 0
    return {
        'direction': 'up' if pct > 0 else ('down' if pct < 0 else 'flat'),
        'pct': pct,
    }


# --------------------------------------------------------------------------
# The day rollup, and scoring a window off it
# --------------------------------------------------------------------------
# Everything the five metrics need, bucketed by the day it happened on.
#
# ## Why this exists
#
# `ratings()` scored one window — the trailing ninety days — and read the raw
# rows once to do it. The Growth tab asks the same five questions of six
# windows at a time and then of a hundred-odd trailing windows to draw a line,
# and re-reading the ledger, the task table and the focus history for each of
# those is the same three scans repeated a hundred times.
#
# So the rows are read once and folded into one row per day. Every one of the
# five metrics is a ratio of sums over the days in a window, which is what
# makes this work at all: there is nothing in the scoring that needs to see an
# individual task once its day has been counted. Scoring a window is then a
# walk over the days in that window and nothing else.
#
# ## This is not a second scoring formula
#
# The one rule this module has. `score_window` below is the *only* place the
# five metrics are computed, and `ratings()` calls it for the ninety-day
# window exactly as `period_scores()` calls it for every other one. The
# arithmetic in it is the arithmetic that used to sit inline in `ratings()`,
# moved rather than rewritten — see test_report_card.py, which pins the
# figures it produces and did not change when it moved.
#
# `rollups_for_everyone` does not bend that rule either, and it is the one
# below that looks like it might. It is a second way of *building* the days —
# from SQL aggregates rather than from row dicts, because the standing panel
# needs them for every account at once — and no way at all of scoring them.
# The buckets it fills are `empty_day`'s, the same ones `_daily_rollup` fills,
# and the scorer they go to is the same `score_window`. tests/test_standing.py
# holds the two builders to the same buckets, field for field.
def empty_day():
    """One day's bucket with nothing in it yet.

    Lifted out of `_daily_rollup` when a second builder appeared:
    `rollups_for_everyone` below fills the same buckets from SQL aggregates
    rather than from row dicts, and two copies of this list of fields is
    exactly the drift that would have made the two disagree by a field nobody
    noticed. `score_window` reads every key here and no others.
    """
    return {
        # Productivity
        'xp': 0, 'earned': False,
        # Consistency — a wider thing than earning; see `worked` in the two
        # builders below.
        'worked': False,
        # Quality
        'tasks': 0, 'task_xp': 0,
        'rated': 0, 'quality_sum': 0, 'difficulty_sum': 0, 'execution_sum': 0,
        # Efficiency
        'timed': 0, 'seconds_sum': 0,
        'deadline_tracked': 0, 'on_time': 0,
        # Focus
        'focus_seconds': 0.0, 'focus_goal_seconds': 0.0,
    }


def _daily_rollup(username, tasks=None, events=None, focus_history=None):
    """One bucket per day the account did anything on.

    The three sources are optional so a caller that has already read them —
    `ratings()` needs the raw task rows for its week-over-week trends — passes
    them in rather than paying for the scan twice.
    """
    events = xp_tracking.events_for(username) if events is None else events
    tasks = db.tasks_for(username) if tasks is None else tasks
    focus_history = (focus_tracking.history_for(username)
                     if focus_history is None else focus_history)

    days = {}

    def bucket(day_iso):
        if day_iso not in days:
            days[day_iso] = empty_day()
        return days[day_iso]

    for event in events:
        day = xp_tracking.event_day(event)
        if not day:
            continue
        row = bucket(day)
        row['xp'] += event.get('amount', 0) or 0
        row['earned'] = True
        row['worked'] = True

    # A focus session earns no XP — there is no ledger event behind a timer —
    # so somebody who sat down for two hours and logged it, without ticking a
    # task off, had a day the ledger cannot see. Consistency asks whether they
    # showed up, and they did. Same definition as `isActiveDay` in
    # frontend/src/utils/activeDay.ts, deliberately.
    for day_iso, record_row in focus_history.items():
        try:
            seconds = float(record_row.get('seconds', 0) or 0)
            goal = float(record_row.get('goal_hours', 0) or 0) * 3600.0
        except (TypeError, ValueError, AttributeError):
            continue
        if seconds <= 0:
            # A day with a row and no seconds on it adds its goal to the
            # denominator and nothing to the numerator, which marks a day off
            # down twice — here and in consistency. See the focus note in
            # `score_window`.
            continue
        row = bucket(day_iso)
        row['focus_seconds'] += seconds
        row['focus_goal_seconds'] += goal
        row['worked'] = True

    for task in tasks:
        if task.get('status') != 'done':
            continue
        day = str(task.get('completed_at') or '')[:10]
        if not day:
            continue
        row = bucket(day)
        row['worked'] = True
        row['tasks'] += 1
        row['task_xp'] += task.get('xp_value', 0) or 0

        score = rating_of(task)
        if score is not None:
            row['rated'] += 1
            row['quality_sum'] += score
            row['difficulty_sum'] += int(task['difficulty'])
            row['execution_sum'] += int(task['execution'])

        if isinstance(task.get('completion_seconds'), (int, float)):
            row['timed'] += 1
            row['seconds_sum'] += task['completion_seconds']
        if 'met_deadline' in task:
            row['deadline_tracked'] += 1
            if task.get('met_deadline'):
                row['on_time'] += 1

    return days


def rollups_for_everyone(ledger=None, focus_histories=None):
    """`_daily_rollup` for every account at once: `{username: {day: bucket}}`.

    Same buckets, same arithmetic, three queries instead of four per account.
    `/api/standing` is the caller: it scores every account on the instance so
    that it can rank one of them, and doing that through `_daily_rollup` meant
    reading each account's whole task history and whole ledger into Python —
    26,004 task rows and 23,270 ledger rows on this database, most of it
    columns a score never looks at. The two `db` calls below fold the same
    tables to daily totals inside SQLite and hand back only the totals.

    Nothing is decided here that `_daily_rollup` does not decide: the day keys
    are the same days, the sums are the same sums, and `worked` is set by the
    same three things — a ledger event, a focus session with time on it, or a
    finished task. What is gone is the per-row Python, not a rule.
    """
    # Optional for the same reason `_daily_rollup`'s three sources are: the
    # standing panel reads the ledger and the focus days for its own figures
    # too, and paying for either scan twice is the thing this function is for.
    ledger = db.ledger_days() if ledger is None else ledger
    focus_histories = (focus_tracking.history_for_everyone()
                       if focus_histories is None else focus_histories)

    rollups = {}

    def bucket(username, day_iso):
        days = rollups.setdefault(username, {})
        if day_iso not in days:
            days[day_iso] = empty_day()
        return days[day_iso]

    # A day with a ledger row on it earned something, whatever the amount —
    # `_daily_rollup` marks `earned` on the presence of an event, not on its
    # size, and a row here means at least one event.
    for username, days in ledger.items():
        for day_iso, totals in days.items():
            row = bucket(username, day_iso)
            row['xp'] += totals['xp']
            row['earned'] = True
            row['worked'] = True

    # A focus session earns no XP, so a day spent at the timer without ticking
    # anything off is a day the ledger cannot see. A row with no seconds on it
    # is skipped rather than counted as a zero — see `_daily_rollup`, which
    # explains why adding its goal to the denominator marks a day off twice.
    for username, history in focus_histories.items():
        for day_iso, record in history.items():
            seconds = record['seconds']
            if seconds <= 0:
                continue
            row = bucket(username, day_iso)
            row['focus_seconds'] += seconds
            row['focus_goal_seconds'] += record['goal_hours'] * 3600.0
            row['worked'] = True

    for username, days in db.completed_task_days().items():
        for day_iso, totals in days.items():
            row = bucket(username, day_iso)
            row['worked'] = True
            for field, value in totals.items():
                row[field] += value

    return rollups


def scoring_window(user, today=None):
    """The inclusive day range the report card is scored over: `(start, end)`.

    The last ninety days, or the whole account where it is younger than that —
    a three-day-old account is scored on three days rather than being marked
    down for eighty-seven days it did not exist for. See SCORING_WINDOW_DAYS.

    A function rather than four lines inside `ratings()` because the standing
    panel scores every account on the instance and has to score them over the
    window the card would have used, or its `score` measure is comparing
    figures the card never printed.
    """
    today = today or date.today()
    lifetime_days = max((today - created_date_for(user)).days + 1, 1)
    return today - timedelta(days=min(lifetime_days, SCORING_WINDOW_DAYS) - 1), today


def score_window(rollup, start, end, daily_goal):
    """The five metrics over the inclusive day range [start, end].

    The whole of the report card's arithmetic, and the only copy of it. Returns
    the scores together with the measured figures behind them, in the shape the
    card's `metrics` block wants — the caller adds the grades and the trends.

    `total_days` is the length of the range as asked for, not the number of
    days that have anything on them: consistency is the share of the window
    that was worked, so the days with nothing are exactly what it is measuring.
    """
    total_days = max((end - start).days + 1, 1)

    total_xp = 0
    earning_days = 0
    active_days = 0
    total_tasks = 0
    total_task_xp = 0
    rated = 0
    quality_sum = 0
    difficulty_sum = 0
    execution_sum = 0
    timed = 0
    seconds_sum = 0
    deadline_tracked = 0
    on_time = 0
    focused_sec = 0.0
    focus_goal_sec = 0.0
    focus_days = 0

    day = start
    while day <= end:
        row = rollup.get(day.isoformat())
        day += timedelta(days=1)
        if row is None:
            continue
        total_xp += row['xp']
        earning_days += 1 if row['earned'] else 0
        active_days += 1 if row['worked'] else 0
        total_tasks += row['tasks']
        total_task_xp += row['task_xp']
        rated += row['rated']
        quality_sum += row['quality_sum']
        difficulty_sum += row['difficulty_sum']
        execution_sum += row['execution_sum']
        timed += row['timed']
        seconds_sum += row['seconds_sum']
        deadline_tracked += row['deadline_tracked']
        on_time += row['on_time']
        focused_sec += row['focus_seconds']
        focus_goal_sec += row['focus_goal_seconds']
        focus_days += 1 if row['focus_seconds'] > 0 else 0

    # Per day that *earned*, not per day on the calendar. Turning up is what
    # consistency measures, and scoring the same absence twice is why a
    # five-day-a-week account was marked down for its weekends in two metrics
    # at once. This is "how much do you get done when you work".
    avg_daily_xp = (total_xp / earning_days) if earning_days else 0
    avg_task_xp = (total_task_xp / total_tasks) if total_tasks else 0
    avg_quality = (quality_sum / rated) if rated else 0
    avg_difficulty = (difficulty_sum / rated) if rated else 0
    avg_execution = (execution_sum / rated) if rated else 0

    # 1. Productivity — a day's work against the day's goal the account set
    #    itself. The divisor was a flat 3, which is 300 XP a day for full
    #    marks: a number nobody chose, applied to everybody.
    productivity_score = round(_clamp(avg_daily_xp / (daily_goal or DEFAULT_DAILY_GOAL) * 100))

    # 2. Quality — how well the work went, times how hard it was, over the
    #    tasks that were rated. Falls back to the XP proxy when none were; see
    #    the module docstring for why an unrated account is not graded zero.
    quality_basis = 'ratings' if rated else 'xp'
    if quality_basis == 'ratings':
        # The geometric mean of the two answers, on their own 1-5 scale, as a
        # percentage of 5. `avg_quality` is the mean of difficulty x execution,
        # so its square root is the typical rating — and a task rated 3 and 3
        # scores 60 rather than the 36 a straight 9/25 gave it. The product's
        # midpoint is not the scale's midpoint, and reading it as one is what
        # made ordinary good work look like a failure.
        quality_score = round(_clamp((avg_quality ** 0.5) / 5 * 100))
    else:
        quality_score = round(_clamp(avg_task_xp * 1.75))

    # 3. Consistency — share of the window's days the account showed up on, on
    #    any of the three counts: a finished task, a logged focus session, or
    #    any XP at all.
    active_days = min(active_days, total_days)
    consistency_rate = (active_days / total_days) * 100
    consistency_score = round(_clamp(consistency_rate))

    # 4. Efficiency — deadlines only. The other half used to be a "speed" score
    #    off `completion_seconds` — the wall-clock gap between creating a task
    #    and finishing it — which is not speed, it is scheduling: a task
    #    written on Monday for Friday scores as five days of slowness. That
    #    punished the exact behaviour the calendar and the goals page exist to
    #    encourage. `avg_minutes` is still measured and still shown, because it
    #    is interesting; it no longer decides a grade it was never a fair
    #    measure of.
    avg_minutes = ((seconds_sum / timed) / 60.0) if timed else None
    deadline_score = (on_time / deadline_tracked * 100) if deadline_tracked else 0
    efficiency_score = round(_clamp(deadline_score))

    # 5. Focus — tracked focus time against the daily focus goal, counted over
    #    the days focus was actually tracked. See `_daily_rollup`, which is
    #    where a day with a row and no seconds is dropped.
    focus_ratio = (focused_sec / focus_goal_sec) if focus_goal_sec > 0 else 0.0
    focus_score = round(_clamp(focus_ratio * 100))

    parts = {
        'productivity': productivity_score,
        'quality': quality_score,
        'consistency': consistency_score,
        'efficiency': efficiency_score,
        'focus': focus_score,
    }

    return {
        'parts': parts,
        'overall': round(_clamp(sum(parts.values()) / len(parts))),
        'figures': {
            # More than the one figure the score divides. The Growth tab prints
            # these under the score as the evidence for it, and a metric that
            # reports a single number gives a reader nothing to check it
            # against — see `partsOf` in components/Analytics/GrowthPeriod.
            'productivity': {
                'avg_daily_xp': round(avg_daily_xp),
                'total_xp': total_xp,
                'earning_days': earning_days,
                'tasks': total_tasks,
                'daily_goal': daily_goal or DEFAULT_DAILY_GOAL,
            },
            'quality': {
                'avg_task_xp': round(avg_task_xp),
                'basis': quality_basis,
                'rated_tasks': rated,
                'total_tasks': total_tasks,
                'avg_quality': round(avg_quality, 1),
                'avg_difficulty': round(avg_difficulty, 1),
                'avg_execution': round(avg_execution, 1),
                'max_quality': QUALITY_MAX,
            },
            'consistency': {
                'active_days': active_days,
                'total_days': total_days,
                'rate': round(consistency_rate),
            },
            'efficiency': {
                # Display floor of 1 minute so a near-instant task never reads
                # "Avg 0 Min/Task" (the raw value still drives nothing).
                'avg_minutes': max(1, round(avg_minutes)) if avg_minutes is not None else None,
                'on_time_pct': round(deadline_score),
                'has_timing': bool(timed),
                'on_time': on_time,
                'deadline_tracked': deadline_tracked,
            },
            'focus': {
                'focused_minutes': round(focused_sec / 60),
                'goal_minutes': round(focus_goal_sec / 60),
                'pct_of_goal': round(focus_ratio * 100),
                'focus_days': focus_days,
            },
        },
    }


# --------------------------------------------------------------------------
# The report card
# --------------------------------------------------------------------------
def ratings(username, record=True):
    """The five-metric graded report card, or None when there's no account.

    Writing the result is the default: every look at the report card leaves a
    dated row per metric behind in analytics.sql.
    """
    user = find_user(db.users(), username=username)
    if not user:
        return None

    today = date.today()

    # The window the card is scored over. `total_days` is reassigned below out
    # of the figures `score_window` measured; this is the range going in.
    window_start, today = scoring_window(user, today)

    # Read once, folded into one row per day, and scored by the one scorer
    # this module has. Everything from `within` down to the five `_clamp`
    # calls used to sit inline here; it now lives in `score_window` above,
    # because the Growth tab asks the same five questions of six other windows
    # and two copies of this arithmetic is exactly what that would have become.
    events = xp_tracking.events_for(username)
    all_tasks = db.tasks_for(username)
    focus_history = focus_tracking.history_for(username)
    rollup = _daily_rollup(username, tasks=all_tasks, events=events,
                           focus_history=focus_history)

    daily_goal = user.get('daily_goal') or DEFAULT_DAILY_GOAL
    scored = score_window(rollup, window_start, today, daily_goal)
    figures = scored['figures']

    productivity_score = scored['parts']['productivity']
    quality_score = scored['parts']['quality']
    consistency_score = scored['parts']['consistency']
    efficiency_score = scored['parts']['efficiency']
    focus_score = scored['parts']['focus']

    avg_daily_xp = figures['productivity']['avg_daily_xp']
    avg_task_xp = figures['quality']['avg_task_xp']
    quality_basis = figures['quality']['basis']
    rated = {'rated': figures['quality']['rated_tasks'],
             'avg_quality': figures['quality']['avg_quality'],
             'avg_difficulty': figures['quality']['avg_difficulty'],
             'avg_execution': figures['quality']['avg_execution']}
    total_tasks = figures['quality']['total_tasks']
    active_days = figures['consistency']['active_days']
    total_days = figures['consistency']['total_days']
    consistency_rate = figures['consistency']['rate']
    avg_minutes = figures['efficiency']['avg_minutes']
    deadline_score = figures['efficiency']['on_time_pct']
    timed = figures['efficiency']['has_timing']
    focused_sec = figures['focus']['focused_minutes'] * 60
    focus_goal_sec = figures['focus']['goal_minutes'] * 60
    focus_ratio = figures['focus']['pct_of_goal'] / 100

    def within(day_iso):
        parsed = xp_tracking.parse_day(day_iso)
        return parsed is not None and window_start <= parsed <= today

    # The week-over-week trends below still read the raw rows. They are not the
    # score and are not scored the same way — `window_efficiency` blends speed
    # back in, which the grade deliberately no longer does — so folding them
    # into `score_window` would have quietly changed what the arrows mean.
    done = [t for t in all_tasks
            if t.get('status') == 'done' and within(str(t.get('completed_at') or '')[:10])]

    worked_day_set = {day for day, row in rollup.items() if row['worked'] and within(day)}

    parts = scored['parts']
    overall_score = scored['overall']

    # --- Week-over-week momentum, for the hero and every card ---
    def in_window(day_iso, lo_days, hi_days):
        parsed = xp_tracking.parse_day(day_iso)
        return parsed is not None and lo_days <= (today - parsed).days <= hi_days

    def window_stats(lo_days, hi_days):
        """XP, task count and days worked in a window.

        `active_days` counts the same three things the metric it is the trend
        of counts — a finished task, a logged focus session, or any XP. It was
        the ledger's days alone, which made the consistency card's arrow the
        derivative of a different figure than the one printed above it.
        """
        xp = 0
        tasks = 0
        days = set()
        for event in events:
            day = xp_tracking.event_day(event)
            if in_window(day, lo_days, hi_days):
                xp += event.get('amount', 0) or 0
                tasks += event.get('tasks_completed', 1) or 0
                days.add(day)
        for day in worked_day_set:
            if in_window(day, lo_days, hi_days):
                days.add(day)
        return {'xp': xp, 'tasks': tasks, 'active_days': len(days)}

    def window_efficiency(lo_days, hi_days):
        """Efficiency over tasks completed within a window, or None."""
        secs = []
        met = []
        for task in done:
            parsed = xp_tracking.parse_day(task.get('completed_at'))
            if parsed is None:
                continue
            if not (lo_days <= (today - parsed).days <= hi_days):
                continue
            if isinstance(task.get('completion_seconds'), (int, float)):
                secs.append(task['completion_seconds'])
            if 'met_deadline' in task:
                met.append(bool(task['met_deadline']))
        if not secs and not met:
            return None
        spd = _speed_score_from_minutes((sum(secs) / len(secs)) / 60.0) if secs else 0
        dln = (sum(1 for x in met if x) / len(met) * 100) if met else 0
        return _clamp(dln * 0.5 + spd * 0.5)

    def window_tasks(lo_days, hi_days):
        """Completed tasks finished inside a window, for the quality trend."""
        rows = []
        for task in done:
            parsed = xp_tracking.parse_day(task.get('completed_at'))
            if parsed is not None and lo_days <= (today - parsed).days <= hi_days:
                rows.append(task)
        return rows

    this_w = window_stats(0, 6)
    prev_w = window_stats(7, 13)

    # The trend has to be measured on the same basis as the score, or the arrow
    # beside the figure is about a different quantity than the figure — an
    # account whose ratings improved while its XP-per-task fell would read
    # "16.2 / 25 ↓". Both halves fall back together.
    if quality_basis == 'ratings':
        this_quality = rating_summary(window_tasks(0, 6))['avg_quality']
        prev_quality = rating_summary(window_tasks(7, 13))['avg_quality']
    else:
        this_quality = (this_w['xp'] / this_w['tasks']) if this_w['tasks'] else 0
        prev_quality = (prev_w['xp'] / prev_w['tasks']) if prev_w['tasks'] else 0

    productivity_trend = _trend(this_w['xp'], prev_w['xp'])
    quality_trend = _trend(this_quality, prev_quality)
    consistency_trend = _trend(this_w['active_days'], prev_w['active_days'])
    efficiency_trend = _trend(window_efficiency(0, 6) or 0, window_efficiency(7, 13) or 0)
    focus_trend = _trend(focus_tracking.seconds_in_window(username, 0, 6, today),
                         focus_tracking.seconds_in_window(username, 7, 13, today))

    card = {
        "overall": {
            "score": overall_score,
            "grade": grade_for_score(overall_score),
            "message": _message(parts),
            "trend": productivity_trend,
        },
        "metrics": {
            "productivity": {
                "score": productivity_score,
                "grade": grade_for_score(productivity_score),
                "avg_daily_xp": round(avg_daily_xp),
                "trend": productivity_trend,
            },
            "quality": {
                "score": quality_score,
                "grade": grade_for_score(quality_score),
                "avg_task_xp": round(avg_task_xp),
                # Which of the two the score came from, and the counts behind
                # it. `rated_tasks` against `total_tasks` is the coverage the
                # client prints beside the figure — see the module docstring.
                "basis": quality_basis,
                "rated_tasks": rated['rated'],
                "total_tasks": total_tasks,
                "avg_quality": round(rated['avg_quality'], 1),
                "avg_difficulty": round(rated['avg_difficulty'], 1),
                "avg_execution": round(rated['avg_execution'], 1),
                "max_quality": QUALITY_MAX,
                "trend": quality_trend,
            },
            "consistency": {
                "score": consistency_score,
                "grade": grade_for_score(consistency_score),
                "active_days": active_days,
                "total_days": total_days,
                "rate": round(consistency_rate),
                "trend": consistency_trend,
            },
            "efficiency": {
                "score": efficiency_score,
                # Display floor of 1 minute so a near-instant task never reads
                # "Avg 0 Min/Task" (the raw value still drives the speed score).
                "avg_minutes": max(1, round(avg_minutes)) if avg_minutes is not None else None,
                "grade": grade_for_score(efficiency_score),
                "on_time_pct": round(deadline_score),
                "has_timing": bool(timed),
                "trend": efficiency_trend,
            },
            "focus": {
                "score": focus_score,
                "grade": grade_for_score(focus_score),
                "focused_minutes": round(focused_sec / 60),
                "goal_minutes": round(focus_goal_sec / 60),
                "pct_of_goal": round(focus_ratio * 100),
                "trend": focus_trend,
            },
        },
    }

    if record:
        save_snapshot(username, card)
    return card


# --------------------------------------------------------------------------
# History
# --------------------------------------------------------------------------
def save_snapshot(username, card, day=None):
    """Write today's grades to analytics.sql, replacing today's if present."""
    day = day or date.today().isoformat()
    rows = [r for r in db.metric_snapshots()
            if not (r.get('user_id') == username and r.get('date') == day)]

    for name in METRICS:
        metric = card['metrics'][name]
        rows.append({
            'user_id': username,
            'date': day,
            'metric': name,
            'score': metric['score'],
            'grade': metric['grade'],
            'detail': {k: v for k, v in metric.items() if k not in ('score', 'grade')},
        })
    rows.append({
        'user_id': username,
        'date': day,
        'metric': 'overall',
        'score': card['overall']['score'],
        'grade': card['overall']['grade'],
        'detail': {k: v for k, v in card['overall'].items() if k not in ('score', 'grade')},
    })

    db.save_metric_snapshots(rows)


def history(username, metric=None):
    """Past grades for an account, oldest first."""
    rows = [r for r in db.metric_snapshots() if r.get('user_id') == username]
    if metric:
        rows = [r for r in rows if r.get('metric') == metric]
    return sorted(rows, key=lambda r: (r.get('date') or '', r.get('metric') or ''))


# --------------------------------------------------------------------------
# Periods — the same five metrics, asked of more than one window
# --------------------------------------------------------------------------
#: The windows the Growth tab offers, as (key, label, days).
#:
#: `None` days means "since the account was created". The rest are trailing
#: windows ending today, and they are the row of buttons at the top of the tab
#: rather than a set of calendar periods: "the last 30 days" is a question with
#: one answer, and "this month" is a question whose answer changes meaning on
#: the first of the month. A reader comparing themselves to a month ago wants
#: the former.
PERIODS = (
    ('7d', 'Last 7 days', 7),
    ('30d', 'Last 30 days', 30),
    ('90d', 'Last 3 months', 90),
    ('180d', 'Last 6 months', 180),
    ('365d', 'Last year', 365),
    ('all', 'Since you started', None),
)

PERIOD_KEYS = tuple(key for key, _label, _days in PERIODS)

#: The most points a period's line is drawn from.
#:
#: Sixty, because the chart is about six hundred units wide and a line with a
#: point every ten units is already smoother than the reader can see. Above
#: this the payload grows and the drawing does not change.
MAX_SERIES_POINTS = 60

#: The shortest trailing window a point on the line may be scored over.
#:
#: Every point on the growth line is the five metrics scored over the days
#: *behind* it, which is what makes the line a moving average rather than a
#: daily reading. It has to be a window rather than a day because four of the
#: five metrics are meaningless for a single day — consistency over one day is
#: 0 or 100, and quality over a day nobody rated is not a reading at all.
MIN_TREND_WINDOW = 7

#: The longest one. Past a month the line stops responding to anything inside
#: the period the reader picked, which is the period they asked about.
MAX_TREND_WINDOW = 30

#: Points in a period card's sparkline.
#:
#: Twelve, because the card is about 150px wide and a sparkline is read as a
#: *shape* rather than as a series — the reader is asking "did this climb or
#: sag", not "what was it on the 14th". More points at that width is a thicker
#: line saying the same thing.
SPARK_POINTS = 12


def _period_bounds(period, today, created):
    """The inclusive [start, end] a period key names, and its length in days."""
    for key, _label, days in PERIODS:
        if key != period:
            continue
        if days is None:
            return created, today, max((today - created).days + 1, 1)
        start = today - timedelta(days=days - 1)
        # An account younger than the window is scored on the days it has
        # existed for rather than marked down for the ones it has not, which
        # is the same rule `ratings()` follows. See SCORING_WINDOW_DAYS.
        start = max(start, created)
        return start, today, max((today - start).days + 1, 1)
    raise ValueError('unknown period: %s' % period)


def _growth_pct(current, previous):
    """Movement from one score to the next, as a percentage of the previous.

    `None` rather than a number when there is nothing to have moved from. A
    period with no earlier equivalent — the first month of an account, or "since
    you started", which has nothing before it by definition — has no growth
    figure, and printing one anyway is how "+100%" comes to mean "we had no
    idea". The client draws a dash.
    """
    if previous is None or previous <= 0:
        return None
    return round((current - previous) / previous * 100, 1)


def period_scores(username, period='30d', rollup=None, user=None, today=None):
    """The five metrics over one period, the one before it, and a line.

    Everything the Growth tab draws, from one read of the record. The scoring
    is `score_window` in every case — this function chooses windows and does no
    arithmetic of its own beyond the percentage changes.
    """
    user = user or find_user(db.users(), username=username)
    if not user:
        return None
    if period not in PERIOD_KEYS:
        period = '30d'

    today = today or date.today()
    created = created_date_for(user)
    daily_goal = user.get('daily_goal') or DEFAULT_DAILY_GOAL
    rollup = _daily_rollup(username) if rollup is None else rollup

    start, end, length = _period_bounds(period, today, created)

    def scored(from_day, to_day):
        return score_window(rollup, from_day, to_day, daily_goal)

    current = scored(start, end)

    # The equivalent stretch immediately before this one, or None when the
    # account is not old enough to have had one. Comparing a 30-day window
    # against a 4-day scrap of history that happens to precede it would be a
    # comparison against noise, dressed up as a comparison against a month.
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=length - 1)
    previous = scored(prev_start, prev_end) if prev_start >= created else None

    # ---- The line ---------------------------------------------------------
    # Each point is the five metrics over the days behind it, so the line is a
    # moving average and reads as "how was I doing around then". The window is
    # a sixth of the period, held between a week and a month.
    trend_window = max(MIN_TREND_WINDOW, min(MAX_TREND_WINDOW, round(length / 6)))
    step = max(1, -(-length // MAX_SERIES_POINTS))

    series = []
    day = start
    while day <= end:
        point_start = max(day - timedelta(days=trend_window - 1), created)
        point = score_window(rollup, point_start, day, daily_goal)
        series.append(dict(point['parts'], date=day.isoformat(), overall=point['overall']))
        day += timedelta(days=step)
    # The period's last day is the reading the rest of the tab states, so the
    # line has to end on it. Stepping by anything but 1 usually stops short.
    if series and series[-1]['date'] != end.isoformat():
        point = score_window(rollup, max(end - timedelta(days=trend_window - 1), created),
                             end, daily_goal)
        series.append(dict(point['parts'], date=end.isoformat(), overall=point['overall']))

    # ---- Every period's headline, for the row of cards --------------------
    # Cheap — a window is a walk over its own days — and it saves the tab a
    # request per card. The reader sees all six at once and picks one.
    cards = []
    for key, label, _days in PERIODS:
        card_start, card_end, card_len = _period_bounds(key, today, created)
        card_now = scored(card_start, card_end)
        card_prev_end = card_start - timedelta(days=1)
        card_prev_start = card_prev_end - timedelta(days=card_len - 1)
        card_before = (scored(card_prev_start, card_prev_end)
                       if card_prev_start >= created else None)
        # The card's own shape, so the row does not need a request per card.
        # Same trailing-window scoring as the main line — see `trend_window`
        # above — because a card whose sparkline was drawn from daily readings
        # would disagree with the chart the card opens.
        card_trend = max(MIN_TREND_WINDOW, min(MAX_TREND_WINDOW, round(card_len / 6)))
        spark = []
        for n in range(SPARK_POINTS):
            at = card_start + timedelta(
                days=round(n * (card_len - 1) / max(1, SPARK_POINTS - 1)))
            spark.append(scored(
                max(at - timedelta(days=card_trend - 1), created), at)['overall'])

        cards.append({
            'key': key,
            'label': label,
            'days': card_len,
            'spark': spark,
            'overall': card_now['overall'],
            'previous': card_before['overall'] if card_before else None,
            'change': _growth_pct(card_now['overall'],
                                  card_before['overall'] if card_before else None),
            # Whether the window is the length it says it is. A 30-day card on
            # a 12-day-old account is a 12-day card, and the tab says so rather
            # than letting the label lie.
            'partial': card_len < (_days or card_len),
        })

    return {
        'period': period,
        'label': next(label for key, label, _d in PERIODS if key == period),
        'start': start.isoformat(),
        'end': end.isoformat(),
        'days': length,
        'trend_window': trend_window,
        'current': {
            'overall': current['overall'],
            'grade': grade_for_score(current['overall']),
            'parts': current['parts'],
            'grades': {name: grade_for_score(score)
                       for name, score in current['parts'].items()},
            'figures': current['figures'],
        },
        'previous': None if previous is None else {
            'overall': previous['overall'],
            'grade': grade_for_score(previous['overall']),
            'parts': previous['parts'],
            'grades': {name: grade_for_score(score)
                       for name, score in previous['parts'].items()},
            'figures': previous['figures'],
            'start': prev_start.isoformat(),
            'end': prev_end.isoformat(),
        },
        'change': {
            'overall': _growth_pct(current['overall'],
                                   previous['overall'] if previous else None),
            **{name: _growth_pct(current['parts'][name],
                                 previous['parts'][name] if previous else None)
               for name in METRICS},
        },
        'series': series,
        'periods': cards,
    }

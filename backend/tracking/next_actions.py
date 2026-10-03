"""What should I do next? A short plan for the time you actually have.

The one list the app keeps of what to do. The dashboard shows its top item and
the analytics page's Recommendations tab shows the whole plan; both read
`/api/next_actions`, so the two cannot suggest different things. It used to be
worked out in the browser (frontend/src/utils/nextActions.ts), separately by
each page, with different inputs — the dashboard had no lens and a monthly
tiebreak, the analytics page a lens and a weekly one — and they disagreed.

The output is a plan, not a list:

    You have 45 minutes
    → Finish "Chapter 7 problem set"        due today            25 min
    → Practise Geometry                     weakest rating       20 min

## Why it is a budget and not a ranking

A ranking answers "what matters most", and the honest answer to that is often
three things that take two hours. A budget answers the question the reader
actually has — what do I do with the time I have — so candidates are ranked and
then packed into the minutes, and anything that does not fit waits in `more`.

## The rules

Nine of them, each reading the record rather than a setting: overdue work, work
due today, a goal behind its schedule, the subject whose work is rated worst, a
batch of badly rated recent work, a subject dropped after steady work, a task
sitting undated for a fortnight, a subject on a run of days, and a day with
nothing on it yet. Each sets a weight; the ordering is the weights, tilted by
the lens of the goal the reader is putting most work into.

## The lens

Which of the reader's goals leads, and what kind of goal it is, decides what
the plan leans toward: a goal measured in days in a row leans toward keeping a
streak, a goal measured in totals toward clearing what is overdue, a hard
outcome goal toward depth, and an ordinary one toward getting the routine work
right. The lens is returned with the plan so the page can say what it is
reading through.
"""
import time
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from backend.tracking.goal_health import evidence_for, js_round, measure_of

BUDGETS = (15, 30, 45, 60, 90, 120)
DEFAULT_BUDGET = 45

#: A task with no timing history takes this long.
FALLBACK_TASK_MINUTES = 25
#: An hour of study on a subject, halved: long enough to matter.
PRACTICE_MINUTES = 30
#: Nothing shorter is worth planning.
MIN_SLOT = 10
#: Days without work after which a steady subject counts as dropped.
NEGLECT_DAYS = 12
#: Days an undated task sits before it is "do or drop".
STALE_DAYS = 14
#: An execution rating at or under this is a badly done task.
POOR_EXECUTION = 2
#: Finished tasks a subject needs before its ratings or its silence mean much.
SUBJECT_FLOOR = 5
#: Days in a row before a subject is "on a run".
MOMENTUM_DAYS = 3
#: The most low-rated tasks one sitting asks to redo.
REVIEW_MAX = 5
#: How far back "recent" reaches for low-rated work.
RECENT_DAYS = 14

#: A lens needs this many rated tasks before it reads a goal by difficulty.
MIN_RATED = 8
#: A mean difficulty at or over this is hard work.
HARD = 3.5

LENSES = {
    'accuracy': {
        'id': 'accuracy',
        'label': 'Accuracy and control',
        'priorities': ['quality', 'consistency', 'efficiency', 'productivity', 'tasks', 'focus', 'xp'],
        'watch': [
            'How well rated work goes, not how much of it there is',
            'Subjects where execution drops below your own average',
            'Whether the standard holds across days rather than peaking',
        ],
        'weights': {'review': 1.5, 'weak-subject': 1.4, 'stale': 1.1, 'streak': 0.8},
    },
    'depth': {
        'id': 'depth',
        'label': 'Depth and difficulty',
        'priorities': ['focus', 'quality', 'productivity', 'tasks', 'consistency', 'efficiency', 'xp'],
        'watch': [
            'Unbroken time, because hard work needs a long sitting',
            'How the hardest work you rate actually goes',
            'Whether one subject is going deep or several are going shallow',
        ],
        'weights': {'goal': 1.5, 'weak-subject': 1.2, 'neglected': 0.8, 'streak': 0.8},
    },
    'volume': {
        'id': 'volume',
        'label': 'Throughput',
        'priorities': ['productivity', 'efficiency', 'tasks', 'xp', 'consistency', 'quality', 'focus'],
        'watch': [
            'XP a day, and whether it is rising',
            'How many tasks actually close rather than accumulate',
            'What is sitting unfinished and dragging the rate down',
        ],
        'weights': {'overdue': 1.4, 'stale': 1.3, 'goal': 1.2, 'review': 0.8},
    },
    'consistency': {
        'id': 'consistency',
        'label': 'Turning up',
        'priorities': ['consistency', 'focus', 'productivity', 'tasks', 'quality', 'efficiency', 'xp'],
        'watch': [
            'The share of days with anything on them',
            'The length of the gaps, not the size of the good days',
            'Whether the habit survives a bad week',
        ],
        'weights': {'streak': 1.5, 'neglected': 1.3, 'goal': 1.1, 'review': 0.9},
    },
}


# ---------------------------------------------------------------------------
# Small things the page used to do in JavaScript, done the same way here
# ---------------------------------------------------------------------------
def _num(value):
    """`Number(value) || 0`."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0
    if number != number:  # NaN
        return 0
    return int(number) if number.is_integer() else number


def to_fixed(value, places=1):
    """`Number.prototype.toFixed`: an exact tie rounds up, where Python's own
    formatting would round it to even and print 3.2 for a 3.25 the page always
    printed as 3.3."""
    step = Decimal(1).scaleb(-places)
    return str(Decimal(value).quantize(step, rounding=ROUND_HALF_UP))


def seeded(key):
    """A stable number in [0, 1) for a string — FNV-1a over UTF-16 code units,
    the same hash utils/recent.ts uses, so ties break the same way."""
    hashed = 2166136261
    data = key.encode('utf-16-le')
    for at in range(0, len(data), 2):
        hashed ^= data[at] | (data[at + 1] << 8)
        hashed = (hashed * 16777619) & 0xFFFFFFFF
    return (hashed % 10000) / 10000


def week_stamp(day):
    """The ISO week, `2026-W40`. The plan's tiebreak holds still for a week."""
    year, week, _ = day.isocalendar()
    return '{}-W{:02d}'.format(year, week)


def _midnight(value):
    try:
        return datetime.combine(date.fromisoformat(str(value or '')[:10]), datetime.min.time())
    except ValueError:
        return None


DAY_MS = 86_400_000


def _ms(moment):
    """Milliseconds since the epoch for a local wall-clock time — real elapsed
    time, so a span across a clock change is an hour longer or shorter, as it
    was when the page did this sum."""
    return time.mktime(moment.timetuple()) * 1000 + moment.microsecond / 1000


def _days_ago(value, now):
    at = _midnight(value)
    if at is None:
        return None
    return int((_ms(now) - _ms(at)) // DAY_MS)


def goal_ids_of(task):
    ids = [str(one) for one in (task.get('goal_ids') or [])]
    own = str(task.get('goal_id') or '')
    if ids:
        return [own] + ids if own and own not in ids else ids
    return [own] if own else []


def _links_to(task, goal_id):
    return str(task.get('goal_id') or '') == str(goal_id) or \
        str(goal_id) in [str(one) for one in (task.get('goal_ids') or [])]


def typical_minutes(finished):
    """The median timed task, in minutes, between ten and sixty — or None with
    fewer than five timed."""
    timed = sorted(s for s in (_num(task.get('completion_seconds')) for task in finished) if s > 0)
    if len(timed) < 5:
        return None
    minutes = js_round(timed[len(timed) // 2] / 60)
    return min(60, max(MIN_SLOT, minutes))


# ---------------------------------------------------------------------------
# The lens
# ---------------------------------------------------------------------------
def goal_lens(goal, tasks):
    """What this goal turns on, or None when the record cannot tell yet."""
    if goal.get('status') == 'completed':
        return None
    measure = measure_of(goal)
    rated = [task for task in evidence_for(goal, tasks)
             if task.get('status') == 'done' and isinstance(task.get('difficulty'), (int, float))
             and task.get('difficulty') > 0]
    mean = sum(task['difficulty'] for task in rated) / len(rated) if len(rated) >= MIN_RATED else None
    title = goal.get('title') or ''

    def wrap(lens_id, because):
        return dict(LENSES[lens_id], goalId=goal.get('id'), goalTitle=title, because=because,
                    difficulty=mean, rated=len(rated))

    if measure in ('streak', 'focus'):
        return wrap('consistency', '{} is measured in {}, so how often you turn up is the goal.'.format(
            title, 'days in a row' if measure == 'streak' else 'time logged'))
    if measure in ('xp', 'tasks'):
        return wrap('volume', '{} counts totals, so the rate it fills at is what moves it.'.format(title))
    if mean is None:
        return None
    if mean >= HARD:
        return wrap('depth', 'Your {} rated tasks for this goal average {}/5 for difficulty, so focus '
                             'on harder work, not more of it.'.format(len(rated), to_fixed(mean)))
    return wrap('accuracy', 'The {} tasks you rated for this average {} out of 5 for difficulty, so '
                            'what decides it is how reliably the ordinary work goes.'.format(
                                len(rated), to_fixed(mean)))


def leading_lens(goals, tasks):
    """The lens of the live goal with the most finished work behind it."""
    ranked = []
    for goal in goals:
        if goal.get('status') == 'completed':
            continue
        lens = goal_lens(goal, tasks)
        if lens is None:
            continue
        aimed = sum(1 for task in evidence_for(goal, tasks) if task.get('status') == 'done')
        ranked.append((aimed, lens))
    ranked.sort(key=lambda row: (-row[0], row[1]['goalTitle'].lower(), row[1]['goalTitle']))
    return ranked[0][1] if ranked else None


# ---------------------------------------------------------------------------
# The candidates
# ---------------------------------------------------------------------------
def _action(**fields):
    return {key: value for key, value in fields.items() if value is not None or key in
            ('id', 'kind', 'title', 'because', 'minutes', 'weight')}


def gather(tasks, goals, days, name_of, now, stamp, lens=None):
    """Every suggestion the record supports, best first, one per task or subject."""
    found = []
    today = now.date()
    today_iso = today.isoformat()

    open_tasks = [task for task in tasks if task.get('status') != 'done']
    finished = [task for task in tasks if task.get('status') == 'done']
    slot = typical_minutes(finished) or FALLBACK_TASK_MINUTES

    def due_day(task):
        return str(task.get('due_date') or '')[:10]

    overdue = sorted((task for task in open_tasks if task.get('due_date') and due_day(task) < today_iso),
                     key=lambda task: str(task.get('due_date')))
    for index, task in enumerate(overdue[:3]):
        late = _days_ago(task.get('due_date'), now) or 0
        found.append(_action(
            id='overdue-{}'.format(task.get('id')), kind='overdue',
            title='Finish “{}”'.format(task.get('title')),
            because='Due {}. Your oldest open task.'.format(
                'yesterday' if late == 1 else '{} days ago'.format(late)),
            minutes=slot, taskId=task.get('id'), subject=task.get('subject') or None,
            goalId=(goal_ids_of(task) or [None])[0],
            weight=1000 - index * 10 + min(late, 30)))

    due_today = [task for task in open_tasks if task.get('due_date') and due_day(task) == today_iso]
    for index, task in enumerate(due_today[:3]):
        found.append(_action(
            id='due-{}'.format(task.get('id')), kind='due',
            title='Finish “{}”'.format(task.get('title')), because='Due today.',
            minutes=slot, taskId=task.get('id'), subject=task.get('subject') or None,
            goalId=(goal_ids_of(task) or [None])[0],
            weight=900 - index * 10 + (25 if task.get('priority') == 'high' else 0)))

    behind = []
    for goal in goals:
        if goal.get('status') != 'active' or not goal.get('deadline'):
            continue
        left = _days_ago(goal.get('deadline'), now)
        if left is None:
            continue
        remaining = -left
        if remaining < 0 or remaining > 45:
            continue
        started = _midnight(goal.get('start_date') or goal.get('created_at'))
        ends = _midnight(goal.get('deadline'))
        if started is None or ends is None:
            continue
        span = max(1, _ms(ends) - _ms(started))
        elapsed = min(1.0, max(0.0, (_ms(now) - _ms(started)) / span))
        gap = elapsed * 100 - _num(goal.get('progress'))
        if gap > 8:
            behind.append((goal, remaining, gap))
    behind.sort(key=lambda row: -row[2])
    for index, (goal, remaining, gap) in enumerate(behind[:2]):
        stones = sorted((row for row in (goal.get('milestones') or []) if row.get('status') != 'done'),
                        key=lambda row: _num(row.get('position')))
        stone = stones[0] if stones else None
        linked = next((task for task in open_tasks
                       if _links_to(task, goal.get('id'))
                       or (stone and task.get('milestone_id') == stone.get('id'))), None)
        title = goal.get('title')
        found.append(_action(
            id='goal-{}'.format(goal.get('id')), kind='goal',
            title=('Finish “{}” for {}'.format(linked.get('title'), title) if linked
                   else 'Work on “{}” for {}'.format(stone.get('title'), title) if stone
                   else 'Put an hour into {}'.format(title)),
            because='{} day{} left, {}% behind schedule.'.format(
                remaining, '' if remaining == 1 else 's', js_round(gap)),
            minutes=slot, taskId=linked.get('id') if linked else None, goalId=goal.get('id'),
            weight=800 - index * 20 + min(gap, 40)))

    by_subject = {}
    for task in finished:
        if task.get('subject'):
            by_subject.setdefault(task['subject'], []).append(task)

    ratings = []
    for subject, rows in by_subject.items():
        rated = [task for task in rows if _num(task.get('execution')) > 0]
        if len(rows) >= SUBJECT_FLOOR and rated:
            ratings.append({'subject': subject, 'rated': len(rated),
                            'execution': sum(_num(task.get('execution')) for task in rated) / len(rated)})
    if len(ratings) >= 2:
        ratings.sort(key=lambda row: row['execution'])
        worst = ratings[0]
        average = sum(row['execution'] for row in ratings) / len(ratings)
        if worst['execution'] < average - 0.3:
            found.append(_action(
                id='weak-{}'.format(worst['subject']), kind='weak-subject',
                title='Practise {}'.format(name_of(worst['subject'])),
                because='You rate it {}/5, compared with {} for other subjects ({} rated tasks).'.format(
                    to_fixed(worst['execution']), to_fixed(average), worst['rated']),
                minutes=PRACTICE_MINUTES, subject=worst['subject'],
                weight=620 + (average - worst['execution']) * 40))

    poor = []
    for task in finished:
        age = _days_ago(task.get('completed_at'), now)
        execution = _num(task.get('execution'))
        if 0 < execution <= POOR_EXECUTION and age is not None and age <= RECENT_DAYS:
            poor.append(task)
    if len(poor) >= 3:
        takeable = min(len(poor), REVIEW_MAX)
        newest = sorted(poor, key=lambda task: str(task.get('completed_at') or ''), reverse=True)
        subject = next((task.get('subject') for task in newest if task.get('subject')), None)
        found.append(_action(
            id='review-poor', kind='review',
            title='Redo your {} latest low-rated tasks'.format(takeable),
            because=('{} tasks rated 1–2/5 for execution in the last two weeks. Start with the newest {}.'
                     .format(len(poor), takeable) if len(poor) > takeable else
                     '{} tasks rated 1–2/5 for execution in the last two weeks, none revisited yet.'
                     .format(len(poor))),
            minutes=min(30, max(MIN_SLOT, takeable * 6)), subject=subject,
            weight=560 + min(len(poor), 12) * 6))

    dropped = []
    for subject, rows in by_subject.items():
        ages = sorted(age for age in (_days_ago(task.get('completed_at'), now) for task in rows)
                      if age is not None)
        since = ages[0] if ages else None
        if len(rows) >= SUBJECT_FLOOR and since is not None and since >= NEGLECT_DAYS:
            dropped.append((subject, len(rows), since))
    dropped.sort(key=lambda row: -row[2])
    if dropped:
        subject, count, since = dropped[0]
        found.append(_action(
            id='neglected-{}'.format(subject), kind='neglected',
            title='Come back to {}'.format(name_of(subject)),
            because='Nothing in {} days, after {} tasks.'.format(since, count),
            minutes=PRACTICE_MINUTES, subject=subject, weight=540 + min(since, 40)))

    stale = []
    for task in open_tasks:
        age = _days_ago(task.get('created_at'), now)
        if age is not None and age >= STALE_DAYS and not task.get('due_date'):
            stale.append((task, age))
    stale.sort(key=lambda row: -row[1])
    if stale:
        task, age = stale[0]
        found.append(_action(
            id='stale-{}'.format(task.get('id')), kind='stale',
            title='Do or drop “{}”'.format(task.get('title')),
            because='On your list for {} days with no due date. Do it this week or delete it.'.format(age),
            minutes=min(slot, 20), taskId=task.get('id'), subject=task.get('subject') or None,
            weight=420 + min(age, 30)))

    runs = []
    for subject, rows in by_subject.items():
        done = {str(task.get('completed_at'))[:10] for task in rows if task.get('completed_at')}
        cursor = today if today_iso in done else today - timedelta(days=1)
        run = 0
        while cursor.isoformat() in done:
            run += 1
            cursor -= timedelta(days=1)
        if run >= MOMENTUM_DAYS:
            runs.append((subject, run))
    runs.sort(key=lambda row: -row[1])
    if runs:
        subject, run = runs[0]
        found.append(_action(
            id='momentum-{}'.format(subject), kind='momentum',
            title='Keep {} going'.format(name_of(subject)),
            because='{} days running. Your longest current run — the cheapest day to keep it is today.'
            .format(run),
            minutes=min(PRACTICE_MINUTES, max(MIN_SLOT, slot)), subject=subject,
            weight=400 + min(run, 20) * 4))

    last = days[-1] if days else None
    if (last and last.get('date') == today_iso and _num(last.get('tasks_completed')) == 0
            and _num(last.get('xp_earned')) == 0):
        size = lambda task: _num(task.get('xp_value'))  # noqa: E731
        undated = sorted((task for task in open_tasks if not task.get('due_date')), key=size)
        quickest = undated[0] if undated else (sorted(open_tasks, key=size) or [None])[0]
        run = 0
        for day in reversed(days[:-1]):
            if _num(day.get('tasks_completed')) == 0:
                break
            run += 1
        found.append(_action(
            id='streak', kind='streak',
            title='Close “{}”'.format(quickest.get('title')) if quickest else 'Close one small task',
            because=('{} days running, and nothing finished today. One task carries it.'.format(run)
                     if run >= 2 else 'Nothing done today yet. One task keeps your streak going.'),
            minutes=MIN_SLOT, taskId=quickest.get('id') if quickest else None,
            subject=(quickest.get('subject') or None) if quickest else None, weight=380))

    weights = (lens or {}).get('weights') or {}
    found.sort(key=lambda item: (-(item['weight'] * weights.get(item['kind'], 1)),
                                 seeded(stamp + str(item['id']))))
    seen_task, seen_subject, out = set(), set(), []
    for item in found:
        if item.get('taskId') is not None:
            if item['taskId'] in seen_task:
                continue
            seen_task.add(item['taskId'])
        if item.get('subject') and item['kind'] in ('weak-subject', 'neglected'):
            if item['subject'] in seen_subject:
                continue
            seen_subject.add(item['subject'])
        out.append(item)
    return out


def build_plan(tasks, goals, days, name_of, budget, now=None, stamp=None, lens=None):
    """The candidates packed into `budget` minutes, and what did not fit."""
    now = now or datetime.now()
    stamp = stamp if stamp is not None else week_stamp(now.date())
    actions, more, left = [], [], budget
    candidates = gather(tasks, goals, days, name_of, now, stamp, lens)
    for item in candidates:
        if item['minutes'] <= left:
            actions.append(item)
            left -= item['minutes']
        else:
            more.append(item)

    # Whatever is left over, spent on the best thing that did not fit — once,
    # and last. Fifteen minutes of the most important thing is a real answer,
    # because you do not have to finish a task to have started it.
    if left >= MIN_SLOT and more:
        first = more.pop(0)
        actions.append(dict(first, minutes=left, because='{} Takes about {} min; this gets it started.'
                            .format(first['because'], first['minutes'])))
        left = 0

    planned = sum(item['minutes'] for item in actions)
    # The single best thing, whatever it costs — what the dashboard's one line
    # shows. Not `actions[0]`: an overdue hour-long task does not fit a short
    # budget, and the line that answers "what next" should not skip it for that.
    top = candidates[0] if candidates else None
    return {'budget': budget, 'actions': actions, 'spare': max(0, budget - planned),
            'more': more, 'planned': planned, 'top': top}

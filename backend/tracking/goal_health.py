"""Goal health — is this actually going to happen?

Three answers, and only one of them is a judgement:

    on-track     nothing below says otherwise
    behind       past its date, more than ten points behind the calendar, or
                 linked work that has gone quiet for a fortnight
    not-started  nothing recorded against it yet — not a failure

The line under the chip names the rule that decided it, so the reader can
argue with it.

This used to be worked out in the browser (frontend/src/utils/goalHealth.ts),
once per screen that showed a goal. It lives here now so every screen reads the
same answer: `/api/get_goals` attaches it to each goal as `health`. The
summary over a set of goals is a tally of these, done where the set is drawn
(`systemHealth` in frontend/src/utils/goalHealth.ts).

## What counts as evidence

"Gone quiet" is counted off the *tasks linked to the goal*, not off the
account's activity as a whole: an account can be busy every day and still be
doing nothing about the goal it is worried about. A goal measured by a counter
(XP, a streak, focus, tasks) has no links of its own — every task feeds it — so
its evidence is the whole record.

A goal with no linked task is never called behind for being quiet, and a goal
with no date is never behind the calendar, because there is no calendar for it
to be behind.

## What this module does not do

It does not turn tasks into progress. Forty linked tasks and four checkpoints
do not make one finished task 2.5% of a goal — see the note at the top of
backend/api/goals.py.
"""
import math
from datetime import date

#: The four counters a goal can be measured by, and the pair of fields each
#: one reads. The same table as GOAL_FIELDS in backend/api/goals.py.
COUNTERS = {
    'xp': ('current_xp', 'target_xp'),
    'streak': ('current_streak', 'target_streak'),
    'tasks': ('current_tasks', 'target_tasks'),
    'focus': ('current_focus', 'target_focus'),
}

#: How far behind the calendar, as a share of the goal, before it is behind.
BEHIND_BY = 0.1

#: How long linked work can go quiet before the goal is behind.
QUIET_DAYS = 14

#: The window "worked on N times recently" is counted over.
EVIDENCE_DAYS = 14

LABELS = {
    'on-track': 'On Track',
    'behind': 'Behind',
    'not-started': 'Not Started',
}


def _day(value):
    """The calendar day an ISO date or timestamp names, or None."""
    text = str(value or '')[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def js_round(value):
    """`Math.round`: halves go up. Python's `round` sends them to the even
    neighbour, which would print 2.5% as 2% where the page used to say 3%."""
    return math.floor(value + 0.5)


def _number(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def measure_of(goal):
    """How the goal's progress is read: a counter, a number, or milestones."""
    measure = (goal.get('measure') or '').strip()
    if measure in ('number', 'milestones') or measure in COUNTERS:
        return measure
    goal_type = goal.get('goal_type') or 'xp'
    return goal_type if goal_type in COUNTERS else 'xp'


def progress_of(goal):
    """How much of the goal is done, 0-100."""
    measure = measure_of(goal)
    completed = goal.get('status') == 'completed'
    if measure == 'milestones':
        rows = goal.get('milestones') or []
        if completed:
            return 100.0
        done = sum(1 for row in rows if row.get('status') == 'done')
        return done / len(rows) * 100 if rows else 0.0
    if measure == 'number':
        current, target = _number(goal.get('current_value')), _number(goal.get('target_number'))
    else:
        current_field, target_field = COUNTERS[measure]
        current, target = _number(goal.get(current_field)), _number(goal.get(target_field))
    if completed:
        return 100.0
    return min(current / target * 100, 100.0) if target > 0 else 0.0


def links_to(task, goal_id):
    """Whether a task counts toward a goal: its own column or a matched link."""
    goal_id = str(goal_id)
    if str(task.get('goal_id') or '') == goal_id:
        return True
    return goal_id in [str(one) for one in (task.get('goal_ids') or [])]


def evidence_for(goal, tasks):
    """The tasks that say whether work on this goal is happening."""
    if measure_of(goal) in ('number', 'milestones'):
        return [task for task in tasks if links_to(task, goal.get('id'))]
    return tasks


def _evidence(linked, today):
    done = [task for task in linked if task.get('status') == 'done' and task.get('completed_at')]
    days = sorted({str(task['completed_at'])[:10] for task in done}, reverse=True)
    recent = 0
    for task in done:
        at = _day(task['completed_at'])
        if at is not None and (today - at).days < EVIDENCE_DAYS:
            recent += 1
    return done, days, recent


def _plural(count, word):
    return '{} {}{}'.format(count, word, '' if count == 1 else 's')


def goal_health(goal, tasks, today=None, cache=None):
    """The state, its label, the sentence that explains it, and the figures.

    `cache` is a dict the caller keeps across goals. Every counter goal reads
    the whole task list as its evidence, so on an account with several of them
    the same twenty thousand rows would be walked once per goal; with a cache
    they are walked once.
    """
    today = today or date.today()
    progress = max(0.0, min(1.0, progress_of(goal) / 100))
    linked = evidence_for(goal, tasks)
    if cache is not None and linked is tasks:
        if 'whole' not in cache:
            cache['whole'] = _evidence(tasks, today)
        done, days, recent_tasks = cache['whole']
    else:
        done, days, recent_tasks = _evidence(linked, today)

    start = _day(goal.get('start_date')) or _day(goal.get('created_at'))
    end = _day(goal.get('deadline'))
    days_total = (end - start).days if start and end else None
    days_left = (end - today).days if end else None

    expected = None
    if days_total is not None and days_total > 0 and start is not None:
        expected = max(0.0, min(1.0, (today - start).days / days_total))
    ahead = None if expected is None else progress - expected

    last = _day(days[0]) if days else None
    days_since_work = (today - last).days if last else None

    milestones = goal.get('milestones') or []
    stones_done = sum(1 for row in milestones if row.get('status') == 'done')

    signals = {
        'progress': progress,
        'expected': expected,
        'ahead': ahead,
        'daysLeft': days_left,
        'daysTotal': days_total,
        'daysSinceWork': days_since_work,
        'recentTasks': recent_tasks,
        'checkpoints': ({'done': stones_done, 'total': len(milestones)}
                        if milestones else None),
    }
    pct = js_round(progress * 100)

    def result(state, reason, label=None):
        return {'state': state, 'label': label or LABELS[state],
                'reason': reason, 'signals': signals}

    if goal.get('status') == 'completed' or progress >= 1:
        return result('on-track', 'Reached.', 'Complete')

    # Nothing has happened at all. A goal set this morning is not failing, and
    # colouring it red would teach the reader to ignore the colour.
    if progress <= 0 and not done and stones_done == 0:
        return result('not-started', 'Nothing recorded against this yet.')

    if days_left is not None and days_left < 0:
        return result('behind', 'Its date passed {} ago and it is {}% done.'.format(
            _plural(-days_left, 'day'), pct))

    if ahead is not None and ahead < -BEHIND_BY:
        return result('behind', '{} points behind where the calendar says it should be, '
                                'with {} left.'.format(js_round(-ahead * 100),
                                                       _plural(days_left, 'day')))

    if days_since_work is not None and days_since_work >= QUIET_DAYS:
        return result('behind', 'Nothing done toward this in {} days.'.format(days_since_work))

    if ahead is not None and ahead > 0.08:
        return result('on-track', '{}% done with {}% of the time left — ahead of pace.'.format(
            pct, js_round((1 - (expected or 0)) * 100)))
    if recent_tasks > 0:
        return result('on-track', '{}% done, and worked on {} in the last fortnight.'.format(
            pct, _plural(recent_tasks, 'time')))
    return result('on-track', '{}% done and keeping pace.'.format(pct))

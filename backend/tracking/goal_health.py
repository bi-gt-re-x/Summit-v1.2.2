"""Goal health — is this actually going to happen?

Three answers, and only one of them is a judgement:

    on-track     nothing below says otherwise
    behind       past its date, well behind the calendar, or work on it that
                 has gone quiet for two weeks
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

## Work in the goal's subject counts too (2026-11-08)

Links come from the matcher, which needs the task's *words* to name the goal:
"Codecademy loops lesson" filed under Python is not matched to "Learn Python".
So a student doing the work every day, without typing the goal's name, saw the
goal go quiet and then go red. That is the app blaming the reader for its own
bookkeeping, and it is the fastest way to teach somebody to stop opening the
page.

So finished tasks filed under one of the goal's subjects count as *work* on it:
they keep it from reading as quiet and they are counted in "worked on N
times". They never count as progress, which still moves only with checkpoints
or the number, and a goal with no subject gets nothing extra. Two goals in one
subject share that subject's work, which is right: it is work toward both.

## Behind the calendar is a judgement, so it is made carefully

A goal is behind the calendar when it trails by more than ten points and
nothing has been done on it in two weeks, or when it trails by more than
twenty-five points whatever is happening. Between the two, with recent work,
it reads "Working on it": the reader is doing the work and has not ticked the
checkpoint yet, which is not something to fix. And nothing is behind the
calendar in its first week, when the calendar has barely started.

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

#: How far behind the calendar, as a share of the goal, before it is behind
#: when nothing has been done on it lately.
BEHIND_BY = 0.1

#: How far behind before it is behind even with recent work.
FAR_BEHIND_BY = 0.25

#: How old a goal has to be before the calendar can call it behind.
GRACE_DAYS = 7

#: How long linked work can go quiet before the goal is behind.
QUIET_DAYS = 14

#: The window "worked on N times recently" is counted over.
EVIDENCE_DAYS = 14

LABELS = {
    'on-track': 'On track',
    'behind': 'Behind',
    'not-started': 'Not started',
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


def subjects_of(goal):
    """A goal's subject ids, from its comma-separated column."""
    return {part.strip() for part in str(goal.get('subject_ids') or '').replace(' ', ',').split(',')
            if part.strip()}


def work_for(goal, tasks):
    """Every task that says the goal is being worked on: its links, plus, for
    an outcome goal, tasks filed under one of its subjects. See the note at the
    top for why the subject counts here and nowhere else."""
    linked = evidence_for(goal, tasks)
    if linked is tasks:
        return tasks, 0
    subjects = subjects_of(goal)
    if not subjects:
        return linked, 0
    # Only work since the goal began: a year of Python before "Learn Python"
    # was set is not work on it, and would read as a goal gone quiet.
    start = str(goal.get('start_date') or goal.get('created_at') or '')[:10]
    seen = {id(task) for task in linked}
    related = [task for task in tasks
               if id(task) not in seen and str(task.get('subject') or '') in subjects
               and str(task.get('completed_at') or '')[:10] >= start]
    return linked + related, len(related)


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
    linked, _related = work_for(goal, tasks)
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
    # A goal can't have gone quiet for longer than it has existed. The matcher
    # links older tasks too, and without this a goal made a minute ago read
    # "Nothing done toward this in 24 days" and was behind on arrival.
    age_days = (today - start).days if start is not None else None
    if days_since_work is not None and age_days is not None:
        days_since_work = max(0, min(days_since_work, age_days))
    since_start = [task for task in done
                   if start is None or (_day(task['completed_at']) or today) >= start]

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
    # Work from before the goal began doesn't start it either.
    if progress <= 0 and not since_start and stones_done == 0:
        return result('not-started', 'Nothing logged on this yet.')

    if days_left is not None and days_left < 0:
        return result('behind', 'Its date passed {} ago and it\'s {}% done.'.format(
            _plural(-days_left, 'day'), pct))

    # A streak isn't a pace. It grows one day at a time, so the calendar can't
    # say it's behind: it's behind only when there aren't enough days left to
    # build the rest of it. "14-day streak, 151 days left" is plenty of time.
    if measure_of(goal) == 'streak':
        current_field, target_field = COUNTERS['streak']
        needed = max(0, int(_number(goal.get(target_field)) - _number(goal.get(current_field))))
        if days_left is not None and needed > days_left:
            return result('behind', 'It needs {} in a row and there {} {} left.'.format(
                _plural(needed, 'more day'), 'is' if days_left == 1 else 'are',
                _plural(days_left, 'day')))
        return result('on-track', '{} in a row does it.'.format(_plural(needed, 'more day')))

    # An outcome goal with no subject only hears about work that names it. Say
    # so where it's called behind, since adding one is the fix.
    nudge = (' Add a subject so your work in it counts.'
             if measure_of(goal) in ('number', 'milestones') and not subjects_of(goal) else '')
    age = (today - start).days if start is not None else None
    settled = age is None or age >= GRACE_DAYS
    working = recent_tasks > 0
    if settled and ahead is not None and (ahead < -FAR_BEHIND_BY
                                          or (ahead < -BEHIND_BY and not working)):
        return result('behind', '{} points behind schedule, '
                                'with {} left.{}'.format(js_round(-ahead * 100),
                                                         _plural(days_left, 'day'),
                                                         '' if working else nudge))
    if ahead is not None and ahead < -BEHIND_BY:
        # Behind the calendar, but the work is happening: not something to fix.
        tail = ('Tick a checkpoint when you reach one.' if measure_of(goal) == 'milestones'
                else 'Update the number when it moves.')
        return result('on-track', 'Worked on it {} in the last two weeks. {}'.format(
            _plural(recent_tasks, 'time'), tail) if working else
            '{}% done. It\'s early, so give it a few days.'.format(pct), 'Working on it')

    if days_since_work is not None and days_since_work >= QUIET_DAYS:
        return result('behind', 'Nothing done toward this in {} days.{}'.format(
            days_since_work, nudge))

    if ahead is not None and ahead > 0.08:
        return result('on-track', '{}% done with {}% of the time left. You\'re ahead.'.format(
            pct, js_round((1 - (expected or 0)) * 100)))
    if recent_tasks > 0:
        return result('on-track', '{}% done, and worked on {} in the last two weeks.'.format(
            pct, _plural(recent_tasks, 'time')))
    return result('on-track', '{}% done and keeping pace.'.format(pct))

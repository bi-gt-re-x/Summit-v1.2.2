"""What the record says about how the work is going: the misses and the dates.

The rest of analytics reads totals: XP, task counts, self-rated stars. Those
describe how much happened and cannot say what to do next. The things that can
are a **date** (an exam, a goal's deadline) and a **miss** (a problem got wrong,
a session that went badly for a named reason). This module reads both off the
task rows and hands back plain figures, so that the plan
(backend/tracking/next_actions.py) and the goal planner's brief
(backend/tracking/planner.py) can say something only this student's record
supports.

Where the figures come from:

  score_got / score_of   "How many did you get right?", asked after a task
                         whose title names a count of problems (see
                         `problem_count`) or when the reader adds a score.
  reason                 the struggle or went-well reason from the rating
                         prompt, now asked whenever execution is rated 1-2.
  goal subject_ids       which subjects a dated goal is about.
  goal milestones        the checkpoint the reader is on, and its steps.

`problem_count` has a browser copy in frontend/src/utils/problemCount.ts; both
run shared/cases/problem_count.json.
"""
import re
from collections import Counter
from datetime import date, datetime, timedelta

from backend.config.shared import RULES

#: How far back "your last problems" reaches.
SCORE_DAYS = 30
#: Problems a subject needs inside SCORE_DAYS before its accuracy means much.
SCORE_FLOOR = 8
#: Under this share right, the misses are worth a row of their own.
SCORE_BAR = 0.8
#: The rough sessions read for a pattern in why they went badly.
STUCK_WINDOW = 8
#: The same reason this many times in that window is a pattern.
STUCK_FLOOR = 3
#: How far ahead a goal's date pulls the plan toward it.
DEADLINE_DAYS = 120
#: Days without work after which a goal's subject counts as cold.
COLD_DAYS = 7
#: The biggest set a title is believed to describe. "#1-500" is a page range.
MOST_PROBLEMS = 100

STRUGGLE = {row['key']: row for row in RULES['task_reasons']['struggle']}

_DASH = '[-–—]'
_NOUN = r'(?:problems?|questions?|exercises?|qs?|exs?\.?|drills?|cards?|flashcards?|items?)'
# "#1-10", "# 3 - 8", "#4–#9"
_HASH_RANGE = re.compile(r'#\s*(\d+)\s*' + _DASH + r'\s*#?\s*(\d+)')
# "problems 1-6", "Q3–12", "ex. 4-9"
_NOUN_RANGE = re.compile(r'\b' + _NOUN + r'\s*(\d+)\s*' + _DASH + r'\s*(\d+)', re.I)
# "10 problems", "5 DP problems", "20 vocab cards"
_COUNT = re.compile(r'\b(\d+)\s+(?:[A-Za-z][\w-]*\s+){0,2}?' + _NOUN + r'\b', re.I)


def problem_count(title):
    """How many problems a task's title says it holds, or None.

    Ranges first, because "Problems 3-8" also contains "8" next to nothing.
    Anything over MOST_PROBLEMS, or a range that runs backwards, is not a set.
    """
    text = str(title or '')
    for pattern in (_HASH_RANGE, _NOUN_RANGE):
        found = pattern.search(text)
        if found:
            first, last = int(found.group(1)), int(found.group(2))
            if 0 < first <= last and last - first + 1 <= MOST_PROBLEMS:
                return last - first + 1
            return None
    found = _COUNT.search(text)
    if found:
        count = int(found.group(1))
        return count if 0 < count <= MOST_PROBLEMS else None
    return None


def _int(value):
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        return None
    return number


def score_of(task):
    """(got, of) from a finished task's score, or None when it has none."""
    got, of = _int(task.get('score_got')), _int(task.get('score_of'))
    if got is None or of is None or of <= 0 or got < 0 or got > of:
        return None
    return got, of


def _day(value):
    try:
        return date.fromisoformat(str(value or '')[:10])
    except ValueError:
        return None


def _since(value, today):
    at = _day(value)
    return None if at is None else (today - at).days


def _within(value, today, days):
    """Finished today or in the `days - 1` before it. Today is 0 days ago,
    which is why this is not `(_since(...) or 99) < days`."""
    age = _since(value, today)
    return age is not None and 0 <= age < days


def subject_ids(goal):
    """The subjects a goal is about, in the order it lists them."""
    return [one.strip() for one in str(goal.get('subject_ids') or '').split(',') if one.strip()]


def _done(tasks):
    return [task for task in tasks if task.get('status') == 'done' and task.get('completed_at')]


# ---------------------------------------------------------------------------
# Misses
# ---------------------------------------------------------------------------
def misses(tasks, today, subject=None):
    """What the scored work says, per subject, over the last SCORE_DAYS.

    Returns {subject: {'got', 'of', 'share', 'sets': [(title, got, of), ...]}}
    with `sets` worst first. A subject under SCORE_FLOOR problems is left out:
    four problems is a bad afternoon, not a finding.
    """
    by_subject = {}
    for task in _done(tasks):
        if subject is not None and task.get('subject') != subject:
            continue
        age = _since(task.get('completed_at'), today)
        score = score_of(task)
        if score is None or age is None or age > SCORE_DAYS or not task.get('subject'):
            continue
        row = by_subject.setdefault(task['subject'], {'got': 0, 'of': 0, 'sets': []})
        row['got'] += score[0]
        row['of'] += score[1]
        row['sets'].append((task.get('title') or 'Untitled', score[0], score[1]))
    out = {}
    for key, row in by_subject.items():
        if row['of'] < SCORE_FLOOR:
            continue
        row['share'] = row['got'] / row['of']
        row['sets'].sort(key=lambda one: (one[1] / one[2], -(one[2] - one[1])))
        out[key] = row
    return out


# ---------------------------------------------------------------------------
# Why sessions go badly
# ---------------------------------------------------------------------------
def stuck(tasks, today, subject=None):
    """The struggle reason the recent rough sessions keep naming, or None.

    Reads the newest STUCK_WINDOW finished tasks rated 1-2 for execution with a
    struggle reason, within SCORE_DAYS. One reason STUCK_FLOOR times or more is
    a pattern, and the answer carries the fix for it from shared/rules.json.
    """
    rough = []
    for task in _done(tasks):
        if subject is not None and task.get('subject') != subject:
            continue
        execution = _int(task.get('execution')) or 0
        reason = task.get('reason')
        age = _since(task.get('completed_at'), today)
        if 0 < execution <= 2 and reason in STRUGGLE and age is not None and age <= SCORE_DAYS:
            rough.append(task)
    rough.sort(key=lambda task: str(task.get('completed_at')), reverse=True)
    rough = rough[:STUCK_WINDOW]
    if not rough:
        return None
    reason, count = Counter(task['reason'] for task in rough).most_common(1)[0]
    if count < STUCK_FLOOR:
        return None
    subjects = Counter(task.get('subject') for task in rough
                       if task.get('reason') == reason and task.get('subject'))
    return {'reason': reason, 'count': count, 'of': len(rough),
            'label': STRUGGLE[reason]['label'], 'fix': STRUGGLE[reason].get('fix', ''),
            'subject': subjects.most_common(1)[0][0] if subjects else None}


# ---------------------------------------------------------------------------
# Deadlines
# ---------------------------------------------------------------------------
def _stones(goal):
    rows = [row for row in (goal.get('milestones') or []) if row.get('status') != 'done']
    return sorted(rows, key=lambda row: (_int(row.get('position')) or 0, str(row.get('id') or '')))


def _links(task, goal_id):
    goal_id = str(goal_id)
    return str(task.get('goal_id') or '') == goal_id or \
        goal_id in [str(one) for one in (task.get('goal_ids') or [])]


def sessions_per_week(days_left, behind):
    """How many sittings a week a goal this close needs.

    Three at four months out, four inside six weeks, five in the last fortnight,
    and one more when the goal is already behind its own schedule. A rule a
    student can check, not a model: "why three?" has an answer.
    """
    want = 5 if days_left <= 14 else 4 if days_left <= 45 else 3
    return min(6, want + (1 if behind else 0))


def nearest_deadline(goals, tasks, now, sittings=()):
    """The live goal with the nearest date inside DEADLINE_DAYS, read, or None.

    The fields are everything the plan's first line and the planner's brief
    need: days left, the checkpoint and its next open step, how many days the
    goal's work happened on lately, how many sittings this week needs, and
    which of its subjects have gone cold.
    """
    today = now.date()
    dated = []
    for goal in goals:
        if goal.get('status') != 'active':
            continue
        ends = _day(goal.get('deadline'))
        if ends is None:
            continue
        left = (ends - today).days
        if 0 <= left <= DEADLINE_DAYS:
            dated.append((left, -(_int(goal.get('priority')) or 0), str(goal.get('title') or ''), goal))
    if not dated:
        return None
    dated.sort(key=lambda row: row[:3])
    left, _, _, goal = dated[0]
    return read_goal(goal, tasks, now, left, sittings)


def read_goal(goal, tasks, now, left=None, sittings=()):
    """One goal's standing, in the figures `nearest_deadline` describes.

    How many sessions a week it needs, and so how many to book, come from the
    goal forecast (backend/tracking/forecast.py) whenever that has a pace, so
    the plan's row and the forecast card above it ask for the same number.
    `sittings` are the account's focus timers, which the forecast counts as
    sessions. With too little to go on, `sessions_per_week`'s rule of thumb.
    """
    today = now.date()
    if left is None:
        ends = _day(goal.get('deadline'))
        left = (ends - today).days if ends else None
    subjects = subject_ids(goal)
    goal_id = goal.get('id')

    def counts(task):
        return _links(task, goal_id) or (task.get('subject') in subjects if subjects else False)

    done = [task for task in _done(tasks) if counts(task)]
    fortnight = {str(task['completed_at'])[:10] for task in done
                 if _within(task['completed_at'], today, 14)}
    monday = today - timedelta(days=today.weekday())
    week = {str(task['completed_at'])[:10] for task in done
            if (_day(task['completed_at']) or date.min) >= monday}
    # Sittings already booked for the rest of this week count too, or the row
    # would go on asking for three after the three were on the calendar.
    sunday = monday + timedelta(days=6)
    booked = {str(task['due_date'])[:10] for task in tasks
              if task.get('status') != 'done' and task.get('due_date') and counts(task)
              and today <= (_day(task['due_date']) or date.min) <= sunday}

    # The prompts an empty checklist row is padded with ("Name the first piece
    # of work") are not steps. Imported here, not at the top: backend/api/goals.py
    # imports this module.
    from backend.api.goals import PLACEHOLDERS
    stones = _stones(goal)
    stone = stones[0] if stones else None
    steps = [step for step in (stone or {}).get('steps') or []
             if isinstance(step, dict) and str(step.get('title') or '').strip()
             and str(step.get('title')).strip() not in PLACEHOLDERS]
    open_step = next((step for step in steps if not step.get('done')), None)

    started = _day(goal.get('start_date') or goal.get('created_at'))
    ends = _day(goal.get('deadline'))
    gap = 0.0
    if started and ends and ends > started:
        elapsed = min(1.0, max(0.0, (today - started).days / (ends - started).days))
        gap = elapsed * 100 - float(goal.get('progress') or 0)
    behind = gap > 8
    # Work already written down for it: a task linked to the goal or to its
    # checkpoint, still open. Doing that beats booking something new.
    linked = next((task for task in tasks if task.get('status') != 'done' and (
        _links(task, goal_id) or (stone and task.get('milestone_id') == stone.get('id')))), None)

    last_by_subject = {}
    for task in _done(tasks):
        subject = task.get('subject')
        if subject in subjects:
            age = _since(task['completed_at'], today)
            if age is not None and (subject not in last_by_subject or age < last_by_subject[subject]):
                last_by_subject[subject] = age
    cold = sorted(((subject, last_by_subject.get(subject)) for subject in subjects
                   if last_by_subject.get(subject) is None or last_by_subject[subject] >= COLD_DAYS),
                  key=lambda row: -(row[1] if row[1] is not None else 10 ** 6))

    target = sessions_per_week(left if left is not None else DEADLINE_DAYS, behind)
    # The days left in this week, today included, cap what can still be booked.
    days_in_week = 7 - today.weekday()
    to_book = max(0, min(target - len(week) - len(booked - week), days_in_week - len(booked)))

    # Imported here for the same reason as PLACEHOLDERS: forecast imports this.
    from backend.tracking import forecast
    pace = None
    if goal.get('measure') in forecast.MEASURES and ends and ends >= today:
        found = forecast.forecast(goal, tasks, sittings or (), today)
        if found['state'] in forecast.PACED:
            pace = found
            target, to_book = found['week_target'], found['to_book']
            behind = found['state'] != 'on_track'
    return {
        'goal': goal, 'days_left': left, 'subjects': subjects,
        'checkpoint': stone.get('title') if stone else None,
        'checkpoint_id': stone.get('id') if stone else None,
        'steps_done': sum(1 for step in steps if step.get('done')), 'steps': len(steps),
        'next_step': open_step.get('title') if open_step else None,
        'next_step_task': open_step.get('task_id') if open_step else None,
        'fortnight_days': len(fortnight), 'week_days': len(week), 'booked_days': len(booked),
        'per_week': target, 'to_book': to_book, 'behind': behind, 'gap': gap, 'cold': cold,
        'open_task': linked, 'pace': pace,
    }


# ---------------------------------------------------------------------------
# The record, as lines a model can read
# ---------------------------------------------------------------------------
def brief_lines(goal, tasks, now, name_of=lambda key: key):
    """What the account has actually done toward a goal, for the planner.

    The planner's brief used to be the goal's title, why and date and nothing
    else, so "Codeforces 2000" from 442 and from 1,900 got the same plan. These
    lines are the difference: recent work and its titles, the misses, the
    reason sessions go badly, and the pace the date asks for. Empty when the
    record has nothing to say, so a new goal's brief is unchanged.
    """
    today = now.date()
    read = read_goal(goal, tasks, now)
    lines = []
    if read['days_left'] is not None and read['days_left'] >= 0:
        lines.append('Days left: {}. That pace needs about {} sessions a week.'.format(
            read['days_left'], read['per_week']))
    current, target = goal.get('current_value'), goal.get('target_number')
    if _int(target):
        lines.append("Where they are now: {} of {}{}.".format(
            current or 0, target, ' {}'.format(goal['unit']) if goal.get('unit') else ''))
    lines.append('Worked on this on {} of the last 14 days.'.format(read['fortnight_days']))
    for subject, age in read['cold']:
        lines.append('{}: {}.'.format(name_of(subject), 'never worked on' if age is None
                                      else 'nothing in {} days'.format(age)))

    subjects = read['subjects']
    recent = sorted((task for task in _done(tasks)
                     if _links(task, goal.get('id')) or task.get('subject') in subjects),
                    key=lambda task: str(task.get('completed_at')), reverse=True)[:6]
    if recent:
        lines.append('Their most recent work on it: {}.'.format('; '.join(
            '"{}"{}'.format(task.get('title') or 'Untitled', ' ({}/{} right)'.format(*score_of(task))
                            if score_of(task) else '')
            for task in recent)))
    for subject in subjects:
        row = misses(tasks, today, subject).get(subject)
        if row:
            lines.append('{}: got {} of their last {} problems right ({}%). Weakest: {}.'.format(
                name_of(subject), row['got'], row['of'], round(row['share'] * 100),
                ', '.join('"{}" {}/{}'.format(*one) for one in row['sets'][:2])))
    snag = stuck([task for task in tasks if not subjects or task.get('subject') in subjects], today)
    if snag:
        lines.append('Why sessions go badly: "{}" on {} of the last {} rough ones.'.format(
            snag['label'], snag['count'], snag['of']))
    if read['checkpoint']:
        lines.append('Current checkpoint: {} ({} of {} steps done{}).'.format(
            read['checkpoint'], read['steps_done'], read['steps'],
            ', next: {}'.format(read['next_step']) if read['next_step'] else ''))
    return lines if (recent or read['days_left'] is not None) else []


# ---------------------------------------------------------------------------
# The list
# ---------------------------------------------------------------------------
def title_key(title):
    return re.sub(r'\s+', ' ', str(title or '').strip().lower())


def routine_titles(tasks, least=3):
    """Titles written three or more times: the routines, not one-off work."""
    counts = Counter(title_key(task.get('title')) for task in tasks if task.get('title'))
    return {title for title, count in counts.items() if count >= least and title}


def finished_per_day(tasks, today, days=28):
    """The median number finished on a day anything was finished, lately."""
    per_day = Counter(str(task['completed_at'])[:10] for task in _done(tasks)
                      if _within(task['completed_at'], today, days))
    counts = sorted(per_day.values())
    if len(counts) < 3:
        return None
    return counts[len(counts) // 2]


def leftovers(tasks, today):
    """Open routines whose date has passed: the pile a missed week leaves."""
    routines = routine_titles(tasks)
    stamp = today.isoformat()
    return [task for task in tasks
            if task.get('status') != 'done' and task.get('due_date')
            and str(task['due_date'])[:10] < stamp and title_key(task.get('title')) in routines]


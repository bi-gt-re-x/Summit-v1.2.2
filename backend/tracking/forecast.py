"""Will you hit each dated goal at your current pace, and what gets you there?

Everything else on the Analytics page looks back. This looks ahead, for every
active goal with a date: how much is left, how fast the work on it has been
going lately, and from those two the day it would finish. Then one plain line,
"Due Feb 5. At this pace you finish Feb 19. 2 more sessions a week gets you
there.", and a count of sessions to book this week. The card is
frontend/src/components/Analytics/GoalForecast.tsx; the endpoints are
backend/api/forecast.py.

## What's left

A checkpoint goal counts its steps: every titled step on every checkpoint, a
finished checkpoint counting all of its steps as done, and a checkpoint with
no steps written counting as one. A number goal counts the share of the way
it has come (its `progress`, 0-100). Other measures (XP, streaks, task and
focus counts) aren't about a subject, so they get no forecast.

## How fast

A session is a finished task on the goal (linked to it, or in one of its
subjects) or a focus timer of FOCUS_MINUTES or more on such a task, on a day
that task wasn't also finished. The pace is sessions a week over the last
WINDOW_DAYS, or over fewer when the first session was more recent than that.
How much a session moves the goal is everything done on it since the goal
started, divided by the sessions since then. So the finish date is:

    sessions still needed = what's left x sessions per unit done
    weeks to finish       = sessions still needed / sessions a week

## When it won't guess

No subject and nothing linked; no steps (or no target) to count; fewer than
HISTORY_DAYS since the first session on it; nothing done on it yet; or no
sessions since it was set. Each says what's missing instead of a date.
"""
import math
from datetime import date, timedelta

from backend.tracking import record

#: How far back the pace reads.
WINDOW_DAYS = 28
#: Less history than this and the pace is a guess, so there's no date.
HISTORY_DAYS = 14
#: A focus timer shorter than this isn't a session.
FOCUS_MINUTES = 10
#: Past this many a week, the date is out of reach.
MOST_PER_WEEK = 14
#: Finish dates further off than this are said as "over N years".
FAR_DAYS = 5 * 365
#: The measures that have something to count.
MEASURES = ('milestones', 'number')

_MONTHS = ('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')


def say_day(day, today):
    """'Feb 5', with the year only when it isn't this one."""
    text = '{} {}'.format(_MONTHS[day.month - 1], day.day)
    return text if day.year == today.year else '{}, {}'.format(text, day.year)


def _sessions(n):
    return '{} {}'.format(n, 'session' if n == 1 else 'sessions')


def _float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def units(goal):
    """(done, total, kind) of what the goal counts, or None with nothing to count.

    `kind` is 'steps' or 'percent'. See the module note.
    """
    from backend.api.goals import PLACEHOLDERS  # goals.py imports record, which this imports
    if goal.get('measure') == 'number':
        if not _float(goal.get('target_number')):
            return None
        progress = max(0.0, min(100.0, _float(goal.get('progress')) or 0.0))
        return progress, 100.0, 'percent'
    stones = goal.get('milestones') or []
    if not stones:
        return None
    done = total = 0
    for stone in stones:
        steps = [step for step in stone.get('steps') or []
                 if isinstance(step, dict) and str(step.get('title') or '').strip()
                 and str(step.get('title')).strip() not in PLACEHOLDERS]
        size = max(1, len(steps))
        total += size
        if stone.get('status') == 'done':
            done += size
        elif steps:
            done += sum(1 for step in steps if step.get('done'))
    return float(done), float(total), 'steps'


def session_days(goal, tasks, sittings):
    """The day of every session on this goal. See the module note."""
    goal_id, subjects = goal.get('id'), record.subject_ids(goal)

    def counts(task):
        return record._links(task, goal_id) or (task.get('subject') in subjects if subjects else False)

    linked = {str(task.get('id')): task for task in tasks if counts(task)}
    days, finished = [], set()
    for task in linked.values():
        if task.get('status') == 'done' and task.get('completed_at'):
            day = record._day(task['completed_at'])
            if day:
                days.append(day)
                finished.add((str(task.get('id')), day))
    for sitting in sittings:
        task_id = str(sitting.get('task_id') or '')
        day = record._day(sitting.get('day'))
        if task_id not in linked or not day or (_float(sitting.get('minutes')) or 0) < FOCUS_MINUTES:
            continue
        if (task_id, day) not in finished:
            days.append(day)
    return sorted(days), bool(linked)


def _this_week(goal, tasks, sessions, today):
    """(done this week, booked for the rest of it, booked days, days left in it)."""
    goal_id, subjects = goal.get('id'), record.subject_ids(goal)
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    done = sum(1 for day in sessions if monday <= day <= today)
    booked = [record._day(task['due_date']) for task in tasks
              if task.get('status') != 'done' and task.get('due_date')
              and (record._links(task, goal_id) or (task.get('subject') in subjects if subjects else False))
              and today <= (record._day(task['due_date']) or date.min) <= sunday]
    return done, len(booked), len(set(booked)), (sunday - today).days + 1


def forecast(goal, tasks, sittings, today, name_of=lambda key: key):
    """One goal's forecast: its state, the line to show, and the numbers behind it.

    States: 'on_track', 'behind', 'stalled' (no sessions lately), 'done', and
    'missing' (with `missing` naming what: no_subject, no_steps, too_new,
    nothing_done, no_sessions).
    """
    ends = record._day(goal.get('deadline'))
    days_left = (ends - today).days
    due = 'Due {}.'.format(say_day(ends, today))
    subjects = record.subject_ids(goal)
    subject_name = ', '.join(name_of(one) for one in subjects[:2]) if subjects else 'it'
    out = {'goal_id': str(goal.get('id')), 'title': goal.get('title') or 'Your goal',
           'deadline': ends.isoformat(), 'days_left': days_left, 'state': 'missing',
           'missing': None, 'line': due, 'facts': None, 'per_week': None, 'need_per_week': None,
           'more_per_week': None, 'finish': None, 'done': None, 'total': None, 'unit': None,
           'history_days': 0, 'to_book': 0, 'booked_this_week': 0,
           'week_target': None, 'pace_line': None, 'out_of_reach': False}

    def missing(key, text):
        out.update(missing=key, line='{} {}'.format(due, text))
        return out

    counted = units(goal)
    if counted is None:
        if goal.get('measure') == 'number':
            return missing('no_steps', "Give it a target number and we can tell when you'd finish.")
        return missing('no_steps', "Add some steps to it and we can tell when you'd finish.")
    done, total, unit = counted
    out.update(done=round(done, 1), total=round(total, 1), unit=unit)
    left = max(0.0, total - done)
    if unit == 'steps':
        out['facts'] = '{:g} of {:g} steps done.'.format(done, total)
    else:
        out['facts'] = "You're {}% of the way.".format(int(round(done)))

    if left <= 0:
        out['state'] = 'done'
        out['line'] = '{} {} Mark it done on Goals.'.format(
            due, "Every step's ticked off." if unit == 'steps' else "You've hit your number.")
        return out

    sessions, linked = session_days(goal, tasks, sittings)
    if not subjects and not linked:
        return missing('no_subject', 'Link a subject to it and we can track your pace.')
    if not sessions:
        return missing('too_new', 'No sessions on {} yet. Give it two weeks and we can tell your pace.'.format(
            subject_name))
    history = (today - sessions[0]).days + 1
    out['history_days'] = history
    if history < HISTORY_DAYS:
        return missing('too_new', 'We need two weeks of sessions on {} to tell your pace. You have {} {} so far.'.format(
            subject_name, history, 'day' if history == 1 else 'days'))
    if done <= 0:
        return missing('nothing_done', "Nothing's ticked off yet. Tick a step when it's done and we can tell your pace."
                       if unit == 'steps' else "It's at 0% so far. Update your number and we can tell your pace.")
    started = record._day(goal.get('start_date') or goal.get('created_at'))
    since_start = [day for day in sessions if started is None or day >= started]
    if not since_start:
        return missing('no_sessions', 'No sessions on {} since you set it.'.format(subject_name))

    window = min(WINDOW_DAYS, history)
    recent = sum(1 for day in sessions if 0 <= (today - day).days < window)
    per_week = recent * 7.0 / window
    per_unit = len(since_start) / done
    needed = left * per_unit
    need_per_week = needed * 7.0 / max(1, days_left)
    out.update(per_week=round(per_week, 1), need_per_week=round(need_per_week, 1))
    out['facts'] += ' About {:g} {} a week lately.'.format(
        round(per_week, 1), 'session' if round(per_week, 1) == 1 else 'sessions')

    target = min(7, math.ceil(need_per_week - 1e-9))
    week_done, booked, booked_days, days_in_week = _this_week(goal, tasks, sessions, today)
    out.update(booked_this_week=booked, week_target=target)

    if per_week <= 0:
        out['state'] = 'stalled'
        pace = "You haven't done a session on it in {} weeks.".format(window // 7)
        fix = '{} a week gets you there.'.format(_sessions(math.ceil(need_per_week - 1e-9)).capitalize())
    else:
        finish_in = math.ceil(needed / per_week * 7)
        finish = today + timedelta(days=finish_in)
        out['finish'] = finish.isoformat()
        pace = 'At this pace {}.'.format('it takes over {} years'.format(finish_in // 365)
                                         if finish_in > FAR_DAYS else 'you finish {}'.format(say_day(finish, today)))
        if finish <= ends:
            out['state'] = 'on_track'
            fix = "You're on track."
        else:
            more = max(1, math.ceil(need_per_week - per_week - 1e-9))
            out.update(state='behind', more_per_week=more)
            fix = '{} more {} a week gets you there.'.format(more, 'session' if more == 1 else 'sessions')
    if need_per_week > MOST_PER_WEEK:
        fix = "Even two a day won't get you there. Think about moving the date."
        out['out_of_reach'] = True
    out['pace_line'] = '{} {}'.format(pace, fix)
    out['line'] = '{} {}'.format(due, out['pace_line'])
    if not out['out_of_reach']:
        # On track too: what this week owes the pace that gets it there.
        out['to_book'] = max(0, min(target - week_done - booked, days_in_week - booked_days))
    return out


#: The states with a pace, which the plan's deadline row reads instead of
#: its rule of thumb (backend/tracking/record.py `read_goal`).
PACED = ('on_track', 'behind', 'stalled')


def forecasts(goals, tasks, sittings, today, name_of=lambda key: key):
    """A forecast for every active, dated goal it can count, nearest date first."""
    rows = []
    for goal in goals:
        if goal.get('status') != 'active' or goal.get('measure') not in MEASURES:
            continue
        ends = record._day(goal.get('deadline'))
        if ends is None or ends < today:
            continue
        rows.append((ends, str(goal.get('title') or ''), goal))
    rows.sort(key=lambda row: row[:2])
    return [forecast(goal, tasks, sittings, today, name_of) for _, _, goal in rows]

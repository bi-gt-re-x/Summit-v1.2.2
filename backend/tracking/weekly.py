"""The weekly review: five minutes, once a week, in place of browsing analytics.

## Why

Seven tabs of figures is a lot to read and little to act on. A review that comes
round once a week and asks three questions is something a person actually does:

    What moved?        Goals that got their sessions, checkpoints done, new bests.
    What stalled?      The goal that came up short, a subject that dropped, the pile
                       of overdue work.
    What's the bet?    One change to test next week (backend/tracking/experiments.py),
                       and last week's bet graded at the top.

## Which week

Monday to Sunday. On a Sunday it's this week, since that's when the week is done
enough to look back on. Any other day it's last week, until that one's reviewed.

Pure: rows and dates in, the review out. backend/api/experiments.py serves it and
stores the reviews and the bets.
"""
import math
from collections import Counter
from datetime import date, timedelta
from statistics import mean
from typing import Any, Dict, List, Optional, Sequence

from backend.tracking import evidence, experiments, forecast, measures, priority, record
from backend.tracking.measures import kind_of

#: The most lines under "what moved" and "what stalled".
MOST_LINES = 4
#: Sessions in the week before a subject's drop is worth naming.
DROP_FLOOR = 5
#: Past-due tasks before they're worth a line.
OVERDUE_FLOOR = 3
#: How many past tests the page lists.
HISTORY = 8


def week_of(today: date) -> Dict[str, date]:
    """The week under review: this one on a Sunday, otherwise the last full one."""
    monday = today - timedelta(days=today.weekday())
    start = monday if today.weekday() == 6 else monday - timedelta(days=7)
    return {'start': start, 'end': start + timedelta(days=6)}


def _label(start: date, end: date) -> str:
    left = '{} {}'.format(start.strftime('%b'), start.day)
    right = str(end.day) if end.month == start.month else '{} {}'.format(end.strftime('%b'), end.day)
    return '{} to {}'.format(left, right)


def _plural(count: int, word: str) -> str:
    return '{:,} {}'.format(count, word if count == 1 else word + 's')


def _between(tasks, start: date, end: date) -> List[Dict[str, Any]]:
    out = []
    for task in tasks:
        day = record._day(task.get('completed_at'))
        if task.get('status') == 'done' and day and start <= day <= end:
            out.append(task)
    return out


def _line(tone: str, title: str, detail: str = '', icon: str = '') -> Dict[str, Any]:
    return {'tone': tone, 'title': title, 'detail': detail, 'icon': icon}


def _goal_weeks(goals, tasks, sittings, decision, start: date, end: date, today: date, name_of):
    """Each dated objective goal's sessions this week against what its pace needs."""
    plan = {row['goal_id']: row for row in decision.get('goals') or []}
    out = []
    for goal in goals:
        if not priority.is_objective(goal):
            continue
        ends = record._day(goal.get('deadline'))
        if ends is None or ends < start:
            continue
        read = forecast.forecast(goal, tasks, sittings, today, name_of)
        days, _ = forecast.session_days(goal, tasks, sittings)
        got = sum(1 for day in days if start <= day <= end)
        need = read.get('need_per_week')
        out.append({'id': str(goal.get('id')), 'title': str(goal.get('title') or 'Your goal'), 'got': got,
                    'need': math.ceil(need - 1e-9) if need else None, 'state': read['state'],
                    'order': list(plan).index(str(goal.get('id'))) if str(goal.get('id')) in plan else 99})
    out.sort(key=lambda row: row['order'])
    return out


def read(tasks: Sequence[Dict[str, Any]], goals: Sequence[Dict[str, Any]], sittings: Sequence[Dict[str, Any]],
         records: Sequence[Dict[str, Any]], decision: Dict[str, Any], tests: Sequence[Dict[str, Any]],
         reviews: Sequence[Dict[str, Any]], today: date, name_of=lambda key: key) -> Dict[str, Any]:
    week = week_of(today)
    start, end = week['start'], week['end']
    before = (start - timedelta(days=7), start - timedelta(days=1))
    study = [task for task in tasks if kind_of(task) == 'study']
    now, then = _between(study, start, end), _between(study, *before)

    # ---- the tiles ---------------------------------------------------------
    days = sorted({record._day(task['completed_at']) for task in now})
    produced_now = sum(1 for task in now if measures._produced(task))
    produced_then = sum(1 for task in then if measures._produced(task))
    moves = measures._moves(goals, records, tasks, start, end, today)
    moved_goals = {move['goal'] for move in moves}
    tiles = [
        {'key': 'sessions', 'label': 'Study sessions', 'value': len(now), 'before': len(then)},
        {'key': 'days', 'label': 'Days worked', 'value': len(days), 'of': 7,
         'days': [(start + timedelta(days=at)) in days for at in range(7)]},
        {'key': 'output', 'label': 'Hard work done well', 'value': produced_now, 'before': produced_then},
        {'key': 'goals', 'label': 'Goals moved', 'value': len(moved_goals)},
    ]

    # ---- what moved and what stalled ------------------------------------------
    moved: List[Dict[str, Any]] = []
    stalled: List[Dict[str, Any]] = []
    for move in moves[:MOST_LINES]:
        moved.append(_line('good', move['title'], move['what'][0].upper() + move['what'][1:], 'flag'))

    focus_id = (decision.get('focus') or {}).get('goal_id')
    for row in _goal_weeks(goals, tasks, sittings, decision, start, end, today, name_of):
        if row['state'] == 'done' or not row['need']:
            continue
        top = row['id'] == focus_id
        if row['got'] >= row['need']:
            moved.append(_line('good', row['title'], '{}, and it needs {} a week.'.format(
                _plural(row['got'], 'session'), row['need']), 'pace'))
        elif top or (row['got'] == 0 and row['state'] in ('behind', 'stalled')):
            stalled.append(_line('bad', row['title'], '{}, but it needs {} a week.{}'.format(
                _plural(row['got'], 'session'), row['need'], ' Your top goal.' if top else ''), 'pace'))

    by_now = Counter(task.get('subject') for task in now if task.get('subject'))
    by_then = Counter(task.get('subject') for task in then if task.get('subject'))
    drops = [(subject, count, by_now.get(subject, 0)) for subject, count in by_then.items()
             if count >= DROP_FLOOR and by_now.get(subject, 0) <= count / 2]
    if drops:
        subject, was, is_ = max(drops, key=lambda row: row[1] - row[2])
        stalled.append(_line('bad', name_of(subject), 'Down from {} sessions to {}.'.format(was, is_), 'drop'))
    rises = [(subject, count, by_then.get(subject, 0)) for subject, count in by_now.items()
             if count >= DROP_FLOOR and count >= 2 * max(1, by_then.get(subject, 0))]
    if rises:
        subject, is_, was = max(rises, key=lambda row: row[1] - row[2])
        moved.append(_line('good', name_of(subject), 'Up from {} sessions to {}.'.format(was, is_), 'rise'))

    if produced_now > produced_then:
        moved.append(_line('good', 'Hard work done well', '{} this week, up from {}.'.format(produced_now, produced_then), 'output'))
    elif produced_then and produced_now < produced_then:
        stalled.append(_line('bad', 'Hard work done well', '{} this week, down from {}.'.format(produced_now, produced_then), 'output'))

    rated_now = [r for r in (experiments._rating(task) for task in now) if r is not None]
    rated_then = [r for r in (experiments._rating(task) for task in then) if r is not None]
    trend = evidence.means(rated_then, rated_now)
    if evidence.speaks(trend) and trend['clear']:
        line = 'Rated {:.1f} on average, from {:.1f}.'.format(mean(rated_now), mean(rated_then))
        (moved if mean(rated_now) > mean(rated_then) else stalled).append(
            _line('good' if mean(rated_now) > mean(rated_then) else 'bad', 'How sessions went', line, 'rating'))

    overdue = sum(1 for task in tasks if task.get('status') != 'done' and record._day(task.get('due_date'))
                  and record._day(task.get('due_date')) < today)
    if overdue >= OVERDUE_FLOOR:
        stalled.append(_line('bad', 'Past their date', '{} waiting.'.format(_plural(overdue, 'task')), 'late'))

    # ---- the headline -------------------------------------------------------------
    top_short = any(line['detail'].endswith('Your top goal.') for line in stalled)
    if not now:
        headline = 'A quiet week'
    elif not moved_goals and len(now) >= max(5, len(then)):
        headline = 'A busy week, but no goal moved'
    elif top_short:
        headline = 'Your top goal came up short'
    elif moved and not stalled:
        headline = 'A good week'
    else:
        headline = 'A mixed week'

    # ---- the bets -------------------------------------------------------------------
    described = [experiments.describe(row, tasks, goals, today, name_of) for row in tests]
    running = [one for one in described if one['phase'] == 'running']
    ready = [one for one in described if one['phase'] == 'ready']
    past = [one for one in described if one['phase'] in ('decided', 'stopped')]
    past.sort(key=lambda one: one.get('decided_at') or one['ends_on'], reverse=True)
    live_rows = [row for row in tests if (row.get('status') or 'running') == 'running']
    proposals = experiments.propose(tasks, goals, decision, today, live_rows)

    done = {str(row.get('week_start'))[:10]: row for row in reviews}
    mine = done.get(start.isoformat())
    streak = 0
    cursor = start if mine else start - timedelta(days=7)
    while cursor.isoformat() in done:
        streak += 1
        cursor -= timedelta(days=7)

    return {
        'week': {'start': start.isoformat(), 'end': end.isoformat(), 'label': _label(start, end),
                 'this_week': today.weekday() == 6},
        'reviewed': bool(mine),
        'note': (mine or {}).get('note') or '',
        'streak': streak,
        'headline': headline,
        'tiles': tiles,
        'moved': moved[:MOST_LINES],
        'stalled': stalled[:MOST_LINES],
        'ready': ready,
        'running': running,
        'proposals': proposals,
        'can_start': len(running) < experiments.MOST_RUNNING,
        'past': past[:HISTORY],
        'reasons': [{'key': key, 'label': label} for key, label in experiments.next_sessions.STRUGGLES.items()
                    if key in experiments.FOR_REASON],
    }

"""Capacity: how much work fits today. Kept apart from what matters and what's urgent.

## Three questions, not one

A plan that mixes these up asks for too much:

    Ambition    How much does this goal matter to you?   The goal's own 1-10, set by you.
                                                         It doesn't change day to day.
    Priority    How much does it matter right now?       backend/tracking/priority.py:
                                                         dates, pace, and commitments like
                                                         an audition or an exam.
    Capacity    How much can you really get done?        This module.

MathCounts Nationals can be the goal that matters most and still not be today's first
thing, because there's a violin audition on Thursday, and neither of those changes the
fact that a Tuesday with school and practice has about an hour and a half in it.

## How capacity is read

From what you actually do, not what you hope to: the minutes you worked on the last
`weeks` of this weekday, the median of the days you worked (a weekday you usually skip
isn't counted as a zero hour day; it's said separately). With fewer than `min_days` of
those, every day you worked lately stands in. Time comes from backend/tracking/time_spent.py
and focus timers, whichever says more for a day, never both added.

Then today's calendar: the time between now (or `day_start`) and `day_end` that no event
holds. What fits today is the smaller of the two, less what you've already done.

What's due today, and booked on the calendar for today, is set against that, so the page
can say when today asks for more than it has, and what to move.

Pure: rows, the calendar document and a time in, numbers and words out.
"""
import re
from datetime import date, datetime, timedelta
from statistics import median
from typing import Any, Dict, List, Optional, Sequence, Tuple

from backend.config.shared import RULES
from backend.tracking import evidence, goal_why, record, time_spent
from backend.tracking.measures import kind_of

RULE = RULES['capacity']
WEEKS = RULE['weeks']
MIN_DAYS = RULE['min_days']
DAY_START = RULE['day_start']
DAY_END = RULE['day_end']
COMMIT_DAYS = RULE['commit_days']
LEAD_DAYS = RULE['lead_days']
DUE_DAYS = RULE['due_days']
LEAD_SHARE = RULE['lead_share']
#: When nothing says how long an open task takes.
GUESS_MINUTES = 30
#: A sitting longer than this is a timer left running.
LONGEST_SITTING = 6 * 60

_PREP = re.compile(r'\b(?:{})\b'.format('|'.join(re.escape(word) for word in RULE['prep_words'])), re.I)
_PREP_ACRONYM = re.compile(r'\b(?:{})\b'.format('|'.join(re.escape(word) for word in RULE['prep_acronyms'])))
_WORK = re.compile(r'\b(?:{})\b'.format('|'.join(re.escape(word) for word in RULE['work_words'])), re.I)
_DEADLINE = re.compile(r'\b(?:{})\b'.format('|'.join(re.escape(word) for word in RULE['deadline_words'])), re.I)

WEEKDAYS = ('Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays')


def _day(raw: Any) -> Optional[date]:
    return record._day(raw)


def _when(raw: Any) -> Optional[datetime]:
    return time_spent._when(raw)


def clock(minutes: float) -> str:
    """"1h 40m", "45m"."""
    minutes = int(round(minutes))
    if minutes < 60:
        return '{}m'.format(max(0, minutes))
    hours, rest = divmod(minutes, 60)
    return '{}h {}m'.format(hours, rest) if rest else '{}h'.format(hours)


def needs_prep(name: str) -> bool:
    """Whether a calendar event is something to prepare for: an exam, an audition."""
    text = str(name or '')
    return bool(_PREP.search(text) or _PREP_ACRONYM.search(text))


# ---------------------------------------------------------------------------
# What you usually do
# ---------------------------------------------------------------------------
def worked_by_day(tasks: Sequence[Dict[str, Any]], sittings: Sequence[Dict[str, Any]],
                  since: date, today: date) -> Dict[date, float]:
    """Minutes of study work on each day: finished tasks' time, or focus timers when
    those say more. Never both added, since a timer is usually on one of the tasks."""
    from_tasks: Dict[date, float] = {}
    for task in tasks:
        if task.get('status') != 'done' or kind_of(task) != 'study':
            continue
        day = _day(task.get('completed_at'))
        if day is None or not since <= day <= today:
            continue
        seconds = time_spent.seconds_spent(task)
        if seconds:
            from_tasks[day] = from_tasks.get(day, 0.0) + seconds / 60
    from_timers: Dict[date, float] = {}
    for sitting in sittings:
        day = _day(sitting.get('day'))
        try:
            minutes = float(sitting.get('minutes') or 0)
        except (TypeError, ValueError):
            continue
        if day is None or not since <= day <= today or not 0 < minutes <= LONGEST_SITTING:
            continue
        from_timers[day] = from_timers.get(day, 0.0) + minutes
    days = set(from_tasks) | set(from_timers)
    return {day: max(from_tasks.get(day, 0.0), from_timers.get(day, 0.0)) for day in days}


def usual(by_day: Dict[date, float], today: date) -> Dict[str, Any]:
    """What you usually manage on this weekday, from the days you worked."""
    same = [today - timedelta(days=7 * weeks) for weeks in range(1, WEEKS + 1)]
    worked = [by_day[day] for day in same if by_day.get(day, 0) > 0]
    if len(worked) >= MIN_DAYS:
        return {'minutes': round(median(worked)), 'days': len(worked), 'of': WEEKS,
                'label': WEEKDAYS[today.weekday()], 'weekday': True,
                'evidence': evidence.counted(len(worked))['label']}
    recent = [minutes for day, minutes in by_day.items() if today - timedelta(days=28) <= day < today and minutes > 0]
    if len(recent) >= MIN_DAYS:
        return {'minutes': round(median(recent)), 'days': len(recent), 'of': 28,
                'label': 'days you work', 'weekday': False,
                'evidence': evidence.counted(len(recent))['label']}
    return {'minutes': None, 'days': len(recent), 'of': 28, 'label': None, 'weekday': False, 'evidence': None}


# ---------------------------------------------------------------------------
# Today's calendar
# ---------------------------------------------------------------------------
def _merge(spans: List[Tuple[datetime, datetime]]) -> List[Tuple[datetime, datetime]]:
    out: List[Tuple[datetime, datetime]] = []
    for start, end in sorted(spans):
        if out and start <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], end))
        else:
            out.append((start, end))
    return out


def free_minutes(busy: Sequence[Tuple[datetime, datetime]], now: datetime) -> Dict[str, float]:
    """Today's events, and the minutes no event holds between now and the end of the day."""
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    opens, closes = day + timedelta(hours=DAY_START), day + timedelta(hours=DAY_END)
    spans = _merge([(max(start, opens), min(end, closes)) for start, end in busy
                    if end > opens and start < closes])
    held = sum((end - start).total_seconds() for start, end in spans) / 60
    begin = max(now, opens)
    if begin >= closes:
        return {'busy': held, 'free': 0.0}
    left = (closes - begin).total_seconds() / 60
    taken = sum((min(end, closes) - max(start, begin)).total_seconds() for start, end in spans
                if end > begin) / 60
    return {'busy': held, 'free': max(0.0, left - max(0.0, taken))}


def _guess(task: Dict[str, Any], typical: Optional[float]) -> int:
    block = time_spent.block_seconds(task)
    if block:
        return int(round(block / 60))
    return int(round(typical)) if typical else GUESS_MINUTES


def due_today(tasks: Sequence[Dict[str, Any]], today: date, typical: Optional[float]) -> List[Dict[str, Any]]:
    """Open study work due today or booked on the calendar for today, with how long each
    should take: its calendar block, else your typical task."""
    out = []
    for task in tasks:
        if task.get('status') == 'done' or kind_of(task) != 'study':
            continue
        due = _day(task.get('due_date'))
        placed = time_spent.block_seconds(task) is not None and _day(task.get('created_at')) == today
        if due != today and not placed:
            continue
        out.append({'task_id': str(task.get('id')), 'title': str(task.get('title') or 'A task'),
                    'minutes': _guess(task, typical), 'goal_id': str(task.get('goal_id') or ''),
                    'subject': task.get('subject') or ''})
    return out


def _typical_task(tasks: Sequence[Dict[str, Any]], today: date) -> Optional[float]:
    spent = [time_spent.seconds_spent(task) for task in tasks
             if task.get('status') == 'done' and kind_of(task) == 'study'
             and (_day(task.get('completed_at')) or date.min) >= today - timedelta(days=56)]
    spent = sorted(seconds / 60 for seconds in spent if seconds)
    return median(spent) if len(spent) >= 5 else None


def read(tasks: Sequence[Dict[str, Any]], sittings: Sequence[Dict[str, Any]],
         busy: Sequence[Tuple[datetime, datetime]], now: datetime) -> Dict[str, Any]:
    """How much fits today, and what's already asking for it. `with_moves` adds what to
    move once the plan knows which goals get today's time."""
    today = now.date()
    by_day = worked_by_day(tasks, sittings, today - timedelta(days=7 * WEEKS), today)
    found = usual(by_day, today)
    done = round(by_day.get(today, 0.0))
    room = free_minutes(busy, now)
    typical = _typical_task(tasks, today)
    asked = due_today(tasks, today, typical)
    booked = sum(one['minutes'] for one in asked)

    if found['minutes'] is not None:
        total = found['minutes']
        left = max(0, min(total - done, room['free']))
    else:
        total = None
        left = round(room['free'] * 0.5) if room['free'] else 0
    left = int(round(left))
    over = max(0, booked - left) if asked else 0

    out = {
        'usual': found['minutes'], 'usual_days': found['days'], 'usual_of': found['of'],
        'usual_label': found['label'], 'weekday': found['weekday'], 'evidence': found['evidence'],
        'done': done, 'busy': round(room['busy']), 'free': round(room['free']),
        'left': left, 'total': total, 'booked': booked, 'over': over,
        'asked': asked, 'move': [], 'hour': now.hour, 'auto': False,
    }
    out['line'] = _line(out)
    return out


def with_moves(read: Dict[str, Any], keep: Sequence[str] = ()) -> Dict[str, Any]:
    """What to move when today asks for more than fits: work no goal getting today's time
    needs, biggest first, until the rest fits. `keep` is those goals' ids."""
    move = []
    spare = read['over']
    if spare > 0:
        for one in sorted(read['asked'], key=lambda row: (row['goal_id'] in keep, -row['minutes'])):
            if spare <= 0 or (one['goal_id'] and one['goal_id'] in keep):
                break
            move.append(one)
            spare -= one['minutes']
    return dict(read, move=move[:4], asked=read['asked'][:8])


def budget_for(read: Dict[str, Any], fallback: int, smallest: int = 15, largest: int = 240) -> int:
    """Today's plan length when the reader hasn't picked one: what fits, in fives."""
    if read['usual'] is None and not read['free']:
        return fallback
    minutes = int(5 * round(read['left'] / 5))
    return max(smallest, min(largest, minutes))


def _line(read: Dict[str, Any]) -> str:
    """The capacity in words, figures first."""
    parts = []
    if read['usual'] is not None:
        parts.append('On {} you usually work about {} ({} of the last {}).'.format(
            read['usual_label'], clock(read['usual']), read['usual_days'],
            read['usual_of'] if read['weekday'] else '{} days'.format(read['usual_of'])))
    else:
        parts.append("There isn't enough timed work yet to say what a usual day holds, so this goes by your free time.")
    if read['busy']:
        parts.append('Your calendar holds {} today, and {} is free before {}.'.format(
            clock(read['busy']), clock(read['free']), _hour(DAY_END)))
    elif read['free']:
        parts.append('{} is free before {}.'.format(clock(read['free']), _hour(DAY_END)))
    if read['done']:
        parts.append("You've done {} already.".format(clock(read['done'])))
    return ' '.join(parts)


def _hour(hour: int) -> str:
    return '{} {}'.format(hour % 12 or 12, 'AM' if hour < 12 else 'PM')


# ---------------------------------------------------------------------------
# Commitments: dates that aren't goals
# ---------------------------------------------------------------------------
def is_work_block(name: str, work_terms: Sequence[frozenset] = ()) -> bool:
    """Whether a calendar event is time set aside for the work itself ("Violin practice",
    "USACO practice") rather than something that takes time from it (school, swimming).
    Work blocks are where today's capacity gets spent, so they don't count as busy.
    `work_terms` is each goal's title words: an event that names a goal is its work."""
    text = str(name or '')
    if _WORK.search(text):
        return True
    words = goal_why._terms(text)
    return any(words & terms for terms in work_terms)


def work_free(calendar: Dict[str, Any], work_terms: Sequence[frozenset] = ()) -> Dict[str, Any]:
    """The calendar without its work blocks: what's left is what takes time away."""
    out = {}
    for key, entry in (calendar or {}).items():
        blocks = [block for block in (entry or {}).get('timestamps') or []
                  if not (isinstance(block, dict) and is_work_block(block.get('task') or '', work_terms))]
        if blocks:
            out[key] = dict(entry, timestamps=blocks)
    return out


def commitments(calendar: Dict[str, Any], tasks: Sequence[Dict[str, Any]], now: datetime) -> List[Dict[str, Any]]:
    """Dated things coming up that need preparing for: an audition or an exam on the
    calendar within COMMIT_DAYS, and study tasks due within DUE_DAYS. Nearest first.
    A repeating block is routine and never counts."""
    today = now.date()
    out = []
    for key, entry in (calendar or {}).items():
        try:
            year, month, day_of = (int(part) for part in str(key).split('-'))
            day = date(year, month, day_of)
        except (TypeError, ValueError):
            continue
        days = (day - today).days
        if not 0 <= days <= COMMIT_DAYS:
            continue
        for block in (entry or {}).get('timestamps') or []:
            if not isinstance(block, dict) or block.get('isDashboardTask'):
                continue
            # A block that repeats is routine ("Math: contest block" every
            # weekday), not a date to get ready for.
            if block.get('recurrence') in ('weekly', 'monthly'):
                continue
            name = str(block.get('task') or '').strip()
            if name and needs_prep(name):
                out.append({'key': 'event:{}:{}'.format(key, name.lower()), 'title': name, 'kind': 'event',
                            'day': day.isoformat(), 'days_left': days, 'time': str(block.get('startTime') or '')})
    for task in tasks:
        if task.get('status') == 'done' or kind_of(task) != 'study' or task.get('goal_id'):
            continue
        due = _day(task.get('due_date'))
        if due is None or not 0 <= (due - today).days <= DUE_DAYS:
            continue
        # A session booked onto the calendar isn't a deadline, it's the plan's own block.
        if time_spent.block_seconds(task) is not None:
            continue
        title = str(task.get('title') or '')
        if not (task.get('priority') == 'high' or needs_prep(title) or _DEADLINE.search(title)):
            continue
        out.append({'key': 'task:{}'.format(task.get('id')), 'title': str(task.get('title') or 'A task'),
                    'kind': 'task', 'day': due.isoformat(), 'days_left': (due - today).days,
                    'task_id': str(task.get('id')), 'subject': task.get('subject') or ''})
    seen, unique = set(), []
    for one in sorted(out, key=lambda row: (row['days_left'], row['kind'] != 'event', row['title'].lower())):
        if one['key'] not in seen:
            seen.add(one['key'])
            unique.append(one)
    return unique[:8]


def when_words(days_left: int) -> str:
    if days_left <= 0:
        return 'today'
    if days_left == 1:
        return 'tomorrow'
    return 'in {} days'.format(days_left)

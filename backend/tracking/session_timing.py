"""When a recommended session should happen, read off the reader's own record.

`session_plan.next_slot` answers "when is the calendar free", and booking three
sessions with it put all three back to back in the next free hour. This answers
"when would this session go best", for one session at a time, given the ones
already booked.

## What the record says

`rhythm` reads the last `lookback_days` of finished tasks and focus days:

  - **Hours.** Each finished task is placed at the hour it was worked (a
    calendar block's start, else its finish minus how long it took, else its
    finish). Per hour: how many, and how they went (execution 1-5), both for
    all work and for hard work (difficulty 4-5). Execution is pulled towards
    the reader's own average until an hour has a few ratings, so one great
    Tuesday at 6 AM doesn't make 6 AM the best hour.
  - **Waking window.** From the 5th to the 95th percentile of those hours,
    held inside `earliest_hour`-`latest_hour`. Nothing is booked at 8 AM for
    someone who has never worked before noon.
  - **Weekdays.** The share of each weekday they worked at all, and their
    typical day's focus time, which is how full a day can get before it's
    too full.

## How a slot is scored

Every free quarter hour in the window over `search_days`, with a
`buffer_minutes` gap either side of whatever is already there:

  + how well work at those hours goes, weighted by the session's difficulty
    (a hard session wants the best hours; an easy one can take any);
  + how often they work at that hour (a habit is easier to keep than a plan);
  + how much they usually work on that weekday;
  - how far past their usual day the day's booked time would run;
  - how far off it is (sooner is better, all else equal);
  - for each session already booked for the same subject, how far short of
    `gap_days` (by difficulty) the gap is. Spaced practice sticks better than
    massed practice, and a hard session needs a day to settle.

Never two sessions for one subject on a day, and never more than
`most_per_day` booked sessions on a day. When those leave nothing, the caller
falls back to the first free slot.

The rules are shared/rules.json `session_timing`.
"""
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from statistics import median
from typing import Dict, List, Optional, Tuple

from backend.config.shared import RULES
from backend.tracking import session_plan
from backend.tracking import time_spent

TIMING = RULES['session_timing']
LOOKBACK_DAYS = TIMING['lookback_days']
GAP_DAYS = {int(level): days for level, days in TIMING['gap_days'].items()}
MOST_PER_DAY = TIMING['most_per_day']
BUFFER = timedelta(minutes=TIMING['buffer_minutes'])
SEARCH_DAYS = TIMING['search_days']
EARLIEST_HOUR = TIMING['earliest_hour']
LATEST_HOUR = TIMING['latest_hour']

#: The window when the record is too thin to say (session_plan's own hours).
DEFAULT_WINDOW = (8, 22)

#: Fewer finished tasks than this and the hours aren't read at all.
ENOUGH_TASKS = 20

#: Ratings an hour needs before its own average counts for as much as the
#: reader's overall one.
PRIOR_WEIGHT = 5

#: How much how-it-goes counts, by difficulty. Easy work can go anywhere.
QUALITY_WEIGHT = {1: 0.5, 2: 0.75, 3: 1.0, 4: 1.5, 5: 2.0}

#: Score lost per day ahead, so a slightly better hour next week doesn't beat
#: a good one tomorrow.
SOONER = 0.15

STEP = timedelta(minutes=15)

WEEKDAYS = ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')


def _when(raw) -> Optional[datetime]:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).rstrip('Z')).replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


def _level(value) -> Optional[int]:
    try:
        level = int(value)
    except (TypeError, ValueError):
        return None
    return level if 1 <= level <= 5 else None


def worked_at(task) -> Optional[datetime]:
    """When a finished task was worked on: its calendar block's start, else its
    finish less the time it took, else its finish."""
    done = _when(task.get('completed_at'))
    if not done:
        return None
    if time_spent.block_seconds(task) is not None:
        return _when(task.get('created_at'))
    took = time_spent.seconds_spent(task)
    return done - timedelta(seconds=took) if took else done


def _smooth(values: List[float]) -> List[float]:
    """Each hour with half a share of its neighbors, so one busy hour between
    two empty ones reads as a habit around then, not a spike."""
    return [0.5 * values[h] + 0.25 * values[(h - 1) % 24] + 0.25 * values[(h + 1) % 24]
            for h in range(24)]


def rhythm(tasks: List[dict], focus_days: List[dict], now: datetime) -> dict:
    """What the record says about when this reader works, and how it goes."""
    since = now - timedelta(days=LOOKBACK_DAYS)
    count = [0.0] * 24
    rated: Dict[str, List[List[int]]] = {'all': [[] for _ in range(24)],
                                         'hard': [[] for _ in range(24)]}
    hours: List[int] = []
    days = set()
    minutes_by_day: Dict[str, float] = defaultdict(float)

    for task in tasks:
        if task.get('status') != 'done':
            continue
        at = worked_at(task)
        if not at or not since <= at <= now:
            continue
        hours.append(at.hour)
        count[at.hour] += 1
        days.add(at.date())
        took = time_spent.seconds_spent(task)
        if took:
            minutes_by_day[at.date().isoformat()] += took / 60
        execution = _level(task.get('execution'))
        if execution:
            rated['all'][at.hour].append(execution)
            if (_level(task.get('difficulty')) or 0) >= 4:
                rated['hard'][at.hour].append(execution)

    # Focus time beats summed task time when there is any: it is what the
    # reader actually sat for.
    focus = {}
    for row in focus_days:
        day = str(row.get('date') or '')[:10]
        try:
            seconds = float(row.get('seconds') or 0)
        except (TypeError, ValueError):
            seconds = 0
        if seconds > 0 and since.date().isoformat() <= day <= now.date().isoformat():
            focus[day] = seconds / 60
    daily = list(focus.values()) or [m for m in minutes_by_day.values() if m > 0]

    # Each weekday's share of days worked at all.
    weekdays_seen = Counter((since + timedelta(days=offset)).weekday()
                            for offset in range(LOOKBACK_DAYS))
    worked = Counter(day.weekday() for day in days)
    weekday = [worked[d] / weekdays_seen[d] if weekdays_seen[d] else 0 for d in range(7)]

    enough = len(hours) >= ENOUGH_TASKS
    if enough:
        ordered = sorted(hours)
        low = ordered[int(0.05 * (len(ordered) - 1))]
        high = ordered[int(0.95 * (len(ordered) - 1))] + 1
        window = (max(EARLIEST_HOUR, low), min(LATEST_HOUR, max(high, low + 4)))
    else:
        window = DEFAULT_WINDOW

    def average(per_hour: List[List[int]]) -> float:
        every = [value for hour in per_hour for value in hour]
        return sum(every) / len(every) if every else 3.0

    def shrunk(per_hour: List[List[int]], mean: float) -> List[float]:
        return [(sum(values) + mean * PRIOR_WEIGHT) / (len(values) + PRIOR_WEIGHT)
                for values in per_hour]

    mean, mean_hard = average(rated['all']), average(rated['hard'])

    top = max(count) or 1
    return {
        'enough': enough,
        'window': window,
        'activity': _smooth([value / top for value in count]) if enough else [0.0] * 24,
        'quality': _smooth(shrunk(rated['all'], mean)),
        'quality_hard': _smooth(shrunk(rated['hard'], mean_hard)),
        'rated': [len(values) for values in rated['all']],
        'rated_hard': [len(values) for values in rated['hard']],
        'mean': mean,
        'mean_hard': mean_hard,
        'weekday': weekday if enough else [0.0] * 7,
        'daily_minutes': median(daily) if daily else None,
    }


def _overlap(start: datetime, end: datetime, spans) -> float:
    """Minutes of [start, end) that `spans` cover."""
    total = 0.0
    for span_start, span_end in spans:
        low, high = max(start, span_start), min(end, span_end)
        if high > low:
            total += (high - low).total_seconds() / 60
    return total


def _hour_label(hour: int) -> str:
    suffix = 'AM' if hour < 12 else 'PM'
    return '{} {}'.format(hour % 12 or 12, suffix)


def best_slot(minutes: int, difficulty, busy: List[Tuple[datetime, datetime]],
              booked: List[dict], subject: str, profile: dict,
              now: datetime, before: Optional[datetime] = None) -> Optional[dict]:
    """The best (start, end) for this session, with why, or None.

    `booked` is the planned sessions already on the calendar, each
    `{start, end, subject}`; `subject` is this one's, in the same terms.
    `before` is a deadline the session has to end by (a goal's), when there
    is one: a perfect Thursday after the exam is no use to it.
    """
    level = _level(difficulty) or 3
    length = timedelta(minutes=minutes)
    open_hour, close_hour = profile['window']
    hard = level >= 4
    quality = profile['quality_hard'] if hard else profile['quality']
    mean = profile['mean_hard'] if hard else profile['mean']
    weight = QUALITY_WEIGHT[level]
    ideal_gap = GAP_DAYS.get(level, 1)

    horizon = now + timedelta(days=SEARCH_DAYS + 1)
    taken = list(busy) + [(one['start'], one['end']) for one in booked]
    padded = [(start - BUFFER, end + BUFFER) for start, end in taken
              if end > now and start < horizon]
    sessions_on = Counter(one['start'].date() for one in booked)
    mine = [one['start'].date() for one in booked if subject and one['subject'] == subject]

    cursor = now.replace(second=0, microsecond=0)
    cursor += timedelta(minutes=(-cursor.minute) % 15 or 15)

    days = [(now + timedelta(days=offset)).replace(hour=0, minute=0, second=0, microsecond=0)
            for offset in range(SEARCH_DAYS + 1)]
    # Booked minutes in each day's window. A day is heavy when it runs past
    # both the reader's usual focus and their usual calendar: a school day
    # that is always full is normal, not a reason to skip every weekday.
    loads = {day.date(): _overlap(day + timedelta(hours=open_hour),
                                  day + timedelta(hours=close_hour), busy) for day in days}
    usual = max(profile['daily_minutes'] or 0, median(loads.values()))

    best = None
    for day in days:
        date = day.date()
        if sessions_on[date] >= MOST_PER_DAY or date in mine:
            continue
        gaps = [abs((date - other).days) for other in mine]
        spacing = sum(max(0, ideal_gap - gap) for gap in gaps)
        close_at = day + timedelta(hours=close_hour)
        if before is not None:
            close_at = min(close_at, before)
        start = max(day + timedelta(hours=open_hour), cursor)
        already = loads[date]
        load = max(0.0, already + minutes - usual) / usual if usual else 0.0
        while start + length <= close_at:
            end = start + length
            clash = next((b_end for b_start, b_end in padded
                          if b_start < end and b_end > start), None)
            if clash is not None:
                start = max(start + STEP, clash)
                start = start.replace(second=0, microsecond=0)
                start += timedelta(minutes=(-start.minute) % 15)
                continue
            hours = list(range(start.hour, (end - timedelta(minutes=1)).hour + 1))
            how = sum(quality[h % 24] for h in hours) / len(hours)
            habit = sum(profile['activity'][h % 24] for h in hours) / len(hours)
            ahead = (start - now).total_seconds() / 86400
            score = (2.0 * weight * (how - mean) + habit
                     + 0.8 * profile['weekday'][start.weekday()]
                     - 1.5 * load - SOONER * ahead - 1.5 * spacing)
            if best is None or score > best['score']:
                best = {'score': score, 'start': start, 'end': end, 'how': how,
                        'habit': habit, 'load': load, 'gaps': gaps, 'already': already}
            start += STEP
    if not best:
        return None
    best['why'] = _why(best, hard, mean, profile)
    return best


FIRST_FREE = 'The first free opening on your calendar.'


def place(minutes: int, difficulty, subject: str, busy: List[Tuple[datetime, datetime]],
          booked: List[dict], profile: dict, now: datetime,
          before: Optional[datetime] = None) -> Optional[dict]:
    """Where one planned session goes: `{start, end, why}`, or None.

    `best_slot` first. When the spacing rules leave no day (every day in reach
    already holds this subject, or two sessions), the first free slot instead,
    still inside `before`, so a planner never answers "no room" while the
    calendar has room. Every planner books through here, so a skill-tree
    session, a goal's sessions and a subject page's next session all read the
    same record and space around each other.
    """
    best = best_slot(minutes, difficulty, busy, booked, subject, profile, now, before)
    if best:
        return {'start': best['start'], 'end': best['end'], 'why': best['why']}
    taken = list(busy) + [(one['start'], one['end']) for one in booked]
    slot = session_plan.next_slot(minutes, taken, now)
    if not slot or (before is not None and slot[1] > before):
        return None
    return {'start': slot[0], 'end': slot[1], 'why': FIRST_FREE}


def _why(slot: dict, hard: bool, mean: float, profile: dict) -> str:
    """One or two plain sentences on why this time."""
    start = slot['start']
    hour = start.hour
    counts = profile['rated_hard' if hard else 'rated']
    rated = counts[hour] + counts[(hour + 1) % 24]
    parts = []
    if rated >= 3 and slot['how'] - mean >= 0.1:
        parts.append('You rate {}work around {} {:.1f} out of 5, above your {:.1f} average.'.format(
            'hard ' if hard else '', _hour_label(hour), slot['how'], mean))
    elif profile['enough'] and slot['habit'] >= 0.6:
        parts.append("{} is when you usually get work done.".format(_hour_label(hour)))
    elif profile['enough']:
        parts.append('It fits inside the hours you usually work.')

    if slot['gaps']:
        gap = min(slot['gaps'])
        when = 'A day' if gap == 1 else '{} days'.format(gap)
        rest = (' so the hard work has time to settle.' if hard and gap >= 2
                else ' so the practice is spaced out.')
        parts.append('{} from your other session for this subject,{}'.format(when, rest))
    elif profile['weekday'][start.weekday()] >= 0.7 and slot['load'] == 0:
        parts.append('You work most {}s, and this one has room.'.format(WEEKDAYS[start.weekday()]))
    elif slot['already'] == 0:
        parts.append('Nothing else is on your calendar that day.')

    if not parts:
        return 'The first good opening on your calendar.'
    return ' '.join(parts[:2])


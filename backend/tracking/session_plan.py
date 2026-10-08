"""Turning one recommended session into a booked task.

"Plan my next session" on a subject page's recommendation takes the step the
model wrote and puts it on the calendar: how long it should take, what it is
worth, and when. Those three are rules, so they live here; the endpoint in
api/subject_ai.py only reads the rows and writes the task.

## How long

The model's own minutes when it gave a sane number, otherwise a figure from
the step's difficulty — an approximation, and labelled as one on the page.

## What it is worth

Scaled to the account's own calendar, where a ninety-minute seminar is worth
about fifty: roughly half an XP a minute at middling difficulty, more for
harder work, rounded to five and held inside the 10-250 the dialogs allow.

## When

The first gap long enough for it, from the next quarter hour onward, inside
waking hours, that no calendar-placed task and no calendar event overlaps.
Times are local and naive, the way every task's `created_at`/`due_date` is
stored.
"""
from datetime import datetime, timedelta
import math
from backend.config.shared import RULES

#: Minutes when the step gave none, by its 1-5 difficulty.
MINUTES_BY_DIFFICULTY = {1: 20, 2: 30, 3: 45, 4: 60, 5: 75}
MIN_MINUTES = 10
MAX_MINUTES = 180

#: The XP range every task dialog allows, and where XP folds onto the stored
#: three-value priority — shared/rules.json, which the browser reads too.
MIN_XP = RULES['task_xp']['min']
MAX_XP = RULES['task_xp']['max']
MEDIUM_FROM = RULES['task_xp']['medium_from']
HARD_FROM = RULES['task_xp']['hard_from']

#: The hours a session may be booked into, local time.
DAY_START = 8
DAY_END = 22

#: How far ahead to look before giving up.
SEARCH_DAYS = 14

#: Slots start on these boundaries.
STEP_MINUTES = 15

#: A task whose creation is this far before its deadline was never dragged
#: onto the grid as a block — it is a to-do with a due date — so it holds
#: only the hour before the deadline rather than every hour since it was made.
LONGEST_BLOCK = timedelta(hours=12)


def estimate_minutes(minutes, difficulty) -> int:
    """How long the session should take, rounded up to five minutes."""
    try:
        given = int(minutes or 0)
    except (TypeError, ValueError):
        given = 0
    if not MIN_MINUTES <= given <= MAX_MINUTES:
        given = MINUTES_BY_DIFFICULTY.get(_level(difficulty), 45)
    return int(math.ceil(given / 5.0) * 5)


def xp_for(minutes: int, difficulty) -> int:
    """What finishing it is worth."""
    rate = 0.3 + 0.1 * _level(difficulty)
    raw = int(round(minutes * rate / 5.0) * 5)
    return max(MIN_XP, min(MAX_XP, raw))


def priority_for(xp: int) -> str:
    if xp >= HARD_FROM:
        return 'high'
    if xp >= MEDIUM_FROM:
        return 'medium'
    return 'low'


def _level(difficulty) -> int:
    try:
        level = int(difficulty or 3)
    except (TypeError, ValueError):
        level = 3
    return max(1, min(5, level))


def _parse(raw):
    if not raw:
        return None
    text = str(raw)
    if text.endswith('Z'):
        text = text[:-1]
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed.replace(tzinfo=None)


def _hm(text):
    try:
        hours, minutes = str(text).split(':')[:2]
        return int(hours), int(minutes)
    except (TypeError, ValueError):
        return None


def busy_spans(tasks, calendar: dict, since: datetime):
    """Every (start, end) already taken from `since` on.

    Calendar-placed tasks (shown on the calendar, with a deadline) hold the
    span they were booked for; calendar events hold their start and end times
    on their day. Day keys in the calendar store are "2026-10-6", unpadded.
    """
    spans = []
    for task in tasks:
        flag = task.get('show_on_calendar')
        if flag not in (True, 1, '1', 'true'):
            continue
        end = _parse(task.get('due_date'))
        if not end or end <= since:
            continue
        start = _parse(task.get('created_at'))
        if not start or start >= end or end - start > LONGEST_BLOCK:
            start = end - timedelta(hours=1)
        spans.append((start, end))

    for key, day in (calendar or {}).items():
        try:
            year, month, date = (int(part) for part in str(key).split('-'))
            base = datetime(year, month, date)
        except (TypeError, ValueError):
            continue
        if base + timedelta(days=2) < since:
            continue
        for section in (day or {}).get('timestamps') or []:
            if not isinstance(section, dict):
                continue
            begin, finish = _hm(section.get('startTime')), _hm(section.get('endTime'))
            if not begin:
                continue
            start = base + timedelta(hours=begin[0], minutes=begin[1])
            end = (base + timedelta(hours=finish[0], minutes=finish[1])
                   if finish else start + timedelta(hours=1))
            if end <= start:
                # An event that ends past midnight is written as ending "earlier".
                end += timedelta(days=1)
            if end > since:
                spans.append((start, end))
    return sorted(spans)


def next_slot(minutes: int, busy, now: datetime):
    """The first free (start, end) of this length, or None within SEARCH_DAYS."""
    length = timedelta(minutes=minutes)
    step = timedelta(minutes=STEP_MINUTES)

    # The next quarter hour, so a session never starts in the past.
    cursor = now.replace(second=0, microsecond=0)
    extra = (-cursor.minute) % STEP_MINUTES
    cursor += timedelta(minutes=extra or (STEP_MINUTES if now > cursor else 0))

    for offset in range(SEARCH_DAYS + 1):
        day = (now + timedelta(days=offset)).replace(hour=0, minute=0, second=0,
                                                     microsecond=0)
        open_at = day + timedelta(hours=DAY_START)
        close_at = day + timedelta(hours=DAY_END)
        start = max(open_at, cursor)
        while start + length <= close_at:
            end = start + length
            clash = next((b_end for b_start, b_end in busy
                          if b_start < end and b_end > start), None)
            if clash is None:
                return start, end
            # Jump past whatever is in the way, onto the next boundary.
            start = max(start + step, clash)
            extra = (-start.minute) % STEP_MINUTES
            start = start.replace(second=0, microsecond=0) + timedelta(minutes=extra)
    return None

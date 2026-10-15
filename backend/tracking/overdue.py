"""What finishing a task late costs — the one place that answers it.

A task finished after its due date earns less: each day late takes
`cut_per_day` of its XP, down to `floor` of it (and never below 1 XP). A due
date with no time is due by the end of that day, so finishing it any time that
day is on time; a due date with a time is late from the minute after it, and
counts as at least one day late.

Tasks finished before `since` were paid in full when they were finished, so
`late_xp` says so for them rather than rewriting what they earned.

The browser's copy is frontend/src/utils/overdue.ts; both run the same cases
(shared/cases/overdue.json), and the numbers come from shared/rules.json.
"""
from datetime import date, datetime
from typing import Optional

from backend.config.shared import RULES

CUT_PER_DAY = RULES['overdue']['cut_per_day']
FLOOR = RULES['overdue']['floor']
SINCE = date.fromisoformat(RULES['overdue']['since'])


def _parse(raw) -> Optional[datetime]:
    if not raw:
        return None
    text = str(raw).strip()
    if text.endswith('Z'):
        text = text[:-1]
    try:
        return datetime.fromisoformat(text.replace(' ', 'T'))
    except ValueError:
        return None


def _has_time(raw) -> bool:
    text = str(raw).strip()
    return len(text) > 10 and text[10] in 'T '


def days_late(due_date, at) -> int:
    """Whole days `at` is past `due_date`. 0 when on time or undated."""
    due = _parse(due_date)
    when = at if isinstance(at, datetime) else _parse(at)
    if due is None or when is None:
        return 0
    days = (when.date() - due.date()).days
    if _has_time(due_date):
        return max(1, days) if when > due else 0
    return max(0, days)


def kept_percent(days: int) -> int:
    """The share of a task's XP still paid when it is `days` late, 0-100."""
    if days <= 0:
        return 100
    return max(round(FLOOR * 100), 100 - round(CUT_PER_DAY * 100) * days)


def late_xp(xp, due_date, at) -> int:
    """The XP a task is worth finished at `at`."""
    full = int(xp or 0)
    when = at if isinstance(at, datetime) else _parse(at)
    if full <= 0 or when is None or when.date() < SINCE:
        return full
    percent = kept_percent(days_late(due_date, when))
    if percent >= 100:
        return full
    return max(1, (full * percent + 50) // 100)

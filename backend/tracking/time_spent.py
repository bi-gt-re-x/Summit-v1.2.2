"""How long a task took — the one place that answers it.

`completion_seconds` reads like a duration and is not one. It is written when
a task is finished as `now - created_at` (backend/api/tasks.py), which is how
long the task sat on the list: a task written down on Monday and ticked off on
Friday is "345,600 seconds". Read raw, that put "7,708 min" sittings into the
model's brief and five-day "tasks" into every average of time spent.

So nothing reads it directly for time spent; everything asks here:

  1. A task placed on the calendar carries its block in two fields it would
     otherwise use for something else — `created_at` is where the block
     starts and `due_date` where it ends. That span is time the reader set
     aside, and is the best figure there is. Believed up to LONGEST_BLOCK.
  2. Otherwise `completion_seconds`, but only when it is short enough to have
     been one sitting (LONGEST_SITTING): a task made and finished within a
     few hours was, near enough, worked for that long.
  3. Otherwise nothing. A missing figure is left out of an average; a lead
     time counted as a duration poisons it.

Mirrored by frontend/src/utils/timeSpent.ts, with tests on both sides.
"""
from datetime import datetime
from typing import Optional

#: A calendar block longer than this is a deadline, not a sitting.
#: Mirrors LONGEST_BLOCK in frontend/src/utils/timeSpent.ts.
LONGEST_BLOCK = 12 * 3600

#: The longest a creation-to-finish gap is believed to be time spent.
LONGEST_SITTING = 6 * 3600


def _when(raw) -> Optional[datetime]:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).rstrip('Z')).replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


def _placed(task) -> bool:
    return task.get('show_on_calendar') in (True, 1, '1', 'true')


def block_seconds(task) -> Optional[float]:
    """The calendar block a placed task carries, or None."""
    if not _placed(task):
        return None
    start, end = _when(task.get('created_at')), _when(task.get('due_date'))
    if not start or not end:
        return None
    span = (end - start).total_seconds()
    return span if 0 < span <= LONGEST_BLOCK else None


def seconds_spent(task) -> Optional[float]:
    """Seconds the task took, or None when nothing says. See the module note."""
    block = block_seconds(task)
    if block is not None:
        return block
    try:
        seconds = float(task.get('completion_seconds') or 0)
    except (TypeError, ValueError):
        return None
    return seconds if 0 < seconds <= LONGEST_SITTING else None


def minutes_spent(task) -> Optional[int]:
    seconds = seconds_spent(task)
    return round(seconds / 60) if seconds is not None else None

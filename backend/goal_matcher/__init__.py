"""Which goals a task counts toward: worked out once, stored, read everywhere.

    task created / edited
      → normalise the fields that matter          normalize.py
      → goals for the task's subject only         (candidate index)
      → cheap deterministic score                 (deterministic matcher)
      → confident: save it; ambiguous: maybe AI   (ai matcher, queue)
      → compact ids-only rows                     store.py
      → analytics reads the stored rows

The task stays the source of truth. See types.py for what is stored.
"""
from backend.goal_matcher.types import (
    GOAL_MATCHER_VERSION,
    MAX_MATCHES_PER_TASK,
    TaskGoalMapping,
    TaskGoalMatch,
)

__all__ = [
    'GOAL_MATCHER_VERSION',
    'MAX_MATCHES_PER_TASK',
    'TaskGoalMapping',
    'TaskGoalMatch',
]

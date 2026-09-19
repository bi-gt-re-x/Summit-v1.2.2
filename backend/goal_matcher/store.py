"""Reading and writing task goal mappings. Ids in, ids out.

The only module in the matcher that touches the database, and it does so
through the two helpers in backend/database/connection.py. What goes in is a
`TaskGoalMapping`; what is written is goal ids with a score and a source, and
two small values on the task. Nothing about the goal itself is ever copied.

A mapping that names a goal which is gone, or is not this account's, is saved
without it, and reads back without it. A dangling reference is treated as no
reference, never as an error: enriching a task must not stop it being saved.
"""
from typing import Dict, Iterable, Optional

from backend.database import connection as db
from backend.goal_matcher.types import TaskGoalMapping, TaskGoalMatch


def _mapping(status, version, rows) -> TaskGoalMapping:
    matches = tuple(TaskGoalMatch(goal_id=goal_id, score=score, source=source)
                    for goal_id, score, source in rows)
    if status == 'matched' and not matches:
        # Every goal it named has been deleted since. Read as unmatched and
        # as stale — version 0 — so the next pass looks at it again rather
        # than trusting an answer about goals that no longer exist.
        return TaskGoalMapping(status='unmatched', version=0)
    if status != 'matched' and matches:
        # Rows left under a non-matched status would be a relationship
        # nobody concluded. The status wins; the rows are not counted.
        matches = ()
    return TaskGoalMapping(status=status, matches=matches, version=version)


def save_mapping(username: str, task_id: str, mapping: TaskGoalMapping) -> Optional[TaskGoalMapping]:
    """Store `mapping` as this task's goals. Returns what was actually kept.

    None when the task is not this account's. Otherwise the stored mapping,
    which differs from the one passed in only by goals that could not be
    linked — and a matched mapping that loses all of them comes back
    unmatched, because that is what was stored.
    """
    kept = db.save_goal_mapping(
        username, task_id, mapping.status, mapping.version,
        [(m.goal_id, m.score, m.source) for m in mapping.matches])
    if kept is None:
        return None
    rows = [(m.goal_id, m.score, m.source) for m in mapping.matches if m.goal_id in kept]
    status = mapping.status if rows or mapping.status != 'matched' else 'unmatched'
    return TaskGoalMapping(status=status, matches=tuple(
        TaskGoalMatch(goal_id=g, score=s, source=src) for g, s, src in rows),
        version=mapping.version)


def mappings_for(username: str, task_ids: Iterable[str]) -> Dict[str, TaskGoalMapping]:
    """The stored mapping for each of these tasks that has one.

    A task that has never been through the matcher is absent from the result.
    That is not the same as unmatched, and callers must not read it as one.
    """
    return {task_id: _mapping(status, version, rows)
            for task_id, (status, version, rows)
            in db.goal_mappings_for(username, task_ids).items()}


def mapping_for(username: str, task_id: str) -> Optional[TaskGoalMapping]:
    """One task's stored mapping, or None if it has never been matched."""
    return mappings_for(username, [task_id]).get(str(task_id))

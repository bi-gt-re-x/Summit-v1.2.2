"""Where the matcher meets task writes: when to run it, and never to fail them.

    task created, or edited in a way that matters
      → load the account's candidate index (two narrow reads)
      → classify the task (cheap, no model)
      → store the mapping (one transaction)

Everything here is enrichment. The task write it follows has already
happened, and a matcher failure must not undo it or turn it into an error: it
is reported and swallowed, and the task is left as never matched — which is
exactly what it was before the matcher existed, and which a later pass can
pick up.

## When a task is looked at again

Only when an input to the match changed: the title, the subject, or the goal
the reader linked it to (MATCH_FIELDS). Completing a task, rating it, moving
its date or its timer changes none of those and runs nothing. Neither does
opening a page: nothing here is reachable from a read.
"""
from typing import Mapping, Optional

from backend.goal_matcher import candidate_index, store
from backend.goal_matcher.deterministic import Classification, TaskInput, classify
from backend.goal_matcher.types import TaskGoalMapping, TaskGoalMatch

# How many stale tasks one refresh pass takes on. Small enough that a pass is
# quick and cannot hold the database for long; the pass is resumable, so the
# rest are picked up by the next one.
REFRESH_SLICE = 200

# Tasks classified and stored per transaction in a batch. One transaction per
# chunk rather than per task is most of the speed; a chunk rather than the
# whole batch keeps each write short, and means a failure costs one chunk.
CHUNK_SIZE = 100

# The task fields a match is worked out from. A change to any other field
# leaves the stored mapping as true as it was.
MATCH_FIELDS = ('title', 'subject', 'goal_id')


def needs_refresh(before: Optional[Mapping], after: Mapping) -> bool:
    """Whether an edit touched anything the match reads. A new task always does."""
    if before is None:
        return True
    return any((before.get(field) or None) != (after.get(field) or None)
               for field in MATCH_FIELDS)


def task_input(task: Mapping) -> TaskInput:
    """The matchable fields of a task row, and only those."""
    return TaskInput(id=str(task.get('id')), title=task.get('title') or '',
                     subject=task.get('subject') or None)


def with_explicit(result: Classification, goal_id: Optional[str]) -> Classification:
    """Put the goal the reader linked by hand first, whatever the rules said.

    The link is the task's `goal_id` column, which the matcher never writes,
    so re-matching cannot remove it: every run starts again from that column.
    It is stored as a match too — source 'explicit', score 1 — so everything
    that reads the stored rows sees it without also reading `goal_id`.

    The rules still add goals beside it, but only ones they were confident
    enough to match on their own. An ambiguous reading is dropped: the task
    already has an owner, and "maybe also this one" is not worth a closer look.
    """
    goal_id = (goal_id or '').strip()
    if not goal_id:
        return result
    beside = tuple(match for match in result.mapping.matches if match.goal_id != goal_id)
    return Classification(TaskGoalMapping(
        status='matched',
        matches=(TaskGoalMatch(goal_id=goal_id, score=1.0, source='explicit'),) + beside))


def classify_task(index: candidate_index.CandidateIndex, task: Mapping) -> Classification:
    """The mapping for one task row, from an index already built.

    A goal linked by hand wins — see `with_explicit`. It need not be a goal
    the index would offer: the reader may link a task to a completed goal, or
    to one measured by a counter, and that is their call to make.
    """
    return with_explicit(classify(index, task_input(task)), task.get('goal_id'))


def refresh_task(username: str, task: Mapping,
                 index: Optional[candidate_index.CandidateIndex] = None) -> Optional[TaskGoalMapping]:
    """Work out and store one task's goals. Returns what was stored, or None.

    None means it could not be done — the task is not this account's, or
    something inside the matcher failed. Either way the caller carries on: the
    task itself is already saved.

    Pass `index` when refreshing several tasks, so the goals are read once.
    """
    try:
        index = index if index is not None else candidate_index.load(username)
        result = classify_task(index, task)
        return store.save_mapping(username, str(task['id']), result.mapping)
    except Exception as exc:  # noqa: BLE001 - enrichment never fails the write it follows
        print('[goal_matcher] could not match task {}: {!r}'.format(task.get('id'), exc))
        return None


def after_write(username: str, before: Optional[Mapping], after: Mapping) -> Optional[TaskGoalMapping]:
    """Call after saving a task. Runs the matcher only if it has something to do."""
    if not needs_refresh(before, after):
        return None
    return refresh_task(username, after)


def chunks(items, size):
    """`items` in lists of at most `size`, in order."""
    items = list(items)
    for at in range(0, len(items), size):
        yield items[at:at + size]


def refresh_tasks(username: str, tasks, index: Optional[candidate_index.CandidateIndex] = None,
                  chunk_size: int = CHUNK_SIZE) -> dict:
    """Work out and store the goals of many tasks. Returns how many of each.

    The goals are read once for the whole batch. Classifying is in memory and
    cheap; storing is one transaction per chunk of CHUNK_SIZE. A chunk that
    fails is reported, counted and skipped, and the chunks after it still run
    — its tasks are left as they were, and a later pass picks them up.

    Only the matchable fields of each task are read (see `task_input`), so a
    caller can pass full rows or narrow ones.
    """
    tasks = list(tasks)
    if not tasks:
        return {'refreshed': 0, 'failed': 0}
    try:
        index = index if index is not None else candidate_index.load(username)
    except Exception as exc:  # noqa: BLE001 - enrichment never fails the write it follows
        print('[goal_matcher] could not load goals for {}: {!r}'.format(username, exc))
        return {'refreshed': 0, 'failed': len(tasks)}

    refreshed = failed = 0
    for part in chunks(tasks, chunk_size):
        try:
            mappings = {str(task['id']): classify_task(index, task).mapping for task in part}
            refreshed += len(store.save_mappings(username, mappings))
        except Exception as exc:  # noqa: BLE001 - one chunk failing is one chunk
            failed += len(part)
            print('[goal_matcher] could not match {} tasks: {!r}'.format(len(part), exc))
    return {'refreshed': refreshed, 'failed': failed}


def refresh_stale(username: str, limit: int = REFRESH_SLICE) -> dict:
    """Bring up to `limit` out-of-date tasks up to the current matcher version.

    Out of date means never matched, or matched by an older version. The index
    is read once for the pass. Resumable and safe to repeat: each task stored
    is no longer stale, so the next pass starts where this one stopped, and a
    pass with nothing to do reads one indexed count and returns.

    Never called on startup or from a page read. It is the controlled way to
    catch a history up after a version bump, one bounded slice at a time.
    """
    due = store.stale_tasks(username, limit)
    if not due:
        return {'refreshed': 0, 'remaining': 0}
    done = refresh_tasks(username, due)
    return {'refreshed': done['refreshed'], 'remaining': store.stale_count(username)}

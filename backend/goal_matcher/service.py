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
import time
from typing import Mapping, Optional

from backend.database import connection as db
from backend.goal_matcher import ai, candidate_index, metrics, store
from backend.goal_matcher.queue import work
from backend.goal_matcher.deterministic import Classification, TaskInput, classify
from backend.goal_matcher.types import TaskGoalMapping, TaskGoalMatch

# How many stale tasks one refresh pass takes on. Small enough that a pass is
# quick and cannot hold the database for long; the pass is resumable, so the
# rest are picked up by the next one.
REFRESH_SLICE = 200

# What a match the model chose is worth. Above the match threshold, below an
# explicit link: the reader saying so outranks the model saying so.
AI_SCORE = 0.8

# Ambiguous tasks one catch-up pass may ask the model about. A backfill over a
# whole history must not turn into hundreds of calls; the rest stay ambiguous,
# which is what they are, and are asked about if they are written again.
AI_PER_PASS = 20

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


def ask_about(username: str, task: Mapping, candidates) -> bool:
    """Queue the model on an ambiguous task, and mark it pending meanwhile.

    Only ambiguous tasks get here, and only when a model is configured. The
    task is marked 'pending' so the state says what is true — queued, not
    concluded — and the question runs on a worker (queue.py), never in the
    request. Returns whether it was queued.
    """
    task_id = str(task['id'])
    if not candidates or not ai.available():
        return False
    # What the answer will be checked against: an edit in the meantime
    # reclassifies the task itself, and a stale answer must not overwrite it.
    was = {field: task.get(field) for field in MATCH_FIELDS}
    # Marked before it is queued, not after: a worker can finish the question
    # before this line runs, and writing 'pending' over its answer would leave
    # the task queued for something that already happened.
    store.save_mapping(username, task_id, TaskGoalMapping.pending())
    if not work.submit(('ai', task_id),
                       lambda: resolve(username, task_id, was, [g for g, _ in candidates])):
        # Nobody is going to ask, so it is not pending — it is what it was.
        store.save_mapping(username, task_id, TaskGoalMapping(status='ambiguous'))
        return False
    return True


def resolve(username: str, task_id: str, was: Mapping, candidate_ids) -> Optional[TaskGoalMapping]:
    """Ask the model about one ambiguous task and store what it says.

    Runs on a worker. Does nothing if the task changed after it was queued —
    that edit has already rematched it — and nothing if the question cannot be
    answered, which leaves the task ambiguous rather than guessing.
    """
    task = db.find_row('tasks', task_id, user_id=username)
    if not task or any((task.get(field) or None) != (was.get(field) or None)
                       for field in MATCH_FIELDS):
        return None

    titles = {row['id']: row.get('title') or ''
              for row in db.columns_for('goals', username, ('id', 'title'))}
    stages = {}
    for row in db.columns_for('goal_milestones', username, ('goal_id', 'title'), order='position'):
        stages.setdefault(row.get('goal_id'), []).append(row.get('title') or '')
    offered = [(goal_id, titles[goal_id], stages.get(goal_id, []))
               for goal_id in candidate_ids if goal_id in titles]

    chosen = ai.ask(username, task.get('title') or '', task.get('subject') or '', offered)
    if chosen is None:
        # No answer. Back to what it was: plausible goals, none confident.
        return store.save_mapping(username, task_id, TaskGoalMapping(status='ambiguous'))

    mapping = TaskGoalMapping(status='matched', matches=tuple(
        TaskGoalMatch(goal_id=goal_id, score=AI_SCORE, source='ai') for goal_id in chosen
    )) if chosen else TaskGoalMapping.unmatched()
    # Checked again: the task may have been edited while the model was asked.
    fresh = db.find_row('tasks', task_id, user_id=username)
    if not fresh or any((fresh.get(field) or None) != (was.get(field) or None)
                        for field in MATCH_FIELDS):
        return None
    return store.save_mapping(username, task_id, mapping)


def refresh_task(username: str, task: Mapping,
                 index: Optional[candidate_index.CandidateIndex] = None) -> Optional[TaskGoalMapping]:
    """Work out and store one task's goals. Returns what was stored, or None.

    None means it could not be done — the task is not this account's, or
    something inside the matcher failed. Either way the caller carries on: the
    task itself is already saved.

    Pass `index` when refreshing several tasks, so the goals are read once.
    """
    try:
        with metrics.timed():
            index = index if index is not None else candidate_index.load(username)
            result = classify_task(index, task)
            stored = store.save_mapping(username, str(task['id']), result.mapping)
        if stored is not None:
            metrics.outcome(stored.status, bool(stored.explicit))
        if stored is not None and stored.status == 'ambiguous':
            ask_about(username, task, result.candidates)
        return stored
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
        return {'refreshed': 0, 'failed': 0, 'asked': 0}
    try:
        index = index if index is not None else candidate_index.load(username)
    except Exception as exc:  # noqa: BLE001 - enrichment never fails the write it follows
        print('[goal_matcher] could not load goals for {}: {!r}'.format(username, exc))
        return {'refreshed': 0, 'failed': len(tasks), 'asked': 0}

    refreshed = failed = asked = 0
    started = time.perf_counter()
    for part in chunks(tasks, chunk_size):
        try:
            found = {str(task['id']): classify_task(index, task) for task in part}
            stored = store.save_mappings(
                username, {task_id: result.mapping for task_id, result in found.items()})
            refreshed += len(stored)
            for mapping in stored.values():
                metrics.outcome(mapping.status, bool(mapping.explicit))
            # The few the rules could not settle, up to this pass's budget.
            for task in part:
                if asked >= AI_PER_PASS:
                    break
                result = found[str(task['id'])]
                if result.mapping.status == 'ambiguous' and ask_about(username, task, result.candidates):
                    asked += 1
        except Exception as exc:  # noqa: BLE001 - one chunk failing is one chunk
            failed += len(part)
            print('[goal_matcher] could not match {} tasks: {!r}'.format(len(part), exc))
    elapsed = (time.perf_counter() - started) * 1000
    metrics.count('runs')
    metrics.count('duration_ms', elapsed)
    metrics.most('slowest_run_ms', elapsed)
    # Only failures are worth a line here. A catch-up over a long history is a
    # hundred of these passes, and a hundred lines saying it went fine is a log
    # nobody reads; `catch_up` prints the one line that sums them up.
    if failed:
        print('[goal_matcher] {} of {} tasks could not be matched'.format(
            failed, failed + refreshed))
    return {'refreshed': refreshed, 'failed': failed, 'asked': asked}


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
        return {'refreshed': 0, 'remaining': 0, 'asked': 0}
    done = refresh_tasks(username, due)
    return {'refreshed': done['refreshed'], 'asked': done['asked'],
            'remaining': store.stale_count(username)}


# ---------------------------------------------------------------------------
# When goals change
# ---------------------------------------------------------------------------
# The goal fields a match reads. An edit to anything else — the deadline, the
# figures, the reason — leaves every task's answer as true as it was.
GOAL_FIELDS = ('title', 'subject_ids', 'measure', 'goal_type')

# The most a catch-up pauses between slices, so a long one never holds the
# database from the requests using it. The actual pause is the shorter of this
# and the time the slice itself took: a slice is quick now that a chunk's
# status writes are grouped, and pausing for longer than the work took turned
# a three-second catch-up into an eight-second one for no benefit.
SLICE_PAUSE = 0.05


def _goal_matters(before: Optional[Mapping], after: Optional[Mapping]) -> bool:
    """Whether this change to a goal could change any task's match."""
    was = bool(before) and candidate_index.is_candidate(before)
    now = bool(after) and candidate_index.is_candidate(after)
    if not was and not now:
        return False
    if before is None or after is None:
        return True
    if was != now:
        # Reopened, or its measure moved to or from a counter. A goal being
        # *completed* lands here too, and is deliberately not a change: the
        # tasks already matched to it were work toward it, and stay so.
        return now
    return any((before.get(f) or '') != (after.get(f) or '') for f in GOAL_FIELDS)


def goal_changed(username: str, before: Optional[Mapping], after: Optional[Mapping],
                 checkpoints_changed: bool = False) -> int:
    """A goal was created, edited or deleted. Queue the tasks it could affect.

    Nothing is scanned or rematched here. The tasks the change could reach —
    its subjects before and after, or all of them for a goal with no subject —
    are marked stale in one UPDATE, and one catch-up job for the account is
    queued. The request that changed the goal returns straight away.

    Call it *before* deleting a goal: its matches are how the tasks toward it
    are found, and the delete takes them with it. Returns how many tasks were
    marked.
    """
    try:
        if not (_goal_matters(before, after) or
                (checkpoints_changed and after and candidate_index.is_candidate(after))):
            return 0
        sides = [goal for goal in (before, after) if goal]
        subjects = set()
        cross = False
        for goal in sides:
            found = candidate_index.subjects_of(goal.get('subject_ids'))
            cross = cross or not found
            subjects |= found
        goal_id = str(sides[0].get('id') or '')
        marked = db.mark_goal_tasks_stale(username, None if cross else subjects, goal_id)
        schedule_catch_up(username)
        return marked
    except Exception as exc:  # noqa: BLE001 - enrichment never fails the write it follows
        print('[goal_matcher] could not queue tasks for a goal change: {!r}'.format(exc))
        return 0


def recover_pending(username: str) -> int:
    """Free tasks left claiming a question nobody is going to answer.

    A task is 'pending' while the model is queued about it, and the queue
    lives in one process's memory: a restart in the middle leaves the state
    true of a job that no longer exists. Tasks genuinely queued right now are
    left alone; the rest are marked due and the pass below picks them up.
    """
    queued = [key[1] for key in work.keys() if isinstance(key, tuple) and key[0] == 'ai']
    return db.mark_pending_goal_tasks_stale(username, queued)


def catch_up(username: str, slice_size: int = REFRESH_SLICE) -> int:
    """Refresh every stale task, a slice at a time. Returns how many were matched."""
    # Once, before the loop: a task this pass marks due is one this pass then
    # classifies, and re-marking inside the loop would be a pass with no end.
    recover_pending(username)
    total = 0
    began = time.perf_counter()
    asked = 0
    while True:
        started = time.perf_counter()
        result = refresh_stale(username, limit=slice_size)
        total += result['refreshed']
        asked += result.get('asked', 0)
        if result['refreshed'] == 0 or result['remaining'] == 0:
            if total:
                # One line for the whole catch-up: counts and milliseconds,
                # nothing about any task.
                print('[goal_matcher] matched {} tasks in {:.0f} ms ({} asked)'.format(
                    total, (time.perf_counter() - began) * 1000, asked))
            return total
        # Half the time to the database, half to everyone else.
        time.sleep(min(SLICE_PAUSE, time.perf_counter() - started))


def schedule_catch_up(username: str) -> bool:
    """Queue one catch-up for the account. Asking again while it waits does nothing."""
    return work.submit(('catch_up', username), lambda: catch_up(username))

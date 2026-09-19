"""Counters for what the matcher is actually doing. Numbers only.

Enough to answer the questions that decide whether any of this is working:

    is it running when it should?          runs, tasks_matched, duration_ms
    is the cheap path carrying it?         matched / ambiguous / unmatched
    is the normalising cache earning it?   cache_hits, cache_misses
    is the model being asked too often?    ai_asked, ai_cached, ai_failed
    are completions arriving in batches?   batches, tasks_completed,
                                           largest_batch, average_batch

Counts and milliseconds, never content: no titles, no ids, nothing about one
account. They are for reading the shape of the system, and a metric that
carried a task title would be a task history in the logs.

Process-wide and in memory, so they reset when the server does and say
nothing about history — `scripts/profile_goal_matcher.py` is the tool for
measuring a whole run. Reading them is free and costs no lock.
"""
import threading
import time
from typing import Dict

_lock = threading.Lock()

_counts: Dict[str, float] = {}

#: Every counter, so a snapshot has the same keys before and after anything
#: has happened — a dashboard reading `ai_failed` should see 0, not nothing.
NAMES = (
    # Matching
    'runs', 'tasks_matched', 'duration_ms', 'slowest_run_ms',
    'matched', 'ambiguous', 'unmatched', 'explicit',
    'cache_hits', 'cache_misses',
    # The model
    'ai_asked', 'ai_cached', 'ai_answered', 'ai_failed', 'ai_unreadable',
    # Batch completion
    'batches', 'tasks_completed', 'largest_batch',
    # Background work
    'jobs_run', 'jobs_failed', 'jobs_refused',
)


def count(name: str, amount: float = 1) -> None:
    """Add to one counter."""
    with _lock:
        _counts[name] = _counts.get(name, 0) + amount


def most(name: str, value: float) -> None:
    """Keep the largest value this counter has seen."""
    with _lock:
        if value > _counts.get(name, 0):
            _counts[name] = value


def snapshot() -> Dict[str, float]:
    """Every counter now, with the averages worked out."""
    with _lock:
        out = {name: _counts.get(name, 0) for name in NAMES}
    # The normalising cache keeps its own tally; read it rather than counting
    # the same thing twice. Imported here so this module stays a leaf.
    from backend.goal_matcher.normalize import cache_info
    info = cache_info()
    out['cache_hits'], out['cache_misses'] = info.hits, info.misses
    runs = out['runs'] or 0
    batches = out['batches'] or 0
    out['average_run_ms'] = round(out['duration_ms'] / runs, 1) if runs else 0
    out['average_batch'] = round(out['tasks_completed'] / batches, 1) if batches else 0
    out['duration_ms'] = round(out['duration_ms'], 1)
    out['slowest_run_ms'] = round(out['slowest_run_ms'], 1)
    return out


def reset() -> None:
    """Back to nothing, including the cache tally this reports. For tests."""
    from backend.goal_matcher.normalize import normalize
    normalize.cache_clear()
    with _lock:
        _counts.clear()


class timed:
    """Time a matching pass and record it, however it ends.

        with timed():
            ...
    """

    def __enter__(self):
        self.started = time.perf_counter()
        return self

    def __exit__(self, *exc):
        elapsed = (time.perf_counter() - self.started) * 1000
        count('runs')
        count('duration_ms', elapsed)
        most('slowest_run_ms', elapsed)
        return False


def outcome(status: str, explicit: bool = False) -> None:
    """Record what one task's match came to."""
    count('tasks_matched')
    if status in ('matched', 'ambiguous', 'unmatched'):
        count(status)
    if explicit:
        count('explicit')

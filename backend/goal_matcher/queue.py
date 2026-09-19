"""Background work for the goal matcher: few workers, each job once.

Anything that could be slow or expensive — catching a whole history up after
a goal changes, asking a model about an ambiguous task — runs here, off the
request that caused it. The request saves what it came to save and returns.

## Bounded

* **CONCURRENCY workers**, at most. Never a thread per job, never a model call
  per task all at once: a hundred queued jobs are worked three at a time.
* **Each job once.** A job has a key; submitting a key already waiting does
  nothing. Submitting one that is *running* marks it to run once more when it
  finishes, so a change made mid-run is not lost and ten changes do not
  become ten runs.
* **A cap on waiting jobs.** Past MAX_WAITING a new key is refused and
  reported, rather than growing memory without limit. Nothing is lost by it:
  the work that matters is recorded in the database (a stale version, an
  ambiguous status) and the next catch-up finds it.

## Started on demand

No threads exist until the first job is submitted — importing the module,
starting the app and opening a page start nothing.

## In tests

`wait_idle()` blocks until everything submitted has run. The suite calls it
after every test (tests/conftest.py) so no job outlives the database it was
written for.
"""
import threading
from collections import OrderedDict
from typing import Callable, Hashable

# Workers running jobs at once. Three keeps a burst of model calls well inside
# any provider's rate limit and leaves the database free for requests.
CONCURRENCY = 3

# Jobs waiting at once, across every account.
MAX_WAITING = 500


class WorkQueue:
    """A keyed, bounded, lazily started pool of worker threads."""

    def __init__(self, workers: int = CONCURRENCY, max_waiting: int = MAX_WAITING):
        self.workers = workers
        self.max_waiting = max_waiting
        self._lock = threading.Condition()
        self._waiting: 'OrderedDict[Hashable, Callable[[], None]]' = OrderedDict()
        self._running: dict = {}
        self._again: dict = {}
        self._threads: list = []
        self.refused = 0

    # -- submitting -----------------------------------------------------------
    def submit(self, key: Hashable, job: Callable[[], None]) -> bool:
        """Queue `job` under `key`. False if the queue is full.

        A key already waiting keeps its place and its job. A key running now
        is marked to run once more afterwards, with the newest job.
        """
        with self._lock:
            if key in self._running:
                self._again[key] = job
                return True
            if key in self._waiting:
                return True
            if len(self._waiting) >= self.max_waiting:
                self.refused += 1
                return False
            self._waiting[key] = job
            self._start()
            self._lock.notify()
            return True

    def _start(self):
        while len(self._threads) < self.workers:
            thread = threading.Thread(target=self._work, name='goal-matcher-{}'.format(len(self._threads)),
                                      daemon=True)
            self._threads.append(thread)
            thread.start()

    # -- working --------------------------------------------------------------
    def _work(self):
        while True:
            with self._lock:
                while not self._waiting:
                    self._lock.wait()
                key, job = self._waiting.popitem(last=False)
                self._running[key] = job
            try:
                job()
            except Exception as exc:  # noqa: BLE001 - one job failing is one job
                print('[goal_matcher] background job {!r} failed: {!r}'.format(key, exc))
            finally:
                with self._lock:
                    del self._running[key]
                    again = self._again.pop(key, None)
                    if again is not None and key not in self._waiting:
                        self._waiting[key] = again
                    self._lock.notify_all()

    # -- watching -------------------------------------------------------------
    def pending(self) -> int:
        """Jobs waiting or running."""
        with self._lock:
            return len(self._waiting) + len(self._running)

    def wait_idle(self, timeout: float = 10.0) -> bool:
        """Block until nothing is waiting or running. False if it timed out."""
        with self._lock:
            return self._lock.wait_for(
                lambda: not self._waiting and not self._running, timeout=timeout)

    def clear(self):
        """Drop everything still waiting. Running jobs finish."""
        with self._lock:
            self._waiting.clear()
            self._again.clear()


#: The one queue the app uses.
work = WorkQueue()

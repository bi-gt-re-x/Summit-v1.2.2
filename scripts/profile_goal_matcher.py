"""What the goal matcher costs: queries, rows, memory and time, per path.

    SUMMIT_DB=/tmp/copy.db .venv-fastapi/bin/python scripts/profile_goal_matcher.py --user Alpha

Read-mostly, but it writes: completing tasks completes them, and matching
stores matches. Point it at a copy.

Every statement the paths below run is counted, grouped by its first words, so
an N+1 shows up as a count that tracks the number of tasks rather than staying
flat. Peak memory is measured with tracemalloc, which counts what Python
allocated — the thing that grows when a whole task history is loaded twice.

The paths are the ones the design cares about:

    reads        the task list and the analytics payload, which every page
                 pays for, and which must not classify anything
    writes       creating and editing one task, which is where matching runs
    completion   sixty at once against sixty one at a time
    catch-up     a whole history matched in the background
    goal change  what the request pays before the background takes over
"""
import argparse
import os
import sys
import time
import tracemalloc
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import connection as db  # noqa: E402
from backend.goal_matcher import service, store  # noqa: E402
from backend.tracking import planner  # noqa: E402

# Nothing here may reach a model: a profile run is not a reason to spend money.
planner.able = lambda: False


class Counted:
    """Counts the statements every connection runs while it is on."""

    def __init__(self):
        self.statements = Counter()
        self.total = 0
        self._real = db.connect

    def __enter__(self):
        def connect():
            con = self._real()
            con.set_trace_callback(self._saw)
            return con
        db.connect = connect
        return self

    def __exit__(self, *exc):
        db.connect = self._real

    def _saw(self, sql):
        self.total += 1
        self.statements[' '.join(str(sql).split()[:3]).upper()] += 1


def measure(label, work, note='', detail=0):
    """Run `work` once, counting queries and memory. Prints one line.

    `detail` prints the commonest statements under it, which is how an N+1
    gives itself away: a count that tracks the number of tasks.
    """
    tracemalloc.start()
    with Counted() as counted:
        started = time.perf_counter()
        result = work()
        elapsed = time.perf_counter() - started
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    print('{:<34} {:>7.0f} ms {:>7} queries {:>8.1f} MB  {}'.format(
        label, elapsed * 1000, counted.total, peak / 1e6, note or result or ''))
    for statement, count in counted.statements.most_common(detail):
        print('{:<34} {:>7}   {}'.format('', count, statement.lower()))
    return counted


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--user', required=True)
    parser.add_argument('--batch', type=int, default=60, help='tasks per completion batch')
    args = parser.parse_args(argv)
    user = args.user

    from backend.api.analytics import get_analytics_tasks
    from backend.api.tasks import CompleteTask, CreateTask, UpdateTask, _complete, complete_task, \
        create_task, list_tasks, update_task

    tasks = db.columns_for('tasks', user, ('id',))
    print('{}: {} tasks, {} goals, {} matched\n'.format(
        user, len(tasks), len(db.columns_for('goals', user, ('id',))), len(store.goal_links(user))))

    print('--- reads (every page pays these) ---')
    measure('GET /api/tasks', lambda: list_tasks(username=user) and '')
    measure('GET /api/analytics/tasks', lambda: get_analytics_tasks(username=user) and '')

    print('\n--- writing one task (matching runs here) ---')
    made = []

    def create():
        reply = create_task(CreateTask(name='USACO Gold training', subject='computer_science',
                                       xp_reward=10), username=user)
        made.append(reply.body if hasattr(reply, 'body') else reply)
        return ''

    measure('POST /api/tasks', create, detail=8)
    fresh = db.columns_for('tasks', user, ('id', 'title'))[-1]['id']
    measure('PUT /api/tasks (rename)',
            lambda: update_task(fresh, UpdateTask(name='USACO Gold training, long'), username=user) and '',
            detail=6)
    measure('PUT /api/tasks (priority only)',
            lambda: update_task(fresh, UpdateTask(priority='high'), username=user) and '')

    print('\n--- completing {} tasks ---'.format(args.batch))
    def fresh_tasks(count, tag):
        return [db.insert_row('tasks', {'id': db.new_id('tasks'), 'user_id': user, 'status': 'todo',
                                        'title': '{} {}'.format(tag, i), 'priority': 'low',
                                        'xp_value': 5, 'created_at': '2026-09-19T08:00:00'})['id']
                for i in range(count)]

    singles = fresh_tasks(args.batch, 'single')
    measure('one at a time',
            lambda: [complete_task(CompleteTask(task_id=t), username=user) for t in singles] and '')
    batched = fresh_tasks(args.batch, 'batch')
    measure('one batch', lambda: _complete(user, batched) and '')

    print('\n--- background work ---')
    stale = store.stale_count(user)
    if stale:
        measure('catch up {} stale tasks'.format(stale), lambda: service.catch_up(user), detail=6)
    goal = db.columns_for('goals', user, ('id', 'title', 'subject_ids', 'measure',
                                          'goal_type', 'status'))
    outcome = next((g for g in goal if (g.get('measure') or g.get('goal_type')) in
                    ('number', 'milestones')), None)
    if outcome:
        changed = dict(outcome, title=(outcome.get('title') or '') + ' (profiled)')
        measure('goal edit: the request part',
                lambda: '{} tasks marked'.format(service.goal_changed(user, outcome, changed)))
        measure('goal edit: the background part', lambda: service.catch_up(user))
    return 0


if __name__ == '__main__':
    sys.exit(main())

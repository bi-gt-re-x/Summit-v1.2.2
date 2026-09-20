"""What `/api/get_growth_ratings` costs: queries, rows, memory and time.

    SUMMIT_DB=/tmp/copy.db .venv-fastapi/bin/python scripts/profile_report_card.py --user Alpha

It writes, and that is the point of the profile: every read of the report card
files a dated grade per metric, so this endpoint is a read that leaves six rows
behind. Point it at a copy.

Statements are counted and grouped, so a write that rewrites a history rather
than appending to it gives itself away as an INSERT count that tracks the age
of the account instead of staying at six.

Read twice, deliberately. The second read of the same card on the same day has
six rows to replace rather than six to add, which is the case nearly every real
request is — a reader who opens the page, clicks away and comes back.
"""
import argparse
import os
import sys
import time
import tracemalloc
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import connection as db      # noqa: E402
from backend.tracking import analytics as analytics_tracking  # noqa: E402


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
        self.statements[' '.join(str(sql).split()[:4]).upper()] += 1


def measure(label, work, note='', detail=0):
    """Run `work` once, counting queries and memory. Prints one line."""
    tracemalloc.start()
    with Counted() as counted:
        started = time.perf_counter()
        result = work()
        elapsed = time.perf_counter() - started
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    print('{:<36} {:>7.0f} ms {:>7} queries {:>8.1f} MB  {}'.format(
        label, elapsed * 1000, counted.total, peak / 1e6, note))
    for statement, count in counted.statements.most_common(detail):
        print('{:<36} {:>7}   {}'.format('', count, statement.lower()))
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--user', required=True)
    parser.add_argument('--detail', type=int, default=8)
    args = parser.parse_args(argv)
    user = args.user

    from backend.api.growth import get_growth_ratings

    snapshots = db.read_table('metric_snapshots')
    mine = [r for r in snapshots if r.get('user_id') == user]
    print('{} snapshot rows on this database, {} of them {}\'s '
          '({} dated days)\n'.format(
              len(snapshots), len(mine), user, len({r.get('date') for r in mine})))

    print('--- the page ---')
    measure('GET /api/get_growth_ratings',
            lambda: get_growth_ratings(username=user) and '', detail=args.detail)
    measure('GET /api/get_growth_ratings (again)',
            lambda: get_growth_ratings(username=user) and '', detail=args.detail)

    print('\n--- the pieces ---')
    card = analytics_tracking.ratings(user, record=False)
    measure('ratings(record=False)',
            lambda: analytics_tracking.ratings(user, record=False) and '')
    measure('save_snapshot()',
            lambda: analytics_tracking.save_snapshot(user, card) or '', detail=4)
    measure('save_snapshot() again',
            lambda: analytics_tracking.save_snapshot(user, card) or '', detail=4)
    measure('history(metric="overall")',
            lambda: '{} points'.format(len(analytics_tracking.history(user, 'overall'))))
    return 0


if __name__ == '__main__':
    sys.exit(main())

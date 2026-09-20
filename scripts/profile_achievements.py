"""What `/api/achievements` costs: queries, rows, memory and time.

    SUMMIT_DB=/tmp/copy.db .venv-fastapi/bin/python scripts/profile_achievements.py --user Alpha

It writes. The page is a read, but reading it reconciles the badge catalogue,
files a row for anything newly earned and stores the signature it was worked
out against. Point it at a copy.

Statements are counted and grouped by their first words, so a whole-table
rewrite on a read path gives itself away as a count of INSERTs that tracks the
size of a table rather than the size of the answer.

Two runs, deliberately. The first visit to the wall genuinely has work to do —
rows to write for everything already earned — and the second has none, which is
what almost every real request is. An endpoint whose second run costs what its
first run cost is doing the work again rather than finding it done.
"""
import argparse
import os
import sys
import time
import tracemalloc
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import connection as db      # noqa: E402


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
    print('{:<34} {:>7.0f} ms {:>7} queries {:>8.1f} MB  {}'.format(
        label, elapsed * 1000, counted.total, peak / 1e6, note))
    for statement, count in counted.statements.most_common(detail):
        print('{:<34} {:>7}   {}'.format('', count, statement.lower()))
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--user', required=True)
    parser.add_argument('--detail', type=int, default=8)
    args = parser.parse_args(argv)
    user = args.user

    from backend.api.achievements import ALL, _sync_catalogue, check_earned, \
        list_achievements
    from backend.tracking.auth import load_user

    _, row = load_user(user)
    if not row:
        print('no such account: {}'.format(user))
        return 1

    print('{} badges in the catalogue, {} rows in achievements, '
          '{} in user_settings\n'.format(
              len(ALL), len(db.read_table('achievements')),
              len(db.read_table('user_settings'))))

    print('--- the page ---')
    measure('GET /api/achievements (first)',
            lambda: list_achievements(username=user) and '', detail=args.detail)
    measure('GET /api/achievements (again)',
            lambda: list_achievements(username=user) and '', detail=args.detail)

    print('\n--- the pieces ---')
    measure('_sync_catalogue()', _sync_catalogue, detail=4)
    measure('_sync_catalogue() again', _sync_catalogue, detail=4)
    measure('check_earned(force=False)',
            lambda: check_earned(user, row) and '')
    measure("db.set_user_setting('x')",
            lambda: db.set_user_setting(user, 'profile_probe', 'x') and '', detail=3)
    measure("db.user_setting('x')",
            lambda: db.user_setting(user, 'profile_probe') and '')
    return 0


if __name__ == '__main__':
    sys.exit(main())

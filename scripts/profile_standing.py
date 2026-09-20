"""What `/api/standing` costs: queries, rows, memory and time.

    SUMMIT_DB=/tmp/copy.db .venv-fastapi/bin/python scripts/profile_standing.py --user Alpha

Reads only, but `ratings()` files a snapshot unless it is told not to, and the
endpoint is on the analytics page beside things that do write. Point it at a
copy.

Every statement is counted and grouped by its first words, so a read that
scales with the number of accounts shows up as a count that tracks the cohort
rather than staying flat. Peak memory is tracemalloc's: what Python allocated,
which is the figure that moves when sixteen accounts' task histories are pulled
into the process to produce five numbers.

The comparison at the end is the point of the file: the placements the fast
path returns have to be the placements the per-account one returned, because
the whole argument for the fast path is that it changes only the cost.
"""
import argparse
import os
import sys
import time
import tracemalloc
from collections import Counter
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import connection as db      # noqa: E402
from backend.tracking import analytics as analytics_tracking  # noqa: E402
from backend.tracking import focus as focus_tracking          # noqa: E402
from backend.tracking import standing as standing_tracking    # noqa: E402


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
    parser.add_argument('--detail', type=int, default=8,
                        help='how many statement kinds to list under each line')
    args = parser.parse_args(argv)

    users = db.users()
    print('{} accounts on this database; {} is being placed among {} others\n'.format(
        len(users), args.user, len(users) - 1))

    print('--- the endpoint ---')
    placement = measure('GET /api/standing', lambda: standing_tracking.standing(args.user),
                        detail=args.detail)
    if placement is None:
        print('\nno such account: {}'.format(args.user))
        return 1

    print('\ncohort {}, enough: {}'.format(placement['cohort'], placement['enough']))
    for row in placement['rows']:
        print('  {:<12} {:>12}   {}'.format(
            row['key'], row['value'],
            'top {}%'.format(row['percentile']) if row['percentile'] is not None
            else 'not placed'))

    # The endpoint is four reads and then arithmetic. Timing the two halves
    # separately is what says whether a slow run is the database or the loop:
    # the reads are flat in the number of accounts and the loop is linear in
    # it, so which one moves when the instance grows is the whole question.
    print('\n--- the reads, once each for everybody ---')
    ledger = measure('db.ledger_days()', db.ledger_days)
    focus_histories = measure('focus.history_for_everyone()',
                              focus_tracking.history_for_everyone)
    rollups = measure('analytics.rollups_for_everyone()',
                      lambda: analytics_tracking.rollups_for_everyone(
                          ledger=ledger, focus_histories=focus_histories),
                      note='reuses the two above')

    print('\n--- the arithmetic, per account ---')
    today = date.today()
    for user in users:
        name = user.get('username')
        if not name:
            continue
        measure(name, lambda u=user, n=name: standing_tracking._profile(
            u, today, ledger.get(n) or {}, focus_histories.get(n) or {},
            rollups.get(n) or {}))
    return 0


if __name__ == '__main__':
    sys.exit(main())

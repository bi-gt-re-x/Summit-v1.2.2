"""Catch an account's tasks up with the goal matcher, a slice at a time.

    .venv-fastapi/bin/python scripts/refresh_goal_matches.py --user Alpha
    .venv-fastapi/bin/python scripts/refresh_goal_matches.py --user Alpha --write

The controlled way to bring a history up to date after the matcher arrives or
its version is bumped (backend/goal_matcher/types.py). The app never does this
by itself — not on startup and not when a page opens — because a version bump
over twenty thousand tasks is work to schedule, not work to spring on whoever
happens to load the Goals page next.

## What it touches

Derived data only: `task_goal_matches` and the two match columns on each task.
The tasks themselves are read, never changed. Run it against a copy first with
SUMMIT_DB=/path/to/copy.db if in doubt.

## Dry by default

Without `--write` it counts what is out of date and stops. With it, it works
through the stale tasks SLICE at a time — one read of the account's goals and
one transaction per hundred tasks per slice — pausing between slices so a
running server is never locked out for long.

## Resumable

Every task stored is no longer stale, so a run that is stopped part-way has
lost nothing: the next run starts with what is left.
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.goal_matcher import service, store, types  # noqa: E402


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--user', required=True, help='the account to catch up')
    parser.add_argument('--write', action='store_true', help='actually store the matches')
    parser.add_argument('--slice', type=int, default=service.REFRESH_SLICE,
                        help='stale tasks per pass (default %(default)s)')
    parser.add_argument('--pause', type=float, default=0.2,
                        help='seconds between passes, to leave room for the app (default %(default)s)')
    args = parser.parse_args(argv)

    due = store.stale_count(args.user)
    print('{}: {} tasks out of date with matcher version {}.'.format(
        args.user, due, types.current_version()))
    if not due or not args.write:
        if due:
            print('Dry run. Add --write to match them.')
        return 0

    started = time.perf_counter()
    total = 0
    while True:
        result = service.refresh_stale(args.user, limit=max(1, args.slice))
        total += result['refreshed']
        print('  matched {:>6}   left {:>6}'.format(total, result['remaining']))
        if result['refreshed'] == 0 or result['remaining'] == 0:
            break
        time.sleep(args.pause)
    print('Done in {:.1f}s.'.format(time.perf_counter() - started))
    return 0 if result['remaining'] == 0 else 1


if __name__ == '__main__':
    sys.exit(main())

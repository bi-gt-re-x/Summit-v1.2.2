"""Put focus goals' targets back in minutes.

    .venv-fastapi/bin/python scripts/repair_focus_goals.py           # show what would change
    .venv-fastapi/bin/python scripts/repair_focus_goals.py --apply   # change it

`target_focus` is minutes (backend/api/goals.py), and that's what progress counts in.
Goals written by the old seed stored seconds, so "Focus for 2,000 hours" had a target
of 7,200,000 and read 5.9% on an account with 7,034 hours logged. This only touches a
goal whose own title names the hours and whose target is exactly those hours in
seconds, so a target somebody really set is left alone. Its counter is capped at the
new target and its status settled the usual way, which asks the reader to confirm a
goal that has just finished.

Runs against whatever the app runs against (DATABASE_URL, else SQLite). Safe to run
twice: a second run finds nothing.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.config import settings  # noqa: E402

settings.load_dotenv()

from backend.api import goals as goal_api  # noqa: E402
from backend.database import connection as db  # noqa: E402

HOURS = re.compile(r'([\d,]+)\s*(?:hours?|hrs?)\b', re.I)


def stored_in_seconds(goal):
    """The right target in minutes, or None when this goal isn't affected."""
    if goal_api._measure_of(goal) != 'focus':
        return None
    found = HOURS.search(str(goal.get('title') or ''))
    if not found:
        return None
    hours = int(found.group(1).replace(',', ''))
    return hours * 60 if float(goal.get('target_focus') or 0) == hours * 3600 else None


def main():
    apply = '--apply' in sys.argv
    changed = 0
    for goal in db.goals():
        minutes = stored_in_seconds(goal)
        if minutes is None:
            continue
        changed += 1
        print('{} {!r}: target_focus {} -> {}'.format(goal.get('user_id'), goal.get('title'), goal.get('target_focus'), minutes))
        if not apply:
            continue
        goal['target_focus'] = minutes
        goal['current_focus'] = min(float(goal.get('current_focus') or 0), minutes)
        goal_api._recompute(goal)
        goal_api._save_goal(goal, goal.get('user_id'))
    print('{} goal{} {}.'.format(changed, '' if changed == 1 else 's', 'repaired' if apply else 'would change, run with --apply'))


if __name__ == '__main__':
    main()

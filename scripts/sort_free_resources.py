"""Load the free-resource catalog and sort it for every account.

    .venv-fastapi/bin/python scripts/sort_free_resources.py           # every account
    .venv-fastapi/bin/python scripts/sort_free_resources.py myles     # one account

Loads data/free_resources.json into `free_resources` (only when it changed),
then, for each account and each catalog subject it has tasks in, ranks that
subject's resources against the account's task names and stores the order in
`subject_resources`. Planning a session does the same for one subject as it
goes; this does them all at once, for a new catalog or a database that
predates it. See backend/tracking/free_resources.py.
"""
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.config import settings  # noqa: E402

settings.load_dotenv()  # DATABASE_URL, the way the server finds it

from backend.database import connection as db  # noqa: E402
from backend.tracking import free_resources as free  # noqa: E402


def main(only=None):
    wrote = free.ensure_catalog(db)
    print('catalog: {} rows ({})'.format(len(free.catalog()), 'loaded' if wrote else 'already current'))
    stamp = datetime.now().isoformat(timespec='seconds')
    covered = free.by_subject()
    accounts = [user['username'] for user in db.users() if user.get('username')]
    if only:
        accounts = [name for name in accounts if name in only]
    for username in accounts:
        subjects = {row.get('subject') for row in db.columns_for('tasks', username, ('subject',))}
        sorted_here = []
        for subject_id in sorted(s for s in subjects if s in covered):
            ranked = free.sort_subject(db, username, subject_id, stamp)
            top = ranked[0]
            sorted_here.append('{} -> {}{}'.format(
                subject_id, top['name'], ' ({} tasks)'.format(top['matched']) if top['matched'] else ''))
        if sorted_here:
            print('{}: {} subjects'.format(username, len(sorted_here)))
            for line in sorted_here:
                print('   ' + line)


if __name__ == '__main__':
    main(set(sys.argv[1:]) or None)

"""Copy a SQLite datastore into PostgreSQL, once.

    .venv-fastapi/bin/python scripts/migrate_to_postgres.py
    .venv-fastapi/bin/python scripts/migrate_to_postgres.py --from data/summit.db \\
        --to postgresql://localhost/summit --replace

What it does, in order:

  1. Copies the SQLite file to a temporary one and brings the *copy* up to the
     current schema (`_catch_up`), so the source is never written to and an
     old file migrates with the columns the app now expects.
  2. Creates the same tables, keys, CHECKs and indexes in Postgres
     (backend/database/pg.py, `mirror_schema` / `finish_schema`). A numeric
     column whose old rows hold words is made text rather than refusing them.
  3. Copies every row, in the order it was written, and checks the counts.

The target must be empty, or `--replace` must say to drop what is there. The
target defaults to DATABASE_URL (from the environment or .env); the source to
data/summit.db.
"""
import argparse
import os
import shutil
import sqlite3
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend.config import settings  # noqa: E402


def main(argv=None):
    settings.load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--from', dest='source', default=settings.DB_PATH,
                        help='the SQLite file to copy (default: %(default)s)')
    parser.add_argument('--to', dest='target', default=os.environ.get('DATABASE_URL', ''),
                        help='the Postgres URL to copy into (default: DATABASE_URL)')
    parser.add_argument('--replace', action='store_true',
                        help='drop everything already in the target first')
    args = parser.parse_args(argv)

    if not args.target.startswith(('postgres://', 'postgresql://')):
        parser.error('no Postgres URL: pass --to or set DATABASE_URL')
    if not os.path.exists(args.source):
        parser.error('no SQLite file at {}'.format(args.source))

    import psycopg
    from backend.database import connection as db
    from backend.database import pg

    scratch_dir = tempfile.mkdtemp(prefix='summit-migrate-')
    copy = os.path.join(scratch_dir, 'source.db')
    try:
        # The backup API rather than a file copy, so a WAL file next to the
        # source (the app writes in WAL mode) is included.
        with sqlite3.connect(args.source) as source, sqlite3.connect(copy) as target:
            source.backup(target)
        db._catch_up(copy)
        lite = sqlite3.connect(copy)

        with psycopg.connect(args.target, autocommit=True) as raw:
            if not pg.is_empty(raw):
                if not args.replace:
                    print('The target already has tables. Pass --replace to drop them first.')
                    return 1
                raw.execute('DROP SCHEMA IF EXISTS public CASCADE')
                raw.execute('CREATE SCHEMA public')

            print('Creating tables…')
            _, tables, indexes = pg.mirror_schema(raw, lite, data=lite)
            print('Copying rows…')
            counts = pg.copy_rows(raw, lite, tables)
            print('Adding keys and indexes…')
            pg.finish_schema(raw, tables, indexes)

            problems = 0
            for table in sorted(counts):
                expected = lite.execute('SELECT COUNT(*) FROM "{}"'.format(table)).fetchone()[0]
                landed = raw.execute('SELECT COUNT(*) FROM "{}"'.format(table)).fetchone()[0]
                mark = 'ok' if expected == landed else 'MISMATCH'
                problems += expected != landed
                print('  {:<28} {:>7} rows  {}'.format(table, landed, mark))
        lite.close()
        if problems:
            print('{} table(s) did not copy completely.'.format(problems))
            return 1
        print('Done. Set DATABASE_URL={} and start the app.'.format(args.target))
        return 0
    finally:
        shutil.rmtree(scratch_dir, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())

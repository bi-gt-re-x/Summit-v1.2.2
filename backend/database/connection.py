"""The datastore: a SQLite database at data/summit.db.

Every read and write in the app goes through here. The database is built on
first use by running data/sql/*.sql in order — each of those files holds one
part of the app's tables, their definitions followed by the rows to start
from — so a fresh clone comes up with a working database and no setup step.
Once it exists those files are never consulted again; the database is the only
copy of the data from that point on.

Rows are plain dicts, one per table row, and that is the whole interface:
`read_table` hands back every row, `write_table` replaces them. The tracking
and page modules never see SQL.

Two details are worth knowing, because the rest of the backend depends on
them:

A column that is NULL is left out of the row dict entirely. The app reads
optional fields as `row.get('x', <fallback>)` and tests `'met_deadline' in
row`, and those two spellings only agree if a value that was never written
stays missing rather than arriving as None. Writing follows the same rule in
reverse: a key the row does not have is stored as NULL when the column allows
it, and left to its DEFAULT when the column is NOT NULL.

Rows keep the order they were written in (`ORDER BY rowid`). The XP ledger is
append-only and "the latest event" is the last row, not the largest id.

The JSON files under data/backups/ are the JSON store this replaced, kept as a
record of the last JSON-era state. They are not read or written.
"""
import json
import os
import sqlite3
import threading
from datetime import datetime

from backend.config.settings import DB_PATH, SCHEMA_FILES, SQL_DIR

# Columns holding JSON. SQLite has no JSON type, so these are TEXT columns
# that get decoded on the way out and encoded on the way in — what the JSONB
# columns in the schema were for.
JSON_COLUMNS = {
    ('metric_snapshots', 'detail'),
    ('activity_log', 'detail'),
    ('user_settings', 'value'),
    ('setting_defaults', 'value'),
    ('library_items', 'tags'),
    ('calendar_documents', 'data'),
}

# The JSON columns that hold a *scalar* — a word, a number, a flag — rather
# than an object or a list.
#
# It matters only when the decode fails, and then it matters a great deal.
# Every other column above is read by callers that go straight to `.get` or
# iterate it, so `{}` is the right answer to unreadable text: an empty one of
# the thing they expected. A preference is not that shape. Its readers expect
# 'dark' or 40 or True, and handing them `{}` does not degrade the page, it
# makes the page render an object — `data-accent="[object Object]"`, a task
# filter that matches nothing, an analytics tab with no name.
#
# So for these the fallback is the text as stored. Anything that ends up here
# was written by something that skipped the encode (scripts/seed_alpha.py did,
# once, for eighteen keys), and the text it wrote is the value it meant. That
# is a guess, but it is the *author's* guess, and it is a far better one than
# an empty object.
SCALAR_JSON_COLUMNS = {
    ('user_settings', 'value'),
    ('setting_defaults', 'value'),
}

_build_lock = threading.Lock()
_built = False

# Columns added to a table after the database was first created.
#
# data/sql/*.sql is only ever executed to build a database that does not exist
# yet, so adding a column there reaches a fresh clone and nothing else — every
# database already in use keeps the shape it was built with, and `CREATE TABLE
# IF NOT EXISTS` will not repair it. Each entry below is applied once, on the
# first connection, and is a no-op from then on.
#
# Additive only, and that is the rule rather than the current state: an ALTER
# that dropped or retyped a column would destroy data the moment someone ran
# an older build against the same file. Anything of that kind is not a
# migration this list can carry.
ADDED_COLUMNS = (
    ('tasks', 'subject', 'TEXT'),
    # The third rating question's answer. Existing rows get NULL, which reads
    # as "not asked" — which is exactly what it was, since the question did not
    # exist. See data/sql/tasks.sql and REASONS in backend/api/tasks.py.
    ('tasks', 'reason', 'TEXT'),
    # The ISO week a colour was claimed in, so the reservation can expire —
    # see backend/tracking/event.py. Existing rows get NULL, which reads as
    # "claimed before anyone was counting" and therefore as long expired.
    ('event_colors', 'claimed_week', 'TEXT'),
    # What would tell the reader a recommendation worked, stored beside the
    # recommendation. Rows written before it existed read as '' — advice given
    # with no test attached, which is what it was.
    ('subject_recommendations', 'signal', 'TEXT'),

    # The outcome layer on goals. Everything a goal needed to stop being a
    # counter and start being something worth aiming at — see data/sql/goals.sql
    # and backend/api/goals.py. Every one is additive with a default, so a row
    # written before they existed reads as a goal with no category, no reason
    # and no numeric measure, which is exactly what it was.
    ('goals', 'category', 'TEXT'),
    ('goals', 'why', 'TEXT'),
    ('goals', 'start_date', 'TEXT'),
    ('goals', 'measure', 'TEXT'),
    ('goals', 'unit', 'TEXT'),
    ('goals', 'current_value', 'NUMERIC'),
    ('goals', 'target_number', 'NUMERIC'),
    ('goals', 'subject_ids', 'TEXT'),
    # Which chart the card draws; empty lets the page pick.
    ('goals', 'chart', 'TEXT'),

    # Which goal and which checkpoint a task is execution for. Both nullable
    # and both meaningless to every task that already exists, which is the
    # honest reading: they were done for their own sake.
    ('tasks', 'goal_id', 'TEXT'),
    ('tasks', 'milestone_id', 'TEXT'),

    # How hard it was and how well it went, one to five, asked once when the
    # task is marked done. Null on every task finished before the prompt
    # existed and on every one where it was dismissed — see data/sql/tasks.sql
    # for why an unrated task must never be read as a zero.
    #
    # No CHECK constraint here, unlike the seed file: ALTER TABLE ADD COLUMN
    # cannot attach one to a table that already has rows, and rewriting the
    # table to add it is exactly the kind of migration ADDED_COLUMNS refuses to
    # carry. The range is enforced by the endpoint instead.
    # What the badge wall needs a badge to carry beyond its threshold: which
    # of the five headings it is filed under, what it is worth toward the
    # achievement score, whether it is one of the five nobody is told about,
    # and the title it confers if it is Ascended. Every one is additive with a
    # null default, and a row written before they existed reads as an
    # uncategorised, unweighted, visible badge — which is what it was.
    ('achievements', 'category', 'TEXT'),
    ('achievements', 'xp_reward', 'INTEGER'),
    ('achievements', 'hidden', 'INTEGER'),
    ('achievements', 'title', 'TEXT'),

    ('tasks', 'difficulty', 'INTEGER'),
    ('tasks', 'execution', 'INTEGER'),

    # The one missed day a streak was forgiven, so the grace day in
    # backend/tracking/xp.py can be rationed by date rather than by a counter
    # that nothing resets. NULL on every account that predates it, which reads
    # as "no grace spent" — the honest answer, since there was none to spend.
    ('users', 'streak_grace_day', 'TEXT'),

    # What a note is about, and which shelf it is on. Both empty on every note
    # written before the notes page could say either, which is the honest
    # reading of a note nobody tagged. No NOT NULL and no DEFAULT: ALTER TABLE
    # gives existing rows NULL, and every reader here treats NULL and '' alike.
    ('notes', 'subject_ids', 'TEXT'),
    ('notes', 'notebook', 'TEXT'),

    # The checklist under a checkpoint — a JSON array of {id, title, done}.
    # Existing checkpoints get NULL, which the API reads as "no checklist yet"
    # and fills with placeholders on first write, so a goal written before this
    # existed is not a goal with a broken one. See data/sql/goals.sql.
    ('goal_milestones', 'steps', 'TEXT'),
    # `subject_readings` gained this between one commit and the next, so an
    # install that ran the version in between has the table without it. The
    # table is created with the column now, and CREATE TABLE IF NOT EXISTS does
    # nothing to a table that is already there — which is the whole reason this
    # list exists. Existing rows read as a reading with no window recorded, and
    # the page shows one of those rather than hiding it: a reading that cannot
    # say which window it came from is still the reading somebody paid for.
    ('subject_readings', 'span', 'TEXT'),

    # Which end of a record's range is the good end — 'higher' for a score,
    # 'lower' for a time. Existing rows get NULL, and every reader treats NULL
    # as 'higher', which is the honest reading: bigger-is-better was the
    # assumption the whole page ran on before the column existed. No CHECK and
    # no DEFAULT for the reason the task ratings above give — ALTER TABLE
    # cannot attach one to a table with rows in it, and the endpoint in
    # backend/api/records.py narrows the value to the two words anyway.
    ('records', 'comparison_direction', 'TEXT'),

    # What the goal matcher concluded about a task, and which version did.
    # Existing rows get NULL: never looked at, which the matcher treats as due
    # a lazy first pass rather than as "no goal". See data/sql/tasks.sql.
    ('tasks', 'goal_match_status', 'TEXT'),
    ('tasks', 'goal_match_version', 'INTEGER'),
)

# Tables added to the app after the database was first created.
#
# `_build` runs the seed files once, when there is no database at all, so a new
# `CREATE TABLE IF NOT EXISTS` in data/sql reaches a fresh clone and nothing
# else — the same hole ADDED_COLUMNS exists to patch, one level up.
#
# Every statement here is `IF NOT EXISTS` and is run on each start, which is
# what makes it safe: creating a table that is already there is a no-op, so
# there is no "have I run this yet" flag to get wrong. Additive only, for the
# same reason ADDED_COLUMNS is.
#
# The DDL is a copy of the one in data/sql. The duplication is deliberate: the
# seed file is what a fresh database is built from and has to read as a whole
# schema, and this is what an existing one is caught up with.
ADDED_TABLES = ('''
    CREATE TABLE IF NOT EXISTS goal_milestones (
        id           TEXT PRIMARY KEY,
        goal_id      TEXT NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
        user_id      TEXT NOT NULL,
        title        TEXT NOT NULL,
        note         TEXT DEFAULT '',
        position     INTEGER DEFAULT 0,
        status       TEXT DEFAULT 'pending'
                     CHECK (status IN ('pending', 'active', 'done')),
        target_date  TEXT,
        completed_at TEXT,
        created_at   TEXT
    )
''', '''
    CREATE INDEX IF NOT EXISTS goal_milestones_goal_idx
        ON goal_milestones (goal_id, position)
''', '''
    CREATE TABLE IF NOT EXISTS user_subjects (
        user_id     TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
        subject_id  TEXT NOT NULL,
        name        TEXT NOT NULL DEFAULT '',
        family      TEXT,
        custom      BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, subject_id)
    )
''', '''
    CREATE INDEX IF NOT EXISTS user_subjects_user_idx
        ON user_subjects (user_id)
''', '''
    -- The hall of fame the account writes itself. Mirrors data/sql/records.sql,
    -- which only ever reaches a database that does not exist yet.
    CREATE TABLE IF NOT EXISTS records (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
        kind         TEXT NOT NULL DEFAULT 'record'
                     CHECK (kind IN ('record', 'milestone')),
        name         TEXT NOT NULL DEFAULT '',
        category     TEXT NOT NULL DEFAULT '',
        value        NUMERIC NOT NULL DEFAULT 0,
        target       NUMERIC NOT NULL DEFAULT 0,
        unit         TEXT NOT NULL DEFAULT '',
        note         TEXT NOT NULL DEFAULT '',
        achieved_on  TEXT NOT NULL DEFAULT '',
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
''', '''
    CREATE INDEX IF NOT EXISTS records_user_idx ON records (user_id, kind)
''', '''
    CREATE INDEX IF NOT EXISTS records_name_idx ON records (user_id, name, achieved_on)
''', '''
    -- The last two account-scoped tables with nothing leading on user_id.
    -- Every other one is covered, either by an index written with it or by a
    -- composite primary key that starts with the column (focus_days,
    -- user_achievements). `rows_for` reads through these, so a table without
    -- one falls back to scanning every account's rows to find one account's.
    CREATE INDEX IF NOT EXISTS goal_milestones_user_idx
        ON goal_milestones (user_id, goal_id)
''', '''
    CREATE INDEX IF NOT EXISTS calendar_events_user_idx
        ON calendar_events (user_id, date)
''', '''
    -- One account's whole calendar, as the JSON the views already hold.
    -- Mirrors data/sql/events.sql; see the comment there for why this is a
    -- document and not a table of events. It exists because until now the
    -- calendar was in localStorage and nowhere else, so a cleared browser was
    -- a deleted calendar and the server had no copy to restore from.
    CREATE TABLE IF NOT EXISTS calendar_documents (
        user_id     TEXT PRIMARY KEY REFERENCES users (username) ON DELETE CASCADE,
        data        TEXT NOT NULL DEFAULT '{}',
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
''', '''
    -- The bell's list. Mirrors data/sql/notifications.sql, which only ever
    -- reaches a database that does not exist yet.
    --
    -- `fingerprint` is what makes this a list rather than a firehose: it names
    -- the *situation* ('overdue:2026-09-01'), not the moment, so a sweep that
    -- finds the same situation again inserts nothing. See
    -- backend/tracking/notify.py.
    --
    -- `deleted_at` is why the delete is soft. A deleted row is the memory that
    -- its situation was already answered for, and dropping it outright would
    -- let the next sweep put the same notification straight back — which is
    -- exactly what "delete" has to mean it will not do.
    --
    -- `for_day` is the day a notification is *about*, or '' for one that is
    -- about no particular day. Yesterday's "3 tasks are late" is not news and
    -- is not today's count either, so it retires itself when the day turns.
    CREATE TABLE IF NOT EXISTS notifications (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
        fingerprint  TEXT NOT NULL,
        channel      TEXT NOT NULL DEFAULT 'tasks',
        tone         TEXT NOT NULL DEFAULT 'info',
        title        TEXT NOT NULL DEFAULT '',
        body         TEXT NOT NULL DEFAULT '',
        link         TEXT NOT NULL DEFAULT '',
        for_day      TEXT NOT NULL DEFAULT '',
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        shown_at     TEXT,
        read_at      TEXT,
        deleted_at   TEXT
    )
''', '''
    CREATE UNIQUE INDEX IF NOT EXISTS notifications_print_idx
        ON notifications (user_id, fingerprint)
''', '''
    CREATE INDEX IF NOT EXISTS notifications_live_idx
        ON notifications (user_id, deleted_at)
''', '''
    -- What the analytics recommended, and what came of it.
    --
    -- The one thing the subject page's model layer writes down. Everything
    -- else it produces is prose over figures that are on screen already, and
    -- is deliberately not stored (see backend/tracking/subject_ai.py). A
    -- recommendation is different: whether a kind of session actually moves
    -- this account is a question about the *past*, and a recommendation
    -- nobody kept is one whose effectiveness can never be checked.
    --
    -- `execution_at` is the subject's execution figure on the day the advice
    -- was given, held so the change afterwards can be measured against it
    -- rather than recomputed from a window that has since moved. `taken_at`
    -- and `task_id` are null until the reader acts on it, and a row that
    -- stays null is itself a finding — a plan nobody follows is the wrong
    -- plan. Nothing here is ever rewritten; the outcome is a later column
    -- filled in once, not a replacement row.
    CREATE TABLE IF NOT EXISTS subject_recommendations (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
        subject      TEXT NOT NULL DEFAULT '',
        given_at     TEXT NOT NULL DEFAULT '',
        title        TEXT NOT NULL DEFAULT '',
        focus        TEXT NOT NULL DEFAULT '',
        kind         TEXT NOT NULL DEFAULT '',
        difficulty   INTEGER,
        minutes      INTEGER,
        reason       TEXT NOT NULL DEFAULT '',
        -- What would say this worked, written when the advice was given.
        -- Held rather than re-derived for the same reason `execution_at` is:
        -- a prediction judged against a test invented afterwards is not a
        -- prediction. See backend/tracking/subject_ai.py.
        signal       TEXT NOT NULL DEFAULT '',
        execution_at INTEGER,
        taken_at     TEXT,
        task_id      TEXT
    )
''', '''
    CREATE INDEX IF NOT EXISTS subject_recs_user_idx
        ON subject_recommendations (user_id, subject, given_at DESC)
''', '''
    -- The last reading written for a subject, whole, so the panel survives a
    -- refresh.
    --
    -- `subject_recommendations` above is a ledger and stays one: every step
    -- ever suggested, never rewritten, because the outcome loop is built on
    -- comparing what was advised against what happened afterwards. It cannot
    -- also be the restore point. It holds no diagnosis, no priorities, no
    -- insights and no drills, so a page rebuilt from it would come back
    -- missing three of its four sections and the detail on the fourth.
    --
    -- So this is the other half: one row per subject, replaced each time a
    -- reading is asked for, holding the answer as JSON. Replaced rather than
    -- appended because it is a cache of the current reading rather than a
    -- record of what was said — the record is next door, and it is the one
    -- nothing overwrites.
    -- `span` is stored because the page will not show a reading over figures
    -- it no longer displays. A diagnosis argued from a year, restored onto a
    -- seven-day view, is prose about numbers that are not on screen — the
    -- page already clears a live reading when the window changes, and a
    -- restored one has to obey the same rule.
    CREATE TABLE IF NOT EXISTS subject_readings (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
        subject    TEXT NOT NULL DEFAULT '',
        span       TEXT NOT NULL DEFAULT '',
        written_at TEXT NOT NULL DEFAULT '',
        body       TEXT NOT NULL DEFAULT ''
    )
''', '''
    CREATE UNIQUE INDEX IF NOT EXISTS subject_readings_one_per_subject
        ON subject_readings (user_id, subject)
''', '''
    -- Which goals a task counts toward. Mirrors data/sql/goals.sql, where the
    -- note on what is stored and why lives.
    CREATE TABLE IF NOT EXISTS task_goal_matches (
        task_id  TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
        goal_id  TEXT NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
        user_id  TEXT NOT NULL,
        score    REAL NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 1),
        source   TEXT NOT NULL DEFAULT 'rule'
                 CHECK (source IN ('explicit', 'rule', 'ai')),
        PRIMARY KEY (task_id, goal_id)
    )
''', '''
    CREATE INDEX IF NOT EXISTS task_goal_matches_goal_idx
        ON task_goal_matches (user_id, goal_id)
''')


# Tables whose *constraints* changed, and the DDL to rebuild them with.
#
# ADDED_COLUMNS and ADDED_TABLES are additive and can afford to be: adding a
# column or a table cannot invalidate a row that is already there. A CHECK
# constraint is the one shape change that is not additive and still has to
# happen, because SQLite cannot alter one in place — the table has to be built
# again beside the old one, copied into, and swapped.
#
# That makes this the sharpest tool in the file, so it is deliberately narrow:
#
#   * `test` is what decides whether a rebuild is needed at all. It is asked of
#     the table's stored DDL, so the question is "is this database already the
#     new shape?" rather than "have I run this before?" — there is no flag to
#     get wrong, and running it twice is a no-op exactly as the lists above are.
#   * `columns` is written out rather than taken as `SELECT *`, so a rebuild
#     copies the columns this code knows about and fails loudly rather than
#     silently reordering if the table drifts.
#   * Only a *widening* belongs here. Narrowing a CHECK would delete the rows
#     that no longer pass, which is the data loss ADDED_COLUMNS refuses to
#     carry, and no entry may do it.
REBUILT_TABLES = (
    {
        # The grade CHECK that did not know about 'A+'. See the note in
        # data/sql/analytics.sql: the band has existed in GRADE_BANDS for as
        # long as the scorer has, and every account that scored 96-99 on a
        # metric got a 500 out of /api/get_growth_ratings instead of a report
        # card. Widening the list is the whole fix; nothing else about the
        # table changes.
        'table': 'metric_snapshots',
        'test': lambda ddl: "'A+'" in ddl,
        'columns': ('user_id', 'date', 'metric', 'score', 'grade', 'detail'),
        'create': '''
            CREATE TABLE metric_snapshots (
                user_id  TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
                date     TEXT NOT NULL,
                metric   TEXT NOT NULL CHECK (metric IN ('productivity', 'quality',
                                                         'consistency', 'efficiency',
                                                         'focus', 'overall')),
                score    INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
                grade    TEXT NOT NULL CHECK (grade IN ('S', 'A+', 'A', 'B', 'C', 'D', 'F')),
                detail   TEXT DEFAULT '{}',
                PRIMARY KEY (user_id, date, metric)
            )
        ''',
        'indexes': ('''
            CREATE INDEX IF NOT EXISTS metric_snapshots_user_metric_idx
                ON metric_snapshots (user_id, metric, date DESC)
        ''',),
    },
)


# --------------------------------------------------------------------------
# The connection
# --------------------------------------------------------------------------
def _build(path):
    """Create the database and fill it from data/sql/*.sql."""
    con = sqlite3.connect(path)
    try:
        # The seed inserts rows in file order, and a child file's rows can name
        # a parent that a later file creates. Keys are enforced from the first
        # real connection onward; a one-time build does not need them.
        con.execute('PRAGMA foreign_keys = OFF')
        for name in SCHEMA_FILES:
            sql_file = os.path.join(SQL_DIR, name + '.sql')
            if os.path.exists(sql_file):
                with open(sql_file, 'r') as handle:
                    con.executescript(handle.read())
        con.commit()
    finally:
        con.close()


def _rebuild_table(con, spec):
    """Rebuild one table under a widened constraint, keeping every row.

    A no-op unless `test` says the stored DDL is still the old shape, so this
    runs on every start and does nothing on all but the first.
    """
    row = con.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
        (spec['table'],)).fetchone()
    # No such table: a database built before this part of the app existed.
    # ADDED_TABLES' problem, not this one's.
    if not row or not row[0] or spec['test'](row[0]):
        return False

    table = spec['table']
    columns = ', '.join('"{}"'.format(name) for name in spec['columns'])
    # Foreign keys are off on this connection (only `connect` turns them on),
    # which is what the swap below needs: the table is dropped while other
    # tables still reference it.
    con.execute('ALTER TABLE "{}" RENAME TO "{}__old"'.format(table, table))
    con.execute(spec['create'])
    con.execute('INSERT INTO "{}" ({}) SELECT {} FROM "{}__old"'.format(
        table, columns, columns, table))
    con.execute('DROP TABLE "{}__old"'.format(table))
    # The old table's indexes went with it; the new one's are named the same.
    for statement in spec.get('indexes', ()):
        con.execute(statement)
    return True


def _catch_up(path):
    """Bring an existing database up to the shape the app expects.

    Tables first, then columns, then the constraint rebuilds: a column cannot
    be added to a table that is not there, and a rebuild has to copy the
    columns the two lists above have already put in place.
    """
    con = sqlite3.connect(path)
    try:
        for statement in ADDED_TABLES:
            con.execute(statement)
        for table, column, sql_type in ADDED_COLUMNS:
            columns = con.execute(
                'PRAGMA table_info("{}")'.format(table)).fetchall()
            # No such table: a database built before that part of the app
            # existed at all. Not this list's problem.
            if not columns or any(row[1] == column for row in columns):
                continue
            con.execute('ALTER TABLE "{}" ADD COLUMN "{}" {}'.format(
                table, column, sql_type))
        for spec in REBUILT_TABLES:
            _rebuild_table(con, spec)
        con.commit()
    finally:
        con.close()


def _ensure_database():
    """Build the database the first time anything asks for it."""
    global _built
    if _built:
        return
    with _build_lock:
        if _built:
            return
        directory = os.path.dirname(DB_PATH)
        if directory and not os.path.isdir(directory):
            os.makedirs(directory)
        if not os.path.exists(DB_PATH) or os.path.getsize(DB_PATH) == 0:
            _build(DB_PATH)
        # Run for a fresh build too. It costs one PRAGMA per entry and it
        # means there is one code path that decides what the tables look
        # like, rather than a build that is right and a catch-up that has to
        # be remembered to agree with it.
        _catch_up(DB_PATH)
        _built = True


def connect():
    """A connection to the database, built if it isn't there yet.

    One per call rather than one shared: the dev server is threaded, and a
    SQLite connection belongs to the thread that opened it. Opening the file is
    cheap, and WAL means a reader never blocks on the writer.
    """
    _ensure_database()
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA foreign_keys = ON')
    con.execute('PRAGMA journal_mode = WAL')
    con.execute('PRAGMA synchronous = NORMAL')
    return con


# --------------------------------------------------------------------------
# Columns
# --------------------------------------------------------------------------
def _schema(con, table):
    """[(name, declared type, nullable)] for a table, or [] if there isn't one."""
    rows = con.execute('PRAGMA table_info("{}")'.format(table)).fetchall()
    return [(r['name'], (r['type'] or '').upper(), not r['notnull']) for r in rows]


def _decode(table, column, value, sql_type):
    """One stored value as the app expects to see it."""
    if value is None:
        return None
    if (table, column) in JSON_COLUMNS:
        try:
            return json.loads(value)
        except (ValueError, TypeError):
            # See SCALAR_JSON_COLUMNS: `{}` is the right empty for a column
            # whose readers want an object, and the wrong one for a column
            # whose readers want a word.
            if (table, column) in SCALAR_JSON_COLUMNS:
                return value
            return {}
    # SQLite keeps booleans as 0 and 1; the app and its JSON responses want
    # real booleans.
    if sql_type == 'BOOLEAN':
        return bool(value)
    return value


def _encode(table, column, value):
    """One app value as something SQLite can store."""
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (dict, list)):
        return json.dumps(value, sort_keys=True)
    if (table, column) in JSON_COLUMNS and value is not None:
        return json.dumps(value, sort_keys=True)
    return value


# --------------------------------------------------------------------------
# Reading and writing a table
# --------------------------------------------------------------------------
def read_table(table):
    """Every row in a table, in the order they were written.

    Columns that are NULL are left out of the dict rather than set to None —
    see the note at the top of this module.
    """
    con = connect()
    try:
        columns = _schema(con, table)
        if not columns:
            return []
        types = {name: sql_type for name, sql_type, _ in columns}
        rows = []
        for record in con.execute('SELECT * FROM "{}" ORDER BY rowid'.format(table)):
            row = {}
            for name in record.keys():
                value = record[name]
                if value is not None:
                    row[name] = _decode(table, name, value, types.get(name, ''))
            rows.append(row)
        return rows
    finally:
        con.close()


def write_table(table, rows, columns=None):
    """Replace a table's rows with `rows`, all or nothing.

    The whole table is rewritten because that is what every caller wants: they
    read the rows, change one, and hand the list back. It runs inside a single
    transaction, so a reader either sees all of the old rows or all of the new.

    Foreign keys are off while the rows are swapped, and this is not optional.
    Every table that belongs to an account declares ON DELETE CASCADE, so
    clearing `users` for a rewrite would take that account's tasks, goals and
    XP with it — and `refresh_streak` rewrites `users` on every page load. The
    rows are being replaced, not deleted, so the cascade must not fire. What
    the keys are actually for is still checked, on the way out: once the new
    rows are in, every reference this table makes has to point at something
    real, or the whole write is rolled back.
    """
    con = connect()
    try:
        schema = _schema(con, table)
        if not schema:
            return
        wanted = set(columns) if columns else None
        fields = [(name, nullable) for name, _, nullable in schema
                  if wanted is None or name in wanted]

        statements = []
        for row in rows:
            # A missing value is stored as NULL where the column allows one, so
            # it reads back missing. Where it doesn't, the column is left out
            # and its DEFAULT stands in.
            present = [(name, nullable) for name, nullable in fields
                       if name in row or nullable]
            names = [name for name, _ in present]
            values = [_encode(table, name, row.get(name)) for name in names]
            statements.append((
                'INSERT INTO "{}" ({}) VALUES ({})'.format(
                    table,
                    ', '.join('"{}"'.format(n) for n in names),
                    ', '.join('?' for _ in names)),
                values))

        # Has to be set before the transaction opens; inside one it does
        # nothing.
        con.execute('PRAGMA foreign_keys = OFF')
        try:
            with con:
                con.execute('DELETE FROM "{}"'.format(table))
                for sql, values in statements:
                    con.execute(sql, values)
                broken = con.execute(
                    'PRAGMA foreign_key_check("{}")'.format(table)).fetchall()
                if broken:
                    raise sqlite3.IntegrityError(
                        '{} rows in {} reference a row that does not exist'
                        .format(len(broken), table))
        finally:
            con.execute('PRAGMA foreign_keys = ON')
    finally:
        con.close()


# --------------------------------------------------------------------------
# Reading and writing one row
# --------------------------------------------------------------------------
# `read_table` + `write_table` is the pair the whole backend was built on, and
# it is the wrong pair for a change to a single row. A caller that reads every
# task, sets one field and hands the list back makes the database do this:
#
#     SELECT * FROM tasks            -- 10,660 rows into Python
#     DELETE FROM tasks              -- all of them
#     INSERT INTO tasks ...          -- 10,660 times
#
# measured at 245 ms on this database for one checkbox. Three things are wrong
# with it and only the first is speed:
#
#   * **It scales with everybody's data, not yours.** The tables are shared, so
#     one account ticking off a task rewrites every account's rows. Ten users
#     and the cost is ten times, for the same click.
#   * **It loses writes.** Two requests read the table, each changes a
#     different row, each writes the whole thing back. The second overwrites
#     the first with a copy that predates it. Nothing errors; the change is
#     simply gone. Two devices, or two tabs, is enough.
#   * **It makes deleting feel expensive**, so code stops doing it — which is
#     how `user_achievements` came to hold rows for badges the catalogue
#     dropped, and how "71 earned" ended up over a wall of 68.
#
# The five below are the targeted versions. They are additive: `write_table`
# stays for the callers that genuinely replace a whole table (the catalogue
# sync, the settings reset), and every caller that changes one row moves to
# these. `_encode` and the missing-key rules are shared with `write_table`, so
# a row written by either reads back the same.


def _columns_for(con, table, row):
    """The columns of `table` that `row` has something to say about.

    For UPDATE, where the dict is a list of changes: a key that is not there is
    a column this write is not about, and is left alone.
    """
    schema = _schema(con, table)
    return [name for name, _, _ in schema if name in row]


def _insert_columns(con, table, row):
    """The columns an INSERT of `row` names — `write_table`'s rule, exactly.

    A key the row does not have is stored as NULL where the column allows one,
    so it reads back missing, and is left out where it does not so the column's
    DEFAULT stands in. That is the convention the whole backend reads by (see
    the note at the top of this module), and the two write paths have to agree
    on it or a row's shape would depend on which function wrote it — an
    `insert_row` task getting `priority: 'medium'` from a DEFAULT where a
    `write_table` one got NULL and read back with no priority at all.
    """
    return [name for name, _, nullable in _schema(con, table)
            if name in row or nullable]


#: How many times `insert_row` will step a colliding id before giving up.
#: Reached only if the same millisecond is contended by more than this many
#: writers at once, which is not a situation a bigger number rescues.
ID_RETRIES = 25


def insert_row(table, row, key='id'):
    """Add one row. Returns the row, with `key` set to the id actually used.

    The whole-table version of this appended to a list and rewrote everything;
    this is the INSERT that was always underneath it.

    A duplicate primary key is retried rather than raised, because ids are
    millisecond timestamps and two writers in the same millisecond is a normal
    thing rather than an error — see `new_id`. Any other IntegrityError is a
    real constraint being violated and is left to raise.
    """
    con = connect()
    try:
        names = _insert_columns(con, table, row)
        if not names:
            return row
        sql = 'INSERT INTO "{}" ({}) VALUES ({})'.format(
            table,
            ', '.join('"{}"'.format(n) for n in names),
            ', '.join('?' for _ in names))

        for _ in range(ID_RETRIES):
            try:
                with con:
                    con.execute(sql, [_encode(table, n, row.get(n)) for n in names])
                return row
            except sqlite3.IntegrityError as clash:
                collided = ('UNIQUE constraint failed' in str(clash)
                            and key in names
                            and str(row.get(key, '')).isdigit())
                if not collided:
                    raise
                row[key] = str(int(row[key]) + 1)
                with _id_lock:
                    _last_id[table] = max(_last_id.get(table, 0), int(row[key]))
        raise sqlite3.IntegrityError(
            'could not find a free {}.{} after {} tries'.format(
                table, key, ID_RETRIES))
    finally:
        con.close()


def update_row(table, row_id, changes, user_id=None, key='id'):
    """Change some columns of one row. Returns True if a row was changed.

    `user_id` is the ownership check and is not optional in spirit: an UPDATE
    matched on id alone will happily edit somebody else's row, which is the
    same hole the API had before backend/api/guard.py. Pass it wherever the
    table has the column, and the WHERE clause carries it.

    A `changes` value of None writes NULL, which is how a field is cleared —
    unlike `read_table`, where a missing key means the column was NULL. The
    difference is deliberate: this says what to change, not what the row is.
    """
    if not changes:
        return False
    con = connect()
    try:
        names = _columns_for(con, table, changes)
        if not names:
            return False
        clause = 'WHERE "{}" = ?'.format(key)
        params = [_encode(table, n, changes.get(n)) for n in names] + [row_id]
        if user_id is not None:
            clause += ' AND user_id = ?'
            params.append(user_id)
        with con:
            cursor = con.execute(
                'UPDATE "{}" SET {} {}'.format(
                    table, ', '.join('"{}" = ?'.format(n) for n in names), clause),
                params)
        return cursor.rowcount > 0
    finally:
        con.close()


def add_to_row(table, row_id, deltas, changes=None, user_id=None, key='id'):
    """Add to some columns of one row, in SQL. Returns the row after the write.

    `UPDATE ... SET xp = COALESCE(xp, 0) + ?` rather than reading the value,
    adding to it in Python and writing it back. The difference only shows under
    load, and then it is the whole ballgame: thirty task completions arriving
    at once each read `tasks_completed` as 4,120 and each wrote 4,121, so
    twenty-nine of them vanished. Measured, on this database, before this
    existed — the ledger got all thirty rows, because appending is safe, and
    the counter on the account moved by one.

    `changes` is for the fields that are set rather than accumulated — the
    streak, the level, `last_task_date` — and is applied in the same statement
    so the row is never half-written. Those still race in the sense that the
    last writer wins, but a streak is a value derived from a date rather than a
    running total, so two writers agreeing on it is the correct outcome.
    """
    if not deltas and not changes:
        return None
    con = connect()
    try:
        names = _columns_for(con, table, deltas)
        setters = ['"{0}" = COALESCE("{0}", 0) + ?'.format(n) for n in names]
        params = [deltas[n] for n in names]

        for name in _columns_for(con, table, changes or {}):
            setters.append('"{}" = ?'.format(name))
            params.append(_encode(table, name, changes[name]))

        if not setters:
            return None
        clause = 'WHERE "{}" = ?'.format(key)
        params.append(row_id)
        if user_id is not None:
            clause += ' AND user_id = ?'
            params.append(user_id)
        with con:
            con.execute('UPDATE "{}" SET {} {}'.format(
                table, ', '.join(setters), clause), params)
    finally:
        con.close()
    return find_row(table, row_id, user_id=user_id, key=key)


def delete_row(table, row_id, user_id=None, key='id'):
    """Remove one row. Returns True if there was one to remove.

    Scoped by `user_id` for the reason `update_row` gives.
    """
    con = connect()
    try:
        clause = 'WHERE "{}" = ?'.format(key)
        params = [row_id]
        if user_id is not None:
            clause += ' AND user_id = ?'
            params.append(user_id)
        with con:
            cursor = con.execute(
                'DELETE FROM "{}" {}'.format(table, clause), params)
        return cursor.rowcount > 0
    finally:
        con.close()


def _decode_records(con, table, records):
    """Cursor rows as the app expects to see them.

    Split out of `rows_for` because the scoped task reads further down answer a
    different WHERE clause but must hand back rows in exactly the same shape —
    same decoding, same dropping of NULLs. Two copies of this loop would be two
    places for a BOOLEAN to start arriving as a 0.
    """
    columns = _schema(con, table)
    if not columns:
        return []
    types = {name: sql_type for name, sql_type, _ in columns}
    rows = []
    for record in records:
        row = {}
        for name in record.keys():
            value = record[name]
            if value is not None:
                row[name] = _decode(table, name, value, types.get(name, ''))
        rows.append(row)
    return rows


def rows_for(table, user_id, order='rowid'):
    """Every row of `table` belonging to one account, in written order.

    The filter the callers were all doing in Python after reading the whole
    table. In SQL it uses the `user_id` index, so the cost is this account's
    rows rather than everybody's.
    """
    con = connect()
    try:
        if not _schema(con, table):
            return []
        query = 'SELECT * FROM "{}" WHERE user_id = ? ORDER BY {}'.format(table, order)
        return _decode_records(con, table, con.execute(query, (user_id,)))
    finally:
        con.close()


def columns_for(table, user_id, columns, order='rowid'):
    """`rows_for`, but only the named columns.

    For a caller that reads a handful of fields off every row of a big table.
    The analytics page is the one that needed it: it walks every task the
    account owns and reads sixteen fields, one of which — `description` — is
    unbounded free text that nothing on that page ever looks at. Selecting the
    sixteen leaves the descriptions in the database rather than sending them to
    a browser that will drop them.

    Names are checked against the live schema rather than trusted, for two
    reasons that both matter. It is a table name and column names going into
    an f-string, so an unchecked list is an injection; and a deployment whose
    `tasks` table predates a column would otherwise take an OperationalError
    where the honest answer is a row without that field. Unknown names are
    dropped, which is exactly what `_decode_records` already does with a NULL.
    """
    con = connect()
    try:
        schema = _schema(con, table)
        if not schema:
            return []
        known = {name for name, _, _ in schema}
        wanted = [name for name in columns if name in known]
        if not wanted:
            return []
        query = 'SELECT {} FROM "{}" WHERE user_id = ? ORDER BY {}'.format(
            ', '.join('"{}"'.format(name) for name in wanted), table, order)
        return _decode_records(con, table, con.execute(query, (user_id,)))
    finally:
        con.close()


def series_signature(user_id):
    """A cheap reading of everything the growth series is folded out of.

    Four scalars in one round trip, for `series` in backend/tracking/growth.py
    to compare against the value its cached rows were built from. ~1ms against
    the ~49ms the series costs to build, which is the whole point of it.

    Sums rather than counts where a row can change without being added: editing
    a task's rating moves its day's quality and changes no count, and a focus
    session lengthening a day already on the ledger does the same. A count
    alone would serve a chart that silently stopped updating.
    """
    con = connect()
    try:
        parts = []
        for table, expression, clause in (
            ('xp_events', 'COUNT(*) || "/" || CAST(COALESCE(SUM(amount), 0) AS INTEGER)', '1'),
            ('focus_days', 'COUNT(*) || "/" || CAST(COALESCE(SUM(seconds), 0) AS INTEGER)', '1'),
            # Only the rated, finished rows reach the series, so only their
            # count and the sum of what they are rated matter here.
            ('tasks',
             'COUNT(*) || "/" || CAST(COALESCE(SUM(difficulty * execution), 0) AS INTEGER)',
             "status = 'done' AND difficulty BETWEEN 1 AND 5 AND execution BETWEEN 1 AND 5"),
        ):
            if not _schema(con, table):
                parts.append('-')
                continue
            row = con.execute(
                'SELECT {} AS sig FROM "{}" WHERE user_id = ? AND {}'.format(
                    expression, table, clause),
                (user_id,)).fetchone()
            parts.append(str(row['sig'] if row else ''))
        return ':'.join(parts)
    finally:
        con.close()


def rated_days_for(user_id):
    """Per-day quality, difficulty and execution, aggregated by SQLite.

    `{day: {rated_tasks, quality_score, avg_difficulty, avg_execution}}` — the
    same map `_ratings_by_day` in backend/tracking/growth.py used to build by
    pulling every task the account owns into Python and looping.

    ## Why it moved down here

    That loop read `tasks_for`, which is every column of every row — including
    `description`, unbounded free text that this calculation does not look at.
    On the largest account in this database it was 90ms of the 141ms the whole
    growth series took, to produce about 1,800 rows of output from 20,000 rows
    of input. Aggregating where the rows already are is ~5ms.

    ## The rule is the same rule

    Both halves or neither, each between 1 and 5 — that is `rating_of` in
    backend/tracking/analytics.py, which is the authority on what counts as
    rated and stays the authority for every other caller. The WHERE clause here
    is that function, in SQL, and tests/test_report_card.py holds the two to the
    same answer.

    Written out rather than derived from it because a predicate cannot be
    shared across that boundary: one is a Python function over a dict and the
    other is a string SQLite parses. What can be shared is the test.
    """
    con = connect()
    try:
        if not _schema(con, 'tasks'):
            return {}
        rows = con.execute(
            "SELECT substr(completed_at, 1, 10) AS day, "
            '       COUNT(*) AS rated, '
            '       AVG(difficulty * execution) AS quality, '
            '       AVG(difficulty) AS difficulty, '
            '       AVG(execution) AS execution '
            'FROM tasks '
            "WHERE user_id = ? AND status = 'done' "
            "  AND completed_at IS NOT NULL AND completed_at != '' "
            '  AND difficulty BETWEEN 1 AND 5 '
            '  AND execution BETWEEN 1 AND 5 '
            'GROUP BY day',
            (user_id,)).fetchall()

        # Rounded here to the same places the Python version rounded to, so the
        # numbers on the chart do not move by a tenth when this lands.
        return {
            row['day']: {
                'rated_tasks': row['rated'],
                'quality_score': round(row['quality'], 1),
                'avg_difficulty': round(row['difficulty'], 1),
                'avg_execution': round(row['execution'], 1),
            }
            for row in rows if row['day']
        }
    finally:
        con.close()


def columns_table_for(table, user_id, columns, order='rowid'):
    """`columns_for`, as columns rather than as rows.

    Returns `(fields, rows)` — the field names once, and a list of value lists
    in that order. The same data `columns_for` returns and the same query
    behind it; what changes is the shape it is serialised in.

    ## Why this exists

    Measured on the largest account in this database — 20,538 tasks, the
    sixteen fields in ANALYTICS_TASK_FIELDS:

        one object per row    5.99 MB
        the field names alone 4.00 MB      (67% of it)
        as columns            3.44 MB      (57% of the original)

    Two thirds of what that endpoint sent was the string "completed_at" and
    fifteen others, repeated twenty thousand times. JSON has no way to say a
    key once, so the only way to stop paying for it is not to send objects.

    It parses about twice as fast on the client for the same reason — half the
    tokens, and no per-row object allocation during the parse.

    ## Why not something cleverer

    Dropping nulls, interning the repeated `subject` and `priority` values, or
    delta-encoding the dates would each save a little more and each needs a
    matching decoder that can be wrong. This one has a decoder that cannot: zip
    the names against each row. See `rehydrate` in
    frontend/src/services/analytics.ts.
    """
    con = connect()
    try:
        schema = _schema(con, table)
        if not schema:
            return [], []
        known = {name for name, _, _ in schema}
        wanted = [name for name in columns if name in known]
        if not wanted:
            return [], []
        query = 'SELECT {} FROM "{}" WHERE user_id = ? ORDER BY {}'.format(
            ', '.join('"{}"'.format(name) for name in wanted), table, order)
        records = _decode_records(con, table, con.execute(query, (user_id,)))
        # Decoded through the same path as `columns_for`, so a JSON column or a
        # stored boolean arrives as whatever the app expects rather than as
        # whatever SQLite happened to hold. The transposition is the only
        # difference between the two functions.
        return wanted, [[row.get(name) for name in wanted] for row in records]
    finally:
        con.close()


def find_row(table, row_id, user_id=None, key='id'):
    """One row by id, scoped to an account when one is given, or None."""
    con = connect()
    try:
        columns = _schema(con, table)
        if not columns:
            return None
        types = {name: sql_type for name, sql_type, _ in columns}
        query = 'SELECT * FROM "{}" WHERE "{}" = ?'.format(table, key)
        params = [row_id]
        if user_id is not None:
            query += ' AND user_id = ?'
            params.append(user_id)
        record = con.execute(query, params).fetchone()
        if record is None:
            return None
        row = {}
        for name in record.keys():
            value = record[name]
            if value is not None:
                row[name] = _decode(table, name, value, types.get(name, ''))
        return row
    finally:
        con.close()


#: The last id handed out per table, so two callers in the same millisecond
#: cannot be handed the same one. Guarded by `_id_lock`.
_last_id = {}
_id_lock = threading.Lock()


def new_id(table):
    """A fresh id for `table`: the current millisecond, stepped past collisions.

    Ids are millisecond timestamps, and two rows created inside the same
    millisecond would collide on the primary key. Stepping forward keeps ids
    ordered, which `last_task_completion` relies on.

    ## Why this holds a lock

    It used to be a `SELECT id` and a step past what it found, with no memory
    between calls — so two requests arriving in the same millisecond read the
    same set, stepped to the same free value, and were both handed it. Under
    `write_table` that ended as a silent lost update: each rewrote the whole
    table from its own copy and the later write won. It is visible now only
    because `insert_row` INSERTs, and an INSERT of a duplicate primary key
    raises rather than quietly winning.

    The lock fixes the requests inside one process. `insert_row` retries on a
    collision, which covers the rest — a second worker, or the first call after
    a restart, when `_last_id` is empty and the table is the only memory.
    """
    with _id_lock:
        con = connect()
        try:
            if not _schema(con, table):
                highest = 0
            else:
                row = con.execute(
                    'SELECT MAX(CAST(id AS INTEGER)) FROM "{}"'.format(table)
                ).fetchone()
                highest = int(row[0] or 0)
        finally:
            con.close()

        stamp = int(datetime.now().timestamp() * 1000)
        # Past the highest id in the table and past the last one this process
        # handed out, whichever is further along.
        floor = max(highest, _last_id.get(table, 0))
        if stamp <= floor:
            stamp = floor + 1
        _last_id[table] = stamp
        return str(stamp)


# --------------------------------------------------------------------------
# One load/save pair per store
# --------------------------------------------------------------------------
def users():
    return read_table('users')


def save_users(rows):
    write_table('users', rows)


def save_user(user):
    """Write back one account row, matched on its id.

    The pair above rewrote the whole users table, and `refresh_streak` calls
    into it on every page load — so a page view cost one DELETE and one INSERT
    per account in the system, and two people loading a page at the same
    moment could each write a copy of the table that predated the other.

    Matched on `id`, and **`username` is never written here**. Every
    account-owned table has a foreign key onto `users.username`, and SQLite
    refuses an UPDATE that moves a parent key out from under a child row. That
    is why `write_table` turns foreign keys off for its swap, and it is why
    renaming an account is `tracking.auth.rename_user`'s job and not this
    function's — it moves the children across too. Leaving the column out here
    means an ordinary save can never trip over it.

    Only the keys the dict carries are written. A field is cleared by setting
    it to None, not by deleting the key — `read_table` leaves NULL columns out
    of the dict, so a missing key means "was already NULL" and must not be
    read as "set this to NULL".
    """
    if not user or not user.get('id'):
        return False
    changes = {k: v for k, v in user.items() if k not in ('id', 'username')}
    return update_row('users', user['id'], changes)


def tasks():
    return read_table('tasks')


def save_tasks(rows):
    write_table('tasks', rows)


def tasks_for(username):
    """One account's tasks. See `rows_for`."""
    return rows_for('tasks', username)


def save_task(task, username):
    """Write back one task, scoped to its owner."""
    changes = {k: v for k, v in task.items() if k != 'id'}
    return update_row('tasks', task['id'], changes, user_id=username)


# --------------------------------------------------------------------------
# Asking about the tasks without reading them
# --------------------------------------------------------------------------
# The two questions the top bar asks on every page. Both used to be answered in
# the browser, by filtering the account's entire task list — which is why the
# bar needed that list at all, and why every page paid megabytes to render a
# bell and a search box. In SQL they are an aggregate and a LIMIT 8.
#
# The day is passed in rather than computed here. Stored stamps are local ISO
# text with no zone (see backend/tracking/xp.py), so "today" is the caller's
# day, and the caller is the only one who knows it.


def task_alert_counts(username, day):
    """What the top bar's bell needs, as four numbers and two titles.

    Answers three questions in one round trip: how many open tasks are past
    their date (and the oldest one's title), how many are due today (and one
    title), and whether anything at all was finished today — the last being
    what decides whether a live streak is still at risk.

    Titles come back with the counts because the panel shows one of each, and
    a second query to fetch two strings would be the same round trip twice.
    """
    con = connect()
    try:
        if not _schema(con, 'tasks'):
            return {'late': 0, 'late_title': None,
                    'due_today': 0, 'due_today_title': None,
                    'finished_today': False}

        # substr(due_date, 1, 10) rather than date(due_date): the column holds
        # either a bare day or a full stamp, and substr treats both the same
        # way the client's .slice(0, 10) always has.
        late = con.execute(
            'SELECT COUNT(*) AS n, MIN(substr(due_date, 1, 10)) AS oldest '
            'FROM tasks WHERE user_id = ? AND status != ? '
            "AND substr(due_date, 1, 10) != '' AND substr(due_date, 1, 10) < ?",
            (username, 'done', day)).fetchone()

        late_title = None
        if late['n']:
            row = con.execute(
                'SELECT title FROM tasks WHERE user_id = ? AND status != ? '
                'AND substr(due_date, 1, 10) = ? ORDER BY rowid LIMIT 1',
                (username, 'done', late['oldest'])).fetchone()
            late_title = row['title'] if row else None

        due = con.execute(
            'SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status != ? '
            'AND substr(due_date, 1, 10) = ?',
            (username, 'done', day)).fetchone()

        due_title = None
        if due['n']:
            row = con.execute(
                'SELECT title FROM tasks WHERE user_id = ? AND status != ? '
                'AND substr(due_date, 1, 10) = ? ORDER BY rowid LIMIT 1',
                (username, 'done', day)).fetchone()
            due_title = row['title'] if row else None

        finished = con.execute(
            'SELECT 1 FROM tasks WHERE user_id = ? AND status = ? '
            'AND substr(completed_at, 1, 10) = ? LIMIT 1',
            (username, 'done', day)).fetchone()

        return {
            'late': late['n'] or 0,
            'late_title': late_title,
            'due_today': due['n'] or 0,
            'due_today_title': due_title,
            'finished_today': finished is not None,
        }
    finally:
        con.close()


def search_tasks(username, needle, limit=8, open_only=False):
    """One account's tasks whose title contains `needle`, unfinished first.

    The ordering is the one the search panel has always applied after
    downloading everything: a search on a to-do list is nearly always somebody
    looking for something they still have to do.

    `open_only` takes that from an ordering to a rule. The top bar's search
    passes it, because what that panel does with a result is take the reader
    to it — and a finished task is not somewhere anybody needs taking. It is a
    parameter rather than the behaviour because the endpoint is a title search
    and a caller wanting the whole record is entitled to it.

    An empty needle matches nothing rather than everything — the panel shows no
    results until something is typed, and a LIKE '%%' here would mean the one
    query in the app that returns the whole table.
    """
    needle = (needle or '').strip()
    if not needle:
        return []

    con = connect()
    try:
        if not _schema(con, 'tasks'):
            return []
        # ESCAPE, so a title search for "50%" is a search for "50%" rather than
        # a wildcard that matches every row in the table.
        pattern = '%' + needle.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        query = (
            'SELECT * FROM tasks WHERE user_id = ? '
            "AND lower(title) LIKE lower(?) ESCAPE '\\' ")
        params = [username, pattern]
        if open_only:
            query += 'AND status != ? '
            params.append('done')
        query += 'ORDER BY (status = ?), rowid LIMIT ?'
        params.extend(['done', int(limit)])
        return _decode_records(con, 'tasks', con.execute(query, params))
    finally:
        con.close()


def goals():
    return read_table('goals')


def save_goals(rows):
    write_table('goals', rows)


def goal_milestones():
    return read_table('goal_milestones')


def save_goal_milestones(rows):
    write_table('goal_milestones', rows)


# --------------------------------------------------------------------------
# Which goals a task counts toward — see backend/goal_matcher
# --------------------------------------------------------------------------
# SQLite's limit on bound parameters is far above this, but an IN list the
# size of a whole task history is a statement nobody should be building.
_IN_CHUNK = 500


def save_goal_mapping(username, task_id, status, version, matches):
    """Replace one task's goal matches and its match status, in one go.

    `matches` is [(goal_id, score, source)]. Each row is inserted only if the
    goal exists and is this account's, checked by the INSERT itself, so a goal
    deleted a moment ago is skipped rather than raising, and another account's
    goal id can never be linked. A 'matched' status left with no rows after
    that becomes 'unmatched' — the one honest answer when every goal it named
    has gone.

    Returns the goal ids actually kept, in the order given, or None when the
    task is not this account's.
    """
    con = connect()
    try:
        with con:
            owned = con.execute(
                'SELECT 1 FROM tasks WHERE id = ? AND user_id = ?',
                (task_id, username)).fetchone()
            if not owned:
                return None
            con.execute('DELETE FROM task_goal_matches WHERE task_id = ?', (task_id,))
            kept = []
            for goal_id, score, source in matches:
                inserted = con.execute(
                    'INSERT OR IGNORE INTO task_goal_matches '
                    '(task_id, goal_id, user_id, score, source) '
                    'SELECT ?, id, user_id, ?, ? FROM goals WHERE id = ? AND user_id = ?',
                    (task_id, score, source, goal_id, username)).rowcount
                if inserted:
                    kept.append(goal_id)
            if status == 'matched' and not kept:
                status = 'unmatched'
            con.execute(
                'UPDATE tasks SET goal_match_status = ?, goal_match_version = ? '
                'WHERE id = ? AND user_id = ?',
                (status, version, task_id, username))
        return kept
    finally:
        con.close()


def goal_mappings_for(username, task_ids):
    """{task_id: (status, version, [(goal_id, score, source)])} for these tasks.

    Only tasks that have been through the matcher at all appear; one that
    never has is absent, which is different from 'unmatched'. Rows naming a
    goal that no longer exists are left out by the join — `write_table` can
    remove a goal with foreign keys off, and a stale id must read as nothing
    rather than as a goal.
    """
    ids = list(dict.fromkeys(str(task_id) for task_id in task_ids if task_id))
    out = {}
    if not ids:
        return out
    con = connect()
    try:
        for at in range(0, len(ids), _IN_CHUNK):
            chunk = ids[at:at + _IN_CHUNK]
            marks = ', '.join('?' for _ in chunk)
            for row in con.execute(
                    'SELECT id, goal_match_status, goal_match_version FROM tasks '
                    'WHERE user_id = ? AND goal_match_status IS NOT NULL '
                    'AND id IN ({})'.format(marks), [username] + chunk):
                out[row['id']] = (row['goal_match_status'], row['goal_match_version'] or 0, [])
            for row in con.execute(
                    'SELECT m.task_id, m.goal_id, m.score, m.source '
                    'FROM task_goal_matches m '
                    'JOIN goals g ON g.id = m.goal_id AND g.user_id = m.user_id '
                    'WHERE m.user_id = ? AND m.task_id IN ({})'.format(marks),
                    [username] + chunk):
                held = out.get(row['task_id'])
                if held is not None:
                    held[2].append((row['goal_id'], row['score'], row['source']))
        return out
    finally:
        con.close()


def xp_events():
    return read_table('xp_events')


def save_xp_events(rows):
    write_table('xp_events', rows)


def calendar_entries():
    return read_table('calendar_entries')


def save_calendar_entries(rows):
    write_table('calendar_entries', rows)


def calendar_document(username):
    """One account's whole calendar, as the dict the client keeps.

    `{}` when the account has never saved one — which, until this table
    existed, was every account: the views wrote localStorage and nothing else.
    A caller cannot tell "never saved" from "saved an empty calendar", and does
    not need to; both mean there is nothing on the server to show.
    """
    con = connect()
    try:
        if not _schema(con, 'calendar_documents'):
            return {}
        row = con.execute(
            'SELECT data FROM calendar_documents WHERE user_id = ?',
            (username,)).fetchone()
        if not row or not row['data']:
            return {}
        try:
            parsed = json.loads(row['data'])
        except (ValueError, TypeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}
    finally:
        con.close()


def save_calendar_document(username, data):
    """Replace one account's calendar with `data`.

    A whole-document write, because that is how the client holds it: the views
    keep one object and re-save it after every edit. Upserted on `user_id`, so
    an account has exactly one and there is no create/update decision for a
    caller to get wrong.
    """
    con = connect()
    try:
        con.execute(
            'INSERT INTO calendar_documents (user_id, data, updated_at) '
            "VALUES (?, ?, datetime('now')) "
            'ON CONFLICT(user_id) DO UPDATE SET '
            "data = excluded.data, updated_at = datetime('now')",
            (username, json.dumps(data, sort_keys=True)))
        con.commit()
        return True
    finally:
        con.close()


def calendar_events():
    return read_table('calendar_events')


def save_calendar_events(rows):
    write_table('calendar_events', rows)


def focus_days():
    return read_table('focus_days')


def save_focus_days(rows):
    write_table('focus_days', rows)


def day_focus_notes():
    return read_table('day_focus_notes')


def save_day_focus_notes(rows):
    write_table('day_focus_notes', rows)


def metric_snapshots():
    return read_table('metric_snapshots')


def save_metric_snapshots(rows):
    write_table('metric_snapshots', rows)


def user_subjects():
    """What each account has changed about the subject catalogue.

    One row per (account, subject): a subject the account invented, or a
    colour it chose for one of the hundred. See data/sql/subjects.sql for why
    those are one table rather than two.
    """
    return read_table('user_subjects')


def save_user_subjects(rows):
    write_table('user_subjects', rows)


def event_colors():
    """Every colour handed out, as `{color, claimed_week}` in assignment order.

    `claimed_week` is an ISO week — "2026-W33" — and is absent on rows written
    before colours were dated. The caller decides what to do with an undated
    row; see backend/tracking/event.py, which treats it as expired.
    """
    return [r for r in read_table('event_colors') if r.get('color')]


def save_event_colors(rows):
    """Replace the colour table. Rows are `{color, claimed_week}` dicts."""
    write_table(
        'event_colors',
        [{'color': r['color'], 'claimed_week': r.get('claimed_week')} for r in rows],
        columns=['color', 'claimed_week'],
    )


def notes():
    return read_table('notes')


def save_notes(rows):
    write_table('notes', rows)


def records():
    return read_table('records')


def save_records(rows):
    write_table('records', rows)


def user_settings():
    return read_table('user_settings')


def save_user_settings(rows):
    write_table('user_settings', rows)


def user_setting(username, key):
    """One account's value for one key, already decoded, or None.

    `value` is in JSON_COLUMNS, so what comes back is whatever was stored —
    usually a dict. None means the account has never set this key, which is a
    real answer and is not the same as an empty one: the analytics page shows a
    new reader the baseline setup screen precisely because the key is absent.
    """
    for row in read_table('user_settings'):
        if row.get('user_id') == username and row.get('key') == key:
            return row.get('value')
    return None


def set_user_setting(username, key, value):
    """Write one account's value for one key, replacing any previous one.

    The whole table is rewritten because that is what `write_table` does and
    what every other saver here relies on — see the note on it. The table holds
    one short row per preference per account, so the cost of the rewrite is not
    a consideration at this size.
    """
    rows = [row for row in read_table('user_settings')
            if not (row.get('user_id') == username and row.get('key') == key)]
    rows.append({'user_id': username, 'key': key, 'value': value})
    write_table('user_settings', rows, columns=['user_id', 'key', 'value'])
    return value


# --------------------------------------------------------------------------
# Notifications
# --------------------------------------------------------------------------
# The one table in the app the reader does not create rows in. Every row is
# written by the sweep in backend/tracking/notify.py, keyed on a fingerprint
# that names the situation rather than the moment, and removed by the reader
# clicking the ✕ on it.
#
# Written out here rather than through `read_table` / `write_table` for two
# reasons the generic pair cannot serve: the insert has to be an INSERT OR
# IGNORE on the fingerprint (that dedupe *is* the feature), and every read is
# scoped by `deleted_at` as well as `user_id`, which `rows_for` does not do.
#
# The delete is soft. See data/sql/notifications.sql for why it has to be.

#: How long a thrown-away notification is remembered. Long enough that no
#: fingerprint it could block is still live — the day-scoped ones age out in a
#: day, and the rest name a thing that happens once (a level, a badge, a goal's
#: deadline) — and short enough that the table does not accumulate forever.
TOMBSTONE_DAYS = 60

#: The most live rows one account keeps. The bell is a list of what is worth
#: acting on now, not an archive; past this the oldest are dropped outright.
NOTIFICATION_CAP = 60

NOTIFICATION_COLUMNS = (
    'id', 'user_id', 'fingerprint', 'channel', 'tone', 'title', 'body',
    'link', 'for_day', 'created_at', 'shown_at', 'read_at', 'deleted_at',
)


def notifications_for(username, channels=None):
    """One account's live notifications, newest first.

    `channels` filters to the ones whose switch in Settings is on. Passing an
    empty collection is a real answer — every channel is off — and returns
    nothing, which is not the same as passing None for "no filter".
    """
    con = connect()
    try:
        if not _schema(con, 'notifications'):
            return []
        sql = ('SELECT * FROM notifications '
               'WHERE user_id = ? AND deleted_at IS NULL')
        params = [username]
        if channels is not None:
            channels = list(channels)
            if not channels:
                return []
            sql += ' AND channel IN ({})'.format(
                ', '.join('?' for _ in channels))
            params.extend(channels)
        sql += ' ORDER BY rowid DESC LIMIT ?'
        params.append(NOTIFICATION_CAP)
        return _decode_records(con, 'notifications', con.execute(sql, params))
    finally:
        con.close()


def badge_signature(username):
    """A cheap reading of everything a badge could be earned off.

    Seven scalar aggregates in one round trip. It is not a figure anybody sees
    and it is not compared for size — only for *change*, against the value
    stored from the last time the badges were actually worked out. See
    `_signature` in backend/api/achievements.py, which is the only caller and
    holds the argument for why the guard exists.

    The point is the asymmetry: working the badges out costs a pass over every
    task the account owns plus a reading of the analytics report card, which is
    ~400ms on the largest account in this database. This is four milliseconds
    on the same account, and on an account where nothing has happened since the
    last sweep it is the entire cost of deciding so.

    Counts rather than sums where a count will do, and no ORDER BY anywhere:
    every clause here is an index scan or a table count.
    """
    con = connect()
    try:
        parts = []
        for table, clause, params in (
            ('tasks', "status = 'done'", ()),
            ('notes', '1', ()),
            ('records', '1', ()),
            ('goals', "status = 'completed'", ()),
            ('calendar_events', 'completed', ()),
            ('xp_events', '1', ()),
        ):
            if not _schema(con, table):
                parts.append('-')
                continue
            row = con.execute(
                'SELECT COUNT(*) AS n FROM "{}" WHERE user_id = ? AND {}'.format(
                    table, clause),
                (username,) + params).fetchone()
            parts.append(str(row['n'] if row else 0))

        # Focus is the one that has to be a sum: a session lengthening a day
        # already on the ledger moves every focus badge and changes no count.
        if _schema(con, 'focus_days'):
            row = con.execute(
                'SELECT CAST(COALESCE(SUM(seconds), 0) AS INTEGER) AS s '
                'FROM focus_days WHERE user_id = ?', (username,)).fetchone()
            parts.append(str(row['s'] if row else 0))
        else:
            parts.append('-')

        return ':'.join(parts)
    finally:
        con.close()


def live_fingerprints(username):
    """Every fingerprint this account already holds, deleted ones included.

    The sweep asks for this once and then decides in Python what to write,
    rather than attempting an insert per candidate and letting most of them
    collide. Tombstones are in it on purpose: a fingerprint that was thrown
    away must not be offered again.
    """
    con = connect()
    try:
        if not _schema(con, 'notifications'):
            return set()
        return {row[0] for row in con.execute(
            'SELECT fingerprint FROM notifications WHERE user_id = ?',
            (username,))}
    finally:
        con.close()


def add_notifications(username, rows):
    """Write new notifications. Returns the ones that were actually inserted.

    `INSERT OR IGNORE` on (user_id, fingerprint), so a sweep that finds the
    same situation again writes nothing — including when what it collides with
    is a tombstone, which is what makes a deleted notification stay deleted.

    Ids come from `new_id`, which is a millisecond stamp, so `rowid` order and
    id order agree and "newest" means the same thing either way.
    """
    if not rows:
        return []

    con = connect()
    try:
        if not _schema(con, 'notifications'):
            return []
        written = []
        stamp = datetime.now().isoformat(timespec='seconds')
        with con:
            for row in rows:
                record = {
                    'id': new_id('notifications'),
                    'user_id': username,
                    'fingerprint': row['fingerprint'],
                    'channel': row.get('channel', 'tasks'),
                    'tone': row.get('tone', 'info'),
                    'title': row.get('title', ''),
                    'body': row.get('body', ''),
                    'link': row.get('link', ''),
                    'for_day': row.get('for_day', ''),
                    'created_at': stamp,
                }
                names = [n for n in NOTIFICATION_COLUMNS if n in record]
                cursor = con.execute(
                    'INSERT OR IGNORE INTO notifications ({}) VALUES ({})'.format(
                        ', '.join('"{}"'.format(n) for n in names),
                        ', '.join('?' for _ in names)),
                    [record[n] for n in names])
                if cursor.rowcount:
                    written.append(record)
        return written
    finally:
        con.close()


def refresh_notification(username, fingerprint, title, body):
    """Bring a live notification's words up to date, leaving its place alone.

    The day-scoped ones describe a count that moves — three tasks are late this
    morning and five are late this afternoon — and the alternative to editing
    the row is putting the count in the fingerprint, which would mean a fresh
    notification every time somebody finished a task. A deleted row is never
    touched: it has been answered, and rewriting it would be a way of bringing
    it back.
    """
    con = connect()
    try:
        if not _schema(con, 'notifications'):
            return False
        with con:
            cursor = con.execute(
                'UPDATE notifications SET title = ?, body = ? '
                'WHERE user_id = ? AND fingerprint = ? AND deleted_at IS NULL '
                'AND (title != ? OR body != ?)',
                (title, body, username, fingerprint, title, body))
        return cursor.rowcount > 0
    finally:
        con.close()


def mark_notifications(username, ids, column):
    """Stamp `shown_at` or `read_at` on some of one account's notifications.

    `column` is picked from a fixed pair rather than interpolated from the
    caller's string — it goes into the SQL text, which is the one place in this
    module where a caller's value would be more than a parameter.
    """
    if column not in ('shown_at', 'read_at'):
        raise ValueError('mark_notifications: {!r} is not stampable'.format(column))
    ids = [str(i) for i in (ids or [])]
    if not ids:
        return 0

    con = connect()
    try:
        if not _schema(con, 'notifications'):
            return 0
        with con:
            cursor = con.execute(
                'UPDATE notifications SET "{}" = ? WHERE user_id = ? '
                'AND "{}" IS NULL AND id IN ({})'.format(
                    column, column, ', '.join('?' for _ in ids)),
                [datetime.now().isoformat(timespec='seconds'), username] + ids)
        return cursor.rowcount
    finally:
        con.close()


def delete_notifications(username, ids=None):
    """Throw notifications away. `ids` None means every live one.

    Soft, and permanently so — see data/sql/notifications.sql. What the reader
    gets is a bell that stays empty until something genuinely new happens,
    which is only true because the row survives to say this one was answered.
    """
    con = connect()
    try:
        if not _schema(con, 'notifications'):
            return 0
        sql = ('UPDATE notifications SET deleted_at = ? '
               'WHERE user_id = ? AND deleted_at IS NULL')
        params = [datetime.now().isoformat(timespec='seconds'), username]
        if ids is not None:
            ids = [str(i) for i in ids]
            if not ids:
                return 0
            sql += ' AND id IN ({})'.format(', '.join('?' for _ in ids))
            params.extend(ids)
        with con:
            cursor = con.execute(sql, params)
        return cursor.rowcount
    finally:
        con.close()


def retire_notifications(username, day):
    """Retire live notifications about a day that has passed. Returns how many.

    Yesterday's "3 tasks are past their dates" is not today's count and is not
    news either, and a bell that keeps one per day accumulates a week of them
    while the reader is looking at the same three late tasks. The day-scoped
    ones therefore end with their day.

    A retirement is the same soft delete the reader's ✕ performs, and that is
    right rather than convenient: the fingerprint it leaves behind names a day
    that cannot come round again, so it blocks nothing and it is pruned with
    the rest.
    """
    con = connect()
    try:
        if not _schema(con, 'notifications'):
            return 0
        with con:
            cursor = con.execute(
                'UPDATE notifications SET deleted_at = ? WHERE user_id = ? '
                "AND deleted_at IS NULL AND for_day != '' AND for_day < ?",
                (datetime.now().isoformat(timespec='seconds'), username, day))
        return cursor.rowcount
    finally:
        con.close()


def prune_notifications(username, before_day):
    """Drop tombstones older than `before_day`, and anything past the cap.

    Both halves are the same idea: this table is a working list, not a record
    of everything the app has ever had to say. A tombstone whose fingerprint
    can no longer recur is holding nothing back, and a live row sixty deep is
    below the fold of a panel nobody scrolls.
    """
    con = connect()
    try:
        if not _schema(con, 'notifications'):
            return 0
        with con:
            gone = con.execute(
                'DELETE FROM notifications WHERE user_id = ? '
                'AND deleted_at IS NOT NULL AND deleted_at < ?',
                (username, before_day)).rowcount
            gone += con.execute(
                'DELETE FROM notifications WHERE user_id = ? '
                'AND deleted_at IS NULL AND id NOT IN ('
                '  SELECT id FROM notifications WHERE user_id = ? '
                '  AND deleted_at IS NULL ORDER BY rowid DESC LIMIT ?)',
                (username, username, NOTIFICATION_CAP)).rowcount
        return gone
    finally:
        con.close()


def notification_facts(username, day, tomorrow, week_ago, fortnight_ago):
    """Everything the notification sweep needs, in one round trip.

    Same argument as `task_alert_counts` above, one size up: the sweep asks
    about tasks, XP, focus, goals, badges and records, and doing that as six
    reads through `read_table` would mean pulling six whole tables across every
    account in the database to answer questions about one. Every figure here is
    an aggregate or a LIMIT, and the four days are passed in for the reason the
    day always is — stored stamps carry no zone, so the reader's day is the
    only right one.

    The rules that turn these facts into sentences are not here. They are in
    backend/tracking/notify.py, which is where the wording and the thresholds
    belong.
    """
    facts = {
        'late': 0, 'late_title': None,
        'due_today': 0, 'due_today_title': None,
        'due_tomorrow': 0, 'due_tomorrow_title': None,
        'finished_today': 0,
        'done_this_week': 0, 'done_last_week': 0,
        'xp_today': 0, 'xp_this_week': 0, 'xp_last_week': 0, 'xp_best_day': 0,
        'focus_this_week': 0, 'focus_last_week': 0,
        'last_active_day': None,
        'goals': [], 'badges': [], 'records': [],
    }

    con = connect()
    try:
        if _schema(con, 'tasks'):
            # substr(due_date, 1, 10) rather than date(due_date): the column
            # holds either a bare day or a full stamp, exactly as
            # `task_alert_counts` above explains.
            for key, clause, params in (
                ('late', "substr(due_date, 1, 10) != '' "
                         'AND substr(due_date, 1, 10) < ?', (day,)),
                ('due_today', 'substr(due_date, 1, 10) = ?', (day,)),
                ('due_tomorrow', 'substr(due_date, 1, 10) = ?', (tomorrow,)),
            ):
                row = con.execute(
                    'SELECT COUNT(*) AS n, MIN(title) AS one FROM tasks '
                    'WHERE user_id = ? AND status != ? AND ' + clause,
                    (username, 'done') + params).fetchone()
                facts[key] = row['n'] or 0
                facts[key + '_title'] = row['one']

            facts['finished_today'] = con.execute(
                'SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? '
                'AND status = ? AND substr(completed_at, 1, 10) = ?',
                (username, 'done', day)).fetchone()['n'] or 0

            for key, since, until in (('done_this_week', week_ago, day),
                                      ('done_last_week', fortnight_ago, week_ago)):
                facts[key] = con.execute(
                    'SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? '
                    'AND status = ? AND substr(completed_at, 1, 10) > ? '
                    'AND substr(completed_at, 1, 10) <= ?',
                    (username, 'done', since, until)).fetchone()['n'] or 0

        if _schema(con, 'xp_events'):
            facts['xp_today'] = con.execute(
                'SELECT COALESCE(SUM(amount), 0) AS n FROM xp_events '
                'WHERE user_id = ? AND date = ?',
                (username, day)).fetchone()['n'] or 0
            for key, since, until in (('xp_this_week', week_ago, day),
                                      ('xp_last_week', fortnight_ago, week_ago)):
                facts[key] = con.execute(
                    'SELECT COALESCE(SUM(amount), 0) AS n FROM xp_events '
                    'WHERE user_id = ? AND date > ? AND date <= ?',
                    (username, since, until)).fetchone()['n'] or 0
            # The best single day the ledger has ever recorded, today
            # excluded — the question the sweep asks is whether today has
            # beaten it, and a day cannot beat itself.
            facts['xp_best_day'] = con.execute(
                'SELECT COALESCE(MAX(total), 0) AS n FROM ('
                '  SELECT SUM(amount) AS total FROM xp_events '
                '  WHERE user_id = ? AND date != ? GROUP BY date)',
                (username, day)).fetchone()['n'] or 0
            last = con.execute(
                'SELECT MAX(date) AS d FROM xp_events WHERE user_id = ?',
                (username,)).fetchone()
            facts['last_active_day'] = last['d'] if last else None

        if _schema(con, 'focus_days'):
            for key, since, until in (('focus_this_week', week_ago, day),
                                      ('focus_last_week', fortnight_ago, week_ago)):
                facts[key] = con.execute(
                    'SELECT COALESCE(SUM(seconds), 0) AS n FROM focus_days '
                    'WHERE user_id = ? AND date > ? AND date <= ?',
                    (username, since, until)).fetchone()['n'] or 0

        if _schema(con, 'goals'):
            # Only what a notification can be written about: an active goal
            # that has a date on it, or one whose arithmetic is finished but
            # which nobody has closed.
            facts['goals'] = [dict(row) for row in con.execute(
                'SELECT id, title, deadline, progress, goal_type FROM goals '
                'WHERE user_id = ? AND status = ? '
                "AND (deadline != '' OR progress >= 100) "
                'ORDER BY deadline LIMIT 40',
                (username, 'active'))]

        if _schema(con, 'user_achievements') and _schema(con, 'achievements'):
            facts['badges'] = [dict(row) for row in con.execute(
                'SELECT a.id AS id, a.name AS name, a.description AS description, '
                'u.earned_at AS earned_at FROM user_achievements u '
                'JOIN achievements a ON a.id = u.achievement_id '
                'WHERE u.user_id = ? AND substr(u.earned_at, 1, 10) >= ? '
                'ORDER BY u.earned_at DESC LIMIT 10',
                (username, week_ago))]

        if _schema(con, 'records'):
            facts['records'] = [dict(row) for row in con.execute(
                'SELECT id, name, value, unit, achieved_on FROM records '
                'WHERE user_id = ? AND achieved_on >= ? '
                'ORDER BY achieved_on DESC LIMIT 10',
                (username, week_ago))]

        return facts
    finally:
        con.close()

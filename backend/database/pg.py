"""PostgreSQL behind the same interface connection.py has always used.

## Why this file exists

The datastore was written against SQLite and every query in connection.py is
SQLite's dialect. Rewriting three thousand lines of it for a second database
would leave two copies of every query to keep in step, so instead this module
makes a Postgres connection *behave like* the sqlite3 connection those queries
were written for, and connection.py picks one or the other when it opens a
connection:

    DATABASE_URL=postgresql://localhost/summit   → Postgres, through here
    (unset)                                      → SQLite at SUMMIT_DB

What "behave like" covers, which is all connection.py asks of a connection:

  * `?` placeholders, rows that index by name and by position, `.keys()`,
    `with con:` as a transaction, `.execute` returning something with
    `fetchone`, `fetchall`, iteration and `rowcount`, and `executemany`.
  * SQLite's loose typing, which the app leans on: an id that is sometimes an
    int and sometimes a string, a `1` written to a BOOLEAN. Parameters are sent
    as *untyped* text (OID 0), so Postgres reads each one as whatever the
    column or operator on the other side wants — the same thing SQLite's type
    affinity does.
  * `rowid`. Every Postgres table gets a `rowid bigserial` column, so `ORDER BY
    rowid` keeps meaning "in the order written", which the XP ledger and the
    notifications list both depend on. It is hidden from every row read back.
  * `datetime('now')` and `julianday(...)`, as SQL functions of the same name.
  * Errors. A unique-key clash is raised as `sqlite3.IntegrityError` with
    SQLite's wording, so `insert_row`'s retry and every `except` already
    written against sqlite3 keep working unchanged.

## Where the schema comes from

Not from a second copy of the DDL. `mirror_schema` reads a SQLite database
that `_build` and `_catch_up` have brought fully up to date — tables, columns,
primary keys, unique keys, foreign keys, CHECKs and indexes — and creates the
same thing in Postgres, adding only what is missing. So data/sql/*.sql and the
ADDED_* lists in connection.py stay the one description of the schema, and a
column added there reaches Postgres on the next start.

SQLite declared types map to: BOOLEAN → boolean; NUMERIC and INTEGER →
numeric (read back as an int when whole, a float when not — SQLite's own
rule); REAL/FLOAT/DOUBLE → double precision; everything else → text.
"""
import decimal
import functools
import re
import sqlite3
import threading

import psycopg
from psycopg import errors as pg_errors
from psycopg.adapt import Dumper
from psycopg_pool import ConnectionPool


# --------------------------------------------------------------------------
# Parameters: untyped, like SQLite
# --------------------------------------------------------------------------
class _Untyped(Dumper):
    """A Python value sent as text with no type, for the server to infer."""
    oid = 0

    def dump(self, obj):
        return str(obj).encode()


class _UntypedBool(Dumper):
    """A bool as 1 or 0: valid for a boolean column and an integer one alike."""
    oid = 0

    def dump(self, obj):
        return b'1' if obj else b'0'


def _configure(conn):
    conn.adapters.register_dumper(int, _Untyped)
    conn.adapters.register_dumper(float, _Untyped)
    conn.adapters.register_dumper(decimal.Decimal, _Untyped)
    conn.adapters.register_dumper(bool, _UntypedBool)
    conn.autocommit = True


# --------------------------------------------------------------------------
# The pool
# --------------------------------------------------------------------------
_pools = {}
_pool_lock = threading.Lock()

#: How many pooled connections this thread is holding right now.
#:
#: connection.py opens a connection per call, and a few calls open a second
#: one while the first is still open — `complete_tasks` asks `new_ids` for ids
#: mid-transaction. From a pool that is a deadlock waiting to happen: twenty
#: requests each holding one connection and each waiting for a second drain a
#: pool of sixteen and wait on each other until the timeout. So a thread that
#: already holds one gets its second straight from the server instead, outside
#: the pool, and closes it after. It is the rare path; the common one pools.
_held = threading.local()

#: Enough for the worker threads uvicorn runs sync handlers on to each hold one.
POOL_SIZE = 24


def _pool(url):
    with _pool_lock:
        pool = _pools.get(url)
        if pool is None:
            # No server-side prepared statements: a statement prepared against
            # one shape of a table is refused after the table changes, and the
            # schema catch-up (and the test suite's per-test rebuild) changes
            # it under live connections.
            pool = ConnectionPool(url, min_size=1, max_size=POOL_SIZE, configure=_configure,
                                  kwargs={'prepare_threshold': None}, open=True, name='summit')
            _pools[url] = pool
        return pool


def close_pools():
    with _pool_lock:
        for pool in _pools.values():
            pool.close()
        _pools.clear()


# --------------------------------------------------------------------------
# SQL: SQLite's dialect, rewritten where Postgres differs
# --------------------------------------------------------------------------
_OR_IGNORE = re.compile(r'^\s*INSERT\s+OR\s+IGNORE\s+INTO', re.IGNORECASE)


@functools.lru_cache(maxsize=2048)
def translate(sql):
    """One statement, with `?` as `%s` and every literal `%` doubled.

    Quotes are respected, so a `?` or a `%` inside a string literal or a
    quoted name is left as it is (apart from the doubling psycopg needs).
    """
    stripped = sql.strip().rstrip(';')
    upper = stripped.upper()
    if upper == 'BEGIN IMMEDIATE' or upper == 'BEGIN DEFERRED':
        return 'BEGIN'
    ignore = bool(_OR_IGNORE.match(stripped))
    if ignore:
        stripped = _OR_IGNORE.sub('INSERT INTO', stripped, count=1)

    out = []
    quote = None
    for char in stripped:
        if quote:
            if char == quote:
                quote = None
            out.append('%%' if char == '%' else char)
            continue
        if char in ("'", '"'):
            quote = char
            out.append(char)
        elif char == '?':
            out.append('%s')
        elif char == '%':
            out.append('%%')
        else:
            out.append(char)
    text = ''.join(out)
    if ignore:
        text += ' ON CONFLICT DO NOTHING'
    return text


# --------------------------------------------------------------------------
# Rows that read like sqlite3.Row
# --------------------------------------------------------------------------
def _plain(value):
    """numeric comes back as Decimal; the app wants the int or float SQLite gave."""
    if isinstance(value, decimal.Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    return value


class Row:
    __slots__ = ('_keys', '_values', '_index')

    def __init__(self, keys, values, index):
        self._keys = keys
        self._values = values
        self._index = index

    def keys(self):
        return list(self._keys)

    def __getitem__(self, key):
        if isinstance(key, (int, slice)):
            return self._values[key]
        return self._values[self._index[key]]

    def __iter__(self):
        return iter(self._values)

    def __len__(self):
        return len(self._values)

    def __repr__(self):
        return 'Row({})'.format(dict(zip(self._keys, self._values)))


def _row_factory(cursor):
    description = cursor.description or []
    names = [column.name for column in description]
    # The hidden `rowid` column is the order-keeper, never part of a row.
    keep = [at for at, name in enumerate(names) if name != 'rowid']
    keys = tuple(names[at] for at in keep)
    index = {name: at for at, name in enumerate(keys)}

    def make(values):
        return Row(keys, tuple(_plain(values[at]) for at in keep), index)
    return make


# --------------------------------------------------------------------------
# Errors that read like sqlite3's
# --------------------------------------------------------------------------
def _as_sqlite(error):
    """The sqlite3 exception connection.py's handlers were written to catch."""
    if isinstance(error, pg_errors.UniqueViolation):
        return sqlite3.IntegrityError('UNIQUE constraint failed: {}'.format(
            getattr(error.diag, 'constraint_name', '') or error))
    if isinstance(error, psycopg.IntegrityError):
        return sqlite3.IntegrityError(str(error))
    return sqlite3.OperationalError(str(error))


class Cursor:
    def __init__(self, cursor):
        self._cursor = cursor

    @property
    def rowcount(self):
        return self._cursor.rowcount

    def fetchone(self):
        return self._cursor.fetchone() if self._cursor.description else None

    def fetchall(self):
        return self._cursor.fetchall() if self._cursor.description else []

    def __iter__(self):
        if not self._cursor.description:
            return iter(())
        return iter(self._cursor.fetchall())


class Connection:
    """A pooled Postgres connection wearing sqlite3.Connection's interface."""

    def __init__(self, url, trace=None):
        self._trace = trace
        self._depth = 0
        if getattr(_held, 'count', 0):
            self._pool = None
            self._conn = psycopg.connect(url, prepare_threshold=None)
            _configure(self._conn)
        else:
            self._pool = _pool(url)
            self._conn = self._pool.getconn()
            _held.count = 1

    # sqlite3 compatibility no-ops
    row_factory = None

    def set_trace_callback(self, callback):
        self._trace = callback

    def _run(self, sql, params=None, many=False):
        if self._trace:
            # sqlite3 reports each row of an executemany as its own statement;
            # so does this, so a caller counting writes counts the same.
            for _ in (params if many else [None]):
                self._trace(sql)
        text = translate(sql)
        cursor = self._conn.cursor(row_factory=_row_factory)
        try:
            if many:
                cursor.executemany(text, [_params(p) for p in params])
            else:
                cursor.execute(text, _params(params) if params is not None else None)
        except psycopg.Error as error:
            raise _as_sqlite(error) from error
        return Cursor(cursor)

    def execute(self, sql, params=None):
        return self._run(sql, params)

    def executemany(self, sql, seq):
        return self._run(sql, list(seq), many=True)

    def commit(self):
        if self._conn.info.transaction_status != psycopg.pq.TransactionStatus.IDLE:
            self._conn.execute('COMMIT')

    def rollback(self):
        if self._conn.info.transaction_status != psycopg.pq.TransactionStatus.IDLE:
            self._conn.execute('ROLLBACK')

    def __enter__(self):
        # `with con:` is a transaction in sqlite3, and so it is here.
        if self._conn.info.transaction_status == psycopg.pq.TransactionStatus.IDLE:
            self._conn.execute('BEGIN')
            self._depth = 1
        else:
            self._depth = 0
        return self

    def __exit__(self, kind, value, trace):
        if self._depth:
            self._depth = 0
            if kind is None:
                self._conn.execute('COMMIT')
            else:
                self._conn.execute('ROLLBACK')
        return False

    def close(self):
        if self._conn is None:
            return
        try:
            if self._conn.info.transaction_status != psycopg.pq.TransactionStatus.IDLE:
                self._conn.execute('ROLLBACK')
        except psycopg.Error:
            pass
        if self._pool is None:
            self._conn.close()
        else:
            self._pool.putconn(self._conn)
            _held.count = 0
        self._conn = None

    @property
    def raw(self):
        return self._conn


def _params(params):
    """sqlite3 accepts a dict for `:name` placeholders; connection.py uses `?`."""
    if params is None:
        return None
    return [_plain(p) for p in params]


def connect(url, trace=None):
    return Connection(url, trace)


# --------------------------------------------------------------------------
# The schema, mirrored from SQLite
# --------------------------------------------------------------------------
#: SQLite functions the app calls, written in Postgres. `datetime('now')` is
#: SQLite's UTC "YYYY-MM-DD HH:MM:SS"; `julianday` is days since noon on
#: 24 November 4714 BC, NULL for anything that is not a date.
COMPAT_FUNCTIONS = (
    '''CREATE OR REPLACE FUNCTION datetime(arg text) RETURNS text
       LANGUAGE sql STABLE AS
       $$ SELECT CASE WHEN lower(arg) = 'now'
                      THEN to_char(timezone('UTC', now()), 'YYYY-MM-DD HH24:MI:SS')
                      ELSE to_char(arg::timestamp, 'YYYY-MM-DD HH24:MI:SS') END $$''',
    '''CREATE OR REPLACE FUNCTION julianday(arg text) RETURNS double precision
       LANGUAGE plpgsql IMMUTABLE AS
       $$ BEGIN
            RETURN extract(epoch FROM arg::timestamp) / 86400.0 + 2440587.5;
          EXCEPTION WHEN others THEN
            RETURN NULL;
          END $$''',
)


def _pg_type(declared, autoincrement=False):
    declared = (declared or '').upper()
    if autoincrement:
        return 'bigint GENERATED BY DEFAULT AS IDENTITY'
    if 'BOOL' in declared:
        return 'boolean'
    if 'INT' in declared or 'NUMERIC' in declared or 'DECIMAL' in declared:
        return 'numeric'
    if 'REAL' in declared or 'FLOA' in declared or 'DOUB' in declared:
        return 'double precision'
    return 'text'


def _default(expression, pg_type):
    """A SQLite DEFAULT, written for Postgres."""
    if expression is None:
        return None
    text = expression.strip()
    if pg_type == 'boolean':
        lowered = text.strip("'").lower()
        if lowered in ('0', 'false'):
            return 'FALSE'
        if lowered in ('1', 'true'):
            return 'TRUE'
    if text.upper() == 'CURRENT_TIMESTAMP':
        return "datetime('now')"
    return text


def _q(name):
    return '"{}"'.format(name.replace('"', '""'))


def _checks(create_sql):
    """The CHECK (...) clauses in a CREATE TABLE, balanced-paren extracted."""
    found = []
    for match in re.finditer(r'\bCHECK\s*\(', create_sql or '', re.IGNORECASE):
        depth, at = 0, match.end() - 1
        for end in range(at, len(create_sql)):
            if create_sql[end] == '(':
                depth += 1
            elif create_sql[end] == ')':
                depth -= 1
                if depth == 0:
                    found.append(create_sql[at + 1:end])
                    break
    return found


def describe(lite):
    """Everything about a SQLite database's tables that Postgres needs."""
    tables = {}
    for name, sql in lite.execute(
            "SELECT name, sql FROM sqlite_master WHERE type = 'table' "
            "AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        info = lite.execute('PRAGMA table_info({})'.format(_q(name))).fetchall()
        pk = [row[1] for row in sorted((r for r in info if r[5]), key=lambda r: r[5])]
        autoinc = bool(re.search(r'AUTOINCREMENT', sql or '', re.IGNORECASE))
        columns = []
        for cid, column, declared, notnull, default, pk_at in info:
            auto = autoinc and pk == [column] and 'INT' in (declared or '').upper()
            columns.append({
                'name': column, 'declared': declared or '', 'notnull': bool(notnull),
                'default': default, 'auto': auto,
            })
        uniques = []
        for index in lite.execute('PRAGMA index_list({})'.format(_q(name))).fetchall():
            # (seq, name, unique, origin, partial); origin 'u' = UNIQUE in the
            # table definition, which has no SQL of its own to copy.
            if index[2] and index[3] == 'u':
                cols = [r[2] for r in lite.execute(
                    'PRAGMA index_info({})'.format(_q(index[1]))).fetchall()]
                uniques.append(cols)
        fks = {}
        for row in lite.execute('PRAGMA foreign_key_list({})'.format(_q(name))).fetchall():
            # (id, seq, table, from, to, on_update, on_delete, match)
            entry = fks.setdefault(row[0], {'table': row[2], 'from': [], 'to': [],
                                            'on_delete': row[6]})
            entry['from'].append(row[3])
            entry['to'].append(row[4])
        tables[name] = {
            'columns': columns, 'pk': pk, 'uniques': uniques,
            'fks': list(fks.values()), 'checks': _checks(sql),
        }
    indexes = [(name, table, sql) for name, table, sql in lite.execute(
        "SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' "
        "AND sql IS NOT NULL ORDER BY name")]
    return tables, indexes


def _loose_columns(lite, tables):
    """Columns whose stored values do not fit the type they declare.

    SQLite will hold 'n/a' in an INTEGER column; Postgres will not. A column
    like that becomes text, so its data copies across rather than failing.
    """
    have = {name for (name,) in lite.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table'")}
    loose = set()
    for table, spec in tables.items():
        if table not in have:
            continue
        for column in spec['columns']:
            kind = _pg_type(column['declared'], column['auto'])
            if kind not in ('numeric', 'double precision'):
                continue
            # Only text and blobs can be wrong; numbers and NULL always fit.
            for (value,) in lite.execute(
                    "SELECT {0} FROM {1} WHERE typeof({0}) IN ('text', 'blob')".format(
                        _q(column['name']), _q(table))):
                text = str(value).strip()
                # '' copies as NULL (`_coerce`), which is how it reads anyway.
                if not text:
                    continue
                try:
                    float(text)
                except ValueError:
                    loose.add((table, column['name']))
                    break
    return loose


def _existing_columns(pg):
    found = {}
    for table, column in pg.execute(
            "SELECT table_name, column_name FROM information_schema.columns "
            "WHERE table_schema = current_schema()").fetchall():
        found.setdefault(table, set()).add(column)
    return found


def _try(pg, statement):
    """Run one DDL statement; a failure is skipped, not fatal. Returns success."""
    try:
        with pg.transaction():
            pg.execute(statement)
        return True
    except psycopg.Error:
        return False


def mirror_schema(pg, lite, data=None):
    """Create in Postgres whatever of `lite`'s schema is not there yet.

    `pg` is a raw psycopg connection. `data`, when given, is a SQLite database
    whose stored values decide which numeric columns have to be text (see
    `_loose_columns`). Returns the names of the tables that were created.
    """
    tables, indexes = describe(lite)
    loose = _loose_columns(data, tables) if data is not None else set()
    for statement in COMPAT_FUNCTIONS:
        pg.execute(statement)

    existing = _existing_columns(pg)
    created = []
    for table, spec in tables.items():
        defs = []
        for column in spec['columns']:
            kind = ('text' if (table, column['name']) in loose
                    else _pg_type(column['declared'], column['auto']))
            line = '{} {}'.format(_q(column['name']), kind)
            default = _default(column['default'], kind)
            if default is not None and not column['auto']:
                line += ' DEFAULT {}'.format(default)
            if column['notnull'] and not column['auto']:
                line += ' NOT NULL'
            defs.append((column['name'], line))

        if table not in existing:
            body = ['rowid bigserial'] + [line for _, line in defs]
            if spec['pk']:
                body.append('PRIMARY KEY ({})'.format(', '.join(_q(c) for c in spec['pk'])))
            for cols in spec['uniques']:
                body.append('UNIQUE ({})'.format(', '.join(_q(c) for c in cols)))
            pg.execute('CREATE TABLE {} ({})'.format(_q(table), ', '.join(body)))
            created.append(table)
        else:
            have = existing[table]
            if 'rowid' not in have:
                pg.execute('ALTER TABLE {} ADD COLUMN rowid bigserial'.format(_q(table)))
            for name, line in defs:
                if name not in have:
                    # NOT NULL without a default cannot be added to a table
                    # with rows; the column arrives nullable instead.
                    if ' NOT NULL' in line and ' DEFAULT ' not in line:
                        line = line.replace(' NOT NULL', '')
                    pg.execute('ALTER TABLE {} ADD COLUMN IF NOT EXISTS {}'.format(_q(table), line))
    return created, tables, indexes


def finish_schema(pg, tables, indexes):
    """Foreign keys, CHECKs and indexes — after any rows have been copied.

    Foreign keys and CHECKs are added NOT VALID: they hold for every write from
    now on, and do not refuse a copy of an old SQLite file that, with its keys
    switched off during `write_table`, picked up an orphan or two.
    """
    have = {name for (name,) in pg.execute(
        "SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace "
        "WHERE n.nspname = current_schema()").fetchall()}
    for table, spec in tables.items():
        for number, fk in enumerate(spec['fks']):
            name = '{}_fk_{}'.format(table, number)
            if name in have:
                continue
            action = {'CASCADE': 'CASCADE', 'SET NULL': 'SET NULL',
                      'RESTRICT': 'RESTRICT', 'SET DEFAULT': 'SET DEFAULT'}.get(
                (fk['on_delete'] or '').upper(), 'NO ACTION')
            _try(pg, 'ALTER TABLE {} ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({}) '
                     'ON DELETE {} NOT VALID'.format(
                         _q(table), _q(name), ', '.join(_q(c) for c in fk['from']),
                         _q(fk['table']), ', '.join(_q(c) for c in fk['to']), action))
        for number, check in enumerate(spec['checks']):
            name = '{}_check_{}'.format(table, number)
            if name in have:
                continue
            _try(pg, 'ALTER TABLE {} ADD CONSTRAINT {} CHECK ({}) NOT VALID'.format(
                _q(table), _q(name), check))
    for name, table, sql in indexes:
        statement = re.sub(r'^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+(IF\s+NOT\s+EXISTS\s+)?',
                           lambda m: 'CREATE {}INDEX IF NOT EXISTS '.format(m.group(1) or ''),
                           sql, flags=re.IGNORECASE)
        _try(pg, statement)


def copy_rows(pg, lite, tables, only=None):
    """Copy every row of `lite` into Postgres, in rowid order.

    Values are converted on the way: SQLite's 0/1 booleans become booleans,
    and text in a numeric column that is not a number becomes NULL (only
    possible for a column `_loose_columns` did not see, i.e. a seed build).
    """
    types = {}
    for table, column, kind in pg.execute(
            "SELECT table_name, column_name, data_type FROM information_schema.columns "
            "WHERE table_schema = current_schema()").fetchall():
        types[(table, column)] = kind

    counts = {}
    for table, spec in tables.items():
        if only is not None and table not in only:
            continue
        names = [c['name'] for c in spec['columns']]
        kinds = [types.get((table, n), 'text') for n in names]
        rows = lite.execute('SELECT {} FROM {} ORDER BY rowid'.format(
            ', '.join(_q(n) for n in names), _q(table)))
        count = 0
        with pg.cursor() as cursor:
            with cursor.copy('COPY {} ({}) FROM STDIN'.format(
                    _q(table), ', '.join(_q(n) for n in names))) as copy:
                for row in rows:
                    copy.write_row([_coerce(value, kind) for value, kind in zip(row, kinds)])
                    count += 1
        counts[table] = count
    # Identity columns and the rowid sequences, moved past what was copied.
    for table, column in pg.execute(
            "SELECT table_name, column_name FROM information_schema.columns "
            "WHERE table_schema = current_schema() "
            "AND (column_default LIKE 'nextval%%' OR is_identity = 'YES')").fetchall():
        sequence = pg.execute('SELECT pg_get_serial_sequence(%s, %s)',
                              (_q(table), column)).fetchone()[0]
        if sequence:
            pg.execute('SELECT setval(%s, COALESCE((SELECT MAX({}) FROM {}), 0) + 1, false)'.format(
                _q(column), _q(table)), (sequence,))
    return counts


_TRUE = {'1', 'true', 't', 'yes', 'y', 'on'}


def _coerce(value, kind):
    if value is None:
        return None
    if kind == 'boolean':
        if isinstance(value, str):
            return value.strip().lower() in _TRUE
        return bool(value)
    if kind in ('numeric', 'double precision', 'bigint', 'integer'):
        if isinstance(value, (int, float)):
            return value
        try:
            number = float(str(value).strip())
        except ValueError:
            return None
        return int(number) if number.is_integer() and kind != 'double precision' else number
    if isinstance(value, bytes):
        return value.decode('utf-8', 'replace')
    return str(value) if not isinstance(value, str) else value


def is_empty(pg):
    return pg.execute(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'").fetchone()[0] == 0

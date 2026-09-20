# Database

Summit stores its data in a SQLite database at `data/summit.db`. It is git-
ignored, because it changes every time the app runs.

The database is built from `data/sql/` — one `.sql` file per part of the app,
each holding its tables' definitions followed by the rows to start from. Those
files are read once, when `data/summit.db` does not exist yet: a fresh clone
comes up with a working database and no setup step. After that the database is
the only copy of the data, and the seed files stop changing.

`data/backups/` holds the JSON stores that came before. They are a backup of
the last JSON-era state; nothing reads or writes them any more.

Every read and write goes through `backend/database/connection.py`. Nothing
else in the codebase opens the database.

## What lives where

| File | Tables | Rows |
| --- | --- | --- |
| `users.sql` | `users` | accounts: identity, sign-in, progression (xp, level, streak) |
| `tasks.sql` | `tasks` | every task, plus the timing recorded on completion |
| `goals.sql` | `goals` | goals of all four types |
| `growth.sql` | `xp_events` (+ the `growth_daily` view) | the XP ledger — append-only, one row per earning moment |
| `focus.sql` | `focus_days`, `day_focus_notes` | each day's focus total, and the day's one-line note |
| `events.sql` | `calendar_entries`, `calendar_events`, `event_colors` | tasks placed on a day, standalone calendar blocks, the palette in use |
| `analytics.sql` | `metric_snapshots` | the graded report card, one row per user per day per metric |
| `achievements.sql`, `history.sql`, `library.sql`, `notes.sql`, `settings.sql` | — | schema only: those features are not built |

`user_id` on every row is the **username**, not the account id.

## How a seed file is laid out

Everything above the first `-- ---- rows: <table> ----` marker is the schema.
Below each marker are that table's starting rows:

```sql
CREATE TABLE IF NOT EXISTS focus_days (
    user_id     TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    seconds     NUMERIC DEFAULT 0 CHECK (seconds >= 0),
    goal_hours  NUMERIC DEFAULT 2 CHECK (goal_hours >= 0),
    PRIMARY KEY (user_id, date)
);

-- ---- rows: focus_days ----
INSERT INTO focus_days (user_id, date, seconds, goal_hours) VALUES ('dude', '2026-07-26', 4.0, 2.0);
```

The schema is SQLite, not PostgreSQL: `TEXT` where a server would use
`TIMESTAMPTZ` or `JSONB`, `INTEGER PRIMARY KEY AUTOINCREMENT` for `BIGSERIAL`,
and no `GIN` indexes. Everything else — the `CHECK` constraints, the partial
and expression indexes, the foreign keys — is enforced as written.

## Behaviour that isn't obvious

**A NULL column is left out of the row entirely.** `read_table` drops it rather
than returning `None`. The app reads optional fields as
`row.get('x', <fallback>)` and tests `'met_deadline' in row`, and those two
spellings only agree if a value that was never written stays *missing*. Writing
follows the same rule in reverse: a key the row does not have is stored as NULL
where the column allows it, and left to its `DEFAULT` where it does not.

**Rows keep insertion order** (`ORDER BY rowid`). The XP ledger is append-only
and "the latest event" is the last row, not the largest id.

**`write_table` turns foreign keys off while it swaps the rows, and this is not
optional.** Every table belonging to an account declares `ON DELETE CASCADE`,
so clearing `users` for a rewrite would take that account's tasks, goals and XP
with it — and `refresh_streak` rewrites `users` on every page load. The rows
are being replaced, not deleted, so the cascade must not fire. What the keys
are for is still checked on the way out: `PRAGMA foreign_key_check` runs
against the written table before the transaction commits, and a reference that
points at nothing rolls the whole write back.

**Writes are atomic**, in one transaction, so a reader sees all of the old rows
or all of the new. WAL is on, so a reader never blocks on the writer.

**Reads write.** `GET /api/get_user_data` decays a stale streak,
`GET /api/get_goals` re-syncs streak and focus goals, `GET /api/achievements`
records anything newly earned, and `GET /api/get_growth_ratings` files six
graded rows into `metric_snapshots`. All of them save as they go — into the
database, which is why the seed files no longer churn.

Each of those writes only the rows it changed. They did not: filing the day's
six grades rewrote every snapshot ever taken, and reading the badge wall
rewrote the badge catalogue and every account's preferences. A read that costs
thousands of INSERTs is a read that gets slower every day it is used, and the
statement counts are pinned by tests for that reason.

**Ids are millisecond timestamps**, stepped forward past collisions
(`connection.new_id`). They are primary keys, so two rows created in the same
millisecond can no longer share one.

**Levels are derived but stored.** Level N costs N × 100 XP; `level` is kept on
the account so a page renders without recomputing, and is recalculated from the
total on every completion.

**Passwords are hashes, and only hashes.** `check_password` has no plaintext
branch: a `password_hash` that is not recognisably a hash opens nothing. The
branch that accepted legacy plaintext values — and rewrote them on first
sign-in — is gone, because it made the column trusted to say what it held, and
`data/sql/users.sql` shipped two rows where it held the password itself.

## Starting over

Delete `data/summit.db` and run the app. It is rebuilt from `data/sql/` on the
next read, back to the state those files describe.

To point at a database somewhere else, set `SUMMIT_DB` to its path.

## Moving to a PostgreSQL server

The schema is deliberately plain, so the distance is short:

1. Put the `TIMESTAMPTZ`, `JSONB`, `BIGSERIAL` and `TEXT[]` types back, and the
   `GIN` index on `library_items.tags`. Nothing else in `data/sql/` changes.
2. Load the files in the order `config/settings.py:SCHEMA_FILES` gives —
   `users` first, since every foreign key points at `users.username`.
3. Repoint `connection.py` at a connection pool instead of a file. Every
   statement in the app is written in that one module and nowhere else, so
   `tracking/` and `api/` do not change — none of them knows where the data
   lives. Most of the SQL is portable as written; what is not is the SQLite
   spelling of a few things — `PRAGMA table_info` and `PRAGMA foreign_key_check`,
   `datetime('now')` for a default timestamp, and the `typeof(...)` guards in
   the aggregate reads, which exist because a SQLite column holds whatever was
   written to it and a PostgreSQL one does not.

The one thing that would need rethinking is `write_table`, which replaces a
whole table on every save: fine for a local file and wasteful over a network.
It is no longer on any hot path — the targeted reads and writes beside it
(`rows_for`, `columns_for`, `insert_row`, `update_row`, `find_row` and the
per-key `set_user_setting`) took over the request paths one at a time, and what
is left of `write_table` is bulk saves and the seeding scripts. The row dicts
carry their primary keys, so the rest can become an upsert plus a delete of
what is missing.

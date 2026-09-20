# Architecture

Summit is a FastAPI app over a SQLite datastore. The backend owns every rule and
answers JSON; the frontend is mid-move from server-rendered Jinja pages driven
by vanilla scripts to a React + TypeScript app under `frontend/src/`.

Both frontends are live at once, on purpose. The Jinja pages still render and
still work, so the app stays usable while React takes the pages over one at a
time. `backend/routes/pages.py` is the whole list of what still renders
server-side, and it shrinks to nothing as that finishes — it is down to
`/careers`, `/contact-support` and the hidden `/engine`.

## The shape of the repo

```
run.py                 entry point — a shim over backend/run.py, port 5050

package.json           the frontend's build, at the root beside run.py
vite.config.ts         points Vite at frontend/ and proxies the API
tsconfig.json          one config, covering frontend/src and vite.config.ts

backend/               the FastAPI app  (see "Layers" below)
frontend/
  index.html           the React app's entry
  html/                the original server-rendered pages, still live
  js/                  their scripts (served at /static/js/...)
  secret/              the easter-egg chain and the hidden /engine page
  public/              favicon, manifest, robots.txt
  src/                 the React app — pages, components, services, styles
    styles/            all CSS, shared by both frontends
                       (served at /static/css/... for the old pages)
utils/
  icons/               80 calendar SVGs      -> /static/icons/...
  images/              logo, and avatars/    -> /static/images/...
                       (50 profile pictures)
  fonts/               (empty)               -> /static/fonts/...
  assets/              (empty)               -> /static/assets/...
data/
  summit.db             the live database (SQLite, git-ignored)
  sql/                 its schema and seed, one .sql per part of the app
  backups/             the JSON stores it replaced, kept as a backup
docs/                  this folder
```

## Layers

The backend is a stack of layers, each depending only on the ones above it.

```
config/       every path, key and tunable. Nothing else hard-codes a path.
database/     connection.py — the SQLite store. The only code that opens a file.
tracking/     the rules. XP and streaks, focus, calendar events, growth
              grading, accounts. No web framework anywhere in here.
api/          one router per page: the endpoints that page calls, and the
              request bodies they accept. Reads the request, asks a tracker,
              shapes the JSON.
routes/       the routes that belong to no single page — accounts, theme, the
              Jinja pages, static assets — plus the list of routers to register.
middleware/   what happens around every request: the account gate, and the
              theme + current_user that every template gets.
```

`main.py` assembles them and knows no page by name; `routes/__init__.py` holds
the router list. Adding a page's API means writing `backend/api/<name>.py` with
a `router` and adding its name to `API_MODULES`.

`tracking/` and `database/` are the layers that survived the move off Flask
untouched — every rule that took months to get right is the same code. What was
rewritten is the web layer above them.

## Rules worth knowing

**The backend is the source of truth.** The client renders and animates; it
never decides what an account's XP, level or streak is. Scripts fetch with
`cache: 'no-store'` so a second tab can't show a stale number.

**Writes are atomic.** Every write in `database/connection.py` runs inside one
transaction, because the threaded dev server can read a table on one request
while another request is writing it. A reader sees all of the old rows or all
of the new ones.

**Writes are scoped to the rows that changed.** The module was built on
`read_table` + `write_table` — read every row, change one, write them all back
— and that pair is now reserved for bulk saves and seeding. The request paths
go through `insert_row`, `update_row`, `find_row`, `rows_for`, `columns_for`
and the per-table upserts beside them, which touch one account's rows and name
the columns they read. Each of those replaced a whole-table rewrite that had
been costing a page view thousands of statements.

**Reads can write.** A stale streak is decayed and self-tracking goals are
re-synced when they are read, and asking for the report card files six rows
into `metric_snapshots`. So the database changes as the app is used, with no
user action — `data/sql/` does not. A read that writes writes *little*: that
is the rule those paths are held to, and tests/test_report_card.py and
tests/test_achievement_earning.py count the statements to keep it.

**The theme is server-rendered.** `<html data-theme="...">` is decided from the
`theme` cookie before a byte is sent, so navigation never flashes the wrong
theme. See `middleware/context.py` and `routes/theme.py`.

**Static URLs are stable.** Assets live in top-level folders, not one `static/`
tree; `routes/assets.py` mounts each one under `/static/<kind>/...`, so every
`url_for('static', filename='css/...')` keeps working wherever a folder moves.

**A failure is HTTP 200.** Every endpoint answers `{"success": ...}`, and a
failure is `{"success": false, "message": "..."}` sent with **200** — the
client checks the flag, not the status. `api/reply.py` is the only place a
response is built, so that holds by construction, and `main.py` catches
FastAPI's own validation errors and puts them back into the same shape. An
endpoint that started returning 4xx would break its caller silently.

## What isn't built

`api/` and `tracking/` carry stubs for features that don't exist yet —
growthtree, achievements, notes, library, history, settings, analytics. Each
stub says what belongs in it, and `data/sql/` has their tables, schema only.

See [database.md](database.md) for the stores, [api.md](api.md) for the
endpoints, and [roadmap.md](roadmap.md) for what's next.

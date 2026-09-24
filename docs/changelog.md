# Changelog

Notable changes, newest first. Dates are the day the work landed on the branch.

## 2026-09-24 — A C++ engine, for the one thing Python is wrong for

`engine/` builds one small shared library; `backend/engine/` loads it with
ctypes and is the only thing in the backend that knows it exists. Nothing
requires it — `backend/engine/schedule.py` keeps a pure-Python planner and uses
it when the library is missing, stale or switched off with `SUMMIT_ENGINE=0`.
An unbuilt engine is a slightly worse plan, never a broken app.

What it does is **schedule**: fit a list of tasks into the week ahead, by
greedy seed and then simulated annealing over relocate-and-swap. 200 tasks
across 40 slots is 328,000 candidate rearrangements in 10ms, about 32 million
iterations a second.

**What it does not do is the rollup**, and that is the part worth keeping. The
daily rollup in `analytics.py` was the obvious candidate — the "10,000 users ×
50,000 events" shape — and it was written, proved equal to the Python on five
random datasets, and was *three times slower*. Flattening the nested dicts into
buffers cost 483ms against the 511ms the whole Python rollup took, before the
engine had added a single number. A rollup's work is proportional to the rows
going into it, so moving the work moves the rows, and there is nothing left to
win. It was deleted rather than shipped behind a flag.

So the rule, written at the top of `engine/include/summit/schedule.h`: **send
C++ a small question with a large answer behind it.** Planning sends 12KB and
gets 800 bytes back with a few million rearrangements in between; that ratio is
the whole reason the boundary is worth crossing.

No rule about Summit is in the C++. It is handed durations, values, deadlines,
subject ids, capacities and weights, all decided in Python. The one exception
is the scoring function, which exists in both languages because the fallback
planner needs a ruler on a machine with no engine — and the two are asserted
equal in `tests/test_engine_schedule.py`.

Nothing is wired to a route yet. The measurements and the call shape are in
`engine/README.md`.

## 2026-09-24 — The four stat cards get one header, and a week

The row had four different card shapes. Two led with an icon and two with bare
text; two carried a line under the name and two did not; the corner was a
different thing on each. Four cards holding four halves of the same question
looked like four unrelated panels.

- **One header on all four**: a 40px tinted disc, the name, a line under it
  about what the card is for, and a corner. The disc is a circle and larger
  than the 28px squares further down the page, which is what says this row is
  the top of the dashboard and the panels below it are not.
- **The corner is the Focus card's alone** — the 18px mark that opens the
  hidden chain, in the flow now rather than absolutely positioned over the
  card. The trend badge went back to a line under the header: a card is about
  270px of content here, and a name beside "about usual" is more than that.
- **Two footnotes became panels.** The Focus card's goal and the Streak card's
  record are each a *second* number, and a second number in the same box as
  the first reads as a continuation of it. Inset, bordered, they read as what
  the figure above is measured against.
- **Today's Progress stacks its figures** — a mark, the number, the label
  under it — so the card reads as three numbers first and three labels second.
- **The Streak card grew a week.** Seven marks, worked out from
  `current_streak` rather than fetched: a run of *n* is the last *n* days up to
  today, so the strip is the figure beside it drawn sideways and the two cannot
  disagree. Days still to come are drawn as neither done nor missed. It starts
  on the day `week_starts_on` says the week starts on.

The tag lines are pitched at `--text-xs` and the corner wraps before the name
does, both for the same reason: at four across 1370px, one card wrapping where
the others do not is the whole of what made the row look untidy.

## 2026-09-24 — The day turns over, and the goal comes off the method

Two bugs in `hooks/useFocusSession.ts`, both of them the same mistake: it read
an answer once and never asked again.

**The day.** The record is keyed `focus:<user>:<date>` and the date was read
off the clock at every write, while the state in memory belonged to whatever
day the tab had loaded on. Past midnight those disagree, so the first save of
the new day wrote yesterday's banked seconds under today's key and the morning
opened already won. The day is carried in the hook's state now and `rollOver`
turns it — on a minute's watch and whenever a hidden tab comes back. A session
running across midnight is cut in two rather than stopped: the part before is
banked against the day it was earned on, and the new day picks it up from its
own midnight.

**The goal.** It was `focus_goal_hours` in Settings, while the same account was
separately choosing a pomodoro level and style that already say how long its
day is meant to be. The order is the day's own goal, then the method
(`utils/pomodoroChoice`, read off `goalHoursFor`), then Settings for an account
that has never opened the timer. The timer announces a change so the Focus card
follows a level moved on another page without a reload.

## 2026-09-24 — The stat cards spend their slack on the figure

Four cards in one grid row are all as tall as the tallest, which is Today's
Progress and its ring. The other three put the difference in a single band —
heading, figure, a hole, then a footnote pinned to the floor by `margin-top:
auto`. `.dash-stat-mid` takes the slack instead and centres what is in it, so
the gap is split around the thing the card is about, and the footnotes line up
across the row without anything being pinned anywhere.

## 2026-09-24 — The hidden chain works in the light

The door and the pentagon after it both checked for dark mode, and between them
they made the chain unfindable rather than hidden: ten clicks on the mark in a
light-themed dashboard did nothing at all and explained nothing. Both gates are
gone. The silence of the first three clicks is what hides it, and the pentagon
no longer takes a pointer cursor in one theme and not the other — which was the
one visible tell it had.

## 2026-09-24 — No graph paper behind the calendar

The app's background grid is 80px squares that creep a square every forty
seconds; the calendar draws its own at 86px. Matching the pitch was tried and
cannot work, because the calendar's hours scroll inside their own pane and a
fixed layer cannot follow them. The paper comes off on a calendar view. The
wash and the drifting dots stay — they have nothing to line up with.

## 2026-09-24 — The four stat cards line up

Two of the headings on the dashboard's top row carry a 28px tinted disc and two
are bare text, so the heading box was 28px on Focus Time and Current Streak and
about 19 on Today's Progress and XP Overview — a 16px `--text-lg` line. Four
cards in a grid row all start at the same y, so the two titles with an icon sat
four or five pixels below the two without, and every figure under them inherited
it. Nothing was wrong inside any one card, which is why it read as vaguely
untidy rather than as a bug.

`.dash-stat-title` reserves the icon's height on all four now, and centres what
is in it. Giving either of the other two an icon later changes nothing.

## 2026-09-24 — The hidden chain gets its own front door

The way in was ten clicks on the rank in the rail's foot. The rail is mounted
outside the router, so those clicks could land anywhere in the app — and the
quote they open is on the dashboard alone. Bridging that took a navigation, an
in-memory latch and a window event carrying the news between two components
that never shared a parent.

The door is the Summit mark in the top-right corner of the Focus card now, and
the quote it opens is at the foot of the same page. Both are children of
`pages/Dashboard.tsx` and are on screen together, so one window event carries
the tenth click and nothing has to be held over.

- **`hooks/useTitleEgg.ts` is gone**, and so are `armReveal` and `takeReveal` in
  `utils/easterEgg.ts`. The latch existed to get a reveal across a page change
  that no longer happens. `EGG_UNLOCKED` stays, because the door and the room
  are still two components.
- **The rail's title is a title again** — no ref, no click handler, and the
  tremble it used to do is out of `styles/rail.css`.
- **The build is a curve, not a ramp.** Three clicks in silence, then the shake
  climbs as the square of the count: 0.7px on the fourth, 6.3 on the sixth,
  25.2 on the ninth, against the reveal's own 30. Linear gave six even steps,
  which reads as a control with a rate rather than as something about to give.
- **The mark is furniture first.** No role, no tabIndex, no alt text, no
  pointer cursor: what it looks like is a logo in the corner of a card. Silent
  for its first three clicks, and silent for good once the chain has paid out a
  title. (It was also silent in the light, which turned out to be a way of
  being broken rather than hidden — see the entry above.)
- **`Rail.egg.test.tsx` is now `Rail.title.test.tsx`**, holding the title menu.
  The door is tested in `components/Dashboard/StatCards.egg.test.tsx` and the
  room in `components/Dashboard/DailyQuote.test.tsx`.

One consequence worth knowing: Settings can hide the daily quote (`show_quote`)
and the stat cards (`show_stats`). One takes away the room and the other the
door, and neither says so — a setting that explained itself would be
advertising the secret.

## 2026-07-31 — The month view moves up the page

Both sides of the month — the name and its grid, the plan and its events, the
progress ring — rise by 20% of the screen height, closing the empty band the
vertical centring left under the top bar.

Twenty per cent is what there is room for on a tall screen and more than there
is on a short one: at 1440×900 a flat 20vh (180px) drives both headings up
behind the fixed top bar and the view selector, which don't move out of the way.
So the shift is the smaller of 20% of the screen and the room actually above the
headings — the full 260px at 1440×1300, 88px at 1440×900, and nothing at all
below 1120px, where the columns stack and the calendar is already at the top.

It is set alongside the heading alignment (`syncDayPanelToMonth`), so the two
are always worked out from the same measurement and the headings stay on one
line at every size. The shift is applied without a CSS transition on purpose: a
transition needs frames, and this runs at moments — a hidden pane being
revealed, a background tab — when there are none.

## 2026-07-31 — The calendar's controls find their corner

Week / Day / Month led the page from the top-left, on a row of its own above
whichever view was showing. It is one control shared by all three views, so
rather than three copies it comes out of the flow and pins to the card's
top-right corner — landing opposite each view's date selector, on the same
line, in every view.

- **Week and Day**: the date and its arrows on the left, the selector on the
  right, one row.
- **Day**: the Focus button is gone. Focus is started from the dashboard's own
  panel, and the Day view's Focus card still shows and edits the same session.
- **Month**: the "Add New Event" button is gone, and "What You'll Do Today" now
  starts on the same line as the month name. The dates block is centred
  vertically in its column, so where the month name lands depends on the height
  of the card and the grid beneath it — the panel's offset is measured from it
  (`syncDayPanelToMonth`) rather than guessed, and re-measured when the month is
  drawn, when the view is revealed and after a resize. Below 1120px the columns
  stack and there is no shared line, so the offset is dropped.

Two things learned the hard way, both the same lesson: `requestAnimationFrame`
never fires for a pane that is `display: none`, and it doesn't fire in a
background tab either. The reveal hook and the resize handler measure straight
away or on a timer instead.

## 2026-07-31 — Growth and the calendar lose their card

Both pages drew themselves inside a panel: a rounded card, inset from every
edge, with the real content inside it and a margin of empty page all the way
round — two frames between the data and the screen. The card is gone from both.
Its background, border, radius and shadow are dropped, the `--shell-fluid` /
`--shell-max` caps are lifted to the full width, and the room it was spending
on itself goes to the content.

- **Growth**: the chart's own white panel goes too (the dark theme had already
  made it transparent; the light theme now agrees), so the graph is drawn
  straight onto the page. The charts grew from `clamp(180px, 34vh, 340px)` to
  `clamp(260px, 56vh, 760px)` — better than half the screen instead of a third.
  The report-card view spans the page as well.
- **Calendar**: the week grid runs the width of the screen, the two columns
  have `clamp(20px, 2.4vw, 44px)` between them instead of 15px, and the page's
  own side padding is gone — the card was the only reason for it.

Nothing was resized in JS: the canvases size themselves to their rendered box
(`resizeCanvases`), so the charts simply came out bigger. `fit-scale.js` only
ever shrinks, and at 1024×700 it barely engages (zoom 0.98), so short screens
still fit without a scrollbar.

## 2026-07-31 — Growth's charts arrive by growing (Ascent 1.0.0)

The five analytics charts and the ratings sparkline are hand-drawn on canvas,
and they used to appear finished. Now a chart arrives the way the account it
describes did: every point's height is multiplied by a progress that eases from
0 to 1 over 780ms, so the curve and its fill rise out of the baseline together
and settle on the real figures.

- It plays when a graph is **chosen** and when the page **first has data**, and
  nowhere else. The thirty-second refresh, zoom, hover and resize all redraw at
  whatever progress is current, so they stay instant — a chart quietly
  re-growing every half minute would be a tic, not an entrance.
- The progress is applied in `computeGeometry`, which the hover reads too, so a
  crosshair caught mid-entrance lands on the line rather than where the line is
  going to be.
- The first flat frame is drawn synchronously, not in the first animation
  frame: a chart already at full height would otherwise stand there and then
  drop, which reads as a flicker rather than a start.
- `prefers-reduced-motion` gets the finished chart, immediately.

One thing the tabs didn't agree on: the "Average Task XP Daily" tab is called
`average` and its chart is called `avgTask`, so `initializeChart('average')`
had been drawing nothing at all — the chart only appeared because the resize it
triggers redraws everything. `TAB_TO_TYPE` settles the naming in one place.

## 2026-07-30 — The hidden chain had no first step

Its opening move is ten clicks on the app icon, and `easter-egg.js` was looking
for `document.querySelector('.logo')`. No page has a `.logo` — the top bar's
icon is `.topnav-brand`, and has been since the shared top nav was introduced —
so the script returned before wiring anything up. Nothing after it could be
reached either: no clue, so no pentagon, so no engine. It looked for all the
world like a chain of broken features rather than one dead selector.

- The icon is found by both names now, and in **dark mode it stops being the
  link home it appears to be**: the click is prevented, the icon pops (a bounce
  that grows with the count, beside the screen shake that was already there),
  and the tenth reveals the clue. In the light, or once the clue is out, it is
  an ordinary link again.
- **No streak.** Ten clicks at any pace. They had to land within 1.5s of each
  other, which is not how anybody clicks a logo on purpose.

## 2026-07-30 — A second door into the riddle

The testimonial on the landing page is now a way in. Click it and it twitches;
keep clicking and each one shakes it harder — a wee shiver on the first, the
card thrown about by the ninth — and on the tenth the page itself quakes, the
light goes out and the void riddle is hanging there. Ten clicks, at any pace.

The count started out as a streak, copied from the dashboard logo's ten clicks,
and that made the whole thing dead on arrival: a logo is something you drum on,
but a card is clicked deliberately, about once a second, and every gap over a
second and a half put the count back to one. It shook once and never again. A
synthetic `element.click()` loop passed it easily, which is exactly why it took
a real, slowly-paced pointer to see. Nothing resets the count now.

- The riddle opens **in place** rather than at `/calendar#void`, where the
  pentagon's arrow leads: that page needs an account, and a visitor reading a
  testimonial usually hasn't got one. `void.js` now exposes `VoidRiddle.open()`
  for it and still opens itself on arrival at the calendar, and `void.css`'s
  emptying of the page covers `.home-main` too. Same void, same question, same
  drop into `/engine`.
- **Answering the riddle is now itself the day's unlock.** `/engine` checks the
  flag the dashboard's logo sets and bounced anyone who arrived without it — so
  by this new door you could solve the riddle and be thrown back to the home
  page. Solving it stamps the flag; coming by the pentagon, it was already set.

## 2026-07-30 — The calendar becomes something you can work in

Two things the calendar showed but wouldn't let you do: finish a task, and move
a block. Both are now direct.

- **Click a task's name to finish it.** Hovering the name of an unfinished task
  turns it into a target — a green tick slides in on the Week and Day grids, a
  "Mark complete" hint rises on the Month view's plan cards — and one click
  finishes it. The completion runs `trackTaskCompletion`, the dashboard's own
  path, so the XP, the level, the streak and any "complete N tasks" goal all
  move exactly as they would there. `js/calendar/task-complete.js` holds the one
  in-flight guard (a double click can't award twice) and announces
  `calendartaskcomplete`, which is how a task finished in one view redraws in
  the others.
- **Drag a block to reschedule it.** Press anywhere in a block that isn't its ⋮
  menu or its click-to-finish name and it follows the pointer: up and down for
  the time, across for the day. The slot under the pointer is previewed with the
  times it would take, and a slot that overlaps ANY other block — task or event
  — is refused outright: the preview turns red and releasing leaves the block
  where it was. Blocks therefore still cannot overlap, the same rule the grid
  enforces when they are created.
- **Drag one edge to re-time that end.** A seven-pixel strip along a block's top
  and bottom resizes rather than moves: the start time or the end time changes
  and the other end stays pinned. Same refusal on overlap, and a block can't be
  dragged shorter than five minutes. The top strip stops short of the ⋮ menu, and
  both sit above the title in the stack, so neither the menu nor the
  click-to-finish name is ever swallowed by them.

Two notes for later:

- **A task's slot is moved by re-creating it.** The backend can't move a
  `created_at`, so a dragged task is deleted and re-added on its new slot, which
  is what editing its time through the modal already did. That's also why a
  finished task can't be dragged — re-creating it would re-open it — and why a
  block that only covers part of its task (a continuation) can't either.
- **Collision is measured off the live DOM**, not the render-time `dragBusy`
  map, so it stays true while the pointer crosses into another day's column.
- **A block is drawn four pixels shorter than it lasts** (the gap that keeps
  neighbours apart), and blocks under a minimum height are drawn taller. Both
  drags therefore work in the true span — the times, not the rendered box —
  because reading a block's end off the DOM would either let a drop land a
  minute inside its neighbour or quietly stretch a short block to fit its box.

## 2026-07-29 — The landing page becomes a demonstration

Five passes over `/home`, so the page shows the app working instead of
describing it. Everything is hand-written CSS and vanilla JS — no library, no
build step — and every piece of it degrades to a static page.

- **The opening.** A black curtain lifts, the logo draws itself stroke-first,
  then the greeting, date, headline (a word at a time), subtitle and buttons
  each take their turn. Behind every section: a grid, a slow gradient, drifting
  particles on one canvas, and a glow trailing the cursor.
- **A simulated dashboard** that fills itself in — sidebar, nav icons, cards,
  XP bar in three pulls, counters, a level flip and a rating stepping C to A —
  then floats on a seven-second cycle.
- **Two workflow demos.** A task is checked off, confettis, slides out, and its
  XP flies to the bar; an event is dragged Monday to Tuesday, snaps in with an
  overshoot, and the streak catches.
- **Charts that draw themselves**, measured rather than hard-coded:
  `getTotalLength()` for the dash, `getPointAtLength()` for the points. Bars
  grow on an overshoot curve, the gauge winds, the XP timeline writes itself.
- **The finish.** Feature-card hover, philosophy icons stroking themselves on,
  connector wires across the tech stack, a 500ms theme fade, and a closing CTA
  that glows, breathes, shines and ripples.

Three things worth carrying forward:

- **Animated elements are written in CSS in their *finished* state.** A script
  adds one class to put them back to the start and removes it a frame later.
  With no JS, a parse error, or `prefers-reduced-motion`, the page is just the
  page — it never sits blank waiting for a script that did not run. The usual
  arrangement (hide in CSS, reveal in JS) fails the opposite way.
- **`window.HomePlay`** is the shared kit: `onView` (play on enter, reset on
  leave, everything cancellable), `countThrough` (waypoint counters) and a
  cancellable `timeline`.
- **SVG bars are scaled, not resized.** Animating `y`/`height` through the CSS
  box looked right and was not: Chrome takes a unitless `y` and drops a
  unitless `height`, which left every bar flat with its markup value destroyed.

The feature strip — Task Management, Growth, Goals and the quote — now sits
directly under the hero, ahead of the dashboard demo, so the four links are the
first thing after the headline.

The Technology Stack section also stopped claiming React, TypeScript, FastAPI
and PostgreSQL, none of which this project uses. It reads HTML · CSS · Vanilla
JS, Python · Flask · Jinja, SQLite, SVG · Canvas.

## 2026-07-29 — An account menu under the avatar

Clicking the avatar opens a square panel: the username with a red Log Out
button beside it, and under that a row of all fifty pictures that scrolls
sideways inside the panel rather than widening it. Picking one is instant —
the tick and the bar's own picture move first and the request only confirms
them, putting both back if it fails.

- A pick is stored as an `avatar` row in `user_settings`, the key/value table
  that exists so a preference like this is not a migration. `avatar_for` reads
  it, and falls back to the derived picture for accounts that never picked.
- `POST /api/avatar`, in `routes/auth.py`: 401 without a session, 400 for any
  name that is not one of the fifty, so nothing reaches the row but a real one.
- The menu opens scrolled to the picture you are wearing, wherever it sits in
  the fifty.

## 2026-07-29 — Every account gets a profile picture

Fifty round drawings in `utils/images/avatars/` — astronauts and planets,
animals, plants and everyday things — replace the letter-in-a-circle the top
bar used to show. They are original flat SVGs drawn for the app, a couple of KB
each, so there is nothing licensed or downloaded in the tree.

- Which picture an account gets is **derived**: `md5(user id) % 50` in
  `backend/tracking/avatar.py`. No column, no migration, and every account that
  already existed has one too. `md5` rather than `hash()`, which Python salts
  per process and would repaint every account on restart. (Picking one from the
  account menu stores it and overrides this — see the entry above.)
- Keyed on the id rather than the username, so a rename keeps the picture.
- `middleware/context.py` now looks the account row up once and derives both
  `current_theme` and `current_avatar` from it; `auth.theme_for` went with it.
  `public_user()` gained an `avatar` URL for the client.

## 2026-07-28 — The .sql files become an actual database

The data lives in SQLite at `data/summit.db` now. `data/sql/` keeps the schema
and the rows to start from, and is read once — when the database does not exist
yet — so a fresh clone still comes up working with nothing to install or start.
`data/postgresql/` is gone; its contents moved to `data/sql/` with the DDL
rewritten for SQLite.

- `backend/database/connection.py` rewritten on `sqlite3`. The public interface
  is unchanged — `read_table`, `write_table`, `new_id` and the load/save pair
  per store — so `tracking/` and `pages/` did not change at all.
- Schemas converted: `TIMESTAMPTZ`/`JSONB`/`DATE` → `TEXT`, `BIGSERIAL` →
  `INTEGER PRIMARY KEY AUTOINCREMENT`, `TEXT[]` → JSON in a `TEXT` column,
  `SMALLINT` → `INTEGER`, `now()` → `datetime('now')`, `left()` → `substr()`,
  the `growth_daily` view to `CREATE VIEW IF NOT EXISTS`. The `GIN` index on
  `library_items.tags` has no SQLite equivalent and is dropped. Every `CHECK`,
  every foreign key and both partial/expression indexes survive as written.
- **A NULL column is left out of the row dict** rather than returned as `None`.
  Three call sites depend on it: `'met_deadline' in task` (640 of 714 tasks
  lack it), `xp_event.get('tasks_completed', 1)` (124 of 234), and
  `user.get('email_verified', True)` (5 of 6 accounts) — which would otherwise
  have locked those accounts out.
- **`write_table` disables foreign keys while it swaps a table's rows.** Every
  account-owned table is `ON DELETE CASCADE`, and `refresh_streak` rewrites
  `users` on every page load, so the delete half of the rewrite would have
  cascaded away every task, goal and XP row. `PRAGMA foreign_key_check` still
  runs on the written table before commit.
- Three goals belonging to `user_id = 'Default'`, an account that never
  existed, were dropped. They had been unreachable since the account gate
  landed.
- `data/summit.db` is git-ignored. The seed files no longer change as the app
  runs, so the datastore stops showing up as modified in every diff.

Verified by running the old and new code side by side: 371 KB of API responses
across four accounts, and the only differences are absent `null` keys and
`100.0` rendering as `100`.

## 2026-07-27 — The datastore moves into the .sql files

`data/postgresql/*.sql` is now where the data lives, not just where the schema
was going to. Each file holds its tables' definitions followed by their rows as
INSERT statements; `data/backups/*.json` is kept as a backup of the last
JSON-era state and is no longer read or written.

- `backend/database/connection.py` rewritten around the .sql files: reading
  parses the INSERTs and types each value from its column, writing regenerates
  one table's rows and leaves the rest of the file — schema, comments, other
  tables — byte for byte.
- The two blobs that hung off the user row fan out into tables of their own:
  `focus_days` and `day_focus_notes` in focus.sql. The single calendar list
  splits into `calendar_entries` and `calendar_events` in events.sql.
- The growth ratings moved out of `tracking/growth.py` into
  `tracking/analytics.py`, and every computation now files a dated row per
  metric into analytics.sql — so the report card accumulates a history instead
  of only ever showing today's number. growth.py keeps the chart series.
- The schemas were rewritten to match the data exactly, including the two
  hyphenated recurrence columns the calendar writes, which exist as quoted
  identifiers.
- achievements, history, library, notes and settings stay schema-only: those
  features are not built.
- Ids are primary keys now, so `connection.new_id` steps past collisions —
  creating four goals in one loop used to hand two of them the same id, and
  whichever the app found first won.

Verified against the JSON-backed app: all 75 read responses across every
account came back identical, and 55 of 57 write steps matched. The two that
differ are the id collision, which the old store had and this one does not.

## 2026-07-27 — Repo layout: utils, docs, and a Postgres-shaped data folder

Assets, docs and data moved to their final homes. No behaviour changed; the
URLs the frontend asks for are the same.

- `utilities/js/` → `frontend/js/`. All client scripts now sit with the
  templates they belong to; `styles/` stays a top-level folder.
- `images/` and `images/icons/` → `utils/images/` and `utils/icons/`, joined by
  empty `utils/fonts/` and `utils/assets/`.
- `data/*.json` → `data/backups/`, which is still the live datastore.
- `data/postgresql/` added: one `.sql` per table, twelve in all, written
  against the JSON shapes they describe. Nothing executes them yet.
- `utilities/docs/` → `docs/`, filled in — architecture, api, database,
  roadmap, this file — plus the project notes carried alongside them.
- `/static/<kind>/...` gained `fonts` and `assets`; the four existing kinds
  point at their new folders.

## 2026-07-26 — Backend rewrite

The backend was one 2200-line `paths.py` plus `auth.py`, `services/` and a
993-line `task_backend.py` at the repo root. It is now layered: `config/`,
`database/`, `tracking/`, `pages/`, `routes/`, `middleware/`, assembled by
`app.py`. Verified against the old backend response-for-response — 83 read
endpoints, 63 write steps and every page's HTML came back byte-identical.

- One module per page under `pages/`, one per tracked thing under `tracking/`.
  Stubs mark where the features that don't exist yet will go.
- Blueprint endpoints renamed (`main.dashboard` → `dashboard.page`, and so on);
  every template updated. Every URL is unchanged.
- Nothing opens `database.db` any more — no `init_db`, no sqlite import.
- `/api/get_xp_data` now answers from the JSON ledger. It used to read SQLite
  tables that were never populated and always replied "User not found".
- The legacy `/api/signup` now hashes the password instead of storing it in the
  clear.
- Dropped `/daily_xp` and `/test-dashboard`, whose templates never existed.

## Earlier

See `git log`. Highlights: the accounts and e-mail verification flow
(`a5e1512`), the hidden Engine easter-egg chain (`b964d1c` … `98d8a4e`), and
the calendar's daily counts, ledger XP and weekly focus time (`f5debe6`).

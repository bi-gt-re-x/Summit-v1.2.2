-- behavior — the mistakes a reader already knows they make, tracked until they stop.
--
-- The rules are backend/tracking/behavior.py, the endpoints backend/api/behavior.py,
-- what draws it frontend/src/components/Analytics/YourPatterns.tsx (Insights tab).
--
-- `behaviors` is one pattern each: "Impulsive answers on tests". `scope` says where it
-- can show up (all study work, tests and contests, one subject, or tasks named with a
-- word), which is what decides the sessions it's checked against. `source` is where it
-- came from: the reader's own words ('own'), a pattern the Log learned ('log', with the
-- insight's id in `source_ref`), or one Summit spotted in the record ('reason' with the
-- struggle reason's key, 'easy', 'length'). The record-based ones are measured from the
-- tasks themselves as well as from checks.
--
-- `status` is only what the reader decided: 'open', 'resolved' or 'archived'. Whether an
-- open one is Identified, Intervening or Improving is worked out from its checks and its
-- interventions every time it's read. `came_back` counts the times a check said it
-- happened again after it was marked resolved.
--
-- `behavior_checks` is one session looked at for one pattern: a task, from the question
-- after it, or a session logged by hand (a test at school Summit never saw), with what
-- it was in `label`. `times` is how often it happened then; 0 is a clean session, which
-- counts as much as a slip, since a rate needs both. `used` is whether the fix was
-- followed (NULL when there was no fix to ask about).
--
-- `behavior_interventions` is each fix tried, in order. One is live at a time (no
-- `ended_on`). `outcome` is the reader's call when it ends: 'kept', 'dropped' or
-- 'replaced' (a new one started over it).

CREATE TABLE IF NOT EXISTS behaviors (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    title          TEXT NOT NULL,
    detail         TEXT NOT NULL DEFAULT '',
    scope          TEXT NOT NULL DEFAULT 'study',
    subject        TEXT NOT NULL DEFAULT '',
    words          TEXT NOT NULL DEFAULT '',
    source         TEXT NOT NULL DEFAULT 'own',
    source_ref     TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'open',
    identified_on  TEXT NOT NULL,
    resolved_on    TEXT,
    came_back      INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    CHECK (status IN ('open', 'resolved', 'archived'))
);

CREATE INDEX IF NOT EXISTS behaviors_user_idx ON behaviors (user_id, status);

CREATE TABLE IF NOT EXISTS behavior_checks (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    behavior_id      TEXT NOT NULL,
    task_id          TEXT NOT NULL DEFAULT '',
    day              TEXT NOT NULL,
    times            INTEGER NOT NULL DEFAULT 0,
    used             INTEGER,
    intervention_id  TEXT NOT NULL DEFAULT '',
    label            TEXT NOT NULL DEFAULT '',
    note             TEXT NOT NULL DEFAULT '',
    created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS behavior_checks_user_idx ON behavior_checks (user_id, behavior_id);

CREATE TABLE IF NOT EXISTS behavior_interventions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    behavior_id  TEXT NOT NULL,
    title        TEXT NOT NULL,
    how          TEXT NOT NULL DEFAULT '',
    started_on   TEXT NOT NULL,
    ended_on     TEXT,
    outcome      TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS behavior_interventions_user_idx ON behavior_interventions (user_id, behavior_id);

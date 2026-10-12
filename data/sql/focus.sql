-- focus — how long the user actually sat down and worked.
--
-- Both tables used to be JSON blobs on the user row. The focus session itself
-- runs client-side; what is stored is each day's total, which the calendar's
-- Weekly Focus Time panel, the growth chart and focus-type goals all read.

CREATE TABLE IF NOT EXISTS focus_days (
    user_id     TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    date        TEXT NOT NULL,

    -- Never lowered by a later sync: a stale client cannot shrink a day's
    -- already-recorded total.
    seconds     NUMERIC DEFAULT 0 CHECK (seconds >= 0),

    -- The daily focus goal that was set on the day, in hours.
    goal_hours  NUMERIC DEFAULT 2 CHECK (goal_hours >= 0),

    PRIMARY KEY (user_id, date)
);

-- The one-line "Focus" note attached to a calendar day. The Week, Day and
-- Month views all show it, so an edit in one view lands everywhere.
CREATE TABLE IF NOT EXISTS day_focus_notes (
    user_id  TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    date     TEXT NOT NULL,
    text     TEXT NOT NULL CHECK (length(text) <= 200),

    PRIMARY KEY (user_id, date)
);

-- One row per focus sitting: how long it ran, how cleanly, and what it was
-- for. focus_days above is the ledger of hours; this is the shape of them,
-- which the Timer page's sittings panel, its length recommendation and the
-- after-sitting strip read. Written by the browser as each sitting ends
-- (hooks/useIntervals), and kept here so a second device or a cleared cache
-- sees the same record. Served by backend/api/focus.py.
CREATE TABLE IF NOT EXISTS focus_sittings (
    -- Made by the browser that ran the sitting, so a row written offline and
    -- sent again later is the same row rather than a second one. Scoped to the
    -- account by the key, so two accounts can never collide on one.
    id          TEXT NOT NULL,
    user_id     TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,

    day         TEXT NOT NULL,
    -- Epoch milliseconds the sitting ended. NULL for rows logged before the
    -- browser kept it, which read as "some time that day".
    at          INTEGER,
    style_id    TEXT NOT NULL,
    planned     INTEGER NOT NULL DEFAULT 0,
    minutes     INTEGER NOT NULL DEFAULT 0,
    pauses      INTEGER NOT NULL DEFAULT 0,
    finished    BOOLEAN NOT NULL DEFAULT FALSE,
    -- Minutes into the sitting at which it was paused, comma-separated.
    breaks      TEXT NOT NULL DEFAULT '',

    -- The task it was for. The title is copied, so a renamed or deleted task
    -- still reads back as what it was called at the time.
    task_id     TEXT,
    task_title  TEXT,

    -- The optional answers the sitting carried. See components/Timer/intervals.ts.
    intent      TEXT,
    target      NUMERIC,
    done        NUMERIC,
    met         BOOLEAN,
    readiness   TEXT,
    kind        TEXT,

    PRIMARY KEY (user_id, id),
    CHECK (minutes >= 0 AND planned >= 0 AND pauses >= 0)
);

CREATE INDEX IF NOT EXISTS focus_sittings_user_at ON focus_sittings (user_id, at);

-- ---- rows: focus_days ----
INSERT INTO focus_days (user_id, date, seconds, goal_hours) VALUES ('demo', '2026-07-22', 240, 2.5);
INSERT INTO focus_days (user_id, date, seconds, goal_hours) VALUES ('demo', '2026-07-23', 77, 2);
INSERT INTO focus_days (user_id, date, seconds, goal_hours) VALUES ('demo', '2026-07-24', 2849, 2);
INSERT INTO focus_days (user_id, date, seconds, goal_hours) VALUES ('avery', '2026-07-22', 30245, 12);
INSERT INTO focus_days (user_id, date, seconds, goal_hours) VALUES ('avery', '2026-07-23', 178, 2);
INSERT INTO focus_days (user_id, date, seconds, goal_hours) VALUES ('avery', '2026-07-24', 9, 3.5);
INSERT INTO focus_days (user_id, date, seconds, goal_hours) VALUES ('jordan', '2026-07-25', 438, 12);
INSERT INTO focus_days (user_id, date, seconds, goal_hours) VALUES ('jordan', '2026-07-26', 4, 2);
INSERT INTO focus_days (user_id, date, seconds, goal_hours) VALUES ('morgan', '2026-07-26', 118, 2);

-- ---- rows: day_focus_notes ----
INSERT INTO day_focus_notes (user_id, date, text) VALUES ('jordan', '2026-07-25', 'gh');

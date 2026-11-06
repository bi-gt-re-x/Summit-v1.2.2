-- experiments — changes a reader is testing on their own work, and how each came out.
-- weekly_reviews — the weeks a reader has reviewed, with their note and their bet.
--
-- The rules are backend/tracking/experiments.py and backend/tracking/weekly.py; the
-- endpoints are backend/api/experiments.py; the page is the Weekly review tab
-- (frontend/src/components/Analytics/tabs/ReviewTab.tsx).
--
-- A test's result is worked out from the tasks every time it's read, so it can't go
-- stale while it runs. `verdict` and `result` are written once, when the reader
-- decides to keep or drop it, so the record of what they decided can't change later.

CREATE TABLE IF NOT EXISTS experiments (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    params      TEXT NOT NULL DEFAULT '{}',
    goal_id     TEXT NOT NULL DEFAULT '',
    subject     TEXT NOT NULL DEFAULT '',
    title       TEXT NOT NULL,
    why         TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'running',
    started_on  TEXT NOT NULL,
    ends_on     TEXT NOT NULL,
    verdict     TEXT,
    result      TEXT,
    kept        INTEGER,
    decided_at  TEXT,
    created_at  TEXT NOT NULL,
    CHECK (status IN ('running', 'stopped', 'done'))
);

CREATE INDEX IF NOT EXISTS experiments_user_idx ON experiments (user_id, status);

CREATE TABLE IF NOT EXISTS weekly_reviews (
    user_id     TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    week_start  TEXT NOT NULL,
    note        TEXT NOT NULL DEFAULT '',
    bet_id      TEXT,
    done_at     TEXT NOT NULL,
    PRIMARY KEY (user_id, week_start)
);

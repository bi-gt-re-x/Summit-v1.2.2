-- log — the Log page: a private journal, and what Summit learns from it.
--
-- Written by backend/api/journal.py. `log_entries` is what the account wrote,
-- as written. `log_insights` is what backend/tracking/journal.py read out of
-- it: short lines about the person, each with a kind (a long-term goal, a
-- recurring pattern, a preference or a passing feeling) and a topic, and the
-- ids of the entries that back it up in `sources`, comma-separated.
--
-- `status` is 'active' (used in prompts), 'retired' (a later entry said it
-- stopped being true) or 'removed' (the person took it out on the Log page;
-- kept only so it isn't learned again, never shown or used). A passing feeling
-- has `expires_at` and is ignored after it. Deleting an entry deletes every
-- insight it was the only source of.
--
-- Neither table is read by Spaces, search or anything another account can see.

CREATE TABLE IF NOT EXISTS log_entries (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT '',
    body        TEXT NOT NULL DEFAULT '',
    -- Whether the current text has been read for insights yet.
    learn_state TEXT NOT NULL DEFAULT 'waiting',
    learned_at  TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    CHECK (learn_state IN ('waiting', 'done', 'failed', 'off'))
);

CREATE INDEX IF NOT EXISTS log_entries_user_idx
    ON log_entries (user_id, created_at);

CREATE TABLE IF NOT EXISTS log_insights (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    topic       TEXT NOT NULL,
    text        TEXT NOT NULL,
    sources     TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'active',
    expires_at  TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    CHECK (kind IN ('goal', 'pattern', 'preference', 'feeling')),
    CHECK (status IN ('active', 'retired', 'removed'))
);

CREATE INDEX IF NOT EXISTS log_insights_user_idx
    ON log_insights (user_id, status);

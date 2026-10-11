-- background — what an account says about itself at sign-up, and the facts
-- Summit keeps from it.
--
-- Written by backend/api/background.py from the "About you" step at the end of
-- sign-up (frontend/src/components/Auth/AboutYou.tsx) and from Settings. Read
-- by Analytics, which shows the facts and gives a head start on its unlock
-- waits, and by the model prompts in backend/tracking/subject_ai.py.
--
-- `user_background` is the answers as written, one row per account, with how
-- detailed they were judged when saved (shared/rules.json, "background").
-- `user_facts` is each answer split into lines and filed by
-- backend/tracking/background.py: an achievement, a stat, an activity, an aim
-- or a line about the person, with the subject it names and the first number
-- in it. A save replaces every fact with source 'background'; the column is
-- there so facts from elsewhere can join the list without being wiped.

CREATE TABLE IF NOT EXISTS user_background (
    user_id     TEXT PRIMARY KEY REFERENCES users (username) ON DELETE CASCADE,
    describe    TEXT NOT NULL DEFAULT '',
    doing       TEXT NOT NULL DEFAULT '',
    done        TEXT NOT NULL DEFAULT '',
    improve     TEXT NOT NULL DEFAULT '',
    words       INTEGER NOT NULL DEFAULT 0,
    detail      TEXT NOT NULL DEFAULT 'none',
    head_start  INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (detail IN ('none', 'brief', 'good', 'detailed')),
    CHECK (head_start >= 0)
);

CREATE TABLE IF NOT EXISTS user_facts (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    text        TEXT NOT NULL,
    subject     TEXT,
    value       REAL,
    unit        TEXT NOT NULL DEFAULT '',
    question    TEXT NOT NULL DEFAULT '',
    position    INTEGER NOT NULL DEFAULT 0,
    source      TEXT NOT NULL DEFAULT 'background',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (kind IN ('achievement', 'stat', 'activity', 'aim', 'about'))
);

CREATE INDEX IF NOT EXISTS user_facts_user_idx
    ON user_facts (user_id, position);

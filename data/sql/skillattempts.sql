-- skill_attempts — what the reader got right and wrong, per skill.
--
-- Built: backend/api/skillattempts.py serves it, the problems screen in
-- frontend/src/components/SkillTree/LatticePanel.tsx writes it, and
-- frontend/src/utils/skillLevel.ts turns it into a level.
--
-- ## Why this table exists
--
-- Everything the skill tree said about a reader was authored. A node's state
-- and percentage are identical on every account, and the one thing a task
-- records is its subject — so "Factoring: Level 2 → Level 4" was not a claim
-- the app could make. The steps under a node have had problems for a while,
-- graded warm-up, core and stretch, with the answer behind a button. Nothing
-- remembered whether the reader got them right. This is that memory, and it
-- is the only per-skill evidence Summit holds.
--
-- ## One row is one batch, not one problem
--
-- `attempted` and `correct` rather than a boolean, because there are two ways
-- in and they differ only in size:
--
--     source 'problem'   one of the step's own problems, marked right or wrong
--                        on the problems screen — attempted is always 1
--     source 'log'       work done somewhere else, logged as "12 medium, 9
--                        right" — a textbook exercise is evidence too
--
-- Storing a log as twelve rows would invent twelve timestamps nobody gave.
--
-- ## What a skill is here
--
-- `node_id` and `ordinal`: the step of a node's written programme, which is
-- the grain the problems are written at ("Factor Simple Quadratics" is step 3
-- of Quadratics). `ordinal` 0 is the node as a whole, for the nodes nothing
-- has been written for yet — a reader can still log work against them.
--
-- `weight` keeps the problems' own words (warmup / core / stretch). The page
-- says Easy / Medium / Hard; the column says what the problem was graded as.
--
-- ## Nothing derived is stored
--
-- No level, no accuracy, no mastery. They are all functions of these rows and
-- a date, which is what lets the page say what the level *was* on any past
-- day without a history table — the same reasoning utils/skillGrowth gives
-- for the subject score.
CREATE TABLE IF NOT EXISTS skill_attempts (
    id         TEXT    PRIMARY KEY,
    user_id    TEXT    NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    node_id    TEXT    NOT NULL,
    ordinal    INTEGER NOT NULL DEFAULT 0,
    slot       INTEGER,
    weight     TEXT    NOT NULL,
    attempted  INTEGER NOT NULL DEFAULT 1,
    correct    INTEGER NOT NULL DEFAULT 0,
    source     TEXT    NOT NULL DEFAULT 'problem',
    at         TEXT    NOT NULL,
    CHECK (ordinal >= 0),
    CHECK (weight IN ('warmup', 'core', 'stretch')),
    CHECK (attempted >= 1),
    CHECK (correct >= 0 AND correct <= attempted),
    CHECK (source IN ('problem', 'log'))
);

CREATE INDEX IF NOT EXISTS skill_attempts_user_idx
    ON skill_attempts (user_id, node_id, ordinal);

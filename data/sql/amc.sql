-- The AMC prep tables: what an account has answered, what it has to review,
-- the mock contests it has sat, and its study plan.
--
-- The problems themselves are not here. They are content, versioned with the
-- code in backend/amc/bank.py and backend/amc/catalog.py, so a problem's id is
-- the only thing these tables hold about it.

-- One row per answer submitted: on a problem page, in a review session, or as
-- part of a mock contest. Never edited. `source` says which; 'reveal' is
-- "show me the solution" before answering, which counts as a miss.
CREATE TABLE IF NOT EXISTS amc_attempts (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    problem_id  TEXT NOT NULL,
    answer      TEXT DEFAULT '',
    correct     INTEGER NOT NULL DEFAULT 0,
    seconds     INTEGER DEFAULT 0,
    source      TEXT NOT NULL DEFAULT 'practice',
    at          TEXT NOT NULL,
    CHECK (source IN ('practice', 'review', 'mock', 'reveal'))
);

CREATE INDEX IF NOT EXISTS amc_attempts_user_idx ON amc_attempts (user_id, problem_id);

-- The error log. A missed problem comes back after 3, 10 and 21 days; a right
-- answer on a due review moves it up a stage, a wrong one sends it back to
-- the start, and passing stage 3 marks it mastered (backend/amc/engine.py).
CREATE TABLE IF NOT EXISTS amc_reviews (
    user_id     TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    problem_id  TEXT NOT NULL,
    stage       INTEGER NOT NULL DEFAULT 0,
    due         TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',
    note        TEXT DEFAULT '',
    misses      INTEGER NOT NULL DEFAULT 1,
    added_at    TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (user_id, problem_id),
    CHECK (status IN ('active', 'mastered'))
);

-- A contest sat in the app (kind 'mock', graded here) or a past contest taken
-- elsewhere whose score the account wrote down (kind 'logged').
-- `answers` is JSON: {"1": "C", "2": "", ...} for a mock, '{}' for a log.
CREATE TABLE IF NOT EXISTS amc_mocks (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    contest_id  TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'mock',
    answers     TEXT DEFAULT '{}',
    score       REAL NOT NULL DEFAULT 0,
    correct     INTEGER DEFAULT 0,
    wrong       INTEGER DEFAULT 0,
    blank       INTEGER DEFAULT 0,
    seconds     INTEGER DEFAULT 0,
    note        TEXT DEFAULT '',
    at          TEXT NOT NULL,
    CHECK (kind IN ('mock', 'logged'))
);

CREATE INDEX IF NOT EXISTS amc_mocks_user_idx ON amc_mocks (user_id, contest_id);

-- One study plan per account. The weeks are generated from these settings and
-- the account's results every time the plan is read, so they never go stale;
-- only the settings and today's ticks are stored. `checks` is JSON:
-- {"2026-11-12": ["review", "practice"]}.
CREATE TABLE IF NOT EXISTS amc_plans (
    user_id     TEXT PRIMARY KEY REFERENCES users (username) ON DELETE CASCADE,
    target      TEXT NOT NULL DEFAULT 'AMC 10',
    exam_date   TEXT NOT NULL,
    goal_score  REAL NOT NULL DEFAULT 105,
    hours       INTEGER NOT NULL DEFAULT 5,
    checks      TEXT DEFAULT '{}',
    -- What the student told the coach (JSON) and the plan it wrote (JSON).
    -- See backend/amc/coach.py.
    details     TEXT DEFAULT '{}',
    coach       TEXT DEFAULT '',
    coach_at    TEXT DEFAULT '',
    coach_by    TEXT DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    CHECK (target IN ('AMC 10', 'AMC 12', 'AIME'))
);

-- Official contest problems, imported by pasting the AoPS page source and the
-- answer key (backend/amc/official.py). Shared by every account on this
-- install, so keyed by contest and number rather than by user. The text is the
-- MAA's; it lives in this database, not in the repository.
CREATE TABLE IF NOT EXISTS amc_official (
    contest_id   TEXT NOT NULL,
    number       INTEGER NOT NULL,
    statement    TEXT NOT NULL,
    choices      TEXT,
    answer       TEXT NOT NULL,
    diagram      TEXT DEFAULT '',
    topic        TEXT DEFAULT '',
    imported_by  TEXT DEFAULT '',
    imported_at  TEXT NOT NULL,
    PRIMARY KEY (contest_id, number)
);

-- What the AI layer (backend/amc/ai.py) has answered: a cache, so the same hint
-- or the same day's analysis is asked for once, and a log the daily limit is
-- counted from. `user_id` is '' for answers shared by every account (a hint
-- for a problem). `payload` is the JSON the model returned, after checking.
CREATE TABLE IF NOT EXISTS amc_ai (
    id          TEXT PRIMARY KEY,
    user_id     TEXT DEFAULT '',
    kind        TEXT NOT NULL,
    cache_key   TEXT NOT NULL,
    payload     TEXT NOT NULL,
    provider    TEXT DEFAULT '',
    at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS amc_ai_key_idx ON amc_ai (kind, cache_key);
CREATE INDEX IF NOT EXISTS amc_ai_user_idx ON amc_ai (user_id, at);

-- Problems the AI wrote on request ("more like this", a practice set). Shared
-- by every account, like amc_official. A problem is only stored after a second,
-- independent solve agreed with its answer (backend/amc/create.py). `choices`
-- and `solution` are JSON.
CREATE TABLE IF NOT EXISTS amc_generated (
    id          TEXT PRIMARY KEY,
    created_by  TEXT DEFAULT '',
    level       TEXT NOT NULL,
    topic       TEXT NOT NULL,
    technique   TEXT NOT NULL,
    rating      REAL NOT NULL,
    statement   TEXT NOT NULL,
    choices     TEXT,
    answer      TEXT NOT NULL,
    solution    TEXT NOT NULL,
    insight     TEXT DEFAULT '',
    trap        TEXT DEFAULT '',
    based_on    TEXT DEFAULT '',
    provider    TEXT DEFAULT '',
    created_at  TEXT NOT NULL
);

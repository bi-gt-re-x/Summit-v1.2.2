-- skill_checks — the short quiz that masters a skill-tree node.
--
-- Built: backend/api/skillchecks.py serves it, the quiz screen in
-- frontend/src/components/SkillTree/SkillCheck.tsx takes it, and
-- backend/tracking/skill_progress.py reads a pass as the node being done.
--
-- ## One row per check, open until its last answer
--
-- A check is three to five of the node's written problems, chosen when it
-- starts (backend/tracking/skill_check.py `pick`) and kept here, so a reload
-- mid-check comes back to the same questions and a retake can avoid the last
-- one's. `passed` is NULL while the check is open: an unfinished check is not
-- a failed one, and nothing reads it as either.
--
-- ## What the answers are
--
-- `questions` is the list asked, `[{ordinal, slot, weight}]` (a problem in
-- skill_problems is node + ordinal + slot). `answers` runs alongside it,
-- `[{given, right, how}]` with `how` 'auto' (graded on the number) or 'self'
-- (the reader compared with the worked answer), or 'skipped' (asked for the
-- answer without trying). Each graded answer is also a row in skill_attempts,
-- which is what moves the step's level; this table is the check as a whole.
CREATE TABLE IF NOT EXISTS skill_checks (
    id           TEXT    PRIMARY KEY,
    user_id      TEXT    NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    node_id      TEXT    NOT NULL,
    questions    TEXT    NOT NULL DEFAULT '[]',
    answers      TEXT    NOT NULL DEFAULT '[]',
    asked        INTEGER NOT NULL,
    need         INTEGER NOT NULL,
    correct      INTEGER NOT NULL DEFAULT 0,
    passed       BOOLEAN,
    started_at   TEXT    NOT NULL,
    finished_at  TEXT,
    CHECK (asked BETWEEN 1 AND 10),
    CHECK (need BETWEEN 1 AND asked),
    CHECK (correct >= 0 AND correct <= asked)
);

CREATE INDEX IF NOT EXISTS skill_checks_user_idx
    ON skill_checks (user_id, node_id);

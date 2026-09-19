-- goals — "earn N XP", "reach an N-day streak", "complete N tasks",
-- "focus N minutes".
--
-- Each type counts with its own pair of columns rather than a shared
-- current/target, because a goal keeps its other targets when its type is
-- edited.
--
-- XP and task goals are fed by the app when a task is completed. Streak and
-- focus goals track themselves: a streak goal follows the account's live
-- streak, and a focus goal measures the focus time accumulated since it was
-- set, which is what focus_baseline_seconds remembers.

CREATE TABLE IF NOT EXISTS goals (
    id                      TEXT PRIMARY KEY,
    user_id                 TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,

    title                   TEXT NOT NULL,
    description             TEXT DEFAULT '',
    goal_type               TEXT DEFAULT 'xp'
                            CHECK (goal_type IN ('xp', 'streak', 'tasks', 'focus')),

    target_xp               INTEGER DEFAULT 0,
    current_xp              INTEGER DEFAULT 0,
    target_streak           INTEGER DEFAULT 0,
    current_streak          INTEGER DEFAULT 0,
    target_tasks            INTEGER DEFAULT 0,
    current_tasks           INTEGER DEFAULT 0,
    target_focus            INTEGER DEFAULT 0,
    current_focus           NUMERIC DEFAULT 0,

    -- The account's lifetime focus seconds when a focus goal was created;
    -- progress is (lifetime total now - this).
    focus_baseline_seconds  NUMERIC DEFAULT 0,

    -- Denormalised copies of the active type's target and percentage, which
    -- the goals page renders directly.
    target_value            INTEGER DEFAULT 0,
    progress                NUMERIC DEFAULT 0,

    priority                INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    deadline                TEXT,
    status                  TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    created_at              TEXT,

    -- ---- The outcome layer -------------------------------------------------
    -- The four columns pairs above make a goal a counter. These make it an
    -- outcome: what it is about, why it is worth doing, when it started, and
    -- how success is measured when the answer is not one of the four.
    --
    -- `measure` is the one that decides how progress is read:
    --   'xp' | 'streak' | 'tasks' | 'focus'  the counter above, as before
    --   'number'      a figure of the user's own — a rating, a score, a count
    --                 of users — in `current_value` against `target_number`,
    --                 labelled `unit`
    --   'milestones'  no number at all; progress is checkpoints completed
    -- An empty `measure` is a row written before this existed and reads as its
    -- `goal_type`, which is what it always was. Nothing back-fills it: the
    -- normalisation is one line in the API and a migration would be a write
    -- over data to say something already true.
    --
    -- `goal_type` keeps its CHECK and its four values. A fifth would mean
    -- rebuilding the table, and there is nothing a fifth would say that
    -- `measure` does not.
    category                TEXT DEFAULT 'other',
    why                     TEXT DEFAULT '',
    start_date              TEXT,
    measure                 TEXT DEFAULT '',
    unit                    TEXT DEFAULT '',
    current_value           NUMERIC DEFAULT 0,
    target_number           NUMERIC DEFAULT 0,
    -- Comma-separated subject ids. A list rather than JSON because it is only
    -- ever read whole and split, and a TEXT column that a human can read in a
    -- database browser is worth more here than a structure nothing nests.
    subject_ids             TEXT DEFAULT '',
    -- Which chart the goal card draws. Empty lets the page pick one from the
    -- goal's data; see frontend/src/utils/goalVisuals.ts.
    chart                   TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS goals_user_status_idx ON goals (user_id, status);
CREATE INDEX IF NOT EXISTS goals_user_type_idx ON goals (user_id, goal_type);


-- goal_milestones — the checkpoints between where a goal starts and where it ends.
--
-- A milestone is not a task and this table is not `tasks` with a goal column.
-- A task is one action; a milestone is a state the goal reaches — "Reach
-- Silver", "Finish the React migration" — which is why it has an order and a
-- status of its own and no XP, no priority and no timer. Tasks point at a
-- milestone (see tasks.goal_id / tasks.milestone_id); the milestone does not
-- own them, because the checkpoint is still the checkpoint whether four tasks
-- or forty went into it.
--
-- `position` is the execution order and is what the timeline draws. It is
-- rewritten as a dense 0..n-1 run on every reorder rather than being sparse:
-- the list is short and a gap in it is a bug waiting to be read as an order.
--
-- `steps` is the checklist of small pieces of work that finish the checkpoint,
-- as a JSON array of {id, title, done}. A column rather than a table, and that
-- is the one place this schema stores a list inline: the list is capped at a
-- handful, it is read and written only ever with the milestone that owns it,
-- and nothing queries a step on its own. A table would buy a cascade, a
-- position rewrite and a second round trip for a checklist of three.
--
-- It does NOT make a milestone into a task list. A step has no XP, no due
-- date, no timer and no priority, and never appears on the tasks page — the
-- distinction the note above draws still holds. Real tasks still point here
-- through tasks.milestone_id, and a step and a linked task are different
-- claims: "the checkpoint needs this doing" against "this is scheduled work".
CREATE TABLE IF NOT EXISTS goal_milestones (
    id           TEXT PRIMARY KEY,
    goal_id      TEXT NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL,
    title        TEXT NOT NULL,
    note         TEXT DEFAULT '',
    position     INTEGER DEFAULT 0,
    status       TEXT DEFAULT 'pending'
                 CHECK (status IN ('pending', 'active', 'done')),
    steps        TEXT DEFAULT '',
    target_date  TEXT,
    completed_at TEXT,
    created_at   TEXT
);

CREATE INDEX IF NOT EXISTS goal_milestones_goal_idx
    ON goal_milestones (goal_id, position);

-- task_goal_matches — which goals a task counts toward, worked out when the
-- task is written and read back by everything else. See backend/goal_matcher.
--
-- Derived, not authored: the task is the source of truth and this is a cache
-- of one conclusion about it. References only — a goal's title, description
-- and figures stay on the goal, so renaming a goal changes nothing here.
--
-- One row per task-goal pair, so a goal cannot be listed twice for a task and
-- "how many tasks count toward this goal" is one indexed count. Both ends
-- cascade: a deleted goal or task takes its rows with it rather than leaving
-- an id that names nothing. `write_table` swaps rows with foreign keys off, so
-- the settings page's bulk deletes clear this table by hand first, and readers
-- join against `goals` so a link that slipped through anyway is ignored.
--
-- A task with no rows here has no goals, which is a valid answer. What the
-- matcher concluded — matched, ambiguous, unmatched, pending — and which
-- version of it concluded that are on the task (`goal_match_status`,
-- `goal_match_version`), since both are about the task and not any one goal.
CREATE TABLE IF NOT EXISTS task_goal_matches (
    task_id  TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    goal_id  TEXT NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
    user_id  TEXT NOT NULL,
    score    REAL NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 1),
    source   TEXT NOT NULL DEFAULT 'rule'
             CHECK (source IN ('explicit', 'rule', 'ai')),
    PRIMARY KEY (task_id, goal_id)
);

CREATE INDEX IF NOT EXISTS task_goal_matches_goal_idx
    ON task_goal_matches (user_id, goal_id);

-- goal_ai_answers — what the model said, keyed on what it was asked.
--
-- Only ambiguous tasks are ever asked about (backend/goal_matcher/ai.py), and
-- the question is one task title, its subject and a shortlist of goals. The
-- key is a hash of exactly that, so eighty-five tasks with the same title are
-- one question, and a restart does not buy the answer again.
--
-- Ids only, comma-separated, the same as `subject_ids` on a goal: the answer
-- is which of the goals offered, and a goal that has since been deleted is
-- dropped when the row is read.
CREATE TABLE IF NOT EXISTS goal_ai_answers (
    user_id     TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    ask_key     TEXT NOT NULL,
    goal_ids    TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, ask_key)
);


-- ---- rows: goals ----
INSERT INTO goals (id, user_id, title, description, goal_type, target_xp, current_xp, target_streak, current_streak, target_tasks, current_tasks, target_focus, current_focus, focus_baseline_seconds, target_value, progress, priority, deadline, status, created_at) VALUES ('1783024779328', 'demo', '1', '1', 'xp', 1111, 1111, 0, 0, 0, 0, NULL, NULL, NULL, 1111, 100, NULL, '', 'completed', '2026-07-02T15:39:39.328509');
INSERT INTO goals (id, user_id, title, description, goal_type, target_xp, current_xp, target_streak, current_streak, target_tasks, current_tasks, target_focus, current_focus, focus_baseline_seconds, target_value, progress, priority, deadline, status, created_at) VALUES ('1783025498928', 'demo', '1', '1', 'xp', 1111, 1111, 0, 0, 0, 0, NULL, NULL, NULL, 1111, 100, NULL, '', 'completed', '2026-07-02T15:51:38.928766');
INSERT INTO goals (id, user_id, title, description, goal_type, target_xp, current_xp, target_streak, current_streak, target_tasks, current_tasks, target_focus, current_focus, focus_baseline_seconds, target_value, progress, priority, deadline, status, created_at) VALUES ('1783088079825', 'avery', '111', '1', 'xp', 1111, 1111, 0, 0, 0, 0, NULL, NULL, NULL, 1111, 100, NULL, '', 'completed', '2026-07-03T09:14:39.825908');
INSERT INTO goals (id, user_id, title, description, goal_type, target_xp, current_xp, target_streak, current_streak, target_tasks, current_tasks, target_focus, current_focus, focus_baseline_seconds, target_value, progress, priority, deadline, status, created_at) VALUES ('1783088802509', 'avery', '1', '1', 'xp', 11, 11, 0, 0, 0, 0, NULL, NULL, NULL, 11, 100, NULL, '', 'completed', '2026-07-03T09:26:42.509860');
INSERT INTO goals (id, user_id, title, description, goal_type, target_xp, current_xp, target_streak, current_streak, target_tasks, current_tasks, target_focus, current_focus, focus_baseline_seconds, target_value, progress, priority, deadline, status, created_at) VALUES ('1783268965278', 'demo', '1', '1', 'xp', 1111, 1111, 0, 0, 0, 0, NULL, NULL, NULL, 1111, 100, NULL, '', 'completed', '2026-07-05T11:29:25.278569');
INSERT INTO goals (id, user_id, title, description, goal_type, target_xp, current_xp, target_streak, current_streak, target_tasks, current_tasks, target_focus, current_focus, focus_baseline_seconds, target_value, progress, priority, deadline, status, created_at) VALUES ('1783521600877', 'demo', '1', '1', 'tasks', 0, 0, 0, 0, 1, 1, NULL, NULL, NULL, 1, 100, NULL, '', 'completed', '2026-07-08T09:40:00.877716');
INSERT INTO goals (id, user_id, title, description, goal_type, target_xp, current_xp, target_streak, current_streak, target_tasks, current_tasks, target_focus, current_focus, focus_baseline_seconds, target_value, progress, priority, deadline, status, created_at) VALUES ('1783522332245', 'demo', '1', '', 'streak', 0, 0, 23, 0, 0, 0, NULL, NULL, NULL, 23, 0, NULL, '', 'active', '2026-07-08T09:52:12.245764');
INSERT INTO goals (id, user_id, title, description, goal_type, target_xp, current_xp, target_streak, current_streak, target_tasks, current_tasks, target_focus, current_focus, focus_baseline_seconds, target_value, progress, priority, deadline, status, created_at) VALUES ('1784643719670', 'avery', '888', '9', 'xp', 8888, 313, 0, 0, 0, 0, NULL, NULL, NULL, 8888, 3.5, NULL, '2027-02-17', 'active', '2026-07-21T09:21:59.670652');
INSERT INTO goals (id, user_id, title, description, goal_type, target_xp, current_xp, target_streak, current_streak, target_tasks, current_tasks, target_focus, current_focus, focus_baseline_seconds, target_value, progress, priority, deadline, status, created_at) VALUES ('1784905626865', 'avery', '1111', '23', 'focus', 0, 0, 0, 0, 0, 0, 1500, 0, 30432, 1500, 0, 3, '', 'active', '2026-07-24T10:07:06.865807');
INSERT INTO goals (id, user_id, title, description, goal_type, target_xp, current_xp, target_streak, current_streak, target_tasks, current_tasks, target_focus, current_focus, focus_baseline_seconds, target_value, progress, priority, deadline, status, created_at) VALUES ('1785110011644', 'morgan', '9999', 'r', 'xp', 1000, 0, 0, 0, 0, 0, 0, 0, 0, 1000, 0, 10, '2026-07-28', 'active', '2026-07-26T18:53:31.645393');

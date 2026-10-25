-- topic_library — every account's finished tasks filed by topic, below the
-- subject, and scored against the rest of that subject.
--
-- Built by backend/tracking/topics.py from task names (see its docstring and
-- data/topic_taxonomy.json), written by POST /api/topics (backend/api/topics.py)
-- and read by the subject page's goal panel and its Topics panel.
--
-- One row per account, subject, subsubject and topic. `subsubject` is a skill
-- tree id ('competition-math'), `topic` a topic id
-- ('competition-math:recursive-counting'); either is '' when the names didn't
-- say. `goal_ids` is a JSON list of the goals the row feeds. `data` is the
-- whole row as the page reads it (labels, examples, contexts, late share), so
-- a new figure doesn't need a new column. The library is rewritten whole on
-- each build, so there is nothing to merge.

CREATE TABLE IF NOT EXISTS topic_library (
    user_id     TEXT    NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    subject     TEXT    NOT NULL,
    subsubject  TEXT    NOT NULL DEFAULT '',
    topic       TEXT    NOT NULL DEFAULT '',
    status      TEXT    NOT NULL DEFAULT 'unknown',
    tasks       INTEGER NOT NULL DEFAULT 0,
    rated       INTEGER NOT NULL DEFAULT 0,
    execution   REAL,
    gap         REAL,
    goal_ids    TEXT    NOT NULL DEFAULT '[]',
    data        TEXT    NOT NULL DEFAULT '{}',
    built_at    TEXT    NOT NULL,
    PRIMARY KEY (user_id, subject, subsubject, topic),
    CHECK (status IN ('weak', 'steady', 'strong', 'untested', 'unknown')),
    CHECK (tasks >= 0)
);

-- What each account's library was last built from (a fingerprint of its tasks,
-- goals and the taxonomy), so a read can say it's out of date without
-- rebuilding it.
CREATE TABLE IF NOT EXISTS topic_builds (
    user_id      TEXT NOT NULL PRIMARY KEY REFERENCES users (username) ON DELETE CASCADE,
    fingerprint  TEXT NOT NULL,
    built_at     TEXT NOT NULL
);

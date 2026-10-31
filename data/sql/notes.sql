-- notes — free-form notes attached to a day, a task or a goal.
--
-- Built: backend/api/notes.py serves it. The Notes page that drew it is
-- gone; the rows stay. The shape below is unchanged from when it was only a shape — the
-- API was written against this file rather than the other way round.

CREATE TABLE IF NOT EXISTS notes (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,

    title        TEXT NOT NULL DEFAULT '',
    body         TEXT NOT NULL DEFAULT '',

    -- What the note is about, when it is about anything. A note with none of
    -- these set is a loose note.
    note_date    TEXT,
    task_id      TEXT REFERENCES tasks (id) ON DELETE SET NULL,
    goal_id      TEXT REFERENCES goals (id) ON DELETE SET NULL,

    -- What the note is about, as ids from the subject catalogue
    -- (backend/config/subjects.py), comma-separated. The same shape
    -- goals.subject_ids uses, and for the same reason: the catalogue is code,
    -- there is nothing to point a foreign key at, and an id the catalogue has
    -- since dropped is ignored on read rather than deleted.
    subject_ids  TEXT NOT NULL DEFAULT '',

    -- The coarse folder, one of the catalogue's own group names ("Computing",
    -- "Creative") or '' for unfiled. Subjects are the fine tags and this is
    -- the shelf; a note has many of the first and one of the second.
    notebook     TEXT NOT NULL DEFAULT '',

    pinned       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS notes_user_date_idx ON notes (user_id, note_date);

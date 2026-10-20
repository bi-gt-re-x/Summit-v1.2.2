-- review_marks — "Got them all" / "Still missed some" on the review queue.
--
-- The queue (backend/tracking/review.py) brings every miss back after 1, 3, 7
-- and 14 days. A missed skill-tree problem is reviewed by answering it again,
-- which writes a skill_attempts row, so it needs nothing here. A task set with
-- a score ("6 of 10") or a logged batch has no single problem to answer, so
-- its review is a mark: one row per review, never edited.
--
-- `item` is the queue's key: 't:<task id>' for a set, 's:<node>#<step>' for a
-- step. `result` is 'right' (moves it up a rung) or 'missed' (back to the
-- start). Written by backend/api/review.py.

CREATE TABLE IF NOT EXISTS review_marks (
    id       TEXT PRIMARY KEY,
    user_id  TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    item     TEXT NOT NULL,
    result   TEXT NOT NULL,
    at       TEXT NOT NULL,
    CHECK (result IN ('right', 'missed'))
);

CREATE INDEX IF NOT EXISTS review_marks_user_idx ON review_marks (user_id, item);

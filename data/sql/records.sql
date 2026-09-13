-- records — the account's hall of fame, in its own words.
--
-- Built: backend/api/records.py serves it and frontend/src/pages/Records.tsx
-- draws it.
--
-- ## Why this table exists at all
--
-- The Records page was entirely derived: best XP day, heaviest task, longest
-- streak, all read back out of the growth history. That is honest and it is
-- also only ever about the things Summit itself counts. It cannot know that you
-- got 25/25 on AMC 8, or reached RCM 9, or wrote a ten-thousand-line project,
-- because none of those happened inside the app. This is where the account
-- says so. The derived records stay exactly as they were and are drawn beside
-- these; neither is a replacement for the other.
--
-- ## One row is one entry, not one record
--
-- The important shape here. A "record" in the reader's sense — "AMC 8, best
-- 25" — is not a row: it is every row sharing a `name`, and the best of them
-- is the maximum. That falls out of storing entries rather than bests:
--
--     the personal best   the extremum of `value` among rows with that name
--     the evolution       those rows in date order: 18 → 20 → 21 → 23 → 25
--     "+7 from first"     the best minus the oldest, signed toward better
--     "NEW RECORD"        the newest row is also the best
--
-- Storing a single best per name would give the first of those and destroy the
-- other three, and the other three are most of what the page is for.
--
-- ## Which way is better is stored, not guessed
--
-- "Extremum" above, rather than "largest", because a five-minute mile beats a
-- six-minute one and a 25/25 beats a 23/25. The page used to assume bigger was
-- better everywhere and said so in a comment, which was right for scores,
-- streaks and levels and silently wrong for every record measured in time.
-- Guessing from `unit` does not work either — the first person to log "minutes
-- practised" has a bigger-is-better duration and would get the arrows the
-- wrong way round.
--
-- So `comparison_direction` is asked for once, when the record is first
-- logged, and every comparison on the page is that one word applied:
--
--     best          the extremum in that direction
--     improvement   best - first, negated when the direction is 'lower'
--     new record    the newest entry beats every earlier one
--
-- It is spelled as a direction rather than as a `lower_is_better` flag because
-- a boolean has no room to grow: "closest to a target" is a third comparison
-- this app may well want, and it is a third value here rather than a second
-- flag that has to be read alongside the first.
--
-- ## Milestones share the table
--
-- `kind` separates them. A milestone is a thing that either happened or has
-- not — "first AIME problem solved" — so it carries no figure and its date is
-- empty until it does. They live here rather than in their own table because
-- they are the same record with the number left out: same owner, same
-- category, same date, same page, same three endpoints.
--
-- Note the other milestones in this app are `goal_milestones`, which are
-- checkpoints *on the way to* a goal and are ordered, dated and ticked off in
-- sequence. These are not those: they are things already achieved, in no
-- order, belonging to no goal.

CREATE TABLE IF NOT EXISTS records (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users (username) ON DELETE CASCADE,

    -- 'record' for a figure that can be beaten, 'milestone' for a thing that
    -- either happened or has not.
    kind         TEXT NOT NULL DEFAULT 'record'
                 CHECK (kind IN ('record', 'milestone')),

    -- What it measures: "AMC 8", "Longest coding session". Rows sharing this
    -- and an owner are the same record over time — see above.
    name         TEXT NOT NULL DEFAULT '',

    -- Free text, and deliberately not a subject id. The page groups by this
    -- and the reader's categories are theirs: "Competitive Math" is not a
    -- subject in the catalogue and should not have to be one to be a heading.
    category     TEXT NOT NULL DEFAULT '',

    -- The comparable number. Everything printed is built from this and `unit`
    -- rather than stored as text, because a record that cannot be compared to
    -- the one before it cannot be a record.
    value        NUMERIC NOT NULL DEFAULT 0,
    -- The "out of", for a score with a ceiling: 25 / 25. Zero means none.
    target       NUMERIC NOT NULL DEFAULT 0,
    -- What `value` counts: 'points', 'minutes', 'days', 'lines', ''. The
    -- client formats from it — 258 minutes prints as "4h 18m".
    unit         TEXT NOT NULL DEFAULT '',

    -- Which end of the range is the good end. 'higher' for a score, 'lower'
    -- for a time. Rows sharing a name are the same record and the newest of
    -- them settles it — see the header, and `directionOf` in
    -- frontend/src/utils/records.ts.
    --
    -- Databases that predate this column get NULL through ALTER TABLE (see
    -- ADDED_COLUMNS in backend/database/connection.py) and every reader treats
    -- NULL as 'higher', which is what the whole page assumed before it existed.
    comparison_direction TEXT NOT NULL DEFAULT 'higher'
                 CHECK (comparison_direction IN ('higher', 'lower')),

    note         TEXT NOT NULL DEFAULT '',

    -- ISO date. Empty on a milestone not reached yet, which is what draws it
    -- as an open circle rather than a tick.
    achieved_on  TEXT NOT NULL DEFAULT '',

    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The page reads one account's rows and groups them in memory; this is the
-- index that read wants. The second covers the per-name history lookup.
CREATE INDEX IF NOT EXISTS records_user_idx ON records (user_id, kind);
CREATE INDEX IF NOT EXISTS records_name_idx ON records (user_id, name, achieved_on);

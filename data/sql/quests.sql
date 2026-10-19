-- quest_claims — the first-week quests an account has cashed in.
--
-- Written by backend/api/quests.py; the quests themselves (what each asks for,
-- what it pays, how it is checked) are backend/tracking/quests.py. The card is
-- components/Dashboard/FirstWeek.tsx.
--
-- One row per quest per account, and the primary key is the whole guard
-- against claiming twice: the claim inserts here *before* it pays, so a second
-- request for the same quest hits the key and never reaches the ledger. The XP
-- itself goes in xp_events like every other award, with reason 'quest:<id>',
-- so the growth chart and the level already know about it.
--
-- `xp` is what was paid at the time, kept so a later change to a reward does
-- not rewrite what somebody already got.

CREATE TABLE IF NOT EXISTS quest_claims (
    user_id     TEXT    NOT NULL REFERENCES users (username) ON DELETE CASCADE,
    quest_id    TEXT    NOT NULL,
    xp          INTEGER NOT NULL DEFAULT 0,
    claimed_at  TEXT    NOT NULL,
    PRIMARY KEY (user_id, quest_id),
    CHECK (xp >= 0)
);

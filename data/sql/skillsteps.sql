-- skill_steps — the practice programme for every node in the library.
--
-- Built: scripts/generate_skill_steps.py writes it, backend/api/skillsteps.py
-- serves it, frontend/src/components/SkillTree/LatticePanel.tsx draws it.
--
-- ## Why a table and not a function
--
-- These steps used to be computed in the browser, every time a tile was
-- clicked, by frontend/src/skills/improve.ts: a ladder of twenty generic rungs,
-- sliced by tier and reworded by domain. It is a clever piece of code and it
-- produces advice like "Do one from memory, with the answer covered" for a node
-- called Factor Simple Quadratics — a sentence that is true of every skill ever
-- named and therefore says nothing about that one.
--
-- The fix is not a better ladder. A step worth reading knows the subject:
--
--     Factor Simple Quadratics
--     mastery   Reverse FOIL to factor x^2 + bx + c.
--     practice  Factor x^2 - 7x + 12.
--
-- Nothing derived from a tier and a domain can produce the second line, because
-- the second line requires knowing what a quadratic is. So the steps are
-- written ahead of time by a model that does, checked, and stored here. The
-- browser reads them; it no longer invents them.
--
-- ## One row is one step, not one node
--
-- A node's programme is its rows ordered by `ordinal`, the same shape the
-- records table uses for a personal best. Storing a node's whole programme as
-- one JSON blob would make the natural queries — how many steps are unverified,
-- which steps mention no concrete object, what does the fourth step of every
-- Foundation node look like — into full-table scans through a decoder.
--
-- ## Every row in this table has passed quality control
--
-- The invariant, and it is a schema constraint rather than a convention:
-- `verified_at` and `verifier` are NOT NULL and `checks` must be a non-empty
-- JSON array. A step that failed review is never written here at all — the
-- generator repairs it and re-reviews, or drops it and logs the drop to
-- skill_step_audit. So "is this step verified" is not a question the API has to
-- ask, and there is no half-trusted state for a reader to land in.
--
-- The checks themselves live in backend/tracking/skillsteps.py, because they
-- are rules about content and rules do not belong in SQL or in an endpoint.
--
-- ## Nothing here belongs to an account
--
-- No user_id, no progress, no completion. This is the curriculum, identical for
-- every reader, which is why it can be generated once rather than per person.
-- Where somebody stands against it is frontend/src/utils/skillSteps.ts, and a
-- programme a reader has edited by hand still overrides this one.
CREATE TABLE IF NOT EXISTS skill_steps (
    -- The node in frontend/src/skills/trees, e.g. 'k.limits'. Not a foreign
    -- key: the nodes live in TypeScript, and scripts/check_steps.mjs is what
    -- checks that every node_id here still names one.
    node_id      TEXT    NOT NULL,

    -- 1-based, dense, and the order the reader works through. Unique per node.
    ordinal      INTEGER NOT NULL,

    -- The Skill column of the programme: a short imperative name for this one
    -- step, e.g. 'Expand Binomials'. Not the node's name — a node has five to
    -- twelve of these under it.
    title        TEXT    NOT NULL,

    -- What mastery of this step means, in one sentence. The test it has to
    -- pass: a reader could tell from this line alone whether they have it.
    mastery      TEXT    NOT NULL,

    -- The Try: line — one concrete thing to go and do right now, with its
    -- object stated. 'Factor x^2 - 7x + 12', not 'practise factoring'. Stored
    -- without the 'Try:' label; the panel draws that.
    practice     TEXT    NOT NULL,

    -- What the reader sees when they open the step: two or three sentences of
    -- how to actually do it, written to be read while doing it rather than
    -- before starting.
    detail       TEXT    NOT NULL,

    -- How to know the practice went right — the answer, or the property the
    -- answer must have. This is what makes a step checkable rather than an
    -- instruction to feel confident.
    proof        TEXT    NOT NULL,

    -- The specific way this step is usually got wrong. One sentence, naming
    -- the mistake rather than advising care.
    pitfall      TEXT    NOT NULL,

    -- Rough cost in minutes, for the reader deciding whether there is time.
    minutes      INTEGER NOT NULL DEFAULT 20,

    -- ---- Provenance ----------------------------------------------------
    -- Copied from the node so the table can be audited, and queried by tier or
    -- tree, without joining against a JSON file the database cannot see.
    tree_id      TEXT    NOT NULL,
    tier         TEXT    NOT NULL,

    -- Which model wrote it, and when. A regeneration under a better model is a
    -- content migration, and it needs to be possible to say what is old.
    model        TEXT    NOT NULL,
    generated_at TEXT    NOT NULL,

    -- How many generate-and-review rounds this step took. 1 means it passed
    -- first time; higher means the reviewer sent it back and it was rewritten.
    attempts     INTEGER NOT NULL DEFAULT 1,

    -- ---- Quality control -----------------------------------------------
    -- NOT NULL by design; see the note above. `verifier` names what signed it
    -- off — 'rules+<model>' for the two-stage pass the generator runs.
    verified_at  TEXT    NOT NULL,
    verifier     TEXT    NOT NULL,

    -- The named checks this row passed, as a JSON array of strings, e.g.
    -- ["shape","concrete","not-generic","distinct","on-topic","reviewed"].
    -- Stored rather than recomputed so a row carries the evidence for its own
    -- admission, and so tightening a check later shows up as rows missing its
    -- name rather than as rows that silently never ran it.
    checks       TEXT    NOT NULL DEFAULT '[]',

    PRIMARY KEY (node_id, ordinal),

    CHECK (ordinal >= 1),
    CHECK (length(title) > 0),
    CHECK (length(mastery) > 0),
    CHECK (length(practice) > 0),
    CHECK (length(detail) > 0),
    CHECK (length(proof) > 0),
    CHECK (length(pitfall) > 0),
    CHECK (length(verified_at) > 0),
    CHECK (length(verifier) > 0),
    -- A non-empty JSON array. '[]' is the column default and is rejected here:
    -- a row that passed no named check has no business being served.
    CHECK (checks LIKE '["%')
);

-- The panel asks for one node at a time, and the page prefetches the whole
-- tree; both are covered by the primary key's own index on (node_id, ordinal).
-- This second one is for the coverage report and the audit queries, which ask
-- "how much of the Calculus tree is written" and would otherwise scan.
CREATE INDEX IF NOT EXISTS skill_steps_tree ON skill_steps (tree_id, node_id);


-- skill_step_audit — what quality control actually did, including the failures.
--
-- ## Why the failures are the point
--
-- skill_steps holds only what passed, which makes it useless for the question
-- that matters when the content is wrong: *what did the reviewer reject, and
-- why*. Without that, a prompt that produces vague practice lines for every
-- Health and fitness node looks exactly like a prompt that works — the bad rows
-- were dropped, the good ones are all you can see, and the pattern is invisible.
--
-- So every outcome is appended here: the accept, the repair, the drop. A run
-- can be read back afterwards and asked which trees fought hardest, which check
-- fires most, and whether the second attempt is actually better than the first.
--
-- ## Append-only
--
-- Rows are never updated. A step that failed, was rewritten and then passed is
-- three rows, in that order, and the sequence is the record.
CREATE TABLE IF NOT EXISTS skill_step_audit (
    -- The generator run this belongs to — a timestamp, the same for every row
    -- of one invocation, so a run can be read back whole.
    run_id     TEXT    NOT NULL,
    node_id    TEXT    NOT NULL,
    -- Null for a whole-node event (a generation call, a node dropped entirely);
    -- set when the event is about one step.
    ordinal    INTEGER,
    -- 'generate' | 'rules' | 'review' | 'repair' | 'store'
    stage      TEXT    NOT NULL,
    -- 'pass' | 'fail' | 'drop' | 'error'
    outcome    TEXT    NOT NULL,
    -- Which named check failed, or the reviewer's own reason, in one line.
    reason     TEXT    NOT NULL DEFAULT '',
    at         TEXT    NOT NULL,

    CHECK (stage IN ('generate', 'rules', 'review', 'repair', 'store')),
    CHECK (outcome IN ('pass', 'fail', 'drop', 'error'))
);

CREATE INDEX IF NOT EXISTS skill_step_audit_run ON skill_step_audit (run_id, node_id);


-- skill_problems — the actual questions behind a step.
--
-- Built: scripts/generate_skill_steps.py --problems writes them,
-- backend/api/skillsteps.py serves them inside their step, and
-- frontend/src/components/SkillTree/LatticePanel.tsx draws them on the
-- problems screen.
--
-- ## Why these are rows and not part of the step
--
-- A step already carries one `practice` line — the single thing to go and do.
-- That is what a reader needs in order to *choose* a step, and it is written
-- into skill_steps for the same reason the rest of the step is.
--
-- A problem set is a different object. It is ordered, it is graded from light
-- to heavy, a reader works through it one at a time, and there are between
-- three and nine of them per step. Folding that into a column on skill_steps
-- would mean a JSON blob whose length is the interesting part, which is the
-- shape data/sql/skillsteps.sql already argues against for the steps
-- themselves.
--
-- ## The slope is stored, not computed
--
-- `weight` says which band a problem is in — warm-up, core or stretch — and it
-- is a column rather than a function of `slot`, because the band is a claim
-- about the *question* and not about its position. Deriving it from the index
-- would mean a set could never be reordered, and reordering a set is the most
-- likely edit it will ever get. frontend/src/utils/problemSet computes a
-- default shape for a step that has no problems yet; once there are rows, the
-- rows decide.
--
-- ## Every row here has passed quality control too
--
-- Same invariant as skill_steps and for the same reason: `verified_at` and
-- `verifier` are NOT NULL, `checks` must be a non-empty JSON array, and a
-- problem that fails review is never written. A wrong answer in this table is
-- worse than a wrong sentence in skill_steps — a reader will sit down, work it
-- out, get something different, and conclude they are wrong.
CREATE TABLE IF NOT EXISTS skill_problems (
    node_id      TEXT    NOT NULL,
    -- Which step of that node's programme this belongs to.
    ordinal      INTEGER NOT NULL,
    -- Position within the step's own set, 1-based and dense.
    slot         INTEGER NOT NULL,
    -- 'warmup' | 'core' | 'stretch'. See frontend/src/utils/problemSet.
    weight       TEXT    NOT NULL,

    -- The question, stated so it can be worked without anything else open.
    prompt       TEXT    NOT NULL,
    -- The answer, or the property a correct answer has. Checked, so it has to
    -- be right.
    answer       TEXT    NOT NULL,
    -- One line of help, shown only if the reader asks. May be empty: a warm-up
    -- that needs a hint is not a warm-up.
    hint         TEXT    NOT NULL DEFAULT '',

    tree_id      TEXT    NOT NULL,
    model        TEXT    NOT NULL,
    generated_at TEXT    NOT NULL,
    verified_at  TEXT    NOT NULL,
    verifier     TEXT    NOT NULL,
    checks       TEXT    NOT NULL DEFAULT '[]',

    PRIMARY KEY (node_id, ordinal, slot),

    CHECK (ordinal >= 1),
    CHECK (slot >= 1),
    CHECK (weight IN ('warmup', 'core', 'stretch')),
    CHECK (length(prompt) > 0),
    CHECK (length(answer) > 0),
    CHECK (length(verified_at) > 0),
    CHECK (length(verifier) > 0),
    CHECK (checks LIKE '["%')
);

CREATE INDEX IF NOT EXISTS skill_problems_step ON skill_problems (node_id, ordinal, slot);

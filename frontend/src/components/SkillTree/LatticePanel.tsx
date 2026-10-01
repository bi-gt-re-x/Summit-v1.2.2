/**
 * What a lattice node is, once you have clicked it.
 *
 * ## Three kinds of truth, said out loud
 *
 * The panel holds three completely different kinds of claim and used to run
 * them together in one column, so a reader had no way of knowing which
 * sentences were about the subject and which were about them:
 *
 *   **Your progress** — account state. Where you stand, in a sentence before a
 *   percentage, then the bar and the XP behind it.
 *
 *   **The curriculum** — authored, and identical on every account. What the
 *   skill is, and what it sits on. Nothing under this heading is a claim about
 *   the reader.
 *
 *   **Your next move** — derived from the first two. The steps, what finishing
 *   looks like, the trap, the time.
 *
 * Then what comes next, which is navigation rather than a claim of any kind.
 * The headings are the feature: the distinction was always in the
 * architecture — see the note at the top of skills/subjectTrees — and was
 * nowhere in the page.
 *
 * ## Your next move is the middle of the panel, not a footnote
 *
 * Everything above it describes; everything below it navigates. The section
 * between the two is the only part that tells a reader what to do with their
 * afternoon, so it is the one that carries four things rather than one — the
 * steps, and then the three questions somebody asks the moment they have read
 * them: how will I know, how does this go wrong, how long. All four are one
 * call into skills/improve, which is what stops them disagreeing. "Done when"
 * is pulled out of the row of three, because "how will I know I am finished"
 * is the question a percentage answers worst.
 *
 * ## The name can be rewritten too
 *
 * Clicking the heading turns it into a field. Saving a new name looks for the
 * drawing that goes with it — see skills/iconMatch — and takes the node's
 * existing one when the name matches nothing, which is the common case and the
 * right answer for it. Ids are never touched, so nothing that depends on this
 * node notices.
 *
 * ## The programme can be rewritten, and then it is the record
 *
 * The suggested steps are a starting point. Opening the full list gives every
 * step an edit, a delete behind a confirmation, and a row at the bottom for a
 * new one — and the moment a node is edited its completion figure is counted in
 * steps rather than in XP, so adding one lowers it and deleting one ahead of
 * you raises it. The arithmetic is in utils/skillSteps and utils/skillProgress;
 * this file only ever hands over a whole plan and is handed one back.
 *
 * ## Both lists are read from the graph, not from the node
 *
 * A node states what it `requires`; nothing states what it opens. That is the
 * right way round to store it — one edge, written once — so "what finishing
 * this opens" is those same edges read backwards. The two lists at the foot
 * were one called "Related", which put a gate and a nice-to-have under one
 * heading; the prerequisites have a section of their own now, and what is left
 * is the pair a reader chooses between. Every row selects the node it names,
 * which is what turns the panel into navigation.
 *
 * ## Why this skill, whether or not it is locked
 *
 * The prerequisite checklist used to be drawn only on a blocked node, so the
 * question "why am I looking at this" was answered exactly when the answer was
 * "you are not allowed it yet". An open node has a better reason and it was
 * going unsaid: *these are the things you have already done*. Same list, same
 * ticks, on every node that sits on anything — and a node that sits on nothing
 * says so, because "a foundation" is an answer too.
 *
 * The action at the foot still becomes *start with the thing that is blocking
 * it* on a locked node, rather than a greyed-out button repeating the word the
 * badge already said. See `nearestBlocker` in skills/route.
 *
 * ## A position, not only a percentage
 *
 * "72%" is four states' worth of arithmetic flattened into one number, and
 * there are things it cannot say: *one prerequisite away* is the difference
 * between a dead end and next week, *step 4 of 7* is a position a percentage
 * rounds away, and *open now, nothing in the way* read as `0%`. So the
 * progress section opens with a sentence and the number sits in the header
 * beside the name, where a reader looks for it.
 *
 * ## Nothing empty is printed
 *
 * A list with no rows, an XP line on a node worth zero: each is absent rather
 * than drawn as a dash. A panel of dashes reads as a form that failed to load.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { improvePlan } from '@/skills/improve';
import { nearestBlocker, optionalIds } from '@/skills/route';
import { groupOf, iconUrl } from '@/skills/subjectTrees';
import {
  DIFFICULTY_LABEL,
  STATUS_LABEL,
  requirementsOf,
  unlockedBy,
  type GraphNode,
  type SkillGraph,
} from '@/utils/skillGraph';
import { NAME_MAX, cleanName } from '@/utils/skillNames';
import {
  STEPS_MAX,
  STEP_MAX,
  addStep,
  cleanStep,
  editStep,
  removeStep,
  type StepPlan,
} from '@/utils/skillSteps';
import type { Problem as ProblemRow, WrittenStep } from '@/services/skillSteps';
import {
  WEIGHT_BLURB,
  WEIGHT_LABEL,
  bandsFor,
  type PracticeStep,
} from '@/utils/problemSet';
import { Icon } from '@/components/Icon';
import { ProgressIndicator } from './ProgressIndicator';
import { LevelCard, LevelChain, LevelChip, LogPractice, ProblemMark } from './SkillLevel';
import { lastAt, readLevel, type Attempt, type SkillLevel, type Tier } from '@/utils/skillLevel';
import type { NewAttempt } from '@/services/skillAttempts';

const number = (value: number) => Math.round(value).toLocaleString();

/**
 * What the panel needs to measure a skill rather than describe it: the
 * reader's attempts, and the two writes. One object rather than three props,
 * because they are only ever present together — a panel that could read the
 * level but not mark a problem would draw buttons that do nothing.
 */
export interface StepEvidence {
  /** Every attempt the reader has. The panel picks out this node's. */
  attempts: Attempt[];
  /** Store one; the stored row, or null when it was refused. */
  onAttempt: (attempt: NewAttempt) => Promise<Attempt | null>;
  /** Take one back. */
  onUndo: (id: string) => Promise<boolean>;
}

/** The skill's drawing, painted through the shared mask. */
function Ico({ icon, className }: { icon?: string; className: string }) {
  return <i className={className} style={{ ['--ico' as string]: `url(${iconUrl(icon)})` }} />;
}

function Rows({
  title,
  nodes,
  onSelect,
  showPercent,
}: {
  title: string;
  nodes: GraphNode[];
  onSelect: (node: GraphNode) => void;
  /** Related skills print how far along they are; unlocks print a tick. */
  showPercent?: boolean;
}) {
  if (nodes.length === 0) return null;
  return (
    <section className="stx-lp-section">
      <h3>{title}</h3>
      <ul className="stx-lp-rows">
        {nodes.map((node) => (
          <li key={node.id}>
            <button type="button" className={`stx-lp-row is-${node.status}`} onClick={() => onSelect(node)}>
              <Ico icon={node.icon} className="stx-ico stx-lp-row-ico" />
              <span className="stx-lp-row-name">{node.name}</span>
              {showPercent ? (
                <span className="stx-lp-row-pct">{Math.round(node.percent)}%</span>
              ) : (
                <span className="stx-lp-row-tick" aria-hidden="true">
                  {node.status === 'complete' ? '✓' : ''}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Roughly what a step at each tier costs, in minutes.
 *
 * Only the derived programme needs this. A written step states its own cost;
 * a rung of the generic ladder in skills/improve has none, and the number is
 * what decides how many problems the step is owed — see `countFor` in
 * utils/problemSet. Tier is the only signal a rung carries, so tier is what it
 * is read from.
 */
const TIER_MINUTES: Record<string, number> = {
  foundation: 10,
  beginner: 15,
  intermediate: 20,
  advanced: 30,
  expert: 40,
  mastery: 45,
};

/**
 * A short label for a step that only exists as one sentence.
 *
 * The derived ladder is a list of instructions, not a table, so there is no
 * title to put at the top of the problems screen. This takes the first clause
 * and caps it, which on a rung like "Make up your own input, work out the
 * answer by hand, then check the code agrees." gives "Make up your own input"
 * — the part that names the work.
 */
function labelFor(text: string): string {
  const clause = text.split(/[,.;:]/)[0]!.trim();
  const words = clause.split(/\s+/).slice(0, 6).join(' ');
  return (words || text.slice(0, 40)).replace(/\s+$/, '');
}

/**
 * One rung of the derived ladder, in the shape the problems screen takes.
 *
 * The point of this function is that the feature does not wait for content.
 * Most of the library still answers from skills/improve, and a link that only
 * appeared on the nodes a generator had already reached would be a feature
 * most readers never saw. A derived step is a worse step — it does not name
 * its object, which is the whole complaint against the ladder — but the
 * *problems* hanging off it are slots either way, so there is nothing lost by
 * hanging them off this too.
 */
function asPractice(
  text: string,
  ordinal: number,
  node: GraphNode,
  plan: { proof: string; pitfall: string },
): PracticeStep {
  return {
    ordinal,
    title: labelFor(text),
    // The whole instruction is the brief: the title above is a truncation of
    // it, so the screen would otherwise show only half a sentence.
    mastery: text,
    proof: plan.proof,
    pitfall: plan.pitfall,
    minutes: TIER_MINUTES[node.difficulty] ?? 20,
  };
}

/**
 * One question, with its answer behind a control.
 *
 * The answer is hidden until asked for, and that is the whole design of this
 * component. A problem whose answer is on screen beside it is not a problem —
 * a reader's eye reaches it before they have finished reading the question,
 * and the work of attempting it never happens. The hint sits in front of the
 * answer for the same reason: it is the cheaper thing to spend first, and
 * offering both at once means nobody ever takes the cheaper one.
 */
function Problem({ problem, mark }: { problem: ProblemRow; mark?: React.ReactNode }) {
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  // A new question is a new attempt: both reveals close.
  useEffect(() => {
    setShowHint(false);
    setShowAnswer(false);
  }, [problem.prompt]);

  return (
    <div className="stx-problem">
      <p className="stx-problem-prompt">{problem.prompt}</p>
      {showHint && problem.hint && <p className="stx-problem-hint">{problem.hint}</p>}
      {showAnswer && <p className="stx-problem-answer">{problem.answer}</p>}
      <p className="stx-problem-acts">
        {problem.hint && !showHint && !showAnswer && (
          <button type="button" className="stx-problem-act" onClick={() => setShowHint(true)}>
            Hint
          </button>
        )}
        <button
          type="button"
          className="stx-problem-act is-answer"
          aria-expanded={showAnswer}
          onClick={() => setShowAnswer((was) => !was)}
        >
          {showAnswer ? 'Hide answer' : 'Show answer'}
        </button>
      </p>
      {/* Marking is checking, and there is nothing to check against until the
          answer is out — so the question only appears with it. */}
      {showAnswer && mark}
    </div>
  );
}

/**
 * One step, with everything else gone.
 *
 * ## Why this is a screen rather than a bigger expansion
 *
 * Expanding a row answers "what does this step involve" while the reader is
 * still choosing between twelve of them, so the other eleven stay on screen —
 * that is the whole use of it. This answers a different question: the choosing
 * is over, and what is wanted now is the problems and nothing competing with
 * them. A reader working through a stretch problem does not benefit from the
 * step list, the canvas, the prerequisites or the XP bar being in their
 * peripheral vision, so none of them are.
 *
 * Both exist because both questions are real. Adding this did not cost the
 * expansion anything.
 *
 * ## The set is a slope, not a pile
 *
 * Problems come in three bands — warm-up, core, stretch — and the first third
 * are the light ones. See utils/problemSet for why, and for the arithmetic
 * that decides how many a step is owed. The bands are drawn as headings rather
 * than inferred from the questions, so a reader who is stuck on the last one
 * can see that it is supposed to be the hard one.
 *
 * The problems themselves are not written yet. What is here is the ladder they
 * will land in, drawn as dashed slots so it reads as "not yet" rather than
 * "failed to load".
 */
function StepWorkspace({
  step,
  node,
  problems,
  onBack,
  onBackToTree,
  evidence,
}: {
  step: PracticeStep;
  /** The written questions for this step, if any have been. */
  problems?: ProblemRow[];
  node: GraphNode;
  /** Back to the programme this step belongs to. */
  onBack: () => void;
  /** Out of the takeover entirely. */
  onBackToTree: () => void;
  /**
   * Marking and the level it feeds. Only for a written step: its ordinal is
   * the server's and stays put, where a derived rung's is a position in a
   * list that is allowed to change — and evidence filed under a number that
   * moves would end up describing a different step.
   */
  evidence?: StepEvidence;
}) {
  /* Marks made on this visit, by problem, so a second press changes or takes
     back the first rather than adding to it. Marks from earlier visits stay
     what they were — they are history, and shown as "last time". */
  const [mine, setMine] = useState<Record<number, Attempt>>({});
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => setMine({}), [step.ordinal, node.id]);

  const mark = async (slot: number, weight: Tier, right: boolean) => {
    if (!evidence) return;
    setBusy(slot);
    try {
      const before = mine[slot];
      if (before && !(await evidence.onUndo(before.id))) return;
      const made = await evidence.onAttempt({
        node_id: node.id, ordinal: step.ordinal, slot, weight,
        attempted: 1, correct: right ? 1 : 0, source: 'problem',
      });
      setMine((was) => {
        const next = { ...was };
        if (made) next[slot] = made;
        else delete next[slot];
        return next;
      });
    } finally {
      setBusy(null);
    }
  };

  const undo = async (slot: number) => {
    const before = mine[slot];
    if (!evidence || !before) return;
    setBusy(slot);
    try {
      if (await evidence.onUndo(before.id)) {
        setMine((was) => {
          const next = { ...was };
          delete next[slot];
          return next;
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const stepAttempts = useMemo(
    () => (evidence?.attempts ?? []).filter(
      (row) => row.node_id === node.id && row.ordinal === step.ordinal,
    ),
    [evidence?.attempts, node.id, step.ordinal],
  );

  /* Written problems where there are any, and the default ladder of empty
     slots where there are not. Both are grouped the same way, so everything
     below draws one shape — the only difference a reader sees is whether a
     row holds a question or says one is coming. */
  const written = problems ?? [];
  const bands = written.length > 0
    ? (['warmup', 'core', 'stretch'] as const)
        .map((weight) => ({
          weight,
          slots: written
            .filter((one) => one.weight === weight)
            .map((one) => ({ index: one.slot, weight: one.weight, problem: one })),
        }))
        .filter((band) => band.slots.length > 0)
    : bandsFor(step).map((band) => ({
        weight: band.weight,
        slots: band.slots.map((slot) => ({ ...slot, problem: undefined })),
      }));
  const total = bands.reduce((sum, band) => sum + band.slots.length, 0);

  return (
    <aside className={`stx-lp is-steps is-work tier-${node.difficulty}`}>
      <header className="stx-lp-steps-head">
        <button type="button" className="stx-lp-back" onClick={onBack}>
          <span aria-hidden="true">←</span> Back to Steps
        </button>
        <div>
          <h2>{step.title}</h2>
          <p className="stx-lp-steps-count">
            {node.name} · step {step.ordinal} · {total} problems
          </p>
        </div>
        {/* The second way out. A reader two levels deep should not have to
            climb back through a screen they are finished with. */}
        <button type="button" className="stx-lp-back is-far" onClick={onBackToTree}>
          Back to Tree
        </button>
      </header>

      <div className="stx-lp-body stx-lp-programme">
        {/* The step itself, restated in one line. Without it the problems are
            a list of questions with no statement of what they are for. */}
        <p className="stx-work-brief">{step.mastery}</p>

        {/* Where the reader stands on this step, above the problems that move
            it — so a mark below is seen to change the card above. */}
        {evidence && <LevelCard attempts={stepAttempts} />}

        {bands.map((band) => (
          <section key={band.weight} className={`stx-work-band is-${band.weight}`}>
            <h3 className="stx-work-band-name">
              {WEIGHT_LABEL[band.weight]}
              <span>{WEIGHT_BLURB[band.weight]}</span>
            </h3>
            <ol className="stx-work-list">
              {band.slots.map((slot) => (
                <li
                  key={slot.index}
                  className={`stx-work-slot${slot.problem ? ' is-written' : ''}`}
                >
                  <span className="stx-work-num" aria-hidden="true">
                    {slot.index}
                  </span>
                  {slot.problem ? (
                    <Problem
                      problem={slot.problem}
                      mark={
                        evidence && (
                          <ProblemMark
                            mine={mine[slot.index] ?? null}
                            previous={lastAt(stepAttempts, node.id, step.ordinal, slot.index)}
                            busy={busy === slot.index}
                            onMark={(right) => mark(slot.index, band.weight, right)}
                            onUndo={() => undo(slot.index)}
                          />
                        )
                      }
                    />
                  ) : (
                    <span className="stx-work-slot-text">
                      A {WEIGHT_LABEL[band.weight].toLowerCase()} problem for{' '}
                      <b>{step.title}</b> will appear here.
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}

        {/* What the step already says about finishing, kept because it is the
            only thing on this screen that answers "am I done". */}
        <dl className="stx-ws-facts stx-work-facts">
          <div>
            <dt>Done when</dt>
            <dd>{step.proof}</dd>
          </div>
          <div>
            <dt>Watch for</dt>
            <dd>{step.pitfall}</dd>
          </div>
        </dl>

        {evidence && (
          <LogPractice
            busy={busy !== null}
            onLog={async (weight, attempted, correct) =>
              Boolean(
                await evidence.onAttempt({
                  node_id: node.id, ordinal: step.ordinal, weight,
                  attempted, correct, source: 'log',
                }),
              )
            }
          />
        )}
      </div>
    </aside>
  );
}

/**
 * The written programme: a row per step, and the row opens.
 *
 * ## Why this is a separate component from `Programme` below
 *
 * They draw different things. `Programme` draws a list of sentences the reader
 * owns and can edit; this draws a table the server wrote and nobody edits — a
 * name, what mastering it means, and one concrete thing to try. The two have
 * different shapes, different affordances and different rules about who may
 * change them, and merging them would mean a component branching on which of
 * two data models it holds at every line.
 *
 * ## Clicking a step opens it rather than navigating
 *
 * Everything a reader needs in order to *decide* is on the closed row: the
 * title, the one-line definition, and the thing to try. Everything they need in
 * order to *do it* — how to go about it, how to know it worked, the mistake
 * people make — is three or four more lines, and putting all of it on screen at
 * once turns a seven-step programme into a page of prose nobody reads.
 *
 * More than one may be open at a time. A reader comparing step three with step
 * six is doing something reasonable, and an accordion that closes the first
 * when the second opens is a component being tidy at the reader's expense.
 */
function WrittenProgramme({
  steps,
  at,
  onOpenChange,
  onWork,
  levels,
}: {
  steps: WrittenStep[];
  /** Each step's measured level, by ordinal, where there is evidence to read. */
  levels?: Record<number, SkillLevel>;
  /** Which step the reader is on, 0-based. Opens expanded. */
  at: number;
  /** Told when a step opens, so a parent can scroll or measure. Optional. */
  onOpenChange?: (ordinal: number, open: boolean) => void;
  /** Take the page over with this step's problems. Absent hides the link. */
  onWork?: (step: WrittenStep) => void;
}) {
  // The current step starts open, because it is the one the reader came for.
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(steps[at] ? [steps[at]!.ordinal] : []),
  );
  const current = steps[at]?.ordinal;

  // A different node has been picked: the set of open rows belonged to the last
  // one, and its ordinals mean something else here.
  useEffect(() => {
    setOpen(new Set(steps[at] ? [steps[at]!.ordinal] : []));
    // Keyed on the programme itself rather than on a node id the component is
    // not given — a new array is a new programme.
  }, [steps, at]);

  const toggle = (ordinal: number) => {
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(ordinal)) next.delete(ordinal);
      else next.add(ordinal);
      onOpenChange?.(ordinal, next.has(ordinal));
      return next;
    });
  };

  return (
    <ol className="stx-ws">
      {steps.map((step, index) => {
        const isOpen = open.has(step.ordinal);
        const state = index < at ? 'is-done' : step.ordinal === current ? 'is-now' : '';
        const panelId = `stx-ws-body-${step.ordinal}`;
        return (
          <li key={step.ordinal} className={`stx-ws-step ${state} ${isOpen ? 'is-open' : ''}`}>
            {/* The whole row is the control, not a chevron in the corner: the
                target is the thing a reader is already pointing at.

                The link beside it is a second, different verb and has to stay
                outside the row's own button — a button inside a button is
                invalid, and the browser resolves it by swallowing one of the
                two clicks. */}
            <button
              type="button"
              className="stx-ws-head"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(step.ordinal)}
            >
              <span className="stx-ws-num" aria-hidden="true">
                {step.ordinal}
              </span>
              <span className="stx-ws-lines">
                <span className="stx-ws-title">
                  {step.title}
                  {levels?.[step.ordinal] && <LevelChip read={levels[step.ordinal]!} />}
                </span>
                <span className="stx-ws-mastery">{step.mastery}</span>
                <span className="stx-ws-try">
                  <b>Try:</b> {step.practice}
                </span>
              </span>
              <span className="stx-ws-mark" aria-hidden="true">
                {isOpen ? '−' : '+'}
              </span>
            </button>

            {/* Two ways into a step, on purpose, because they answer different
                questions. Expanding keeps the programme on screen and is for
                "what does this one involve" — you are still choosing. This is
                for "I am doing this one now": it clears the page down to the
                problems and nothing else, because a reader who has committed
                to a step should not be looking at the other eleven. */}
            {onWork && (
              <button
                type="button"
                className="stx-ws-work"
                onClick={() => onWork(step)}
              >
                <Icon name="target" />
                Problems for {step.title}
                <span aria-hidden="true">→</span>
              </button>
            )}

            {isOpen && (
              <div className="stx-ws-body" id={panelId}>
                {/* The target problem is the point of opening a step: the
                    practice line on the closed row says what kind of thing to
                    do, and this is the actual worked item to sit down with.
                    It leads the body rather than following the method, because
                    a reader who already knows how does not want to scroll past
                    an explanation to reach the question. */}
                <div className="stx-ws-target">
                  <p className="stx-ws-target-label">Target problem to solve</p>
                  <p className="stx-ws-target-slot">
                    A problem for <b>{step.title}</b> will appear here.
                  </p>
                </div>
                <p className="stx-ws-detail">{step.detail}</p>
                <dl className="stx-ws-facts">
                  <div>
                    <dt>Done when</dt>
                    <dd>{step.proof}</dd>
                  </div>
                  <div>
                    <dt>Watch for</dt>
                    <dd>{step.pitfall}</dd>
                  </div>
                  <div>
                    <dt>Roughly</dt>
                    <dd>{step.minutes} minutes</dd>
                  </div>
                </dl>
                {/* The row's own evidence. Small, and at the bottom, because a
                    reader is not here for it — but a table that claims every
                    step was checked should be able to say what checked it. */}
                <p className="stx-ws-verified" title={`Checks: ${step.verified.checks.join(', ')}`}>
                  Verified by {step.verified.by} · {step.verified.checks.length} checks
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The full programme, editable.
 *
 * One row is in exactly one of four states — reading, being edited, asking
 * whether it should really go, or being the new row at the bottom — and the
 * three pieces of state below are what say which. They are deliberately not
 * merged into one: a reader who starts typing a new step and then decides to
 * fix step four should not lose what they typed, and a delete they have not
 * confirmed should survive an edit somewhere else in the list.
 */
function Programme({
  plan,
  at,
  onChange,
  onReset,
  editable,
  edited,
  onWork,
}: {
  plan: StepPlan;
  at: number;
  onChange?: (next: StepPlan) => void;
  onReset?: () => void;
  editable: boolean;
  /** Whether this programme is the reader's or still the suggested one. */
  edited: boolean;
  /** Take the page over with this step's problems, by 0-based position. */
  onWork?: (index: number) => void;
}) {
  const [editingAt, setEditingAt] = useState<number | null>(null);
  const [confirmAt, setConfirmAt] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [fresh, setFresh] = useState('');
  const now = useRef<HTMLLIElement>(null);

  // Twenty steps opened at the top would put a reader on step eighteen at the
  // bottom of a scroll box, looking at rungs they finished months ago.
  useEffect(() => {
    now.current?.scrollIntoView({ block: 'center' });
    // Once, on open. Re-running it on every edit would yank the list back to
    // the current step the moment somebody edits the one below it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEdit = (index: number) => {
    if (!editable) return;
    setConfirmAt(null);
    setEditingAt(index);
    setDraft(plan.steps[index] ?? '');
  };

  const commit = () => {
    if (editingAt === null) return;
    // An edit cleared to nothing deletes the step, which is what utils/skillSteps
    // does with it — but never silently on the last one, so the field simply
    // closes and the step stands.
    onChange?.(editStep(plan, editingAt, draft));
    setEditingAt(null);
  };

  const commitNew = () => {
    if (cleanStep(fresh)) onChange?.(addStep(plan, fresh));
    setAdding(false);
    setFresh('');
  };

  const full = plan.steps.length >= STEPS_MAX;

  return (
    <div className="stx-lp-body stx-lp-programme">
      <ol className="stx-lp-steps is-all" >
        {plan.steps.map((step, index) => {
          const state = index < at ? 'is-done' : index === at ? 'is-now' : '';

          if (editingAt === index) {
            return (
              <li key={`edit-${index}`} className={`stx-lp-step is-editing ${state}`}>
                <input
                  className="stx-lp-step-field"
                  value={draft}
                  maxLength={STEP_MAX}
                  autoFocus
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commit();
                    if (event.key === 'Escape') setEditingAt(null);
                  }}
                />
                <span className="stx-lp-step-acts">
                  <button type="button" className="stx-lp-step-act is-save" onClick={commit}>
                    Save
                  </button>
                  <button type="button" className="stx-lp-step-act" onClick={() => setEditingAt(null)}>
                    Cancel
                  </button>
                </span>
              </li>
            );
          }

          if (confirmAt === index) {
            return (
              <li key={`confirm-${index}`} className={`stx-lp-step is-confirming ${state}`}>
                <span className="stx-lp-step-ask">Delete this step?</span>
                <span className="stx-lp-step-acts">
                  <button
                    type="button"
                    className="stx-lp-step-act is-danger"
                    onClick={() => {
                      onChange?.(removeStep(plan, index));
                      setConfirmAt(null);
                    }}
                  >
                    Delete
                  </button>
                  <button type="button" className="stx-lp-step-act" onClick={() => setConfirmAt(null)}>
                    Keep
                  </button>
                </span>
              </li>
            );
          }

          return (
            <li
              key={`${index}-${step}`}
              ref={index === at ? now : undefined}
              className={`stx-lp-step ${state}`}
            >
              <button
                type="button"
                className="stx-lp-step-text"
                onClick={() => startEdit(index)}
                disabled={!editable}
              >
                {step}
              </button>
              {onWork && (
                /* The same link the written programme carries, on the derived
                   one too. Most of the library still answers from the ladder,
                   and a way into the problems that only existed on generated
                   nodes would be a feature almost nobody found. */
                <button
                  type="button"
                  className="stx-ws-work is-derived"
                  onClick={() => onWork(index)}
                >
                  <Icon name="target" />
                  Problems for {labelFor(step)}
                  <span aria-hidden="true">→</span>
                </button>
              )}
              {editable && plan.steps.length > 1 && (
                <button
                  type="button"
                  className="stx-lp-step-del"
                  aria-label={`Delete step ${index + 1}`}
                  onClick={() => {
                    setEditingAt(null);
                    setConfirmAt(index);
                  }}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {editable && (
        <div className="stx-lp-step-add">
          {adding ? (
            <>
              <input
                className="stx-lp-step-field"
                value={fresh}
                maxLength={STEP_MAX}
                placeholder="What to actually do…"
                autoFocus
                onChange={(event) => setFresh(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitNew();
                  if (event.key === 'Escape') {
                    setAdding(false);
                    setFresh('');
                  }
                }}
              />
              <span className="stx-lp-step-acts">
                <button type="button" className="stx-lp-step-act is-save" onClick={commitNew}>
                  Add
                </button>
                <button
                  type="button"
                  className="stx-lp-step-act"
                  onClick={() => {
                    setAdding(false);
                    setFresh('');
                  }}
                >
                  Cancel
                </button>
              </span>
            </>
          ) : (
            <button
              type="button"
              className="stx-lp-more"
              onClick={() => setAdding(true)}
              disabled={full}
            >
              {full ? `${STEPS_MAX} steps is the limit` : '+ Add a step'}
            </button>
          )}
          {edited && onReset && (
            <button type="button" className="stx-lp-step-reset" onClick={onReset}>
              Reset to suggested
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export interface LatticePanelProps {
  graph: SkillGraph;
  node: GraphNode | null;
  onSelect: (node: GraphNode | null) => void;
  /** Shown when nothing is picked yet. */
  placeholder?: React.ReactNode;
  /** Put a session's work into this node. Absent makes the button inert. */
  onPractice?: (node: GraphNode) => void;
  /** What one session on the selected node is worth, for the button's label. */
  gain?: number;
  /** Just-added XP, shown for a moment so a click is visibly a change. */
  flash?: number | null;
  /** The reader's own programme for this node, where they have written one. */
  steps?: StepPlan | null;
  /**
   * The written programme the server holds for this node.
   *
   * Absent means nothing has been generated for it yet, and the panel falls
   * back to the derived advice in skills/improve — see the note on
   * `WrittenProgramme` below for why the two coexist.
   */
  written?: WrittenStep[] | null;
  /** Store a programme for this node. Absent leaves the list read-only. */
  onSteps?: (plan: StepPlan) => void;
  /** Throw the reader's programme away and go back to the suggested one. */
  onResetSteps?: () => void;
  /** Rename the node. Absent leaves the heading as plain text. */
  onRename?: (name: string) => void;
  /** Whether this node is under a name the reader gave it. */
  renamed?: boolean;
  /** Put the designed name back. */
  onResetName?: () => void;
  /**
   * Told when the step list takes the screen over.
   *
   * The panel owns whether it is expanded; the *page* owns the grid it sits
   * in, and widening that grid is what makes the list cover the canvas rather
   * than sit in a 340px column beside it. So the state stays here and the fact
   * of it is announced — see `is-wide` in styles/skilltree.css.
   */
  onExpand?: (open: boolean) => void;
  /**
   * The reader's marked problems and the writes that add to them. Absent
   * leaves the panel as it was — describing the skill, not measuring it.
   */
  evidence?: StepEvidence;
}

export function LatticePanel({
  graph,
  node,
  onSelect,
  placeholder,
  onPractice,
  gain = 0,
  flash = null,
  steps = null,
  written = null,
  onSteps,
  onResetSteps,
  onRename,
  renamed = false,
  onResetName,
  onExpand,
  evidence,
}: LatticePanelProps) {
  // The step list opens over the whole panel rather than beside it, so this is
  // panel-wide state rather than the section's. Reset on every change of node:
  // a reader who clicks a new tile wants that tile, not the steps of the last.
  const [allSteps, setAllSteps] = useState(false);
  /* Which step has the page to itself. Separate from `allSteps` rather than a
     third value of it, because the two are independent: the problems screen
     can be opened from the panel's three-step window without the reader ever
     having opened the full list, and going back has to land wherever they came
     from.

     The step itself rather than an index, because the two programmes number
     differently — a written step knows its own ordinal and a ladder rung is
     only a position in an array — and the screen needs the same shape from
     both. */
  const [workingOn, setWorkingOn] = useState<PracticeStep | null>(null);
  const [naming, setNaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  useEffect(() => {
    setAllSteps(false);
    setWorkingOn(null);
    setNaming(false);
  }, [node?.id]);

  // Kept in an effect rather than called from the two setters, so the page
  // hears about the reset above as well as about a click. A panel that closed
  // itself on a new node and left the grid wide would leave the canvas hidden
  // behind an empty column.
  useEffect(() => {
    onExpand?.(allSteps || workingOn !== null);
  }, [allSteps, workingOn, onExpand]);

  // Leaving the page entirely — unmounting mid-expansion — has to put the grid
  // back too.
  useEffect(() => () => onExpand?.(false), [onExpand]);

  /* This node's attempts, every step of it. Above the early return because it
     is a hook, and harmless there: no node, no attempts. */
  const nodeAttempts = useMemo(
    () => (evidence?.attempts ?? []).filter((row) => row.node_id === node?.id),
    [evidence?.attempts, node?.id],
  );
  /* Each written step's level, for the chip on its row. Only when there is
     evidence to read — without it every row would say "Not started", which is
     a claim about the reader the panel has no grounds for. */
  const stepLevels = useMemo(() => {
    if (!evidence || !written) return undefined;
    return Object.fromEntries(
      written.map((step) => [
        step.ordinal,
        readLevel(nodeAttempts.filter((row) => row.ordinal === step.ordinal)),
      ]),
    ) as Record<number, SkillLevel>;
  }, [evidence, written, nodeAttempts]);

  if (!node) {
    return (
      <aside className="stx-lp is-empty">
        <div className="stx-lp-blank">{placeholder}</div>
      </aside>
    );
  }

  const opens = unlockedBy(graph, node.id);
  const needs = requirementsOf(graph, node);
  // What is actually in the way, which on a locked node is the only part of
  // `needs` worth naming — the rest are already done.
  const blockers = needs.filter((entry) => entry.status !== 'complete');
  // Everything under "How to improve", in one call. The group decides which
  // verbs the derived half speaks in, and the graph's own id is the tree's.
  const plan = improvePlan(node, { opens, needs, blockers, group: groupOf(graph.id) });
  /* What this node merely suggests, in either direction along a dashed edge.
     Kept apart from `needs` now: the two used to share a heading called
     "Related", which put a gate and a nice-to-have in one list and left the
     reader to work out which was which from a dash on a line elsewhere. */
  const suggested = [
    ...(node.recommends ?? [])
      .map((id) => graph.nodes.find((entry) => entry.id === id))
      .filter((entry): entry is GraphNode => Boolean(entry)),
    ...graph.nodes.filter((entry) => (entry.recommends ?? []).includes(node.id)),
  ].filter((entry, at, all) => all.findIndex((one) => one.id === entry.id) === at);

  // What is actually shown: the reader's programme where they have written one,
  // and the suggested one otherwise. Everything below reads `programme`, so the
  // panel never has to ask which of the two it is looking at — only the reset
  // control does, and only to know whether there is anything to reset.
  /*
   * Three programmes can exist for a node, and they rank in this order:
   *
   *   1. one the reader has written      `steps`    theirs, never overwritten
   *   2. the written one from the server `written`  checked, subject-specific
   *   3. the derived ladder              `plan`     generic, always available
   *
   * The reader's own comes first because editing a programme is a statement
   * that the suggestion was wrong for them, and a server that quietly replaced
   * it next week would be taking that back. The written one comes before the
   * ladder for the reason the whole table exists — see data/sql/skillsteps.sql.
   * The ladder is the floor: a node nobody has generated for still answers.
   */
  const useWritten = !steps && written !== null && written.length > 0;
  const programme: StepPlan = steps ?? {
    steps: useWritten ? written!.map((step) => step.title) : plan.steps,
    at: plan.at,
  };
  const at = Math.min(programme.at, Math.max(0, programme.steps.length - 1));

  // Three at a time: the one the reader is on and the two after it. A panel
  // that prints all twenty is a wall nobody reads, and one that prints the
  // first three is wrong for everybody past the first three.
  const window = programme.steps.slice(at, at + 3);
  const openSteps = () => setAllSteps(true);

  /*
   * What the one control at the foot of the panel says and does.
   *
   * Six states, and the only one that is not "press this again" is the locked
   * node's, which sends the reader to whatever is in the way. `go` present is
   * what tells the render which of the two buttons to draw — a navigation and
   * a practice session are different verbs and should not share a handler.
   */
  const blocker = node.status === 'locked' ? nearestBlocker(graph, node) : null;
  /* Sessions left on a node counted in XP: how many more times this button has
     to be pressed, which is the question "Practice" never answered. Zero XP to
     go is a node that is already complete, so the floor is one. */
  const sessions = gain > 0 ? Math.max(1, Math.ceil((node.need - node.have) / gain)) : 0;
  const stepsLeft = programme.steps.length - at;

  const cta: { word: string; go?: () => void } =
    node.status === 'complete'
      ? { word: 'Mastered' }
      : blocker
        ? { word: `Start with ${blocker.name}`, go: () => onSelect(blocker) }
        : node.status === 'locked'
          ? { word: 'Locked' }
          : steps
            ? {
                word:
                  stepsLeft === 1
                    ? 'Finish this skill · last step'
                    : `Continue · step ${at + 1} of ${programme.steps.length}`,
              }
            : {
                word:
                  sessions === 1
                    ? `Finish this skill · +${number(gain)} XP`
                    : `Practice · +${number(gain)} XP`,
              };
  /*
   * Where the reader stands, in a sentence.
   *
   * The percentage under it is four states' worth of arithmetic flattened
   * into one number, and there are things it cannot say. "One prerequisite
   * away" is the difference between a dead end and next week; "step 4 of 7"
   * is a position a percentage rounds away; "open now, nothing in the way" is
   * the single most actionable thing the panel ever gets to print, and it read
   * as `0%`.
   *
   * Ordered by what a reader does about it rather than by status: finished
   * first because there is nothing to do, then blocked because the thing to do
   * is elsewhere, then the two kinds of part-done, then open.
   */
  const position =
    node.status === 'complete'
      ? node.on
        ? `Mastered on ${node.on}.`
        : 'Mastered.'
      : blockers.length > 0
        ? `${blockers.length} ${blockers.length === 1 ? 'prerequisite' : 'prerequisites'} away — ${
            blockers.length === 1 ? 'one thing' : 'those'
          } to finish before this opens.`
        : steps
          ? `Step ${at + 1} of ${programme.steps.length} of your own programme.`
          : node.status === 'progress'
            ? `${Math.round(node.percent)}% of the way through.`
            : 'Open now — nothing is in the way of starting it.';

  /*
   * Why the reader is being shown this, in the panel's own words.
   *
   * The checklist under it was drawn only on a blocked node, which meant the
   * question "why am I looking at this" was answered exactly when the answer
   * was "you are not allowed it yet". An open node has a better reason and it
   * was going unsaid: these are the things you have already done.
   */
  const why =
    blockers.length > 0
      ? `Waiting on ${blockers.length} of ${needs.length}:`
      : `Open because ${needs.length === 1 ? 'this is done:' : `all ${needs.length} of these are done:`}`;

  // The first edit takes a copy of the suggested programme — see the note at
  // the top of utils/skillSteps on why an override rather than a diff.
  const changeSteps = onSteps ? (next: StepPlan) => onSteps(next) : undefined;

  function startNaming() {
    if (!onRename) return;
    setNameDraft(node!.name);
    setNaming(true);
  }

  function commitName() {
    setNaming(false);
    const next = cleanName(nameDraft);
    // Unchanged, or cleared to nothing: both mean "leave it alone". Clearing it
    // is undone with Reset name rather than by emptying the field, or a stray
    // select-all-delete would leave a tile with no label on it.
    if (next && next !== node!.name) onRename?.(next);
  }

  /* The problems screen wins over both other layouts. It is the deepest thing
     the panel can be showing and the reader got to it deliberately, so nothing
     above it in this function may pre-empt it. */
  if (workingOn) {
    /* The written step this is, matched on title as well as number: a rung of
       the reader's own programme can share an ordinal with a written step and
       be about something else entirely. Only a match gets problems — and only
       a match can be marked, because its number is the server's and stays. */
    const writtenStep = written?.find(
      (one) => one.ordinal === workingOn.ordinal && one.title === workingOn.title,
    );
    return (
      <StepWorkspace
        step={workingOn}
        problems={writtenStep?.problems}
        evidence={writtenStep ? evidence : undefined}
        node={node}
        // Back lands where they came from: the full list if it was open behind
        // this, the panel if the link was clicked from the three-step window.
        onBack={() => setWorkingOn(null)}
        onBackToTree={() => {
          setWorkingOn(null);
          setAllSteps(false);
        }}
      />
    );
  }

  // The whole panel, given over to the programme. Not a section that grew a
  // scrollbar — the steps are what the reader asked for, so everything else
  // gets out of the way and the list has the full height to itself.
  if (allSteps) {
    return (
      <aside className={`stx-lp is-steps tier-${node.difficulty}`}>
        <header className="stx-lp-steps-head">
          <button type="button" className="stx-lp-back" onClick={() => setAllSteps(false)}>
            <span aria-hidden="true">←</span> Back to Tree
          </button>
          <div>
            <h2>{node.name}</h2>
            <p className="stx-lp-steps-count">
              {programme.steps.length} steps · on {at + 1}
              {steps ? ' · yours' : ''}
            </p>
          </div>
        </header>
        {useWritten ? (
          <div className="stx-lp-body stx-lp-programme">
            <WrittenProgramme
              steps={written!}
              at={at}
              levels={stepLevels}
              onWork={(step) => setWorkingOn(step)}
            />
          </div>
        ) : (
          <Programme
            plan={programme}
            at={at}
            onChange={changeSteps}
            onReset={onResetSteps}
            editable={Boolean(changeSteps)}
            edited={Boolean(steps)}
            onWork={(index) =>
              setWorkingOn(asPractice(programme.steps[index]!, index + 1, node, plan))
            }
          />
        )}
      </aside>
    );
  }

  return (
    <aside className={`stx-lp tier-${node.difficulty}`}>
      <header className="stx-lp-head">
        <span className={`stx-lp-avatar is-${node.status}`}>
          <Ico icon={node.icon} className="stx-ico stx-lp-avatar-ico" />
        </span>
        <div className="stx-lp-head-body">
          {naming ? (
            /* Saving on blur as well as on Enter: a heading that silently threw
               away a typed name because the reader clicked the canvas would be
               the worst of the three ways this could behave. */
            <input
              className="stx-lp-name-field"
              value={nameDraft}
              maxLength={NAME_MAX}
              autoFocus
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitName();
                if (event.key === 'Escape') setNaming(false);
              }}
            />
          ) : (
            <h2>
              <button
                type="button"
                className="stx-lp-name"
                onClick={startNaming}
                disabled={!onRename}
                title={onRename ? 'Rename this skill' : undefined}
              >
                {node.name}
              </button>
            </h2>
          )}
          <p className="stx-lp-badges">
            {/* Difficulty first: it is the thing the tile was coloured by, so
                the panel should confirm rather than reintroduce it. */}
            <span className="stx-lp-badge is-tier">{DIFFICULTY_LABEL[node.difficulty]}</span>
            {node.tags?.map((tag) => (
              <span key={tag} className="stx-lp-badge is-kind">
                {tag}
              </span>
            ))}
            <span className={`stx-lp-badge is-state is-${node.status}`}>{STATUS_LABEL[node.status]}</span>
            {/* Suggested rather than required — see `optionalIds` in
                skills/route. After the status rather than before it, because
                the two answer different questions and the first one a reader
                asks is still "can I start this". */}
            {optionalIds(graph).has(node.id) && (
              <span className="stx-lp-badge is-optional" title="Nothing on this tree waits on it">
                Optional
              </span>
            )}
            {renamed && onResetName && (
              <button type="button" className="stx-lp-name-reset" onClick={onResetName}>
                Reset name
              </button>
            )}
          </p>
        </div>
        {/* The figure, in the header where the name is, rather than fifty
            pixels down inside a section about progress. It is the one number a
            reader looks for the instant a panel opens, and it was under two
            paragraphs of prose. */}
        <strong className={`stx-lp-big is-${node.status}`} aria-hidden="true">
          {Math.round(node.percent)}%
        </strong>
      </header>

      {/* Everything between the name and the button scrolls, so the panel is
          exactly as tall as the canvas beside it however much a node carries. */}
      <div className="stx-lp-body">
        {/* ---- 2. Your progress ----
            First, because a reader who has clicked a tile they already know
            is asking where *they* are on it, and because everything under
            "Next move" only means anything once that is on the table. */}
        <section className="stx-lp-truth is-mine">
          <h3 className="stx-lp-truth-name">Your progress</h3>

          {/* The state in a sentence rather than in a percentage. "72%" is
              four states' worth of arithmetic flattened into one number: it
              cannot say "one prerequisite away", and that is the state a
              reader acts on. */}
          <p className={`stx-lp-position is-${node.status}`}>{position}</p>

          <div className={`stx-lp-progress is-${node.status}`}>
            <p className="stx-lp-line">
              <span>Progress</span>
              <b>
                {Math.round(node.percent)}%
                {flash != null && (
                  <span className="stx-lp-flash" role="status">
                    +{number(flash)} XP
                  </span>
                )}
              </b>
            </p>
            <ProgressIndicator percent={node.percent} shape="bar" />
            {node.need > 0 && (
              <p className="stx-lp-line stx-lp-xp">
                <span>XP Earned</span>
                <b>
                  {number(node.have)} / {number(node.need)} XP
                </b>
              </p>
            )}
          </div>
        </section>

        {/* ---- 2b. Your level, measured ----
            The figure above is the tree's own and the same on every account.
            This one is read from problems the reader marked right or wrong,
            per step — so it gets its own heading, and says so. */}
        {evidence && (
          <section className="stx-lp-truth is-mine is-measured">
            <h3 className="stx-lp-truth-name">Your level, step by step</h3>
            {written && written.length > 0 ? (
              <LevelChain
                steps={written.map((step) => ({ ordinal: step.ordinal, title: step.title }))}
                attempts={nodeAttempts}
                onOpen={(ordinal) => {
                  const step = written.find((one) => one.ordinal === ordinal);
                  if (step) setWorkingOn(step);
                }}
              />
            ) : (
              /* Nothing written for this node yet, so there are no steps to
                 split it into and no problems to mark. Work done elsewhere
                 can still be logged against the skill as a whole. */
              <>
                <LevelCard attempts={nodeAttempts.filter((row) => row.ordinal === 0)} />
                <LogPractice
                  busy={false}
                  label="This skill has no written problems yet. Log problems you did elsewhere and your level is read from those."
                  onLog={async (weight, attempted, correct) =>
                    Boolean(
                      await evidence.onAttempt({
                        node_id: node.id, ordinal: 0, weight,
                        attempted, correct, source: 'log',
                      }),
                    )
                  }
                />
              </>
            )}
          </section>
        )}

        {/* ---- 3. The curriculum ----
            What the subject says, which is the same on every account. The
            heading is doing real work: everything under it is authored and
            nothing under it is about the reader, which is the distinction the
            whole page is arranged around and had never been said out loud. */}
        <section className="stx-lp-truth is-authored">
          <h3 className="stx-lp-truth-name">The curriculum</h3>

          {node.blurb && <p className="stx-lp-blurb">{node.blurb}</p>}

          {/* Why this skill is where it is — the panel showing its working.
              It used to appear only on a blocked node, which meant the
              question "why am I being shown this" had an answer exactly when
              the answer was "you are not allowed it yet". An open node has a
              reason too, and it is a better one: these are the things you
              have already done. */}
          {needs.length > 0 ? (
            <>
              <p className="stx-lp-why">{why}</p>
              <ul className="stx-lp-needs" aria-label="What this skill sits on">
                {needs.map((need) => {
                  const done = need.status === 'complete';
                  return (
                    <li key={need.id} className={done ? 'is-done' : undefined}>
                      <span className="stx-lp-need-mark" aria-hidden="true">
                        {done ? '✓' : '○'}
                      </span>
                      <button type="button" onClick={() => onSelect(need)}>
                        {need.name}
                      </button>
                      {!done && <em>{STATUS_LABEL[need.status]}</em>}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="stx-lp-why">A foundation of this subject — nothing comes before it.</p>
          )}
        </section>

        {/* ---- 4. Your next move ----
            The centre of the panel and the only part that says what to do with
            an afternoon. Everything above describes; everything below
            navigates. All four pieces are one call into skills/improve, which
            is what stops the steps and the proof asking for different things. */}
        <section className="stx-lp-truth is-move">
          <h3 className="stx-lp-truth-name">Your next move</h3>

          <p className={`stx-lp-headline is-${node.status}`}>{plan.headline}</p>
          {useWritten ? (
            /* The written steps open where they stand. The reader's next three
               are the ones worth room in the panel, and any of them expands in
               place — "All N steps" is still there for the whole list, but it
               is no longer the only way to read what a step actually asks. */
            <WrittenProgramme
              steps={written!.slice(at, at + 3)}
              at={0}
              levels={stepLevels}
              onWork={(step) => setWorkingOn(step)}
            />
          ) : (
            /* `start` rather than a re-numbered list: step seven has to read as
               step seven, or the count under it is describing something else. */
            /* `start` rather than a re-numbered list: step seven has to read
               as step seven, or the count under it is describing something
               else. The row still opens the full list; the link under it goes
               straight to that step's problems. */
            <ol className="stx-lp-steps is-window" start={at + 1}>
              {window.map((step, index) => (
                <li key={step} className={index === 0 ? 'is-now' : ''}>
                  <button type="button" className="stx-lp-window-text" onClick={openSteps}>
                    {step}
                  </button>
                  <button
                    type="button"
                    className="stx-ws-work is-derived"
                    onClick={() =>
                      setWorkingOn(asPractice(step, at + index + 1, node, plan))
                    }
                  >
                    <Icon name="target" />
                    Problems for {labelFor(step)}
                    <span aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <button type="button" className="stx-lp-more" onClick={openSteps}>
            All {programme.steps.length} steps
          </button>

          {/* Pulled out of the row of three notes it used to sit in. "How will
              I know I am done" is the question a set of steps raises and the
              one a percentage answers worst — it deserves the weight the
              other two do not. */}
          <p className="stx-lp-proof">
            <b>Done when</b>
            {plan.proof}
          </p>

          <dl className="stx-lp-notes">
            <div className="stx-lp-note is-pitfall">
              <dt>Common trap</dt>
              <dd>{plan.pitfall}</dd>
            </div>
            <div className="stx-lp-note is-effort">
              <dt>Time</dt>
              <dd>{plan.effort}</dd>
            </div>
          </dl>
        </section>

        {/* ---- 5. What comes next ----
            Two lists that were one. "Related" held the prerequisites and the
            suggestions together, which put a gate and a nice-to-have under one
            heading — and the prerequisites have their own section above now.
            What is left is the pair a reader actually chooses between: what
            this opens, and what is merely worth a look. */}
        {(opens.length > 0 || suggested.length > 0) && (
          <section className="stx-lp-truth is-next">
            <h3 className="stx-lp-truth-name">What comes next</h3>
            <Rows title={`Finishing this opens ${opens.length === 1 ? 'a skill' : `${opens.length} skills`}`} nodes={opens} onSelect={onSelect} />
            <Rows title="Worth exploring" nodes={suggested} onSelect={onSelect} showPercent />
          </section>
        )}
      </div>

      {/* The one control, and it says what pressing it does here rather than
          what it does in general.

          A locked node used to get a greyed-out button repeating the word the
          badge already said, which is the shape of a dead end. It now offers
          the prerequisite to go and do — the panel's only action that moves
          the reader somewhere rather than adding to something.

          The rest is the difference between starting, continuing and
          finishing, which are three different feelings and were one sentence.
          `left` is sessions rather than steps on a node counted in XP: both
          are "how many more times do I press this", which is the question the
          word "Practice" was leaving unanswered. */}
      {cta.go ? (
        <button type="button" className="stx-lp-cta is-go" onClick={cta.go}>
          <Ico icon="branch" className="stx-ico stx-lp-cta-ico" />
          {cta.word}
        </button>
      ) : (
        <button
          type="button"
          className="stx-lp-cta"
          disabled={!onPractice || node.status === 'complete'}
          onClick={() => onPractice?.(node)}
        >
          <Ico
            icon={node.status === 'complete' ? 'mastered' : 'practice'}
            className="stx-ico stx-lp-cta-ico"
          />
          {cta.word}
        </button>
      )}
    </aside>
  );
}

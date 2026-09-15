/**
 * What a lattice node is, once you have clicked it.
 *
 * The column beside the canvas: the skill's drawing and name, what kind of
 * thing it is and where it stands, a sentence about it, the progress and the XP
 * behind that progress, then how to get better at it, then the two lists that
 * make the panel a way of walking the tree rather than a caption — what this
 * node opens, and what sits near it.
 *
 * ## How to improve is the middle of the panel, not a footnote
 *
 * Everything above it describes the skill; everything below it is navigation.
 * The section between the two is the only part that tells a reader what to do
 * with their afternoon, so it is the one that carries four things rather than
 * one — the steps, and then the three questions somebody asks the moment they
 * have read the steps: how will I know, how does this go wrong, how long. All
 * four are one call into skills/improve, which is what stops them disagreeing.
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
 * right way round to store it — one edge, written once — so "Unlocks" is those
 * same edges read backwards, and "Related" is the node's own prerequisites plus
 * anything it merely recommends. Every row selects the node it names, which is
 * what turns the panel into navigation.
 *
 * ## A locked node is told what is in the way, by name
 *
 * "Locked" on its own is a word, not information. The checklist under the
 * counts names every prerequisite and ticks the ones that are done, so a node
 * blocked by one reads differently from a node blocked by four — and the
 * action at the foot of the panel becomes *start with the thing that is
 * blocking it* rather than a greyed-out button repeating the word. See
 * `nearestBlocker` in skills/route for which of several it picks.
 *
 * ## Where this sits, before what it is
 *
 * "Your path" is three counts the panel could always have stated and never
 * did: how many of the prerequisites are behind you, how many are not, and how
 * many skills open when this one lands. All three are the graph read two ways
 * — `requirementsOf` and `unlockedBy` — and they are the difference between a
 * locked tile reading as a dead end and reading as a near-term target. The
 * canvas says the same thing in emphasis; this says it in numbers, because a
 * shade cannot say "one away".
 *
 * ## Nothing empty is printed
 *
 * A list with no rows, an XP line on a node worth zero: each is absent rather
 * than drawn as a dash. A panel of dashes reads as a form that failed to load.
 */
import { useEffect, useRef, useState } from 'react';
import { improvePlan } from '@/skills/improve';
import { nearestBlocker } from '@/skills/route';
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
import { ProgressIndicator } from './ProgressIndicator';

const number = (value: number) => Math.round(value).toLocaleString();

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
}: {
  plan: StepPlan;
  at: number;
  onChange?: (next: StepPlan) => void;
  onReset?: () => void;
  editable: boolean;
  /** Whether this programme is the reader's or still the suggested one. */
  edited: boolean;
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
  onSteps,
  onResetSteps,
  onRename,
  renamed = false,
  onResetName,
}: LatticePanelProps) {
  // The step list opens over the whole panel rather than beside it, so this is
  // panel-wide state rather than the section's. Reset on every change of node:
  // a reader who clicks a new tile wants that tile, not the steps of the last.
  const [allSteps, setAllSteps] = useState(false);
  const [naming, setNaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  useEffect(() => {
    setAllSteps(false);
    setNaming(false);
  }, [node?.id]);

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
  // Its own prerequisites first, then anything it suggests — the nodes a reader
  // would look at next in either direction.
  const near = [
    ...needs,
    ...(node.recommends ?? [])
      .map((id) => graph.nodes.find((entry) => entry.id === id))
      .filter((entry): entry is GraphNode => Boolean(entry)),
  ];

  // What is actually shown: the reader's programme where they have written one,
  // and the suggested one otherwise. Everything below reads `programme`, so the
  // panel never has to ask which of the two it is looking at — only the reset
  // control does, and only to know whether there is anything to reset.
  const programme: StepPlan = steps ?? { steps: plan.steps, at: plan.at };
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

  // The whole panel, given over to the programme. Not a section that grew a
  // scrollbar — the steps are what the reader asked for, so everything else
  // gets out of the way and the list has the full height to itself.
  if (allSteps) {
    return (
      <aside className={`stx-lp is-steps tier-${node.difficulty}`}>
        <header className="stx-lp-steps-head">
          <button type="button" className="stx-lp-back" onClick={() => setAllSteps(false)}>
            ← Back
          </button>
          <div>
            <h2>{node.name}</h2>
            <p className="stx-lp-steps-count">
              {programme.steps.length} steps · on {at + 1}
              {steps ? ' · yours' : ''}
            </p>
          </div>
        </header>
        <Programme
          plan={programme}
          at={at}
          onChange={changeSteps}
          onReset={onResetSteps}
          editable={Boolean(changeSteps)}
          edited={Boolean(steps)}
        />
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
            {renamed && onResetName && (
              <button type="button" className="stx-lp-name-reset" onClick={onResetName}>
                Reset name
              </button>
            )}
          </p>
        </div>
      </header>

      {/* Everything between the name and the button scrolls, so the panel is
          exactly as tall as the canvas beside it however much a node carries. */}
      <div className="stx-lp-body">
        {node.blurb && <p className="stx-lp-blurb">{node.blurb}</p>}

        {/* Where this sits, in the two directions that matter. Before the
            percentage on purpose: "one prerequisite away" is a more useful
            first fact about a locked node than "0%". */}
        {(needs.length > 0 || opens.length > 0) && (
          <ul className="stx-lp-path">
            {blockers.length > 0 ? (
              <li className="is-blocked">
                {/* "1 of 1" is a fraction nobody needs. The count on its own is
                    the whole fact until some of them are done. */}
                <b>
                  {blockers.length === needs.length
                    ? blockers.length
                    : `${blockers.length} of ${needs.length}`}
                </b>{' '}
                {blockers.length === 1 ? 'prerequisite' : 'prerequisites'} still to go
              </li>
            ) : needs.length > 0 ? (
              <li className="is-met">
                <b>All {needs.length}</b>{' '}
                {needs.length === 1 ? 'prerequisite is' : 'prerequisites are'} done
              </li>
            ) : null}
            {opens.length > 0 && (
              <li className="is-opens">
                <b>{opens.length}</b> {opens.length === 1 ? 'skill opens' : 'skills open'} after it
              </li>
            )}
          </ul>
        )}

        {/* What is actually in the way, by name. Only while something is: a
            finished list of ticks under a node that is already open is a
            paragraph saying nothing happened. */}
        {blockers.length > 0 && (
          <ul className="stx-lp-needs" aria-label="What this needs first">
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
        )}

        <section className={`stx-lp-progress is-${node.status}`}>
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
        </section>

        {/* How to improve — the part a reader came for once they have decided
            to work on this. The headline is where *they* stand, the steps are
            what to go and do, and the three notes are the questions asked the
            moment the steps have been read: when am I done, what goes wrong,
            how long. All of it is one call, so a locked node's steps and its
            proof cannot disagree about what they are asking for. */}
        <section className="stx-lp-section stx-lp-improve">
          <h3>How to improve</h3>
          <p className={`stx-lp-headline is-${node.status}`}>{plan.headline}</p>
          {/* `start` rather than a re-numbered list: step seven has to read as
              step seven, or the count under it is describing something else. */}
          <ol className="stx-lp-steps is-window" start={at + 1} onClick={openSteps}>
            {window.map((step, index) => (
              <li key={step} className={index === 0 ? 'is-now' : ''}>
                {step}
              </li>
            ))}
          </ol>
          <button type="button" className="stx-lp-more" onClick={openSteps}>
            All {programme.steps.length} steps
          </button>
          <dl className="stx-lp-notes">
            <div className="stx-lp-note is-proof">
              <dt>Done when</dt>
              <dd>{plan.proof}</dd>
            </div>
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

        <Rows title="Unlocks" nodes={opens} onSelect={onSelect} />
        <Rows title="Related Skills" nodes={near} onSelect={onSelect} showPercent />
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

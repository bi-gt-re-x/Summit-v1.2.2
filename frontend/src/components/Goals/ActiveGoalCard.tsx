/**
 * One goal, at full width — the shape the Active Goals tab is made of.
 *
 * ## What the card is arranged to answer
 *
 * Three questions in three regions, left to right and top to bottom, and no
 * region answers a question another one already did:
 *
 *     the header   what is this, and how far in am I
 *     the middle   what am I on now, and what do I do next
 *     the footer   when did it start, when is it due, what has it cost
 *     the chart    how did it get here (folded until opened)
 *
 * The chart and the checkpoint used to share a row, half the card each. That
 * put a chart, a nested checklist and a task linker side by side, which read
 * as busy before it read as anything. They stack now, with the part you act
 * on first and the chart one click away (2026-11-08).
 *
 * The old ladder answered the first and the middle and left the last two to
 * three other bands further down the page. Putting them on the card is most of
 * why the page can now be four tabs instead of eleven stacked sections.
 *
 * ## The chart is one chart, and which one depends on the goal
 *
 * Not a fixed chart with the numbers swapped. `pickVisual` in utils/goalVisuals
 * runs goal type → subject → available data and returns exactly one: a
 * competition maths goal with rated attempts behind it gets accuracy against
 * difficulty, a violin goal gets the consistency grid, a project gets its
 * roadmap, a goal measured by a number gets the distance to it. The same card,
 * completely different analytics, which is the point — an app where every goal
 * gets the same graph is telling you about its template.
 *
 * One, though. Not a stack and not tabs: two charts on a card are two things
 * competing to be the thing you look at, and neither wins. The checkpoint list
 * that used to sit under the chart is gone with it — the current one is named in
 * the panel opposite and the rest are one click away.
 *
 * ## What is not invented
 *
 * The current checkpoint has no percentage of its own; a checkpoint is reached
 * or it is not. Where tasks are linked to it, the share of them finished is a
 * real reading and is drawn. Where none are, the bar is absent and the date
 * takes its place — rather than a figure derived from the goal's overall
 * progress, which would be the same number twice with one of them relabelled.
 */
import { useEffect, useMemo, useState } from 'react';
import { GoalTile, HealthChip, categoryOf } from './Outcome';
import { AskModel, Spark } from './AskModel';
import { SmartPlan } from './SmartPlan';
import { ChartMenu, GoalVisual } from './GoalVisual';
import { formatGoalDate, goalDate, goalNumbers, goalWeight, isOverdue } from './numbers';
import { goalHealth } from '@/utils/goalHealth';
import { pickVisual, visualContext } from '@/utils/goalVisuals';
import { currentStone } from '@/utils/goalStage';
import {
  MAX_STEPS,
  addStep,
  editStep,
  linkStep,
  promptFor,
  stepDue,
  stepProgress,
  stepWindow,
  stepsComplete,
  toggleStep,
} from '@/utils/milestoneSteps';
import type { Goal, Milestone, MilestoneStatus, MilestoneStep, Task } from '@/types';
import { useCountUp } from '@/hooks/useCountUp';
import { awaitingVerify } from '@/utils/goalProgress';
import { secondsSpent } from '@/utils/timeSpent';

const DAY = 86_400_000;

/** Below this a goal is not "long term" — about a season. */
const LONG_TERM_DAYS = 120;

/** Priority at or above this wears the high-priority tag. */
const HIGH_PRIORITY = 7;

/** Search results offered when linking an existing task. A shortlist, not a list. */
const MATCHES = 6;

const pct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/** Milliseconds, or 0. Bare dates are read as local days — see `goalDate`. */
const time = (value?: string) => goalDate(value)?.getTime() ?? 0;

/** "Aug 21" — short, because these sit in a column an inch wide. */
function shortDate(value?: string): string {
  const at = time(value);
  if (!at) return '';
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "May 2024" — where the year is the point rather than the day. */
function monthYear(value?: string): string {
  const at = time(value);
  if (!at) return 'No date';
  return new Date(at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/** "320h 15m", the way the footer prints it. */
function hoursMinutes(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}


// ---------------------------------------------------------------------------
// The ring
// ---------------------------------------------------------------------------
function Ring({ percent, tone }: { percent: number; tone: string }) {
  const size = 46;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = (pct(percent) / 100) * circumference;
  return (
    <svg className={`ag-ring tone-${tone}`} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="ag-ring-track" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="ag-ring-arc"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference - filled}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------
/** Which goals' charts are open, remembered on this device. */
const CHARTS_KEY = 'summit:goals:charts-open';

function readOpenCharts(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(CHARTS_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Whether this goal's chart is showing. Closed until opened, and then it
 * stays open on this device, so a reader who wants the chart gets it every
 * time and one who doesn't never has to close it.
 */
function useChartOpen(goalId: string): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => readOpenCharts().includes(goalId));
  const set = (next: boolean) => {
    setOpen(next);
    try {
      const others = readOpenCharts().filter((id) => id !== goalId);
      window.localStorage.setItem(CHARTS_KEY, JSON.stringify(next ? [...others, goalId] : others));
    } catch {
      // No storage: it still opens, it just won't be remembered.
    }
  };
  return [open, set];
}

export interface ActiveGoalCardProps {
  goal: Goal;
  tasks: Task[];
  busy: boolean;
  onOpen: (goal: Goal) => void;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onComplete: (task: Task) => void;
  /** Point a task that already exists at this goal, rather than making a new one. */
  onLinkTask: (goal: Goal, task: Task, milestoneId?: string) => void;
  /** Ask for a checkpoint list. Resolves null when the model could not answer. */
  onSuggest: (goal: Goal) => Promise<string[] | null>;
  /**
   * The kebab's "Redraft checkpoints" — the same draft, from a goal that may
   * already have a ladder.
   *
   * Separate from `onSuggest` because the page has to ask first: replacing a
   * ladder somebody wrote is not something a menu item should do on one click.
   * The panels' own offers stay on `onSuggest`, which only ever runs where
   * there is nothing to lose.
   */
  onRedraftStones: (goal: Goal) => void;
  /**
   * Draft a checklist for every checkpoint that has none.
   *
   * Additive, so unlike the redraft it needs no confirmation — see
   * ./SmartPlan, which is the row both of these now appear in.
   */
  onFillSteps: (goal: Goal) => void;
  /**
   * Ask the model for this checkpoint's five steps, and save them.
   *
   * Offered only on a checkpoint whose checklist is *empty*, which is the
   * `focusSteps.total === 0` guard on the button. The write behind it
   * replaces the whole `steps` column — that is what `update_milestone`
   * takes — so on a checkpoint somebody has already written into, this
   * button would be a suggestion silently deleting their plan. The model
   * proposes; it does not overwrite.
   */
  onSuggestSteps: (milestone: Milestone) => void;
  /**
   * The page is drafting a plan under this goal right now — it was just
   * created, or a checkpoint under it was, and the model is being asked.
   *
   * Separate from the card's own `thinking`, which is the Suggest button being
   * pressed by hand, because the two start in different places. They show the
   * same thing, so the button reads as busy either way rather than looking
   * pressable while a plan is already on its way to the same ladder.
   */
  planning?: boolean;
  /** Write a whole checkpoint list. Resolves false if the write failed. */
  onSaveStones: (goal: Goal, titles: string[]) => Promise<boolean>;
  /** Make one checkpoint the focus. */
  onFocusMilestone: (milestone: Milestone) => void;
  /** Tick or untick one of the focus checkpoint's steps. */
  onMilestoneSteps: (milestone: Milestone, steps: MilestoneStep[]) => void;
  /** Mark the focus checkpoint reached, once its checklist is clear. */
  onMilestoneStatus: (milestone: Milestone, status: MilestoneStatus) => void;
  /**
   * The answer to "is this goal really done?", asked once its numbers say it
   * is (or, on a goal with no target, once every checkpoint is behind it).
   */
  onVerify: (goal: Goal, done: boolean) => void;
  /** Add a checkpoint at the end, from the "Not yet" answer. */
  onAddMilestone?: (goal: Goal, title: string) => void;
  /** A higher target for a number goal, from the "Not yet" answer. */
  onRaiseTarget?: (goal: Goal, target: number) => void;
  /** Turns a subject id into its name, for the charts that group by subject. */
  nameOf: (id: string) => string;
  /** Pin a chart to the card, or an empty string to let the page pick. */
  onChart?: (goal: Goal, chart: string) => void;
  /**
   * Print the health reason instead of hiding it in the chip's tooltip.
   *
   * Set by the header's attention filter, and by nothing else. A card the
   * reader picked needs the colour and the label; a card the *page* picked
   * needs to say what it was picked for, in words, where the reader is
   * looking — otherwise the filter is a list of goals with no stated crime.
   */
  explain?: boolean;
}

export function ActiveGoalCard({
  goal,
  tasks,
  busy,
  onOpen,
  onEdit,
  onDelete,
  onComplete,
  onLinkTask,
  onSuggest,
  onRedraftStones,
  onFillSteps,
  onSuggestSteps,
  planning = false,
  onSaveStones,
  onFocusMilestone,
  onMilestoneSteps,
  onMilestoneStatus,
  onVerify,
  onAddMilestone,
  onRaiseTarget,
  nameOf,
  onChart,
  explain = false,
}: ActiveGoalCardProps) {
  /** Midnight today, so a step due today is not drawn as late. */
  const todayStart = new Date(new Date().toDateString()).getTime();
  const category = categoryOf(goal);
  const numbers = goalNumbers(goal);
  const health = goalHealth(goal);
  const stones = goal.milestones ?? [];

  const [menuOpen, setMenuOpen] = useState(false);
  /* "Not yet" opens real choices instead of guessing: what's left becomes a
     checkpoint, the last one reopens, or the target goes up. Each one takes
     the goal back under 100%, so 100% only ever means "finished, say so". */
  const [notYet, setNotYet] = useState(false);
  const [leftover, setLeftover] = useState('');
  const [raised, setRaised] = useState('');
  const [chartOpen, setChartOpen] = useChartOpen(goal.id);
  /* The focus picker, closed by default. It is a disclosure rather than a
     select because the options are checkpoint titles — full sentences, most of
     them — and a native select would truncate every one of them to the width
     of the panel. */
  const [picking, setPicking] = useState(false);
  /** Naming a step. `index` is -1 for a new one, or the row being filled in. */
  const [stepDraft, setStepDraft] = useState<{ index: number; text: string } | null>(null);
  /** Which step is choosing a task to link, or null. */
  const [linkAt, setLinkAt] = useState<number | null>(null);
  /** The card's own celebration, cleared by a timer. See `.ag-cheer`. */
  const [cheer, setCheer] = useState<'milestone' | null>(null);
  /**
   * The step ticked a moment ago, or null. Drives the tick animation only.
   *
   * The animation cannot key off `.is-done`, and this is the whole reason
   * this state exists: a CSS animation runs when its element mounts, so a
   * checkpoint that was finished last week would draw all five of its ticks
   * every time the page loaded — twenty little animations firing at once on a
   * card nobody had touched. Marking the one row the reader just acted on is
   * what makes the movement mean "that worked" rather than "the page
   * rendered".
   */
  const [ticked, setTicked] = useState<string | null>(null);

  /* Long enough for the draw and the row's wash to finish, and no longer: the
     class only gates the animation, so dropping it early would cut the tick
     off halfway. Cleared on unmount for the reason the cheer timer is. */
  useEffect(() => {
    if (!ticked) return undefined;
    const timer = window.setTimeout(() => setTicked(null), 600);
    return () => window.clearTimeout(timer);
  }, [ticked]);

  /* It lets go on its own. The click that starts it is also a write, and the
     card re-renders under the reader when the reply lands — a banner that
     needed dismissing would be a second thing to do at the moment they just
     finished doing something. Two seconds is long enough to read four words.

     **This number is half of a pair.** `ag-cheer-life` in styles/goals.css
     runs for the same two seconds and spends its last fifth fading out, so
     the panel has finished leaving by the time this unmounts it. Change one
     and the other has to move with it: shorten the CSS and the card sits
     blank for the remainder; shorten this and the fade is cut off mid-way,
     which is the abrupt disappearance the animation was written to fix.

     Cleared on unmount as well, because completing a goal moves it out of the
     Active tab: the card that was celebrating is gone before the timer ends,
     and a setState after that is a leak. */
  useEffect(() => {
    if (!cheer) return undefined;
    const timer = window.setTimeout(() => setCheer(null), 2000);
    return () => window.clearTimeout(timer);
  }, [cheer]);
  const [draft, setDraft] = useState('');
  /* Which search result the keyboard is on. -1 is the box itself, and it is the
     resting position: Enter on a typed title makes a new task, which is what the
     box did before it could also search. You arrow into the list deliberately. */
  const [pick, setPick] = useState(-1);
  /* The suggestion round trip is a model call and can take several seconds, so
     it carries its own busy state rather than the page's — the rest of the card
     stays usable while one goal is thinking. The ladder this replaced owned its
     spinner for the same reason. */
  const [thinking, setThinking] = useState(false);
  /** Either route to the same model call. See `planning` in the props. */
  const drafting = thinking || planning;

  /**
   * Ask for the ladder, and accept it.
   *
   * The two halves are one action from the reader's side — the button says
   * "suggest checkpoints" and what they want is checkpoints on the card — so
   * the draft-then-save pair lives here rather than being written out at each
   * of the two places that offers it.
   */
  const askStones = () => {
    setThinking(true);
    void onSuggest(goal)
      .then((titles) => (titles && titles.length ? onSaveStones(goal, titles) : null))
      .finally(() => setThinking(false));
  };

  /* The goal, its linked work, and the one chart that work can support. Both
     memoised on the same inputs, so a card only re-picks when something it is
     drawn from actually changed. */
  const context = useMemo(() => visualContext(goal, tasks), [goal, tasks]);
  const visual = useMemo(() => pickVisual(context), [context]);

  /** Every task that is work toward this goal, by either route. */
  const mine = context.linked;

  /** The checkpoint being worked on. The rule is utils/goalStage's. */
  const focus = useMemo(() => currentStone(goal), [goal]);

  /** The checkpoints the focus could be moved to — everything not yet reached. */
  const switchable = useMemo(() => stones.filter((stone) => stone.status !== 'done'), [stones]);

  /** How many of the focus checkpoint's named steps are ticked. */
  const focusSteps = useMemo(
    () => (focus ? stepProgress(focus.steps) : { done: 0, total: 0 }),
    [focus],
  );

  /** The three rows the card draws, and where in the list they start. */
  const shown = useMemo(() => {
    const window = focus ? stepWindow(focus.steps) : { from: 0, shown: [] as MilestoneStep[] };
    return { from: window.from, steps: window.shown };
  }, [focus]);

  /**
   * The one step to do next: the first that is neither ticked nor unnamed.
   *
   * Named rather than left to the reader to find, because the checklist is
   * windowed three at a time and a window opening on a half-done checkpoint
   * shows a mix of ticked and unticked rows — "which of these is mine" is a
   * question the panel can answer and was making the reader answer. A
   * placeholder is skipped: "Next: Step 4" over a row nobody has written yet
   * is an instruction to do something unnamed.
   */
  const nextStep = useMemo(
    () => (focus ? focus.steps.find((step) => !step.done && !step.placeholder) ?? null : null),
    [focus],
  );

  /** Every named step ticked — the checkpoint has nothing left in it. */
  const readyToClose = Boolean(focus && focus.status !== 'done' && stepsComplete(focus.steps));

  /** Every checkpoint reached, on a goal that has some and is still open. */
  const readyToFinish =
    goal.status !== 'completed' &&
    stones.length > 0 &&
    stones.every((stone) => stone.status === 'done');

  /* The question the card asks when the goal is reached. Its own numbers
     finished it (the server flagged it), or it has no target and every
     checkpoint is behind it, which only the reader can call. */
  const asking = awaitingVerify(goal) || readyToFinish;

  /* The figure counts to its new value rather than jumping, so a ticked step
     is something you watch land. The ring beside it eases the same distance
     over the same time (`.ag-ring-arc` in styles/goals.css). */
  const shownProgress = useCountUp(numbers.progress);

  /**
   * The tasks already on the account that the draft could be naming.
   *
   * Only open ones, and only ones that are not already this goal's work —
   * offering a task that is already linked is a row that does nothing when you
   * click it. An empty box offers the first few rather than nothing, so the
   * list is a way in rather than something you have to guess the opening
   * letters of, and a title that starts with what was typed sorts above one
   * that merely contains it.
   */
  const matches = useMemo(() => {
    if (linkAt === null) return [];
    const query = draft.trim().toLowerCase();
    const linked = new Set(mine.map((task) => task.id));
    return tasks
      .filter(
        (task) =>
          task.status !== 'done' &&
          !linked.has(task.id) &&
          (!query || task.title.toLowerCase().includes(query)),
      )
      .sort((a, b) => {
        if (!query) return 0;
        return (
          Number(b.title.toLowerCase().startsWith(query)) -
          Number(a.title.toLowerCase().startsWith(query))
        );
      })
      .slice(0, MATCHES);
  }, [linkAt, draft, mine, tasks]);

  /** How long the goal's finished tasks took. See the note in the footer. */
  const invested = useMemo(
    () =>
      mine.reduce(
        (sum, task) => sum + (task.status === 'done' ? secondsSpent(task) ?? 0 : 0),
        0,
      ),
    [mine],
  );

  const started = goal.start_date || goal.created_at;
  const span = time(goal.deadline) - time(started);
  const longTerm = span > LONG_TERM_DAYS * DAY;
  const priority = goalWeight(goal);
  const overdue = isOverdue(goal);

  const closeLink = () => {
    setDraft('');
    setLinkAt(null);
    setPick(-1);
  };

  /**
   * Point an existing task at this goal, at the checkpoint being worked on,
   * and at the one step it is execution for.
   *
   * Two writes rather than one, because they say different things: the task
   * moves to this goal (it counts here now, and it is one task, not a copy),
   * and the step records which task that was. Either is useful without the
   * other — a task can be a checkpoint's work without being any one step's.
   */
  const link = (task: Task) => {
    const index = linkAt;
    onLinkTask(goal, task, focus?.id);
    if (focus && index !== null) onMilestoneSteps(focus, linkStep(focus.steps, index, task.id));
    closeLink();
  };

  /**
   * Write the step being named — a new row at the end, or one of the prompts
   * filled in. Blank abandons rather than adding an empty row, since the
   * checklist already keeps three of those.
   */
  const commitStep = () => {
    if (!stepDraft || !focus) return;
    const title = stepDraft.text.trim();
    if (!title) {
      setStepDraft(null);
      return;
    }
    const list = stepDraft.index >= 0 ? focus.steps : addStep(focus.steps);
    const at = stepDraft.index >= 0 ? stepDraft.index : list.length - 1;
    onMilestoneSteps(focus, editStep(list, at, title));
    setStepDraft(null);
  };

  return (
    <article className={`ag-card tone-${category.tone}`}>
      {/* ---- header --------------------------------------------------- */}
      <header className="ag-top">
        <GoalTile goal={goal} size={22} />

        <div className="ag-top-text">
          <div className="ag-title-row">
            <h3 title={goal.title}>{goal.title}</h3>
            {priority >= HIGH_PRIORITY && <span className="ag-badge">Main goal</span>}
          </div>
          {(goal.why || goal.description) && (
            <p className="ag-why">{goal.why || goal.description}</p>
          )}
          <ul className="ag-tags">
            <li>{longTerm ? 'Long term' : 'Short term'}</li>
            <li className={priority >= HIGH_PRIORITY ? 'is-hot' : ''}>
              {priority >= HIGH_PRIORITY ? 'High' : priority >= 4 ? 'Medium' : 'Low'} Priority
            </li>
            {overdue && <li className="is-late">Overdue</li>}
          </ul>
        </div>

        <div className="ag-top-right">
          <div className="ag-progress">
            <strong>{pct(shownProgress)}%</strong>
            <span>Progress</span>
          </div>
          <Ring percent={numbers.progress} tone={category.tone} />
          <div className="ag-menu-wrap">
            <button
              type="button"
              className="ag-kebab"
              aria-label={`Actions for ${goal.title}`}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="1.7" />
                <circle cx="12" cy="12" r="1.7" />
                <circle cx="12" cy="19" r="1.7" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  className="ag-menu-veil"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="ag-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpen(goal); }}>
                    Open
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit(goal); }}>
                    Edit
                  </button>
                  {/* The one place the ladder can be drafted on a goal that
                      already has one.
 
                      Everywhere else this is offered, it is offered because
                      there is nothing there — the empty panel, the empty
                      drawer list. That is the right default and it had one
                      consequence nobody looked for: on an account where every
                      goal already has its checkpoints, the feature does not
                      appear anywhere at all, and a reader who wants to redo a
                      ladder they no longer like has no way to ask. A menu is
                      where a per-goal action belongs, it is on every card
                      whatever state the goal is in, and it is behind a click
                      rather than in the reader's face.

                      `onSuggest` writes nothing on its own; the page confirms
                      before replacing a ladder that exists. See
                      `redraftStones` in pages/Goals. */}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={drafting}
                    onClick={() => { setMenuOpen(false); onRedraftStones(goal); }}
                  >
                    <span className="ag-menu-mark" aria-hidden="true"><Spark /></span>
                    {stones.length ? 'Redraft checkpoints' : 'Suggest checkpoints'}
                  </button>
                  <button type="button" role="menuitem" className="is-bad" onClick={() => { setMenuOpen(false); onDelete(goal); }}>
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ---- the question ---------------------------------------------- */}
      {/* Above the body, full width, because it is the one thing on the card
          that wants an answer. The goal stays in the active list until it has
          one. Yes is the big button: by the time this shows, the work is done
          and the reader is only being asked to say so. */}
      {asking && (
        <section className="ag-verify" role="group" aria-labelledby={`ag-verify-${goal.id}`}>
          <div className="ag-verify-text">
            <strong id={`ag-verify-${goal.id}`}>
              {notYet ? "What's left?" : 'You reached it. Is this goal done?'}
            </strong>
            <span>
              {notYet
                ? stones.length > 0
                  ? 'Add what still needs doing as a checkpoint, or reopen the last one. Either puts the goal back under 100%.'
                  : 'Raise the target. The goal goes back under 100% and keeps counting.'
                : stones.length > 0
                  ? 'Every checkpoint is ticked. Say yes and it moves to Finished goals, with a record of what it took.'
                  : 'You hit the target. Say yes and it moves to Finished goals, with a record of what it took.'}
            </span>
          </div>
          {notYet ? (
            <div className="ag-verify-do ag-verify-left">
              {stones.length > 0 && onAddMilestone && (
                <form
                  className="ag-verify-add"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const title = leftover.trim();
                    if (!title) return;
                    onAddMilestone(goal, title);
                    setLeftover('');
                    setNotYet(false);
                  }}
                >
                  <input
                    value={leftover}
                    autoFocus
                    aria-label="What's left, as a checkpoint"
                    placeholder="What's still left to do"
                    onChange={(event) => setLeftover(event.target.value)}
                  />
                  <button type="submit" className="ag-verify-yes" disabled={!leftover.trim()}>
                    Add checkpoint
                  </button>
                </form>
              )}
              {stones.length > 0 ? (
                <button
                  type="button"
                  className="ag-verify-no"
                  onClick={() => {
                    setNotYet(false);
                    onVerify(goal, false);
                  }}
                >
                  Reopen the last checkpoint
                </button>
              ) : onRaiseTarget ? (
                <form
                  className="ag-verify-add"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const target = Number(raised);
                    if (!(target > numbers.current)) return;
                    onRaiseTarget(goal, target);
                    setRaised('');
                    setNotYet(false);
                  }}
                >
                  <input
                    type="number"
                    inputMode="decimal"
                    value={raised}
                    autoFocus
                    min={numbers.current}
                    aria-label="New target"
                    placeholder={`New target, above ${numbers.current.toLocaleString()}${numbers.label ? ` ${numbers.label}` : ''}`}
                    onChange={(event) => setRaised(event.target.value)}
                  />
                  <button
                    type="submit"
                    className="ag-verify-yes"
                    disabled={!(Number(raised) > numbers.current)}
                  >
                    Raise the target
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="ag-verify-yes"
                  onClick={() => {
                    setNotYet(false);
                    onEdit(goal);
                  }}
                >
                  Raise the target
                </button>
              )}
              <button type="button" className="ag-verify-back" onClick={() => setNotYet(false)}>
                Back
              </button>
            </div>
          ) : (
            <div className="ag-verify-do">
              <button
                type="button"
                className="ag-verify-yes"
                disabled={busy}
                onClick={() => onVerify(goal, true)}
              >
                Yes, it&apos;s done
              </button>
              <button
                type="button"
                className="ag-verify-no"
                disabled={busy}
                onClick={() => setNotYet(true)}
              >
                Not yet
              </button>
            </div>
          )}
        </section>
      )}

      {/* ---- body ------------------------------------------------------ */}
      <div className="ag-body">
        <section className="ag-panel">
          <header className="ag-panel-head">
            <h4>Current checkpoint</h4>
            <HealthChip health={health} />
          </header>

          {explain && <p className={`ag-why-here is-${health.state}`}>{health.reason}</p>}

          {focus ? (
            <>
              {/* The whole block is the control that changes which checkpoint
                  this is. It used to be a plain div showing whichever one the
                  card had guessed at — the first unfinished one — with no way
                  to say it had guessed wrong. */}
              <button
                type="button"
                className="ag-focus is-pickable"
                disabled={busy || switchable.length < 2}
                aria-expanded={picking}
                title={
                  switchable.length < 2
                    ? 'The only checkpoint left'
                    : 'Change which checkpoint this goal is on'
                }
                onClick={() => setPicking((on) => !on)}
              >
                <span className="ag-focus-ico" aria-hidden="true">
                  <GoalTile goal={goal} size={16} />
                </span>
                <div className="ag-focus-text">
                  <strong>{focus.title}</strong>
                  {/* The count moved up here from the checklist's own header.
                      It is the second thing anybody wants after the name —
                      how far into this one am I — and it was a grey "3 of 5"
                      two headings further down, under the title of a list you
                      had to read to work out the same thing.

                      What it replaced was `focus.note || health.reason`, and
                      the fallback half of that was the reason already printed
                      on the chip two lines above. The note is kept where it
                      exists, because that is the reader's own sentence. */}
                  <span>
                    {focusSteps.total > 0
                      ? `${focusSteps.done} / ${focusSteps.total} steps`
                      : 'No steps yet'}
                    {focus.note ? ` · ${focus.note}` : ''}
                  </span>
                </div>
                <span className="ag-focus-when">
                  {monthYear(focus.target_date)}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </span>
              </button>

              {picking && (
                <ul className="ag-focus-pick">
                  {switchable.map((stone) => (
                    <li key={stone.id}>
                      <button
                        type="button"
                        className={stone.id === focus.id ? 'is-current' : undefined}
                        disabled={busy}
                        onClick={() => {
                          if (stone.id !== focus.id) onFocusMilestone(stone);
                          setPicking(false);
                        }}
                      >
                        <span>{stone.title}</span>
                        {stone.id === focus.id && <em>current</em>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* ---- the checklist ------------------------------------------
                  Three at a time, numbered, in the shape the skill-tree panel
                  uses for a programme — because it is the same object: a short
                  ordered list of the work that finishes one thing. The window
                  sits on the first undone row rather than always at the top,
                  so a checkpoint half done opens on what is left. */}
              <header className="ag-panel-head ag-panel-head-tight">
                <h4>Checklist</h4>
              </header>

              {/* `start` numbers a native marker; this list draws its own
                  from a counter, so the window's offset goes in as a custom
                  property. Both are set: the attribute keeps the list correct
                  for anything reading the DOM rather than the stylesheet. */}
              <ol
                className="ag-steps"
                start={shown.from + 1}
                style={{ ['--ag-step-from' as string]: shown.from + 1 }}
              >
                {shown.steps.map((step, at) => {
                  const index = shown.from + at;
                  const linked = step.task_id
                    ? tasks.find((task) => task.id === step.task_id) ?? null
                    : null;
                  return (
                    <li
                      className={
                        `ag-step${step.done ? ' is-done' : ''}`
                        + `${step.placeholder ? ' is-empty' : ''}`
                        + `${ticked === step.id ? ' is-just-done' : ''}`
                      }
                      key={step.id}
                    >
                      <button
                        type="button"
                        className="ag-check ag-step-check"
                        disabled={busy || step.placeholder}
                        aria-label={
                          step.placeholder
                            ? 'Name this step before you can tick it'
                            : step.done
                              ? `Undo ${step.title}`
                              : `Finish ${step.title}`
                        }
                        onClick={() => {
                          onMilestoneSteps(focus, toggleStep(focus.steps, index));
                          // Only on the way to done. Unticking is a
                          // correction, and a correction should not be
                          // congratulated.
                          if (!step.done) setTicked(step.id);
                          // A step pointing at a task and being ticked here
                          // means that task is done — finishing it twice, once
                          // on each page, is the app asking the same question
                          // in two places. Only on the way to done: unticking a
                          // step is not a claim that the task was never done.
                          if (linked && !step.done && linked.status !== 'done') onComplete(linked);
                        }}
                      >
                        {/* The tick is a drawn stroke rather than a filled
                            box. It was a bare <span>, which is to say the
                            checkbox had no mark in it at all: a finished step
                            was a green square, and the one gesture this panel
                            exists for had nothing to show for itself. The path
                            is dashed out and drawn in by `ag-tick-draw`. */}
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <path d="M3.6 8.4l3 3 5.8-6.4" />
                        </svg>
                      </button>

                      {step.placeholder ? (
                        <button
                          type="button"
                          className="ag-step-name is-empty"
                          disabled={busy}
                          onClick={() => setStepDraft({ index, text: '' })}
                          title="Name this step"
                        >
                          {promptFor(index)}
                        </button>
                      ) : (
                        <span className="ag-step-name" title={step.title}>
                          {step.title}
                          {linked && <span className="ag-step-linked" title={linked.title}>· {linked.title}</span>}
                        </span>
                      )}

                      {/* The date it is held to, wherever that is coming
                          from — its own where it has one, the linked task's
                          where it does not. Read-only here: naming and dating
                          are both planning, and the drawer is where planning
                          happens. See `stepDue`. */}
                      {(() => {
                        const when = stepDue(step, linked?.due_date);
                        if (!when) return <span className="ag-step-due" />;
                        const at = time(when);
                        return (
                          <span
                            /* A finished step is never late, whenever it was
                               due. Amber on a done row tells the reader to go
                               and do something they have already done. */
                            className={`ag-step-due${!step.done && at && at < todayStart ? ' is-late' : ''}`}
                            title={step.task_id ? `From "${linked?.title ?? 'the linked task'}"` : 'Due date for this step'}
                          >
                            {shortDate(when)}
                          </span>
                        );
                      })()}

                      {/* One task per step. The button is the link and the
                          unlink both, because a step already pointing at
                          something has exactly one useful thing to do next. */}
                      <button
                        type="button"
                        className={`ag-step-link${step.task_id ? ' is-on' : ''}`}
                        disabled={busy || step.placeholder}
                        aria-label={
                          step.task_id ? `Unlink ${linked?.title ?? 'the task'}` : 'Link a task to this step'
                        }
                        title={
                          step.task_id
                            ? `Linked to "${linked?.title ?? 'a task'}". Click to unlink.`
                            : 'Link an existing task to this step'
                        }
                        onClick={() => {
                          if (step.task_id) {
                            onMilestoneSteps(focus, linkStep(focus.steps, index, null));
                            return;
                          }
                          setLinkAt(linkAt === index ? null : index);
                          setDraft('');
                          setPick(-1);
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                          <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
                          <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ol>

              {focus.steps.length > shown.steps.length && (
                <p className="ag-steps-rest ag-quiet">
                  {focus.steps.length - shown.steps.length} more.{' '}
                  <button type="button" className="ag-link-btn" onClick={() => onOpen(goal)}>
                    Open the details
                  </button>
                </p>
              )}

              {/* The line the card is for. Everything above it describes: the
                  chart says why this goal is going the way it is, the
                  checkpoint says where in the plan you are, and this says what
                  to do — which is the only one of the three that can be acted
                  on without reading the other two.

                  Not drawn when the checkpoint is finished: `readyToClose`
                  puts its own button in this space, and "next" over a
                  checkpoint with nothing left in it would be pointing at the
                  work that is already done. */}
              {nextStep && !readyToClose && (
                <p className="ag-next">
                  <span>Next</span>
                  <strong title={nextStep.title}>{nextStep.title}</strong>
                </p>
              )}

              {/* ---- naming a step ------------------------------------------- */}
              {stepDraft ? (
                <form
                  className="ag-add"
                  onSubmit={(event) => {
                    event.preventDefault();
                    commitStep();
                  }}
                >
                  <input
                    autoFocus
                    value={stepDraft.text}
                    maxLength={120}
                    placeholder="Name a small step"
                    onChange={(event) => setStepDraft({ ...stepDraft, text: event.target.value })}
                    onBlur={commitStep}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setStepDraft(null);
                      } else if (event.key === 'Enter') {
                        // Explicit rather than leaning on the form's implicit
                        // submission: this input is the form's only control
                        // and there is no submit button, which is exactly the
                        // shape browsers do not reliably submit.
                        event.preventDefault();
                        commitStep();
                      }
                    }}
                  />
                </form>
              ) : (
                /* The two ways to fill a checklist, side by side, and in this
                   order on purpose: on a checkpoint with nothing written the
                   model is the faster of the two and goes first, and on one
                   already being worked it is not offered at all and this row
                   is the single button it has always been.

                   `focusSteps.total` counts *named* steps, so the three grey
                   prompts a new checkpoint is seeded with read as empty —
                   which is what they are. See `stepProgress`. */
                <div className="ag-step-tools">
                  {focusSteps.total === 0 && (
                    <AskModel
                      label="Suggest steps"
                      busy={drafting}
                      onAsk={() => onSuggestSteps(focus)}
                    />
                  )}
                  <button
                    type="button"
                    className="ag-add-btn"
                    disabled={busy || focus.steps.length >= MAX_STEPS}
                    title={
                      focus.steps.length >= MAX_STEPS
                        ? `More than ${MAX_STEPS} steps? Split it into two checkpoints.`
                        : undefined
                    }
                    onClick={() => setStepDraft({ index: -1, text: '' })}
                  >
                    + Add another step
                  </button>
                </div>
              )}

              {/* ---- linking a task to one step ------------------------------ */}
              {linkAt !== null && (
                <div className="ag-link-box">
                  <input
                    autoFocus
                    value={draft}
                    placeholder="Search your tasks"
                    role="combobox"
                    aria-expanded={matches.length > 0}
                    aria-autocomplete="list"
                    aria-controls={`ag-found-${goal.id}`}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setPick(-1);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        closeLink();
                      } else if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        setPick((at) => Math.min(at + 1, matches.length - 1));
                      } else if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        setPick((at) => Math.max(at - 1, -1));
                      } else if (event.key === 'Enter') {
                        event.preventDefault();
                        const chosen = pick >= 0 ? matches[pick] : matches[0];
                        if (chosen) link(chosen);
                      }
                    }}
                  />
                  {matches.length > 0 ? (
                    <ul className="ag-found" id={`ag-found-${goal.id}`} role="listbox">
                      {matches.map((task, at) => (
                        <li key={task.id}>
                          <button
                            type="button"
                            id={`ag-found-${goal.id}-${task.id}`}
                            role="option"
                            aria-selected={at === pick}
                            className={`ag-found-row${at === pick ? ' is-on' : ''}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setPick(at)}
                            onClick={() => link(task)}
                          >
                            <span className="ag-found-name" title={task.title}>
                              {task.title}
                            </span>
                            <span className="ag-quiet">{shortDate(task.due_date)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="ag-quiet ag-found-none">
                      No matching open tasks. That's fine. Steps don't need one.
                    </p>
                  )}
                </div>
              )}

              {/* ---- the checkpoint is clear --------------------------------- */}
              {readyToClose && (
                <button
                  type="button"
                  className="ag-finish"
                  disabled={busy}
                  onClick={() => {
                    setCheer('milestone');
                    onMilestoneStatus(focus, 'done');
                  }}
                >
                  Mark checkpoint reached
                </button>
              )}
            </>
          ) : stones.length === 0 ? (
            /* A goal with no checkpoints, and the offer to draft them.
 
               It used to be one sentence pointing at the other panel — "the
               panel on the left is where they start" — and on most goals that
               was a pointer at nothing. The left panel only shows the button
               when it has no chart to draw, so a number goal with two weeks
               of work behind it got a chart there and this instruction here,
               and the thing it named did not exist on the card. */
            <>
              <p className="ag-empty">
                No checkpoints yet. Add some to track progress.
              </p>
              {/* The offer, unless the panel opposite is already making it.
 
                  A goal with no checkpoints *and* no chart is empty on both
                  sides, and both empty states want to say the same thing — so
                  without this the reader gets two identical buttons a hand's
                  width apart, which reads as two different actions and is
                  one. The left panel keeps it in that case: it is the emptier
                  of the two and the one with room for the sentence. */}
              {visual && (
                <div className="ag-empty-tools">
                  <AskModel label="Suggest checkpoints" busy={drafting} onAsk={askStones} primary />
                  <button type="button" className="ag-more" onClick={() => onOpen(goal)}>
                    Add them myself
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="ag-empty">
              Every checkpoint is done. Now finish the goal itself.
            </p>
          )}

          {/* The model's offers, on the card and not only behind the ⋯ menu.

              The menu item stays — it is the right home for "redraft this
              ladder" on a goal in good order, and it is where a per-goal
              action belongs. What it could not do is be *found*: a reader who
              has never opened that menu has no way to learn the app will fill
              in the checklists they have not written. The compact row says so
              on the card, and it disappears on a goal with a complete plan
              rather than nagging. See ./SmartPlan. */}
          {/* The model's offer and the goal's dates share the panel's last
              row: what the plan could do next on the left, the facts about
              the goal on the right. */}
          <div className="ag-panel-foot ag-panel-foot-split">
            <SmartPlan
              goal={goal}
              busy={drafting}
              onRedraftStones={onRedraftStones}
              onFillSteps={onFillSteps}
              compact
            />
            <dl className="ag-facts">
              <div>
                <dt>Start date</dt>
                <dd>{formatGoalDate(started) || 'Not set'}</dd>
              </div>
              <div>
                <dt>Target date</dt>
                <dd className={overdue ? 'is-late' : undefined}>{formatGoalDate(goal.deadline) || 'No date'}</dd>
              </div>
              {/* Named for what it is (2026-11-08). It was "Time invested",
                  which read as tracked focus time, and Summit has had no focus
                  timer since 2026-10-31. It is the time this goal's own
                  tasks took: the calendar block a task was placed in, or the
                  gap from starting to ticking it off when that was one
                  sitting (utils/timeSpent). Tasks with neither are left out
                  rather than guessed. */}
              <div title="How long this goal's tasks took, from their calendar blocks and finish times. Untimed tasks are left out.">
                <dt>Time on its tasks</dt>
                <dd>{invested > 0 ? hoursMinutes(invested) : 'Not timed yet'}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>
                  <span className="ag-dot" aria-hidden="true" />
                  {category.label}
                </dd>
              </div>
            </dl>
          </div>
        </section>
        {/* The chart, folded under the checkpoint (2026-11-08).

            It used to sit beside the checklist, half the card each, and a
            chart next to a nested checklist next to a task linker is three
            things asking to be looked at first. What to do now is the reason
            to open the card, so it takes the full width; the chart is one
            click away and remembers being opened. A goal with nothing to
            chart keeps its empty panel open, because that panel is an offer
            to plan the goal, not a chart. */}
        {visual ? (
          <section className={`ag-panel ag-panel-chart${chartOpen ? ' is-open' : ''}`}>
            <div className="ag-chart-bar">
              <button
                type="button"
                className="ag-chart-toggle"
                aria-expanded={chartOpen}
                aria-controls={`ag-chart-${goal.id}`}
                onClick={() => setChartOpen(!chartOpen)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
                {chartOpen ? 'Hide chart' : 'Show chart'}
              </button>
              <button type="button" className="ag-details" onClick={() => onOpen(goal)}>
                Details
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
            {chartOpen && (
              <div id={`ag-chart-${goal.id}`}>
                <GoalVisual
                  goal={goal}
                  context={context}
                  pick={visual}
                  nameOf={nameOf}
                  onOpen={() => onOpen(goal)}
                  onChart={onChart && ((chart) => onChart(goal, chart))}
                />
              </div>
            )}
          </section>
        ) : (
          <section className="ag-panel ag-panel-chart is-open">
            {/* Nothing fits, which on this page means one thing: no
                checkpoints and no work recorded against the goal. There is
                no chart to draw and pretending otherwise would be the one
                dishonest panel here, so the space asks for the thing that
                would fill it. */}
            <header className="ag-panel-head">
              <h4>Nothing to chart yet</h4>
              {onChart && <ChartMenu goal={goal} onChart={(chart) => onChart(goal, chart)} />}
            </header>
            <p className="ag-empty">
              Add checkpoints so the percentage means something.
            </p>
            <div className="ag-empty-tools">
              <AskModel label="Suggest checkpoints" busy={drafting} onAsk={askStones} primary />
              <button type="button" className="ag-more" onClick={() => onOpen(goal)}>
                Add them myself
              </button>
            </div>
          </section>
        )}
      </div>

      {cheer && (
        <div className="ag-cheer" role="status">
          <div className="ag-cheer-card">
            <span className="ag-cheer-mark" aria-hidden="true">✓</span>
            <strong>Checkpoint reached</strong>
            <span>On to the next one.</span>
          </div>
          {/* Twelve pieces, placed by nth-child in the stylesheet rather than
              by script — the burst is decoration and does not need a random
              seed to read as one. Hidden outright under reduced motion. */}
          <span className="ag-cheer-burst" aria-hidden="true">
            {Array.from({ length: 12 }, (_, at) => (
              <i key={at} />
            ))}
          </span>
        </div>
      )}

    </article>
  );
}

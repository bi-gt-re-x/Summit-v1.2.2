/**
 * The goals the app keeps for you — XP, streak, tasks, focus.
 *
 * The distinction this whole tab rests on is *who moves the number*. An outcome
 * goal is a thing the reader is doing, and the percentage follows checkpoints
 * they tick. These four are counters the app maintains: the target is chosen
 * once and the figure is never touched again, because touching it would be the
 * account editing its own record of what it did.
 *
 * That is why a system goal has no progress control and no checkpoints, and why
 * its only two actions are the ones that genuinely belong to the reader —
 * changing the target and dropping the goal.
 *
 * ## The card, and the objection it has to answer
 *
 * These were cards once, then rows, then a strip of figures, and each change
 * was a correction of the last. The strip's argument was that a title, a bar
 * and two buttons is *the shape of an outcome goal*, so four counters wearing
 * it went on looking like four more goals with a different icon — and nobody is
 * doing these.
 *
 * They are cards again, on the same shell as the Active tab (`ag-card`), because
 * one page that draws a goal two unrelated ways is harder to read than one that
 * draws them the same way and says where they differ. The old objection is
 * answered rather than ignored, and it is answered in the card:
 *
 *   - the badge says **System goal**, and the line under the title says the app
 *     keeps the count. That is the distinction, stated where the title is,
 *     rather than implied by a layout the reader has to have seen before.
 *   - there is no checkpoint panel and nothing that looks like one. The right
 *     panel says what moves the figure and what is left of it — which is the
 *     honest answer to "what do I do next" for a number you do not touch.
 *   - the figure stays the largest thing on the card, which is what the strip
 *     was protecting.
 *
 * What is lost is the shared baseline: four columns put their figures on one
 * line and cards do not. That was the strip's real gain and it is a real loss.
 * It is spent on the thing the reader asked for, which is one goal page rather
 * than two, and the four percentages still read down the right-hand edge.
 *
 * ## What is still not invented
 *
 * No checkpoints, no progress control, no "next step", and no pace or health
 * chip. Every one of those is a claim about work somebody is doing, and the
 * whole point of this tab is that nobody is doing these.
 *
 * New ones are made by SystemGoalWizard, not by the outcome wizard — see the
 * note there for what went wrong when they were.
 */
import { Ring } from './Outcome';
import { fmtGoalNumber, formatGoalDate, goalNumbers } from './numbers';
import type { Goal, GoalType } from '@/types';
import type { ReactNode } from 'react';

/**
 * What each counter is called.
 *
 * This used to head the column in place of `goal.title`, because "Earn 50,000
 * XP" repeats the target printed under it and buries the one word — XP — that
 * says which of the four it is. A card heads itself with the reader's own
 * title, so the word appears twice over instead: as a tag beside the term, and
 * in the footer under "Counter".
 */
const METRIC: Record<GoalType, string> = {
  xp: 'XP',
  streak: 'Streak',
  tasks: 'Tasks',
  focus: 'Focus',
};

/** One glyph per counter, so the four are told apart before they are read. */
export const COUNTER_ICON: Record<GoalType, ReactNode> = {
  xp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    </svg>
  ),
  streak: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-1.5.7-2.8 1.7-4C9.5 9.5 11 7 12 3z" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M4 12h16M4 17h9" />
      <path d="m15.5 17.5 1.5 1.5 3-3" />
    </svg>
  ),
  focus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  ),
};

const pct = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

/**
 * The counter's colour, by name.
 *
 * `Ring` takes a tone name and sets `--tone` on itself from it, so the card's
 * own variable does not reach it — the two are kept in step here rather than by
 * inheritance. The same four colours are in goals.css on `.gx-sys-card`.
 */
const TONE: Record<GoalType, string> = {
  xp: 'violet',
  streak: 'amber',
  tasks: 'blue',
  focus: 'teal',
};

/**
 * What actually advances each counter.
 *
 * The right-hand panel of an outcome card answers "what am I on now, and what
 * do I do next". A counter has no checkpoint to name, and the truthful answer
 * to the same question is what makes the figure move — which is a fact about
 * the app rather than a plan the reader wrote, so it is stated here once.
 */
const MOVED_BY: Record<GoalType, string> = {
  xp: 'Every task you finish adds its XP to this total.',
  streak: 'One finished task on a day keeps the run alive; a day with none ends it.',
  tasks: 'Each task you mark complete counts once.',
  focus: 'Time on the focus timer is added when the session ends.',
};

/**
 * The word after the figure: "days", "tasks" — but "XP", which is not a word.
 *
 * Lowercasing the label reads right for the three that are nouns and wrong for
 * the acronym, which is how "of 50,000 xp" got onto the card.
 */
function unitOf(n: ReturnType<typeof goalNumbers>): string {
  if (!n.label || n.goalType === 'focus') return '';
  return ` ${n.goalType === 'xp' ? n.label : n.label.toLowerCase()}`;
}

/** "6,200 XP to go", or the sentence for a target already reached. */
function remaining(n: ReturnType<typeof goalNumbers>): string {
  const left = n.target - n.current;
  if (left <= 0) return 'Target reached.';
  return `${fmtGoalNumber(left, n)}${unitOf(n)} to go`;
}

function SystemMetric({
  goal,
  onEdit,
  onDelete,
}: {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
}) {
  const n = goalNumbers(goal);
  const done = pct(n.progress);
  const reached = done >= 100;
  const unit = unitOf(n);

  /* The counter's own colour, not the goal's category. Every one of these is
     filed under "other" — a counter is not about a subject — so taking the tone
     from the category would paint all four the same grey and throw away the one
     thing the colour could say, which is which of the four this is. */
  return (
    <li>
      <article className={`ag-card gx-sys-card is-${n.goalType}${reached ? ' is-done' : ''}`}>
        {/* ---- header ------------------------------------------------------
            The same three columns as an outcome card. The tile carries the
            counter's own glyph rather than the goal's category colour block:
            which of the four this is was the one thing the old title buried,
            and it is the first thing read here. */}
        <header className="ag-top">
          <i className="gx-sys-tile" aria-hidden="true">
            {COUNTER_ICON[n.goalType]}
          </i>

          <div className="ag-top-text">
            <div className="ag-title-row">
              <h3 title={goal.title}>{goal.title}</h3>
              {/* Where an outcome card names its priority. This says the thing
                  the whole tab rests on, at the top of the card rather than in
                  a lead paragraph above four of them. */}
              <span className="ag-badge">System goal</span>
            </div>
            <p className="ag-why">Summit keeps this count. You choose where it stops.</p>
            <ul className="ag-tags">
              <li>{METRIC[n.goalType]}</li>
              <li className={reached ? 'is-hot' : ''}>{reached ? 'Reached' : 'Counting'}</li>
            </ul>
          </div>

          <div className="ag-top-right">
            <div className="ag-progress">
              <strong>{done}%</strong>
              <span>Progress</span>
            </div>
            <Ring pct={done} tone={TONE[n.goalType]} />
          </div>
        </header>

        {/* ---- body -------------------------------------------------------- */}
        <div className="ag-body">
          {/* Left: where the figure stands. The same question the Active tab's
              left panel answers with a chart — this one has a single number
              behind it, so it is drawn as the figure and the distance, not as
              a chart of one bar pretending to be more. */}
          <section className="ag-panel">
            <header className="ag-panel-head">
              <h4>Distance to target</h4>
            </header>

            {/* The app's own count, and the largest thing on the card. It is
                the only figure on this page nobody can type: editing it would
                be the account rewriting its record of what it did. */}
            <b className="gx-metric-now">{fmtGoalNumber(n.current, n)}</b>
            <span className="gx-metric-of">
              of {fmtGoalNumber(n.target, n)}
              {unit}
            </span>

            <div
              className="gx-sys-track"
              role="progressbar"
              aria-label={`${goal.title}: ${done}%`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={done}
            >
              <i className={`gx-sys-fill is-${n.goalType}`} style={{ width: `${done}%` }} />
            </div>
            <span className={`gx-metric-pct${reached ? ' is-done' : ''}`}>{remaining(n)}</span>
          </section>

          {/* Right: where an outcome card puts its current checkpoint. There is
              no checkpoint to put here and nothing shaped like one is drawn —
              what fills it is the one thing a reader can act on, which is
              knowing what makes the number move. */}
          <section className="ag-panel">
            <header className="ag-panel-head">
              <h4>How this moves</h4>
            </header>
            <p className="ag-empty gx-sys-how">{MOVED_BY[n.goalType]}</p>

            {/* The two things that are actually the reader's. */}
            <div className="gx-metric-do">
              <button type="button" onClick={() => onEdit(goal)}>
                Change target
              </button>
              <button
                type="button"
                className="is-bad"
                aria-label={`Remove the ${METRIC[n.goalType]} target`}
                onClick={() => onDelete(goal)}
              >
                Remove
              </button>
            </div>
          </section>
        </div>

        {/* ---- footer ------------------------------------------------------
            Three facts rather than the outcome card's four. There is no "time
            invested" on a counter: the figure *is* what was invested, and it is
            already the largest thing on the card. */}
        <footer className="ag-foot gx-sys-foot">
          <dl className="ag-facts">
            <div>
              <dt>Set on</dt>
              <dd>{formatGoalDate(goal.start_date || goal.created_at) || '—'}</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>
                {fmtGoalNumber(n.target, n)}
                {unit}
              </dd>
            </div>
            <div>
              <dt>Counter</dt>
              <dd>
                <span className="ag-dot" aria-hidden="true" />
                {METRIC[n.goalType]}
              </dd>
            </div>
          </dl>
        </footer>
      </article>
    </li>
  );
}

export interface SystemGoalsProps {
  counters: Goal[];
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  /** Opens SystemGoalWizard. */
  onNew: () => void;
}

export function SystemGoals({ counters, onEdit, onDelete, onNew }: SystemGoalsProps) {
  if (counters.length === 0) {
    return (
      <p className="gx-empty">
        None yet. Set a target like 50,000 XP, a 30-day streak, 500 tasks or 100 hours of focus.
        <button type="button" className="gx-link" onClick={onNew}>
          Set one
        </button>
      </p>
    );
  }

  return (
    <>
      {/* Kept, though each card now carries the same distinction in its badge.
          The lead says it once for the tab; the badge says it again on a card
          read on its own, which is how most of them are read. */}
      <p className="gx-sys-lead">
        Targets for totals Summit already tracks. You set the target; the total updates
        automatically.
      </p>
      {/* One column, not a wrapping grid. The cards are full-width for the same
          reason the Active tab's are — a card this tall beside another is two
          columns of small text — and stacking them keeps the four percentages
          on one vertical line, which is the last of the strip's comparison that
          survives the change. */}
      <ul className="gx-sys-cards" aria-label="System goals">
        {counters.map((goal) => (
          <SystemMetric key={goal.id} goal={goal} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </ul>
      <button type="button" className="gx-sys-add" onClick={onNew}>
        <span aria-hidden="true">+</span> Add a system goal
      </button>
    </>
  );
}

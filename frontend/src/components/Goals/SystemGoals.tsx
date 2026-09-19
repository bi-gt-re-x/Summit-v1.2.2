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
 * ## A strip of figures, not a list of goals
 *
 * This was a list of rows, and the list was itself a correction: before that
 * it was cards, scattered across a wrapping grid where the second card's bar
 * was nowhere near the first's, so four targets could not be read as a
 * comparison. The list fixed the alignment and kept the problem underneath —
 * a row with a title, a bar and two buttons is the shape of an outcome goal,
 * so the four counters went on looking like four more goals with a different
 * icon.
 *
 * They are not. Nobody is doing these: the app counts, and the only decision
 * in them is the number to stop at. So they are drawn as what they are — a
 * metric each, headed by the thing being counted rather than by a title
 * somebody wrote, with the figure the largest thing on it.
 *
 * The old objection to a grid does not apply to this one. It was about cards
 * of different heights wrapping out of alignment; every column here has the
 * same parts in the same order, so the four figures share a baseline and the
 * four bars share a line, which is the comparison the list was protecting.
 *
 * New ones are made by SystemGoalWizard, not by the outcome wizard — see the
 * note there for what went wrong when they were.
 */
import { fmtGoalNumber, goalNumbers } from './numbers';
import type { Goal, GoalType } from '@/types';
import type { ReactNode } from 'react';

/**
 * What each counter is called, as a column head.
 *
 * The metric rather than `goal.title`: a system goal's title is "Earn 50,000
 * XP", which repeats the target printed directly underneath it and buries the
 * one word — XP — that says which of the four this is. The title is kept on
 * the column as its tooltip, because the reader may have written their own.
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

  return (
    <li className={`gx-metric${reached ? ' is-done' : ''}`} title={goal.title}>
      <span className="gx-metric-head">
        <i className={`gx-metric-ico is-${n.goalType}`} aria-hidden="true">
          {COUNTER_ICON[n.goalType]}
        </i>
        {METRIC[n.goalType]}
      </span>

      {/* The app's own count, and the largest thing on the column. It is the
          only figure on this page nobody can type: editing it would be the
          account rewriting its record of what it did. */}
      <b className="gx-metric-now">{fmtGoalNumber(n.current, n)}</b>
      <span className="gx-metric-of">
        of {fmtGoalNumber(n.target, n)}
        {n.label && n.goalType !== 'focus' ? ` ${n.label.toLowerCase()}` : ''}
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
      <span className={`gx-metric-pct${reached ? ' is-done' : ''}`}>{done}%</span>

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
      {/* Said outright, because the difference is the whole reason this tab
          exists and nothing on the screen used to state it. An outcome goal is
          work somebody is doing and its percentage follows checkpoints they
          tick; these four are counts the app keeps, and the reader's only
          decision in them is where to stop. */}
      <p className="gx-sys-lead">
        Targets for totals Summit already tracks. You set the target; the total updates
        automatically.
      </p>
      <ul className="gx-metrics" aria-label="System goals">
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

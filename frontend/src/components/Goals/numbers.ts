/**
 * How a goal's numbers are read — the port of the arithmetic in
 * goal.js.
 *
 * All of it is display logic over fields the backend already decides, kept in
 * one place because four different components need the same answers and a
 * second copy of "what counts as done" is how two parts of a page start
 * disagreeing.
 */
import { stonesProgress } from '@/utils/goalProgress';
import { GOAL_FIELDS } from '@/services/constants';
import type { Goal, GoalMeasure, GoalType } from '@/types';

/** A goal with no priority set weighs the same as a middling one. */
export const DEFAULT_GOAL_WEIGHT = 5;

export interface GoalNumbers {
  measure: GoalMeasure;
  /** The counter this goal is, for the four that are one. `xp` otherwise. */
  goalType: GoalType;
  current: number;
  target: number;
  /** The word beside the figures: "XP", "Days", "rating", "milestones". */
  label: string;
  progress: number;
  /** False for a milestone goal — there is no figure, only a count of ticks. */
  numeric: boolean;
}

/** The label the goals page shows, which is not the short unit in GOAL_FIELDS. */
const LABELS: Record<GoalType, string> = {
  xp: 'XP',
  streak: 'Days',
  tasks: 'Tasks',
  focus: 'Focus',
};

/**
 * A goal's measure, defensively.
 *
 * The API fills this in for every goal it hands over, including rows written
 * before the column existed. The fallback is here for the one case the API
 * cannot cover: a goal object assembled in the client — a draft in the
 * creation wizard, a fixture in a test — that has not been near the server.
 */
export function measureOf(goal: Goal): GoalMeasure {
  const measure = goal.measure;
  if (measure === 'number' || measure === 'milestones') return measure;
  if (measure && measure in GOAL_FIELDS) return measure;
  return goal.goal_type in GOAL_FIELDS ? goal.goal_type : 'xp';
}

/**
 * The two figures under a goal's bar, whatever kind of goal it is.
 *
 * Three shapes behind one answer: a counter reads its own pair of columns, a
 * number goal reads the figure the user maintains, and a milestone goal counts
 * its ticks. Every caller wants "current, target, and what to call them", and
 * having them each work it out from `measure` is how a card and a detail page
 * start disagreeing about the same goal.
 */
export function goalNumbers(goal: Goal): GoalNumbers {
  const measure = measureOf(goal);

  if (measure === 'milestones') {
    const rows = goal.milestones ?? [];
    const done = rows.filter((row) => row.status === 'done').length;
    // Every ticked step counts, not only every reached checkpoint: the rule
    // the server stores `progress` by, in utils/goalProgress.
    const progress = goal.status === 'completed' ? 100 : stonesProgress(rows);
    return {
      measure,
      goalType: 'xp',
      current: done,
      target: rows.length,
      label: rows.length === 1 ? 'milestone' : 'milestones',
      progress,
      numeric: false,
    };
  }

  if (measure === 'number') {
    const current = Number(goal.current_value ?? 0);
    const target = Number(goal.target_number ?? 0);
    const progress =
      goal.status === 'completed'
        ? 100
        : target > 0
          ? Math.min((current / target) * 100, 100)
          : 0;
    return {
      measure,
      goalType: 'xp',
      // An unlabelled number is still a number; the bar reads fine without a
      // unit and inventing one ("points") would be the app guessing.
      current,
      target,
      label: goal.unit || '',
      progress,
      numeric: true,
    };
  }

  const goalType = measure;
  const fields = GOAL_FIELDS[goalType];
  const current = Number(goal[fields.current as keyof Goal] ?? 0);
  const target = Number(goal[fields.target as keyof Goal] ?? 0);

  let progress = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  if (goal.status === 'completed') progress = 100;

  return {
    measure,
    goalType,
    current,
    target,
    label: LABELS[goalType],
    progress,
    numeric: true,
  };
}

/** Focus values are stored in minutes — shown as "1h 30m". */
export function fmtGoalValue(value: number, goalType: GoalType): string {
  if (goalType !== 'focus') return String(value);
  const total = Math.round(value);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** The figure on a goal card, formatted for whichever kind of goal it is. */
export function fmtGoalNumber(value: number, numbers: GoalNumbers): string {
  if (numbers.measure === 'focus') return fmtGoalValue(value, 'focus');
  const rounded = Math.round(value * 10) / 10;
  return rounded.toLocaleString();
}

export function goalWeight(goal: Goal): number {
  const p = Math.trunc(Number(goal.priority));
  if (!p || p < 1) return DEFAULT_GOAL_WEIGHT;
  return Math.min(10, p);
}

/**
 * 0-100. A completed goal is 100 whatever its stored numbers say — it is
 * finished, and a rounding artefact should not leave it at 99.
 */
export function goalProgressPct(goal: Goal): number {
  if (goal.status === 'completed') return 100;
  return Math.max(0, Math.min(100, goalNumbers(goal).progress || 0));
}

/** An active goal whose deadline has passed. */
export function isOverdue(goal: Goal, now: number = Date.now()): boolean {
  if (!goal.deadline || goal.status !== 'active') return false;
  const at = new Date(goal.deadline).getTime();
  return !Number.isNaN(at) && at < now;
}

/**
 * When the next active deadline passes, in ms from now, or null if none will.
 *
 * The original set one `setTimeout` per goal and had to guard each against the
 * 32-bit overflow — a delay over ~24.8 days wraps and fires immediately, which
 * was flagging far-future deadlines as overdue the moment the page loaded. One
 * timer for the soonest deadline has the same effect with one place to clamp;
 * the caller re-arms after each firing.
 */
export const MAX_TIMEOUT = 0x7fffffff;

export function msUntilNextDeadline(goals: Goal[], now: number = Date.now()): number | null {
  const upcoming = goals
    .filter((g) => g.deadline && g.status === 'active')
    .map((g) => new Date(g.deadline).getTime())
    .filter((t) => !Number.isNaN(t) && t > now);
  if (!upcoming.length) return null;
  return Math.min(Math.min(...upcoming) - now, MAX_TIMEOUT);
}

/**
 * A goal date as a local `Date`, or null.
 *
 * The whole of this function is the first branch. A deadline and a checkpoint's
 * target date are stored as a bare `YYYY-MM-DD`, and `new Date('2024-01-01')`
 * parses that as *UTC midnight* — which is the 31st of December anywhere west
 * of Greenwich. Every goal date on the page was printing a day early for most
 * of the world, and for the account this was found on, a goal starting on the
 * 1st of January read "Dec 31, 2023".
 *
 * Built from the parts instead, which is what the goals calendar and the
 * records page already do for the same reason. A full timestamp —
 * `completed_at` is one — is left to the parser, because a timestamp carries
 * its own offset and there is nothing to guess.
 */
export function goalDate(value: string | undefined): Date | null {
  if (!value) return null;
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (bare) {
    return new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The date under a goal, in the format the original printed. */
export function formatGoalDate(value: string): string {
  if (!value) return '';
  const d = goalDate(value);
  if (!d) return value;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

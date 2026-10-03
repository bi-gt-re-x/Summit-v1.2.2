/**
 * Goal health — is this actually going to happen?
 *
 * Decided on the server (backend/tracking/goal_health.py) and attached to every
 * goal `/api/get_goals` returns, as `goal.health`. This file reads it, and
 * keeps the arithmetic that is about *drawing* a goal rather than judging it:
 * which tasks count as its evidence, and the pace projection.
 *
 * It used to compute the judgement here, once per screen that showed a goal —
 * the Goals page, the analytics page, the goal drawer, the subject page — which
 * is five chances to disagree about one goal. Now there is one answer.
 *
 *   on-track     nothing says otherwise
 *   behind       past its date, more than ten points behind the calendar, or
 *                linked work quiet for a fortnight
 *   not-started  nothing recorded against it yet — not a failure
 */
import { goalNumbers } from '@/components/Goals/numbers';
import type { Goal, Task } from '@/types';
import { countsToward } from '@/utils/goalLinks';
import type { GoalHealth, HealthState } from '@/types';
import { isoDate } from '@/utils/dates';

export type { GoalHealth, HealthSignals, HealthState } from '@/types';

const LABELS: Record<HealthState, string> = {
  'on-track': 'On Track',
  behind: 'Behind',
  'not-started': 'Not Started',
};

const DAY = 86_400_000;

/**
 * What a goal the server has not read yet says about itself.
 *
 * A goal made on this page a moment ago, before the list is fetched again,
 * has no reading. It is drawn as not started — which is true of a goal that
 * has existed for a second — rather than given a judgement nobody made.
 */
const UNREAD: GoalHealth = {
  state: 'not-started',
  label: LABELS['not-started'],
  reason: 'Nothing recorded against this yet.',
  signals: {
    progress: 0,
    expected: null,
    ahead: null,
    daysLeft: null,
    daysTotal: null,
    daysSinceWork: null,
    recentTasks: 0,
    checkpoints: null,
  },
};

/** The server's reading of this goal. See the note at the top. */
export function goalHealth(goal: Goal): GoalHealth {
  return goal.health ?? UNREAD;
}

/**
 * Local midnight of a day key, remembered.
 *
 * Every goal reading parses the completion date of every task it looks at, and
 * a counter goal looks at *all* of them — so on a large account this was
 * tens of thousands of `new Date(string)` calls per goal, per reading, for a
 * few thousand distinct days. The answer for a given day never changes, so it
 * is parsed once. Capped so a pathological caller cannot grow it without end;
 * clearing it costs only the next few parses.
 */
const midnights = new Map<string, number | null>();
const MIDNIGHTS_MAX = 20_000;

export function atMidnight(value: string): number | null {
  if (!value) return null;
  const key = String(value).slice(0, 10);
  const known = midnights.get(key);
  if (known !== undefined) return known;
  const time = new Date(`${key}T00:00:00`).getTime();
  const result = Number.isNaN(time) ? null : time;
  if (midnights.size >= MIDNIGHTS_MAX) midnights.clear();
  midnights.set(key, result);
  return result;
}

/**
 * The tasks that count toward this goal: linked to it by hand, or matched to it
 * from their title when they were written. See utils/goalLinks.
 */
export function tasksFor(goal: Goal, tasks: Task[]): Task[] {
  return tasks.filter((task) => countsToward(task, goal.id));
}

/**
 * The work that counts as evidence this goal is being pursued.
 *
 * Not the same as the tasks linked to it, and the difference matters. The four
 * counter goals are fed by the app from *every* completed task — an XP goal
 * advances on any task at all, and a streak or focus goal advances on the
 * account simply being used — so judging one by its links would mark a goal
 * that is visibly filling up as abandoned, because nobody ever linked anything
 * to a goal that does not need it.
 *
 * An outcome goal is the opposite case. Nothing feeds it automatically, so the
 * only thing that says work is happening is work someone pointed at it, and
 * counting the account's general activity there would let a busy fortnight on
 * everything else make a neglected goal look healthy. That is the exact
 * failure this whole model exists to avoid.
 */
export function evidenceFor(goal: Goal, tasks: Task[]): Task[] {
  const measure = goalNumbers(goal).measure;
  if (measure === 'number' || measure === 'milestones') return tasksFor(goal, tasks);
  return tasks;
}

/**
 * What the goal needs per day from here, against what it is getting.
 *
 * Only meaningful for a goal with a number and a date. The "have" figure is
 * measured from the goal's own start rather than from the whole account,
 * because a goal set in March should not be credited with February.
 */
export interface GoalPace {
  /** Units a day required to finish on time. Null without a date or target. */
  need: number | null;
  /** Units a day it has actually been moving at since it started. */
  have: number | null;
  /** Where it lands at the current rate, as an ISO day. Null if never. */
  lands: string | null;
  /** Days late (positive) or early (negative) that projection is. */
  drift: number | null;
}

export function goalPace(goal: Goal, today: Date = new Date()): GoalPace {
  const numbers = goalNumbers(goal);
  const empty: GoalPace = { need: null, have: null, lands: null, drift: null };
  if (!numbers.target) return empty;

  /* `isoDate`, not `toISOString`: a UTC stamp read as a local midnight is a
     day ahead every evening west of UTC, and pace is measured in days. */
  const now = atMidnight(isoDate(today)) ?? today.getTime();
  const start = atMidnight(goal.start_date) ?? atMidnight(goal.created_at);
  const end = atMidnight(goal.deadline);
  if (start === null) return empty;

  const elapsed = Math.max(1, Math.round((now - start) / DAY));
  const remaining = numbers.target - numbers.current;
  const have = numbers.current / elapsed;
  const daysLeft = end === null ? null : Math.round((end - now) / DAY);
  const need = daysLeft !== null && daysLeft > 0 ? remaining / daysLeft : null;

  if (remaining <= 0) {
    return { need, have, lands: new Date(now).toISOString().slice(0, 10), drift: null };
  }
  if (have <= 0) return { need, have, lands: null, drift: null };

  const daysNeeded = Math.ceil(remaining / have);
  const landing = new Date(now + daysNeeded * DAY);
  return {
    need,
    have,
    lands: landing.toISOString().slice(0, 10),
    drift: end === null ? null : Math.round((landing.getTime() - end) / DAY),
  };
}

// ---------------------------------------------------------------------------
// The whole set of goals, as one answer
// ---------------------------------------------------------------------------
export interface SystemHealth {
  state: HealthState;
  label: string;
  /** On track. */
  progressing: number;
  /** Behind — the ones with something to fix. */
  needsAttention: number;
  notStarted: number;
  active: number;
}

/**
 * One answer to "how is this going", for the top of the Stats tab: a tally of
 * the server's readings over whichever goals the page is showing.
 *
 * Behind if any active goal is behind: "you have four goals and one of them is
 * stalled" is the sentence this is here to make impossible to miss, and an
 * average would let three healthy goals hide it. Not started when nothing has
 * begun on any of them, because nothing has gone wrong either.
 */
export function systemHealth(goals: Goal[]): SystemHealth {
  const active = goals.filter((goal) => goal.status !== 'completed');
  const counts: Record<HealthState, number> = { 'on-track': 0, behind: 0, 'not-started': 0 };
  active.forEach((goal) => {
    counts[goalHealth(goal).state] += 1;
  });

  const state: HealthState =
    active.length === 0 || counts['not-started'] === active.length
      ? 'not-started'
      : counts.behind > 0
        ? 'behind'
        : 'on-track';

  return {
    state,
    label: LABELS[state],
    progressing: counts['on-track'],
    needsAttention: counts.behind,
    notStarted: counts['not-started'],
    active: active.length,
  };
}

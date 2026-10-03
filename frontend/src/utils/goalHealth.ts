/**
 * Goal health — is this actually going to happen?
 *
 * Three answers, and only one of them is a judgement:
 *
 *   on-track     nothing below says otherwise
 *   behind       past its date, more than ten points behind the calendar, or
 *                linked work that has gone quiet for a fortnight
 *   not-started  nothing recorded against it yet — not a failure
 *
 * It used to be a 0-100 blend of four weighted signals — pace, recency,
 * consistency and checkpoint depth — sorted into On Track, At Risk and Off
 * Track. Nobody could say why a goal was 61 rather than 67, and At Risk and Off
 * Track asked the reader to do the same thing. A goal is either keeping up or
 * it is not, and the line under the chip says which rule it tripped.
 *
 * ## Why a percentage is not an answer
 *
 * A goal 40% done with 60% of its time left is fine. A goal 70% done with a
 * week to go is not. Completion says where you are; health has to say whether
 * where you are is good enough given when you are.
 *
 * ## What counts as evidence
 *
 * "Gone quiet" is counted off the *tasks linked to the goal*, not off the
 * account's activity as a whole: an account can be busy every day and still be
 * doing nothing about the goal it is worried about. A goal with no linked task
 * is never called behind for being quiet — it has no record to be quiet in —
 * and a goal with no date is never behind the calendar, because there is no
 * calendar for it to be behind.
 *
 * ## What this file does not do
 *
 * It does not turn tasks into progress. Forty linked tasks and four checkpoints
 * do not make one finished task 2.5% of a goal — see the note at the top of
 * backend/api/goals.py.
 */
import { goalNumbers } from '@/components/Goals/numbers';
import type { Goal, Task } from '@/types';
import { countsToward } from '@/utils/goalLinks';
import { isoDate } from '@/utils/dates';

export type HealthState = 'on-track' | 'behind' | 'not-started';

/** How far behind the calendar, as a share of the goal, before it is behind. */
const BEHIND_BY = 0.1;

/** How long linked work can go quiet before the goal is behind. */
const QUIET_DAYS = 14;

/** The window "worked on N times recently" is counted over. */
const EVIDENCE_DAYS = 14;

export interface HealthSignals {
  /** 0-1, how much of the goal is done. */
  progress: number;
  /** 0-1, how much of its time has gone. Null with no deadline. */
  expected: number | null;
  /** progress − expected, in points. Null with no deadline. */
  ahead: number | null;
  daysLeft: number | null;
  daysTotal: number | null;
  /** Days since the last linked task was finished. Null if never. */
  daysSinceWork: number | null;
  /** Linked tasks finished inside the evidence window. */
  recentTasks: number;
  /** The goal's checkpoints, or null when it has none. */
  checkpoints: { done: number; total: number } | null;
}

export interface GoalHealth {
  state: HealthState;
  label: string;
  /** One line, for the card: which rule decided it. */
  reason: string;
  signals: HealthSignals;
}

const LABELS: Record<HealthState, string> = {
  'on-track': 'On Track',
  behind: 'Behind',
  'not-started': 'Not Started',
};

const DAY = 86_400_000;

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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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

/** The days, most recent first, that a linked task was finished on. */
function workDays(linked: Task[]): string[] {
  const days = new Set<string>();
  linked.forEach((task) => {
    const day = String(task.completed_at || '').slice(0, 10);
    if (day) days.add(day);
  });
  return [...days].sort().reverse();
}

/** What `goalHealth` reads off the evidence, independent of the goal itself. */
interface Evidence {
  done: Task[];
  days: string[];
  recentTasks: number;
}

/**
 * The evidence half of a reading, remembered per task list and per day.
 *
 * Every counter goal — XP, streak, focus — takes the account's whole task list
 * as its evidence (see `evidenceFor`), so the same tasks would otherwise be
 * filtered and grouped once per goal, in every place that asks for a goal's
 * health. None of it depends on the goal, so it is worked out once per list
 * per day.
 */
const evidenceCache = new WeakMap<Task[], Map<number, Evidence>>();

function evidenceOn(linked: Task[], now: number): Evidence {
  let byDay = evidenceCache.get(linked);
  const known = byDay?.get(now);
  if (known) return known;

  const done = linked.filter((task) => task.status === 'done' && task.completed_at);
  const days = workDays(done);
  const recentTasks = done.filter((task) => {
    const at = atMidnight(String(task.completed_at));
    return at !== null && now - at < EVIDENCE_DAYS * DAY;
  }).length;

  const evidence = { done, days, recentTasks };
  if (!byDay) {
    byDay = new Map();
    evidenceCache.set(linked, byDay);
  }
  byDay.set(now, evidence);
  return evidence;
}

/**
 * Everything known about whether a goal is going to happen.
 *
 * `today` is passed in rather than read from the clock so the whole model is a
 * pure function of its inputs — which is what makes it checkable.
 */
export function goalHealth(
  goal: Goal,
  tasks: Task[],
  today: Date = new Date(),
): GoalHealth {
  const numbers = goalNumbers(goal);
  const progress = clamp01(numbers.progress / 100);
  const linked = evidenceFor(goal, tasks);

  /* `isoDate`, not `toISOString`: `toISOString()` is the date in UTC and
     `atMidnight` parses local midnight, so west of UTC every "days since" and
     "days left" read one too high from early evening until midnight. See
     `fromIsoDate` in utils/dates, which is the same trap the other way round. */
  const now = atMidnight(isoDate(today)) ?? today.getTime();
  const { done, days, recentTasks } = evidenceOn(linked, now);
  const start = atMidnight(goal.start_date) ?? atMidnight(goal.created_at);
  const end = atMidnight(goal.deadline);

  const daysTotal = start !== null && end !== null ? Math.round((end - start) / DAY) : null;
  const daysLeft = end !== null ? Math.round((end - now) / DAY) : null;

  // How much of the time has gone, clamped at 1: an overdue goal has used all
  // of its time, and that case is decided outright below.
  const expected =
    daysTotal !== null && daysTotal > 0 && start !== null
      ? clamp01((now - start) / (daysTotal * DAY))
      : null;
  const ahead = expected === null ? null : progress - expected;

  const lastDay = days[0] ? atMidnight(days[0]) : null;
  const daysSinceWork = lastDay !== null ? Math.round((now - lastDay) / DAY) : null;

  const milestones = goal.milestones ?? [];
  const stonesDone = milestones.filter((row) => row.status === 'done').length;

  const signals: HealthSignals = {
    progress,
    expected,
    ahead,
    daysLeft,
    daysTotal,
    daysSinceWork,
    recentTasks,
    checkpoints: milestones.length ? { done: stonesDone, total: milestones.length } : null,
  };
  const pct = Math.round(progress * 100);
  const result = (state: HealthState, reason: string, label = LABELS[state]): GoalHealth =>
    ({ state, label, reason, signals });

  if (goal.status === 'completed' || progress >= 1) return result('on-track', 'Reached.', 'Complete');

  // Nothing has happened at all. A goal set this morning is not failing, and
  // colouring it red would teach the reader to ignore the colour.
  if (progress <= 0 && done.length === 0 && stonesDone === 0) {
    return result('not-started', 'Nothing recorded against this yet.');
  }

  if (daysLeft !== null && daysLeft < 0) {
    const late = Math.abs(daysLeft);
    return result('behind', `Its date passed ${late} day${late === 1 ? '' : 's'} ago and it is ${pct}% done.`);
  }

  if (ahead !== null && ahead < -BEHIND_BY) {
    const behind = Math.round(Math.abs(ahead) * 100);
    return result(
      'behind',
      `${behind} points behind where the calendar says it should be, with ${daysLeft} day${daysLeft === 1 ? '' : 's'} left.`,
    );
  }

  if (daysSinceWork !== null && daysSinceWork >= QUIET_DAYS) {
    return result('behind', `Nothing done toward this in ${daysSinceWork} days.`);
  }

  if (ahead !== null && ahead > 0.08) {
    return result('on-track', `${pct}% done with ${Math.round((1 - (expected ?? 0)) * 100)}% of the time left — ahead of pace.`);
  }
  if (recentTasks > 0) {
    return result('on-track', `${pct}% done, and worked on ${recentTasks} time${recentTasks === 1 ? '' : 's'} in the last fortnight.`);
  }
  return result('on-track', `${pct}% done and keeping pace.`);
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

  /* Local, for the reason set out on the same line in `goalHealth` above: a
     UTC stamp read as a local midnight is a day ahead every evening west of
     UTC, and pace is measured in days. */
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
 * One answer to "how is this going", for the top of the Stats tab.
 *
 * Behind if any active goal is behind: "you have four goals and one of them is
 * stalled" is the sentence this is here to make impossible to miss, and an
 * average would let three healthy goals hide it. Not started when nothing has
 * begun on any of them, because nothing has gone wrong either.
 */
export function systemHealth(
  goals: Goal[],
  tasks: Task[],
  today: Date = new Date(),
): SystemHealth {
  const active = goals.filter((goal) => goal.status !== 'completed');
  const readings = active.map((goal) => goalHealth(goal, tasks, today));

  const counts: Record<HealthState, number> = { 'on-track': 0, behind: 0, 'not-started': 0 };
  readings.forEach((one) => { counts[one.state] += 1; });

  const state: HealthState =
    readings.length === 0 || counts['not-started'] === readings.length
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

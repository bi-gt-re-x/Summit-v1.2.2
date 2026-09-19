/**
 * Growth diagnosis — saying what a number means, not just what it is.
 *
 * "Productivity: 87" is a score, and a score is the end of a sentence nobody
 * started. It tells a reader where they rank against a scale they did not
 * choose, and gives them nothing to do on Monday. The panels this feeds say
 * the other thing:
 *
 *     Your productivity is holding, but your efficiency is falling.
 *     You are finishing 92% of the work you set yourself, and each task is
 *     taking 18% longer than your fortnightly average.
 *     → Cut the next three sittings to 40 minutes and stop on the timer.
 *
 * Three parts, and each is load-bearing. The **headline** names the tension in
 * plain words. The **detail** is the two real figures the tension is made of,
 * so the reader can check the claim rather than believe it. The **action** is
 * one thing to do differently, small enough to start today.
 *
 * ## What a diagnosis is allowed to be
 *
 * A diagnosis is always a *pair*: one measure that is holding up and one that
 * is not, or two that are moving together in a way neither shows alone. A
 * single figure moving is a trend, and the Trends tab already draws it. The
 * value here is the relationship — "more work, worse ratings" is a finding
 * about how this fortnight is being spent that neither number states on its
 * own.
 *
 * ## The rules the rules follow
 *
 * **Both sides must be real.** Every rule checks that both measures have enough
 * behind them before it fires. `MIN_TASKS`, `MIN_RATED` and `MIN_ACTIVE` are
 * the floors, and a rule whose evidence is thinner produces nothing rather than
 * a confident sentence about four tasks.
 *
 * **Nothing is invented.** Every figure printed is a count or a mean of the
 * account's own record over `utils/recent`'s fortnight, compared against the
 * fortnight before it. No projections, no scores, no scaling to 100.
 *
 * **A good diagnosis is a diagnosis.** Three of the rules fire on things going
 * *right* — difficulty rising while execution holds is the clearest signal in
 * the whole app that somebody has actually levelled up, and a page that only
 * ever reports problems is one the reader learns to dread rather than open.
 *
 * **Silence is an answer.** An account whose fortnight looks like the one
 * before it has no tension to report, and is told that rather than handed a
 * rule with the thresholds relaxed until something fired.
 */
import type { GrowthDay, Task } from '@/types';
import { isActiveDay } from './activeDay';
import { RECENT_FLOOR, mean, pctChange } from './recent';

/** Fewest finished tasks in a window before a per-task mean is worth taking. */
const MIN_TASKS = 6;

/** Fewest rated tasks before execution or difficulty is worth comparing. */
const MIN_RATED = 5;

/** Fewest active days before a per-day rate is worth comparing. */
const MIN_ACTIVE = 4;

/** Below this a percentage move is noise, not a direction. */
const MOVE = 10;

/** A larger move, for the rules that should only fire on something plain. */
const BIG_MOVE = 18;

const num = (value: unknown) => Number(value) || 0;

// ---------------------------------------------------------------------------
// Vitals — the measures a diagnosis is assembled from
// ---------------------------------------------------------------------------

/**
 * One window's worth of measures.
 *
 * Every field is either a real reading or `null`. Null means the record cannot
 * answer — no rated tasks, no task carried a due date, nothing was timed — and
 * it is deliberately not zero, because a rule that treats "nobody said" as
 * "the answer was nought" is how an account that never rates anything gets told
 * its execution has collapsed.
 */
export interface Vitals {
  days: number;
  activeDays: number;
  /** Share of days with anything on them, 0-100. */
  activeRate: number;
  xpPerActiveDay: number;
  tasksPerActiveDay: number;
  focusPerActiveDay: number;
  /** Of the work due in this window, the share finished. */
  completionRate: number | null;
  dueCount: number;
  /** Mean minutes from a task being made to being finished, where timed. */
  minutesPerTask: number | null;
  timedCount: number;
  /** Mean execution rating, 1-5. */
  execution: number | null;
  /** Mean difficulty rating, 1-5. */
  difficulty: number | null;
  ratedCount: number;
  /** Share of tasks with a deadline that beat it, 0-100. */
  deadlineRate: number | null;
  deadlineCount: number;
  finishedCount: number;
  /** The longest run of consecutive days with nothing on them. */
  longestGap: number;
}

const inRange = (iso: string | undefined, from: string, to: string) =>
  Boolean(iso) && iso!.slice(0, 10) >= from && iso!.slice(0, 10) <= to;

/**
 * Read one window's vitals off the day series and the task list.
 *
 * The day series carries the per-day totals the backend already computes; the
 * tasks carry everything the day series cannot hold — what a task was rated,
 * how long it took, whether it had a deadline and beat it. Both are scoped to
 * the same dates so the two halves of a diagnosis describe the same fortnight.
 */
export function vitals(days: GrowthDay[], tasks: Task[]): Vitals {
  const from = days[0]?.date ?? '';
  const to = days[days.length - 1]?.date ?? '';

  const active = days.filter(isActiveDay);
  const activeDays = active.length;

  /* The longest silence in the window. Counted over every day rather than the
     active ones, which is the point: a gap is made of the days that are not
     there. */
  let longestGap = 0;
  let run = 0;
  days.forEach((day) => {
    if (isActiveDay(day)) {
      run = 0;
    } else {
      run += 1;
      longestGap = Math.max(longestGap, run);
    }
  });

  const finished = tasks.filter((task) => task.status === 'done' && inRange(task.completed_at, from, to));

  /* "Planned work" is work that carried a date it was meant to be done by, and
     that date falling inside the window. A task with no due date was never
     planned for a day, so counting it as missed would make an account that
     works from a running list look permanently behind. */
  const due = tasks.filter((task) => inRange(task.due_date, from, to));
  const dueDone = due.filter((task) => task.status === 'done').length;

  const timed = finished
    .map((task) => num(task.completion_seconds))
    .filter((seconds) => seconds > 0);

  const rated = finished.filter(
    (task) => num(task.difficulty) > 0 && num(task.execution) > 0,
  );

  const withDeadline = finished.filter((task) => task.met_deadline !== undefined);
  const metDeadline = withDeadline.filter((task) => task.met_deadline === true).length;

  return {
    days: days.length,
    activeDays,
    activeRate: days.length ? (activeDays / days.length) * 100 : 0,
    xpPerActiveDay: activeDays ? mean(active.map((day) => num(day.xp_earned))) : 0,
    tasksPerActiveDay: activeDays ? mean(active.map((day) => num(day.tasks_completed))) : 0,
    focusPerActiveDay: activeDays ? mean(active.map((day) => num(day.focus_minutes))) : 0,
    completionRate: due.length >= 3 ? (dueDone / due.length) * 100 : null,
    dueCount: due.length,
    minutesPerTask: timed.length >= MIN_TASKS ? mean(timed) / 60 : null,
    timedCount: timed.length,
    execution: rated.length >= MIN_RATED ? mean(rated.map((task) => num(task.execution))) : null,
    difficulty: rated.length >= MIN_RATED ? mean(rated.map((task) => num(task.difficulty))) : null,
    ratedCount: rated.length,
    deadlineRate: withDeadline.length >= 3 ? (metDeadline / withDeadline.length) * 100 : null,
    deadlineCount: withDeadline.length,
    finishedCount: finished.length,
    longestGap,
  };
}

// ---------------------------------------------------------------------------
// The diagnosis
// ---------------------------------------------------------------------------
export type DiagnosisTone = 'good' | 'tension' | 'warning';

export interface Diagnosis {
  id: string;
  tone: DiagnosisTone;
  /** The tension, in plain words. One sentence, no figures. */
  headline: string;
  /** The two readings it is made of. This is where the numbers go. */
  detail: string;
  /** One thing to do differently, small enough to start today. */
  action: string;
  /** What the reader should watch to know whether the action worked. */
  watch: string;
  /** Ranking weight — how loudly this wants to be heard. */
  weight: number;
}

const round = (value: number) => Math.round(value).toLocaleString('en-US');
const one = (value: number) => (Math.round(value * 10) / 10).toFixed(1);

/** "18% longer" / "12% shorter" — a signed change said as a word. */
const moreLess = (pct: number, more = 'more', less = 'less') =>
  `${round(Math.abs(pct))}% ${pct >= 0 ? more : less}`;

/**
 * Everything the fortnight supports saying, strongest first.
 *
 * `now` is the recent window and `before` the one immediately preceding it —
 * see `recentWindow` in utils/recent. Both are read from the same task list, so
 * every comparison is like against like.
 */
export function diagnose(now: Vitals, before: Vitals): Diagnosis[] {
  const found: Diagnosis[] = [];
  const enough = now.days >= RECENT_FLOOR && now.activeDays >= MIN_ACTIVE;
  if (!enough) return found;

  const push = (item: Diagnosis) => found.push(item);

  // ---- Getting through the work, but each piece costs more ---------------
  const slower =
    now.minutesPerTask !== null && before.minutesPerTask !== null
      ? pctChange(now.minutesPerTask, before.minutesPerTask)
      : null;

  if (now.completionRate !== null && now.completionRate >= 70 && slower !== null && slower >= MOVE) {
    push({
      id: 'productive-inefficient',
      tone: 'tension',
      headline: 'Tasks are taking longer',
      detail: `You're still finishing ${round(now.completionRate)}% of dated tasks, but the average task now takes ${round(now.minutesPerTask!)} min, up from ${round(before.minutesPerTask!)}.`,
      action: `Time your next 3 sessions at ${round(before.minutesPerTask!)} min. If a task doesn't fit, split it.`,
      watch: 'Minutes per task',
      weight: 92,
    });
  }

  // ---- Doing more, finishing worse ---------------------------------------
  const volume = pctChange(now.tasksPerActiveDay, before.tasksPerActiveDay);
  const exec =
    now.execution !== null && before.execution !== null
      ? pctChange(now.execution, before.execution)
      : null;

  if (volume !== null && volume >= MOVE && exec !== null && exec <= -MOVE) {
    push({
      id: 'volume-over-quality',
      tone: 'warning',
      headline: 'More tasks, lower quality',
      detail: `You're doing ${moreLess(volume, 'more', 'fewer')} tasks a day, but your execution rating dropped from ${one(before.execution!)} to ${one(now.execution!)} (${now.ratedCount} rated tasks).`,
      action: 'Drop one task tomorrow and spend that time on the hardest one.',
      watch: `Execution rating back above ${one(before.execution!)}`,
      weight: 95,
    });
  }

  // ---- Harder work, quality holding — the clearest good news there is -----
  const harder =
    now.difficulty !== null && before.difficulty !== null
      ? pctChange(now.difficulty, before.difficulty)
      : null;

  if (harder !== null && harder >= MOVE && exec !== null && exec >= -4) {
    push({
      id: 'levelling-up',
      tone: 'good',
      headline: 'Harder work, same quality',
      detail: `Difficulty rose from ${one(before.difficulty!)} to ${one(now.difficulty!)} out of 5 and your execution held at ${one(now.execution!)}.`,
      action: 'Keep this level for another two weeks before adding more.',
      watch: `Difficulty holding at ${one(now.difficulty!)}`,
      weight: 88,
    });
  }

  // ---- Avoiding the hard work --------------------------------------------
  if (harder !== null && harder <= -MOVE && now.ratedCount >= MIN_RATED) {
    push({
      id: 'drifting-easy',
      tone: 'warning',
      headline: 'Your tasks are getting easier',
      detail: `Average difficulty fell from ${one(before.difficulty!)} to ${one(now.difficulty!)} out of 5 (${now.ratedCount} rated tasks), while your task count stayed flat.`,
      action: 'Start tomorrow with one task you expect to rate 4 or 5 for difficulty.',
      watch: 'One task a day rated 4+ for difficulty',
      weight: 84,
    });
  }

  // ---- Showing up, but the sittings are thinning -------------------------
  const perDay = pctChange(now.xpPerActiveDay, before.xpPerActiveDay);
  if (now.activeRate >= 75 && perDay !== null && perDay <= -MOVE) {
    push({
      id: 'present-but-thin',
      tone: 'tension',
      headline: 'Showing up daily, doing less each day',
      detail: `You worked ${now.activeDays} of ${now.days} days, but each day earned ${round(now.xpPerActiveDay)} XP, down from ${round(before.xpPerActiveDay)}.`,
      action: 'Pick two days this week for one long session each.',
      watch: 'XP on your two best days',
      weight: 80,
    });
  }

  // ---- Cramming: same output, fewer days ---------------------------------
  const attendance = pctChange(now.activeRate, before.activeRate);
  if (attendance !== null && attendance <= -MOVE && perDay !== null && perDay >= MOVE) {
    push({
      id: 'cramming',
      tone: 'tension',
      headline: 'Same work, fewer days',
      detail: `You worked ${now.activeDays} of ${now.days} days (down from ${before.activeDays}), with ${moreLess(perDay, 'more', 'less')} XP on each.`,
      action: 'Move one task from your busiest day to your quietest.',
      watch: `Working days back above ${round(before.activeRate)}%`,
      weight: 78,
    });
  }

  // ---- Longer sessions, no more to show for them -------------------------
  const focus = pctChange(now.focusPerActiveDay, before.focusPerActiveDay);
  if (focus !== null && focus >= BIG_MOVE && perDay !== null && Math.abs(perDay) < MOVE && now.focusPerActiveDay > 20) {
    push({
      id: 'time-without-return',
      tone: 'warning',
      headline: 'More focus time, same results',
      detail: `You're focusing ${round(now.focusPerActiveDay)} min a day, up from ${round(before.focusPerActiveDay)}, but daily XP hasn't changed.`,
      action: 'In your next session, note what you did in the first 20 minutes.',
      watch: 'XP per day, with focus time flat',
      weight: 82,
    });
  }

  // ---- Deadlines slipping -------------------------------------------------
  const deadlines =
    now.deadlineRate !== null && before.deadlineRate !== null
      ? now.deadlineRate - before.deadlineRate
      : null;

  if (now.deadlineRate !== null && now.deadlineRate < 60 && deadlines !== null && deadlines <= -MOVE) {
    push({
      id: 'deadlines-slipping',
      tone: 'warning',
      headline: 'Finishing, but late',
      detail: `${round(now.deadlineRate)}% of your ${now.deadlineCount} dated tasks were on time, down from ${round(before.deadlineRate!)}%.`,
      action: "Set due dates a day earlier this week, and drop dates from tasks that don't need one.",
      watch: 'On-time rate back above 60%',
      weight: 86,
    });
  }

  // ---- The gap ------------------------------------------------------------
  if (now.longestGap >= 3 && now.activeRate < 70) {
    push({
      id: 'gap',
      tone: 'tension',
      headline: 'Long gaps between sessions',
      detail: `Your longest break was ${now.longestGap} days. On days you worked, you averaged ${round(now.xpPerActiveDay)} XP.`,
      action: 'Schedule a 15-minute task for the day after your next session.',
      watch: 'Longest gap under 3 days',
      weight: 90,
    });
  }

  // ---- Everything holding -------------------------------------------------
  if (
    found.length === 0 &&
    now.activeRate >= 60 &&
    volume !== null &&
    Math.abs(volume) < MOVE &&
    now.finishedCount >= MIN_TASKS
  ) {
    push({
      id: 'steady',
      tone: 'good',
      headline: 'Steady fortnight',
      detail: `${now.finishedCount} tasks over ${now.activeDays} days at ${round(now.xpPerActiveDay)} XP a day, about the same as the fortnight before.`,
      action: 'Change one thing, like difficulty or a subject you have been avoiding, and keep the rest the same.',
      watch: 'The one thing you changed',
      weight: 40,
    });
  }

  return found.sort((a, b) => b.weight - a.weight);
}

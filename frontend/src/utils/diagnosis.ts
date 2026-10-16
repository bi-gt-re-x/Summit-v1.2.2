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
 *     taking 18% longer than your two-week average.
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
 * about how in the last two weeks is being spent that neither number states on its
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
 * account's own record over `utils/recent`'s two weeks, compared against the
 * two weeks before it. No projections, no scores, no scaling to 100.
 *
 * **A good diagnosis is a diagnosis.** Three of the rules fire on things going
 * *right* — difficulty rising while execution holds is the clearest signal in
 * the whole app that somebody has actually levelled up, and a page that only
 * ever reports problems is one the reader learns to dread rather than open.
 *
 * **Silence is an answer.** An account whose two weeks looks like the one
 * before it has no tension to report, and is told that rather than handed a
 * rule with the thresholds relaxed until something fired.
 */
import type { GrowthDay, Task } from '@/types';
import { isActiveDay } from './activeDay';
import { RECENT_FLOOR, mean, pctChange } from './recent';
import { secondsSpent } from '@/utils/timeSpent';

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

  // ---- The specifics a diagnosis names, so it can say *which* -----------
  /** First and last empty day of the longest gap. */
  gapFrom: string | null;
  gapTo: string | null;
  /** Gaps of two or more empty days. */
  gapCount: number;
  /** Mean XP on the first day back after a gap of two or more days. */
  returnXp: number | null;
  /** Subject of the last task finished before the longest gap began. */
  beforeGap: string | null;
  /** Per weekday (0 is Sunday): days in the window, and days worked. */
  weekdays: Array<{ total: number; worked: number; xp: number }>;
  /** The day with the most XP. */
  busiest: { date: string; xp: number } | null;
  /** Finished work per subject in the window. */
  subjects: Map<string, SubjectSlice>;
  /** The finished task rated lowest for execution, newest first on a tie. */
  lowest: { title: string; execution: number; date: string; subject: string | null } | null;
  /** The finished task that took longest. */
  slowest: { title: string; minutes: number; subject: string | null } | null;
}

export interface SubjectSlice {
  tasks: number;
  xp: number;
  /** Seconds spent on its finished tasks, where timed. */
  seconds: number;
  execution: number | null;
  difficulty: number | null;
  rated: number;
  /** Dated tasks finished after their date, and dated tasks finished. */
  late: number;
  dated: number;
}

const inRange = (iso: string | undefined, from: string, to: string) =>
  Boolean(iso) && iso!.slice(0, 10) >= from && iso!.slice(0, 10) <= to;

/**
 * Read one window's vitals off the day series and the task list.
 *
 * The day series carries the per-day totals the backend already computes; the
 * tasks carry everything the day series cannot hold — what a task was rated,
 * how long it took, whether it had a deadline and beat it. Both are scoped to
 * the same dates so the two halves of a diagnosis describe the same two weeks.
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
    // Time spent, not `completion_seconds` raw — see utils/timeSpent.
    .map((task) => secondsSpent(task) ?? 0)
    .filter((seconds) => seconds > 0);

  const rated = finished.filter(
    (task) => num(task.difficulty) > 0 && num(task.execution) > 0,
  );

  const withDeadline = finished.filter((task) => task.met_deadline !== undefined);
  const metDeadline = withDeadline.filter((task) => task.met_deadline === true).length;

  // ---- Gaps, in detail -----------------------------------------------------
  let gapFrom: string | null = null;
  let gapTo: string | null = null;
  let gapCount = 0;
  const returns: number[] = [];
  let open: string | null = null;
  let length = 0;
  days.forEach((day) => {
    if (isActiveDay(day)) {
      if (length >= 2) {
        gapCount += 1;
        returns.push(num(day.xp_earned));
      }
      open = null;
      length = 0;
      return;
    }
    if (length === 0) open = day.date;
    length += 1;
    if (length === longestGap && gapFrom === null) {
      gapFrom = open;
      gapTo = day.date;
    }
  });
  if (length >= 2) gapCount += 1;

  const before = gapFrom
    ? finished
        .filter((task) => task.subject && (task.completed_at ?? '').slice(0, 10) < gapFrom!)
        .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))[0]
    : undefined;

  // ---- Weekdays -----------------------------------------------------------
  const weekdays = Array.from({ length: 7 }, () => ({ total: 0, worked: 0, xp: 0 }));
  days.forEach((day) => {
    const at = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    const slot = weekdays[at]!;
    slot.total += 1;
    if (isActiveDay(day)) {
      slot.worked += 1;
      slot.xp += num(day.xp_earned);
    }
  });
  const busiest = active.reduce<{ date: string; xp: number } | null>(
    (best, day) => (!best || num(day.xp_earned) > best.xp ? { date: day.date, xp: num(day.xp_earned) } : best),
    null,
  );

  // ---- Subjects -----------------------------------------------------------
  const subjects = new Map<string, SubjectSlice>();
  const sums = new Map<string, { exec: number; diff: number }>();
  finished.forEach((task) => {
    if (!task.subject) return;
    const row = subjects.get(task.subject) ?? {
      tasks: 0, xp: 0, seconds: 0, execution: null, difficulty: null, rated: 0, late: 0, dated: 0,
    };
    const sum = sums.get(task.subject) ?? { exec: 0, diff: 0 };
    row.tasks += 1;
    row.xp += num(task.xp_value);
    row.seconds += secondsSpent(task) ?? 0;
    if (num(task.execution) > 0 && num(task.difficulty) > 0) {
      row.rated += 1;
      sum.exec += num(task.execution);
      sum.diff += num(task.difficulty);
      row.execution = sum.exec / row.rated;
      row.difficulty = sum.diff / row.rated;
    }
    if (task.met_deadline !== undefined) {
      row.dated += 1;
      if (task.met_deadline === false) row.late += 1;
    }
    subjects.set(task.subject, row);
    sums.set(task.subject, sum);
  });

  const lowestTask = rated
    .slice()
    .sort((a, b) => num(a.execution) - num(b.execution) || (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))[0];
  const slowestTask = finished
    .filter((task) => (secondsSpent(task) ?? 0) > 0)
    .sort((a, b) => (secondsSpent(b) ?? 0) - (secondsSpent(a) ?? 0))[0];

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
    gapFrom,
    gapTo,
    gapCount,
    returnXp: returns.length ? mean(returns) : null,
    beforeGap: before?.subject ?? null,
    weekdays,
    busiest,
    subjects,
    lowest: lowestTask
      ? {
          title: lowestTask.title,
          execution: num(lowestTask.execution),
          date: (lowestTask.completed_at ?? '').slice(0, 10),
          subject: lowestTask.subject ?? null,
        }
      : null,
    slowest: slowestTask
      ? { title: slowestTask.title, minutes: (secondsSpent(slowestTask) ?? 0) / 60, subject: slowestTask.subject ?? null }
      : null,
  };
}

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
  /**
   * The specifics behind it, from the reader's own record: which subject,
   * which day, which task. Two or three short lines; empty when the window
   * holds nothing more specific than the detail already says.
   */
  points: string[];
  /** Ranking weight — how loudly this wants to be heard. */
  weight: number;
}

const round = (value: number) => Math.round(value).toLocaleString('en-US');
const one = (value: number) => (Math.round(value * 10) / 10).toFixed(1);

/** "18% longer" / "12% shorter" — a signed change said as a word. */
const moreLess = (pct: number, more = 'more', less = 'less') =>
  `${round(Math.abs(pct))}% ${pct >= 0 ? more : less}`;

/**
 * Everything the two weeks supports saying, strongest first.
 *
 * `now` is the recent window and `before` the one immediately preceding it —
 * see `recentWindow` in utils/recent. Both are read from the same task list, so
 * every comparison is like against like.
 */
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Oct 3" for an ISO date. */
const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** The weekday worked least often, with at least two of it in the window. */
function missedWeekday(v: Vitals): { name: string; worked: number; total: number } | null {
  let best: { name: string; worked: number; total: number; rate: number } | null = null;
  v.weekdays.forEach((slot, at) => {
    if (slot.total < 2) return;
    const rate = slot.worked / slot.total;
    if (!best || rate < best.rate) best = { name: WEEKDAY[at]!, worked: slot.worked, total: slot.total, rate };
  });
  return best;
}

/** The weekday with the most XP per day worked. */
function strongWeekday(v: Vitals): { name: string; xp: number } | null {
  let best: { name: string; xp: number } | null = null;
  v.weekdays.forEach((slot, at) => {
    if (slot.worked < 2) return;
    const xp = slot.xp / slot.worked;
    if (!best || xp > best.xp) best = { name: WEEKDAY[at]!, xp };
  });
  return best;
}

/** The subject with the most finished tasks in the window. */
function topSubject(v: Vitals): string | null {
  let best: [string, SubjectSlice] | null = null;
  v.subjects.forEach((row, id) => {
    if (!best || row.tasks > best[1].tasks) best = [id, row];
  });
  return best ? best[0] : null;
}

/**
 * The subject whose `pick` moved most between the two windows, in the
 * direction asked for. Only subjects with a reading in both.
 */
function mostMoved(
  now: Vitals,
  before: Vitals,
  pick: (row: SubjectSlice) => number | null,
  direction: 1 | -1,
): { id: string; was: number; is: number } | null {
  let best: { id: string; was: number; is: number; by: number } | null = null;
  now.subjects.forEach((row, id) => {
    const then = before.subjects.get(id);
    const is = pick(row);
    const was = then ? pick(then) : null;
    if (is === null || was === null) return;
    const by = (is - was) * direction;
    if (by > 0 && (!best || by > best.by)) best = { id, was, is, by };
  });
  return best;
}

const minutesOf = (row: SubjectSlice) => (row.seconds > 0 ? row.seconds / 60 : null);
const xpPerHour = (row: SubjectSlice) => (row.seconds >= 1800 ? (row.xp / row.seconds) * 3600 : null);

export function diagnose(now: Vitals, before: Vitals, nameOf: (id: string) => string = (id) => id): Diagnosis[] {
  const found: Diagnosis[] = [];
  const enough = now.days >= RECENT_FLOOR && now.activeDays >= MIN_ACTIVE;
  if (!enough) return found;

  const push = (item: Diagnosis) => found.push({ ...item, points: item.points.filter(Boolean) });
  const top = topSubject(now);
  const missed = missedWeekday(now);
  const strong = strongWeekday(now);

  /* Finishing what is planned, but each task is taking longer. */
  const slower =
    now.minutesPerTask !== null && before.minutesPerTask !== null
      ? pctChange(now.minutesPerTask, before.minutesPerTask)
      : null;

  if (now.completionRate !== null && now.completionRate >= 70 && slower !== null && slower >= MOVE) {
    const slowed = mostMoved(now, before, (row) => (row.tasks ? (minutesOf(row) ?? 0) / row.tasks || null : null), 1);
    push({
      id: 'productive-inefficient',
      tone: 'tension',
      headline: 'Tasks are taking longer',
      detail: `You're still finishing ${round(now.completionRate)}% of dated tasks, but the average task now takes ${round(now.minutesPerTask!)} min, up from ${round(before.minutesPerTask!)}.`,
      points: [
        slowed ? `${nameOf(slowed.id)} slowed the most: ${round(slowed.is)} min a task, up from ${round(slowed.was)}.` : '',
        now.slowest ? `Your longest task was "${now.slowest.title}" at ${round(now.slowest.minutes)} min.` : '',
      ],
      action: now.slowest && now.slowest.minutes > before.minutesPerTask! * 1.5
        ? `Split tasks like "${now.slowest.title}" into ${round(before.minutesPerTask!)}-minute pieces, and time the next three.`
        : `Time your next 3 sessions at ${round(before.minutesPerTask!)} min. If a task doesn't fit, split it.`,
      watch: 'Minutes per task',
      weight: 92,
    });
  }

  /* Doing more, doing it worse. */
  const volume = pctChange(now.tasksPerActiveDay, before.tasksPerActiveDay);
  const exec =
    now.execution !== null && before.execution !== null
      ? pctChange(now.execution, before.execution)
      : null;

  if (volume !== null && volume >= MOVE && exec !== null && exec <= -MOVE) {
    const dropped = mostMoved(now, before, (row) => (row.rated >= 2 ? row.execution : null), -1);
    push({
      id: 'volume-over-quality',
      tone: 'warning',
      headline: 'More tasks, lower quality',
      detail: `You're doing ${moreLess(volume, 'more', 'fewer')} tasks a day, but your execution rating dropped from ${one(before.execution!)} to ${one(now.execution!)} (${now.ratedCount} rated tasks).`,
      points: [
        dropped ? `${nameOf(dropped.id)} dropped the most: ${one(dropped.was)} to ${one(dropped.is)}.` : '',
        now.lowest ? `Lowest rated: "${now.lowest.title}" (${now.lowest.execution}/5, ${day(now.lowest.date)}).` : '',
      ],
      action: now.lowest
        ? `Redo "${now.lowest.title}" before adding anything new, and drop one task tomorrow to make room.`
        : 'Drop one task tomorrow and spend that time on the hardest one.',
      watch: `Execution rating back above ${one(before.execution!)}`,
      weight: 95,
    });
  }

  /* The clearest good sign: harder work, quality holding. */
  const harder =
    now.difficulty !== null && before.difficulty !== null
      ? pctChange(now.difficulty, before.difficulty)
      : null;

  if (harder !== null && harder >= MOVE && exec !== null && exec >= -4) {
    const climbed = mostMoved(now, before, (row) => (row.rated >= 2 ? row.difficulty : null), 1);
    push({
      id: 'levelling-up',
      tone: 'good',
      headline: 'Harder work, same quality',
      detail: `Difficulty rose from ${one(before.difficulty!)} to ${one(now.difficulty!)} out of 5 and your execution held at ${one(now.execution!)}.`,
      points: [
        climbed ? `Most of the climb was ${nameOf(climbed.id)}: ${one(climbed.was)} to ${one(climbed.is)} for difficulty.` : '',
        `Based on ${now.ratedCount} rated tasks.`,
      ],
      action: climbed
        ? `Keep ${nameOf(climbed.id)} at this level for two more weeks before adding more.`
        : 'Keep this level for another two weeks before adding more.',
      watch: `Difficulty holding at ${one(now.difficulty!)}`,
      weight: 88,
    });
  }

  if (harder !== null && harder <= -MOVE && now.ratedCount >= MIN_RATED) {
    const eased = mostMoved(now, before, (row) => (row.rated >= 2 ? row.difficulty : null), -1);
    push({
      id: 'drifting-easy',
      tone: 'warning',
      headline: 'Your tasks are getting easier',
      detail: `Average difficulty fell from ${one(before.difficulty!)} to ${one(now.difficulty!)} out of 5 (${now.ratedCount} rated tasks), while your task count stayed flat.`,
      points: [
        eased ? `${nameOf(eased.id)} eased the most: ${one(eased.was)} to ${one(eased.is)}.` : '',
      ],
      action: eased
        ? `Start tomorrow with one ${nameOf(eased.id)} task you expect to rate 4 or 5 for difficulty.`
        : 'Start tomorrow with one task you expect to rate 4 or 5 for difficulty.',
      watch: 'One task a day rated 4+ for difficulty',
      weight: 84,
    });
  }

  /* Turning up, doing less each time. */
  const perDay = pctChange(now.xpPerActiveDay, before.xpPerActiveDay);
  if (now.activeRate >= 75 && perDay !== null && perDay <= -MOVE) {
    const thinner = mostMoved(now, before, (row) => row.xp, -1);
    push({
      id: 'present-but-thin',
      tone: 'tension',
      headline: 'Showing up daily, doing less each day',
      detail: `You worked ${now.activeDays} of ${now.days} days, but each day earned ${round(now.xpPerActiveDay)} XP, down from ${round(before.xpPerActiveDay)}.`,
      points: [
        thinner ? `${nameOf(thinner.id)} fell furthest: ${round(thinner.is)} XP, down from ${round(thinner.was)}.` : '',
        strong ? `Your strongest day is ${strong.name}, at ${round(strong.xp)} XP.` : '',
      ],
      action: strong
        ? `Make ${strong.name} and one other day long sessions this week${thinner ? `, starting with ${nameOf(thinner.id)}` : ''}.`
        : 'Pick two days this week for one long session each.',
      watch: 'XP on your two best days',
      weight: 80,
    });
  }

  /* The same work squeezed into fewer days. */
  const attendance = pctChange(now.activeRate, before.activeRate);
  if (attendance !== null && attendance <= -MOVE && perDay !== null && perDay >= MOVE) {
    const quietest = missed;
    push({
      id: 'cramming',
      tone: 'tension',
      headline: 'Same work, fewer days',
      detail: `You worked ${now.activeDays} of ${now.days} days (down from ${before.activeDays}), with ${moreLess(perDay, 'more', 'less')} XP on each.`,
      points: [
        now.busiest ? `Your biggest day was ${day(now.busiest.date)}, with ${round(now.busiest.xp)} XP.` : '',
        quietest ? `You worked ${quietest.worked} of ${quietest.total} ${quietest.name}s.` : '',
      ],
      action: now.busiest && quietest
        ? `Move one task from a day like ${day(now.busiest.date)} to ${quietest.name}.`
        : 'Move one task from your busiest day to your quietest.',
      watch: `Working days back above ${round(before.activeRate)}%`,
      weight: 78,
    });
  }

  /* More time in, nothing more out. */
  const focus = pctChange(now.focusPerActiveDay, before.focusPerActiveDay);
  if (focus !== null && focus >= BIG_MOVE && perDay !== null && Math.abs(perDay) < MOVE && now.focusPerActiveDay > 20) {
    const absorbed = mostMoved(now, before, minutesOf, 1);
    let efficient: { id: string; rate: number } | null = null;
    now.subjects.forEach((row, id) => {
      const rate = xpPerHour(row);
      if (rate !== null && (!efficient || rate > efficient.rate)) efficient = { id, rate };
    });
    const best = efficient as { id: string; rate: number } | null;
    const perHourNow = now.focusPerActiveDay ? (now.xpPerActiveDay / now.focusPerActiveDay) * 60 : 0;
    const perHourBefore = before.focusPerActiveDay ? (before.xpPerActiveDay / before.focusPerActiveDay) * 60 : 0;
    push({
      id: 'time-without-return',
      tone: 'warning',
      headline: 'More focus time, same results',
      detail: `You're focusing ${round(now.focusPerActiveDay)} min a day, up from ${round(before.focusPerActiveDay)}, but daily XP hasn't changed.`,
      points: [
        /* A jump from a few minutes a day is the timer starting to be used,
           not time that stopped paying. Said so, rather than an XP-per-hour
           "drop" from a figure that was never real. */
        before.focusPerActiveDay < 20
          ? `You timed only ${round(before.focusPerActiveDay)} min a day before, so much of this jump is time that wasn't being tracked yet.`
          : `That's ${round(perHourNow)} XP an hour of focus, down from ${round(perHourBefore)}.`,
        absorbed ? `The extra time went mostly to ${nameOf(absorbed.id)}: ${round(absorbed.is)} min on finished tasks, up from ${round(absorbed.was)}.` : '',
        best && (!absorbed || best.id !== absorbed.id) ? `${nameOf(best.id)} earns the most per hour, at ${round(best.rate)} XP.` : '',
      ],
      action: absorbed && best && best.id !== absorbed.id
        ? `Cap ${nameOf(absorbed.id)} sessions at 45 min and give the time back to ${nameOf(best.id)}.`
        : absorbed
          ? `Before each ${nameOf(absorbed.id)} session, write down the one task you'll finish in it.`
          : 'In your next session, note what you did in the first 20 minutes.',
      watch: 'XP per hour of focus',
      weight: 82,
    });
  }

  /* Getting it done, getting it done late. */
  const deadlines =
    now.deadlineRate !== null && before.deadlineRate !== null
      ? now.deadlineRate - before.deadlineRate
      : null;

  if (now.deadlineRate !== null && now.deadlineRate < 60 && deadlines !== null && deadlines <= -MOVE) {
    let latest: [string, SubjectSlice] | null = null;
    now.subjects.forEach((row, id) => {
      if (row.late > 0 && (!latest || row.late > latest[1].late)) latest = [id, row];
    });
    const late = latest as [string, SubjectSlice] | null;
    push({
      id: 'deadlines-slipping',
      tone: 'warning',
      headline: 'Finishing, but late',
      detail: `${round(now.deadlineRate)}% of your ${now.deadlineCount} dated tasks were on time, down from ${round(before.deadlineRate!)}%.`,
      points: [
        late ? `${nameOf(late[0])} ran late most: ${late[1].late} of ${late[1].dated} dated tasks.` : '',
      ],
      action: late
        ? `Set ${nameOf(late[0])} due dates a day earlier this week, and drop dates from tasks that don't need one.`
        : "Set due dates a day earlier this week, and drop dates from tasks that don't need one.",
      watch: 'On-time rate back above 60%',
      weight: 86,
    });
  }

  /* Breaks long enough to cost momentum. */
  if (now.longestGap >= 3 && now.activeRate < 70) {
    const subject = now.beforeGap ?? top;
    push({
      id: 'gap',
      tone: 'tension',
      headline: 'Long gaps between sessions',
      detail: `Your longest break was ${now.longestGap} days${now.gapFrom && now.gapTo ? `, ${day(now.gapFrom)} to ${day(now.gapTo)}` : ''}, and you had ${now.gapCount} ${now.gapCount === 1 ? 'break' : 'breaks'} of 2+ days. On days you worked, you averaged ${round(now.xpPerActiveDay)} XP.`,
      points: [
        missed ? `${missed.name} is the day you miss most: worked ${missed.worked} of ${missed.total}.` : '',
        now.returnXp !== null ? `Your first day back after a break averaged ${round(now.returnXp)} XP, against ${round(now.xpPerActiveDay)} on a usual day.` : '',
        now.beforeGap ? `Before the longest break you were on ${nameOf(now.beforeGap)}.` : '',
      ],
      action: missed
        ? `Put a 15-minute ${subject ? `${nameOf(subject)} ` : ''}task on ${missed.name}, so a break can't run past one day.`
        : 'Schedule a 15-minute task for the day after your next session.',
      watch: 'Longest gap under 3 days',
      weight: 90,
    });
  }

  /* Nothing moving either way. */
  if (
    found.length === 0 &&
    now.activeRate >= 60 &&
    volume !== null &&
    Math.abs(volume) < MOVE &&
    now.finishedCount >= MIN_TASKS
  ) {
    let least: string | null = null;
    before.subjects.forEach((row, id) => {
      const nowRow = now.subjects.get(id);
      if (!nowRow && row.tasks >= 2 && !least) least = id;
    });
    const dropped = least as string | null;
    push({
      id: 'steady',
      tone: 'good',
      headline: 'Steady two weeks',
      detail: `${now.finishedCount} tasks over ${now.activeDays} days at ${round(now.xpPerActiveDay)} XP a day, about the same as the two weeks before.`,
      points: [
        top ? `Most of it was ${nameOf(top)}: ${now.subjects.get(top)!.tasks} tasks.` : '',
        dropped ? `${nameOf(dropped)} had work two weeks ago and none since.` : '',
      ],
      action: dropped
        ? `Change one thing: put one ${nameOf(dropped)} task back in this week, and keep the rest the same.`
        : "Change one thing, like difficulty or a subject you've been avoiding, and keep the rest the same.",
      watch: 'The one thing you changed',
      weight: 40,
    });
  }

  return found.sort((a, b) => b.weight - a.weight);
}

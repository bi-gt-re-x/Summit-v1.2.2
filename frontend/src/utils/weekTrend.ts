/**
 * Weeks up, weeks down, slumps, and what actually changed.
 *
 * Three reads for the Overview tab, all off the same day series and task list
 * the rest of the page uses:
 *
 *   `weekBlocks` / `weekMove`  The last eight weeks as rolling 7-day blocks
 *                              ending today, and whether this week is up,
 *                              down or level against the one before.
 *   `findSlump`                Whether this week is far enough under the
 *                              reader's usual to call it a slump, and the few
 *                              things most likely to get them out of it.
 *   `trackChanges`             The last two weeks against the two before,
 *                              metric by metric, keeping only moves bigger
 *                              than the metric's own noise.
 *
 * ## Rolling weeks, not calendar weeks
 *
 * On a Tuesday the calendar week has two days in it, and comparing that with
 * a whole week before it calls every Tuesday a crash. A rolling block is
 * always seven days, so "this week" means the last seven days and the
 * comparison is like for like.
 *
 * ## What counts as a change
 *
 * Every metric has two floors and a move has to clear the larger one: a share
 * of where it started (so a busy account isn't flagged for 5 XP) and an
 * absolute minimum (so 2 tasks becoming 3 isn't called 50% growth). Small
 * moves that clear both are kept, because a steady 15% is worth knowing about.
 */
import type { GrowthDay, Task } from '@/types';
import { isActiveDay } from './activeDay';
import { pctChange } from './recent';

const DAY_MS = 86_400_000;
const num = (value: unknown) => Number(value) || 0;

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / DAY_MS);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const doneOn = (task: Task) =>
  task.status === 'done' ? String(task.completed_at || '').slice(0, 10) : '';

function finishedIn(tasks: Task[], from: string, to: string): Task[] {
  return tasks.filter((task) => {
    const day = doneOn(task);
    return Boolean(day) && day >= from && day <= to;
  });
}

// --------------------------------------------------------------------------
// Weeks
// --------------------------------------------------------------------------
export interface WeekBlock {
  /** First and last day of the block, ISO, both included. */
  from: string;
  to: string;
  xp: number;
  tasks: number;
  focus: number;
  /** Days with any work on them, 0-7. */
  active: number;
}

/** A week is up or down only past this share of the week before... */
const WEEK_NOISE = 0.15;
/** ...and past this many XP, so a quiet account isn't flagged for 10 XP. */
const WEEK_FLOOR = 30;

/**
 * The last `count` rolling weeks, oldest first, the last one ending on the
 * last day of the series (today). Blocks that reach back before the account
 * existed are dropped rather than counted as empty weeks.
 */
export function weekBlocks(all: GrowthDay[], count = 8): WeekBlock[] {
  if (all.length === 0) return [];
  const blocks: WeekBlock[] = [];
  for (let back = 0; back < count; back += 1) {
    const end = all.length - back * 7;
    const start = end - 7;
    if (start < 0) break;
    const days = all.slice(start, end);
    blocks.unshift({
      from: days[0]!.date,
      to: days[days.length - 1]!.date,
      xp: days.reduce((sum, day) => sum + num(day.xp_earned), 0),
      tasks: days.reduce((sum, day) => sum + num(day.tasks_completed), 0),
      focus: days.reduce((sum, day) => sum + num(day.focus_minutes), 0),
      active: days.filter(isActiveDay).length,
    });
  }
  return blocks;
}

export type Direction = 'up' | 'down' | 'level';

/** Whether `now` is meaningfully above or below `was`, in XP. */
export function directionOf(now: number, was: number): Direction {
  const floor = Math.max(WEEK_FLOOR, Math.abs(was) * WEEK_NOISE);
  if (now - was > floor) return 'up';
  if (was - now > floor) return 'down';
  return 'level';
}

export interface WeekMove {
  direction: Direction;
  now: WeekBlock;
  was: WeekBlock;
  pct: number | null;
  /** How many weeks in a row, counting this one, have moved this direction. */
  run: number;
  /** This week is the best of the blocks shown. */
  best: boolean;
}

/** This week against the week before, or null with fewer than two weeks. */
export function weekMove(blocks: WeekBlock[]): WeekMove | null {
  if (blocks.length < 2) return null;
  const now = blocks[blocks.length - 1]!;
  const was = blocks[blocks.length - 2]!;
  const direction = directionOf(now.xp, was.xp);

  let run = 1;
  for (let at = blocks.length - 2; at >= 1; at -= 1) {
    if (direction === 'level' || directionOf(blocks[at]!.xp, blocks[at - 1]!.xp) !== direction) break;
    run += 1;
  }

  const best = now.xp > 0 && blocks.every((block) => block === now || block.xp < now.xp);
  return { direction, now, was, pct: pctChange(now.xp, was.xp), run, best };
}

// --------------------------------------------------------------------------
// Slumps
// --------------------------------------------------------------------------
/** This week at or under this share of the usual week is a slump. */
const SLUMP_SHARE = 0.6;
/** Two down weeks in a row that land under this share of usual also count. */
const SLIDE_SHARE = 0.75;

export interface SlumpStep {
  id: string;
  title: string;
  detail: string;
  /** Somewhere in the app that does the step, when there is one. */
  to?: string;
  link?: string;
}

export interface Slump {
  /** XP in the last 7 days. */
  now: number;
  /** The median week of the four before it. */
  usual: number;
  /** How far under usual, 0-100. */
  drop: number;
  /** Days since the last day with any work, 0 if today. */
  idle: number;
  steps: SlumpStep[];
}

export interface SlumpInput {
  blocks: WeekBlock[];
  all: GrowthDay[];
  tasks: Task[];
  nameOf: (id: string) => string;
  /** Today, ISO. Defaults to the last day of the series. */
  today?: string;
}

/**
 * Whether the reader is in a slump, and what to do about it.
 *
 * "Usual" is the median of the four weeks before this one, so one huge week
 * doesn't make every normal week after it look like a slump. It needs at least
 * two of those four to have had work in them: an account that has never had
 * a usual week can't fall below it.
 */
export function findSlump({ blocks, all, tasks, nameOf, today }: SlumpInput): Slump | null {
  if (blocks.length < 3) return null;
  const now = blocks[blocks.length - 1]!;
  const prior = blocks.slice(-5, -1);
  if (prior.filter((block) => block.xp > 0).length < 2) return null;

  const usual = median(prior.map((block) => block.xp));
  if (usual <= 0) return null;

  const was = blocks[blocks.length - 2]!;
  const before = blocks[blocks.length - 3]!;
  const sliding =
    directionOf(now.xp, was.xp) === 'down' &&
    directionOf(was.xp, before.xp) === 'down' &&
    now.xp <= usual * SLIDE_SHARE;

  if (now.xp > usual * SLUMP_SHARE && !sliding) return null;

  const todayIso = today ?? all[all.length - 1]?.date ?? '';
  const lastWorked = [...all].reverse().find(isActiveDay)?.date ?? '';
  const idle = lastWorked ? Math.max(0, daysBetween(lastWorked, todayIso)) : 0;

  const steps = slumpSteps({ blocks, prior, now, tasks, nameOf, todayIso, idle });
  return {
    now: now.xp,
    usual,
    drop: Math.round(Math.max(0, (1 - now.xp / usual) * 100)),
    idle,
    steps,
  };
}

function slumpSteps({
  prior,
  now,
  tasks,
  nameOf,
  todayIso,
  idle,
}: {
  blocks: WeekBlock[];
  prior: WeekBlock[];
  now: WeekBlock;
  tasks: Task[];
  nameOf: (id: string) => string;
  todayIso: string;
  idle: number;
}): SlumpStep[] {
  const steps: SlumpStep[] = [];
  const open = tasks.filter((task) => task.status === 'todo');

  // 1. Get one thing done today. The smallest dated task is the easiest win;
  //    a task with no date will do if there's nothing dated.
  const dated = open.filter((task) => task.due_date);
  const pool = dated.length ? dated : open;
  const smallest = [...pool].sort(
    (a, b) => num(a.xp_value) - num(b.xp_value) || String(a.due_date).localeCompare(String(b.due_date)),
  )[0];
  const gap =
    idle >= 2
      ? `It's been ${idle} days since you last got anything done.`
      : `You've done ${now.tasks} ${now.tasks === 1 ? 'task' : 'tasks'} in the last 7 days.`;
  steps.push({
    id: 'one-task',
    title: 'Finish one small task today',
    detail: smallest
      ? `${gap} Start with "${smallest.title}". It's one of the smallest things on your list, and one done task gets you moving again.`
      : `${gap} Add one task you can finish in 15 minutes and do it now. One done task gets you moving again.`,
    to: smallest ? `/tasks?task=${encodeURIComponent(smallest.id)}` : '/tasks',
    link: smallest ? 'Open it' : 'Open Tasks',
  });

  // 2. Go back to the subject that was carrying the weeks before.
  const from = prior[0]?.from ?? '';
  const to = prior[prior.length - 1]?.to ?? '';
  const bySubject = new Map<string, number>();
  finishedIn(tasks, from, to).forEach((task) => {
    if (!task.subject) return;
    bySubject.set(task.subject, (bySubject.get(task.subject) ?? 0) + 1);
  });
  const top = [...bySubject.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3) {
    steps.push({
      id: 'best-subject',
      title: `Start with ${nameOf(top[0])}`,
      detail: `It was your biggest subject before the dip, with ${top[1]} tasks done in the 4 weeks before this one. Going back to what you already do well is the quickest way back in.`,
      to: '/tasks',
      link: 'Pick a task',
    });
  }

  // 3. Put the days on the calendar instead of deciding each morning.
  const usualDays = Math.round(median(prior.map((block) => block.active)));
  if (usualDays > now.active) {
    const aim = Math.max(now.active + 1, Math.ceil(usualDays * 0.75));
    steps.push({
      id: 'book-days',
      title: `Book ${aim} work ${aim === 1 ? 'day' : 'days'} for the next week`,
      detail: `You worked ${now.active} of the last 7 days, down from about ${usualDays} a week before. Put the sessions on your calendar now, so you don't have to decide each day.`,
      to: '/calendar',
      link: 'Open Calendar',
    });
  }

  // 4. A long late list makes starting harder. Clear it down.
  const late = open.filter((task) => task.due_date && String(task.due_date).slice(0, 10) < todayIso);
  if (late.length >= 5) {
    steps.push({
      id: 'clear-late',
      title: 'Clear out your overdue list',
      detail: `${late.length} tasks are past their due date. Spend 10 minutes moving the ones that still matter and deleting the rest. A shorter list is easier to start on.`,
      to: '/tasks',
      link: 'Open Tasks',
    });
  }

  // 5. Short sessions, if the usual ones were long.
  const usualFocus = median(prior.map((block) => (block.active ? block.focus / block.active : 0)));
  if (usualFocus >= 40) {
    steps.push({
      id: 'short-sessions',
      title: 'Keep sessions to 25 minutes for now',
      detail: `Your usual session was about ${Math.round(usualFocus)} minutes. Short sessions you actually start beat long ones you keep putting off.`,
      to: '/timer',
      link: 'Open Timer',
    });
  }

  return steps.slice(0, 4);
}

// --------------------------------------------------------------------------
// What changed
// --------------------------------------------------------------------------
export interface TrackedMove {
  id: string;
  label: string;
  before: number;
  after: number;
  /** How the two figures print. */
  show: (value: number) => string;
  pct: number | null;
  up: boolean;
  /** Whether this direction is good news. */
  good: boolean;
  /** How big the move is against its noise floor. Sorts the list. */
  size: number;
  /** Whether "up 27%" reads naturally for this one. Not for a share or a rating. */
  percent: boolean;
}

interface Metric {
  id: string;
  label: string;
  percent: boolean;
  share: number;
  floor: number;
  better: 'higher' | 'lower';
  show: (value: number) => string;
  read: (days: GrowthDay[], finished: Task[]) => number | null;
}

const whole = (value: number) => Math.round(value).toLocaleString('en-US');
const hours = (value: number) => {
  const h = value / 60;
  return h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`;
};

const METRICS: Metric[] = [
  {
    id: 'xp',
    percent: true,
    label: 'XP earned',
    share: 0.12,
    floor: 50,
    better: 'higher',
    show: (value) => `${whole(value)} XP`,
    read: (days) => days.reduce((sum, day) => sum + num(day.xp_earned), 0),
  },
  {
    id: 'tasks',
    percent: true,
    label: 'Tasks finished',
    share: 0.12,
    floor: 3,
    better: 'higher',
    show: whole,
    read: (days) => days.reduce((sum, day) => sum + num(day.tasks_completed), 0),
  },
  {
    id: 'days',
    percent: false,
    label: 'Days worked',
    share: 0,
    floor: 1.5,
    better: 'higher',
    show: (value) => `${whole(value)} ${Math.round(value) === 1 ? 'day' : 'days'}`,
    read: (days) => days.filter(isActiveDay).length,
  },
  {
    id: 'focus',
    percent: true,
    label: 'Focus time',
    share: 0.15,
    floor: 60,
    better: 'higher',
    show: hours,
    read: (days) => days.reduce((sum, day) => sum + num(day.focus_minutes), 0),
  },
  {
    id: 'on-time',
    percent: false,
    label: 'Finished on time',
    share: 0,
    floor: 10,
    better: 'higher',
    show: (value) => `${Math.round(value)}%`,
    read: (_days, finished) => {
      const dated = finished.filter((task) => task.due_date);
      if (dated.length < 5) return null;
      return (dated.filter((task) => task.met_deadline).length / dated.length) * 100;
    },
  },
  {
    id: 'execution',
    percent: false,
    label: 'How well tasks went',
    share: 0,
    floor: 0.3,
    better: 'higher',
    show: (value) => `${(Math.round(value * 10) / 10).toFixed(1)} / 5`,
    read: (_days, finished) => {
      const rated = finished
        .map((task) => Number(task.execution))
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);
      if (rated.length < 5) return null;
      return rated.reduce((sum, value) => sum + value, 0) / rated.length;
    },
  },
];

export interface ChangeInput {
  current: GrowthDay[];
  previous: GrowthDay[];
  tasks: Task[];
  nameOf: (id: string) => string;
}

/**
 * The last stretch against the one before it, keeping only real moves.
 *
 * Returns nothing when the two stretches aren't the same length: a comparison
 * with a short side would report the shortfall as a drop.
 */
export function trackChanges({ current, previous, tasks, nameOf }: ChangeInput): TrackedMove[] {
  if (current.length === 0 || previous.length !== current.length) return [];
  const nowFrom = current[0]!.date;
  const nowTo = current[current.length - 1]!.date;
  const wasFrom = previous[0]!.date;
  const wasTo = previous[previous.length - 1]!.date;
  const nowDone = finishedIn(tasks, nowFrom, nowTo);
  const wasDone = finishedIn(tasks, wasFrom, wasTo);

  const moves: TrackedMove[] = [];
  const consider = (
    id: string,
    label: string,
    before: number,
    after: number,
    share: number,
    floor: number,
    better: 'higher' | 'lower',
    show: (value: number) => string,
    percent: boolean,
  ) => {
    const limit = Math.max(floor, Math.abs(before) * share);
    const delta = after - before;
    if (Math.abs(delta) <= limit) return;
    const up = delta > 0;
    moves.push({
      id,
      label,
      before,
      after,
      show,
      pct: pctChange(after, before),
      up,
      good: better === 'higher' ? up : !up,
      size: Math.abs(delta) / Math.max(limit, 1e-9),
      percent,
    });
  };

  METRICS.forEach((metric) => {
    const before = metric.read(previous, wasDone);
    const after = metric.read(current, nowDone);
    if (before === null || after === null) return;
    consider(metric.id, metric.label, before, after, metric.share, metric.floor, metric.better, metric.show, metric.percent);
  });

  // Subjects: the two that grew most and the two that fell most, by tasks
  // done. A subject has to move by 3 tasks and by 40% to be named.
  const count = (list: Task[]) => {
    const map = new Map<string, number>();
    list.forEach((task) => {
      if (task.subject) map.set(task.subject, (map.get(task.subject) ?? 0) + 1);
    });
    return map;
  };
  const nowBy = count(nowDone);
  const wasBy = count(wasDone);
  const subjects: TrackedMove[] = [];
  new Set([...nowBy.keys(), ...wasBy.keys()]).forEach((subject) => {
    const before = wasBy.get(subject) ?? 0;
    const after = nowBy.get(subject) ?? 0;
    const limit = Math.max(3, before * 0.4);
    const delta = after - before;
    if (Math.abs(delta) < limit) return;
    subjects.push({
      id: `subject:${subject}`,
      label: nameOf(subject),
      before,
      after,
      show: (value) => `${whole(value)} ${Math.round(value) === 1 ? 'task' : 'tasks'}`,
      pct: pctChange(after, before),
      up: delta > 0,
      good: delta > 0,
      size: Math.abs(delta) / limit,
      percent: true,
    });
  });
  const gains = subjects.filter((move) => move.up).sort((a, b) => b.size - a.size).slice(0, 2);
  const drops = subjects.filter((move) => !move.up).sort((a, b) => b.size - a.size).slice(0, 2);

  return [...moves.sort((a, b) => b.size - a.size), ...gains, ...drops];
}

/** One short sentence for a move: "Up 27%, from 980 XP to 1,240 XP." */
export function moveSentence(move: TrackedMove): string {
  const way = move.up ? 'Up' : 'Down';
  const range = `from ${move.show(move.before)} to ${move.show(move.after)}`;
  if (move.before === 0) return `New: ${move.show(move.after)}, from nothing.`;
  if (move.after === 0) return `Down to nothing, from ${move.show(move.before)}.`;
  if (move.pct === null || !move.percent) {
    return `${way} ${range}.`;
  }
  return `${way} ${Math.round(Math.abs(move.pct))}%, ${range}.`;
}

/** "Oct 18 to Oct 24", for the date line under a block. */
export function rangeLabel(from: string, to: string): string {
  const fmt = (iso: string) => {
    const at = Date.parse(`${iso}T00:00:00Z`);
    if (Number.isNaN(at)) return iso;
    return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };
  return `${fmt(from)} to ${fmt(to)}`;
}

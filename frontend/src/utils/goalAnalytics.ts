/**
 * Goal analytics — why a goal is moving at the rate it is.
 *
 * The health model next door says *whether* a goal is going to happen. This
 * says *why it is going the way it is*, which is a different job and the one
 * the Goals page cannot do without: a chip that says "At Risk" and stops has
 * told the reader something they mostly already felt.
 *
 * Everything here is counted off two things and nothing else: the tasks linked
 * to the goal, and the dates its checkpoints were reached. There is no model
 * and no estimate — every line a panel prints can be checked against the list
 * of tasks underneath it, which is what makes the page arguable.
 *
 * ## What this deliberately refuses to say
 *
 * **Hours spent on a goal.** Focus time in this app is recorded per day
 * (data/sql/focus.sql), not per task and not per goal, so "18.4 hours on this
 * goal this month" is a number nothing in the database supports. What is
 * counted instead is the work that *is* attributable — tasks finished and XP
 * earned against the goal — and the panels say so in those words. A plausible
 * figure with nothing behind it is worse than a smaller true one.
 */
import { goalNumbers } from '@/components/Goals/numbers';
import { atMidnight, evidenceFor, goalHealth, goalPace, type GoalHealth } from './goalHealth';
import type { Goal, Milestone, Task } from '@/types';
import { isoDate } from './dates';

const DAY = 86_400_000;

/** The two windows every "is it speeding up" reading compares. */
const WINDOW_DAYS = 14;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type Direction = 'accelerating' | 'steady' | 'slowing' | 'stalled';

export interface GoalReading {
  /** Which way the work on it is going, and by how much. */
  direction: Direction;
  /** Percent change between the two windows. Null when there is no baseline. */
  change: number | null;
  /** Tasks finished toward it in the recent window, and the one before. */
  now: number;
  before: number;
  /** Days out of the last fortnight with work on it. */
  activeDays: number;
  /** Every linked task, and the finished ones. */
  linked: number;
  finished: number;
  /** XP earned on tasks done for this goal. The one figure that is real. */
  xp: number;
  /** The weekday the goal gets the most work on, when one stands out. */
  bestDay: string | null;
  /** Share of goal work done at weekends, 0-1. Null with too little to say. */
  weekendShare: number | null;
}

/**
 * What the record says about how this goal is being worked on.
 *
 * `today` is a parameter for the same reason it is in goalHealth: the whole
 * file is then a pure function of its inputs and can be checked.
 */
/**
 * Readings remembered per evidence list and per day.
 *
 * A reading depends on the goal only through `evidenceFor`, and every counter
 * goal's evidence is the same whole-account array — so five counter goals
 * were five identical passes over every task, in each place the page asked.
 * Keyed by the day rather than the instant: every window below is a whole
 * number of days back from today, and a completion date is a midnight, so
 * the answer cannot change until the date does.
 */
const readingCache = new WeakMap<Task[], Map<string, GoalReading>>();

export function goalReading(goal: Goal, tasks: Task[], today: Date = new Date()): GoalReading {
  const linked = evidenceFor(goal, tasks);
  const dayKey = isoDate(today);
  const cached = readingCache.get(linked)?.get(dayKey);
  // A copy, so a caller that adjusts its reading cannot reach the next one's.
  if (cached) return { ...cached };
  const reading = readEvidence(linked, today);
  let byDay = readingCache.get(linked);
  if (!byDay) {
    byDay = new Map();
    readingCache.set(linked, byDay);
  }
  byDay.set(dayKey, reading);
  return { ...reading };
}

function readEvidence(linked: Task[], today: Date): GoalReading {
  const finished = linked.filter((task) => task.status === 'done' && task.completed_at);
  const now = today.getTime();

  // The shared, remembered parse — see `atMidnight` in ./goalHealth.
  const at = (task: Task) => atMidnight(String(task.completed_at));

  const inWindow = (task: Task, from: number, to: number) => {
    const time = at(task);
    return time !== null && time > now - to * DAY && time <= now - from * DAY;
  };

  const recent = finished.filter((task) => inWindow(task, 0, WINDOW_DAYS));
  const previous = finished.filter((task) => inWindow(task, WINDOW_DAYS, WINDOW_DAYS * 2));

  const change =
    previous.length > 0
      ? Math.round(((recent.length - previous.length) / previous.length) * 100)
      : null;

  // "Stalled" is its own answer rather than a large negative percentage:
  // nothing at all is a different state from less than before, and a goal that
  // has stopped is the single most useful thing this reading can report.
  const direction: Direction =
    recent.length === 0
      ? 'stalled'
      : change === null
        ? 'steady'
        : change >= 25
          ? 'accelerating'
          : change <= -25
            ? 'slowing'
            : 'steady';

  const days = new Set(
    recent.map((task) => String(task.completed_at).slice(0, 10)).filter(Boolean),
  );

  // Which weekday the work lands on. Only claimed when the goal has enough
  // finished tasks for a day to mean anything — with four tasks the "best
  // day" is whichever one two of them happened to fall on.
  const byWeekday = Array.from({ length: 7 }, () => 0);
  finished.forEach((task) => {
    const time = at(task);
    if (time === null) return;
    const index = new Date(time).getDay();
    byWeekday[index] = (byWeekday[index] ?? 0) + 1;
  });
  const peak = Math.max(...byWeekday);
  const leaders = byWeekday.filter((count) => count === peak).length;
  const bestDay =
    finished.length >= 8 && peak > 0 && leaders === 1
      ? WEEKDAYS[byWeekday.indexOf(peak)]!
      : null;

  const weekend = byWeekday[0]! + byWeekday[6]!;
  const weekendShare = finished.length >= 8 ? weekend / finished.length : null;

  return {
    direction,
    change,
    now: recent.length,
    before: previous.length,
    activeDays: days.size,
    linked: linked.length,
    finished: finished.length,
    xp: finished.reduce((sum, task) => sum + (Number(task.xp_value) || 0), 0),
    bestDay,
    weekendShare,
  };
}

/**
 * The checkpoint holding the goal up.
 *
 * The first one that is not done — which is the honest definition, because the
 * list is ordered by execution and everything after it is waiting on it. What
 * makes it a *bottleneck* rather than merely "next" is how long it has been
 * sitting there, so the age is reported with it and the page only calls it a
 * bottleneck when that age is worth naming.
 */
export interface Bottleneck {
  milestone: Milestone;
  /** Days since the checkpoint before it was reached, or since the goal began. */
  waitingDays: number | null;
  /** Linked tasks against it, and how many are finished. */
  tasks: number;
  done: number;
}

export function bottleneckOf(
  goal: Goal,
  tasks: Task[],
  today: Date = new Date(),
): Bottleneck | null {
  const rows = goal.milestones ?? [];
  const next = rows.find((row) => row.status !== 'done');
  if (!next) return null;

  // When the run at this checkpoint started: whichever came last, the goal's
  // own start or the moment the checkpoint before it was reached.
  const index = rows.indexOf(next);
  const previous = index > 0 ? rows[index - 1] : undefined;
  const since =
    previous?.completed_at ?? goal.start_date ?? goal.created_at;
  const at = new Date(`${String(since).slice(0, 10)}T00:00:00`).getTime();
  const waitingDays = Number.isNaN(at)
    ? null
    : Math.max(0, Math.round((today.getTime() - at) / DAY));

  const mine = tasks.filter((task) => task.milestone_id === next.id);
  return {
    milestone: next,
    waitingDays,
    tasks: mine.length,
    done: mine.filter((task) => task.status === 'done').length,
  };
}

// --------------------------------------------------------------------------
// What to do about it
// --------------------------------------------------------------------------
export interface GoalAction {
  id: string;
  /** The finding, in a sentence. */
  because: string;
  /** The instruction, in the imperative. */
  title: string;
  /** What pressing the button would change, in plain words. Null = read only. */
  effect: string | null;
  tone: 'urgent' | 'nudge' | 'good';
}

/**
 * A gap, in the largest unit that is still honest about it.
 *
 * It was always days, which is right up to a point and absurd past it: a goal
 * abandoned three years ago reported "Nothing finished in 1116 days", and a
 * four-digit number is something a reader has to do arithmetic on before it
 * means anything. Nobody converts 1116 into "about three years" in their head
 * while scanning a page; they read it as "a big number" and move on, which is
 * the same as not having been told.
 *
 * Months above eight weeks, years above eighteen months, and "days" below
 * that, where the exact count is the useful part — the difference between
 * eleven days and nineteen is a thing to act on, the difference between 1116
 * and 1124 is not.
 */
export function sinceWhen(days: number): string {
  if (days < 56) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 550) {
    const months = Math.round(days / 30.4);
    return `about ${months} month${months === 1 ? '' : 's'}`;
  }
  // Rounded to the half year: "over 3 years" and "over 3.5 years" are both
  // readings somebody can hold, and the half is the difference between a goal
  // abandoned last spring and one abandoned the spring before.
  const years = Math.round((days / 365.25) * 2) / 2;
  return `over ${years} years`;
}

/**
 * What this goal's own figures suggest doing, if anything.
 *
 * Every one is guarded by the numbers behind it, and the list is empty when
 * the goal is simply going well — a page that always has advice is a page
 * whose advice means nothing. Nothing here acts on its own: `effect` is what a
 * button would do and the page asks before it does it, because moving the date
 * on somebody's goal is not a thing to do quietly.
 */
export function goalActions(
  goal: Goal,
  tasks: Task[],
  today: Date = new Date(),
): GoalAction[] {
  const health = goalHealth(goal, tasks, today);
  const reading = goalReading(goal, tasks, today);
  const pace = goalPace(goal, today);
  const numbers = goalNumbers(goal);
  const out: GoalAction[] = [];

  if (goal.status === 'completed') return out;

  const { daysLeft, daysSinceWork } = health.signals;

  // Nothing is happening. First, because everything else is downstream of it.
  if (reading.direction === 'stalled' && reading.linked > 0) {
    out.push({
      id: 'stalled',
      because:
        daysSinceWork === null
          ? 'No task linked to this goal has ever been finished.'
          : `Nothing finished in ${sinceWhen(daysSinceWork)}, though ${reading.linked} task${reading.linked === 1 ? ' is' : 's are'} linked.`,
      title: 'Put one of its tasks on this week',
      effect: 'Opens the calendar on the next free block.',
      tone: 'urgent',
    });
  }

  if (reading.linked === 0) {
    out.push({
      id: 'unlinked',
      because:
        'No linked tasks, so nothing on your calendar counts toward it.',
      title: 'Link the work that belongs to it',
      effect: 'Nothing changes until you pick the tasks.',
      tone: 'nudge',
    });
  }

  // Behind the pace it needs, with the arithmetic attached.
  //
  // Not for a milestone goal. Checkpoints are lumpy and a rate of them is a
  // sentence nobody can act on — "raise the pace to 0.1 milestones a day" is
  // arithmetic pretending to be advice. The drift line below says the same
  // thing about the same goal in a unit that exists.
  if (
    numbers.measure !== 'milestones' &&
    pace.need !== null &&
    pace.have !== null &&
    pace.have > 0 &&
    pace.need > pace.have * 1.15
  ) {
    const unit = numbers.label || 'units';
    out.push({
      id: 'pace',
      because: `You are at ${round(pace.have)} ${unit} a day; the date needs ${round(pace.need)}.`,
      title: `Raise the pace to ${round(pace.need)} ${unit} a day`,
      effect: null,
      tone: daysLeft !== null && daysLeft < 30 ? 'urgent' : 'nudge',
    });
  }

  // The projection lands past the date. Offer the honest alternative rather
  // than only the heroic one.
  if (pace.drift !== null && pace.drift > 7) {
    out.push({
      id: 'drift',
      because: `At this rate it lands about ${pace.drift} days late.`,
      title: 'Move the target date, or cut the target',
      effect: 'Changes the goal. You confirm which, and by how much.',
      tone: 'nudge',
    });
  }

  const stuck = bottleneckOf(goal, tasks, today);
  if (stuck && stuck.waitingDays !== null && stuck.waitingDays >= 21) {
    out.push({
      id: 'bottleneck',
      because: `"${stuck.milestone.title}" has been the next checkpoint for ${stuck.waitingDays} days${stuck.tasks ? ` and ${stuck.done} of its ${stuck.tasks} tasks are done` : ' and has no tasks against it'}.`,
      title: 'Break this checkpoint into smaller ones',
      effect: 'Adds checkpoints. You write them.',
      tone: 'nudge',
    });
  }

  if (out.length === 0 && health.state === 'on-track' && reading.now > 0) {
    out.push({
      id: 'keep',
      because: `${reading.now} task${reading.now === 1 ? '' : 's'} finished toward this in the last fortnight, across ${reading.activeDays} day${reading.activeDays === 1 ? '' : 's'}.`,
      title: 'Nothing to change — keep going',
      effect: null,
      tone: 'good',
    });
  }

  return out;
}

function round(value: number): string {
  if (value >= 100) return Math.round(value).toLocaleString();
  if (value >= 10) return value.toFixed(0);
  return value.toFixed(1);
}

// --------------------------------------------------------------------------
// Across every goal — what the page opens with
// --------------------------------------------------------------------------
export interface GoalsOverview {
  active: number;
  onTrack: number;
  atRisk: number;
  offTrack: number;
  notStarted: number;
  /** Weighted mean progress across active goals, 0-100. */
  overall: number;
  /** Active goals with a date inside the next fortnight, soonest first. */
  dueSoon: Goal[];
  completed: number;
}

export function goalsOverview(
  goals: Goal[],
  tasks: Task[],
  today: Date = new Date(),
): GoalsOverview {
  const active = goals.filter((goal) => goal.status !== 'completed');
  const counts = { 'on-track': 0, 'at-risk': 0, 'off-track': 0, 'not-started': 0 };
  let weighted = 0;
  let weight = 0;

  active.forEach((goal) => {
    counts[goalHealth(goal, tasks, today).state] += 1;
    const w = Math.max(1, Math.min(10, Math.trunc(Number(goal.priority)) || 5));
    weighted += goalNumbers(goal).progress * w;
    weight += w;
  });

  const soon = active
    .filter((goal) => {
      const at = new Date(`${String(goal.deadline).slice(0, 10)}T00:00:00`).getTime();
      if (Number.isNaN(at)) return false;
      const days = (at - today.getTime()) / DAY;
      return days <= 14;
    })
    .sort((a, b) => (a.deadline < b.deadline ? -1 : 1));

  return {
    active: active.length,
    onTrack: counts['on-track'],
    atRisk: counts['at-risk'],
    offTrack: counts['off-track'],
    notStarted: counts['not-started'],
    overall: weight ? weighted / weight : 0,
    dueSoon: soon,
    completed: goals.length - active.length,
  };
}

export interface GoalNote {
  tone: 'good' | 'watch' | 'note';
  headline: string;
  hint: string;
  /** The goal it is about, so the card can open it. */
  goalId?: string;
}

/**
 * The page-level insight rows — the strongest goal, the worst bottleneck, the
 * one that has gone quiet.
 *
 * Same rule the analytics page follows: every row is guarded by the figures
 * behind it, and a quiet account gets fewer rows rather than vaguer ones.
 */
export function goalNotes(
  goals: Goal[],
  tasks: Task[],
  today: Date = new Date(),
): GoalNote[] {
  const active = goals.filter((goal) => goal.status !== 'completed');
  if (active.length === 0) return [];

  const readings = active.map((goal) => ({
    goal,
    reading: goalReading(goal, tasks, today),
    health: goalHealth(goal, tasks, today),
  }));
  const out: GoalNote[] = [];

  const strongest = [...readings].sort((a, b) => b.reading.now - a.reading.now)[0];
  if (strongest && strongest.reading.now > 0) {
    out.push({
      tone: 'good',
      goalId: strongest.goal.id,
      headline: `Strongest this fortnight: ${strongest.goal.title}`,
      hint: `${strongest.reading.now} task${strongest.reading.now === 1 ? '' : 's'} across ${strongest.reading.activeDays} day${strongest.reading.activeDays === 1 ? '' : 's'}`,
    });
  }

  const quiet = readings
    .filter((row) => row.health.signals.daysSinceWork !== null && row.health.signals.daysSinceWork >= 6)
    .sort((a, b) => (b.health.signals.daysSinceWork ?? 0) - (a.health.signals.daysSinceWork ?? 0))[0];
  if (quiet) {
    out.push({
      tone: 'watch',
      goalId: quiet.goal.id,
      headline: `Nothing on ${quiet.goal.title} for ${quiet.health.signals.daysSinceWork} days`,
      hint: 'Not behind yet. This is where goals go quiet for good.',
    });
  }

  const stuck = readings
    .map((row) => ({ row, stuck: bottleneckOf(row.goal, tasks, today) }))
    .filter((entry) => entry.stuck && (entry.stuck.waitingDays ?? 0) >= 14)
    .sort((a, b) => (b.stuck!.waitingDays ?? 0) - (a.stuck!.waitingDays ?? 0))[0];
  if (stuck?.stuck) {
    out.push({
      tone: 'watch',
      goalId: stuck.row.goal.id,
      headline: `Stuck on "${stuck.stuck.milestone.title}"`,
      hint: `Next checkpoint on ${stuck.row.goal.title} for ${stuck.stuck.waitingDays} days`,
    });
  }

  const ahead = readings
    .filter((row) => (row.health.signals.ahead ?? 0) > 0.1)
    .sort((a, b) => (b.health.signals.ahead ?? 0) - (a.health.signals.ahead ?? 0))[0];
  if (ahead) {
    out.push({
      tone: 'good',
      goalId: ahead.goal.id,
      headline: `Ahead of pace on ${ahead.goal.title}`,
      hint: `${Math.round(ahead.health.signals.progress * 100)}% done, ${Math.round((1 - (ahead.health.signals.expected ?? 0)) * 100)}% of the time left`,
    });
  }

  return out;
}

export type { GoalHealth };

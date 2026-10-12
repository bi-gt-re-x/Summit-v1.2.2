/**
 * The first things Analytics can say about somebody, from a handful of
 * activities.
 *
 * ## Why this exists
 *
 * The early stages of this page count and don't infer, and that is right for
 * trends and grades: a slope through two points is a guess. But an account's
 * first few days already hold more than totals. A focus sitting knows when it
 * ran, how long, whether it was paused and what task it was for. A finished
 * task knows when it was added, when it was done and whether it beat its date.
 * A goal knows how many of its steps are ticked. Each of those is a fact about
 * the person, true on day one, and none of them needs a second week to mean
 * something. This file reads them.
 *
 * ## The rules each read keeps
 *
 * - **A floor.** Nothing is said off one or two events. Each read names its
 *   own minimum (`FLOOR`) and returns nothing below it.
 * - **Its sample, out loud.** Every read carries `basis`, "from 4 sittings",
 *   so a claim off four events never sounds like one off forty.
 * - **What happened, never why.** No read explains, predicts or advises.
 *   Those are the Insights and Recommendations tabs, with far higher bars.
 * - **Only columns that exist.** Sittings (`Interval`, server-side since the
 *   log moved to `/api/focus/sittings`), tasks, goals. Nothing is estimated.
 *
 * Pure: the clock comes in as `now`, so the arithmetic is testable on its own
 * (reads.test.ts).
 */
import type { Interval } from '@/components/Timer/intervals';
import type { Goal, Task } from '@/types';

export interface Read {
  id: string;
  /** A few words, for the read's label. */
  label: string;
  /** The sentence itself. */
  text: string;
  /** What it rests on: "from 4 sittings". */
  basis: string;
  /** How much it is worth showing first. Bigger samples and sharper reads win. */
  weight: number;
}

/** The fewest events each kind of read will speak from. */
export const FLOOR = { sittings: 3, events: 4, tasks: 3, rated: 3, tagged: 2 } as const;

/** How many reads the panel shows. A list of twelve is a report, not a read. */
export const SHOWN = 4;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

type Part = 'morning' | 'afternoon' | 'evening' | 'night';
const PART_SPAN: Record<Part, string> = {
  morning: 'before noon',
  afternoon: 'between noon and 5pm',
  evening: 'between 5 and 10pm',
  night: 'after 10pm',
};
function partOf(hour: number): Part {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

/** A stored timestamp as a Date, or null. Bare ISO without a zone is local. */
function at(value: string | undefined | null): Date | null {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// ---------------------------------------------------------------------------
// The reads
// ---------------------------------------------------------------------------
/** How cleanly the sittings run. */
function cleanSittings(sittings: Interval[]): Read | null {
  if (sittings.length < FLOOR.sittings) return null;
  const unbroken = sittings.filter((row) => row.pauses === 0 && row.finished).length;
  const share = unbroken / sittings.length;
  const basis = `from ${plural(sittings.length, 'sitting')}`;
  if (share >= 0.5) {
    return {
      id: 'clean',
      label: 'Focus',
      text: unbroken === sittings.length
        ? `All ${sittings.length} of your focus sittings ran start to finish without a pause.`
        : `${unbroken} of your ${sittings.length} focus sittings ran start to finish without a pause.`,
      basis,
      weight: sittings.length * (0.6 + share),
    };
  }
  const firsts = sittings.map((row) => row.breaks?.[0]).filter((minute): minute is number => typeof minute === 'number');
  const when = firsts.length >= 2 ? ` The first pause usually comes around minute ${Math.round(median(firsts))}.` : '';
  return {
    id: 'clean',
    label: 'Focus',
    text: `${sittings.length - unbroken} of your ${sittings.length} sittings got paused or cut short.${when}`,
    basis,
    weight: sittings.length * (0.6 + (1 - share)),
  };
}

/** When in the day the work happens. */
function timeOfDay(sittings: Interval[], tasks: Task[]): Read | null {
  const hours = [
    ...sittings.filter((row) => row.at).map((row) => new Date(row.at!).getHours()),
    ...tasks.map((task) => (task.status === 'done' ? at(task.completed_at) : null))
      .filter((date): date is Date => date !== null)
      .map((date) => date.getHours()),
  ];
  if (hours.length < FLOOR.events) return null;
  const counts = new Map<Part, number>();
  hours.forEach((hour) => counts.set(partOf(hour), (counts.get(partOf(hour)) ?? 0) + 1));
  const [part, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  // Only when one part of the day clearly leads. An even spread is not a read.
  if (count / hours.length < 0.5) return null;
  return {
    id: 'time',
    label: 'Your hours',
    text: count === hours.length
      ? `You do your work in the ${part}: all ${hours.length} of your sittings and finished tasks landed ${PART_SPAN[part]}.`
      : `You do most of your work in the ${part}: ${count} of ${hours.length} sittings and finished tasks landed ${PART_SPAN[part]}.`,
    basis: `from ${hours.length} ${hours.length === 1 ? 'activity' : 'activities'}`,
    weight: hours.length * (count / hours.length),
  };
}

/** Whether tasks get finished during a sitting. */
function finishedInFocus(sittings: Interval[], tasks: Task[]): Read | null {
  const done = tasks.filter((task) => task.status === 'done' && at(task.completed_at));
  const timed = sittings.filter((row) => row.at);
  if (done.length < FLOOR.tasks || timed.length < 2) return null;
  const inside = done.filter((task) => {
    const when = at(task.completed_at)!.getTime();
    return timed.some((row) => when >= row.at! - row.minutes * 60_000 && when <= row.at!);
  }).length;
  if (inside === 0) return null;
  return {
    id: 'in-focus',
    label: 'Focus pays off',
    text: inside === done.length
      ? `All ${done.length} of your finished tasks were wrapped up during a focus sitting.`
      : `${inside} of your ${done.length} finished tasks were wrapped up during a focus sitting.`,
    basis: `from ${plural(done.length, 'task')} and ${plural(timed.length, 'sitting')}`,
    weight: done.length * (0.5 + inside / done.length),
  };
}

/** How long tasks wait between being added and being done. */
function leadTime(tasks: Task[]): Read | null {
  const waits = tasks
    .filter((task) => task.status === 'done')
    .map((task) => {
      const made = at(task.created_at);
      const done = at(task.completed_at);
      return made && done && done >= made ? (done.getTime() - made.getTime()) / 86_400_000 : null;
    })
    .filter((days): days is number => days !== null);
  if (waits.length < FLOOR.tasks) return null;
  const typical = median(waits);
  const text = typical < 1
    ? `You usually finish a task the same day you add it.`
    : `You usually finish a task about ${plural(Math.round(typical), 'day')} after adding it.`;
  return { id: 'lead', label: 'Pace', text, basis: `from ${plural(waits.length, 'finished task')}`, weight: waits.length * 0.9 };
}

/** Due dates kept. */
function deadlines(tasks: Task[]): Read | null {
  const dated = tasks.filter((task) => typeof task.met_deadline === 'boolean');
  if (dated.length < FLOOR.tasks) return null;
  const met = dated.filter((task) => task.met_deadline).length;
  return {
    id: 'deadlines',
    label: 'Due dates',
    text: met === dated.length
      ? `You've beaten every due date so far, all ${dated.length} of them.`
      : `You've beaten ${met} of ${dated.length} due dates so far.`,
    basis: `from ${plural(dated.length, 'dated task')}`,
    weight: dated.length * (met === dated.length ? 1.3 : 1),
  };
}

/** Where the focus time went, by task. */
function focusTarget(sittings: Interval[]): Read | null {
  const tagged = sittings.filter((row) => row.taskId);
  if (tagged.length < FLOOR.tagged) return null;
  const byTask = new Map<string, { title: string; minutes: number }>();
  tagged.forEach((row) => {
    const entry = byTask.get(row.taskId!) ?? { title: row.taskTitle ?? 'one task', minutes: 0 };
    entry.minutes += row.minutes;
    byTask.set(row.taskId!, entry);
  });
  const total = sittings.reduce((sum, row) => sum + row.minutes, 0);
  const top = [...byTask.values()].sort((a, b) => b.minutes - a.minutes)[0]!;
  if (!total || top.minutes / total < 0.3) return null;
  return {
    id: 'focus-target',
    label: 'Where focus went',
    text: `Most of your focus went to ${top.title}: ${top.minutes} of ${total} minutes.`,
    basis: `from ${plural(sittings.length, 'sitting')}`,
    weight: tagged.length * 1.1,
  };
}

/** How the rated work went. */
function rated(tasks: Task[]): Read | null {
  const rows = tasks.filter((task) => typeof task.difficulty === 'number' && typeof task.execution === 'number');
  if (rows.length < FLOOR.rated) return null;
  const hard = rows.filter((task) => task.difficulty! >= 4);
  const average = rows.reduce((sum, task) => sum + task.execution!, 0) / rows.length;
  if (hard.length >= 2) {
    const hardAvg = hard.reduce((sum, task) => sum + task.execution!, 0) / hard.length;
    return {
      id: 'rated',
      label: 'Hard tasks',
      text: hardAvg >= 3.5
        ? `Your hard tasks still went well: ${hardAvg.toFixed(1)} of 5 on the ${hard.length} you rated tough.`
        : `Your hard tasks are where it gets rough: ${hardAvg.toFixed(1)} of 5 on the ${hard.length} you rated tough.`,
      basis: `from ${plural(rows.length, 'rated task')}`,
      weight: rows.length * 1.2,
    };
  }
  return {
    id: 'rated',
    label: 'How it went',
    text: `On the tasks you rated, the work went ${average >= 3.5 ? 'well' : average >= 2.5 ? 'okay' : 'rough'}: ${average.toFixed(1)} of 5 on average.`,
    basis: `from ${plural(rows.length, 'rated task')}`,
    weight: rows.length * 0.8,
  };
}

/** How far the goals have come, step by step. */
function goalSteps(goals: Goal[]): Read | null {
  const open = goals.filter((goal) => goal.status !== 'completed' || goal.needs_verify);
  const steps = open.flatMap((goal) => (goal.milestones ?? []).flatMap((stone) =>
    (stone.steps ?? []).filter((step) => !step.placeholder).map((step) => ({ goal, done: stone.status === 'done' || step.done }))));
  if (!steps.length) return null;
  const done = steps.filter((step) => step.done).length;
  if (done === 0) return null;
  const closest = [...open].sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))[0];
  const near = closest && (closest.progress ?? 0) >= 50 && (closest.progress ?? 0) < 100
    ? ` ${closest.title} is ${Math.round(closest.progress)}% of the way there.`
    : '';
  return {
    id: 'goals',
    label: 'Goals',
    text: `You've ticked ${done} of ${steps.length} steps across your goals.${near}`,
    basis: `from ${plural(open.length, 'goal')}`,
    weight: 3 + done * 0.5,
  };
}

/** Everything that clears its floor, strongest first, capped at `SHOWN`. */
export function firstReads(input: { tasks: Task[]; sittings: Interval[]; goals: Goal[] }): Read[] {
  const { tasks, sittings, goals } = input;
  return [
    cleanSittings(sittings),
    timeOfDay(sittings, tasks),
    finishedInFocus(sittings, tasks),
    leadTime(tasks),
    deadlines(tasks),
    focusTarget(sittings),
    rated(tasks),
    goalSteps(goals),
  ]
    .filter((read): read is Read => read !== null)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, SHOWN);
}

/**
 * How many more activities until the first read can appear, or 0.
 *
 * Counted as finished tasks plus sittings, against the smallest floor any
 * read has. It is what the empty panel says, so a new account knows exactly
 * what to do to get something back.
 */
export function readsToGo(tasks: Task[], sittings: Interval[]): number {
  const done = tasks.filter((task) => task.status === 'done').length;
  return Math.max(0, FLOOR.sittings - Math.max(sittings.length, done));
}

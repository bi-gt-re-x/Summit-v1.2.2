/**
 * One whole account, made of arithmetic rather than of luck.
 *
 * The analytics model turns three responses into about eighty figures, and
 * until now nothing drove it end to end: `utils/*` are unit-tested one function
 * at a time, and the tab tests are given a *fake* model, so the assembly — the
 * seventy-nine memos, the window slicing, the two windows that deliberately
 * differ — was the one part with no test at all. The stated reason was that
 * driving the real thing "would mean fabricating a year of day series to move
 * one number". This is that year, fabricated once.
 *
 * ## Why the shape is what it is
 *
 * Every figure here has to be predictable by hand, or the test that reads it
 * can only compare the model against itself. So the account is built out of two
 * rules and nothing else:
 *
 *   * **Four days on, one day off, forever.** `index % 5 !== 4`. Over any run
 *     that starts on a multiple of five and lasts a multiple of five days, the
 *     active count is exactly four fifths of it — no drift, no weekends to
 *     reason about, no calendar arithmetic in the assertions.
 *   * **A step change at the window edge.** Days before `STEP` earn `BEFORE` XP
 *     and days after it earn `AFTER`. That makes every "vs the previous period"
 *     figure on the page a number the test can state as a literal, and it is
 *     the one thing a flat account cannot check: a model that quietly compared
 *     a period against itself would pass every assertion about totals.
 *
 * `TOTAL` is 750 and not 730, and that matters. `sliceWindow` counts back from
 * the end, so a one-year window over exactly 730 days leaves a previous period
 * of 365 that begins on day zero — which is fine until a panel asks what came
 * before *that* and gets an empty array. Twenty days of headroom means every
 * window on the picker has a real period behind it.
 *
 * ## What this is not
 *
 * Not a fixture for the tab tests — those are given figures directly and should
 * stay that way (see ./tabs/fixtures). This is for testing the thing that
 * *produces* figures, and it is deliberately the only place in the suite that
 * knows how a real account is shaped.
 */
import { DEFAULTS } from '@/services/settings';
import type { Goal, GrowthDay, Ratings, Task } from '@/types';
import type { Prefs } from '@/services/settings';
import type { MetricPoint } from '@/services/analytics';

/** The last day of the series. Fixed, so nothing here depends on the clock. */
export const TODAY = '2026-09-05';

/** Days in the series. See the note above for why it is not 730. */
export const TOTAL = 750;

/** The day the account got better, as an index. Exactly one year back. */
export const STEP = TOTAL - 365;

/** XP on an active day, before and after the step. */
export const BEFORE = 100;
export const AFTER = 150;

/** Tasks finished on an active day, either side of the step. */
export const PER_DAY = 2;

/** Four on, one off. */
export const CYCLE = 5;
export const OFF = 4;

/** The subjects the work is spread across, round robin. */
export const SUBJECTS = ['maths', 'code', 'physics', 'music'];

/** Whether the account worked on this index. */
export function worked(index: number): boolean {
  return index % CYCLE !== OFF;
}

/** Active days in a run of indices, `[from, to)`. */
export function activeBetween(from: number, to: number): number {
  let count = 0;
  for (let index = from; index < to; index += 1) if (worked(index)) count += 1;
  return count;
}

/** The ISO day at an index, counting forward to `TODAY` at `TOTAL - 1`. */
export function dayAt(index: number): string {
  const at = new Date(`${TODAY}T00:00:00`);
  at.setDate(at.getDate() - (TOTAL - 1 - index));
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(
    at.getDate(),
  ).padStart(2, '0')}`;
}

/** XP earned on an index — 0 on a day off. */
export function xpAt(index: number): number {
  if (!worked(index)) return 0;
  return index < STEP ? BEFORE : AFTER;
}

// --------------------------------------------------------------------------
// The day series
// --------------------------------------------------------------------------
export function seedDays(): GrowthDay[] {
  let xp = 0;
  let focus = 0;
  return Array.from({ length: TOTAL }, (_, index) => {
    const earned = xpAt(index);
    const tasks = worked(index) ? PER_DAY : 0;
    const minutes = worked(index) ? 45 : 0;
    xp += earned;
    focus += minutes;
    return {
      date: dayAt(index),
      day_number: index + 1,
      xp_earned: earned,
      tasks_completed: tasks,
      cumulative_xp: xp,
      avg_task_xp: tasks > 0 ? earned / tasks : 0,
      focus_minutes: minutes,
      cumulative_focus_minutes: focus,
      /* Every other active day carries ratings. `rated_tasks` is the field the
         page branches on — a quality_score of 0 with rated_tasks 0 means nobody
         said, and must never be averaged in as if it meant bad work. */
      rated_tasks: worked(index) && index % 2 === 0 ? PER_DAY : 0,
      quality_score: worked(index) && index % 2 === 0 ? 12 : 0,
      avg_difficulty: worked(index) && index % 2 === 0 ? 3 : 0,
      avg_execution: worked(index) && index % 2 === 0 ? 4 : 0,
    };
  });
}

// --------------------------------------------------------------------------
// The tasks
// --------------------------------------------------------------------------
/**
 * Two finished tasks per active day, plus a handful still open.
 *
 * The finished ones are the day series told a second way: the same count, the
 * same XP, on the same dates. That redundancy is the point — several panels
 * count tasks and several count days, and a model that read one where it meant
 * the other would agree with itself on a flat account and disagree here.
 *
 * The open ones exist for the plan and the overdue findings, which are the only
 * parts of this page that look at work that has not happened.
 */
export function seedTasks(): Task[] {
  const out: Task[] = [];
  let n = 0;

  for (let index = 0; index < TOTAL; index += 1) {
    if (!worked(index)) continue;
    const date = dayAt(index);
    const each = xpAt(index) / PER_DAY;
    for (let slot = 0; slot < PER_DAY; slot += 1) {
      n += 1;
      const rated = index % 2 === 0;
      out.push({
        id: `seed-${n}`,
        title: `Task ${n}`,
        status: 'done',
        priority: n % 3 === 0 ? 'high' : n % 3 === 1 ? 'medium' : 'low',
        xp_value: each,
        subject: SUBJECTS[n % SUBJECTS.length]!,
        created_at: `${date}T07:00:00`,
        // Spread across the working day so the clock and the week have a shape.
        completed_at: `${date}T${String(9 + slot * 4).padStart(2, '0')}:30:00`,
        completion_seconds: 1800 + (n % 5) * 300,
        met_deadline: n % 4 !== 0,
        ...(rated ? { difficulty: 3, execution: 4 } : {}),
      });
    }
  }

  /* Open work, dated around today: two overdue, two due today, four ahead. */
  for (let ahead = -2; ahead < 6; ahead += 1) {
    n += 1;
    const at = new Date(`${TODAY}T00:00:00`);
    at.setDate(at.getDate() + ahead);
    out.push({
      id: `seed-open-${n}`,
      title: `Open task ${n}`,
      status: 'todo',
      priority: ahead < 0 ? 'high' : 'medium',
      xp_value: 25,
      subject: SUBJECTS[n % SUBJECTS.length]!,
      created_at: `${dayAt(TOTAL - 10)}T09:00:00`,
      due_date: `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(
        at.getDate(),
      ).padStart(2, '0')}`,
    });
  }

  return out;
}

/** How many finished tasks the seed holds. Two per active day. */
export const FINISHED = activeBetween(0, TOTAL) * PER_DAY;

/** How many open ones. */
export const OPEN = 8;

// --------------------------------------------------------------------------
// The report card, the score log and the goals
// --------------------------------------------------------------------------
export function seedRatings(): Ratings {
  const base = { grade: 'B' as const, trend: { direction: 'up' as const, pct: 12 } };
  return {
    overall: { score: 72, message: 'Going well.', ...base },
    metrics: {
      productivity: { score: 78, avg_daily_xp: 120, ...base },
      quality: {
        score: 68,
        avg_task_xp: 60,
        basis: 'ratings',
        min_rated: 5,
        rated_tasks: 300,
        total_tasks: FINISHED,
        avg_quality: 12,
        avg_difficulty: 3,
        avg_execution: 4,
        max_quality: 25,
        ...base,
      },
      consistency: { score: 80, active_days: 292, total_days: 365, rate: 80, ...base },
      efficiency: { score: 66, avg_minutes: 34, on_time_pct: 75, has_timing: true, ...base },
      focus: { score: 70, focused_minutes: 13140, goal_minutes: 18000, pct_of_goal: 73, ...base },
    },
  };
}

/** Four dated readings, oldest first, out of 100. The last is not today's. */
export function seedScoreLog(): MetricPoint[] {
  return [
    { date: dayAt(TOTAL - 60), score: 58, grade: 'C' },
    { date: dayAt(TOTAL - 40), score: 63, grade: 'B' },
    { date: dayAt(TOTAL - 20), score: 66, grade: 'B' },
    { date: dayAt(TOTAL - 4), score: 72, grade: 'B' },
  ];
}

export function seedGoals(): Goal[] {
  const goal = (over: Partial<Goal>): Goal =>
    ({
      id: 'goal-1',
      user_id: 'seed',
      title: 'A goal',
      description: '',
      goal_type: 'xp',
      measure: 'xp',
      status: 'active',
      progress: 40,
      target_value: 10000,
      target_xp: 10000,
      current_xp: 4000,
      target_streak: 0,
      current_streak: 0,
      target_tasks: 0,
      current_tasks: 0,
      target_focus: 0,
      current_focus: 0,
      focus_baseline_seconds: 0,
      priority: 5,
      deadline: dayAt(TOTAL - 1),
      created_at: `${dayAt(TOTAL - 120)}T09:00:00`,
      ...over,
    }) as Goal;

  return [
    goal({ id: 'goal-1', title: 'Bank 10k XP', priority: 8 }),
    goal({
      id: 'goal-2',
      title: 'Finish 500 tasks',
      goal_type: 'tasks',
      target_tasks: 500,
      current_tasks: 460,
      progress: 92,
      priority: 3,
    }),
  ];
}

/** The preferences the model reads, at their defaults. */
export function seedPrefs(over: Partial<Prefs> = {}): Prefs {
  return { ...DEFAULTS, ...over };
}

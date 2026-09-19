/**
 * The year rollup, and the claim it supports.
 *
 * The cases below are built from the account this was written against — six
 * calendar years, the first and last of them partial — because the two things
 * most worth pinning are both properties of real data rather than of a shape:
 * that a partial year is never reported as a collapse, and that the sentence
 * about improvement cannot be produced by picking easier work.
 */
import { describe, expect, it } from 'vitest';
import { MIN_RATED, growthArc, growthYears } from './growthYears';
import type { GrowthDay, Task } from '@/types';

/** A day of the series. Only the fields the rollup reads. */
const day = (date: string, over: Partial<GrowthDay> = {}): GrowthDay =>
  ({
    date, day_number: 1, xp_earned: 0, tasks_completed: 0, cumulative_xp: 0,
    avg_task_xp: 0, focus_minutes: 0, cumulative_focus_minutes: 0,
    rated_tasks: 0, quality_score: 0, avg_difficulty: 0, avg_execution: 0,
    ...over,
  }) as GrowthDay;

/** Every day of a year, with the same figures on each. */
function year(y: number, opts: { from?: number; to?: number; xp?: number; tasks?: number; minutes?: number } = {}) {
  const days: GrowthDay[] = [];
  const from = opts.from ?? 1;
  const to = opts.to ?? 366; // the loop breaks on the year rolling over
  for (let n = from; n <= to; n += 1) {
    const at = new Date(Date.UTC(y, 0, n));
    if (at.getUTCFullYear() !== y) break;
    days.push(day(at.toISOString().slice(0, 10), {
      xp_earned: opts.xp ?? 0,
      tasks_completed: opts.tasks ?? 0,
      focus_minutes: opts.minutes ?? 0,
    }));
  }
  return days;
}

/**
 * `count` rated tasks whose means come out at the targets given.
 *
 * Integers, mixed across the two whole numbers either side of each target,
 * because that is the only thing a rating can be: the prompt after a task
 * offers five stars and a person picks one. An earlier version of this helper
 * put 2.8 on every task, which no account can contain — and it hid the fact
 * that `qualityOf` rounds each rating before multiplying, so the fixture was
 * testing arithmetic on values the app never sees.
 */
function ratedMix(y: number, count: number, difficulty: number, execution: number): Task[] {
  const split = (target: number) => {
    const low = Math.floor(target);
    const highs = Math.round((target - low) * count);
    return { low, highs };
  };
  const d = split(difficulty);
  const e = split(execution);
  return Array.from({ length: count }, (_, i) => ({
    id: `${y}-${i}`,
    title: 't',
    status: 'done',
    completed_at: `${y}-06-15T12:00:00`,
    difficulty: i < d.highs ? d.low + 1 : d.low,
    execution: i < e.highs ? e.low + 1 : e.low,
  }) as unknown as Task);
}

const rated = ratedMix;

describe('growthYears', () => {
  it('rolls the ledger up per calendar year', () => {
    const days = [...year(2024, { tasks: 2, xp: 20, minutes: 30 }), ...year(2025, { tasks: 3, xp: 30 })];
    const [a, b] = growthYears(days, []);

    expect(a!.year).toBe(2024);
    expect(a!.tasks).toBe(366 * 2); // 2024 is a leap year
    expect(a!.xp).toBe(366 * 20);
    expect(a!.focusHours).toBe((366 * 30) / 60);
    expect(b!.year).toBe(2025);
    expect(b!.tasks).toBe(365 * 3);
  });

  it('counts a day with only focus on it as active', () => {
    // An hour sat is work. A page about improvement that counted only
    // completions would read a week of reading as a week off.
    const days = [day('2025-01-01', { focus_minutes: 60 }), day('2025-01-02')];
    const [only] = growthYears(days, []);
    expect(only!.activeDays).toBe(1);
    expect(only!.tasks).toBe(0);
  });

  it('marks the first and last years partial, and no others', () => {
    const days = [
      ...year(2021, { from: 224, tasks: 1 }), // joined mid-August
      ...year(2022, { tasks: 1 }),
      ...year(2023, { from: 1, to: 200, tasks: 1 }), // still running
    ];
    const years = growthYears(days, []);
    expect(years.map((y) => y.partial)).toEqual([true, false, true]);
  });

  it('compares partial years on a rate, so a short year is not a collapse', () => {
    // The trap this exists to avoid: 2026 has eight months in it and fewer
    // total tasks than 2025, and is not a decline.
    const days = [
      ...year(2025, { tasks: 3 }),
      ...year(2026, { to: 200, tasks: 3 }),
    ];
    const [full, part] = growthYears(days, []);
    expect(part!.tasks).toBeLessThan(full!.tasks); // the total is genuinely lower
    expect(part!.tasksPerActiveDay).toBe(full!.tasksPerActiveDay); // the rate is not
  });

  it('reads ratings off the tasks, and reports them as a count not a share', () => {
    const days = year(2025, { tasks: 5 });
    const tasks = rated(2025, 30, 3, 4);
    const [only] = growthYears(days, tasks);
    expect(only!.rated).toBe(30);
    expect(only!.difficulty).toBe(3);
    expect(only!.execution).toBe(4);
    expect(only!.quality).toBe(12); // 3 x 4
    // The ledger's task count is a different population and is left alone.
    expect(only!.tasks).toBe(365 * 5);
  });

  it('averages difficulty over the tasks that carry both rows', () => {
    /*
     * The trap. A task rated for difficulty and not for execution is a real
     * row and belongs to a different population: on the account this was built
     * against, 2022 averages 3.45 over the 279 tasks with a difficulty and
     * 3.51 over the 242 with both. Only the second can be set beside an
     * execution figure and called the same work.
     */
    const both = ratedMix(2025, 10, 5, 3); // difficulty 5
    const halfRated = Array.from({ length: 10 }, (_, i) => ({
      id: `half-${i}`, title: 't', status: 'done',
      completed_at: '2025-06-15T12:00:00',
      difficulty: 1, // would drag the mean to 3 if it counted
      execution: undefined,
    }) as unknown as Task);

    const [only] = growthYears(year(2025, { tasks: 1 }), [...both, ...halfRated]);
    expect(only!.rated).toBe(10);
    expect(only!.difficulty).toBe(5); // not 3
  });

  it('leaves a year with nothing rated null rather than zero', () => {
    // Zero would draw as "rated badly" on a year nobody answered for.
    const [only] = growthYears(year(2025, { tasks: 1 }), []);
    expect(only!.difficulty).toBeNull();
    expect(only!.execution).toBeNull();
    expect(only!.rated).toBe(0);
  });

  it('keeps a year the account was present for but did nothing in', () => {
    const days = [...year(2024, { tasks: 1 }), ...year(2025), ...year(2026, { to: 100, tasks: 1 })];
    expect(growthYears(days, []).map((y) => y.year)).toEqual([2024, 2025, 2026]);
    expect(growthYears(days, [])[1]!.activeDays).toBe(0);
  });

  it('is empty on an empty series', () => {
    expect(growthYears([], [])).toEqual([]);
  });
});

describe('growthArc', () => {
  /** The real shape of the account this was written against. */
  const realish = () => {
    const days = [
      ...year(2021, { from: 224, tasks: 1 }),
      ...year(2025, { tasks: 3 }),
    ];
    const tasks = [...rated(2021, 76, 3.45, 2.8), ...rated(2025, 579, 3.33, 3.56)];
    return growthYears(days, tasks);
  };

  it('separates getting better from picking easier work', () => {
    const arc = growthArc(realish());
    expect(arc.kind).toBe('better');
    expect(arc.executionGain).toBeGreaterThan(0.5);
    expect(arc.sentence).toMatch(/with difficulty steady/);
    // Both figures are named, whichever leads.
    expect(arc.sentence).toMatch(/2\.8 to 3\.6|2\.8 to 3\.5/);
    expect(arc.headline).toBe('You got better at the work');
  });

  it('says so when a rising score came with easier work', () => {
    // The case the page does not get to omit. Execution up, difficulty down.
    const days = [...year(2024, { tasks: 1 }), ...year(2025, { tasks: 1 })];
    const tasks = [...rated(2024, 40, 4.2, 2.6), ...rated(2025, 40, 3.1, 3.6)];
    const arc = growthArc(growthYears(days, tasks));
    expect(arc.sentence).toMatch(/Some of that rise is easier work/);
    expect(arc.headline).toBe('Some of the rise is easier work');
  });

  it('credits holding steady on harder work', () => {
    const days = [...year(2024, { tasks: 1 }), ...year(2025, { tasks: 1 })];
    const tasks = [...rated(2024, 40, 2.5, 3.5), ...rated(2025, 40, 3.6, 3.5)];
    const arc = growthArc(growthYears(days, tasks));
    expect(arc.kind).toBe('harder');
    expect(arc.sentence).toMatch(/Harder work, held steady/);
    expect(arc.headline).toBe('Harder work, held steady');
  });

  it('gives the two readings of `harder` different headlines', () => {
    // The reason `headline` exists rather than being mapped from `kind` by
    // whoever prints it. One kind, two opposite pieces of news: a caller with
    // only the kind would have to re-derive the branch off `difficultyShift`.
    const days = [...year(2024, { tasks: 1 }), ...year(2025, { tasks: 1 })];
    const coped = growthArc(growthYears(days, [
      ...rated(2024, 40, 2.5, 3.5), ...rated(2025, 40, 3.6, 3.5),
    ]));
    const flattered = growthArc(growthYears(days, [
      ...rated(2024, 40, 4.2, 2.6), ...rated(2025, 40, 3.1, 3.6),
    ]));
    expect(coped.kind).toBe(flattered.kind);
    expect(coped.headline).not.toBe(flattered.headline);
  });

  it('leaves the headline null wherever the sentence is null', () => {
    // They are one claim at two lengths, so neither may stand without the
    // other — a tab printing a headline over no sentence would be a page
    // asserting in 30px type something it declined to explain.
    const thin = growthArc(growthYears(
      [...year(2024, { tasks: 1 }), ...year(2025, { tasks: 1 })],
      [...rated(2024, MIN_RATED - 1, 3, 2), ...rated(2025, 40, 3, 4)],
    ));
    expect(thin.sentence).toBeNull();
    expect(thin.headline).toBeNull();
  });

  it('refuses a claim on a year too thinly rated to anchor one', () => {
    const days = [...year(2024, { tasks: 1 }), ...year(2025, { tasks: 1 })];
    const tasks = [...rated(2024, MIN_RATED - 1, 3, 2), ...rated(2025, 40, 3, 4)];
    expect(growthArc(growthYears(days, tasks)).sentence).toBeNull();
  });

  it('refuses a claim with only one year to go on', () => {
    const arc = growthArc(growthYears(year(2025, { tasks: 1 }), rated(2025, 40, 3, 4)));
    expect(arc.kind).toBeNull();
    expect(arc.from).toBeNull();
  });
});

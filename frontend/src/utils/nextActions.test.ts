/**
 * The plan, and the three things that made it read the same every morning.
 *
 * `buildPlan` had no tests, which is how all three survived: none of them is a
 * crash, and every one of them produces a page that renders perfectly and says
 * less than it knows.
 *
 *   - the streak row fell through to "Close one small task" — a sentence
 *     pointing at nothing — for any account whose open work all carried dates.
 *   - the budget's remainder was thrown away. Thirty of forty-five minutes
 *     planned left fifteen, and five candidates under a fold that the panel
 *     described as "too long for 45 minutes".
 *   - every rule was about something going wrong, so a good week and a bad one
 *     produced the same shape of advice.
 *
 * The assertions are about the *shape* of the output rather than its wording,
 * except where the wording is the fix.
 */
import { describe, expect, it } from 'vitest';
import { buildPlan, type ActionKind } from './nextActions';
import type { GrowthDay, Goal, Task } from '@/types';

const NOW = new Date('2026-09-22T09:00:00');
const iso = (back: number) =>
  new Date(NOW.getTime() - back * 86_400_000).toISOString().slice(0, 10);

const task = (over: Partial<Task> = {}): Task =>
  ({
    id: `t-${Math.random().toString(36).slice(2, 9)}`,
    title: 'A task',
    status: 'open',
    xp_value: 50,
    ...over,
  }) as unknown as Task;

/** A finished task in `subject`, `back` days ago, rated `execution`. */
const done = (subject: string, back: number, execution = 4): Task =>
  task({
    status: 'done',
    subject,
    execution,
    completed_at: `${iso(back)}T12:00:00`,
    completion_seconds: 25 * 60,
  } as Partial<Task>);

/** The day series, newest last. `completed` days count as worked. */
const series = (completedOn: number[], span = 30): GrowthDay[] =>
  Array.from({ length: span }, (_, at) => {
    const back = span - 1 - at;
    return {
      date: iso(back),
      tasks_completed: completedOn.includes(back) ? 2 : 0,
      xp_earned: completedOn.includes(back) ? 60 : 0,
    } as unknown as GrowthDay;
  });

const plan = (over: {
  tasks?: Task[];
  goals?: Goal[];
  days?: GrowthDay[];
  budget?: number;
} = {}) =>
  buildPlan({
    tasks: over.tasks ?? [],
    goals: over.goals ?? [],
    days: over.days ?? series([]),
    nameOf: (id) => id,
    budget: over.budget ?? 45,
    now: NOW,
    stamp: '2026-W39',
  });

const kinds = (list: { kind: ActionKind }[]) => list.map((item) => item.kind);

describe('the streak row names something', () => {
  it('prefers an undated task, so a deadline is not spent on a streak', () => {
    const p = plan({
      tasks: [
        task({ title: 'Dated one', due_date: iso(-3), xp_value: 10 } as Partial<Task>),
        task({ title: 'Undated one', xp_value: 90 }),
      ],
    });
    const streak = p.actions.concat(p.more).find((a) => a.kind === 'streak')!;
    expect(streak.title).toBe('Close “Undated one”');
  });

  /* The bug this rule became known for: an account whose work all carries
     dates got a sentence pointing at nothing, every morning, for ever. */
  it('falls back to a dated task rather than to nobody', () => {
    const p = plan({
      tasks: [task({ title: 'Dated one', due_date: iso(-3) } as Partial<Task>)],
    });
    const streak = p.actions.concat(p.more).find((a) => a.kind === 'streak')!;
    expect(streak.title).toBe('Close “Dated one”');
    expect(streak.taskId).toBeTruthy();
  });

  it('still says something when there is genuinely no open task', () => {
    const p = plan({ tasks: [done('math', 2)] });
    const streak = p.actions.concat(p.more).find((a) => a.kind === 'streak')!;
    expect(streak.title).toBe('Close one small task');
    expect(streak.taskId).toBeUndefined();
  });

  it('counts the run it is asking you to carry', () => {
    // Worked on each of the three days before today; today is empty.
    const p = plan({ tasks: [task()], days: series([1, 2, 3]) });
    const streak = p.actions.concat(p.more).find((a) => a.kind === 'streak')!;
    expect(streak.because).toMatch(/3 days running/);
  });

  it('does not appear at all once the day has something in it', () => {
    const p = plan({ tasks: [task()], days: series([0]) });
    expect(kinds(p.actions.concat(p.more))).not.toContain('streak');
  });
});

describe('momentum — the one rule that is not a complaint', () => {
  const run = (days: number[]) => days.map((back) => done('violin', back));

  it('fires on a live run and names its length', () => {
    const p = plan({ tasks: [...run([0, 1, 2, 3]), ...run([9])], days: series([0]) });
    const item = p.actions.concat(p.more).find((a) => a.kind === 'momentum')!;
    expect(item.because).toMatch(/4 days running/);
    expect(item.subject).toBe('violin');
  });

  /* At nine in the morning nothing has been done today, and a rule that read
     that as a broken run would end every streak overnight. */
  it('counts a run that has not been fed yet today', () => {
    const p = plan({ tasks: run([1, 2, 3]), days: series([1, 2, 3]) });
    const item = p.actions.concat(p.more).find((a) => a.kind === 'momentum');
    expect(item?.because).toMatch(/3 days running/);
  });

  it('ignores a run that is over', () => {
    const p = plan({ tasks: run([4, 5, 6]), days: series([4, 5, 6]) });
    expect(kinds(p.actions.concat(p.more))).not.toContain('momentum');
  });

  it('is outranked by everything that is going wrong', () => {
    const p = plan({
      tasks: [
        ...run([0, 1, 2, 3]),
        task({ title: 'Late essay', due_date: iso(4) } as Partial<Task>),
      ],
      days: series([0]),
      budget: 120,
    });
    const order = kinds(p.actions);
    expect(order.indexOf('overdue')).toBeLessThan(order.indexOf('momentum'));
  });
});

describe('the budget is spent', () => {
  /* Thirty of forty-five used to be the end of it: the remaining fifteen were
     reported as spare while the candidates that wanted twenty sat under a
     fold headed "too long for 45 minutes". */
  it('trims the best leftover candidate into the time that remains', () => {
    const p = plan({
      tasks: [
        ...Array.from({ length: 6 }, (_, at) => done('maths', at + 1, 1)),
        ...Array.from({ length: 6 }, (_, at) => done('latin', at + 1, 5)),
        task({ title: 'Old thing', created_at: `${iso(40)}T09:00:00` } as Partial<Task>),
      ],
      budget: 45,
    });
    expect(p.planned).toBe(45);
    expect(p.spare).toBe(0);
    // Exactly one row may be a part-started one, and it is the last.
    const started = p.actions.filter((a) => /gets it started/.test(a.because));
    expect(started).toHaveLength(1);
    expect(p.actions[p.actions.length - 1]).toBe(started[0]);
  });

  it('answers a budget shorter than anything on the list', () => {
    const p = plan({
      tasks: [task({ title: 'Late essay', due_date: iso(4) } as Partial<Task>)],
      budget: 15,
    });
    expect(p.actions).toHaveLength(1);
    expect(p.actions[0]!.minutes).toBe(15);
    expect(p.actions[0]!.because).toMatch(/gets it started/);
  });

  it('leaves the remainder alone when there is nothing left to trim', () => {
    const p = plan({ tasks: [task()], budget: 120 });
    expect(p.more).toHaveLength(0);
    expect(p.spare).toBeGreaterThan(0);
  });

  it('never plans more than the budget', () => {
    for (const budget of [15, 30, 45, 60, 90, 120]) {
      const p = plan({
        tasks: [
          ...Array.from({ length: 8 }, (_, at) => done('maths', at + 1, 1)),
          task({ title: 'Late', due_date: iso(6) } as Partial<Task>),
          task({ title: 'Old', created_at: `${iso(40)}T09:00:00` } as Partial<Task>),
        ],
        budget,
      });
      expect(p.planned, `budget ${budget}`).toBeLessThanOrEqual(budget);
    }
  });
});

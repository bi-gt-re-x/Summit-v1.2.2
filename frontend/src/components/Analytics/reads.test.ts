/**
 * The first reads keep their floors, wear their samples, and say only what
 * the record holds.
 */
import { describe, expect, it } from 'vitest';
import type { Interval } from '@/components/Timer/intervals';
import type { Goal, Task } from '@/types';
import { FLOOR, SHOWN, firstReads, readsToGo } from './reads';

/** A local timestamp on 2026-10-12 at the given hour and minute. */
const on = (hour: number, minute = 0) => new Date(2026, 9, 12, hour, minute).getTime();
const iso = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
};

const sitting = (hour: number, over: Partial<Interval> = {}): Interval => ({
  id: `s-${hour}`, day: '2026-10-12', styleId: 'classic', planned: 25, minutes: 25, pauses: 0,
  finished: true, at: on(hour), ...over,
});
const task = (over: Partial<Task> = {}): Task => ({
  id: Math.random().toString(36), title: 't', priority: 'low', status: 'done', xp_value: 10,
  created_at: iso(on(9)), completed_at: iso(on(15)), ...over,
} as Task);

const read = (reads: ReturnType<typeof firstReads>, id: string) => reads.find((entry) => entry.id === id);

describe('floors', () => {
  it('says nothing off three activities', () => {
    expect(firstReads({ tasks: [task(), task()], sittings: [sitting(14)], goals: [] })).toEqual([]);
  });

  it('counts down to the first read', () => {
    expect(readsToGo([task()], [])).toBe(FLOOR.sittings - 1);
    expect(readsToGo([], [sitting(9), sitting(10), sitting(11)])).toBe(0);
  });

  it('never shows more than a handful', () => {
    const tasks = Array.from({ length: 6 }, (_, n) => task({
      met_deadline: true, difficulty: 4, execution: 4, completed_at: iso(on(14, n)),
    }));
    const sittings = [14, 15, 16].map((hour) => sitting(hour, { taskId: 't1', taskTitle: 'Revise integrals' }));
    expect(firstReads({ tasks, sittings, goals: [] }).length).toBeLessThanOrEqual(SHOWN);
  });
});

describe('the reads', () => {
  it('reads how cleanly the sittings run, with the sample', () => {
    const reads = firstReads({ tasks: [], sittings: [sitting(9), sitting(10), sitting(11, { pauses: 1, breaks: [12] })], goals: [] });
    expect(read(reads, 'clean')).toMatchObject({
      text: '2 of your 3 focus sessions ran start to finish with no pause.',
      basis: 'from 3 sessions',
    });
  });

  it('names where pauses start when most sittings get interrupted', () => {
    const sittings = [9, 10, 11].map((hour) => sitting(hour, { pauses: 1, breaks: [8] }));
    expect(read(firstReads({ tasks: [], sittings, goals: [] }), 'clean')!.text).toMatch(/around minute 8/);
  });

  it('finds the part of the day that clearly leads, and only then', () => {
    const afternoon = [13, 14, 15].map((hour) => sitting(hour));
    const reads = firstReads({ tasks: [task({ completed_at: iso(on(16)) })], sittings: afternoon, goals: [] });
    expect(read(reads, 'time')!.text).toBe(
      'You work in the afternoon. All 4 of your sessions and tasks happened between noon and 5pm.');
    const spread = [6, 13, 18, 23].map((hour) => sitting(hour));
    expect(read(firstReads({ tasks: [], sittings: spread, goals: [] }), 'time')).toBeUndefined();
  });

  it('counts tasks finished inside a session window only', () => {
    const sittings = [sitting(10), sitting(15)];
    const tasks = [
      task({ completed_at: iso(on(9, 50)) }), // inside the 9:35-10:00 sitting
      task({ completed_at: iso(on(14, 40)) }), // inside 14:35-15:00
      task({ completed_at: iso(on(15, 10)) }), // in the break after
    ];
    expect(read(firstReads({ tasks, sittings, goals: [] }), 'in-focus')!.text)
      .toBe('2 of your 3 finished tasks got done during a focus session.');
  });

  it('reads how long tasks wait and how due dates go', () => {
    const tasks = [1, 2, 3].map((days) => task({
      created_at: iso(on(9) - days * 86_400_000), met_deadline: days < 3,
    }));
    const reads = firstReads({ tasks, sittings: [], goals: [] });
    expect(read(reads, 'lead')!.text).toBe('You usually finish a task about 2 days after adding it.');
    expect(read(reads, 'deadlines')!.text).toBe("You've beaten 2 of 3 due dates so far.");
  });

  it('says where the focus went by task', () => {
    const sittings = [sitting(9, { taskId: 'a', taskTitle: 'Revise integrals', minutes: 50 }), sitting(10, { taskId: 'a', taskTitle: 'Revise integrals' }), sitting(11, { taskId: 'b', taskTitle: 'Essay' })];
    expect(read(firstReads({ tasks: [], sittings, goals: [] }), 'focus-target')!.text)
      .toBe('Most of your focus went to Revise integrals: 75 of 100 minutes.');
  });

  it('reads hard rated tasks only when there are two of them', () => {
    const tasks = [task({ difficulty: 5, execution: 4 }), task({ difficulty: 4, execution: 5 }), task({ difficulty: 2, execution: 3 })];
    expect(read(firstReads({ tasks, sittings: [], goals: [] }), 'rated')!.text)
      .toBe('Your hard tasks still went well: 4.5 of 5 on the 2 you rated tough.');
  });

  it('counts goal steps, and names a goal past halfway', () => {
    const goal = {
      id: 'g', title: 'Ace calculus', status: 'active', progress: 62.5,
      milestones: [
        { status: 'done', steps: [{ title: 'a', done: true, placeholder: false }] },
        { status: 'active', steps: [{ title: 'b', done: true, placeholder: false }, { title: 'c', done: false, placeholder: false }, { title: '', done: false, placeholder: true }] },
      ],
    } as unknown as Goal;
    expect(read(firstReads({ tasks: [], sittings: [], goals: [goal] }), 'goals')!.text)
      .toBe("You've ticked 2 of 3 steps across your goals. Ace calculus is 63% of the way there.");
  });
});

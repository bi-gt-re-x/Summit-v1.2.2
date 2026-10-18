import { describe, expect, it } from 'vitest';
import { BALANCE_RULES, skillBalance, skillCards } from './growthSkills';
import type { Subject } from '@/services/subjects';
import type { Task } from '@/types';

const TODAY = '2026-10-18';
const subjects = new Map<string, Subject>([
  ['math', { id: 'math', name: 'Mathematics', label: 'Math', group: 'School' } as Subject],
  ['art', { id: 'art', name: 'Art', label: 'Art', group: 'Creative' } as Subject],
]);

function task(subject: string, day: string, extra: Partial<Task> = {}): Task {
  return { id: `${subject}-${day}-${Math.random()}`, title: 't', status: 'done', subject,
    completed_at: `${day}T10:00:00`, xp_value: 50, ...extra } as Task;
}

const values = (subject: string, tasks: Task[]) => {
  const card = skillCards(tasks, subjects, TODAY).find((one) => one.key === subject)!;
  return Object.fromEntries(skillBalance(card).map((axis) => [axis.key, axis.value]));
};

describe('Balance, on fixed scales', () => {
  it('scores each axis against its own fixed target', () => {
    const tasks = [
      // 10 tasks over 5 days in the last 30, rated 4 and 2.
      ...['2026-10-18', '2026-10-17', '2026-10-16', '2026-10-15', '2026-10-14'].flatMap((day) => [
        task('math', day, { difficulty: 4 }),
        task('math', day, { difficulty: 2 }),
      ]),
      // 10 more, months ago.
      ...Array.from({ length: 10 }, () => task('math', '2026-05-01')),
    ];
    const got = values('math', tasks);
    expect(got.knowledge).toBe(Math.round((20 / BALANCE_RULES.knowledgeTasks) * 100)); // 20
    expect(got.practice).toBe(50); // 10 of 20
    expect(got.consistency).toBe(17); // 5 of 30 days
    expect(got.difficulty).toBe(60); // mean 3 of 5
  });

  it("doesn't hand the biggest subject 100s for being the biggest", () => {
    const tasks = [task('math', '2026-10-18'), task('art', '2026-10-18')];
    const got = values('math', tasks);
    expect(got.knowledge).toBe(1);
    expect(got.practice).toBe(5);
    expect(got.difficulty).toBe(0); // nothing rated
  });

  it('caps at 100', () => {
    const tasks = Array.from({ length: 150 }, () => task('math', '2026-10-18', { difficulty: 5 }));
    const got = values('math', tasks);
    expect(got.knowledge).toBe(100);
    expect(got.practice).toBe(100);
    expect(got.difficulty).toBe(100);
  });
});

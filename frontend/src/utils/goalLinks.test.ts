/**
 * Reading which goals a task counts toward, as the server stored it.
 *
 * Step eight of the goal matcher: every goal figure on the Goals and Analytics
 * pages reads these, and none of them matches anything itself.
 */
import { describe, expect, it } from 'vitest';
import { countsToward, goalIdsOf, isGoalWork, tasksByGoal } from './goalLinks';
import { effortAgainstPriority, goalWorkShare } from './goalSuggest';
import { linkedTasks } from './goalVisuals';
import { rehydrate } from '@/services/analytics';
import type { Goal, Task } from '@/types';

const task = (id: string, over: Partial<Task> = {}) =>
  ({ id, title: id, status: 'done', priority: 'medium', xp_value: 5, created_at: '2026-09-01', ...over }) as Task;

describe('goalIdsOf', () => {
  it('reads the stored goals, strongest first', () => {
    expect(goalIdsOf({ goal_ids: ['violin', 'music'] })).toEqual(['violin', 'music']);
  });

  it('falls back to the hand-made link on a task the matcher has not reached', () => {
    expect(goalIdsOf({ goal_id: 'violin' })).toEqual(['violin']);
  });

  it('puts a hand-made link first even when the stored list has not caught up', () => {
    expect(goalIdsOf({ goal_id: 'mine', goal_ids: ['matched'] })).toEqual(['mine', 'matched']);
    expect(goalIdsOf({ goal_id: 'mine', goal_ids: ['mine', 'matched'] })).toEqual(['mine', 'matched']);
  });

  it('is empty for a task toward nothing, which is a valid answer', () => {
    expect(goalIdsOf({})).toEqual([]);
    expect(goalIdsOf({ goal_id: null, goal_ids: [] })).toEqual([]);
    expect(isGoalWork({})).toBe(false);
  });
});

describe('countsToward and tasksByGoal', () => {
  const tasks = [
    task('a', { goal_ids: ['amc8', 'counting'] }),
    task('b', { goal_id: 'amc8' }),
    task('c'),
  ];

  it('counts a task toward every goal it names, by either route', () => {
    expect(countsToward(tasks[0]!, 'counting')).toBe(true);
    expect(countsToward(tasks[1]!, 'amc8')).toBe(true);
    expect(countsToward(tasks[2]!, 'amc8')).toBe(false);
  });

  it('counts a task toward two goals once for each, in one pass', () => {
    const by = tasksByGoal(tasks);
    expect(by.get('amc8')?.map((t) => t.id)).toEqual(['a', 'b']);
    expect(by.get('counting')?.map((t) => t.id)).toEqual(['a']);
    expect(by.size).toBe(2);
  });
});

describe('the pages count matched work, not only hand-linked work', () => {
  const goal = (id: string, priority = 5) =>
    ({ id, title: id, status: 'active', priority, milestones: [] }) as unknown as Goal;

  it('a goal card sees the tasks matched to it', () => {
    const tasks = [task('matched', { goal_ids: ['violin'] }), task('linked', { goal_id: 'violin' }), task('other')];
    expect(linkedTasks(goal('violin'), tasks).map((t) => t.id)).toEqual(['matched', 'linked']);
  });

  it('the goal-aimed share counts matched work', () => {
    const tasks = [task('m', { goal_ids: ['violin'] }), task('x'), task('y'), task('z')];
    expect(goalWorkShare(tasks)).toEqual({ share: 0.25, aimed: 1, total: 4 });
  });

  it('effort per goal counts a task toward two goals for both', () => {
    const rows = effortAgainstPriority(
      [goal('amc8'), goal('counting')],
      [task('a', { goal_ids: ['amc8', 'counting'] }), task('b', { goal_ids: ['amc8'] })],
    );
    const finished = Object.fromEntries(rows.map((row) => [row.id, row.finished]));
    expect(finished).toEqual({ amc8: 2, counting: 1 });
  });
});

describe('rehydrate', () => {
  it('attaches the stored links to the rows they name, and nowhere else', () => {
    const tasks = rehydrate({
      fields: ['id', 'title', 'goal_id'],
      rows: [['1', 'Violin lesson', null], ['2', 'Lift', null], ['3', 'Scales', 'violin']],
      goal_links: { '1': ['violin'], '3': ['violin'] },
    });
    expect(tasks[0]).toEqual({ id: '1', title: 'Violin lesson', goal_ids: ['violin'] });
    expect(tasks[1]).toEqual({ id: '2', title: 'Lift' });
    expect(tasks[2]!.goal_ids).toEqual(['violin']);
  });

  it('reads an older reply with no links as tasks with none', () => {
    const tasks = rehydrate({ fields: ['id'], rows: [['1']] });
    expect(tasks).toEqual([{ id: '1' }]);
  });
});

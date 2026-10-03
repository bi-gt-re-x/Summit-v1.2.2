/**
 * Goal health: three states, each decided by a rule a reader can check.
 *
 * Behind means past its date, more than ten points behind the calendar, or
 * linked work that has gone quiet for a fortnight. Everything else that has
 * started is on track. The sentence under the chip names the rule that fired,
 * so the cases below pin the sentence as well as the state.
 *
 * `systemHealth` is the same answer for the whole set, for the top of the
 * Stats tab: behind if any one goal is.
 */
import { describe, expect, it } from 'vitest';
import { goalHealth, systemHealth } from './goalHealth';
import type { Goal, Task } from '@/types';

function day(offset: number): string {
  const at = new Date();
  at.setDate(at.getDate() + offset);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g-1',
    title: 'Qualify for AIME',
    status: 'active',
    category: 'math',
    measure: 'number',
    unit: 'points',
    target_number: 100,
    current_value: 50,
    priority: 5,
    start_date: day(-30),
    created_at: `${day(-30)}T09:00:00`,
    deadline: day(30),
    milestones: [],
    ...over,
  } as unknown as Goal;
}

/** `n` finished tasks against the goal, one on each of the last `n` days. */
const worked = (n: number, goalId = 'g-1'): Task[] =>
  Array.from({ length: n }, (_, at) =>
    ({
      id: `t-${goalId}-${at}`,
      user_id: 'user-1',
      title: 'Practice set',
      description: '',
      priority: 'low',
      status: 'done',
      xp_value: 20,
      goal_id: goalId,
      created_at: `${day(-at - 1)}T09:00:00`,
      completed_at: `${day(-at)}T10:00:00`,
    }) as unknown as Task,
  );

/** One finished task against the goal, `daysAgo` days ago. */
const workedOn = (daysAgo: number, goalId = 'g-1'): Task[] => [
  {
    id: `t-${goalId}-old`,
    user_id: 'user-1',
    title: 'Practice set',
    description: '',
    priority: 'low',
    status: 'done',
    xp_value: 20,
    goal_id: goalId,
    created_at: `${day(-daysAgo - 1)}T09:00:00`,
    completed_at: `${day(-daysAgo)}T10:00:00`,
  } as unknown as Task,
];

describe('one goal', () => {
  it('is on track when it is keeping pace and being worked', () => {
    const health = goalHealth(goal(), worked(3));
    expect(health.state).toBe('on-track');
    expect(health.label).toBe('On Track');
    expect(health.reason).toMatch(/worked on 3 times in the last fortnight/);
  });

  it('is behind when it trails the calendar by more than ten points', () => {
    // Halfway through its time and a fifth of the way there.
    const health = goalHealth(goal({ current_value: 20 }), worked(3));
    expect(health.state).toBe('behind');
    expect(health.reason).toMatch(/^30 points behind where the calendar says it should be/);
  });

  it('is not behind for trailing by less than that', () => {
    expect(goalHealth(goal({ current_value: 45 }), worked(3)).state).toBe('on-track');
  });

  it('is behind once its date has passed', () => {
    const health = goalHealth(goal({ deadline: day(-2) }), worked(3));
    expect(health.state).toBe('behind');
    expect(health.reason).toBe('Its date passed 2 days ago and it is 50% done.');
  });

  it('is behind when its linked work has gone quiet for a fortnight', () => {
    const health = goalHealth(goal(), workedOn(20));
    expect(health.state).toBe('behind');
    expect(health.reason).toBe('Nothing done toward this in 20 days.');
  });

  it('is not called quiet when nothing was ever linked to it', () => {
    // No deadline and no linked task: no calendar to be behind and no record
    // to have gone quiet in.
    expect(goalHealth(goal({ deadline: '' }), []).state).toBe('on-track');
  });

  it('is not started, rather than failing, before anything is recorded', () => {
    const health = goalHealth(goal({ current_value: 0 }), []);
    expect(health.state).toBe('not-started');
    expect(health.label).toBe('Not Started');
  });

  it('reads a reached goal as complete', () => {
    expect(goalHealth(goal({ status: 'completed' }), []).label).toBe('Complete');
  });
});

describe('the whole set of goals as one answer', () => {
  const healthy = goal({ id: 'g-1' });
  const trailing = goal({ id: 'g-2', current_value: 10 });

  it('is behind if any one goal is, and counts which', () => {
    const view = systemHealth([healthy, trailing], [...worked(3, 'g-1'), ...worked(3, 'g-2')]);
    expect(view.state).toBe('behind');
    expect(view.progressing).toBe(1);
    expect(view.needsAttention).toBe(1);
  });

  it('is on track when every goal is', () => {
    const view = systemHealth([healthy], worked(3, 'g-1'));
    expect(view.state).toBe('on-track');
    expect(view.needsAttention).toBe(0);
  });

  it('counts a completed goal out of the active set entirely', () => {
    const view = systemHealth([healthy, goal({ id: 'g-3', status: 'completed' })], worked(3, 'g-1'));
    expect(view.active).toBe(1);
  });

  it('reads a set nobody has started as not started, not as failing', () => {
    const view = systemHealth([goal({ current_value: 0 })], []);
    expect(view.state).toBe('not-started');
  });

  it('has an answer for an account with no goals at all', () => {
    const view = systemHealth([], []);
    expect(view.state).toBe('not-started');
    expect(view.active).toBe(0);
  });
});

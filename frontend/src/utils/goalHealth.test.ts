/**
 * Goal health is decided on the server — backend/tracking/goal_health.py, whose
 * tests pin the rule. What is left here is the reading and the tally.
 */
import { describe, expect, it } from 'vitest';
import { goalHealth, goalPace, systemHealth } from './goalHealth';
import { goalHealth as reading } from '@/test/factories';
import type { Goal } from '@/types';

const goal = (id: string, over: Partial<Goal> = {}): Goal =>
  ({ id, title: id, status: 'active', ...over }) as unknown as Goal;

describe('one goal', () => {
  it('reads the server’s answer', () => {
    const health = reading('behind', 'Nothing done toward this in 20 days.');
    expect(goalHealth(goal('a', { health }))).toBe(health);
  });

  it('reads a goal the server has not seen yet as not started', () => {
    expect(goalHealth(goal('new')).state).toBe('not-started');
  });
});

describe('the whole set', () => {
  it('is behind if any one goal is, and counts which', () => {
    const view = systemHealth([
      goal('a', { health: reading('on-track') }),
      goal('b', { health: reading('behind') }),
    ]);
    expect(view.state).toBe('behind');
    expect(view.progressing).toBe(1);
    expect(view.needsAttention).toBe(1);
  });

  it('is on track when every goal is', () => {
    expect(systemHealth([goal('a', { health: reading('on-track') })]).state).toBe('on-track');
  });

  it('counts a completed goal out of the active set', () => {
    const view = systemHealth([
      goal('a', { health: reading('on-track') }),
      goal('b', { status: 'completed', health: reading('on-track') }),
    ]);
    expect(view.active).toBe(1);
  });

  it('reads a set nobody has started as not started, not as failing', () => {
    expect(systemHealth([goal('a', { health: reading('not-started') })]).state).toBe('not-started');
    expect(systemHealth([]).active).toBe(0);
  });
});

describe('the pace of a streak goal', () => {
  const today = new Date(2026, 9, 16);
  const streak = (over: Partial<Goal>) =>
    goal('s', { measure: 'streak', goal_type: 'streak', target_streak: 365, start_date: '2022-01-01', ...over } as Partial<Goal>);

  it('counts one day a day, not an average over the years since it was set', () => {
    const pace = goalPace(streak({ current_streak: 1, deadline: '2027-10-15' }), today);
    expect(pace.lands).toBe('2027-10-15');
    expect(pace.drift).toBe(0);
  });

  it('says how late it lands when the days left are too few', () => {
    const pace = goalPace(streak({ current_streak: 1, deadline: '2027-01-01' }), today);
    expect(pace.drift).toBe(287);
    expect(pace.need).toBeNull();
  });
});

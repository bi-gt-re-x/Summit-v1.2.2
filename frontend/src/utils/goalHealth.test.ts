/**
 * Goal health is decided on the server — backend/tracking/goal_health.py, whose
 * tests pin the rule. What is left here is the reading and the tally.
 */
import { describe, expect, it } from 'vitest';
import { goalHealth, systemHealth } from './goalHealth';
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

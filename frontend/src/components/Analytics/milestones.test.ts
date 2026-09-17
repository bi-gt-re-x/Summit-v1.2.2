import { describe, expect, it } from 'vitest';
import { MILESTONES, milestonesAhead, nextMilestone, whyFor } from './milestones';
import { STAGE_FLOOR } from '@/utils/dataMaturity';
import { NEED_DAYS } from './useAnalyticsModel';

describe('the table', () => {
  it('is ascending, which nextAfter relies on', () => {
    const needs = MILESTONES.map((step) => step.need);
    expect(needs).toEqual([...needs].sort((a, b) => a - b));
  });

  it('names each threshold once', () => {
    const needs = MILESTONES.map((step) => step.need);
    expect(new Set(needs).size).toBe(needs.length);
  });

  it('covers every stage floor above zero', () => {
    const needs = new Set(MILESTONES.map((step) => step.need));
    Object.values(STAGE_FLOOR)
      .filter((floor) => floor > 0)
      .forEach((floor) => expect(needs.has(floor)).toBe(true));
  });

  it('covers every tab gate', () => {
    const needs = new Set(MILESTONES.map((step) => step.need));
    Object.values(NEED_DAYS).forEach((need) => expect(needs.has(need)).toBe(true));
  });

  it('gives every entry both a reason and a reward', () => {
    MILESTONES.forEach((step) => {
      expect(step.why.length).toBeGreaterThan(20);
      expect(step.reward.length).toBeGreaterThan(20);
      expect(step.title.length).toBeGreaterThan(0);
    });
  });
});

describe('nextMilestone', () => {
  it('is the first threshold above the count', () => {
    expect(nextMilestone(0)?.need).toBe(STAGE_FLOOR.early);
    expect(nextMilestone(3)?.need).toBe(STAGE_FLOOR.weekly);
    expect(nextMilestone(6)?.need).toBe(STAGE_FLOOR.weekly);
    expect(nextMilestone(7)?.need).toBe(STAGE_FLOOR.developing);
  });

  it('prefers the next thing that opens over the next stage', () => {
    /* At fifteen the next *stage* is `full` at thirty, but Habits opens at
       twenty-one — the whole reason the countdown reads this table. */
    expect(nextMilestone(15)?.need).toBe(NEED_DAYS.habits);
  });

  it('runs out at the top', () => {
    expect(nextMilestone(STAGE_FLOOR.full)).toBeNull();
    expect(nextMilestone(999)).toBeNull();
  });
});

describe('milestonesAhead', () => {
  it('drops what is already reached rather than ticking it', () => {
    const ahead = milestonesAhead(7);
    expect(ahead.every((step) => step.need > 7)).toBe(true);
    expect(ahead.map((step) => step.need)).not.toContain(STAGE_FLOOR.weekly);
  });

  it('is everything on a new account', () => {
    expect(milestonesAhead(0)).toHaveLength(MILESTONES.length);
  });

  it('is empty once they are all behind', () => {
    expect(milestonesAhead(999)).toEqual([]);
  });
});

describe('whyFor', () => {
  it('answers for a threshold that exists', () => {
    expect(whyFor(NEED_DAYS.insights)).toContain('two comparable stretches');
  });

  it('is empty rather than undefined for one that does not', () => {
    expect(whyFor(9999)).toBe('');
  });

  it('gives the gated tabs the same sentence the ladder shows', () => {
    const ladder = MILESTONES.find((step) => step.need === NEED_DAYS.habits);
    expect(whyFor(NEED_DAYS.habits)).toBe(ladder?.why);
  });
});

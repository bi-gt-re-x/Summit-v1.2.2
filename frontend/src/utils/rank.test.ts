/**
 * The rank bands: that they tile 1 to 100 with no gap and no overlap, and that
 * a level outside the table is clamped rather than left nameless.
 */
import { describe, expect, it } from 'vitest';
import { MAX_LEVEL, TIERS, rankFor, tierFor } from './rank';

describe('the tiers', () => {
  it('cover every level from 1 to 100, each exactly once', () => {
    // Written as a sweep rather than as a table of twenty-one assertions: a
    // gap or an overlap in the bands is the failure mode, and a sweep is the
    // only thing that sees one.
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      const matches = TIERS.filter((tier) => level >= tier.from && level <= tier.to);
      expect(matches).toHaveLength(1);
    }
  });

  it('run in order and butt up against each other', () => {
    TIERS.forEach((tier, index) => {
      expect(tier.to).toBeGreaterThanOrEqual(tier.from);
      if (index > 0) expect(tier.from).toBe(TIERS[index - 1]!.to + 1);
    });
  });

  it('start at 1 and end at the cap', () => {
    expect(TIERS[0]!.from).toBe(1);
    expect(TIERS[TIERS.length - 1]!.to).toBe(MAX_LEVEL);
  });

  it('keeps Eternal a band of exactly one', () => {
    const eternal = TIERS[TIERS.length - 1]!;
    expect(eternal).toEqual({ name: 'Eternal', from: 100, to: 100 });
    // Which is only possible because Grand Arbiter gives up a level for it.
    expect(TIERS[TIERS.length - 2]!).toMatchObject({ name: 'Grand Arbiter', from: 96 });
  });

  it('name a level by its band', () => {
    expect(rankFor(1)).toBe('Beginner');
    expect(rankFor(5)).toBe('Beginner');
    expect(rankFor(6)).toBe('Novice');
    expect(rankFor(100)).toBe('Eternal');
  });

  it('clamps a level outside the table rather than returning null', () => {
    expect(tierFor(-3)).toEqual(TIERS[0]);
    expect(tierFor(9999)).toEqual(TIERS[TIERS.length - 1]);
  });
});

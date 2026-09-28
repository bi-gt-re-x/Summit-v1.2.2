/**
 * The shape of a problem set: light first, heavy last, a third of it warm-up.
 *
 * The rule being pinned is the one a reader actually feels — a set must never
 * open on its hardest question, and must never end on its easiest. Everything
 * else here is arithmetic in service of that.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_PROBLEMS,
  MIN_PROBLEMS,
  bandsFor,
  countFor,
  slotsFor,
  type ProblemWeight,
} from './problemSet';

const weights = (minutes: number): ProblemWeight[] =>
  slotsFor({ minutes }).map((slot) => slot.weight);

describe('how many problems a step is owed', () => {
  it('scales with what the step costs', () => {
    expect(countFor({ minutes: 20 })).toBeGreaterThan(countFor({ minutes: 10 }));
  });

  it('never drops below a set that can show a slope', () => {
    expect(countFor({ minutes: 5 })).toBe(MIN_PROBLEMS);
  });

  it('never becomes a problem sheet', () => {
    expect(countFor({ minutes: 180 })).toBe(MAX_PROBLEMS);
  });
});

describe('the slope', () => {
  it('opens on a warm-up at every size', () => {
    for (const minutes of [5, 15, 25, 45, 90, 180]) {
      expect(weights(minutes)[0]).toBe('warmup');
    }
  });

  it('ends on a stretch at every size', () => {
    for (const minutes of [5, 15, 25, 45, 90, 180]) {
      const all = weights(minutes);
      expect(all[all.length - 1]).toBe('stretch');
    }
  });

  it('never gets easier as it goes', () => {
    const rank: Record<ProblemWeight, number> = { warmup: 0, core: 1, stretch: 2 };
    for (const minutes of [5, 15, 25, 45, 90, 180]) {
      const ranks = weights(minutes).map((weight) => rank[weight]);
      const sorted = [...ranks].sort((a, b) => a - b);
      expect(ranks).toEqual(sorted);
    }
  });

  it('gives roughly a third of the set to the warm-up', () => {
    for (const minutes of [15, 25, 45, 90, 180]) {
      const all = weights(minutes);
      const warm = all.filter((weight) => weight === 'warmup').length;
      // Rounded up, so a third is the floor rather than the target.
      expect(warm).toBeGreaterThanOrEqual(Math.floor(all.length / 3));
      expect(warm).toBeLessThanOrEqual(Math.ceil(all.length / 3));
    }
  });

  it('numbers the slots in the order they should be met', () => {
    expect(slotsFor({ minutes: 30 }).map((slot) => slot.index)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('shows all three bands on the smallest possible set', () => {
    expect(weights(5)).toEqual(['warmup', 'core', 'stretch']);
  });
});

describe('the bands', () => {
  it('come out in order and hold every slot between them', () => {
    const bands = bandsFor({ minutes: 45 });
    expect(bands.map((band) => band.weight)).toEqual(['warmup', 'core', 'stretch']);
    expect(bands.reduce((sum, band) => sum + band.slots.length, 0))
      .toBe(countFor({ minutes: 45 }));
  });

  it('never returns a band with nothing in it', () => {
    for (const minutes of [5, 10, 15, 25, 45, 90, 180]) {
      for (const band of bandsFor({ minutes })) {
        expect(band.slots.length).toBeGreaterThan(0);
      }
    }
  });
});

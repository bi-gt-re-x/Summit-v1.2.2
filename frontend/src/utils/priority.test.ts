/**
 * The XP bands, at their boundaries.
 *
 * This module exists because three places banded the same number differently.
 * A test that checks 90 is "Medium" would not have caught that; what would is
 * checking the exact edges, because every one of those disagreements was an
 * off-by-one at a boundary. The rule stated in the file is that the lower
 * bound belongs to its band — 40 is Light, not the top of Easy — so that is
 * what each pair of assertions below pins down.
 */
import { describe, expect, it } from 'vitest';
import {
  HARD_FROM,
  MAX_TASK_XP,
  MEDIUM_FROM,
  MIN_TASK_XP,
  XP_BANDS,
  xpToBand,
  xpToDifficulty,
  xpToPriority,
} from './priority';

describe('xpToBand', () => {
  it.each([
    [10, 'Easy'],
    [39, 'Easy'],
    [40, 'Light'],
    [79, 'Light'],
    [80, 'Medium'],
    [119, 'Medium'],
    [120, 'Intermediate+'],
    [159, 'Intermediate+'],
    [160, 'Hard'],
    [199, 'Hard'],
    [200, 'Very Challenging'],
    [250, 'Very Challenging'],
  ])('bands %i as %s', (xp, band) => {
    expect(xpToBand(xp)).toBe(band);
  });

  it('reads anything under the floor as the floor', () => {
    expect(xpToBand(0)).toBe('Easy');
    expect(xpToBand(-40)).toBe('Easy');
  });

  it('does not run out of names above the slider', () => {
    // Nothing in the app can set this, but a row read back from an older
    // database might, and a card that printed nothing would be worse.
    expect(xpToBand(9000)).toBe('Very Challenging');
  });

  it('is what xpToDifficulty prints — one scale, not two', () => {
    // The regression this guards: the cards drifting onto their own bands.
    [10, 40, 80, 120, 160, 200, 137].forEach((xp) => {
      expect(xpToDifficulty(xp)).toBe(xpToBand(xp));
    });
  });
});

describe('xpToPriority', () => {
  it.each([
    [10, 'low'],
    [79, 'low'],
    [80, 'medium'],
    [159, 'medium'],
    [160, 'high'],
    [250, 'high'],
  ])('stores %i as %s', (xp, priority) => {
    expect(xpToPriority(xp)).toBe(priority);
  });

  it('only ever returns one of the three the column allows', () => {
    // `tasks.priority` has a CHECK behind it, so a fourth value is a write
    // that fails at the database rather than in the app.
    const allowed = new Set(['low', 'medium', 'high']);
    for (let xp = -50; xp <= 400; xp += 1) {
      expect(allowed.has(xpToPriority(xp))).toBe(true);
    }
  });

  it('folds the six bands onto the three in pairs, without crossing', () => {
    // The two scales are related, not equal: each stored priority is exactly
    // two adjacent bands. If a band boundary moves without MEDIUM_FROM or
    // HARD_FROM moving with it, this is what notices.
    const pairs: Record<string, string[]> = { low: [], medium: [], high: [] };
    XP_BANDS.forEach((band) => pairs[xpToPriority(band.from)]!.push(band.label));

    expect(pairs).toEqual({
      low: ['Easy', 'Light'],
      medium: ['Medium', 'Intermediate+'],
      high: ['Hard', 'Very Challenging'],
    });
  });
});

describe('the constants the sliders run between', () => {
  it('start and end on a band boundary', () => {
    expect(MIN_TASK_XP).toBe(XP_BANDS[0]!.from);
    expect(xpToBand(MAX_TASK_XP)).toBe(XP_BANDS.at(-1)!.label);
  });

  it('put every band inside the range a task can be worth', () => {
    XP_BANDS.forEach((band) => {
      expect(band.from).toBeGreaterThanOrEqual(MIN_TASK_XP);
      expect(band.from).toBeLessThanOrEqual(MAX_TASK_XP);
    });
  });

  it('name the two fold points as bands rather than as loose numbers', () => {
    expect(XP_BANDS.map((band) => band.from)).toContain(MEDIUM_FROM);
    expect(XP_BANDS.map((band) => band.from)).toContain(HARD_FROM);
  });

  it('list the bands in ascending order — xpToBand relies on it', () => {
    const froms = XP_BANDS.map((band) => band.from);
    expect([...froms].sort((a, b) => a - b)).toEqual(froms);
  });
});

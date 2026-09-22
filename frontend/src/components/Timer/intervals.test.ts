/**
 * What the interval log is allowed to conclude, and when it must refuse.
 *
 * The refusals are the half worth pinning. A recommendation is a sentence about
 * somebody's concentration, and the failure mode of this arithmetic is not a
 * wrong number — it is a confident one drawn from an afternoon. Three intervals
 * at one length say what that person picked, not what suits them, so the
 * thresholds in components/Timer/intervals.ts exist to keep the page on its
 * ordinary picker until the record can actually answer.
 *
 * The scoring is pinned by ordering rather than by value: the property that
 * matters is that a full interrupted sitting beats half an uninterrupted one,
 * because the work that got done is the part that counts.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_INTERVALS,
  focusScore,
  isStyleLength,
  pace,
  recommend,
  tasksPerHour,
  type Interval,
} from './intervals';

function row(over: Partial<Interval> = {}): Interval {
  return {
    day: '2026-05-01',
    styleId: 'classic',
    planned: 25,
    minutes: 25,
    pauses: 0,
    finished: true,
    ...over,
  };
}

/** `count` identical intervals at one length. */
function many(count: number, over: Partial<Interval> = {}): Interval[] {
  return Array.from({ length: count }, () => row(over));
}

describe('scoring one interval', () => {
  it('gives a full, unbroken sitting the lot', () => {
    expect(focusScore(row())).toBe(100);
  });

  it('marks an interrupted sitting down, and by less each time', () => {
    const once = focusScore(row({ pauses: 1 }));
    const twice = focusScore(row({ pauses: 2 }));
    const thrice = focusScore(row({ pauses: 3 }));
    expect(once).toBeLessThan(100);
    expect(twice).toBeLessThan(once);
    expect(once - twice).toBeGreaterThan(twice - thrice);
  });

  it('rates a full interrupted sitting above half an unbroken one', () => {
    expect(focusScore(row({ pauses: 2 })))
      .toBeGreaterThan(focusScore(row({ minutes: 12, finished: false })));
  });

  it('never goes outside 0-100, whatever it is handed', () => {
    for (const odd of [
      row({ pauses: 400 }),
      row({ minutes: 0 }),
      row({ minutes: 900 }),
      row({ planned: 0, minutes: 0 }),
    ]) {
      const score = focusScore(odd);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

describe('refusing to recommend', () => {
  it('says nothing at all from an empty log', () => {
    expect(recommend([])).toBeNull();
  });

  it('says nothing until there are enough intervals', () => {
    expect(recommend(many(MIN_INTERVALS - 1, { planned: 50, minutes: 50 }))).toBeNull();
  });

  it('says nothing when every interval was the same length', () => {
    // The commonest shape of a real log: somebody who has only ever run
    // Classic. There is nothing to compare it against, so there is no verdict
    // to give — see MIN_LENGTHS.
    expect(recommend(many(MIN_INTERVALS + 4))).toBeNull();
  });

  it('will not let a single experiment at one length win', () => {
    const log = [
      ...many(5, { styleId: 'classic', planned: 25, minutes: 25, pauses: 2 }),
      // One flawless ninety. Better scoring, and one sitting.
      row({ styleId: 'ultradian', planned: 90, minutes: 90 }),
      ...many(2, { styleId: 'deep-work', planned: 50, minutes: 50, pauses: 1 }),
    ];
    expect(recommend(log)?.minutes).not.toBe(90);
  });

  it('ignores intervals nobody sat', () => {
    const log = [...many(MIN_INTERVALS, { minutes: 0 }), ...many(3, { planned: 50, minutes: 50 })];
    expect(recommend(log)).toBeNull();
  });
});

describe('recommending', () => {
  const log = [
    ...many(4, { styleId: 'classic', planned: 25, minutes: 12, pauses: 3, finished: false }),
    ...many(4, { styleId: 'deep-work', planned: 50, minutes: 50 }),
  ];

  it('names the length the account actually works best at', () => {
    expect(recommend(log)?.minutes).toBe(50);
  });

  it('names a style the app can really run', () => {
    const at = recommend(log);
    expect(at?.styleId).toBe('deep-work');
    expect(isStyleLength(at?.minutes ?? 0)).toBe(true);
  });

  it('counts everything it looked at, so the page can say how sure it is', () => {
    expect(recommend(log)?.sample).toBe(8);
  });

  it('gives a band, and puts the winner inside it', () => {
    const at = recommend(log)!;
    expect(at.low).toBeLessThanOrEqual(at.minutes);
    expect(at.high).toBeGreaterThanOrEqual(at.minutes);
  });

  it('widens the band over lengths that behave alike', () => {
    const alike = [
      ...many(3, { styleId: 'study-hall', planned: 45, minutes: 45 }),
      ...many(3, { styleId: 'deep-work', planned: 50, minutes: 50 }),
      ...many(3, { styleId: 'gentle', planned: 10, minutes: 4, pauses: 5, finished: false }),
    ];
    const at = recommend(alike)!;
    expect(at.low).toBe(45);
    expect(at.high).toBe(50);
  });

  it('prefers the style the account has actually been using at that length', () => {
    // Both are 50-minute methods in the list; only one of them is in the log.
    const log50 = [
      ...many(4, { styleId: 'deep-work', planned: 50, minutes: 50 }),
      ...many(3, { styleId: 'gentle', planned: 10, minutes: 3, pauses: 4, finished: false }),
    ];
    expect(recommend(log50)?.styleId).toBe('deep-work');
  });
});

describe('pace', () => {
  it('will not read a rate off a few minutes', () => {
    expect(tasksPerHour(1, 4 * 60)).toBeNull();
  });

  it('reads tasks against focused time, not against the day', () => {
    expect(tasksPerHour(2, 3600)).toBe(2);
    expect(tasksPerHour(2, 1800)).toBe(4);
  });

  it('is null rather than zero when there is nothing to compare with', () => {
    expect(pace(3, null)).toBeNull();
    expect(pace(null, 3)).toBeNull();
    expect(pace(3, 0)).toBeNull();
  });

  it('says how far off the account is from its own normal', () => {
    expect(pace(2.24, 2)).toBe(12);
    expect(pace(1, 2)).toBe(-50);
  });
});

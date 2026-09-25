/**
 * How long a goal has been quiet, in a unit somebody can hold.
 *
 * The line under a stalled goal used to read "Nothing finished in 1116 days".
 * That is accurate and it is not information: nobody converts four digits into
 * "about three years" while scanning a page, so it reads as "a big number" and
 * is skipped, which is the same as not having been told. The number is the
 * only thing on that row a reader can act on — three weeks means pick it back
 * up, three years means close it — and the two were arriving in the same
 * shape.
 *
 * `sinceWhen` picks the largest unit that is still honest. What is pinned here
 * is the boundaries between them and the plurals, the second because the first
 * version of this shipped saying "about 1 months".
 */
import { describe, expect, it } from 'vitest';
import { sinceWhen } from './goalAnalytics';

describe('how long ago, in words', () => {
  it('counts days while the exact count is worth having', () => {
    // Eleven days and nineteen days are different situations. Keeping the
    // figure exact here is the whole reason the other two bands exist.
    expect(sinceWhen(1)).toBe('1 day');
    expect(sinceWhen(11)).toBe('11 days');
    expect(sinceWhen(55)).toBe('55 days');
  });

  it('switches to months at eight weeks', () => {
    expect(sinceWhen(56)).toBe('about 2 months');
    expect(sinceWhen(100)).toBe('about 3 months');
    expect(sinceWhen(365)).toBe('about 12 months');
  });

  it('switches to years at about eighteen months', () => {
    expect(sinceWhen(549)).toBe('about 18 months');
    expect(sinceWhen(550)).toBe('over 1.5 years');
    expect(sinceWhen(1116)).toBe('over 3 years');
    expect(sinceWhen(1300)).toBe('over 3.5 years');
  });

  it('never says “1 months”', () => {
    // The bug this file was written for. Every band, every value, checked for
    // a plural that does not agree with its number.
    for (let days = 1; days < 4000; days += 1) {
      const said = sinceWhen(days);
      const match = /(\d+(?:\.\d)?) (day|month|year)(s?)/.exec(said);
      expect(match, said).not.toBeNull();
      const [, figure, unit, plural] = match!;
      const one = Number(figure) === 1;
      expect(plural === '', `${said} — “1 ${unit}s” or “2 ${unit}”`).toBe(one);
    }
  });

  it('never loses the ordering', () => {
    // Longer gaps must never read as shorter ones. Rounding across a band
    // boundary is exactly where that goes wrong.
    const asNumber = (days: number) => {
      const said = sinceWhen(days);
      const figure = Number(/(\d+(?:\.\d)?)/.exec(said)![1]);
      if (said.includes('day')) return figure;
      if (said.includes('month')) return figure * 30.4;
      return figure * 365.25;
    };
    for (let days = 1; days < 4000; days += 7) {
      expect(asNumber(days + 200), `${days} vs ${days + 200}`)
        .toBeGreaterThan(asNumber(days) - 40);
    }
  });
});

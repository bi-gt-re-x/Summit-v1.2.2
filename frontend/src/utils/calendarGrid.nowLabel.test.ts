/**
 * The badge beside the now line, against the clock the rail is written in.
 *
 * `nowLabel` is the odd one out among the formatters in utils/calendarGrid:
 * every other one hands straight to utils/clock, and this one keeps its own
 * twelve-hour arithmetic on purpose, because it deliberately drops the meridiem
 * that `timeText` would add. The badge shares an 82px gutter with the hour
 * labels — see `.wk-nowlabel` in styles/calendar/week.css — and "6:40 PM" is
 * wider than the half of it the badge gets.
 *
 * Keeping its own arithmetic is what let it drift. It wrote twelve-hour time
 * unconditionally, so a 24-hour account got a rail reading 14, 15, 16 with a
 * badge between two of them reading "3:37" — the bare form's whole defence is
 * that the hours either side of it say AM or PM, and on that account they did
 * not say anything of the kind.
 *
 * So the two cases below are the two clocks, and the afternoon is what tells
 * them apart: the same instant is "3:37" on one and "15:37" on the other.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setClockFormat } from './clock';
import { nowLabel } from './calendarGrid';

/** Module state, so every test puts it back — as utils/clock.test.ts does. */
afterEach(() => setClockFormat('12h'));

const at = (hours: number, minutes = 0) => new Date(2026, 8, 21, hours, minutes);

describe('nowLabel', () => {
  it('writes a bare twelve-hour time on a twelve-hour clock', () => {
    setClockFormat('12h');
    expect(nowLabel(at(15, 37))).toBe('3:37');
    expect(nowLabel(at(8, 5))).toBe('8:05');
  });

  it('writes the account clock on a twenty-four hour one', () => {
    setClockFormat('24h');
    expect(nowLabel(at(15, 37))).toBe('15:37');
    expect(nowLabel(at(8, 5))).toBe('08:05');
  });

  it('never writes a meridiem, on either clock', () => {
    for (const format of ['12h', '24h'] as const) {
      setClockFormat(format);
      for (let hour = 0; hour < 24; hour += 1) {
        expect(nowLabel(at(hour, 37))).not.toMatch(/[AP]M/);
      }
    }
  });

  /* Midnight and noon, where `% 12` gives zero for both — the bug every
     hand-rolled formatter in this app was written around. */
  it('counts midnight and noon as twelve on a twelve-hour clock', () => {
    setClockFormat('12h');
    expect(nowLabel(at(0, 15))).toBe('12:15');
    expect(nowLabel(at(12, 15))).toBe('12:15');
  });

  it('keeps them apart on a twenty-four hour clock', () => {
    setClockFormat('24h');
    expect(nowLabel(at(0, 15))).toBe('00:15');
    expect(nowLabel(at(12, 15))).toBe('12:15');
  });
});

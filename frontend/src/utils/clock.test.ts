/**
 * Twelve-hour and twenty-four, and the boundaries between them.
 *
 * Almost every case here is midnight or noon, because that is where a
 * twelve-hour clock is strange: 0 is 12 AM, 12 is 12 PM, and `% 12` gives zero
 * for both — which is the bug every hand-rolled formatter in this app was
 * written around, in about a dozen copies, before there was one.
 *
 * The default matters as much as the conversions. It is '12h', which is what
 * every one of those formatters did before this module existed, so a render
 * before the account's preferences have arrived is the old behaviour and not a
 * flash of a different clock.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  clockFormat,
  hmText,
  hourText,
  meridiem,
  rangeText,
  setClockFormat,
  timeText,
} from './clock';

const at = (hours: number, minutes = 0) => new Date(2026, 8, 13, hours, minutes);

// Module state, so every test puts it back. Without this the first test to set
// 24-hour would decide the clock for every file that runs after it.
afterEach(() => setClockFormat('12h'));

describe('the default', () => {
  it('is the twelve-hour clock the app wrote before the preference existed', () => {
    expect(clockFormat()).toBe('12h');
    expect(timeText(at(18, 40))).toBe('6:40 PM');
  });
});

describe('setClockFormat', () => {
  it('reports whether anything changed, so the provider can skip a render', () => {
    expect(setClockFormat('12h')).toBe(false);
    expect(setClockFormat('24h')).toBe(true);
    expect(setClockFormat('24h')).toBe(false);
  });
});

describe('hmText', () => {
  it('writes the afternoon both ways', () => {
    expect(hmText(18, 40)).toBe('6:40 PM');
    setClockFormat('24h');
    expect(hmText(18, 40)).toBe('18:40');
  });

  it('calls midnight 12 AM rather than 0 AM', () => {
    expect(hmText(0, 5)).toBe('12:05 AM');
    setClockFormat('24h');
    expect(hmText(0, 5)).toBe('00:05');
  });

  it('calls noon 12 PM rather than 0 PM', () => {
    expect(hmText(12, 0)).toBe('12:00 PM');
    setClockFormat('24h');
    expect(hmText(12, 0)).toBe('12:00');
  });

  it('pads the minutes, and the hours only on a 24-hour clock', () => {
    expect(hmText(9, 5)).toBe('9:05 AM');
    setClockFormat('24h');
    expect(hmText(9, 5)).toBe('09:05');
  });

  it('drops ":00" on the hour when asked, but keeps it at 24-hour', () => {
    // "18" on its own is a number; "18:00" is a time. The grid's hour gutter
    // is the one place that wants the bare figure, and that is `hourText`.
    expect(hmText(18, 0, true)).toBe('6 PM');
    expect(hmText(18, 40, true)).toBe('6:40 PM');
    setClockFormat('24h');
    expect(hmText(18, 0, true)).toBe('18:00');
    expect(hmText(18, 40, true)).toBe('18:40');
  });
});

describe('hourText', () => {
  it('writes a bare grid hour', () => {
    expect(hourText(6)).toBe('6 AM');
    expect(hourText(18)).toBe('6 PM');
    setClockFormat('24h');
    expect(hourText(6)).toBe('06');
    expect(hourText(18)).toBe('18');
  });

  it('counts the calendar’s hours past 24 back into the small hours', () => {
    // The calendar's day runs 6 AM to 5 AM and numbers its grid 6 to 29 — see
    // utils/calendarGrid. 29 is five in the morning.
    expect(hourText(29)).toBe('5 AM');
    expect(hourText(24)).toBe('12 AM');
    setClockFormat('24h');
    expect(hourText(29)).toBe('05');
    expect(hourText(24)).toBe('00');
  });
});

describe('meridiem', () => {
  it('is nothing at all on a 24-hour clock, where there is no such thing', () => {
    expect(meridiem(9)).toBe('AM');
    expect(meridiem(21)).toBe('PM');
    setClockFormat('24h');
    expect(meridiem(9)).toBe('');
    expect(meridiem(21)).toBe('');
  });
});

describe('rangeText', () => {
  it('writes the meridiem once when both ends share it', () => {
    // A block is a seventh of the grid wide and "7:40 AM – 8:40 AM" is four
    // characters more than the column can show.
    expect(rangeText(at(7, 40), at(8, 40))).toBe('7:40 – 8:40 AM');
  });

  it('writes it twice when they do not', () => {
    expect(rangeText(at(11, 30), at(13, 0))).toBe('11:30 AM – 1 PM');
  });

  it('drops ":00" on the hour', () => {
    expect(rangeText(at(9, 0), at(10, 30))).toBe('9 – 10:30 AM');
  });

  it('has nothing to abbreviate at 24-hour, so it abbreviates nothing', () => {
    setClockFormat('24h');
    expect(rangeText(at(7, 40), at(8, 40))).toBe('07:40 – 08:40');
    expect(rangeText(at(9, 0), at(10, 30))).toBe('09:00 – 10:30');
  });
});

describe('timeText', () => {
  it('reads the hours and minutes off a Date and nothing else', () => {
    expect(timeText(at(0, 0))).toBe('12:00 AM');
    expect(timeText(at(23, 59))).toBe('11:59 PM');
    setClockFormat('24h');
    expect(timeText(at(0, 0))).toBe('00:00');
    expect(timeText(at(23, 59))).toBe('23:59');
  });
});

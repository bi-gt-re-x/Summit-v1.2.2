/**
 * Twelve-hour or twenty-four, decided once for the whole app.
 *
 * ## What was wrong
 *
 * Every time in this app was written "6:40 PM", in about a dozen formatters
 * across utils/calendarGrid, components/Tasks/board, the two calendar views and
 * two dashboard cards. Three of them went further and passed `'en-US'` to
 * `toLocaleTimeString` explicitly, which overrides the reader's own device: a
 * browser set to German still got AM and PM.
 *
 * Most of the world writes 18:40, so that is a preference — `clock_format` in
 * backend/api/settings.py, offered on the settings page.
 *
 * ## Why this is module state and not a parameter
 *
 * Everywhere else in this app a preference is passed in. `weekStartDay(prefs)`
 * hands a number to `startOfWeek`, and the calendar threads it down; that is
 * the right shape when a handful of call sites want it.
 *
 * It is the wrong shape here. The clock reaches `hourLabel`, `timeLabel`,
 * `timeLabelShort`, `hmLabel`, `hmLabelShort`, `rangeLabel`, `dueLabel`,
 * `shortDateTime` and more — pure functions called from the grid, the blocks,
 * the sidebars, the search panel and two dashboards. Threading a parameter
 * through all of them would put one word in twenty signatures and every caller
 * of every one of those, to say a thing that is true of the whole app at once
 * and never differs between two labels on the same screen.
 *
 * So it is set once, the way a locale is: <SettingsProvider> calls
 * `setClockFormat` when the account's preferences arrive, and the formatters
 * read it. Two rules keep that honest —
 *
 *   - **Nothing else writes it.** One caller, in context/SettingsProvider.
 *   - **The default is '12h'**, which is what every one of those formatters did
 *     before this existed. So a render before the preferences have loaded, or a
 *     test that never sets it, gets exactly the old behaviour rather than a
 *     surprise.
 */

export type ClockFormat = '12h' | '24h';

let current: ClockFormat = '12h';

/**
 * Set the clock the whole app writes in.
 *
 * Called by <SettingsProvider> and by nothing else. Returns whether the value
 * changed, which is what lets the provider re-render only when it has to.
 */
export function setClockFormat(format: ClockFormat): boolean {
  if (format === current) return false;
  current = format;
  return true;
}

/** The clock in force. */
export function clockFormat(): ClockFormat {
  return current;
}

/** "AM" / "PM", or '' on a 24-hour clock, where there is no such thing. */
export function meridiem(hours: number): string {
  if (current === '24h') return '';
  return ((hours % 24) + 24) % 24 < 12 ? 'AM' : 'PM';
}

/**
 * One hour and minute, written out: "6:40 PM" or "18:40".
 *
 * `short` drops the minutes on the hour — "6 PM", "18h" — for the places where
 * a block is a seventh of the grid wide and every character is paid for. On a
 * 24-hour clock the short form keeps the colon ("18:00" → "18:00") because
 * "18" alone is a number rather than a time, and the grid's hour gutter is the
 * one place that wants the bare figure. `hourText` is for that.
 */
export function hmText(hours: number, minutes: number, short = false): string {
  const hour = ((hours % 24) + 24) % 24;
  const mm = String(minutes).padStart(2, '0');

  if (current === '24h') {
    return short && minutes === 0
      ? `${String(hour).padStart(2, '0')}:00`
      : `${String(hour).padStart(2, '0')}:${mm}`;
  }

  const twelve = hour % 12 || 12;
  const half = hour < 12 ? 'AM' : 'PM';
  return short && minutes === 0 ? `${twelve} ${half}` : `${twelve}:${mm} ${half}`;
}

/** The same, from a Date. */
export function timeText(date: Date, short = false): string {
  return hmText(date.getHours(), date.getMinutes(), short);
}

/**
 * A bare grid hour: "6 AM", or "06" on a 24-hour clock.
 *
 * Hours past 24 count back into the small hours, because the calendar's day
 * runs 6 AM to 5 AM and its grid numbers them 6 to 29 — see utils/calendarGrid.
 */
export function hourText(hour: number): string {
  const normalised = ((hour % 24) + 24) % 24;
  if (current === '24h') return String(normalised).padStart(2, '0');
  return `${normalised % 12 || 12} ${normalised < 12 ? 'AM' : 'PM'}`;
}

/**
 * "7:40 – 8:40 AM" for a block's two ends, or "07:40 – 08:40".
 *
 * The meridiem is written once when both ends share it, which is how the design
 * writes a range and how anyone says one out loud. It matters more than it
 * reads: a block is a seventh of the grid wide, and "7:40 AM – 8:40 AM" is four
 * characters longer than the column can show. A 24-hour clock has the problem
 * the trick was invented for solved already.
 */
export function rangeText(from: Date, to: Date): string {
  if (current === '24h') return `${timeText(from)} – ${timeText(to)}`;

  const half = (date: Date) => (date.getHours() < 12 ? 'AM' : 'PM');
  // ":00" is dropped on the hour for the same reason the meridiem is shared:
  // every character costs, and nobody reads "11:00" differently from "11".
  const bare = (date: Date) => {
    const minutes = date.getMinutes();
    const hour = date.getHours() % 12 || 12;
    return minutes ? `${hour}:${String(minutes).padStart(2, '0')}` : `${hour}`;
  };
  return half(from) === half(to)
    ? `${bare(from)} – ${bare(to)} ${half(to)}`
    : `${bare(from)} ${half(from)} – ${bare(to)} ${half(to)}`;
}

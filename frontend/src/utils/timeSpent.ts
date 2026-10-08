/**
 * How long a task took — the one place the browser answers it.
 *
 * `completion_seconds` reads like a duration and is not one: the server
 * writes it as `now - created_at` when a task is finished, so it is how long
 * the task sat on the list. A task written down on Monday and ticked off on
 * Friday is "345,600 seconds" — and read raw, that put five-day "sittings"
 * into the subject page's averages, its effort chart, a goal's time invested
 * and the model's brief ("7,708 min each").
 *
 * So nothing reads it directly for time spent; everything asks here:
 *
 *   1. A task placed on the calendar carries its block in `created_at` (the
 *      start) and `due_date` (the end). That span is time the reader set
 *      aside, and the best figure there is. Believed up to LONGEST_BLOCK.
 *   2. Otherwise `completion_seconds`, only when it is short enough to have
 *      been one sitting (LONGEST_SITTING).
 *   3. Otherwise null — left out of an average rather than poisoning it.
 *
 * Mirrors backend/tracking/time_spent.py; both have tests.
 */

/** The fields this reads, so analytics rows and full tasks both fit. */
export interface TimedTask {
  show_on_calendar?: unknown;
  created_at?: string | null;
  due_date?: string | null;
  completion_seconds?: unknown;
}

/** A calendar block longer than this is a deadline, not a sitting. */
export const LONGEST_BLOCK = 12 * 3600;

/** The longest a creation-to-finish gap is believed to be time spent. */
export const LONGEST_SITTING = 6 * 3600;

function placed(task: TimedTask): boolean {
  const flag = task.show_on_calendar;
  return flag === true || flag === 1 || flag === '1' || flag === 'true';
}

/** The calendar block a placed task carries, in seconds, or null. */
export function blockSeconds(task: TimedTask): number | null {
  if (!placed(task) || !task.created_at || !task.due_date) return null;
  const from = new Date(task.created_at).getTime();
  const to = new Date(task.due_date).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  const span = (to - from) / 1000;
  return span > 0 && span <= LONGEST_BLOCK ? span : null;
}

/** Seconds the task took, or null when nothing says. See the note above. */
export function secondsSpent(task: TimedTask): number | null {
  const block = blockSeconds(task);
  if (block !== null) return block;
  const seconds = Number(task.completion_seconds);
  return Number.isFinite(seconds) && seconds > 0 && seconds <= LONGEST_SITTING ? seconds : null;
}

/**
 * "The numbers moved" — announced once per burst of changes, not once per task.
 *
 * Every writer used to fire `STATS_CHANGED` itself, and every listener did its
 * work each time: the rail re-read the account, the bell re-read its list.
 * Ticking off ten tasks in a row was ten of each. Sixty at once, done one at a
 * time, was sixty.
 *
 * `announceStatsChanged` splits the two costs:
 *
 *   TASKS_WRITTEN   fired at once, every time. Only the cheap listeners hang
 *                   off it — dropping a cached copy of the task history — so a
 *                   page opened a moment after a write never reads the old one.
 *   STATS_CHANGED   fired once per burst: QUIET_MS after the last write, and no
 *                   later than MAX_WAIT_MS after the first, so a steady stream
 *                   of changes still refreshes now and then instead of never.
 *
 * So sixty changes in quick succession are sixty cache drops (nothing) and one
 * re-read of everything that re-reads. A single change still refreshes within a
 * third of a second.
 *
 * Nothing here imports the things that listen. Each listener registers for the
 * event it needs, beside the thing it refreshes (see services/taskHistory).
 */

export const STATS_CHANGED = 'summit:stats-changed';
export const TASKS_WRITTEN = 'summit:tasks-written';

/** Quiet time after the last change before the listeners hear about it. */
export const QUIET_MS = 300;
/** However busy it gets, the listeners hear within this long of the first change. */
export const MAX_WAIT_MS = 1500;

let timer: ReturnType<typeof setTimeout> | null = null;
let firstAt: number | null = null;

function flush(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  firstAt = null;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(STATS_CHANGED));
}

/** Say that tasks or the account changed. Cheap to call as often as needed. */
export function announceStatsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(TASKS_WRITTEN));
  const now = Date.now();
  if (firstAt === null) firstAt = now;
  if (timer !== null) clearTimeout(timer);
  const wait = Math.max(0, Math.min(QUIET_MS, firstAt + MAX_WAIT_MS - now));
  timer = setTimeout(flush, wait);
}

/** Deliver a pending announcement now. For tests, and for a page about to unload. */
export function flushStatsChanged(): void {
  if (timer !== null) flush();
}

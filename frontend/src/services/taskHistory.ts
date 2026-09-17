/**
 * The task history, fetched once and shared.
 *
 * ## The problem
 *
 * `/api/analytics/tasks` is the largest response this app makes — 3.44 MB on
 * the largest account here, and 5.99 MB before the columnar encoding landed
 * (see `columns_table_for` in backend/database/connection.py). Two pages want
 * it, and each was asking for its own copy:
 *
 *     open Analytics              one fetch
 *     open a subject from it      another, of exactly the same bytes
 *     go back                     another
 *
 * Three full downloads and three parses to look at one account's tasks twice.
 * Neither page was wrong on its own; there was simply nowhere for the answer to
 * live that outlived a component.
 *
 * ## What this is
 *
 * One promise per account, held at module scope, handed to everyone who asks.
 * The second caller does not start a second request — it waits on the first
 * one, which is the case that matters most: the two pages mount in sequence
 * closely enough that the first fetch is usually still in the air.
 *
 * ## What it is not
 *
 * **Not a cache with a lifetime.** Nothing here expires on a timer, because a
 * timer would be a guess about when the reader last finished a task and would
 * be wrong in both directions — refetching 3 MB for nothing, or showing a stale
 * record after a write. What is here is: the answer is kept until something
 * says it is stale, and the app already knows exactly when that is.
 *
 * `invalidate` is that. It is called on the same `summit:stats-changed` event
 * the rail, the top bar and the notifications provider already listen to —
 * which is fired on every completion, every XP change, every write that moves
 * the numbers. So the record on screen is never older than the last thing the
 * reader did, and the fetch happens on a write rather than on a clock.
 *
 * **Not a store.** It holds a promise, not parsed state. Pages keep their own
 * `useApi` and their own loading and error handling; what they share is the
 * request. A shared *store* would mean two pages re-rendering on each other's
 * state changes, which is a much larger thing to reason about than a shared
 * promise and buys nothing here.
 */
import { analyticsTasks, type AnalyticsTasksResult } from './analytics';
import type { ApiResult } from '@/types';

/** The one in flight or already answered, and whose it is. */
let held: { username: string; promise: Promise<ApiResult<AnalyticsTasksResult>> } | null = null;

/**
 * The account's task history. One request however many callers there are.
 *
 * A failure is not held. The next caller after a failed fetch gets a fresh
 * request rather than the same rejection again — otherwise one dropped
 * connection would leave every analytics page in the session broken until a
 * write happened to clear it, which is a worse failure than the one it came
 * from.
 */
export function taskHistory(username: string): Promise<ApiResult<AnalyticsTasksResult>> {
  if (held && held.username === username) return held.promise;

  const promise = analyticsTasks().then((result) => {
    if (!result.success && held?.promise === promise) held = null;
    return result;
  });

  held = { username, promise };
  return promise;
}

/**
 * Forget it, so the next reader gets the record as it is now.
 *
 * Called on a write rather than on a timer — see the note above. Cheap enough
 * to call on every stats change: it drops a reference, and the refetch only
 * happens if somebody actually asks again.
 */
export function invalidate(): void {
  held = null;
}

/* Registered here rather than in a provider, and once for the session.
 
   The event is the app's existing "the numbers moved" broadcast — see
   STATS_CHANGED in components/Rail.tsx — and every writer already fires it.
   Putting the listener beside the thing it invalidates means a new writer gets
   this for free by firing the event it was already going to fire, rather than
   by remembering that an analytics cache exists.
 
   Guarded for the server and for the test environment, where there is no
   window to listen on. */
if (typeof window !== 'undefined') {
  window.addEventListener('summit:stats-changed', invalidate);
}

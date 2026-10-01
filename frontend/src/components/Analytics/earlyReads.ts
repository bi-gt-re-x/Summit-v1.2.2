/**
 * The analytics page's reads, started as soon as its code arrives.
 *
 * ## Why they cannot wait for the page
 *
 * `useAnalyticsData` asks for everything through `useApi`, and `useApi` asks
 * in an effect — which React runs after the page's first commit. On a fresh
 * load that commit lands well after the code does: measured on a production
 * build, the page's code was in at ~85 ms and its first commit at ~380 ms,
 * the gap being the browser laying out the app shell for the first time. The
 * nine requests sat idle for all of it, then started at once and kept the
 * reader waiting another second for a five-year account.
 *
 * None of them needs anything the page works out — they are plain GETs on the
 * session — so they are started here, from the page module itself, and the
 * server works through them while the browser renders. The hook then takes
 * the promise that is already in flight instead of asking again.
 *
 * ## One use each, and not for long
 *
 * A read started here is taken at most once, and only within `FRESH_MS` of
 * being started. Anything older — a tab that sat in the background, or a
 * second visit within the same session — asks the server afresh, exactly as
 * it did before this file existed. So the only thing this can ever change is
 * *when* the first visit's requests begin.
 */
import { analytics as analyticsService, goals as goalsService, growth as growthService } from '@/services';
import { primeTaskHistory } from '@/services/taskHistory';

/** How long a read started early may still be taken. */
const FRESH_MS = 15_000;

const started = new Map<string, { at: number; promise: Promise<unknown> }>();
let begun = false;

/**
 * Start every read the page's first paint waits on. Once per page load —
 * a second call is a no-op, so importing this twice cannot double the load.
 */
export function startAnalyticsReads(): void {
  /* Not under test: the page's tests mock these services and assert on what
     the page asks for, and a read fired at import would be a call no test
     made. In the app this is the first thing the module does. */
  if (begun || typeof window === 'undefined' || import.meta.env.MODE === 'test') return;
  begun = true;
  const at = Date.now();
  const put = (key: string, promise: Promise<unknown>) => {
    // Never let an early failure surface as an unhandled rejection: whoever
    // takes it will see the rejection; whoever does not, nothing.
    promise.catch(() => undefined);
    started.set(key, { at, promise });
  };
  primeTaskHistory();
  put('series', growthService.series(0));
  put('ratings', growthService.ratings());
  put('standing', analyticsService.standing());
  put('goals', goalsService.getGoals());
  put('baseline', analyticsService.baseline());
  put('adopted', analyticsService.adoptedAdvice());
  put('graded', analyticsService.metricHistories());
  put('history:overall', analyticsService.metricHistory('overall'));
}

/** The read started early under `key`, if it is still fresh; otherwise `ask()`. */
export function takeOrAsk<T>(key: string, ask: () => Promise<T>): Promise<T> {
  const early = started.get(key);
  started.delete(key);
  if (early && Date.now() - early.at < FRESH_MS) return early.promise as Promise<T>;
  return ask();
}

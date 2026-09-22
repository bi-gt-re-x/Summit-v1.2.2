/**
 * The record of finished focus intervals, and what can honestly be read off it.
 *
 * ## Why this file has to exist at all
 *
 * The app has never stored a session boundary. `syncDay` mirrors one number per
 * day — see services/focus.ts — which is the right ledger for hours and is
 * useless for any question of *shape*: whether a fifty-minute sitting goes
 * better for this account than a twenty-five, how often a sitting gets
 * interrupted, whether today is going faster than its own normal. The Timer
 * page said as much in its own header and declined to show an average session
 * length rather than estimate one.
 *
 * So the page now keeps a record of intervals as they finish — one row per
 * focus phase, written by hooks/usePomodoro, held in the browser by
 * hooks/useIntervals. It is **per browser and not on the server**, which is a
 * real limitation and the reason nothing derived from it is presented as an
 * account-wide fact. A cleared cache loses the shape and loses none of the
 * hours.
 *
 * ## Why a recommendation names a style rather than a number of minutes
 *
 * "47 minutes" is not a thing this app can run. A pomodoro here is a named
 * method with a break attached and a round count — the reasoning is in
 * components/Timer/pomodoro.ts — and a free-minutes mode would be a second
 * kind of timer rather than a better default for this one. So `recommend`
 * answers with a style the app already has, chosen because the account's own
 * intervals at that length ran better than its intervals at the others. The
 * minutes it prints are that style's minutes, not an average of anything.
 *
 * ## Everything here is pure
 *
 * No clock, no storage. The day is passed in. That is the same split
 * pomodoro.ts uses, and it is what makes the arithmetic testable without
 * pretending to be a timer — see intervals.test.ts.
 */
import { STYLES, styleFor } from '@/components/Timer/pomodoro';

/**
 * One focus phase, after the fact.
 *
 * `planned` and `minutes` differ only when the interval was cut short: a phase
 * that ran to the end has them equal, and one abandoned at the nineteenth
 * minute of twenty-five records both, because "how much of it did you sit" is
 * the whole question this row exists to answer.
 */
export interface Interval {
  /** ISO date the interval ran on, as `YYYY-MM-DD`. */
  day: string;
  styleId: string;
  /** Minutes the phase was set to run for. */
  planned: number;
  /** Minutes of it that actually ran. */
  minutes: number;
  /** Times it was paused before it ended. */
  pauses: number;
  /** Whether the clock reached the end of the phase. */
  finished: boolean;
}

/**
 * How cleanly one interval ran, 0-100.
 *
 * Two terms, because two different things make a sitting a bad one. Seventy
 * points are the share of the interval that actually ran, so an abandoned
 * sitting cannot score well however calm it was. Thirty are the interruption
 * term, and it decays as `30 / (1 + pauses)` rather than subtracting a fixed
 * cost per pause: the first interruption is the one that breaks a train of
 * thought and the fifth is a sitting that was already broken, so a linear
 * penalty would keep punishing an afternoon that has already been marked down.
 *
 * A full, unpaused interval is 100. Full but paused once is 85, twice 80. Half
 * an interval, unpaused, is 65 — worse than the interrupted full one, which is
 * the intended ordering: the work that got done is the part that counts.
 */
export function focusScore(interval: Interval): number {
  const share = interval.planned > 0
    ? Math.min(1, Math.max(0, interval.minutes / interval.planned))
    : 0;
  const calm = 30 / (1 + Math.max(0, interval.pauses));
  return Math.round(share * 70 + calm);
}

/**
 * Intervals needed before any recommendation is offered, and lengths needed
 * before one can be compared against another.
 *
 * Six and two. Under either, the honest answer is that the account has not
 * told us anything yet — one good afternoon at Classic is not evidence that
 * Classic is right, it is evidence that Classic was picked. `recommend`
 * returns null rather than a hedge, and the page shows the ordinary picker.
 */
export const MIN_INTERVALS = 6;
const MIN_LENGTHS = 2;
/** Samples at one length before that length is allowed to win. */
const MIN_PER_LENGTH = 2;
/**
 * How close to the winner another length has to score to be named beside it.
 *
 * The band is what makes the sentence worth reading: "45 minutes" is a verdict
 * on one number, "you do your best work between 40 and 50" is the shape of the
 * account, and a five-point window is narrow enough that the lengths inside it
 * really are behaving alike.
 */
const BAND = 5;

export interface Recommendation {
  /** The style to run, and the minutes it works in. */
  styleId: string;
  minutes: number;
  /** The lengths that scored within `BAND` of the winner, in minutes. */
  low: number;
  high: number;
  /** How many intervals the whole verdict rests on. */
  sample: number;
}

/**
 * The length this account actually works best at, or null while it is unknown.
 *
 * Grouped by the length the interval was *set* to rather than the length it
 * ran, because the question is which setting to choose next. A length needs
 * two intervals of its own to be eligible, so one abandoned experiment at
 * ninety minutes cannot win by being the only ninety on the list.
 */
export function recommend(intervals: Interval[]): Recommendation | null {
  const usable = intervals.filter((row) => row.planned > 0 && row.minutes > 0);
  if (usable.length < MIN_INTERVALS) return null;

  const byLength = new Map<number, { scores: number[]; styles: string[] }>();
  usable.forEach((row) => {
    const group = byLength.get(row.planned) ?? { scores: [], styles: [] };
    group.scores.push(focusScore(row));
    group.styles.push(row.styleId);
    byLength.set(row.planned, group);
  });
  if (byLength.size < MIN_LENGTHS) return null;

  const mean = (numbers: number[]) => numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  const scored = [...byLength.entries()]
    .filter(([, group]) => group.scores.length >= MIN_PER_LENGTH)
    .map(([minutes, group]) => ({ minutes, score: mean(group.scores), styles: group.styles }));
  if (scored.length < MIN_LENGTHS) return null;

  const best = scored.reduce((top, row) => (row.score > top.score ? row : top), scored[0]!);
  const band = scored.filter((row) => best.score - row.score <= BAND).map((row) => row.minutes);

  return {
    // The style most often run at the winning length, so the recommendation is
    // one the account has actually used rather than the first in the list that
    // happens to share a number.
    styleId: commonest(best.styles),
    minutes: best.minutes,
    low: Math.min(...band),
    high: Math.max(...band),
    sample: usable.length,
  };
}

function commonest(ids: string[]): string {
  const counts = new Map<string, number>();
  ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  let top = ids[0] ?? '';
  counts.forEach((count, id) => {
    if (count > (counts.get(top) ?? 0)) top = id;
  });
  // Through styleFor so a row written by a build with a different list cannot
  // recommend a style this one does not have.
  return styleFor(top).id;
}

/** Whether a length is one of the ten the app can actually run. */
export function isStyleLength(minutes: number): boolean {
  return STYLES.some((style) => style.focus === minutes);
}

// --------------------------------------------------------------------------
// Pace
// --------------------------------------------------------------------------
/**
 * The shortest stretch a rate may be read off, in seconds.
 *
 * Fifteen minutes. Tasks are finished in lumps, so one task closed four
 * minutes into the day is twelve an hour and means nothing at all; a rate
 * printed off that would swing by hundreds of percent every few minutes and
 * invite somebody to act on it.
 */
const MIN_RATE_SECONDS = 15 * 60;

/**
 * Tasks per focused hour, or null when too little has been focused to say.
 *
 * Deliberately per *focused* hour rather than per hour of the day: an account
 * that worked for forty minutes and closed two tasks is working at three an
 * hour, and dividing by the eight hours since it woke up would describe its
 * morning rather than its work.
 */
export function tasksPerHour(tasks: number, focusedSeconds: number): number | null {
  if (focusedSeconds < MIN_RATE_SECONDS) return null;
  return tasks / (focusedSeconds / 3600);
}

/**
 * Today's rate against the account's own baseline, as a percentage change.
 *
 * Null when either side is missing, which is the ordinary state on a new
 * account and on a day that has barely started — the page prints a dash for it
 * rather than a zero, because "no faster than usual" and "we cannot tell yet"
 * are not the same reading.
 */
export function pace(now: number | null, baseline: number | null): number | null {
  if (now === null || baseline === null || baseline <= 0) return null;
  return Math.round(((now - baseline) / baseline) * 100);
}

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
 * ## The intention, and why it is the account's own words
 *
 * A row can also carry what the sitting was *for* — one line, optionally with
 * a number — and what came of it. That pairing is the only thing here that is
 * not derived from the clock, and it is the only thing that can say whether an
 * hour was worth having: fifty unbroken minutes is a good sitting and a bad
 * afternoon if the thing you sat down to do is still not done.
 *
 * The result is asked for rather than counted, and `done` says so at length.
 * Substituting a number the app can count for the one the intention was about
 * would be the more impressive-looking lie.
 *
 * ## Everything here is pure
 *
 * No clock, no storage. The day, and `now` where recency matters, are passed
 * in. That is the same split pomodoro.ts uses, and it is what makes the
 * arithmetic testable without pretending to be a timer — see intervals.test.ts.
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
  /**
   * Epoch ms the interval ended.
   *
   * Optional only because rows written before it existed do not have one, and
   * dropping somebody's record to tidy the shape would be the migration doing
   * harm. Read it as "unknown", never as zero: `wasJustNow` treats a row
   * without it as old, which is the safe direction — the page asks its one
   * question about the sitting somebody has just done and must not open an
   * interrogation about yesterday's on the next reload.
   */
  at?: number;
  /**
   * What success was going to look like, in the account's own words.
   *
   * Set before the sitting, carried here when it ends. Absent is the ordinary
   * state: an intention is worth asking for and not worth insisting on, so a
   * sitting without one is a sitting, not an incomplete record.
   */
  intent?: string;
  /** The number the intent named, when it named one. */
  target?: number;
  /**
   * What the account says it actually did, against `target`.
   *
   * A self-report, and the page labels it as one. Nothing in the app can count
   * problems worked or scales practised, and the alternative to asking was to
   * quietly substitute a number the app *can* count — tasks closed — for the
   * one the intention was about. That would be a different measurement wearing
   * this one's label.
   */
  done?: number;
  /**
   * Whether an intention with no number was met.
   *
   * The other half of `done`, and a separate field rather than a 1 or a 0 in
   * it: "understand integration by parts" is answered yes or no, and storing
   * that as a count would make `execution` divide one kind of answer by
   * another kind's target.
   */
  met?: boolean;
  /**
   * How ready the account said it was, when it said.
   *
   * Asked once and carried across the day rather than per sitting: readiness
   * is a fact about the person at that hour, and a question repeated every
   * twenty-five minutes would be answered on autopilot within an afternoon.
   */
  readiness?: Readiness;
}

/**
 * The three answers to "how ready are you?".
 *
 * Three rather than a slider, and no numbers on them. The reading this feeds
 * is a comparison between groups — see `readinessEffect` — and a 1-10 scale
 * would produce ten groups of almost nothing each, which is a more precise
 * question and a less answerable one.
 */
export type Readiness = 'low' | 'normal' | 'high';

export const READINESS: { id: Readiness; label: string; glyph: string }[] = [
  { id: 'low', label: 'Low', glyph: '🔋' },
  { id: 'normal', label: 'Normal', glyph: '◉' },
  { id: 'high', label: 'High', glyph: '⚡' },
];

/** How recent a row has to be for the page to ask about it, in ms. */
const JUST_NOW_MS = 45 * 60_000;

/**
 * Whether this row is the sitting that has just happened.
 *
 * The result question is about the work still in somebody's head. Past this
 * window the honest thing is to leave the row as it is: an unanswered intention
 * from yesterday is a fact about yesterday, and asking about it tomorrow
 * collects a guess.
 */
export function wasJustNow(interval: Interval, now: number): boolean {
  return interval.at !== undefined && now - interval.at <= JUST_NOW_MS;
}

/**
 * The intention this row still owes an answer to, or null.
 *
 * Both halves matter: a row with no intention was never going to be scored,
 * and a row already answered must not be asked again.
 */
export function unanswered(interval: Interval | undefined, now: number): Interval | null {
  if (!interval || !interval.intent) return null;
  if (interval.done !== undefined || interval.met !== undefined) return null;
  return wasJustNow(interval, now) ? interval : null;
}

/**
 * What was done against what was intended, as a percentage, or null.
 *
 * Null whenever the intention had no number — which is most of them, and is
 * not a gap in the data. "Finish 15 problems" can be scored and "understand
 * integration by parts" cannot, and a percentage invented for the second would
 * be the page marking its own homework.
 */
export function execution(interval: Interval): number | null {
  if (interval.target === undefined || interval.target <= 0) return null;
  if (interval.done === undefined) return null;
  return Math.round((interval.done / interval.target) * 100);
}

/**
 * The one line under the bars.
 *
 * Three bands and no arithmetic on show, because the number is directly above
 * it. Deliberately flat about falling short: a sitting that got two thirds of
 * the way is two thirds of the way, and a page that spun that as encouragement
 * would be worth less the next time it said anything.
 */
export function verdict(interval: Interval): string {
  const pct = execution(interval);
  if (pct === null) {
    if (interval.met === undefined) return '';
    return interval.met
      ? 'You did what you set out to do.'
      : 'Not this time — the sitting still counted.';
  }
  if (pct >= 100) return 'You did more than you set out to.';
  if (pct >= 70) return 'Most of the way to what you set out to do.';
  return 'Short of what you set out to do.';
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
// Readiness, and whether it makes any difference
// --------------------------------------------------------------------------
/** Sittings at one readiness before that level is allowed into the comparison. */
const MIN_PER_LEVEL = 3;
/**
 * Points between the best and worst level before the page will say they differ.
 *
 * Eight, on a score whose interruption term moves in steps of fifteen and
 * seven and a half. Under that the two groups are the same handful of sittings
 * arranged differently, and "you work better when you are ready" is a sentence
 * people will believe on sight — which is exactly why it should not be printed
 * until the record says it. The honest middle answer, and the one nobody ever
 * writes, is that it made no difference.
 */
const MIN_GAP = 8;

export interface ReadinessRead {
  /** Whether the levels differ by enough to state a direction. */
  clear: boolean;
  best: Readiness;
  bestScore: number;
  worst: Readiness;
  worstScore: number;
  /** Sittings behind the comparison, across the levels that qualified. */
  sample: number;
}

/**
 * What readiness has actually been worth to this account, or null.
 *
 * Null until at least two levels have enough sittings of their own — the same
 * refusal `recommend` makes, for the same reason. An account that has only
 * ever pressed "Normal" has said nothing about readiness, and a page that
 * turned that into advice would be reading its own default back to it.
 *
 * What is compared is the focus score, which is interruptions and completion
 * and not the quality of anybody's thinking. The page's wording has to stay
 * inside that: this can say sittings run cleaner, and cannot say the work was
 * better.
 */
export function readinessEffect(intervals: Interval[]): ReadinessRead | null {
  const groups = new Map<Readiness, number[]>();
  intervals.forEach((row) => {
    if (!row.readiness) return;
    const scores = groups.get(row.readiness) ?? [];
    scores.push(focusScore(row));
    groups.set(row.readiness, scores);
  });

  const eligible = [...groups.entries()]
    .filter(([, scores]) => scores.length >= MIN_PER_LEVEL)
    .map(([level, scores]) => ({
      level,
      score: Math.round(scores.reduce((sum, n) => sum + n, 0) / scores.length),
      count: scores.length,
    }));
  if (eligible.length < 2) return null;

  eligible.sort((a, b) => b.score - a.score);
  const best = eligible[0]!;
  const worst = eligible[eligible.length - 1]!;

  return {
    clear: best.score - worst.score >= MIN_GAP,
    best: best.level,
    bestScore: best.score,
    worst: worst.level,
    worstScore: worst.score,
    sample: eligible.reduce((sum, row) => sum + row.count, 0),
  };
}

// --------------------------------------------------------------------------
// Marks
// --------------------------------------------------------------------------
export interface Marks {
  /** The longest sitting that ran to the end and was never paused. */
  unbroken: Interval | null;
  /** The best-scoring sitting. */
  best: Interval | null;
  /** The longest run of consecutive sittings that were all seen through. */
  run: number;
}

/**
 * The account's own high-water marks.
 *
 * ## Why these three and not a day streak
 *
 * A day streak measures turning up, which is worth something, and it is the
 * only thing it measures: a streak is kept intact by one token sitting a day
 * and is destroyed by one holiday, so past a certain length it stops being
 * about the work and starts being about the streak. The app already counts one
 * of those, honestly, on the account — this panel is deliberately not a second.
 *
 * Each of these is a performance somebody actually put in. They are records
 * rather than rates: they cannot be lost by taking a week off, which is the
 * property that makes them safe to show somebody who is tired.
 *
 * `run` breaks on an abandoned sitting rather than on a missed day for the
 * same reason — it is a run of *finishing what you started*, and a fortnight
 * away does not undo the twelve before it.
 */
export function marks(intervals: Interval[]): Marks {
  let unbroken: Interval | null = null;
  let best: Interval | null = null;
  let run = 0;
  let longest = 0;

  intervals.forEach((row) => {
    if (row.finished && row.pauses === 0) {
      if (!unbroken || row.minutes > unbroken.minutes) unbroken = row;
    }
    if (!best || focusScore(row) > focusScore(best)) best = row;
    if (row.finished) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  });

  return { unbroken, best, run: longest };
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

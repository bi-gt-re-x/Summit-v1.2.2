/**
 * Did the change work?
 *
 * The Recommendations tab could compute that closing your three-day gaps was
 * worth four thousand XP a year, show the arithmetic, and put the change on
 * your task list. Then nothing. A page built entirely on "here is the number
 * behind this claim" was missing the only number that would have proved any of
 * it — the one that says the thing you changed three weeks ago moved the thing
 * it promised to move.
 *
 * This is that number.
 *
 * ## Every rule names one measure, and only one
 *
 * A recommendation is not a mood, it is a claim about a specific quantity:
 * "Move one session earlier" claims your late share will fall, and nothing
 * else. `measureFor` is the table of those claims — the quantity, the direction
 * that counts as improvement, and how to compute it from a stretch of days.
 * Two rules deliberately have no entry, because they promised no number; see
 * `UNMEASURED`.
 *
 * ## Nothing is snapshotted
 *
 * The only thing stored when somebody adopts a recommendation is its id and the
 * date (backend/api/analytics.py). The "before" side is recomputed from the day
 * series every time it is asked for, which the series can always answer because
 * it holds every day this account has ever had.
 *
 * That is deliberate and it is the same rule the goals table follows: a figure
 * written down once is a figure that can silently stop agreeing with the
 * arithmetic that produced it. Recomputed, the verdict is always the verdict
 * today's code would reach, and fixing a measure fixes every past reading of it.
 *
 * ## The comparison is equal-length, dated, and refuses to guess
 *
 * `span` days after the adoption against the `span` days before it, with both
 * ends printed so a reader can check the claim against their own memory. It
 * will not produce a verdict until there are `SETTLE` days on the after side,
 * and it will not produce one at all if the account is too young to have a
 * before side — those are `early` and `thin`, and both say what they are
 * waiting for rather than showing a number drawn from four days.
 *
 * ## It never says the change caused anything
 *
 * This is a before-and-after on one account with no control, which is the
 * weakest evidence there is for a causal claim and is stated as such: the
 * wording throughout is "went up" and "held", never "worked" or "because of".
 * A reader who moved house, finished exams and adopted a recommendation in the
 * same week has three explanations and this page can only see one of them. What
 * it can honestly do is put the two numbers next to each other, date them, and
 * let the reader decide — which is what the rest of the tab does with its own
 * figures.
 */
import type { GrowthDay, Task } from '@/types';
import { countActiveDays, isActiveDay } from './activeDay';
import type { MetricPoint } from '@/services/analytics';
import { clockShape, rhythmShape, weekShape } from './behaviour';

// --------------------------------------------------------------------------
// The record
// --------------------------------------------------------------------------
/** One recommendation the reader said they would act on. */
export interface Adopted {
  id: string;
  /** What it was called on the day it was adopted. See the backend note. */
  title: string;
  /** ISO date it was adopted. */
  on: string;
}

// --------------------------------------------------------------------------
// Windows
// --------------------------------------------------------------------------
/**
 * Days on the after side before a verdict is offered.
 *
 * A fortnight, which is the same floor `recommendations` applies before it will
 * generate a rule at all. Anything shorter is one good week or one bad one, and
 * a page that called that a result would be doing the thing this whole file
 * exists to avoid.
 */
export const SETTLE = 14;

/**
 * The longest either side of the comparison gets.
 *
 * Without a cap, a change adopted a year ago would be measured against the
 * whole year before it — a comparison that is technically equal-length and
 * practically meaningless, because it is asking whether last spring resembled
 * the spring before. Sixty days is long enough to see through a bad fortnight
 * and short enough to still be about the change.
 */
export const MAX_SPAN = 60;

/** Days needed on the before side for it to be worth comparing against. */
const MIN_BEFORE = 7;

/** A change smaller than this share of the starting value is not a change. */
const RELATIVE_NOISE = 0.1;

const num = (value: unknown) => Number(value) || 0;

/** Whole days from `from` to `to`, both ISO. Negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** An ISO date `count` days from `iso`. */
function shift(iso: string, count: number): string {
  const at = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(at)) return iso;
  return new Date(at + count * 86_400_000).toISOString().slice(0, 10);
}

/** "3 Aug" — short, because these appear in pairs inside a sentence. */
export function shortDate(iso: string): string {
  const at = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(at)) return iso;
  return new Date(at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** The days in [from, to), by date rather than by position. */
function between(days: GrowthDay[], from: string, to: string): GrowthDay[] {
  return days.filter((day) => day.date >= from && day.date < to);
}

/** The tasks finished in [from, to). */
function finishedBetween(tasks: Task[], from: string, to: string): Task[] {
  return tasks.filter((task) => {
    const day = String(task.completed_at || '').slice(0, 10);
    return Boolean(day) && day >= from && day < to;
  });
}

// --------------------------------------------------------------------------
// What each rule promised
// --------------------------------------------------------------------------
/** Which way this measure has to move for the change to have landed. */
export type Better = 'lower' | 'higher';

export interface Measure {
  /** The quantity, named as the panel prints it. */
  label: string;
  /** Appended to both figures. Empty for a bare count. */
  unit: string;
  better: Better;
  /**
   * The smallest absolute change worth calling a change.
   *
   * Applied alongside a flat 10% of the starting value, whichever is larger —
   * so a count with a floor of 1 is not moved by rounding, and an XP figure
   * with no sensible absolute floor still has to move by a tenth.
   */
  noise: number;
  /**
   * Where the number comes from.
   *
   * `series` measures average behaviour over a stretch of days. `graded` reads
   * the report card's own dated snapshots, because the five graded metrics are
   * not derivable from the day series at all — see `gradedReading`.
   */
  kind: 'series' | 'graded';
  /** For `series` measures: the number over one window. Null if unanswerable. */
  of?: (days: GrowthDay[], tasks: Task[]) => number | null;
  /** For `graded` measures: which metric on the report card. */
  metric?: string;
}

/**
 * The rules that promised no number, and why they are left alone.
 *
 * `rebalance` explicitly declines to say which way is better. Its whole point
 * is that concentration on one subject may be exactly right — "if it is
 * deliberate, protect it" — so a page that then scored the reader on having
 * reduced it would be contradicting its own advice a fortnight later. There is
 * no direction to measure because the rule refused to name one.
 *
 * Everything else here is measurable and is measured, including the two that
 * look like they would not be: the graded-metric rules read the report card's
 * own snapshots, and `restart-fading` carries its subject in its id for exactly
 * this reason.
 *
 * Anything in this map gets an honest "no measure" line rather than a proxy. A
 * proxy that moves for unrelated reasons is worse than an admission.
 */
const UNMEASURED: Record<string, string> = {
  rebalance:
    'No measure — this one asks whether the shape of your week is deliberate. Either answer can be right.',
  'stretch-harder':
    'No measure — difficulty is your own rating, and scoring you on it would be asking for the rating rather than the work.',
  'difficulty-is-the-half':
    'No measure — difficulty is your own rating, and scoring you on it would be asking for the rating rather than the work.',
};

/** The bottom quarter of working days, averaged. What `raise-the-floor` is about. */
function quietDayAverage(days: GrowthDay[]): number | null {
  const worked = days
    .map((day) => num(day.xp_earned))
    .filter((xp) => xp > 0)
    .sort((a, b) => a - b);
  if (worked.length < 4) return null;
  const quiet = worked.slice(0, Math.max(1, Math.floor(worked.length / 4)));
  return quiet.reduce((sum, xp) => sum + xp, 0) / quiet.length;
}

/** The weakest weekday's average XP. What `quietest-weekday` is about. */
function weakestWeekday(days: GrowthDay[]): number | null {
  const stats = weekShape(days).stats.filter((stat) => stat.days > 0);
  if (stats.length < 5) return null;
  return Math.min(...stats.map((stat) => stat.avgXp));
}

/** The longest unbroken run of working days. What `plan-a-light-day` is about. */
function longestRun(days: GrowthDay[]): number | null {
  if (days.length === 0) return null;
  let best = 0;
  let run = 0;
  days.forEach((day) => {
    run = isActiveDay(day) ? run + 1 : 0;
    if (run > best) best = run;
  });
  return best;
}

/**
 * Share of the window's XP in its busiest tenth of working days, 0-100.
 *
 * What `even-out-the-load` and `after-the-peak` both claim to move, and the
 * one figure that separates "the same work, spread" from "less work": it is a
 * share rather than a total, so an account that simply did less scores exactly
 * where it did before rather than being congratulated for slowing down.
 */
function loadConcentration(days: GrowthDay[]): number | null {
  /* Days that *earned*, not days worked — deliberately narrower than
     `isActiveDay`. This is a share of XP, and a day that contributed none of
     it belongs in neither half of the fraction. See utils/activeDay for the
     wider definition and why the two are different questions. */
  const worked = days.map((day) => num(day.xp_earned)).filter((xp) => xp > 0);
  if (worked.length < 4) return null;
  const total = worked.reduce((sum, xp) => sum + xp, 0);
  if (total <= 0) return null;
  const top = [...worked].sort((a, b) => b - a).slice(0, Math.max(1, Math.round(worked.length / 10)));
  return (top.reduce((sum, xp) => sum + xp, 0) / total) * 100;
}

/** Share of working days that carry any focus minutes. What `log-the-focus` is about. */
function focusCoverage(days: GrowthDay[]): number | null {
  const worked = countActiveDays(days);
  if (worked < 4) return null;
  const logged = days.filter((day) => num(day.focus_minutes) > 0).length;
  return (logged / worked) * 100;
}

/** Mean execution star over the tasks finished in the window. 1-5, or null. */
function executionAverage(_days: GrowthDay[], tasks: Task[]): number | null {
  const scores = tasks
    .filter((task) => task.status === 'done')
    .map((task) => Number(task.execution))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);
  if (scores.length < 3) return null;
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

/** Share of finished tasks carrying both stars, 0-100. What `rate-your-work` is about. */
function ratingCoverage(_days: GrowthDay[], tasks: Task[]): number | null {
  const done = tasks.filter((task) => task.status === 'done');
  if (done.length < 4) return null;
  const rated = done.filter(
    (task) =>
      Number.isFinite(Number(task.difficulty)) &&
      Number.isFinite(Number(task.execution)) &&
      Number(task.difficulty) >= 1 &&
      Number(task.execution) >= 1,
  ).length;
  return (rated / done.length) * 100;
}

/**
 * The measure a given advice id claims to move, or null if it claims none.
 *
 * A function rather than a plain map because two of the ids carry their subject
 * in them: `metric-consistency` names a report-card metric, and
 * `restart-fading:math` names the subject it wants restarted. Both were made
 * to carry it precisely so that this file could measure them — see the note on
 * the id in utils/advice.
 */
export function measureFor(id: string): Measure | null {
  if (id in UNMEASURED) return null;

  if (id.startsWith('metric-')) {
    const metric = id.slice('metric-'.length);
    return {
      label: `${metric[0]!.toUpperCase()}${metric.slice(1)} score`,
      unit: '/100',
      better: 'higher',
      noise: 3,
      kind: 'graded',
      metric,
    };
  }

  if (id.startsWith('restart-fading:')) {
    const subject = id.slice('restart-fading:'.length);
    return {
      label: 'XP in that subject',
      unit: ' XP',
      better: 'higher',
      noise: 1,
      kind: 'series',
      of: (_days, tasks) =>
        tasks
          .filter((task) => task.status === 'done' && task.subject === subject)
          .reduce((sum, task) => sum + num(task.xp_value), 0),
    };
  }

  switch (id) {
    case 'close-gaps':
      return {
        label: 'Breaks of 3+ days',
        unit: '',
        better: 'lower',
        noise: 1,
        kind: 'series',
        of: (days) => rhythmShape(days).gapCount,
      };

    case 'one-more-day':
      return {
        label: 'Days worked',
        unit: '%',
        better: 'higher',
        noise: 5,
        kind: 'series',
        of: (days) => rhythmShape(days).activeRate,
      };

    case 'weekend':
      return {
        label: 'Weekend against weekday',
        unit: '%',
        better: 'higher',
        noise: 8,
        kind: 'series',
        of: (days) => weekShape(days).weekendGap,
      };

    case 'longer-sittings':
      return {
        label: 'Typical sitting',
        unit: ' min',
        better: 'higher',
        noise: 5,
        kind: 'series',
        of: (days) => {
          const shape = rhythmShape(days);
          return shape.typicalSession > 0 ? shape.typicalSession : null;
        },
      };

    case 'earlier':
      return {
        label: 'Finished after 10 PM',
        unit: '%',
        better: 'lower',
        noise: 5,
        kind: 'series',
        of: (_days, tasks) => (tasks.length > 0 ? clockShape(tasks).lateShare : null),
      };

    case 'quietest-weekday':
      return {
        label: 'Your weakest weekday',
        unit: ' XP',
        better: 'higher',
        noise: 0,
        kind: 'series',
        of: (days) => weakestWeekday(days),
      };

    case 'raise-the-floor':
      return {
        label: 'Your quietest working days',
        unit: ' XP',
        better: 'higher',
        noise: 0,
        kind: 'series',
        of: (days) => quietDayAverage(days),
      };

    case 'plan-a-light-day':
      return {
        label: 'Longest run with no let-up',
        unit: ' days',
        better: 'lower',
        noise: 2,
        kind: 'series',
        of: (days) => longestRun(days),
      };

    // Both burnout rules about the shape of the load move the same figure, and
    // it is a share rather than a total on purpose — see `loadConcentration`.
    case 'even-out-the-load':
    case 'after-the-peak':
      return {
        label: 'XP in your busiest days',
        unit: '%',
        better: 'lower',
        noise: 5,
        kind: 'series',
        of: (days) => loadConcentration(days),
      };

    case 'execution-slipping':
    case 'execution-is-the-half':
      return {
        label: 'Execution you rated',
        unit: ' / 5',
        better: 'higher',
        noise: 0.3,
        kind: 'series',
        of: executionAverage,
      };

    case 'rate-your-work':
      return {
        label: 'Finished tasks you rated',
        unit: '%',
        better: 'higher',
        noise: 8,
        kind: 'series',
        of: ratingCoverage,
      };

    case 'log-the-focus':
      return {
        label: 'Working days with focus logged',
        unit: '%',
        better: 'higher',
        noise: 8,
        kind: 'series',
        of: (days) => focusCoverage(days),
      };

    default:
      return null;
  }
}

/** The sentence shown for a rule that promised no number. */
export function unmeasuredNote(id: string): string {
  return UNMEASURED[id] ?? 'No measure — this one is not a claim about a number.';
}

// --------------------------------------------------------------------------
// The verdict
// --------------------------------------------------------------------------
export type Outcome =
  /** Not enough days since the change to say anything. */
  | 'early'
  /** Not enough record before the change to compare against. */
  | 'thin'
  /** This rule never promised a number. */
  | 'unmeasured'
  /** The measure moved the way the rule said it would. */
  | 'improved'
  /** It moved, but the other way. */
  | 'worsened'
  /** It did not move enough to call it a move. */
  | 'held';

export interface Review {
  id: string;
  title: string;
  /** ISO date of adoption. */
  on: string;
  outcome: Outcome;
  /** What was being watched. Absent when nothing was. */
  label?: string;
  unit?: string;
  before?: number;
  after?: number;
  /** after − before, in the measure's own unit. */
  delta?: number;
  /** The change as a share of where it started, or null if it started at zero. */
  pct?: number | null;
  /** Days each side of the comparison covers. */
  span?: number;
  /** The dated ends of both windows, for the line under the figures. */
  beforeFrom?: string;
  beforeTo?: string;
  afterFrom?: string;
  afterTo?: string;
  /** Days still to wait, when `early`. */
  daysLeft?: number;
  /** The sentence, already hedged to the strength of what is behind it. */
  note: string;
}

/** Rounds for display without pretending to a precision the input lacks. */
function tidy(value: number): number {
  return Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
}

/**
 * Whether a change is bigger than the measure's own noise.
 *
 * Two floors, whichever is larger: the measure's stated absolute one, and a
 * tenth of where it started. The absolute floor is what stops a count of four
 * breaks becoming three being read as progress; the relative one is what
 * handles the XP measures, where no fixed number would be right for both an
 * account earning 60 XP a day and one earning 900.
 */
function realMove(before: number, after: number, noise: number): boolean {
  const floor = Math.max(noise, Math.abs(before) * RELATIVE_NOISE);
  return Math.abs(after - before) > floor;
}

/**
 * The report card's own reading of a metric, before and after a date.
 *
 * The graded metrics are snapshots rather than a series — a dated row is filed
 * each time the report card is read (backend/tracking/analytics.py) — so this
 * is a point-in-time comparison rather than a windowed one, and it is honest
 * about that: `before` is the last reading taken on or before the day of the
 * adoption, and `after` is the most recent reading there is.
 *
 * Null when either side is missing, which is common and fine: an account that
 * has opened the report card once has nothing to compare against.
 */
function gradedReading(
  points: MetricPoint[],
  on: string,
): { before: number; after: number; beforeOn: string; afterOn: string } | null {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const prior = sorted.filter((point) => point.date <= on);
  const later = sorted.filter((point) => point.date > on);
  const before = prior[prior.length - 1];
  const after = later[later.length - 1];
  if (!before || !after) return null;
  return {
    before: before.score,
    after: after.score,
    beforeOn: before.date,
    afterOn: after.date,
  };
}

export interface ReviewInput {
  adopted: Adopted[];
  /** The whole day series. Sliced here, not by the caller. */
  days: GrowthDay[];
  /** Every task on the account, for the measures counted off completions. */
  tasks: Task[];
  /** The overall metric's dated readings, for the graded measures. */
  graded: Record<string, MetricPoint[]>;
}

/**
 * Every adoption, measured. Most recently adopted first.
 *
 * Newest first because that is the order a reader cares about: the change made
 * last week is the one still being made, and the one from four months ago has
 * either become how they work or been forgotten.
 */
export function reviewAdopted(input: ReviewInput): Review[] {
  const { adopted, days, tasks, graded } = input;
  if (days.length === 0) return [];

  const lastIso = days[days.length - 1]!.date;
  const firstIso = days[0]!.date;

  return [...adopted]
    .sort((a, b) => b.on.localeCompare(a.on))
    .map<Review>((item) => {
      const base = { id: item.id, title: item.title, on: item.on };
      const measure = measureFor(item.id);

      if (!measure) {
        return { ...base, outcome: 'unmeasured', note: unmeasuredNote(item.id) };
      }

      const since = daysBetween(item.on, lastIso);
      if (since < SETTLE) {
        const daysLeft = SETTLE - since;
        return {
          ...base,
          outcome: 'early',
          label: measure.label,
          daysLeft,
          note: `Check back in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}.`,
        };
      }

      // ---- the graded metrics, which are snapshots rather than a series ----
      if (measure.kind === 'graded') {
        const reading = gradedReading(graded[measure.metric ?? ''] ?? [], item.on);
        if (!reading) {
          return {
            ...base,
            outcome: 'thin',
            label: measure.label,
            note: 'No earlier score to compare against.',
          };
        }
        return verdict(base, measure, reading.before, reading.after, {
          span: daysBetween(reading.beforeOn, reading.afterOn),
          beforeFrom: reading.beforeOn,
          beforeTo: reading.beforeOn,
          afterFrom: reading.afterOn,
          afterTo: reading.afterOn,
        });
      }

      // ---- the windowed measures -------------------------------------------
      // `since + 1` because both ends are days of record: a change adopted 19
      // days before the last day has 20 days behind it, counting the day it was
      // adopted. Using `since` dropped the most recent day from every after
      // window — the one day a reader is most likely to check the figure
      // against.
      const span = Math.min(since + 1, MAX_SPAN);
      const beforeStart = shift(item.on, -span);

      const afterDays = between(days, item.on, shift(item.on, span));
      const beforeDays = between(days, beforeStart, item.on);

      if (beforeDays.length < MIN_BEFORE || beforeStart < firstIso) {
        return {
          ...base,
          outcome: 'thin',
          label: measure.label,
          note: 'Not enough history from before this change.',
        };
      }

      const before = measure.of?.(
        beforeDays,
        finishedBetween(tasks, beforeStart, item.on),
      );
      const after = measure.of?.(
        afterDays,
        finishedBetween(tasks, item.on, shift(item.on, span)),
      );

      if (before === null || before === undefined || after === null || after === undefined) {
        return {
          ...base,
          outcome: 'thin',
          label: measure.label,
          note: 'Not enough data yet.',
        };
      }

      return verdict(base, measure, before, after, {
        span,
        beforeFrom: beforeStart,
        beforeTo: shift(item.on, -1),
        afterFrom: item.on,
        afterTo: shift(item.on, span - 1),
      });
    });
}

/** The three outcomes that have two numbers behind them. */
function verdict(
  base: { id: string; title: string; on: string },
  measure: Measure,
  before: number,
  after: number,
  window: {
    span: number;
    beforeFrom: string;
    beforeTo: string;
    afterFrom: string;
    afterTo: string;
  },
): Review {
  const delta = after - before;
  const pct = before !== 0 ? (delta / Math.abs(before)) * 100 : null;
  const moved = realMove(before, after, measure.noise);
  const rightWay = measure.better === 'higher' ? delta > 0 : delta < 0;

  const outcome: Outcome = !moved ? 'held' : rightWay ? 'improved' : 'worsened';
  const direction = delta > 0 ? 'up' : 'down';

  /**
   * The size of the move, in words.
   *
   * A measure already in percent moves by *points*, and calling that a
   * percentage is the difference between "days worked fell from 64% to 41%" and
   * "days worked fell by 23%" — which are different claims, and only one of
   * them is what happened. Everything else takes its own unit.
   */
  const size =
    measure.unit === '%'
      ? `${tidy(Math.abs(delta))} points`
      : `${tidy(Math.abs(delta))}${measure.unit}`;

  const note =
    outcome === 'held'
      ? `${measure.label} has not changed much.`
      : outcome === 'improved'
        ? `${measure.label} went ${direction} ${size}, as intended.`
        : `${measure.label} went ${direction} ${size}, the opposite of what was intended.`;

  return { ...base, outcome, label: measure.label, unit: measure.unit, before, after, delta, pct, note, ...window };
}

// --------------------------------------------------------------------------
// The headline
// --------------------------------------------------------------------------
export interface ReviewSummary {
  /** Every adoption, however it turned out. */
  total: number;
  /** The ones with a verdict — improved, worsened or held. */
  judged: number;
  improved: number;
  worsened: number;
  held: number;
  /** Still counting down. */
  waiting: number;
  /** The sentence at the top of the panel. */
  headline: string;
}

/**
 * What the panel says before any of the rows.
 *
 * It reports the count and stops. There is no encouragement here and no grade:
 * an account that adopted four changes and moved one has been told the fact,
 * and whether one out of four is good is not something this page is in a
 * position to say.
 */
export function summarise(reviews: Review[]): ReviewSummary {
  const improved = reviews.filter((row) => row.outcome === 'improved').length;
  const worsened = reviews.filter((row) => row.outcome === 'worsened').length;
  const held = reviews.filter((row) => row.outcome === 'held').length;
  const waiting = reviews.filter((row) => row.outcome === 'early').length;
  const judged = improved + worsened + held;

  let headline: string;
  if (reviews.length === 0) {
    headline = 'Nothing adopted yet.';
  } else if (judged === 0) {
    headline = waiting > 0
      ? `${waiting} change${waiting === 1 ? '' : 's'} too new to judge.`
      : 'Nothing here can be measured yet.';
  } else {
    headline = `${improved} of ${judged} worked.`;
  }

  return { total: reviews.length, judged, improved, worsened, held, waiting, headline };
}

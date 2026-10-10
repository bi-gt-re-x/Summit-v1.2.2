/**
 * The arithmetic behind Long Term — the chapter that looks forwards.
 *
 * It was the arithmetic behind all four chapters, back when each of them was a
 * panel or two. Focus, Skills and Benchmarks are pages now, with a file each
 * (utils/growthBench; Focus and Skills have since gone); what stayed here is the
 * projection, the outlook and the milestone dates, plus the two date helpers
 * the other three import from it so that four chapters cannot end up spelling a
 * date three different ways.
 *
 * Every figure is read off the day series the backend already builds
 * (`GrowthDay`). Nothing fetches, and nothing compares the account to anyone
 * else — there is no cohort in the data and inventing one would be the worst
 * thing this page could do.
 *
 * **This is the one file on the page that states something that has not
 * happened.** The projections are a straight line drawn at a measured pace and
 * nothing more: no seasonality, no decay, no belief that a good two weeks
 * continues. The panel says which pace it used and over how many days, because
 * a forecast whose assumption is hidden is a claim rather than an estimate.
 */
import type { GrowthDay } from '@/types';
import { levelForTotalXp } from './format';
import { compact, milestones, type Milestone } from './growthSummary';

const num = (value: unknown): number => Number(value) || 0;

/** ISO date `n` days after `iso`. Local, no timezone arithmetic. */
function addDays(iso: string, n: number): string {
  const at = new Date(`${iso}T00:00:00`);
  at.setDate(at.getDate() + n);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(
    at.getDate(),
  ).padStart(2, '0')}`;
}

/** "12 Aug 2026", for a date this file worked out rather than read. */
export function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * XP a day, measured over the last `days` days of the series.
 *
 * Over the days themselves, not over the days that had XP on them: a reader
 * who works three days a week wants a rate that says so, and "XP per active
 * day" would forecast a life they do not live. Quiet days are part of the pace.
 */
export function pacePerDay(all: GrowthDay[], days: number): number {
  const window = all.slice(Math.max(0, all.length - days));
  if (window.length === 0) return 0;
  const earned = window.reduce((sum, day) => sum + num(day.xp_earned), 0);
  return earned / window.length;
}

// --------------------------------------------------------------------------
// Long Term — the future
// --------------------------------------------------------------------------
/** How far back the pace is measured. A month is long enough to average out a
 *  quiet week and short enough to still be about the reader's life now. */
export const PACE_DAYS = 30;

export interface OutlookRow {
  key: string;
  /** "In 3 months". */
  label: string;
  days: number;
  /** Lifetime XP by then, at the measured pace. */
  xp: number;
  /** What that total is worth in levels. */
  level: number;
  /** Levels gained between now and then. */
  levelsGained: number;
  /** The date it lands on. */
  on: string;
}

/**
 * Lifetime XP and level at four horizons, at the pace of the last month.
 *
 * The four are a month, a quarter, half a year and a year, because those are
 * the spans a reader plans in. Each is the same straight line read at a
 * different point — there is one assumption here, not four.
 */
export function outlook(all: GrowthDay[]): OutlookRow[] {
  const last = all[all.length - 1];
  if (!last) return [];

  const rate = pacePerDay(all, PACE_DAYS);
  const now = num(last.cumulative_xp);
  const nowLevel = levelForTotalXp(now).level;

  return [
    { key: '30', label: 'In 30 days', days: 30 },
    { key: '90', label: 'In 3 months', days: 90 },
    { key: '180', label: 'In 6 months', days: 182 },
    { key: '365', label: 'In a year', days: 365 },
  ].map((horizon) => {
    const xp = Math.round(now + rate * horizon.days);
    const { level } = levelForTotalXp(xp);
    return {
      key: horizon.key,
      label: horizon.label,
      days: horizon.days,
      xp,
      level,
      levelsGained: level - nowLevel,
      on: addDays(last.date, horizon.days),
    };
  });
}

export interface ProjectionChart {
  /** Month labels, one per point, past and future together. */
  labels: string[];
  /** Cumulative XP actually recorded, oldest first. */
  past: number[];
  /**
   * The same line continued. It starts at the last recorded point — shared, so
   * the two paths meet rather than leaving a step at the join.
   */
  future: number[];
  /** Index of the shared point: the last recorded day. */
  splitAt: number;
  ticks: number[];
  /** The rate the future is drawn at, XP a day. */
  rate: number;
}

/** How many points each half of the projection is drawn with. */
const PROJECTION_POINTS = 18;

/**
 * The cumulative XP curve, and where it goes next.
 *
 * The recorded half is sampled evenly rather than drawn per day, for the
 * reason `longTermProgress` samples: a year of days in a third of a row is a
 * smear. The projected half is a straight line by construction — this does not
 * pretend to know about a busy December — so its only job is to be obviously
 * the *same* line continued, which is why it starts at the recorded end rather
 * than at a fresh origin.
 */
export function projection(all: GrowthDay[], horizonDays = 180): ProjectionChart {
  const last = all[all.length - 1];
  if (!last || all.length < 2) {
    return { labels: [], past: [], future: [], splitAt: 0, ticks: [0], rate: 0 };
  }

  const rate = pacePerDay(all, PACE_DAYS);
  const now = num(last.cumulative_xp);

  const step = Math.max(1, Math.ceil(all.length / PROJECTION_POINTS));
  const past: number[] = [];
  const labels: string[] = [];
  const monthOf = (iso: string) => {
    const at = new Date(`${iso}T00:00:00`);
    return `${at.toLocaleDateString('en-US', { month: 'short' })} '${String(
      at.getFullYear(),
    ).slice(2)}`;
  };

  all.forEach((day, index) => {
    if (index % step !== step - 1 && index !== all.length - 1) return;
    past.push(num(day.cumulative_xp));
    labels.push(monthOf(day.date));
  });

  const splitAt = past.length - 1;
  const futureStep = Math.max(1, Math.round(horizonDays / PROJECTION_POINTS));
  const future: number[] = [now];
  for (let day = futureStep; day <= horizonDays; day += futureStep) {
    future.push(now + rate * day);
    labels.push(monthOf(addDays(last.date, day)));
  }

  const peak = Math.max(1, future[future.length - 1] ?? now);
  const magnitude = 10 ** Math.floor(Math.log10(peak / 4));
  const tickStep = Math.max(1, Math.ceil(peak / 4 / magnitude) * magnitude);
  const ticks: number[] = [];
  for (let value = 0; value <= peak + tickStep / 2; value += tickStep) ticks.push(value);

  return { labels, past, future, splitAt, ticks, rate };
}

export interface Eta extends Milestone {
  /** Days until it is reached at the measured pace, or null if it is done or
   *  the pace is zero — an account earning nothing never arrives. */
  inDays: number | null;
  /** The date that lands on. */
  on: string | null;
}

/**
 * The three ladders, with a date on each.
 *
 * The XP ladder can be forecast honestly: XP accumulates at a rate this file
 * can measure. Focus hours can too. **The streak cannot** — a streak is not
 * accumulated, it is survived, and a reader on day 1 of a 7-day streak reaches
 * it in six days or never, with nothing in between to average. So its row
 * carries the arithmetic answer and nothing more: days remaining, which is
 * what "if you do not miss one" means.
 */
export function milestoneEtas(all: GrowthDay[], streak: number): Eta[] {
  const last = all[all.length - 1];
  const rate = pacePerDay(all, PACE_DAYS);
  const focusRate =
    all.length > 0
      ? all.slice(Math.max(0, all.length - PACE_DAYS)).reduce((sum, day) => sum + num(day.focus_minutes), 0) /
        Math.min(PACE_DAYS, all.length) /
        60
      : 0;

  return milestones(all, streak).map((row) => {
    const remaining = Math.max(0, row.target - row.progress);
    if (remaining === 0 || !last) return { ...row, inDays: null, on: null };

    const perDay =
      row.kind === 'xp' ? rate : row.kind === 'focus' ? focusRate : 1;
    if (perDay <= 0) return { ...row, inDays: null, on: null };

    const inDays = Math.ceil(remaining / perDay);
    return { ...row, inDays, on: addDays(last.date, inDays) };
  });
}

/** Re-exported so the chapters can label an axis the way Overview does. */
export { compact };

/**
 * The four charts the subject page draws that are not the curve.
 *
 * Same split as the rest of this folder: a lowercase module that works things
 * out, a capitalised one that lays them out. These are pure functions over the
 * task list and over what ./state already counted, and they return the exact
 * shapes components/Analytics/charts takes — `RadarAxis[]`, `Column[]`, a
 * cloud of normalised points — so the page hands them straight to a chart
 * without reshaping anything in the render.
 *
 * ## Why these four and not others
 *
 * Every one of them answers something the page was already saying in prose or
 * in a table and could not show:
 *
 *   `dimensionAxes`  the seven measures as one shape. Seven bars say seven
 *                    things; the web says which of them is the odd one out,
 *                    which is the reading a reader actually wants.
 *   `bandVolume`     how much work sits at each difficulty. The curve draws
 *                    how *well* each rung goes and deliberately not how much
 *                    of it there is — an 88% off three tasks and an 88% off
 *                    ninety are the same bar.
 *   `weekLoad`       which days the work happens on. Nothing else on the page
 *                    counts the calendar.
 *   `effortPoints`   whether longer sessions land better. The time panel had
 *                    the two counts at the ends of this relationship
 *                    ("finished fast, rated poorly", "took longer, landed
 *                    it") and nothing in between.
 *
 * ## Nothing here invents a figure
 *
 * Same rule as ./model and ./state: a task with no `completion_seconds` is not
 * a zero-minute task and a task with no `execution` is not a bad one. Both are
 * dropped from whatever chart needed them, and a chart left with too few
 * points says it has too few rather than drawing a shape out of three.
 */
import type { AnalyticsTask } from '@/services/analytics';
import type { Column, RadarAxis } from '@/components/Analytics';
import type { Band } from './model';
import type { Dimension } from './state';

/** Under this many points a cloud is not a cloud. */
export const CLOUD_FLOOR = 6;

/** Below this, a correlation is not worth a line of fit. See ./graphs.test. */
export const FIT_FLOOR = 0.3;

/** A radar needs three axes before it is a shape rather than a line. */
export const WEB_FLOOR = 3;

/**
 * The seven measures as one web.
 *
 * Only the ones that are known: an unmeasured dimension plotted at nought is a
 * dent in the polygon that reads as a weakness, and "we have not measured your
 * efficiency" is not the same statement as "your efficiency is zero".
 *
 * Momentum is dropped whatever its state. Every other axis is 0-100 where
 * higher is better and the web compares them against each other on that
 * footing; momentum is centred on 50 and means *change*, so a 50 on it is "no
 * movement" while a 50 everywhere else is "middling". One axis meaning
 * something different from the other six is exactly the thing a radar cannot
 * show, and the badge at the top of the page states it in points anyway.
 */
export function dimensionAxes(dimensions: Dimension[]): RadarAxis[] {
  return dimensions
    .filter((entry) => entry.key !== 'momentum' && entry.known && entry.value !== null)
    .map((entry) => ({ label: entry.label, value: Math.max(0, Math.min(1, entry.value! / 100)) }));
}

/**
 * How much work sits at each difficulty, as bars sharing one scale.
 *
 * The peak is marked, so "where does the work actually happen" is answered
 * before a number is read. Empty rungs are kept rather than filtered: the gap
 * where a level should be is the finding on an account that works Fair and
 * Brutal and nothing between them.
 */
export function bandVolume(bands: Band[]): Column[] {
  const most = Math.max(...bands.map((band) => band.done), 0);
  return bands.map((band) => ({
    label: band.label,
    value: band.done,
    text: String(band.done),
    peak: band.done > 0 && band.done === most,
  }));
}

/** Monday first, because a study week is not read starting on Sunday. */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Tasks finished per weekday across the window.
 *
 * Read off `completed_at`, which is the only date on a finished task that
 * means the day the work was done. Rows without one are dropped — an undated
 * completion cannot be put on a weekday, and putting it on Monday because that
 * is index nought is how a chart starts lying.
 */
export function weekLoad(done: AnalyticsTask[]): Column[] {
  const counts = DAYS.map(() => 0);

  for (const task of done) {
    const on = task.completed_at;
    if (!on) continue;
    const day = new Date(`${on.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(day.getTime())) continue;
    // getDay is Sunday-first; DAYS is Monday-first.
    const at = (day.getDay() + 6) % 7;
    counts[at] = (counts[at] ?? 0) + 1;
  }

  const most = Math.max(...counts, 0);
  return DAYS.map((label, at) => {
    const count = counts[at] ?? 0;
    return { label, value: count, text: String(count), peak: count > 0 && count === most };
  });
}

export interface EffortCloud {
  /** Normalised 0-1 on both axes, as components/Analytics/charts wants them. */
  points: Array<[number, number]>;
  /** Pearson's r over the same pairs, or null when there are too few. */
  correlation: number | null;
  /** Whether the cloud has earned a line of fit. */
  fit: boolean;
  /** The minute the x-axis tops out at, so the caller can label it. */
  longest: number;
  /** How many rated, timed tasks are behind it. */
  count: number;
}

/**
 * Minutes spent against how the task went.
 *
 * The one relationship on this page that nothing else states. "Finished fast,
 * rated poorly: 4" and "took longer, landed it: 9" are the two corners of this
 * cloud, and a reader given only the corners cannot tell a subject where time
 * buys marks from one where it does not.
 *
 * The x-axis is cut at the 90th percentile rather than at the longest task,
 * because one four-hour session squashes forty ordinary ones into the left
 * eighth of the box. Anything past the cut sits on the right edge; it is a
 * cloud, and a point on the boundary of a cloud is not a misread figure.
 */
export function effortPoints(done: AnalyticsTask[]): EffortCloud {
  const pairs = done
    .filter((task) => Number(task.completion_seconds) > 0 && Number(task.execution) > 0)
    .map((task) => ({
      minutes: Number(task.completion_seconds) / 60,
      went: (Number(task.execution) - 1) / 4,
    }));

  if (pairs.length < CLOUD_FLOOR) {
    return { points: [], correlation: null, fit: false, longest: 0, count: pairs.length };
  }

  /* Rank over `n - 1` rather than over `n`, which is what keeps the longest
     task off the cut on a small cloud: `floor(n * 0.9)` lands on the last
     index for everything under ten points, so the "90th percentile" was the
     maximum and the trim did nothing on exactly the sample sizes it was for. */
  const sorted = pairs.map((pair) => pair.minutes).sort((a, b) => a - b);
  const cut = Math.max(1, sorted[Math.floor((sorted.length - 1) * 0.9)] ?? 1);

  const points = pairs.map(
    (pair): [number, number] => [Math.min(1, pair.minutes / cut), pair.went],
  );

  const correlation = pearson(points);

  return {
    points,
    correlation,
    fit: Math.abs(correlation ?? 0) >= FIT_FLOOR,
    longest: Math.round(cut),
    count: pairs.length,
  };
}

/** Pearson's r, or null when the cloud is flat on either axis. */
function pearson(points: Array<[number, number]>): number | null {
  const n = points.length;
  if (n < CLOUD_FLOOR) return null;

  const meanX = points.reduce((sum, [x]) => sum + x, 0) / n;
  const meanY = points.reduce((sum, [, y]) => sum + y, 0) / n;

  let top = 0;
  let leftSq = 0;
  let rightSq = 0;
  for (const [x, y] of points) {
    top += (x - meanX) * (y - meanY);
    leftSq += (x - meanX) ** 2;
    rightSq += (y - meanY) ** 2;
  }

  // A column of points has no spread on one axis, and r is undefined there
  // rather than zero. Null says so; zero would claim "no relationship".
  if (leftSq === 0 || rightSq === 0) return null;
  return Math.round((top / Math.sqrt(leftSq * rightSq)) * 100) / 100;
}

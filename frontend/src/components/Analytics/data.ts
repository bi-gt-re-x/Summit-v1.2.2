/**
 * The arithmetic behind the analytics page.
 *
 * Everything here reads the day series the backend already builds — the same
 * rows the growth page slices — so the two pages cannot tell different stories
 * about the same account. Nothing here invents a figure. `scoreHistory` used to
 * sit at the bottom generating a plausible run-up to the growth score, and it
 * went with the rest of the placeholder data: the score panel draws its own
 * recorded readings or draws nothing.
 *
 * The windows here are long ones — a quarter to the whole account — because
 * this page is about trajectory. utils/growthSummary's `RANGES` are the short
 * ones the growth page uses (7/30/90/all), and its helpers all take a
 * `RangeSlice`, so the windows differ and everything downstream is shared.
 */
import {
  compact,
  type RangeSlice,
} from '@/utils/growthSummary';
import { activeRate, isActiveDay } from '@/utils/activeDay';
import type { GrowthDay } from '@/types';

// --------------------------------------------------------------------------
// Windows
// --------------------------------------------------------------------------
export type WindowKey = '7d' | '30d' | '90d' | '1y' | '2y' | 'all';

export interface WindowOption {
  key: WindowKey;
  label: string;
  /** How many days back it reaches, or null for the whole account. */
  days: number | null;
  /** What the compare-with control calls the period before it. */
  compare: string;
}

/**
 * The one window set, shared by every tab on the page.
 *
 * It was four long windows — a quarter to two years — back when this page was
 * only about trajectory. Habits and Insights ask questions at a much shorter
 * range ("what have I been doing this week") and a picker that started at three
 * months could not express them, while a second picker on those tabs would mean
 * two tabs quietly describing different periods, which is the exact failure the
 * single window exists to prevent. So the set spans both: a week for the
 * behavioural tabs, two years and all time for the long view.
 */
export const WINDOWS: WindowOption[] = [
  { key: '7d', label: '7D', days: 7, compare: 'Previous 7 Days' },
  { key: '30d', label: '30D', days: 30, compare: 'Previous 30 Days' },
  { key: '90d', label: '90D', days: 90, compare: 'Previous 90 Days' },
  { key: '1y', label: '1Y', days: 365, compare: 'Previous Year' },
  { key: '2y', label: '2Y', days: 730, compare: 'Previous 2 Years' },
  { key: 'all', label: 'All Time', days: null, compare: 'No earlier period' },
];

export function windowOption(key: WindowKey): WindowOption {
  return WINDOWS.find((entry) => entry.key === key) ?? WINDOWS[3]!;
}

/**
 * The days a window covers, and the equal-length run immediately before them.
 *
 * The same contract `sliceRange` keeps for the short windows, and for the same
 * reason: every "vs previous" figure on the page is the current slice against
 * `previous`, and a baseline of a different length would report the difference
 * in length as a change in behaviour. All Time has no before, by definition —
 * comparing an account against the void it was created out of is not a
 * comparison.
 */
export function sliceWindow(all: GrowthDay[], key: WindowKey): RangeSlice {
  const { days } = windowOption(key);
  if (days === null) return { current: all, previous: [] };
  const start = Math.max(0, all.length - days);
  return {
    current: all.slice(start),
    previous: all.slice(Math.max(0, start - days), start),
  };
}

/** "Jul 3, 2024 – Jul 3, 2026" — the header's date pill, both years spelled. */
export function spanLabel(days: GrowthDay[]): string {
  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;
  if (!first || !last) return 'No data yet';
  const at = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  return first === last ? at(first) : `${at(first)} – ${at(last)}`;
}

/**
 * "Aug '26" — a month on a chart's x axis.
 *
 * The apostrophe is doing real work. These labels used to read "Aug 26", which
 * on an axis running left to right in time is indistinguishable from the 26th
 * of August — and on the compounding chart, where six labels span five years,
 * a reader saw "Aug 26 · Aug 27 · Aug 28" and read a week. The year is the
 * thing that changes between those labels, so it has to look like one.
 */
export function monthLabel(iso: string): string {
  const at = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(at.getTime())) return '';
  const month = at.toLocaleDateString('en-US', { month: 'short' });
  return `${month} '${String(at.getFullYear()).slice(2)}`;
}

/**
 * One date, written out in full, for a chart's readout.
 *
 * Not `monthLabel`: that one names a *slot* on the x axis, where six labels
 * stand in for a year and "Mar '26" is the honest resolution. The readout names
 * the single point under the crosshair, and telling a reader who asked about
 * one day that it happened in March is answering a question they did not ask.
 */
export function pointLabel(iso: string): string {
  const at = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * `want` labels for a run of dates, sampled where the labels are drawn.
 *
 * The x-axis strip is a flex row of equal slots with the label centred in each
 * (`.ax-chart-x` in styles/analytics.css), so the k-th of n labels sits at
 * (k + ½)/n of the width — not at k/(n-1), which is where a naive stride would
 * take its sample from and why the old labels sat about half a slot ahead of
 * the point they named. Sampling at the slot's own centre makes the label and
 * the position agree.
 */
export function axisMarks(dates: string[], want = 6): string[] {
  if (dates.length === 0) return [];
  const count = Math.min(want, dates.length);
  return Array.from({ length: count }, (_, index) => {
    const at = Math.round(((index + 0.5) / count) * (dates.length - 1));
    return monthLabel(dates[Math.min(dates.length - 1, at)] ?? '');
  });
}

/**
 * The same labels for a chart whose x axis is time rather than position.
 *
 * `axisMarks` names the point that sits under each label, which is right when
 * the points are evenly spaced. When they are placed by date — see `at` on
 * AreaChart — the label has to name the *date* under it instead, and there may
 * be no point there at all: the compounding chart has a point every week for a
 * year and then one a quarter for five, so four of its six labels fall in
 * stretches with nothing plotted nearby.
 */
export function axisSpan(fromIso: string, toIso: string, want = 6): string[] {
  const from = new Date(`${fromIso}T00:00:00`).getTime();
  const to = new Date(`${toIso}T00:00:00`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return [];
  return Array.from({ length: want }, (_, index) => {
    const at = new Date(from + ((index + 0.5) / want) * (to - from));
    return monthLabel(at.toISOString().slice(0, 10));
  });
}

/**
 * Where each date sits across the width, 0 to 1 — AreaChart's `at`.
 *
 * Linear in time, which is the whole point: a gap of three months has to be
 * three times the gap of one whatever the spacing of the points either side.
 */
export function datePositions(dates: string[]): number[] {
  const times = dates.map((iso) => new Date(`${iso}T00:00:00`).getTime());
  const from = times[0] ?? 0;
  const to = times[times.length - 1] ?? from;
  const span = to - from || 1;
  return times.map((time) => (Number.isNaN(time) ? 0 : (time - from) / span));
}

// --------------------------------------------------------------------------
// The trajectory chart's five series
// --------------------------------------------------------------------------
export type MetricKey =
  | 'productivity'
  | 'consistency'
  | 'quality'
  | 'xp'
  | 'tasks'
  | 'focus';

export interface MetricOption {
  key: MetricKey;
  label: string;
  /** Reads one day. Cumulative series sum this; rate series average it. */
  read: (day: GrowthDay) => number;
  /**
   * True when the series is a running total — XP earned to date climbs, while
   * productivity is a rate and must not. Drawing a rate cumulatively is how a
   * chart ends up claiming every account improves forever.
   */
  cumulative: boolean;
  /**
   * How much a day counts toward a rate bucket. Defaults to 1 per day.
   *
   * Only quality uses it, and it is the whole reason the series is honest. Its
   * reading exists on the days that rated a task and nowhere else, so a plain
   * average over the bucket divides a week's ratings by seven and draws the
   * result as a collapse in quality — when what actually happened is that the
   * reader skipped an optional prompt on four of the days. Weighting by the
   * number of ratings behind each day makes an unrated day contribute nothing
   * to the bucket instead of contributing a zero, and makes a day that rated
   * six tasks count for six.
   */
  weigh?: (day: GrowthDay) => number;
  format: (value: number) => string;
  /**
   * How the y-axis prints this metric's numbers.
   *
   * Separate from `format` because an axis tick has no room for a unit — it is
   * repeated six times up the left edge and the panel has already said what the
   * series is. Defaults to `compact` at the call site.
   */
  axis?: (value: number) => string;
}

const num = (value: unknown) => Number(value) || 0;

/**
 * The chart's series, the three that matter first.
 *
 * The order here is the order of the chips above the chart, and it opens on the
 * three rates rather than on the three totals underneath them. A cumulative
 * series is a line that can only go up: it draws the same reassuring climb for
 * an account that is accelerating and one that has nearly stopped, because the
 * difference between those two is the *slope*, and a total's slope is the one
 * thing a reader does not read off a line. Productivity, consistency and
 * quality are the same record differentiated — flat means flat and down means
 * down — which is what makes them worth a chart at all.
 *
 * The totals are still here, below the fold of the chip row, because "how much
 * have I banked" is a real question. It is just not the first one.
 */
export const METRICS: MetricOption[] = [
  {
    key: 'productivity',
    label: 'Productivity',
    read: (day) => num(day.xp_earned),
    cumulative: false,
    format: (value) => `${Math.round(value).toLocaleString()} XP/day`,
  },
  {
    // A day is worked or it is not, so the raw series is 0s and 100s and the
    // *bucket* is what carries the meaning: averaging a week of them is the
    // share of that week worked. At daily grain this is deliberately a barcode
    // — the grain picker is right there, and weekly is where it becomes a line.
    key: 'consistency',
    label: 'Consistency',
    /* The same test the tile and the panel use, so the chart of consistency
       and the figure above it cannot describe different days. */
    read: (day) => (isActiveDay(day) ? 100 : 0),
    cumulative: false,
    format: (value) => `${Math.round(value)}% of days`,
    axis: (value) => `${Math.round(value)}%`,
  },
  {
    // Difficulty × execution over the day's rated tasks. `weigh` is what keeps
    // the unrated days out of the bucket rather than dragging it to zero — see
    // `bucketed`, and the note on GrowthDay.rated_tasks for why that matters.
    key: 'quality',
    label: 'Quality',
    read: (day) => num(day.quality_score),
    weigh: (day) => num(day.rated_tasks),
    cumulative: false,
    format: (value) => `${value.toFixed(1)} / 25`,
    axis: (value) => value.toFixed(1),
  },
  {
    key: 'xp',
    label: 'XP Earned (total)',
    read: (day) => num(day.xp_earned),
    cumulative: true,
    format: (value) => `${compact(value)} XP`,
  },
  {
    key: 'tasks',
    label: 'Tasks (total)',
    read: (day) => num(day.tasks_completed),
    cumulative: true,
    format: (value) => `${Math.round(value).toLocaleString()} tasks`,
  },
  {
    key: 'focus',
    label: 'Focus Time (total)',
    read: (day) => num(day.focus_minutes) / 60,
    cumulative: true,
    format: (value) => `${Math.round(value).toLocaleString()}h`,
  },
];

export function metricOption(key: MetricKey): MetricOption {
  return METRICS.find((entry) => entry.key === key) ?? METRICS[0]!;
}

export type Grain = 'daily' | 'weekly' | 'monthly';

export const GRAINS: Array<{ key: Grain; label: string; days: number }> = [
  { key: 'daily', label: 'Daily', days: 1 },
  { key: 'weekly', label: 'Weekly', days: 7 },
  { key: 'monthly', label: 'Monthly', days: 30 },
];

/**
 * The grains a window of this many days can actually draw, coarsest last.
 *
 * A grain needs two buckets to be a line at all, and a picker that offers one
 * it cannot draw is a control that appears to do nothing: choosing Monthly on
 * a 7-day window produced a single point, `linePath` refused a series of one,
 * and the chart went blank with the select still reading "Monthly". Offering
 * only what the window supports says the same thing honestly — the option is
 * absent because the range is short, and it comes back when the range grows.
 *
 * Daily is always offered, because a window with fewer than two days has
 * nothing to draw at any grain and the empty chart is then about the record
 * rather than about the picker.
 */
export function grainsFor(dayCount: number): typeof GRAINS {
  const usable = GRAINS.filter((entry) => dayCount >= entry.days * 2);
  return usable.length > 0 ? usable : [GRAINS[0]!];
}

/** The chosen grain if this window can draw it, otherwise the coarsest it can. */
export function grainWithin(grain: Grain, dayCount: number): Grain {
  const usable = grainsFor(dayCount);
  return usable.some((entry) => entry.key === grain) ? grain : usable[usable.length - 1]!.key;
}

export interface SeriesPoint {
  /** The bucket's closing day, ISO. */
  date: string;
  value: number;
}

/**
 * One metric over one window, bucketed.
 *
 * Two years of days is 730 points in a box a few hundred pixels wide, which is
 * a smear rather than a line — so days are grouped and the bucket is closed on
 * its last day. A cumulative metric reads its running total off that closing
 * day; a rate averages the days inside it. Getting that backwards is the
 * difference between "XP to date" and "XP on the last Tuesday of the month".
 *
 * Buckets are also what makes the previous period drawable on the same axis:
 * two runs of the same length bucket to the same number of points, so the
 * dashed line sits under the solid one at the same x for the same distance
 * into the period rather than at the same date.
 *
 * **`maxPoints` is a safety ceiling, not the grain.** It used to default to 60,
 * which is roughly the number of points that reads as a line in a box this
 * wide — and that number, applied as `max(grainDays, days/60)`, quietly ate the
 * grain picker on every long window. A year is 365 days, so daily asked for
 * 1-day buckets, got `ceil(365/60)` = 7, and drew exactly the weekly chart;
 * two years gave both daily and weekly 13-day buckets. On the page's default
 * window, two of the three options were the same picture. The ceiling is a
 * thousand now: high enough that every window the picker offers draws its grain
 * as asked, and still there so a decade of "All Time" at daily grain does not
 * try to put four thousand points through one path. Callers that genuinely want
 * a coarse series — the compounding chart — pass their own number.
 */
export function bucketed(
  days: GrowthDay[],
  metric: MetricOption,
  grain: Grain,
  maxPoints = 1000,
): SeriesPoint[] {
  if (days.length === 0) return [];

  const grainDays = GRAINS.find((entry) => entry.key === grain)?.days ?? 1;
  const size = Math.max(grainDays, Math.ceil(days.length / maxPoints));

  const out: SeriesPoint[] = [];
  let running = 0;
  let inBucket = 0;
  let count = 0;
  // A weighted metric's last drawn value, carried across buckets that had no
  // readings at all. Without it two weeks with nothing rated puts a hole in
  // the middle of the line, and a hole reads as a crash rather than a silence.
  let held = 0;

  days.forEach((day, index) => {
    const weight = metric.weigh ? metric.weigh(day) : 1;
    const value = metric.read(day);
    running += value;
    inBucket += value * weight;
    count += weight;

    if (index % size !== size - 1 && index !== days.length - 1) return;
    if (!metric.cumulative && count > 0) held = inBucket / count;
    out.push({
      date: day.date,
      value: metric.cumulative ? running : count > 0 ? inBucket / count : held,
    });
    inBucket = 0;
    count = 0;
  });

  return out;
}

// --------------------------------------------------------------------------
// Consistency
// --------------------------------------------------------------------------
export interface Consistency {
  /** Share of the window's days that had work on them, 0-100. */
  rate: number;
  /** The same for the period before, or null when there is none. */
  previousRate: number | null;
  /** "May 2025", and the share of its days that were active. */
  bestMonth: { label: string; rate: number } | null;
}

/* Was `xp_earned > 0` here, which is a narrower thing than the same figure
   meant three files away. See utils/activeDay: a focus session earns no XP, so
   this panel and the gates on the page were counting different Tuesdays. */

/**
 * How much of the window was worked, and which calendar month was worked most.
 *
 * Active days over days in the window, not over days since the account was
 * created: a reader looking at 2Y is asking about those two years. A month is
 * only eligible for "most consistent" once the window holds most of it —
 * otherwise the current month, three days old and all three worked, wins every
 * time at 100% and the panel congratulates the reader for Tuesday.
 */
export function consistency(slice: RangeSlice): Consistency {
  const byMonth = new Map<string, GrowthDay[]>();
  slice.current.forEach((day) => {
    const key = day.date.slice(0, 7);
    const bucket = byMonth.get(key);
    if (bucket) bucket.push(day);
    else byMonth.set(key, [day]);
  });

  let bestMonth: Consistency['bestMonth'] = null;
  byMonth.forEach((days, key) => {
    if (days.length < 20) return;
    const rate = activeRate(days);
    if (bestMonth && rate <= bestMonth.rate) return;
    const at = new Date(`${key}-01T00:00:00`);
    bestMonth = {
      label: at.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      rate: Math.round(rate),
    };
  });

  const comparable = slice.previous.length === slice.current.length;
  return {
    rate: Math.round(activeRate(slice.current)),
    previousRate: comparable ? Math.round(activeRate(slice.previous)) : null,
    bestMonth,
  };
}

// --------------------------------------------------------------------------
// Compounding
// --------------------------------------------------------------------------
export interface Compounding {
  /** XP a day, averaged over every day of the window. */
  dailyAverage: number;
  projectedYear: number;
  projectedFiveYear: number;
  /** The account's real running total, bucketed. */
  actual: SeriesPoint[];
  /** Where the current pace leads, from today to five years out. */
  projected: SeriesPoint[];
}

/**
 * What the current pace comes to if it simply continues.
 *
 * A straight-line projection and nothing cleverer: XP a day times the days
 * ahead, added to what is already banked. The curve in the panel bends because
 * the actual half is a real history that accelerated, not because the forecast
 * assumes acceleration — a projection that compounds its own growth rate would
 * promise every account the moon by year three.
 */
export function compounding(slice: RangeSlice, all: GrowthDay[]): Compounding {
  const days = slice.current;
  const earned = days.reduce((sum, day) => sum + num(day.xp_earned), 0);
  const dailyAverage = days.length ? earned / days.length : 0;

  const actual = bucketed(days, metricOption('xp'), 'weekly', 40).map((point, _index, list) => ({
    ...point,
    // Running total of the window, lifted onto the account's lifetime total so
    // the two halves of the chart meet rather than stepping at the join.
    value:
      num(all[all.length - 1]?.cumulative_xp) -
      (list[list.length - 1]!.value - point.value),
  }));

  const banked = num(all[all.length - 1]?.cumulative_xp);
  const lastDate = days[days.length - 1]?.date ?? new Date().toISOString().slice(0, 10);
  const projected: SeriesPoint[] = [];
  for (let month = 0; month <= 60; month += 3) {
    const at = new Date(`${lastDate}T00:00:00`);
    at.setMonth(at.getMonth() + month);
    projected.push({
      date: at.toISOString().slice(0, 10),
      value: banked + dailyAverage * month * 30.44,
    });
  }

  return {
    dailyAverage: Math.round(dailyAverage),
    projectedYear: Math.round(dailyAverage * 365),
    projectedFiveYear: Math.round(dailyAverage * 365 * 5),
    actual,
    projected,
  };
}

// --------------------------------------------------------------------------
// The yearly comparison
// --------------------------------------------------------------------------

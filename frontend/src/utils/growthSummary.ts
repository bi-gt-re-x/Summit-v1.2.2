/**
 * What the growth page says about a stretch of days.
 *
 * The charts have always been the page; everything around them — the summary
 * tiles, the heatmap, the milestones and the insights — is new, and all of it
 * is arithmetic over the one series the backend already builds
 * (`/api/get_growth_data`). Nothing here fetches, holds state or knows about
 * React, which is what lets the page choose a range and recompute every panel
 * from the same rows rather than asking six questions of the server.
 *
 * Two rules run through it and are the ones to argue with if a figure looks
 * wrong:
 *
 * - **A range is a slice of the tail.** "Last 30 days" is the last 30 rows,
 *   not the last 30 days that had something on them — a fortnight off is part
 *   of the story a growth page is telling, and dropping empty days would make
 *   every gap invisible and every average flattering.
 * - **A comparison is against the slice before it, and only a whole one.** The
 *   tiles say "vs the previous 30 days" and mean exactly that: the 30 rows
 *   before the 30 on screen. A range with nothing before it — All time, or an
 *   account younger than the window — shows no comparison rather than
 *   inventing a baseline, and, less obviously, nor does one with a *partial*
 *   baseline. A 56-day-old account asked for the last 30 days has 26 days
 *   behind them, and "30 days' XP against 26 days' XP, down 47%" is a sentence
 *   about the calendar rather than about the reader. Either the previous
 *   window is the same length as the current one or there is no percentage to
 *   quote.
 */
import { isActiveDay } from './activeDay';
import type { GrowthDay } from '@/types';

// --------------------------------------------------------------------------
// Ranges
// --------------------------------------------------------------------------
export type RangeKey = '7' | '30' | '90' | 'all';

export interface RangeOption {
  key: RangeKey;
  label: string;
  /** How many days it covers, or null for the whole account. */
  days: number | null;
}

export const RANGES: RangeOption[] = [
  { key: '7', label: 'Last 7 Days', days: 7 },
  { key: '30', label: 'Last 30 Days', days: 30 },
  { key: '90', label: 'Last 90 Days', days: 90 },
  { key: 'all', label: 'All Time', days: null },
];

export interface RangeSlice {
  /** The days on screen. */
  current: GrowthDay[];
  /** The same number of days immediately before them. Empty when there are none. */
  previous: GrowthDay[];
}

/**
 * The rows a range covers, and the rows it is compared against.
 *
 * All time has no "before", by definition. A window longer than the account
 * takes what there is and compares against nothing, rather than against a
 * padded run of zeroes that would make any activity at all look like infinite
 * growth.
 */
export function sliceRange(all: GrowthDay[], range: RangeKey): RangeSlice {
  const option = RANGES.find((entry) => entry.key === range) ?? RANGES[1]!;
  if (option.days === null) return { current: all, previous: [] };

  const size = option.days;
  const start = Math.max(0, all.length - size);
  return {
    current: all.slice(start),
    previous: all.slice(Math.max(0, start - size), start),
  };
}

/** "Jul 3 – Jul 31, 2026", or the account's whole span. */
export function rangeLabel(days: GrowthDay[]): string {
  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;
  if (!first || !last) return '—';

  const at = (iso: string) => new Date(`${iso}T00:00:00`);
  const short = (iso: string) =>
    at(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const year = at(last).getFullYear();
  return first === last
    ? `${short(first)}, ${year}`
    : `${short(first)} – ${short(last)}, ${year}`;
}

// --------------------------------------------------------------------------
// The four summary tiles
// --------------------------------------------------------------------------
export interface SummaryFigure {
  /** Already rounded for display. */
  value: number;
  /**
   * Percentage change against the previous slice, or null when there is
   * nothing to compare with — a fresh account, All time, or a previous window
   * that earned nothing at all. A rise from zero is not a percentage.
   */
  delta: number | null;
}

export interface GrowthSummaryFigures {
  xp: SummaryFigure;
  tasks: SummaryFigure;
  xpPerDay: SummaryFigure;
  focusHours: SummaryFigure;
  /**
   * Share of the window's days with any work on them, 0-100.
   *
   * The same arithmetic `consistency` in components/Analytics/data does, kept
   * here as well so the headline tile and the heatmap panel under it are one
   * figure rather than two that could drift.
   */
  consistency: SummaryFigure;
  /**
   * Mean difficulty × execution over the window's rated tasks, out of 25.
   *
   * Weighted by how many tasks each day rated rather than averaging the daily
   * averages — a day that rated one task and a day that rated nine are not
   * equal evidence, and treating them as such lets a single outlying Tuesday
   * outvote a whole week.
   */
  quality: SummaryFigure;
  /** How many tasks in the window were rated, and how many were finished. */
  ratedTasks: number;
  finishedTasks: number;
  /** How many days the comparison covers, for the tiles' own wording. */
  comparedDays: number;
}

/**
 * The per-day numbers behind a tile, for the sparkline drawn under it.
 *
 * A tile states one figure for the whole range, which cannot distinguish a
 * month that climbed steadily from one that did everything in its last week.
 * The sparkline is the same range's days in order — no axis, no scale, just
 * the shape — so the tile says how much and the line says how it arrived.
 * They come from the same slice, so the two cannot disagree.
 */
export interface TileSeries {
  xp: number[];
  tasks: number[];
  focusHours: number[];
  /** The rolling active-day rate. See `rollingRate` for why it is not raw. */
  consistency: number[];
  quality: number[];
}

/**
 * How many of the last `window` days had work on them, per day, as a percentage.
 *
 * Consistency read raw is a series of 0s and 100s — a barcode, not a shape, and
 * a sparkline of one is unreadable at 26 pixels high. Rolling it over a week
 * turns the same record into the thing the tile is actually claiming: whether
 * showing up is becoming more or less usual. The window is short enough that a
 * fortnight off still shows as a trough rather than a dip.
 */
function rollingRate(days: GrowthDay[], window = 7): number[] {
  return days.map((_, index) => {
    const from = Math.max(0, index - window + 1);
    const slice = days.slice(from, index + 1);
    const active = slice.filter((day) => (Number(day.xp_earned) || 0) > 0).length;
    return slice.length ? (active / slice.length) * 100 : 0;
  });
}

/** The quality readings there are, held across the days that have none. */
function carriedQuality(days: GrowthDay[]): number[] {
  const first = days.find((day) => (Number(day.rated_tasks) || 0) > 0);
  let last = Number(first?.quality_score) || 0;
  return days.map((day) => {
    if ((Number(day.rated_tasks) || 0) > 0) last = Number(day.quality_score) || 0;
    return last;
  });
}

export function tileSeries(slice: RangeSlice): TileSeries {
  const read = (get: (day: GrowthDay) => number) =>
    slice.current.map((day) => Number(get(day)) || 0);
  return {
    xp: read((day) => day.xp_earned),
    tasks: read((day) => day.tasks_completed),
    focusHours: read((day) => day.focus_minutes / 60),
    consistency: rollingRate(slice.current),
    // Unrated days carry the last rating forward rather than dropping to zero.
    // A sparkline is a shape, and a shape that falls to the floor every time
    // somebody skipped an optional prompt is a picture of the prompt.
    quality: carriedQuality(slice.current),
  };
}

function total(days: GrowthDay[], read: (day: GrowthDay) => number): number {
  return days.reduce((sum, day) => sum + (Number(read(day)) || 0), 0);
}

function change(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function figure(current: number, previous: number, decimals = 0): SummaryFigure {
  const factor = 10 ** decimals;
  return {
    value: Math.round(current * factor) / factor,
    delta: change(current, previous),
  };
}

export function summaryFigures(slice: RangeSlice): GrowthSummaryFigures {
  const { current, previous } = slice;

  // Only a baseline as long as the window on screen can carry a percentage.
  // See the note at the top: a short one compares different lengths of time
  // and reports the difference as if it were a change in behaviour.
  const comparable = previous.length > 0 && previous.length === current.length;
  const before = comparable ? previous : [];

  const xpNow = total(current, (day) => day.xp_earned);
  const xpWas = total(before, (day) => day.xp_earned);
  const tasksNow = total(current, (day) => day.tasks_completed);
  const tasksWas = total(before, (day) => day.tasks_completed);
  const focusNow = total(current, (day) => day.focus_minutes) / 60;
  const focusWas = total(before, (day) => day.focus_minutes) / 60;

  // Per *day of the range*, not per day something happened: a week with one
  // heroic Tuesday and six blank days averaged over one day would read as the
  // best week on record.
  const perDayNow = current.length ? xpNow / current.length : 0;
  const perDayWas = before.length ? xpWas / before.length : 0;

  // Showing up, as a share of the window. Same rule as the rate above — over
  // days in the range, not over days that had something on them, or a fortnight
  // off would raise the figure it ought to lower.
  const rate = (days: GrowthDay[]) =>
    days.length
      ? (days.filter((day) => (Number(day.xp_earned) || 0) > 0).length / days.length) * 100
      : 0;

  // Quality is what the reader said about the work: how hard it was times how
  // well it went, over the tasks they rated. Days with nothing rated are not in
  // the denominator — the prompt is optional, and counting a skipped one as a
  // zero would grade somebody on the answers they declined to give.
  const perTask = (days: GrowthDay[]) => {
    const rated = days.reduce((sum, day) => sum + (Number(day.rated_tasks) || 0), 0);
    if (!rated) return 0;
    const weighted = days.reduce(
      (sum, day) => sum + (Number(day.quality_score) || 0) * (Number(day.rated_tasks) || 0),
      0,
    );
    return weighted / rated;
  };

  return {
    xp: figure(xpNow, xpWas),
    tasks: figure(tasksNow, tasksWas),
    xpPerDay: figure(perDayNow, perDayWas, 1),
    focusHours: figure(focusNow, focusWas, 1),
    consistency: figure(rate(current), rate(before)),
    quality: figure(perTask(current), perTask(before), 1),
    ratedTasks: total(current, (day) => day.rated_tasks),
    finishedTasks: Math.round(tasksNow),
    comparedDays: before.length,
  };
}

// --------------------------------------------------------------------------
// The heatmap
// --------------------------------------------------------------------------
export interface HeatCell {
  /** ISO date, or null for a square with no day behind it — the account is
   *  younger than the window, and the grid is drawn full regardless. */
  date: string | null;
  xp: number;
  /** 0…4 — how dark the square is. 0 is a day with nothing on it. */
  level: number;
}

/**
 * One week, which the panel draws as a column.
 *
 * The unit is a week because that is what a calendar is made of; which axis it
 * ends up on is the panel's business. See `XpHeatmap`.
 */
export interface HeatRow {
  /** "May" on the week a month opens in, '' on every other week. */
  label: string;
  /** Seven cells, Sunday first. Always seven, whatever the window holds. */
  days: HeatCell[];
}

export type HeatWindowKey = '30' | '90' | '365';

export interface HeatWindow {
  key: HeatWindowKey;
  label: string;
  /** How many days of data it covers. */
  days: number;
  /** How many weeks are drawn, which is how many columns. A constant — see below. */
  weeks: number;
}

/** The weekday row headings, in the order the cells of a week are built. */
export const HEAT_WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * The three windows, and how many weeks each is drawn in.
 *
 * **A week is a column and a weekday is a row** — the shape every activity
 * calendar on the internet has, and the only one that survives three windows in
 * one panel. Seven rows is a constant; the column count is what changes, so a
 * year is a wider grid rather than a taller one, and the cells stay square
 * because their size falls out of the width divided by the week count.
 *
 * It was the other way round, and that is what made the long windows look
 * broken: with weeks as rows, fifty-three of them in a panel a few hundred
 * pixels tall gave every cell a height of four pixels and a width of forty. A
 * map of flat rectangles with a hole beside it is not a calendar.
 *
 * The cost of a calendar is that a window does not land on a whole number of
 * weeks: 30 days spans five calendar weeks or six depending on the weekday it
 * opens on, and a panel whose shape must not move cannot afford a grid that
 * changes width with the month. So the week count is fixed at the worst case —
 * six for 30 days, fourteen for 90, fifty-three for a year — and the grid is
 * drawn back from the Saturday of the newest week. Any square that falls
 * outside the window is blank: no date, no fill, outline only. The rectangle is
 * always the same rectangle.
 */
export const HEAT_WINDOWS: HeatWindow[] = [
  { key: '30', label: '30 days', days: 30, weeks: 6 },
  { key: '90', label: '90 days', days: 90, weeks: 14 },
  { key: '365', label: '1 year', days: 365, weeks: 53 },
];

/** ISO date `n` days after `iso`, negative to go back. Local, no timezone. */
function shiftDay(iso: string, n: number): string {
  const at = new Date(`${iso}T00:00:00`);
  at.setDate(at.getDate() + n);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(
    at.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * The last 30 or 90 days as a calendar of squares.
 *
 * The heatmap is the one panel the header's range does not scope — it has its
 * own control, because 7 days is seven squares and nothing worth calling a
 * map, and All time is a decade of them.
 *
 * Every square that has a day behind it carries its date and its XP; every
 * square that does not — the account is younger than the window, or the week
 * runs past today — is drawn as an outline. A grid drawn only where there is
 * data is a grid with holes in it, and the reader cannot tell a quiet Tuesday
 * from a Tuesday before they signed up.
 *
 * Levels are quartiles of the window's own busiest day rather than a fixed XP
 * scale, so the map is readable whether the reader earns 20 XP a day or 2,000.
 * A day with nothing is level 0 — the absence is the information.
 */
export function heatmapGrid(all: GrowthDay[], window: HeatWindowKey): HeatRow[] {
  const shape = HEAT_WINDOWS.find((entry) => entry.key === window) ?? HEAT_WINDOWS[0]!;
  const days = all.slice(Math.max(0, all.length - shape.days));
  const last = all[all.length - 1]?.date;
  if (!last) return [];

  const peak = Math.max(0, ...days.map((day) => Number(day.xp_earned) || 0));

  const byDate = new Map<string, number>();
  days.forEach((day) => byDate.set(day.date, Number(day.xp_earned) || 0));

  // Back from the Saturday of the newest week, so the last row is the week the
  // reader is living in and the newest day sits where the eye already is.
  const end = shiftDay(last, 6 - new Date(`${last}T00:00:00`).getDay());
  const start = shiftDay(end, -(shape.weeks * 7 - 1));

  const rows: HeatRow[] = [];
  let previousMonth = -1;

  for (let week = 0; week < shape.weeks; week++) {
    const cells: HeatCell[] = [];
    let label = '';

    for (let weekday = 0; weekday < 7; weekday++) {
      const date = shiftDay(start, week * 7 + weekday);
      const xp = byDate.get(date);
      if (xp === undefined) {
        cells.push({ date: null, xp: 0, level: 0 });
        continue;
      }
      // Anything above zero gets at least the faintest band, so a 5 XP day is
      // never indistinguishable from a day off.
      const level = xp <= 0 || peak <= 0 ? 0 : Math.max(1, Math.ceil((xp / peak) * 4));
      cells.push({ date, xp, level });

      // The month is named once, on the week it opens in — the first week of
      // the grid included, so the top of the map is never unlabelled.
      const month = new Date(`${date}T00:00:00`).getMonth();
      if (month !== previousMonth && !label) {
        label = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
          month: 'short',
        });
        previousMonth = month;
      }
    }

    rows.push({ label, days: cells });
  }

  return rows;
}

// --------------------------------------------------------------------------
// The strip under the chart
// --------------------------------------------------------------------------
export interface ChartStat {
  key: string;
  label: string;
  /**
   * The figure itself, at the precision it is shown.
   *
   * A number rather than the formatted "15,842 XP" it used to be, because the
   * panel counts these up on arrival and a tween needs something to count. The
   * comma and the unit are the view's — see `ChartStrip`.
   */
  value: number;
  /** "XP", "Days" — what `value` is measured in. */
  unit: string;
  /** A percentage chip beside the value, or null for the ones that get none. */
  delta: number | null;
  /** A quiet second line — the date of the best day. */
  note: string | null;
}

/** The longest run of consecutive days with any XP on them. */
function longestStreak(days: GrowthDay[]): number {
  let best = 0;
  let run = 0;
  days.forEach((day) => {
    if ((Number(day.xp_earned) || 0) > 0) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  });
  return best;
}

/**
 * Five facts about the range, sat under the chart it describes.
 *
 * A line shows the shape and hides every number that made it: the reader can
 * see a spike and cannot read what day it was or what it was worth. These are
 * the five the chart cannot answer, and all of them are the same slice the
 * chart is drawn from, so a figure here can never describe a different window
 * than the line above it.
 *
 * "This week" is the last seven days of the range rather than the calendar
 * week, and it is compared against the seven before them — the same rule the
 * tiles follow, and it is null rather than flattering when there are fewer
 * than fourteen days to work with.
 */
export function chartStats(slice: RangeSlice): ChartStat[] {
  const { current } = slice;
  const xp = total(current, (day) => day.xp_earned);
  const perDay = current.length ? xp / current.length : 0;

  const before = slice.previous.length === current.length ? slice.previous : [];
  const perDayWas = before.length
    ? total(before, (day) => day.xp_earned) / before.length
    : 0;

  let best: GrowthDay | null = null;
  current.forEach((day) => {
    if (!best || (Number(day.xp_earned) || 0) > (Number(best.xp_earned) || 0)) {
      best = day;
    }
  });
  const peak = best as GrowthDay | null;

  const week = current.slice(-7);
  const weekBefore = current.length >= 14 ? current.slice(-14, -7) : [];
  const weekXp = total(week, (day) => day.xp_earned);

  return [
    { key: 'total', label: 'Total XP Earned', value: Math.round(xp), unit: 'XP', delta: null, note: null },
    {
      key: 'average',
      label: 'Daily Average',
      value: Math.round(perDay),
      unit: 'XP',
      delta: change(perDay, perDayWas),
      note: null,
    },
    {
      key: 'best',
      label: 'Best Day',
      value: Math.round(Number(peak?.xp_earned) || 0),
      unit: 'XP',
      delta: null,
      note: peak
        ? new Date(`${peak.date}T00:00:00`).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })
        : null,
    },
    {
      key: 'streak',
      label: 'Longest Streak',
      value: longestStreak(current),
      unit: 'Days',
      delta: null,
      note: null,
    },
    {
      key: 'week',
      label: 'XP This Week',
      value: Math.round(weekXp),
      unit: 'XP',
      delta: change(weekXp, total(weekBefore, (day) => day.xp_earned)),
      note: null,
    },
  ];
}

// --------------------------------------------------------------------------
// The growth trend
// --------------------------------------------------------------------------
export interface TrendLine {
  key: string;
  label: string;
  /** One value per day of the range, as a percentage. */
  points: number[];
}

export interface GrowthTrend {
  lines: TrendLine[];
  /** The gridline values the chart draws — 0%, 50%, 100%. */
  ticks: number[];
  /** Month names down the range, positioned by their share of it. */
  marks: Array<{ label: string; at: number }>;
  /** The headline percentage: the range's XP against the range before it. */
  overall: number | null;
}

/**
 * The shape of getting to the figures the tiles state.
 *
 * The tiles say what the range came to; this says how it arrived, as the share
 * of the range's total banked by each day. A straight diagonal is an even
 * fortnight. A curve that hugs the floor and then leaps is a month where
 * nothing happened until the last week — which is the single most useful thing
 * a summary panel can tell someone, and the one thing four totals cannot.
 *
 * Share of its own range rather than a running total, because a cumulative
 * total opens at whatever the account had already banked, and every range then
 * looks like a gentle slope off a large number. Both lines end at 100% by
 * construction: the question is the path, not the endpoint.
 *
 * The badge beside it is the XP tile's own comparison — this range against the
 * one before it — so the panel's headline figure and its tiles cannot disagree
 * about whether things are going well.
 */
export function growthTrend(slice: RangeSlice): GrowthTrend {
  const { current } = slice;
  const empty: GrowthTrend = { lines: [], ticks: [0, 50, 100], marks: [], overall: null };
  if (current.length < 2) return empty;

  const pace = (read: (day: GrowthDay) => number): number[] => {
    const whole = total(current, read);
    if (whole <= 0) return current.map(() => 0);
    let running = 0;
    return current.map((day) => {
      running += Number(read(day)) || 0;
      return (running / whole) * 100;
    });
  };

  // A month name wherever one opens, placed at its share of the range.
  const marks: Array<{ label: string; at: number }> = [];
  let previousMonth = -1;
  current.forEach((day, index) => {
    const at = new Date(`${day.date}T00:00:00`);
    if (at.getMonth() !== previousMonth) {
      previousMonth = at.getMonth();
      marks.push({
        label: at.toLocaleDateString('en-US', { month: 'short' }),
        at: index / (current.length - 1),
      });
    }
  });

  const before = slice.previous.length === current.length ? slice.previous : [];
  return {
    lines: [
      { key: 'xp', label: 'XP', points: pace((day) => day.xp_earned) },
      { key: 'tasks', label: 'Tasks', points: pace((day) => day.tasks_completed) },
    ],
    ticks: [0, 50, 100],
    marks,
    overall: change(
      total(current, (day) => day.xp_earned),
      total(before, (day) => day.xp_earned),
    ),
  };
}

// --------------------------------------------------------------------------
// Long term progress
// --------------------------------------------------------------------------
export type LongTermKey = '6m' | '1y' | 'all';

export interface LongTermWindow {
  key: LongTermKey;
  label: string;
  /** How many days back it reaches, or null for the whole account. */
  days: number | null;
}

export const LONG_TERM_WINDOWS: LongTermWindow[] = [
  { key: '6m', label: '6M', days: 183 },
  { key: '1y', label: '1Y', days: 365 },
  { key: 'all', label: 'All Time', days: null },
];

export interface LongTermLine {
  key: string;
  label: string;
  /** One value per bucket, in the units the line is named in. */
  points: number[];
  /** What it comes to at the end of the window, formatted for the legend. */
  total: string;
}

export interface LongTermProgress {
  /** "Aug '25" — one per bucket, thinned by the chart if there are too many. */
  labels: string[];
  lines: LongTermLine[];
  /** The XP axis: the four series share a box, and this one owns the numbers. */
  ticks: number[];
}

/** "40K", "8.5K", "620". Exported so the axis and the legend agree. */
export function compact(value: number): string {
  if (value >= 10_000) return `${Math.round(value / 1000)}K`;
  if (value >= 1_000) return `${(value / 1000).toFixed(1)}K`;
  return String(Math.round(value));
}

/**
 * How many points the panel draws, at most.
 *
 * It used to be one per calendar month, which on a young account is three
 * points and two straight lines — a chart with nothing in it to read. Buckets
 * are a fixed number of days instead, chosen so any window lands near this
 * figure: about a fortnight each over a year, about four days each over six
 * months of a new account. Twenty-six is what the panel has room for at a
 * third of a row — enough that the shape of a climb is visible, few enough
 * that the dots do not run into each other.
 */
const LONG_TERM_POINTS = 26;

/**
 * Four running totals over the account's life, a bucket of days at a time.
 *
 * The chart above is about a range; this is about the account, and at a year's
 * width one point per day is a smear. Every series is cumulative and therefore
 * monotonic, which is the point — this panel answers "is the account bigger
 * than it was", and the day-level chart answers "what happened lately".
 *
 * **The four share a box and only XP owns the axis.** Tasks, focus hours and
 * active days are one to three orders of magnitude smaller than XP; on a
 * shared scale they are four flat lines along the bottom. Each is drawn scaled
 * to its own final value, so the shapes are comparable and the numbers are not
 * — which is why every line carries its own total in the legend rather than
 * asking the reader to read one off the axis. See the hint on the panel.
 */
export function longTermProgress(
  all: GrowthDay[],
  window: LongTermKey,
): LongTermProgress {
  const option = LONG_TERM_WINDOWS.find((entry) => entry.key === window) ?? LONG_TERM_WINDOWS[0]!;
  const days = option.days === null ? all : all.slice(Math.max(0, all.length - option.days));
  if (days.length === 0) return { labels: [], lines: [], ticks: [0] };

  // An even number of days per bucket, closed on its last day. Even rather
  // than per calendar month because a month is between 28 and 31 days and the
  // account's first and last are part months — with one point each those three
  // uneven steps are most of a young account's chart. The running totals are
  // read off the closing day, so a bucket is a snapshot and not a sum, and the
  // line between two of them is the climb between two dates.
  interface Bucket {
    label: string;
    xp: number;
    tasks: number;
    focusHours: number;
    activeDays: number;
  }
  const size = Math.max(1, Math.ceil(days.length / LONG_TERM_POINTS));
  const buckets: Bucket[] = [];
  let tasks = 0;
  let activeDays = 0;

  days.forEach((day, index) => {
    const at = new Date(`${day.date}T00:00:00`);
    tasks += Number(day.tasks_completed) || 0;
    if (isActiveDay(day)) activeDays += 1;

    // The last day of a bucket, and always the last day there is — a window
    // that does not divide evenly ends on a short bucket rather than losing it.
    if (index % size !== size - 1 && index !== days.length - 1) return;

    buckets.push({
      label: `${at.toLocaleDateString('en-US', { month: 'short' })} '${String(
        at.getFullYear(),
      ).slice(2)}`,
      xp: Number(day.cumulative_xp) || 0,
      tasks,
      focusHours: (Number(day.cumulative_focus_minutes) || 0) / 60,
      activeDays,
    });
  });

  const peakXp = Math.max(1, ...buckets.map((bucket) => bucket.xp));
  const stepFor = (value: number) => {
    const rough = value / 4;
    const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, rough)));
    return Math.ceil(rough / magnitude) * magnitude;
  };
  const step = stepFor(peakXp);
  const ticks: number[] = [];
  for (let value = 0; value <= peakXp + step / 2; value += step) ticks.push(value);

  const line = (
    key: string,
    label: string,
    read: (bucket: Bucket) => number,
    format: (value: number) => string,
  ): LongTermLine => {
    const raw = buckets.map(read);
    const peak = Math.max(1, ...raw);
    return {
      key,
      label,
      // Scaled into the XP axis so four very different magnitudes share a box.
      points: raw.map((value) => (value / peak) * peakXp),
      total: format(raw[raw.length - 1] ?? 0),
    };
  };

  return {
    labels: buckets.map((bucket) => bucket.label),
    ticks,
    lines: [
      line('xp', 'Total XP', (bucket) => bucket.xp, compact),
      line('tasks', 'Tasks Completed', (bucket) => bucket.tasks, (value) =>
        Math.round(value).toLocaleString(),
      ),
      line('focus', 'Focus Hours', (bucket) => bucket.focusHours, (value) =>
        value.toFixed(1),
      ),
      line('active', 'Active Days', (bucket) => bucket.activeDays, (value) =>
        String(Math.round(value)),
      ),
    ],
  };
}

// --------------------------------------------------------------------------
// Milestones
// --------------------------------------------------------------------------
export type MilestoneKind = 'xp' | 'focus' | 'streak';

export interface Milestone {
  kind: MilestoneKind;
  /** "Reach 25,000 Total XP" — what the row is asking for, in words. */
  name: string;
  /** "20,000 / 25,000 XP" — where the account is against it. */
  sub: string;
  /** The number it asks for, in the ladder's own unit. */
  target: number;
  /** Where the account stands, in that same unit. */
  progress: number;
  /** The badge beside it. A label on the tier, not XP anything awards. */
  reward: number;
  /** The day the account crossed it, ISO, or null while it is still ahead. */
  reachedOn: string | null;
}

/** The three ladders. Each tier is worth a little more to reach than the last. */
const XP_TIERS: Array<[target: number, reward: number]> = [
  [1_000, 50],
  [5_000, 100],
  [10_000, 200],
  [25_000, 350],
  [50_000, 500],
  [100_000, 1_000],
];

const FOCUS_TIERS: Array<[hours: number, reward: number]> = [
  [10, 100],
  [25, 150],
  [50, 250],
  [100, 400],
  [250, 600],
  [500, 1_000],
];

const STREAK_TIERS: Array<[days: number, reward: number]> = [
  [7, 100],
  [14, 200],
  [30, 300],
  [60, 500],
  [100, 750],
  [365, 2_000],
];

/** The next tier still ahead, or the last one when every tier is cleared. */
function nextTier(
  tiers: Array<[number, number]>,
  progress: number,
): [target: number, reward: number] {
  return tiers.find(([target]) => progress < target) ?? tiers[tiers.length - 1]!;
}

/**
 * The three things the account is working towards, one per ladder.
 *
 * It used to be six rungs of one XP ladder with the first five ticked, which
 * is a list nobody reads — the interesting row is always the next one. So it
 * is one row per kind of effort instead: total XP, hours focused, days in a
 * row. Three different ways to be doing well, and the reader can be ahead on
 * one and behind on another, which six rungs of the same ladder cannot show.
 *
 * The day an XP tier was cleared is the first day the running total reached
 * it, read off the series — a fact about the account rather than something
 * that had to be recorded at the time. That only works on the whole history:
 * `all` must be every day since the account was created, which is why the page
 * asks the endpoint for all of them. Focus and streak carry no such date: a
 * cleared focus tier is read the same way, and the streak is the live one from
 * the account's stats, which is a number about right now and has no history
 * behind it here.
 */
export function milestones(all: GrowthDay[], currentStreak = 0): Milestone[] {
  const last = all[all.length - 1];
  const lifetimeXp = Number(last?.cumulative_xp) || 0;
  const lifetimeFocus = (Number(last?.cumulative_focus_minutes) || 0) / 60;

  const [xpTarget, xpReward] = nextTier(XP_TIERS, lifetimeXp);
  const [focusTarget, focusReward] = nextTier(FOCUS_TIERS, lifetimeFocus);
  const [streakTarget, streakReward] = nextTier(STREAK_TIERS, currentStreak);

  const crossed = (read: (day: GrowthDay) => number, target: number) =>
    all.find((day) => (Number(read(day)) || 0) >= target)?.date ?? null;

  return [
    {
      kind: 'xp',
      name: `Reach ${xpTarget.toLocaleString()} Total XP`,
      sub: `${Math.round(lifetimeXp).toLocaleString()} / ${xpTarget.toLocaleString()} XP`,
      target: xpTarget,
      progress: lifetimeXp,
      reward: xpReward,
      reachedOn: lifetimeXp >= xpTarget ? crossed((day) => day.cumulative_xp, xpTarget) : null,
    },
    {
      kind: 'focus',
      name: `${focusTarget} Focus Hours`,
      sub: `${lifetimeFocus.toFixed(1)} / ${focusTarget} Hours`,
      target: focusTarget,
      progress: lifetimeFocus,
      reward: focusReward,
      reachedOn:
        lifetimeFocus >= focusTarget
          ? crossed((day) => day.cumulative_focus_minutes / 60, focusTarget)
          : null,
    },
    {
      kind: 'streak',
      name: `${streakTarget} Day Streak`,
      sub: `${currentStreak} / ${streakTarget} Days`,
      target: streakTarget,
      progress: currentStreak,
      reward: streakReward,
      reachedOn: null,
    },
  ];
}

export interface ReachedMilestone {
  kind: MilestoneKind;
  /** "Reached 10,000 Total XP". */
  name: string;
  /** The day it was crossed, ISO. */
  on: string;
  reward: number;
}

/**
 * The tiers already behind the account, oldest first.
 *
 * `milestones` above answers "what is next", which is the row a reader acts on.
 * This answers "what has happened", which is the one they look back at — a
 * timeline rather than a to-do list. Both read the same three ladders, so the
 * two panels can never disagree about where a tier sits.
 *
 * Every date is read out of the running total rather than recorded at the time:
 * the first day `cumulative_xp` reached the target *is* the day it was reached.
 * That needs the whole history, so `all` must be every day since the account was
 * created — the page asks the endpoint for all of them for this reason.
 *
 * The streak ladder is deliberately absent. The only streak figure available is
 * the live one, which is a fact about today with no history behind it, and a
 * timeline entry needs a date.
 */
export function milestoneHistory(all: GrowthDay[]): ReachedMilestone[] {
  const out: ReachedMilestone[] = [];

  const walk = (
    tiers: Array<[number, number]>,
    read: (day: GrowthDay) => number,
    name: (target: number) => string,
    kind: MilestoneKind,
  ) => {
    tiers.forEach(([target, reward]) => {
      const day = all.find((entry) => (Number(read(entry)) || 0) >= target);
      if (day) out.push({ kind, name: name(target), on: day.date, reward });
    });
  };

  walk(
    XP_TIERS,
    (day) => day.cumulative_xp,
    (target) => `Reached ${target.toLocaleString()} Total XP`,
    'xp',
  );
  walk(
    FOCUS_TIERS,
    (day) => day.cumulative_focus_minutes / 60,
    (target) => `${target} Hours Focused`,
    'focus',
  );

  return out.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
}

// --------------------------------------------------------------------------
// Insights
// --------------------------------------------------------------------------
export interface Insight {
  /** `strong` is the finding; `hint` is what to do about it. */
  headline: string;
  hint: string;
  /** Which of the three icon colours the row is drawn in. */
  tone: 'good' | 'watch' | 'note';
}

const WEEKDAYS = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
];

/** "Tuesdays and Thursdays", "Mondays, Tuesdays and Fridays". */
function listOf(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Mar 14" — a day named in a headline, in the format the range label uses. */
function dayName(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * The fewest rows the panel is allowed to open with.
 *
 * There is no ceiling to match it. There used to be — the function ended in
 * `slice(0, 3)` — and the two problems with that were opposite and both real.
 * At the top it threw away findings that were true: an account whose weekday
 * pattern, weekend gap, pace change and consistency were all worth a row got
 * three of the four, chosen by the order the rules happen to be written in
 * rather than by which mattered. At the bottom it did nothing at all, because a
 * cap cannot make rules fire: a quiet window matched one rule and the panel
 * showed a single line in a card sized for a list.
 *
 * So the cap is gone and this is a floor. The rules below are ordered
 * strongest-first and every one of them is still guarded by the figures — what
 * changed is that there are now enough of them that any window with work in it
 * clears three honestly, rather than three being manufactured. When a window
 * genuinely has nothing in it, `quietRows` says so in three ways that are each
 * a fact about the account rather than an encouragement.
 */
const MIN_INSIGHTS = 3;

/**
 * What is worth saying about the range, chosen from what the figures show.
 *
 * Which rows come out depends only on the numbers, so the panel cannot
 * congratulate a month that went backwards — the failure mode of every
 * "insights" box that ships a fixed string. When there is genuinely nothing to
 * say, it says that instead of reaching for the next rule down.
 */
export function growthInsights(slice: RangeSlice): Insight[] {
  const { current } = slice;
  // The same rule the tiles follow: a baseline shorter than the window on
  // screen is not one. See `summaryFigures`.
  const previous =
    slice.previous.length === current.length ? slice.previous : [];
  const out: Insight[] = [];

  // Which days of the week the work actually happens on. Averaged per weekday
  // rather than totalled, because a 90-day range holds thirteen Mondays and
  // twelve Sundays and the extra Monday is not a finding.
  const byWeekday = Array.from({ length: 7 }, () => ({ xp: 0, days: 0 }));
  current.forEach((day) => {
    const at = new Date(`${day.date}T00:00:00`).getDay();
    const bucket = byWeekday[at]!;
    bucket.xp += Number(day.xp_earned) || 0;
    bucket.days += 1;
  });

  const averages = byWeekday.map((bucket) =>
    bucket.days ? bucket.xp / bucket.days : 0,
  );
  const best = Math.max(...averages);
  if (best > 0) {
    // Anything within a tenth of the best counts as tied with it: naming one
    // day out of two that are level is a claim the figures do not support.
    const names = averages
      .map((value, index) => ({ value, index }))
      .filter((entry) => entry.value >= best * 0.9)
      .map((entry) => WEEKDAYS[entry.index]!);
    if (names.length <= 3) {
      out.push({
        tone: 'good',
        headline: `You're most productive on ${listOf(names)}.`,
        hint:
          names.length === 1
            ? 'Worth protecting that day from everything else.'
            : 'Keep up the great work!',
      });
    }
  }

  // Weekends against weekdays, averaged per day so a range holding thirteen
  // Mondays and twelve Saturdays does not report the extra Monday as a finding.
  const weekend = [0, 6].reduce(
    (acc, at) => ({ xp: acc.xp + byWeekday[at]!.xp, days: acc.days + byWeekday[at]!.days }),
    { xp: 0, days: 0 },
  );
  const weekday = [1, 2, 3, 4, 5].reduce(
    (acc, at) => ({ xp: acc.xp + byWeekday[at]!.xp, days: acc.days + byWeekday[at]!.days }),
    { xp: 0, days: 0 },
  );
  if (weekend.days > 0 && weekday.days > 0 && weekday.xp > 0) {
    const weekendAvg = weekend.xp / weekend.days;
    const weekdayAvg = weekday.xp / weekday.days;
    const gap = Math.round(((weekendAvg - weekdayAvg) / weekdayAvg) * 100);
    // Under a fifth either way is noise, not a pattern worth a whole row.
    if (Math.abs(gap) >= 20) {
      out.push(
        gap < 0
          ? {
              tone: 'watch',
              headline: 'Focus on weekends',
              hint: `Your weekend productivity is ${Math.abs(gap)}% lower than weekdays.`,
            }
          : {
              tone: 'good',
              headline: 'Weekends are your best days',
              hint: `You earn ${gap}% more XP per day on weekends.`,
            },
      );
    }
  }

  const perDayNow = current.length
    ? total(current, (day) => day.xp_earned) / current.length
    : 0;
  const perDayWas = previous.length
    ? total(previous, (day) => day.xp_earned) / previous.length
    : 0;
  const swing = change(perDayNow, perDayWas);

  if (swing !== null && swing !== 0) {
    const up = swing > 0;
    out.push({
      tone: up ? 'good' : 'watch',
      headline: `Your average XP per day has ${up ? 'increased' : 'fallen'} by ${Math.abs(swing)}%`,
      hint: `compared to the previous ${previous.length} days.`,
    });
  }

  // Always sayable, and the one every other rule can fall back on: how much of
  // the range had anything on it at all.
  const worked = current.filter((day) => (Number(day.xp_earned) || 0) > 0);
  const active = worked.length;
  if (active > 0) {
    const share = Math.round((active / current.length) * 100);
    out.push(
      share >= 70
        ? {
            tone: 'good',
            headline: 'Very consistent',
            hint: `You worked on ${share}% of days in this period.`,
          }
        : {
            tone: 'note',
            headline: `You worked on ${active} of ${current.length} days.`,
            hint: 'Working more often helps more than one big day.',
          },
    );
  }

  // The best single day in the window. Not a pattern, which is why it comes
  // after the four rules above — but it is the one figure a reader can go and
  // look at, and it is sayable whenever anything at all happened.
  const peak = worked.reduce<GrowthDay | null>(
    (best, day) =>
      !best || (Number(day.xp_earned) || 0) > (Number(best.xp_earned) || 0) ? day : best,
    null,
  );
  if (peak && active > 1) {
    const peakXp = Math.round(Number(peak.xp_earned) || 0);
    const average = total(worked, (day) => day.xp_earned) / active;
    const times = average > 0 ? peakXp / average : 0;
    // Only when it stands out. On a range where every working day is worth the
    // same, one of them is still arithmetically the largest, and naming that
    // date would be pointing at a tie — the reader would go and look at a day
    // that was no different from the one beside it.
    if (times >= 1.2) {
      out.push({
        tone: 'good',
        headline: `Your best day was ${peakXp.toLocaleString()} XP, on ${dayName(peak.date)}.`,
        hint: `${times.toFixed(1)}× your average day.`,
      });
    }
  }

  // The longest unbroken run inside the window. Deliberately not the account's
  // streak: that figure is on the tiles and counts up to today, where this one
  // is about the stretch on screen and can sit anywhere in it.
  let run = 0;
  let longest = 0;
  current.forEach((day) => {
    run = (Number(day.xp_earned) || 0) > 0 ? run + 1 : 0;
    if (run > longest) longest = run;
  });
  if (longest >= 2) {
    out.push({
      tone: longest >= 7 ? 'good' : 'note',
      headline: `Your longest streak here was ${longest} days.`,
      hint:
        longest >= 7
          ? 'Keep it going.'
          : 'Try to work on back-to-back days.',
    });
  }

  // What the work was made of. Two figures the XP total cannot show on its own:
  // how many things were finished, and how long was actually spent.
  const tasksDone = Math.round(total(current, (day) => day.tasks_completed));
  if (tasksDone > 0 && active > 0) {
    const perDay = tasksDone / active;
    out.push({
      tone: 'note',
      headline: `${tasksDone.toLocaleString()} task${tasksDone === 1 ? '' : 's'} finished.`,
      hint: `About ${perDay.toFixed(1)} per day worked.`,
    });
  }

  const focusMinutes = Math.round(total(current, (day) => day.focus_minutes));
  if (focusMinutes > 0 && active > 0) {
    const hours = focusMinutes / 60;
    const perDay = Math.round(focusMinutes / active);
    out.push({
      tone: 'note',
      headline: `${hours >= 10 ? Math.round(hours).toLocaleString() : hours.toFixed(1)} hours of focus.`,
      hint: `About ${perDay} minutes per day worked.`,
    });
  }

  // Nothing in the window, or so little that the rules above could not fill the
  // panel. Every row here is still a fact about this account — what it is not
  // doing is inventing a finding to reach the floor. See `MIN_INSIGHTS`.
  if (out.length < MIN_INSIGHTS) out.push(...quietRows(current, active, out.length));

  return out;
}

/**
 * What to say about a range that has not given the rules enough to work with.
 *
 * Three honest observations rather than three encouragements: how much of the
 * window is empty, when the last thing happened, and what the panel is waiting
 * for. `have` is how many real findings are already on the list, so a window
 * that produced two gets one of these rather than all three.
 */
function quietRows(days: GrowthDay[], active: number, have: number): Insight[] {
  const last = [...days].reverse().find((day) => (Number(day.xp_earned) || 0) > 0);
  const banked = Math.round(total(days, (day) => day.xp_earned));

  const rows: Insight[] = [
    // A window with no days in it at all is not the same as a window of empty
    // ones, and "no XP on any of these 0 days" is what saying so badly sounds
    // like. It happens on an account whose history has not arrived yet.
    days.length === 0
      ? {
          tone: 'note',
          headline: 'No data yet.',
          hint: 'This fills in from the day you signed up.',
        }
      : active === 0
      ? {
          tone: 'note',
          headline: `No XP in the last ${days.length} days.`,
          hint: 'Try a longer time range.',
        }
      : {
          tone: 'note',
          headline: `${banked.toLocaleString()} XP over ${active} working day${active === 1 ? '' : 's'}.`,
          hint: 'Not enough days for patterns yet.',
        },
    last
      ? {
          tone: 'note',
          headline: `You last worked on ${dayName(last.date)}.`,
          hint: `You earned ${Math.round(Number(last.xp_earned) || 0).toLocaleString()} XP.`,
        }
      : {
          tone: 'note',
          headline: 'Nothing here yet.',
          hint: 'Finish a task to get started.',
        },
    {
      tone: 'note',
      headline: 'Nothing stands out.',
      hint: 'Findings appear here when something changes.',
    },
  ];

  return rows.slice(0, Math.max(0, MIN_INSIGHTS - have));
}

/**
 * The arithmetic behind Focus & Consistency — discipline, not volume.
 *
 * Overview says how much work happened. This says whether it *keeps* happening,
 * and whether the work the reader planned is the work that got done. Two
 * accounts with identical XP totals — one that earned it in a weekend, one that
 * earned it over six weeks — are the same page on Overview and nothing alike
 * here.
 *
 * ## Where the numbers come from
 *
 * Two sources, both already on the page: the day series the backend builds
 * (`GrowthDay`), and the account's tasks. Nothing here fetches, and nothing is
 * invented.
 *
 * **"Planned" means a task with a due date on that day.** That is the only
 * thing in this data that records an intention rather than an outcome — the
 * reader put the task on a day, and the day either came good or it did not.
 * Tasks with no due date are real work but they were never promised to a date,
 * so they cannot be followed through on and they are left out of every planned
 * figure. They still show up in XP, which is what the intensity falls back to
 * when an account plans nothing.
 *
 * **A planned task counts as met if it is done, whenever it was done.** Late is
 * not the same as never, and this page is about follow-through rather than
 * punctuality; `met_deadline` is the field that would answer the other
 * question, and `onTimeShare` is where it is asked.
 *
 * ## Scores
 *
 * Four, each 0-100 with a letter. Every one is a ratio this file can state in a
 * sentence, and the panel prints that sentence — a score whose formula is
 * hidden is a horoscope. The letters come off the same bands the report card
 * uses (backend/tracking/analytics.py `grade_for_score`), split into thirds for
 * the +/− so this page and /analytics can never disagree about whether
 * something is a B.
 *
 * The one reference figure that is not read from the account is the focus
 * score's hour: a day's focus is scored against sixty minutes. The daily focus
 * *goal* lives in the focus-day records, which this page does not have, so the
 * hour is stated on the card rather than passed off as the reader's own target.
 */
import type { GrowthDay, Task } from '@/types';
import { activeRate, countActiveDays } from './activeDay';
import { gradeFor as letterFor } from './analyticalScore';
import type { Subject } from '@/services/subjects';

const num = (value: unknown): number => Number(value) || 0;

/** ISO date `n` days from `iso`. Local, no timezone arithmetic. */
function shiftDay(iso: string, n: number): string {
  const at = new Date(`${iso}T00:00:00`);
  at.setDate(at.getDate() + n);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(
    at.getDate(),
  ).padStart(2, '0')}`;
}

/** "August 8" — the heading on a day's detail. */
export function dayName(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
}

/**
 * A 0-100 score as a letter.
 *
 * Delegates, and that is the whole point of it. This used to carry its own
 * table — S/A/B/C/D/F at 95/85/72/65/40 — plus a modifier for which third of a
 * band the score sat in, under a comment promising that the base letter was
 * always the one /analytics would print. It was a promise made by two copies of
 * the boundaries, and it broke the moment the real ones moved: the report card
 * runs on the school scale now, with A+ at 96 and S reserved for 100.
 *
 * So there is one table, in utils/analyticalScore, mirroring the backend's. The
 * thirds are gone with the second copy — an app that shows "B−" here and "B"
 * on the analytics page for the same number is not more precise, it is
 * disagreeing with itself in a way the reader has no way to resolve.
 */
export function gradeFor(score: number): string {
  return letterFor(score);
}

// --------------------------------------------------------------------------
// Planned work, by day
// --------------------------------------------------------------------------
export interface PlanCount {
  planned: number;
  /** Planned tasks that are done — whenever they were finished. */
  met: number;
  /** Tasks finished on this day, planned for it or not. */
  finished: number;
}

/**
 * Every day's planned and finished counts, keyed by ISO date.
 *
 * Built once and read by everything below it: the heatmap, the weekly chart,
 * the follow-through score and the calendar all count the same tasks the same
 * way, which is the only reason the four can be shown on one screen.
 */
export function planIndex(tasks: Task[]): Map<string, PlanCount> {
  const index = new Map<string, PlanCount>();
  const at = (day: string): PlanCount => {
    const row = index.get(day) ?? { planned: 0, met: 0, finished: 0 };
    index.set(day, row);
    return row;
  };

  tasks.forEach((task) => {
    const due = (task.due_date || '').slice(0, 10);
    if (due) {
      const row = at(due);
      row.planned += 1;
      if (task.status === 'done') row.met += 1;
    }
    const done = (task.completed_at || '').slice(0, 10);
    if (done && task.status === 'done') at(done).finished += 1;
  });

  return index;
}

export interface PlanDay {
  /** ISO date, or null for a square with no day behind it. */
  date: string | null;
  planned: number;
  met: number;
  finished: number;
  /** `met / planned` as a percentage, or null on a day nothing was planned for. */
  completion: number | null;
  xp: number;
  focusMinutes: number;
  /**
   * 0…4 — how dark the square is: the day's XP against the busiest day in the
   * window. The darkest square is the most XP, the faintest is the least, and
   * a day with none is empty.
   *
   * **It used to be the day's plan completion**, falling back to XP only where
   * nothing had been planned — so a square's darkness meant one thing on some
   * days and another on others, and the same calendar on Overview shaded the
   * same day differently. One meaning: how much was done. What the reader
   * *planned* is not lost, it is read off the day panel beside the map, which
   * is where the reader looks for it anyway.
   */
  level: number;
}

export interface PlanWeek {
  /** "May" on the week a month opens in, '' on every other week. */
  label: string;
  days: PlanDay[];
}

/**
 * The last `days` days as a calendar of squares, shaded by XP.
 *
 * The same shape `heatmapGrid` builds for Overview — seven columns Sunday to
 * Saturday, drawn back from the Saturday of the newest week so the rectangle is
 * always the same rectangle — and, now, the same question: how much was done.
 * Darkest is the busiest day of the window, faintest is the quietest that still
 * had something in it, empty is a day with nothing.
 *
 * It used to shade by follow-through, which read well in a sentence and badly
 * on a grid: a day with one easy task planned and done was as dark as the
 * hardest day of the month, and a day nothing was planned for fell back to XP —
 * so two squares of the same shade could mean two different things. Every cell
 * still carries its plan (`planned`, `met`, `completion`); the day panel beside
 * the map prints them, which is where a percentage belongs.
 */
export function plannedGrid(
  all: GrowthDay[],
  tasks: Task[],
  days: number,
  weeks: number,
): PlanWeek[] {
  const last = all[all.length - 1]?.date;
  if (!last) return [];

  const window = all.slice(Math.max(0, all.length - days));
  const plans = planIndex(tasks);
  const peak = Math.max(0, ...window.map((day) => num(day.xp_earned)));
  const byDate = new Map(window.map((day) => [day.date, day]));

  const end = shiftDay(last, 6 - new Date(`${last}T00:00:00`).getDay());
  const start = shiftDay(end, -(weeks * 7 - 1));

  const rows: PlanWeek[] = [];
  let previousMonth = -1;

  for (let week = 0; week < weeks; week++) {
    const cells: PlanDay[] = [];
    let label = '';

    for (let weekday = 0; weekday < 7; weekday++) {
      const date = shiftDay(start, week * 7 + weekday);
      const day = byDate.get(date);
      if (!day) {
        cells.push({
          date: null,
          planned: 0,
          met: 0,
          finished: 0,
          completion: null,
          xp: 0,
          focusMinutes: 0,
          level: 0,
        });
        continue;
      }

      const plan = plans.get(date) ?? { planned: 0, met: 0, finished: 0 };
      const xp = num(day.xp_earned);
      const completion = plan.planned > 0 ? (plan.met / plan.planned) * 100 : null;

      // Quartiles of the window's own busiest day, the same rule
      // `heatmapGrid` follows — so the two calendars on this page cannot shade
      // one day two ways. Anything above zero gets at least the faintest band,
      // so a 5 XP day is never indistinguishable from a day off.
      const level = xp <= 0 || peak <= 0 ? 0 : Math.max(1, Math.ceil((xp / peak) * 4));

      cells.push({
        date,
        planned: plan.planned,
        met: plan.met,
        finished: plan.finished,
        completion,
        xp,
        focusMinutes: num(day.focus_minutes),
        level,
      });

      const month = new Date(`${date}T00:00:00`).getMonth();
      if (month !== previousMonth && !label) {
        label = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short' });
        previousMonth = month;
      }
    }

    rows.push({ label, days: cells });
  }

  return rows;
}

// --------------------------------------------------------------------------
// Week by week
// --------------------------------------------------------------------------
export interface WeekRow {
  key: string;
  /** "Week 1" — counted from the oldest week drawn, as the design labels it. */
  label: string;
  /** "Jul 6" — the Sunday it opens on, for the tooltip. */
  opensOn: string;
  planned: number;
  met: number;
  /** `met / planned`, or null on a week with nothing planned. */
  completion: number | null;
  finished: number;
  xp: number;
}

/**
 * Planned against completed, one bar per week.
 *
 * Weeks rather than days because follow-through is a rhythm and a day is noise:
 * one task planned and missed on a Tuesday is 0%, which says nothing about
 * anybody's discipline. A week is the smallest unit where the ratio means
 * something.
 */
export function weeklyPlan(all: GrowthDay[], tasks: Task[], count = 8): WeekRow[] {
  const last = all[all.length - 1]?.date;
  if (!last) return [];

  const plans = planIndex(tasks);
  const byDate = new Map(all.map((day) => [day.date, day]));

  // Back from the Saturday of the newest week, so the last bar is the week the
  // reader is living in.
  const end = shiftDay(last, 6 - new Date(`${last}T00:00:00`).getDay());
  const rows: WeekRow[] = [];

  for (let week = count - 1; week >= 0; week--) {
    const opens = shiftDay(end, -(week * 7 + 6));
    let planned = 0;
    let met = 0;
    let finished = 0;
    let xp = 0;

    for (let step = 0; step < 7; step++) {
      const date = shiftDay(opens, step);
      const plan = plans.get(date);
      if (plan) {
        planned += plan.planned;
        met += plan.met;
        finished += plan.finished;
      }
      xp += num(byDate.get(date)?.xp_earned);
    }

    rows.push({
      key: opens,
      label: `Week ${count - week}`,
      opensOn: new Date(`${opens}T00:00:00`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      planned,
      met,
      completion: planned > 0 ? Math.round((met / planned) * 100) : null,
      finished,
      xp,
    });
  }

  return rows;
}

/**
 * A straight line through a series of percentages — the overlay on the weekly
 * chart.
 *
 * Least squares over the weeks that have a figure, which is the plainest thing
 * a trend line can be. Weeks with nothing planned have no percentage and are
 * skipped rather than counted as zero: a quiet week is not a failed one.
 */
export function trendLine(values: Array<number | null>): number[] {
  const points = values
    .map((value, index) => ({ value, index }))
    .filter((point): point is { value: number; index: number } => point.value !== null);
  if (points.length < 2) return values.map(() => points[0]?.value ?? 0);

  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.index, 0);
  const sumY = points.reduce((sum, point) => sum + point.value, 0);
  const sumXY = points.reduce((sum, point) => sum + point.index * point.value, 0);
  const sumXX = points.reduce((sum, point) => sum + point.index * point.index, 0);
  const divisor = n * sumXX - sumX * sumX;
  if (divisor === 0) return values.map(() => sumY / n);

  const slope = (n * sumXY - sumX * sumY) / divisor;
  const intercept = (sumY - slope * sumX) / n;
  return values.map((_, index) => intercept + slope * index);
}

// --------------------------------------------------------------------------
// How the focus time is spent
// --------------------------------------------------------------------------
export interface FocusBand {
  key: 'deep' | 'steady' | 'light';
  label: string;
  /** Days in this band. */
  days: number;
  /** Share of the days that had any focus at all, 0-100. */
  share: number;
  /** Percentage points against the previous window, or null with none. */
  delta: number | null;
}

export interface FocusMix {
  bands: FocusBand[];
  /** Days with any focus on them, in the window. */
  focusDays: number;
  /** Days in the window at all. */
  totalDays: number;
  minutes: number;
}

/** Where a focus day stops being a session and starts being a sitting. */
const DEEP_MINUTES = 90;
const STEADY_MINUTES = 30;

/**
 * Deep, steady and light focus days.
 *
 * The spec asks for "distracted", and this data cannot see distraction — a
 * focus session records how long it ran and nothing about what happened inside
 * it. What it *can* see is length, and length is the honest half of that
 * question: an hour and a half in one sitting is a different kind of day from
 * three ten-minute ones. So the bands are stated in minutes on the panel, and
 * nothing here calls a reader distracted.
 *
 * Days with no focus at all are outside the split rather than a fourth band.
 * They are already the subject of every consistency figure on the page, and
 * counting them here would make a reader who tracks focus twice a week look
 * mostly "light" when their light days are the two they tracked.
 */
export function focusMix(all: GrowthDay[], days = 90): FocusMix {
  const split = (window: GrowthDay[]) => {
    const counts = { deep: 0, steady: 0, light: 0 };
    let minutes = 0;
    window.forEach((day) => {
      const value = num(day.focus_minutes);
      minutes += value;
      if (value <= 0) return;
      if (value >= DEEP_MINUTES) counts.deep += 1;
      else if (value >= STEADY_MINUTES) counts.steady += 1;
      else counts.light += 1;
    });
    const total = counts.deep + counts.steady + counts.light;
    return { counts, total, minutes };
  };

  const now = split(all.slice(Math.max(0, all.length - days)));
  const before = split(all.slice(Math.max(0, all.length - days * 2), Math.max(0, all.length - days)));

  const shareOf = (count: number, total: number) => (total > 0 ? Math.round((count / total) * 100) : 0);

  const bands: FocusBand[] = (
    [
      ['deep', `Deep — ${DEEP_MINUTES}m or more`],
      ['steady', `Steady — ${STEADY_MINUTES}–${DEEP_MINUTES}m`],
      ['light', `Light — under ${STEADY_MINUTES}m`],
    ] as const
  ).map(([key, label]) => {
    const share = shareOf(now.counts[key], now.total);
    const was = before.total > 0 ? shareOf(before.counts[key], before.total) : null;
    return {
      key,
      label,
      days: now.counts[key],
      share,
      delta: was === null ? null : share - was,
    };
  });

  return {
    bands,
    focusDays: now.total,
    totalDays: Math.min(days, all.length),
    minutes: now.minutes,
  };
}

// --------------------------------------------------------------------------
// Habits — the subjects that keep coming back
// --------------------------------------------------------------------------
export interface HabitRow {
  key: string;
  label: string;
  /** Sessions a week over the whole account, to one decimal. */
  perWeek: number;
  /** The best week this subject has ever had, which is the row's denominator. */
  bestWeek: number;
  /** Days since the account was created with a finished task in this subject. */
  activeDays: number;
  /** `activeDays / spanDays`, 0-100 — what the bar draws. */
  consistency: number;
  /** How many days the two figures above are counted over. */
  spanDays: number;
  /** Consecutive weeks, counting back from this one, with at least one session. */
  streak: number;
  bestStreak: number;
  /** Sessions in the last 30 days against the 30 before, as a percentage. */
  delta: number | null;
}

/** How many rows the panel draws. Six subjects is a page's worth of habit. */
export const HABIT_ROWS = 6;

/** The window the *trend* on a row compares, whatever the row itself covers. */
const HABIT_TREND_DAYS = 30;

/**
 * The recurring work, one row per subject.
 *
 * The spec asks for "5.2 of 6 planned sessions", and the account has no notion
 * of a planned session — nothing in it says a subject is meant to happen six
 * times a week. What it has is every session that did happen, so the
 * denominator is the reader's own best week rather than a target nobody set:
 * "you are running at 5.2 a week, and your best is 6".
 *
 * **The rate and the bar cover the whole account, not the last thirty days.**
 * A habit is a claim about months, and a thirty-day window makes it a claim
 * about the last one: a subject worked steadily for half a year and left alone
 * in July read as a dead habit, and a subject picked up a fortnight ago read as
 * the reader's strongest. Counted from the account's first day, the bar is the
 * share of this account's whole life that has had this subject in it, which is
 * the thing the panel is called after. `spanDays` is how many days that is, and
 * the panel prints it so the percentage is not a share of an unnamed number.
 *
 * The trend is the exception and stays on thirty days against the thirty
 * before. A lifetime figure has no earlier lifetime to compare against, and
 * "what has this month been like" is a different question the row can still
 * answer.
 *
 * Only named subjects appear. Unfiled tasks are real work, but "Other" is not a
 * habit and a row for it would be the largest one on most accounts.
 */
export function habitRows(
  tasks: Task[],
  subjects: Map<string, Subject>,
  todayIso: string,
  /** Days on record — the account's whole life. Floored at a week, because a
   *  three-day-old account divided into a percentage is noise. */
  accountDays: number,
): HabitRow[] {
  const bySubject = new Map<string, { label: string; days: Set<string> }>();

  tasks.forEach((task) => {
    if (task.status !== 'done') return;
    const day = (task.completed_at || '').slice(0, 10);
    if (!day) return;
    const subject = (task.subject && subjects.get(task.subject)) || null;
    if (!subject) return;

    const row = bySubject.get(subject.id) ?? { label: subject.label, days: new Set<string>() };
    row.days.add(day);
    bySubject.set(subject.id, row);
  });

  const spanDays = Math.max(7, Math.round(accountDays));
  const from = shiftDay(todayIso, -(spanDays - 1));
  // The trend's two windows, which are thirty days each whatever the span is.
  const trendFrom = shiftDay(todayIso, -(HABIT_TREND_DAYS - 1));
  const earlierFrom = shiftDay(todayIso, -(HABIT_TREND_DAYS * 2 - 1));

  /** Which week a day belongs to, counted back from today in sevens. */
  const weekOf = (day: string) => {
    const gap = Math.round(
      (new Date(`${todayIso}T00:00:00`).getTime() - new Date(`${day}T00:00:00`).getTime()) / 86_400_000,
    );
    return Math.floor(gap / 7);
  };

  return [...bySubject.entries()]
    .map(([key, row]) => {
      const days = [...row.days].sort();
      const recent = days.filter((day) => day >= from && day <= todayIso);
      const thisMonth = days.filter((day) => day >= trendFrom && day <= todayIso);
      const earlier = days.filter((day) => day >= earlierFrom && day < trendFrom);

      const perWeekCounts = new Map<number, number>();
      days.forEach((day) => {
        const week = weekOf(day);
        if (week < 0) return;
        perWeekCounts.set(week, (perWeekCounts.get(week) ?? 0) + 1);
      });

      const oldest = Math.max(0, ...perWeekCounts.keys());

      // The week in progress cannot break a streak — it is not over yet — so a
      // quiet week 0 is stepped over rather than counted as a miss.
      let streak = 0;
      for (let week = 0; week <= oldest; week++) {
        const sessions = perWeekCounts.get(week) ?? 0;
        if (sessions > 0) streak += 1;
        else if (week > 0) break;
      }

      let bestStreak = 0;
      let run = 0;
      for (let week = oldest; week >= 0; week--) {
        if ((perWeekCounts.get(week) ?? 0) > 0) {
          run += 1;
          bestStreak = Math.max(bestStreak, run);
        } else {
          run = 0;
        }
      }

      return {
        key,
        label: row.label,
        perWeek: Math.round((recent.length / spanDays) * 7 * 10) / 10,
        bestWeek: Math.max(1, ...perWeekCounts.values()),
        activeDays: recent.length,
        consistency: Math.round((recent.length / spanDays) * 100),
        spanDays,
        streak,
        bestStreak,
        delta:
          earlier.length > 0
            ? Math.round(((thisMonth.length - earlier.length) / earlier.length) * 100)
            : null,
      };
    })
    .sort((a, b) => b.activeDays - a.activeDays || a.label.localeCompare(b.label));
}

// --------------------------------------------------------------------------
// The calendar, and getting back on it
// --------------------------------------------------------------------------
export type DayKind = 'perfect' | 'strong' | 'partial' | 'missed';

export interface RecoveryProfile {
  counts: Record<DayKind, number>;
  totalDays: number;
  /**
   * Of every quiet day that was followed by more days, the share where the
   * reader was back within one day. Null when nothing has been missed.
   */
  rate: number | null;
  /** How long the typical return took, in days. Null with nothing to average. */
  typicalDays: number | null;
  /** The longest run of quiet days that was ever come back from. */
  longestGap: number;
}

/**
 * How the days rank, and what happens after a quiet one.
 *
 * The bands are against the account's own median active day rather than any
 * fixed figure — a "strong day" for someone earning 60 XP a day is not a strong
 * day for someone earning 600, and a threshold in absolute XP would tell one of
 * them a lie.
 *
 * **The recovery figure is the point of this panel.** A calendar of missed days
 * is a page of small failures; the same calendar with "you are back within a
 * day 94% of the time" printed on it is a page about resilience, and the second
 * one is both truer and worth reading.
 */
export function classifyDays(all: GrowthDay[], tasks: Task[]): Map<string, DayKind> {
  const plans = planIndex(tasks);
  const active = all.map((day) => num(day.xp_earned)).filter((xp) => xp > 0).sort((a, b) => a - b);
  const median = active.length ? active[Math.floor(active.length / 2)]! : 0;

  const kinds = new Map<string, DayKind>();
  all.forEach((day) => {
    const xp = num(day.xp_earned);
    if (xp <= 0) {
      kinds.set(day.date, 'missed');
      return;
    }
    const plan = plans.get(day.date);
    const kept = plan && plan.planned > 0 ? plan.met >= plan.planned : true;
    if (xp >= median && kept) kinds.set(day.date, 'perfect');
    else if (xp >= median / 2) kinds.set(day.date, 'strong');
    else kinds.set(day.date, 'partial');
  });

  return kinds;
}

export function recoveryProfile(all: GrowthDay[], tasks: Task[]): RecoveryProfile {
  const kinds = classifyDays(all, tasks);
  const counts: Record<DayKind, number> = { perfect: 0, strong: 0, partial: 0, missed: 0 };
  all.forEach((day) => {
    counts[kinds.get(day.date) ?? 'missed'] += 1;
  });

  // Each run of quiet days that was followed by an active one is one recovery.
  const returns: number[] = [];
  let gap = 0;
  let longestGap = 0;
  all.forEach((day) => {
    if (num(day.xp_earned) <= 0) {
      gap += 1;
      return;
    }
    if (gap > 0) {
      returns.push(gap);
      longestGap = Math.max(longestGap, gap);
    }
    gap = 0;
  });

  const withinOne = returns.filter((run) => run <= 1).length;

  return {
    counts,
    totalDays: all.length,
    rate: returns.length ? Math.round((withinOne / returns.length) * 100) : null,
    typicalDays: returns.length
      ? Math.round((returns.reduce((sum, run) => sum + run, 0) / returns.length) * 10) / 10
      : null,
    longestGap,
  };
}

// --------------------------------------------------------------------------
// The four scores
// --------------------------------------------------------------------------
export interface ScoreCard {
  key: string;
  label: string;
  /** 0-100, or a percentage for follow-through. Null when nothing backs it. */
  value: number | null;
  suffix: string;
  grade: string | null;
  /** Points against the same score 90 days ago, or null with no earlier read. */
  delta: number | null;
  /** The sentence the score is. Printed on the card. */
  foot: string;
  icon: string;
}

/** How far back the arrow on each card compares. */
export const COMPARE_BACK_DAYS = 90;

/** The reference focus day the focus score is measured against. */
export const FOCUS_REFERENCE_MINUTES = 60;

/** Days worked, over days — the plainest consistency there is. */
function consistencyScore(window: GrowthDay[]): number | null {
  if (window.length === 0) return null;
  return Math.round(activeRate(window));
}

/** Average focus minutes a day, against the stated reference hour. */
function focusScore(window: GrowthDay[]): number | null {
  if (window.length === 0) return null;
  const minutes = window.reduce((sum, day) => sum + num(day.focus_minutes), 0);
  return Math.min(100, Math.round((minutes / window.length / FOCUS_REFERENCE_MINUTES) * 100));
}

/** Planned tasks that were done, over planned tasks. */
function followScore(window: GrowthDay[], plans: Map<string, PlanCount>): number | null {
  let planned = 0;
  let met = 0;
  window.forEach((day) => {
    const plan = plans.get(day.date);
    if (!plan) return;
    planned += plan.planned;
    met += plan.met;
  });
  return planned > 0 ? Math.round((met / planned) * 100) : null;
}

/**
 * How alike the weeks are.
 *
 * One minus the coefficient of variation of the weekly XP totals — the standard
 * way to ask "how much does this bounce around", and unitless, so an account
 * earning 60 XP a day and one earning 600 are scored on the same axis. A reader
 * with four identical weeks scores 100; one who does everything in week three
 * scores near zero.
 */
function stabilityScore(window: GrowthDay[]): number | null {
  if (window.length < 14) return null;
  const weeks: number[] = [];
  for (let start = 0; start < window.length; start += 7) {
    const slice = window.slice(start, start + 7);
    if (slice.length < 7) break;
    weeks.push(slice.reduce((sum, day) => sum + num(day.xp_earned), 0));
  }
  if (weeks.length < 2) return null;

  const mean = weeks.reduce((sum, value) => sum + value, 0) / weeks.length;
  if (mean <= 0) return 0;
  const variance =
    weeks.reduce((sum, value) => sum + (value - mean) ** 2, 0) / weeks.length;
  const spread = Math.sqrt(variance) / mean;
  return Math.max(0, Math.min(100, Math.round((1 - spread) * 100)));
}

/**
 * The four hero scores, each with a letter and an arrow.
 *
 * The window is the last `days` days; the arrow is the same score over the
 * equivalent window ending `COMPARE_BACK_DAYS` ago, so it is a like-for-like
 * comparison rather than a month measured against a quarter. A card with
 * nothing behind it says so instead of showing a zero — an account that has
 * never planned a task has no follow-through, which is not the same as bad
 * follow-through.
 */
export function scoreCards(all: GrowthDay[], tasks: Task[], days = 30): ScoreCard[] {
  const plans = planIndex(tasks);
  const now = all.slice(Math.max(0, all.length - days));
  const backTo = Math.max(0, all.length - COMPARE_BACK_DAYS);
  const then = all.slice(Math.max(0, backTo - days), backTo);

  const build = (
    key: string,
    label: string,
    icon: string,
    suffix: string,
    read: (window: GrowthDay[]) => number | null,
    foot: (value: number | null) => string,
  ): ScoreCard => {
    const value = read(now);
    const was = then.length >= Math.min(days, 7) ? read(then) : null;
    return {
      key,
      label,
      icon,
      suffix,
      value,
      grade: value === null ? null : gradeFor(value),
      delta: value === null || was === null ? null : value - was,
      foot: foot(value),
    };
  };

  // Printed as "N of M days had work on them" a few lines down, so it counts
  // what that sentence says it counts. See utils/activeDay.
  const active = countActiveDays(now);
  let planned = 0;
  let met = 0;
  now.forEach((day) => {
    const plan = plans.get(day.date);
    if (!plan) return;
    planned += plan.planned;
    met += plan.met;
  });
  const minutes = now.reduce((sum, day) => sum + num(day.focus_minutes), 0);

  return [
    build('consistency', 'Consistency', 'flame', '', consistencyScore, (value) =>
      value === null ? 'no days yet' : `${active} of ${now.length} days had work on them`,
    ),
    build('focus', 'Focus', 'clock', '', focusScore, (value) =>
      value === null
        ? 'no days yet'
        : `${Math.round(minutes / Math.max(1, now.length))} min a day against a ${FOCUS_REFERENCE_MINUTES}-min day`,
    ),
    build(
      'follow',
      'Follow-Through',
      'check',
      '%',
      (window) => followScore(window, plans),
      (value) => (value === null ? 'nothing was planned for these days' : `${met} of ${planned} planned tasks done`),
    ),
    build('stability', 'Stability', 'target', '', stabilityScore, (value) =>
      value === null ? 'needs two full weeks' : 'how alike your weeks are',
    ),
  ];
}

export interface TrailPoint {
  key: string;
  label: string;
  /** The consistency score as it stood then, or null before the account began. */
  value: number | null;
}

/**
 * Consistency now, and at three points behind it.
 *
 * Each is the same 30-day score ending on that date, so the four are the same
 * measurement taken four times rather than four different windows — which is
 * the only way a column of numbers like this is a progression rather than a
 * coincidence.
 */
export function consistencyTrail(all: GrowthDay[], days = 30): TrailPoint[] {
  const points: Array<[string, string, number]> = [
    ['now', 'Today', 0],
    ['30', '30 days ago', 30],
    ['90', '90 days ago', 90],
    ['180', '6 months ago', 182],
  ];

  return points.map(([key, label, back]) => {
    const end = all.length - back;
    const window = all.slice(Math.max(0, end - days), Math.max(0, end));
    return {
      key,
      label,
      value: window.length >= Math.min(days, 7) ? consistencyScore(window) : null,
    };
  });
}

/** The share of finished tasks that beat their own deadline. */
export function onTimeShare(tasks: Task[]): { pct: number | null; met: number; total: number } {
  const timed = tasks.filter(
    (task) => task.status === 'done' && typeof task.met_deadline === 'boolean',
  );
  const met = timed.filter((task) => task.met_deadline).length;
  return {
    pct: timed.length ? Math.round((met / timed.length) * 100) : null,
    met,
    total: timed.length,
  };
}

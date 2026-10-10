/**
 * The recent window — what "lately" means, in one place.
 *
 * The analytics page's window picker answers *how far back do I want to look*,
 * and for totals and trajectories that is the reader's call to make. Advice is
 * different. A recommendation drawn from a year of record describes a person
 * who may not exist any more: the term ended, the instrument changed, the
 * schedule moved. What you should do differently this week has to be derived
 * from the weeks either side of it, or it is a description of somebody's
 * January being handed to them in August.
 *
 * So everything that tells the reader what to *do* — Next Actions, the growth
 * diagnosis, the discovered patterns, the recommendations — reads a fixed
 * recent window from here rather than the picker. The picker still governs
 * every panel that reports rather than advises.
 *
 * ## Two lengths, and why there are two
 *
 * Two weeks is the shortest span an average can be taken over without a
 * single good Saturday moving it, and it is short enough that the person it
 * describes is the person reading it. That is `RECENT_DAYS`, and it is what the
 * diagnosis and the next actions run on.
 *
 * Patterns need more. "Your accuracy is higher before 5pm" is a claim about two
 * groups of days, and splitting two weeks in two leaves a week on each side —
 * which is not enough to tell a real difference from a good Tuesday. Those read
 * `PATTERN_DAYS`, a month, and still refuse to state a finding that thin
 * evidence would not carry.
 *
 * ## Why it changes once a week and not once a page load
 *
 * Advice that reshuffles every time the tab is opened cannot be acted on: the
 * thing you decided to do this morning is gone by lunchtime, and the reader
 * learns that the page is weather rather than counsel. Advice that never
 * changes is worse in the other direction.
 *
 * A week is the unit the app already thinks in — the streak, the weekly review,
 * the comparison the trends tab draws — and it is long enough to actually try
 * something. The plan's tiebreak is keyed on the ISO week (on the server — see
 * `week_stamp` in backend/tracking/next_actions.py), so it holds still for
 * seven days and then moves, on its own, without a button being pressed. The button exists too (`Refresh`), for the reader who wants a fresh
 * read now, and it re-reads rather than re-rolls: the same week gives the same
 * answer, because the answer is derived, not shuffled.
 */
import type { GrowthDay } from '@/types';

/** The window advice is drawn from: two weeks. */
export const RECENT_DAYS = 14;

/** The window pattern-finding is drawn from: about a month. */
export const PATTERN_DAYS = 28;

/**
 * The fewest days of record before any of this is worth stating.
 *
 * Below it the modules here return nothing rather than an average of four days
 * dressed up as a habit.
 */
export const RECENT_FLOOR = 7;

export interface RecentWindow {
  /** The most recent `span` days on record. */
  current: GrowthDay[];
  /** The `span` days before those, for comparison. Possibly short, or empty. */
  previous: GrowthDay[];
  /** First and last dates of `current`, ISO. Empty strings when there are none. */
  fromIso: string;
  toIso: string;
}

/**
 * The last `span` days, and the `span` before them.
 *
 * Both halves come off the end of the same series, so "previous" is always the
 * stretch immediately before "current" — never a calendar month, which would
 * compare a 28-day February against a 31-day March and call the difference a
 * trend.
 */
export function recentWindow(all: GrowthDay[], span: number = RECENT_DAYS): RecentWindow {
  const current = all.slice(Math.max(0, all.length - span));
  const previousStart = Math.max(0, all.length - span * 2);
  const previous = all.slice(previousStart, Math.max(0, all.length - span));
  return {
    current,
    previous,
    fromIso: current[0]?.date ?? '',
    toIso: current[current.length - 1]?.date ?? '',
  };
}

/** Monday of the week `date` falls in, at local midnight. */
export function weekStart(date: Date = new Date()): Date {
  const at = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const back = (at.getDay() + 6) % 7;
  at.setDate(at.getDate() - back);
  return at;
}

/** How many whole days until this week's advice is replaced. */
export function daysUntilNextWeek(now: Date = new Date()): number {
  const next = weekStart(now);
  next.setDate(next.getDate() + 7);
  return Math.max(0, Math.ceil((next.getTime() - now.getTime()) / 86_400_000));
}

/**
 * A stable 0-1 number from a string.
 *
 * Used to break ties between suggestions of equal weight so the order is the
 * same all week and different next week — seeded with the week stamp, never
 * with the clock. Nothing about *which* suggestions appear depends on this;
 * they are earned by the data. It only settles the order of equals, which
 * would otherwise be whatever order the rules happened to be written in.
 */
export function seeded(key: string): number {
  let hash = 2_166_136_261;
  for (let at = 0; at < key.length; at += 1) {
    hash ^= key.charCodeAt(at);
    hash = Math.imul(hash, 16_777_619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

/** Mean of a list, or 0 for an empty one. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Percentage change from `was` to `now`, or null when there is no baseline.
 *
 * Null rather than 100% when `was` is zero: going from nothing to something is
 * a real event, but it is not a percentage, and printing one is how a chart
 * ends up claiming an infinite improvement.
 */
export function pctChange(now: number, was: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(was) || was === 0) return null;
  return ((now - was) / Math.abs(was)) * 100;
}

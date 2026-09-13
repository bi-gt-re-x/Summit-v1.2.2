/**
 * Turning a pile of record entries into a hall of fame.
 *
 * ## The one idea
 *
 * A row in the `records` table is an *entry*, not a record. "AMC 8, best 25"
 * is not stored anywhere — it is every row named "AMC 8", and the best of them
 * is the largest. Everything this module does follows from that:
 *
 *     the best         the extremum of `value` among the rows
 *     the evolution    those rows in date order — 18 → 20 → 21 → 23 → 25
 *     "+7 since first" the best minus the earliest, signed toward better
 *     "NEW RECORD"     the most recent entry is also the best
 *
 * Which is why nothing here is stored and nothing is written back. It is all a
 * view of rows the page already holds, recomputed when they change.
 *
 * ## Which way is better is one word, and everything else follows from it
 *
 * "Extremum" above, rather than "largest". This module used to treat the
 * larger number as the better one everywhere, which is right for scores,
 * streaks and levels and wrong for a personal best measured in time — a
 * five-minute mile beats a six-minute one. Guessing from the unit does not
 * rescue it: "minutes practised" is a *bigger-is-better* duration and any rule
 * built on `unit === 'minutes'` gets that one backwards.
 *
 * So the row carries `comparison_direction` — see data/sql/records.sql — and
 * the whole comparison model here is that one word applied four times:
 *
 *     best           the extremum in that direction
 *     improvement    best − first, negated when the direction is 'lower'
 *     new record     the latest entry is better than every earlier one
 *     evolution      the entries in date order, which direction does not touch
 *
 * `isBetter` is the only place that knows what the word means. Nothing else in
 * this file, or on the page, compares two figures with `>` — that is what
 * keeps a record measured in seconds from quietly reading upside down in one
 * corner of the UI and correctly in another.
 */
import type { Direction, RecordRow } from '@/services/records';

const DAY = 86_400_000;

/** How recently the newest entry must land to still read as "new". */
export const FRESH_DAYS = 30;

// ---------------------------------------------------------------------------
// Which way is better
// ---------------------------------------------------------------------------
/**
 * Is `a` a better figure than `b`, for a record measured this way?
 *
 * The single place in the app that knows what 'lower' means. Strict, so an
 * equal figure is not an improvement and re-logging the same score does not
 * light up "NEW RECORD".
 */
export function isBetter(a: number, b: number, direction: Direction): boolean {
  return direction === 'lower' ? a < b : a > b;
}

/**
 * The direction a set of entries is measured in.
 *
 * Rows sharing a name are one record and ought to agree, and the dialog fills
 * the field from the last entry so they normally do. When they do not, the
 * newest entry settles it — it is the account's most recent word on the
 * question, and the alternative rules ("any row says lower") let one mistyped
 * entry from a year ago invert a chart that has been right ever since.
 *
 * A row written before the column existed carries null and reads as 'higher',
 * which is what every comparison on this page assumed before it existed. This
 * is the only function allowed to do that reading.
 */
export function directionOf(history: RecordRow[]): Direction {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const said = history[i]!.comparison_direction;
    if (said === 'lower' || said === 'higher') return said;
  }
  return 'higher';
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
/**
 * A figure, printed the way its unit asks.
 *
 * Minutes become "4h 18m" because that is how anybody says a coding session,
 * and 258 is a number you have to do arithmetic on to understand. Everything
 * else is the number and its unit, with the unit dropped when it is one of the
 * generic ones that adds nothing beside a score.
 */
export function formatValue(value: number, unit: string, target = 0): string {
  const clean = Math.round(value * 100) / 100;

  if (unit === 'minutes') {
    const total = Math.max(0, Math.round(clean));
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    const span = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    return target > 0 ? `${span} / ${formatValue(target, 'minutes')}` : span;
  }

  const shown = clean.toLocaleString();
  if (target > 0) return `${shown} / ${(Math.round(target * 100) / 100).toLocaleString()}`;
  return unit && unit !== 'points' ? `${shown} ${unit}` : shown;
}

/** "Aug 12, 2026", or "—" for a milestone that has not happened. */
export function formatOn(iso: string): string {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  // Built from parts, not `new Date(iso)`: a bare YYYY-MM-DD parses as UTC and
  // prints a day early anywhere behind it. Same reasoning as the goals calendar.
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const time = (iso: string): number => {
  if (!iso) return 0;
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d).getTime() : 0;
};

// ---------------------------------------------------------------------------
// One record, across its entries
// ---------------------------------------------------------------------------
export interface Best {
  name: string;
  category: string;
  unit: string;
  target: number;
  /** Which way is better, resolved once for the whole group. */
  direction: Direction;
  /** The best entry: the largest, or the smallest when direction is 'lower'. */
  value: number;
  /** When the best was set. */
  on: string;
  /** The earliest entry's value, for "+4 since first". */
  first: number;
  /**
   * How far the record has come, always signed so that positive is better.
   * A mile that went 6:10 → 5:40 has a gain of 30, not −30.
   */
  gain: number;
  /** `gain` as a share of the first entry, 0 when the first was 0. */
  percent: number;
  /** How many entries there are. One means there is no progression to show. */
  entries: number;
  /** Every entry, oldest first — the evolution. */
  history: RecordRow[];
  /** The newest entry is also the best, and recent. Draws "NEW RECORD". */
  fresh: boolean;
}

/**
 * Group record entries by name and reduce each group to its best.
 *
 * Milestones are not included: they carry no figure, so "best" is meaningless
 * for them and they have their own section on the page.
 */
export function personalBests(rows: RecordRow[], today: Date = new Date()): Best[] {
  const groups = new Map<string, RecordRow[]>();
  for (const row of rows) {
    if (row.kind !== 'record') continue;
    const key = row.name.trim().toLowerCase();
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const out: Best[] = [];
  for (const entries of groups.values()) {
    const history = [...entries].sort((a, b) => time(a.achieved_on) - time(b.achieved_on));
    const direction = directionOf(history);
    const top = history.reduce(
      (best, row) => (isBetter(row.value, best.value, direction) ? row : best),
      history[0]!,
    );
    const newest = history[history.length - 1]!;
    const oldest = history[0]!;

    // Signed toward better, so every "+7" on the page reads the same way
    // whether the record is a score going up or a time coming down.
    const gain = direction === 'lower' ? oldest.value - top.value : top.value - oldest.value;

    out.push({
      name: top.name,
      category: top.category,
      unit: top.unit,
      target: top.target,
      direction,
      value: top.value,
      on: top.achieved_on,
      first: oldest.value,
      gain,
      percent: oldest.value !== 0 ? (gain / Math.abs(oldest.value)) * 100 : 0,
      entries: history.length,
      history,
      fresh:
        newest.id === top.id &&
        history.length > 1 &&
        time(newest.achieved_on) > today.getTime() - FRESH_DAYS * DAY,
    });
  }

  // Most recently set first: a hall of fame opens on what you just did.
  return out.sort((a, b) => time(b.on) - time(a.on) || a.name.localeCompare(b.name));
}

/**
 * How far a record has come, written the way its direction reads.
 *
 * A score that went 18 → 25 improved by "+7"; a mile that went 6:10 → 5:40
 * improved by "−30s". Both are the same positive `gain` and printing the sign
 * off the gain alone would put a "+" in front of a time that got shorter. So
 * the sign comes from the direction and the size comes from the gain, which is
 * the only combination that is true of both.
 */
export function gainText(best: Best): string {
  const size = formatValue(Math.abs(best.gain), best.unit === 'minutes' ? 'minutes' : '');
  return `${best.direction === 'lower' ? '−' : '+'}${size}`;
}

// ---------------------------------------------------------------------------
// The one line the page opens with
// ---------------------------------------------------------------------------
/**
 * The record that best answers "look how far have I come".
 *
 * The page's whole thesis in one figure, so the hero can state it before
 * anybody scrolls. What makes a record the headline is **how far it moved**,
 * not how large it is — which is why this ranks on `percent` rather than on
 * `gain`. Ranking on the raw gain would give the same answer every time for
 * anybody who has ever logged a line count: +40,000 lines outranks 18 → 25
 * arithmetically and says far less, because the two numbers are not in the
 * same units and never were. A share of where you started is the only
 * comparison between a score and a project that means anything.
 *
 * Records with a single entry cannot be a headline — there is no distance to
 * report — and neither can one that has not improved. When nothing qualifies
 * the caller gets null and the hero says something plainer; a hero that
 * invents a triumph out of one logged figure is worse than a hero that does
 * not have one yet.
 */
export function headline(rows: RecordRow[], today: Date = new Date()): Best | null {
  const moved = personalBests(rows, today).filter(
    (best) => best.entries > 1 && best.gain > 0,
  );
  if (moved.length === 0) return null;

  return moved.reduce((top, best) => {
    if (best.percent !== top.percent) return best.percent > top.percent ? best : top;
    // Same share of the start: the bigger absolute move, then the newer one,
    // so the ordering is total and the hero does not shuffle on reload.
    if (best.gain !== top.gain) return best.gain > top.gain ? best : top;
    return time(best.on) > time(top.on) ? best : top;
  });
}

// ---------------------------------------------------------------------------
// The page's headline figures
// ---------------------------------------------------------------------------
export interface Tally {
  records: number;
  milestones: number;
  categories: number;
  /** Bests set this calendar month — the "all-time bests this month" tile. */
  thisMonth: number;
}

export function tally(rows: RecordRow[], today: Date = new Date()): Tally {
  const bests = personalBests(rows, today);
  const categories = new Set(
    rows.map((row) => row.category.trim()).filter(Boolean),
  );
  const month = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}`;

  return {
    // Every entry, not every name: 127 records means 127 things logged.
    records: rows.filter((row) => row.kind === 'record').length,
    milestones: rows.filter((row) => row.kind === 'milestone').length,
    categories: categories.size,
    thisMonth: bests.filter((best) => best.on.startsWith(month)).length,
  };
}

/** The category names in use, most-used first, for the filter row. */
export function categories(rows: RecordRow[]): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = row.category.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

// ---------------------------------------------------------------------------
// The timeline, and the filter bar
// ---------------------------------------------------------------------------
/** Everything with a date, newest first — records and milestones together. */
export function timeline(rows: RecordRow[], limit = 12): RecordRow[] {
  return rows
    .filter((row) => Boolean(row.achieved_on))
    .sort((a, b) => time(b.achieved_on) - time(a.achieved_on))
    .slice(0, limit);
}

export type Show = 'all' | 'records' | 'milestones';
export type Sort = 'newest' | 'oldest' | 'improvement' | 'category';

/**
 * The search-and-sort bar at the foot of the page.
 *
 * `improvement` sorts by how far a record has come rather than how large it
 * is, which is the ordering the page is actually about — a score that went
 * 18 → 25 is a better story than one logged once at 400.
 */
export function filterRows(
  rows: RecordRow[],
  { query = '', show = 'all' as Show, sort = 'newest' as Sort } = {},
): RecordRow[] {
  const needle = query.trim().toLowerCase();
  const gains = new Map<string, number>();
  for (const best of personalBests(rows)) {
    gains.set(best.name.trim().toLowerCase(), best.gain);
  }

  return rows
    .filter((row) => (show === 'all' ? true : show === 'records' ? row.kind === 'record' : row.kind === 'milestone'))
    .filter(
      (row) =>
        !needle ||
        row.name.toLowerCase().includes(needle) ||
        row.category.toLowerCase().includes(needle) ||
        row.note.toLowerCase().includes(needle),
    )
    .sort((a, b) => {
      if (sort === 'oldest') return time(a.achieved_on) - time(b.achieved_on);
      if (sort === 'category') {
        return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
      }
      if (sort === 'improvement') {
        const ga = gains.get(a.name.trim().toLowerCase()) ?? 0;
        const gb = gains.get(b.name.trim().toLowerCase()) ?? 0;
        return gb - ga || time(b.achieved_on) - time(a.achieved_on);
      }
      return time(b.achieved_on) - time(a.achieved_on);
    });
}

// ---------------------------------------------------------------------------
// Milestones, in two levels
// ---------------------------------------------------------------------------
/**
 * A key milestone and the smaller ones it folds up.
 *
 * There is no parent column on the table and this does not want one. A
 * milestone already carries a `category` — the reader's own heading, "Full-stack
 * project", "Competitive Math" — and a heading with several things under it is
 * exactly what a key milestone is. So the grouping is read out of what the
 * account already typed rather than asked for a second time.
 */
export interface KeyMilestone {
  /** The category, lowercased — the key the open/shut state is remembered by. */
  key: string;
  /** The category as it was typed, which is what the row is titled. */
  name: string;
  /** The smaller milestones, in the order the server sent them. */
  children: RecordRow[];
  /** How many of them have a date. `reached === children.length` draws the tick. */
  reached: number;
  /** The newest date among them, or '' while none has happened. */
  on: string;
}

/**
 * Split milestones into the key ones and the loose ones.
 *
 * **A category of one is not a key milestone.** It is a milestone, and it draws
 * as one, at the top level beside the keys. Folding a single row behind a
 * disclosure hides it and saves nothing; the point of the two levels is that
 * eleven milestones read as three lines until you ask for more.
 *
 * Uncategorised milestones are loose for the same reason — they share no
 * heading, so there is nothing to file them under but "Other", and a group
 * called "Other" is a list with a lid on it.
 *
 * Keys sort by their newest achievement, so the thing you are furthest through
 * is at the top; a key nobody has started yet has no date and sorts last, which
 * is the ordering `_mine` already applies to rows in backend/api/records.py.
 */
export function keyMilestones(rows: RecordRow[]): {
  keys: KeyMilestone[];
  loose: RecordRow[];
} {
  const groups = new Map<string, { name: string; children: RecordRow[] }>();
  const loose: RecordRow[] = [];

  for (const row of rows) {
    if (row.kind !== 'milestone') continue;
    const heading = row.category.trim();
    if (!heading) {
      loose.push(row);
      continue;
    }
    const key = heading.toLowerCase();
    const group = groups.get(key) ?? { name: heading, children: [] };
    group.children.push(row);
    groups.set(key, group);
  }

  const keys: KeyMilestone[] = [];
  for (const [key, group] of groups) {
    if (group.children.length < 2) {
      loose.push(...group.children);
      continue;
    }
    keys.push({
      key,
      name: group.name,
      children: group.children,
      reached: group.children.filter((row) => Boolean(row.achieved_on)).length,
      on: group.children.reduce(
        (latest, row) => (time(row.achieved_on) > time(latest) ? row.achieved_on : latest),
        '',
      ),
    });
  }

  // Both lists by the same rule, because the loose one is built in two passes
  // — the uncategorised as they arrive, the categories of one after every
  // group is known — and would otherwise print in the order it was assembled
  // rather than in any order a reader could name.
  const byRecency = (a: string, b: string, an: string, bn: string) => {
    if (Boolean(a) !== Boolean(b)) return a ? -1 : 1;
    return time(b) - time(a) || an.localeCompare(bn);
  };
  keys.sort((a, b) => byRecency(a.on, b.on, a.name, b.name));
  loose.sort((a, b) => byRecency(a.achieved_on, b.achieved_on, a.name, b.name));

  return { keys, loose };
}

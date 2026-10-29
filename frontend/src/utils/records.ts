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
 * And the grouping is done **once**. `personalBests` is the only function that
 * walks the rows and reduces them; everything after it — the headline, the
 * four stories, what each entry meant, the ordering by improvement — takes the
 * `Best[]` it produced. They each used to call it again, which meant five
 * copies of one answer, one of them rebuilt on every keystroke in the search
 * box. The cost was never the point: a module whose whole claim is *this is
 * all one reading of the same rows* should not contain five readings.
 *
 * ## Which way is better is one word, and everything else follows from it
 *
 * "Extremum" above, rather than "largest". This module used to treat the
 * larger number as the better one everywhere, which is right for scores,
 * streaks and levels and wrong for a personal best measured in time — a
 * five-minute mile beats a six-minute one. Guessing from the unit does not
 * rescue it: "minutes practiced" is a *bigger-is-better* duration and any rule
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
import type { IconName } from '@/components/Icon';

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
 *
 * Under an hour, seconds are kept when there are any. A mile at 7.75 minutes
 * is "7m 45s", not "8m", and a 20-second improvement has to print as "20s"
 * rather than rounding away to "0m" — times are the one unit where the part
 * after the point is usually the whole story.
 */
export function formatValue(value: number, unit: string, target = 0): string {
  const clean = Math.round(value * 100) / 100;

  if (unit === 'minutes') {
    const seconds = Math.max(0, Math.round(clean * 60));
    let span: string;
    if (seconds < 3600 && seconds % 60 !== 0) {
      const minutes = Math.floor(seconds / 60);
      span = minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds % 60}s`;
    } else {
      const total = Math.max(0, Math.round(clean));
      const hours = Math.floor(total / 60);
      const minutes = total % 60;
      span = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    }
    return target > 0 ? `${span} / ${formatValue(target, 'minutes')}` : span;
  }

  const shown = clean.toLocaleString();
  if (target > 0) return `${shown} / ${(Math.round(target * 100) / 100).toLocaleString()}`;
  return unit && unit !== 'points' ? `${shown} ${unit}` : shown;
}

/** "Aug 12, 2026", or "—" for a milestone that has not happened. */
export function formatOn(iso: string): string {
  if (!iso) return '-';
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
export function headline(bests: Best[]): Best | null {
  const moved = bests.filter((best) => best.entries > 1 && best.gain > 0);
  if (moved.length === 0) return null;

  return moved.reduce((top, best) => {
    if (best.percent !== top.percent) return best.percent > top.percent ? best : top;
    // Same share of the start: the bigger absolute move, then the newer one,
    // so the ordering is total and the hero does not shuffle on reload.
    if (best.gain !== top.gain) return best.gain > top.gain ? best : top;
    return time(best.on) > time(top.on) ? best : top;
  });
}

/**
 * The evolution as text — 18 → 20 → 21 → 23 → 25.
 *
 * The page's thesis in one string, which is why it is here rather than
 * assembled at each call site: it belongs on the best card, and it is the same
 * sequence the chart draws.
 *
 * Long histories are elided from the middle rather than the end. The two
 * figures that carry the story are the first and the last — where you started
 * and where you are — and truncating the tail would throw away the second one
 * to keep entries nobody is reading.
 */
export function trail(best: Best, max = 6): string[] {
  const values = best.history
    .filter((row) => row.achieved_on)
    .map((row) => formatValue(row.value, best.unit === 'minutes' ? 'minutes' : ''));
  if (values.length <= max) return values;
  return [values[0]!, '…', ...values.slice(values.length - (max - 2))];
}

// ---------------------------------------------------------------------------
// The four stories
// ---------------------------------------------------------------------------
/**
 * One thing worth knowing, in a shape a tile can draw.
 *
 * `figure` is the number the eye lands on, `label` says what kind of thing it
 * is, and `detail` names the record it came from. Every one of these is a
 * *story* — something that happened — and that is the whole point of the
 * type: the four tiles used to be counts, and "47 personal records" is
 * inventory. It tells you how much you have logged, which is a fact about your
 * logging rather than about you.
 */
export interface Story {
  key: string;
  icon: IconName;
  figure: string;
  label: string;
  detail: string;
  tone: 'violet' | 'amber' | 'blue' | 'green';
}

/** Whole months between two ISO days, floored. */
const monthsBetween = (from: string, to: Date): number => {
  const then = time(from);
  if (!then) return 0;
  return Math.max(0, Math.floor((to.getTime() - then) / (DAY * 30.44)));
};

/**
 * The stories the top of the page tells, in the order they are drawn.
 *
 * Fewer than four is normal and is not padded out. A story that has not
 * happened has no honest figure — "0 consecutive improvements" is not a
 * quieter version of the tile, it is a different and worse claim — so the row
 * draws what is true and no more. An account with one entry gets one tile, and
 * the row fills in as the history does.
 *
 * None of these read the growth history. Everything here comes out of rows the
 * account wrote, which is the same line the page draws between what you logged
 * and what Summit counted — see the note in pages/Achievements.tsx.
 */
export function stories(bests: Best[], today: Date = new Date()): Story[] {
  const out: Story[] = [];

  // 1. The biggest single jump between two consecutive entries. Different from
  //    the hero's "furthest travelled", and deliberately: one is the whole
  //    journey and this is the best day of it.
  let leap: { best: Best; size: number; from: number } | null = null;
  for (const best of bests) {
    const dated = best.history.filter((row) => row.achieved_on);
    for (let i = 1; i < dated.length; i += 1) {
      const before = dated[i - 1]!.value;
      const after = dated[i]!.value;
      const size = best.direction === 'lower' ? before - after : after - before;
      if (size > 0 && (!leap || size > leap.size)) leap = { best, size, from: before };
    }
  }
  if (leap) {
    const unit = leap.best.unit === 'minutes' ? 'minutes' : '';
    out.push({
      key: 'leap',
      icon: 'zap',
      figure: `${leap.best.direction === 'lower' ? '−' : '+'}${formatValue(leap.size, unit)}`,
      label: 'Biggest leap',
      detail: `${leap.best.name} · ${formatValue(leap.from, unit)} → ${formatValue(
        leap.best.direction === 'lower' ? leap.from - leap.size : leap.from + leap.size,
        unit,
      )}`,
      tone: 'violet',
    });
  }

  // 2. The longest unbroken run of improvements on one record. Not a streak of
  //    days: a streak of *beating yourself*, which is the thing this page is
  //    about and which nothing else in the app counts.
  let run: { best: Best; length: number } | null = null;
  for (const best of bests) {
    const dated = best.history.filter((row) => row.achieved_on);
    let current = 1;
    let longest = 1;
    for (let i = 1; i < dated.length; i += 1) {
      current = isBetter(dated[i]!.value, dated[i - 1]!.value, best.direction) ? current + 1 : 1;
      longest = Math.max(longest, current);
    }
    if (longest > 1 && (!run || longest > run.length)) run = { best, length: longest };
  }
  if (run) {
    out.push({
      key: 'run',
      icon: 'flame',
      figure: `${run.length}`,
      label: 'Longest run',
      detail: `${run.best.name} · ${run.length} entries, each better than the last`,
      tone: 'amber',
    });
  }

  // 3. Bests set this calendar month — the one count that is also a story,
  //    because a personal best is an event and this says how many happened.
  const month = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}`;
  const fresh = bests.filter((best) => best.on.startsWith(month));
  if (fresh.length > 0) {
    out.push({
      key: 'month',
      icon: 'trend',
      figure: `${fresh.length}`,
      label: fresh.length === 1 ? 'Record this month' : 'Records this month',
      detail: fresh
        .slice(0, 3)
        .map((best) => best.name)
        .join(', '),
      tone: 'green',
    });
  }

  // 4. The best that has stood longest without being beaten — the one to go
  //    for. Only records you have come back to: a figure logged once and never
  //    revisited has not withstood anything.
  const standing = bests
    .filter((best) => best.entries > 1 && best.on && monthsBetween(best.on, today) >= 1)
    .reduce<Best | null>(
      (oldest, best) => (!oldest || time(best.on) < time(oldest.on) ? best : oldest),
      null,
    );
  if (standing) {
    const months = monthsBetween(standing.on, today);
    out.push({
      key: 'standing',
      icon: 'shield',
      figure: months >= 12 ? `${Math.floor(months / 12)}y` : `${months}mo`,
      label: 'Standing longest',
      detail: `${standing.name} · ${formatValue(standing.value, standing.unit, standing.target)} still unbeaten`,
      tone: 'blue',
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// The page's headline figures
// ---------------------------------------------------------------------------
/**
 * How much is in here.
 *
 * Four counts that used to be the four tiles at the top of the page and are
 * now one line of small text under them — see `stories`, which is what the
 * tiles draw instead. They were demoted rather than deleted because "how much
 * have I logged" is a real question; it is just not the question the page is
 * for. `thisMonth` went with the demotion: bests set this month is an event
 * rather than an inventory, so it is a story now.
 */
export interface Tally {
  records: number;
  milestones: number;
  categories: number;
}

export function tally(rows: RecordRow[]): Tally {
  const categories = new Set(
    rows.map((row) => row.category.trim()).filter(Boolean),
  );

  return {
    // Every entry, not every name: 127 records means 127 things logged.
    records: rows.filter((row) => row.kind === 'record').length,
    milestones: rows.filter((row) => row.kind === 'milestone').length,
    categories: categories.size,
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
// The timeline, as a story rather than a log
// ---------------------------------------------------------------------------
/**
 * What one entry was, in the light of the ones before it.
 *
 * A flat list of entries is an audit log: correct, and the same to read
 * whether you spent a year clawing your way from 18 to 25 or logged the same
 * figure five times. The four facts here are what make one line different from
 * the next — and all four are already in the rows, which is why this is a
 * reading rather than a column.
 */
export interface Moment {
  row: RecordRow;
  /** Better than every earlier entry of the same record. The 🏆 line. */
  broke: boolean;
  /** The first entry of that record — where the story starts. */
  first: boolean;
  /** How much better than the entry before it, signed toward better. */
  step: number;
  /** Which way this record is measured, so `step` can be printed. */
  direction: Direction;
}

/**
 * Every dated entry, read against its own history, keyed by row id.
 *
 * Keyed rather than returned as a list because the page filters and sorts the
 * rows for its own reasons and then asks this what each surviving one meant.
 * Doing it the other way round would mean a search for "AMC" decided which
 * entries count as records, which is a fact about the account and not about
 * what is typed in a box.
 */
export function moments(bests: Best[]): Map<string, Moment> {
  const out = new Map<string, Moment>();

  for (const best of bests) {
    const dated = best.history.filter((row) => row.achieved_on);
    let peak: number | null = null;

    dated.forEach((row, i) => {
      const previous = i > 0 ? dated[i - 1]!.value : null;
      out.set(row.id, {
        row,
        broke: peak === null ? false : isBetter(row.value, peak, best.direction),
        first: i === 0,
        step:
          previous === null
            ? 0
            : best.direction === 'lower'
              ? previous - row.value
              : row.value - previous,
        direction: best.direction,
      });
      if (peak === null || isBetter(row.value, peak, best.direction)) peak = row.value;
    });
  }

  return out;
}

/** "+2" / "−15s" for a step between two entries, or '' when it was not one. */
export function stepText(moment: Moment): string {
  if (moment.step <= 0) return '';
  const unit = moment.row.unit === 'minutes' ? 'minutes' : '';
  return `${moment.direction === 'lower' ? '−' : '+'}${formatValue(moment.step, unit)}`;
}

export type Sort = 'newest' | 'oldest' | 'improvement';

/**
 * The rows the history column lists, filtered and ordered by its toolbar.
 *
 * `improvement` sorts by how far a record has come rather than how large it
 * is, which is the ordering the page is actually about — a score that went
 * 18 → 25 is a better story than one logged once at 400. `bests` is what
 * supplies those distances, and it is a parameter rather than something worked
 * out here so that typing in the search box does not regroup every row the
 * account owns once per character.
 *
 * There used to be a `show` filter here — all / records / milestones — and a
 * `category` sort. Both went when the toolbar shrank: the milestones sit in
 * their own column beside this list, so filtering to them is a section away
 * rather than a control, and sorting by category is what the category filter
 * does in one step instead of two.
 */
export function filterRows(
  rows: RecordRow[],
  bests: Best[],
  { query = '', category = 'All', sort = 'newest' as Sort } = {},
): RecordRow[] {
  const needle = query.trim().toLowerCase();
  const gains = new Map<string, number>();
  for (const best of bests) {
    gains.set(best.name.trim().toLowerCase(), best.gain);
  }

  return rows
    .filter((row) => category === 'All' || row.category.trim() === category)
    .filter(
      (row) =>
        !needle ||
        row.name.toLowerCase().includes(needle) ||
        row.category.toLowerCase().includes(needle) ||
        row.note.toLowerCase().includes(needle),
    )
    .sort((a, b) => {
      if (sort === 'oldest') return time(a.achieved_on) - time(b.achieved_on);
      if (sort === 'improvement') {
        const ga = gains.get(a.name.trim().toLowerCase()) ?? 0;
        const gb = gains.get(b.name.trim().toLowerCase()) ?? 0;
        return gb - ga || time(b.achieved_on) - time(a.achieved_on);
      }
      return time(b.achieved_on) - time(a.achieved_on);
    });
}

/**
 * Dated rows collected under the day they happened, in the order given.
 *
 * The timeline prints one date and the things that happened on it, rather than
 * repeating the date down the left of every line. Two records set on the same
 * afternoon are one afternoon, and drawing them as two dated events says
 * otherwise.
 */
export function byDay(rows: RecordRow[]): Array<{ on: string; rows: RecordRow[] }> {
  const days: Array<{ on: string; rows: RecordRow[] }> = [];
  for (const row of rows) {
    if (!row.achieved_on) continue;
    const last = days[days.length - 1];
    if (last && last.on === row.achieved_on) last.rows.push(row);
    else days.push({ on: row.achieved_on, rows: [row] });
  }
  return days;
}

// ---------------------------------------------------------------------------
// One record, read closely
// ---------------------------------------------------------------------------
/**
 * How many dated entries each reading needs before it is said at all.
 *
 * Two points always make a straight line, so a "trend" off two entries is the
 * second one restated. Three is the least that can show a direction, and it is
 * still called an early read. Pace compares two halves of the history, so it
 * wants three entries a half and enough calendar time that "faster" means
 * something other than "logged twice this week".
 */
export const NEED = {
  trend: 3,
  /** Below this the trend is shown as an early read, not a finding. */
  settledTrend: 5,
  pace: 6,
  /** Days from the first entry to the last before a rate or pace is said. */
  rateDays: 28,
  paceDays: 60,
};

export type Trend = 'improving' | 'steady' | 'slipping';
export type Pace = 'accelerating' | 'slowing' | 'consistent';

/** The state of a record's latest entry, which is what its title says. */
export type Standing =
  | 'start'      // one entry: nothing to compare
  | 'perfect'    // the latest is the best, and the best is the ceiling
  | 'breakthrough' // the latest set a best by an unusually big jump
  | 'new-best'   // the latest set a best
  | 'tied'       // the latest matched the best
  | 'below';     // the latest fell short of the best

export interface Breakthrough {
  id: string;
  on: string;
  /** How far past the previous best it went, signed so positive is better. */
  jump: number;
}

export interface RecordInsight {
  standing: Standing;
  /** Dated entries, which is what every gate below counts. */
  dated: number;
  /** First entry to the best one, in days. Null while the first is the best. */
  daysToBest: number | null;
  /** First entry to the latest, in days. */
  spanDays: number;
  /** Improvement a month, signed toward better. Null until it can be said. */
  ratePerMonth: number | null;
  latest: RecordRow;
  /** The latest against the entry just before it, signed toward better. */
  vsPrevious: number | null;
  /** The best before the latest entry, which is what it was trying to top. */
  previousBest: number | null;
  /** The latest against `previousBest`, signed toward better. */
  vsPreviousBest: number | null;
  trend: { word: Trend; early: boolean; basis: number } | null;
  pace: Pace | null;
  breakthroughs: Breakthrough[];
}

/** Bigger is better, whichever way the record is measured. */
const good = (value: number, direction: Direction) => (direction === 'lower' ? -value : value);

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/**
 * The entries that set a best by an unusual margin.
 *
 * A best is a breakthrough when it covers a large share of the whole climb
 * (40% of first-to-best) and is clearly bigger than the record's other jumps
 * (half again the median of them). The second test is what stops every step
 * of a steady 18 → 19 → 20 → 21 from being called one; the first is what
 * stops a record with two tiny bests and one small one from crowning the
 * small one. It also has to be a real share of where the record started
 * (10% for a lone best, 5% beside others). Needs three dated entries, like
 * the trend.
 */
export function breakthroughs(best: Best): Breakthrough[] {
  const dated = best.history.filter((row) => row.achieved_on);
  if (dated.length < NEED.trend || best.gain <= 0) return [];

  const jumps: Breakthrough[] = [];
  let peak = good(dated[0]!.value, best.direction);
  for (const row of dated.slice(1)) {
    const g = good(row.value, best.direction);
    if (g > peak) {
      jumps.push({ id: row.id, on: row.achieved_on, jump: g - peak });
      peak = g;
    }
  }

  // A share of where it started, so "+1 on 20" is not crowned just because
  // it was the only best there was. Skipped when the first entry was zero.
  const base = Math.abs(dated[0]!.value);
  const sizeable = (jump: number, share: number) => base === 0 || jump >= share * base;

  return jumps
    .filter((one) => {
      if (one.jump < 0.4 * best.gain) return false;
      const others = jumps.filter((other) => other !== one).map((other) => other.jump);
      if (others.length === 0) return sizeable(one.jump, 0.1);
      return sizeable(one.jump, 0.05) && one.jump >= 1.5 * median(others);
    })
    .sort((a, b) => b.jump - a.jump)
    .slice(0, 2);
}

/** Least-squares slope of `ys` against their index. */
function slope(ys: number[]): number {
  const n = ys.length;
  const mx = (n - 1) / 2;
  const my = ys.reduce((sum, y) => sum + y, 0) / n;
  let top = 0;
  let bottom = 0;
  ys.forEach((y, i) => {
    top += (i - mx) * (y - my);
    bottom += (i - mx) ** 2;
  });
  return bottom ? top / bottom : 0;
}

/**
 * Which way the recent results lean.
 *
 * The slope of the last five results (fewer if that is all there is), in
 * goodness, measured against the record's whole range: a lean worth less than
 * a tenth of the range across those entries is "steady", because a score
 * wandering 24, 25, 24 is not going anywhere. By index rather than by date,
 * because "recent trend" is about the last few attempts, however far apart.
 */
function trendOf(best: Best, dated: RecordRow[]): RecordInsight['trend'] {
  if (dated.length < NEED.trend) return null;
  const window = dated.slice(-5).map((row) => good(row.value, best.direction));
  const all = dated.map((row) => good(row.value, best.direction));
  const range = Math.max(...all) - Math.min(...all);
  const lean = slope(window) * (window.length - 1);
  const word: Trend =
    range === 0 || Math.abs(lean) < 0.1 * range ? 'steady' : lean > 0 ? 'improving' : 'slipping';
  return { word, early: dated.length < NEED.settledTrend, basis: window.length };
}

/**
 * Whether bests are coming faster or slower than they used to.
 *
 * The running best is split at its middle entry and each half's climb is
 * divided by its days. Read off the running best rather than the raw results
 * so one bad afternoon in the second half is not "slowing down". Half again
 * as fast is accelerating, half as fast is slowing, anything between is
 * consistent.
 *
 * Not said for a score that has hit its ceiling — 25/25 cannot climb, and
 * calling that "slowing" would be a complaint about a perfect score.
 */
function paceOf(best: Best, dated: RecordRow[], spanDays: number): Pace | null {
  if (dated.length < NEED.pace || spanDays < NEED.paceDays) return null;
  if (best.direction === 'higher' && best.target > 0 && best.value >= best.target) return null;

  const running: number[] = [];
  for (const row of dated) {
    const g = good(row.value, best.direction);
    running.push(running.length ? Math.max(running[running.length - 1]!, g) : g);
  }
  const mid = Math.floor((dated.length - 1) / 2);
  const days = (a: RecordRow, b: RecordRow) => (time(b.achieved_on) - time(a.achieved_on)) / DAY;
  const daysA = days(dated[0]!, dated[mid]!);
  const daysB = days(dated[mid]!, dated[dated.length - 1]!);
  if (daysA <= 0 || daysB <= 0) return null;

  const rateA = (running[mid]! - running[0]!) / daysA;
  const rateB = (running[running.length - 1]! - running[mid]!) / daysB;
  if (rateA <= 0 && rateB <= 0) return 'consistent';
  if (rateA <= 0) return 'accelerating';
  const ratio = rateB / rateA;
  return ratio >= 1.5 ? 'accelerating' : ratio <= 0.5 ? 'slowing' : 'consistent';
}

/**
 * Everything the page says about one record beyond its best.
 *
 * Each reading has a gate (see `NEED`) and comes back null below it, so the
 * page can say "log it again to see a trend" rather than a confident claim
 * built on two numbers.
 */
export function insightOf(best: Best): RecordInsight {
  const dated = best.history.filter((row) => row.achieved_on);
  const rows = dated.length ? dated : best.history;
  const latest = rows[rows.length - 1]!;
  const first = rows[0]!;
  const spanDays = Math.max(0, Math.round((time(latest.achieved_on) - time(first.achieved_on)) / DAY));

  const bestRow = rows.find((row) => row.value === best.value && row.achieved_on === best.on) ?? latest;
  const daysToBest =
    bestRow.id === first.id
      ? null
      : Math.max(0, Math.round((time(bestRow.achieved_on) - time(first.achieved_on)) / DAY));

  const previous = rows.length > 1 ? rows[rows.length - 2]! : null;
  const before = rows.slice(0, -1);
  const previousBest = before.length
    ? before.reduce(
        (top, row) => (isBetter(row.value, top, best.direction) ? row.value : top),
        before[0]!.value,
      )
    : null;
  const signed = (a: number, b: number) => good(a, best.direction) - good(b, best.direction);

  const vsPrevious = previous ? signed(latest.value, previous.value) : null;
  const vsPreviousBest = previousBest === null ? null : signed(latest.value, previousBest);

  const found = breakthroughs(best);
  let standing: Standing;
  if (vsPreviousBest === null) standing = 'start';
  else if (vsPreviousBest > 0) {
    if (best.direction === 'higher' && best.target > 0 && latest.value >= best.target) standing = 'perfect';
    else if (found.some((one) => one.id === latest.id)) standing = 'breakthrough';
    else standing = 'new-best';
  } else if (vsPreviousBest === 0) standing = 'tied';
  else standing = 'below';

  const monthsToBest = daysToBest === null ? 0 : daysToBest / 30.44;
  const ratePerMonth =
    dated.length >= NEED.trend && spanDays >= NEED.rateDays && best.gain > 0 && monthsToBest > 0
      ? best.gain / monthsToBest
      : null;

  return {
    standing,
    dated: dated.length,
    daysToBest,
    spanDays,
    ratePerMonth,
    latest,
    vsPrevious,
    previousBest,
    vsPreviousBest,
    trend: trendOf(best, dated),
    pace: paceOf(best, dated, spanDays),
    breakthroughs: found,
  };
}

/** The title an insight wears, beside the record's name. */
export const STANDING_TITLE: Record<Standing, string> = {
  start: 'Starting point',
  perfect: 'Perfect score',
  breakthrough: 'A breakthrough',
  'new-best': 'A new level',
  tied: 'Matching your best',
  below: 'Short of your best this time',
};

/** "4 months", "3 weeks", "5 days", "1 year 2 months". */
export function durationText(days: number): string {
  if (days < 1) return 'the same day';
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'}`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return `${weeks} weeks`;
  }
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months} months`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} ${years === 1 ? 'year' : 'years'}${rest ? ` ${rest} ${rest === 1 ? 'month' : 'months'}` : ''}`;
}

/**
 * A difference toward better, printed with the sign its direction reads.
 *
 * `amount` is already signed toward better (see `good`), so "+2" on a score
 * and "−20s" on a mile are both improvements. A negative amount is a step
 * back and prints the other sign. Units the record prints in are kept, apart
 * from the "out of", which a difference does not have.
 */
export function signedText(amount: number, unit: string, direction: Direction): string {
  const size = formatValue(Math.abs(amount), unit);
  if (amount === 0) return size;
  const towardBetter = amount > 0;
  const plus = direction === 'lower' ? !towardBetter : towardBetter;
  return `${plus ? '+' : '−'}${size}`;
}

/**
 * A difference toward better, said in words where a sign would confuse.
 *
 * A time that came down by 20 seconds is "20s faster": "−20s" is correct
 * and still makes people stop and work out whether minus is good. Everything
 * else keeps `signedText`, where "+2" on a score needs no translating.
 */
export function changeText(amount: number, unit: string, direction: Direction): string {
  if (direction === 'lower' && unit === 'minutes' && amount !== 0) {
    return `${formatValue(Math.abs(amount), unit)} ${amount > 0 ? 'faster' : 'slower'}`;
  }
  return signedText(amount, unit, direction);
}

/**
 * One row per dated entry, with what it meant: the chart's improvement view
 * and the attempts table both read this.
 */
export interface Attempt {
  row: RecordRow;
  /** 1-based, oldest first. */
  n: number;
  /** Against the first entry, signed toward better. 0 on the first. */
  change: number;
  /** Against the best before it, signed toward better. Null on the first. */
  vsBest: number | null;
  breakthrough: boolean;
}

export function attempts(best: Best): Attempt[] {
  const dated = best.history.filter((row) => row.achieved_on);
  if (!dated.length) return [];
  const big = new Set(breakthroughs(best).map((one) => one.id));
  const start = good(dated[0]!.value, best.direction);
  let peak: number | null = null;
  return dated.map((row, i) => {
    const g = good(row.value, best.direction);
    const out: Attempt = {
      row,
      n: i + 1,
      change: g - start,
      vsBest: peak === null ? null : g - peak,
      breakthrough: big.has(row.id),
    };
    peak = peak === null ? g : Math.max(peak, g);
    return out;
  });
}

// ---------------------------------------------------------------------------
// Milestones with something to count
// ---------------------------------------------------------------------------
/** The record names a milestone is linked to. Never throws on a bad column. */
export function linksOf(row: Pick<RecordRow, 'links'>): string[] {
  if (!row.links) return [];
  try {
    const parsed: unknown = JSON.parse(row.links);
    return Array.isArray(parsed)
      ? parsed.filter((name): name is string => typeof name === 'string' && name.trim() !== '')
      : [];
  } catch {
    return [];
  }
}

export interface MilestoneProgress {
  /** Where it stands now. */
  current: number;
  target: number;
  unit: string;
  /** 0-100. */
  percent: number;
  /** The target has been reached, whether or not the milestone is marked done. */
  met: boolean;
  /** The linked record the figure comes from, when it does. */
  from: Best | null;
}

/**
 * How far along a milestone with a numeric target is.
 *
 * Two sources. A milestone can count from a linked record — "Reach Codeforces
 * 1000" reads the best of "Codeforces rating" — and then it moves from that
 * record's first entry toward the target in that record's own direction, so a
 * "sub-7 mile" fills as the mile time falls. Or the figure is typed in by
 * hand and counts up from zero. Null when there is no target to measure
 * against, which is most milestones and is fine: "Qualified for AIME" either
 * happened or it did not.
 */
export function milestoneProgress(row: RecordRow, bests: Best[]): MilestoneProgress | null {
  if (row.kind !== 'milestone' || !(row.target > 0)) return null;

  const fromName = (row.progress_from ?? '').trim().toLowerCase();
  const from = fromName ? bests.find((best) => best.name.trim().toLowerCase() === fromName) ?? null : null;

  const direction: Direction = from ? from.direction : 'higher';
  const current = from ? from.value : Number(row.value) || 0;
  const start = from ? from.first : 0;
  const target = row.target;
  const met = direction === 'lower' ? current <= target : current >= target;

  let percent: number;
  if (met) percent = 100;
  else if (start === target) percent = 0;
  else percent = ((good(current, direction) - good(start, direction)) / (good(target, direction) - good(start, direction))) * 100;

  return {
    current,
    target,
    unit: from ? from.unit : row.unit,
    percent: Math.max(0, Math.min(100, percent)),
    met,
    from,
  };
}

/**
 * "12 of 20 problems", or for a time coming down, "6m 10s now, aiming for
 * 6m". "Of" only reads right when the count climbs toward the goal.
 */
export function progressText(progress: MilestoneProgress): string {
  const unit = progress.unit;
  if (progress.from?.direction === 'lower') {
    return `${formatValue(progress.current, unit)} now, aiming for ${formatValue(progress.target, unit)}`;
  }
  // The count prints bare ("12 of 20 problems") unless it is a time, where a
  // bare number would be minutes nobody can read.
  const count = formatValue(progress.current, unit === 'minutes' ? unit : '');
  return `${count} of ${formatValue(progress.target, unit)}`;
}

/** Days until a milestone's target date: negative once it has passed. Null with none. */
export function daysUntil(iso: string | null | undefined, today: Date = new Date()): number | null {
  const then = time(iso ?? '');
  if (!then) return null;
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((then - midnight) / DAY);
}

// ---------------------------------------------------------------------------
// Milestones, under their headings
// ---------------------------------------------------------------------------
/**
 * A heading, and the milestones filed under it.
 *
 * ## What this is not, any more
 *
 * These were "key milestones": a category with several things under it was
 * drawn as a milestone in its own right, with its own tick, filled once every
 * child was reached. It read well and it was not true. "Competitive Math" is a
 * heading the account typed to file things under; it is not something that was
 * achieved, and giving it a tick said it was. The tick is gone and so is the
 * name — this is a group, it is titled with the category, and the only thing
 * it claims about itself is how many milestones are in it.
 *
 * The grouping itself stays, and stays derived. There is no parent column on
 * the table and this does not want one: the account already types a category,
 * and eleven milestones reading as three headings until you open one is worth
 * having for free.
 */
export interface MilestoneGroup {
  /** The category, lowercased — the key the open/shut state is remembered by. */
  key: string;
  /** The category as it was typed, which is what the heading says. */
  name: string;
  /** The milestones under it, in the order the server sent them. */
  children: RecordRow[];
  /** How many of them have a date — the "2 of 5". */
  reached: number;
  /** The newest date among them, or '' while none has happened. */
  on: string;
}

/**
 * Split milestones into the grouped ones and the loose ones.
 *
 * **A category of one is not a group.** It is a milestone, and it draws as one,
 * at the top level beside the headings. Folding a single row behind a
 * disclosure hides it and saves nothing; the point of the two levels is that
 * eleven milestones read as three lines until you ask for more.
 *
 * Uncategorised milestones are loose for the same reason — they share no
 * heading, so there is nothing to file them under but "Other", and a group
 * called "Other" is a list with a lid on it.
 *
 * Groups sort by their newest achievement, so the heading you are furthest
 * through is at the top; one nobody has started has no date and sorts last,
 * which is the ordering `_mine` already applies to rows in
 * backend/api/records.py.
 */
export function milestoneGroups(rows: RecordRow[]): {
  groups: MilestoneGroup[];
  loose: RecordRow[];
} {
  const filed = new Map<string, { name: string; children: RecordRow[] }>();
  const loose: RecordRow[] = [];

  for (const row of rows) {
    if (row.kind !== 'milestone') continue;
    const heading = row.category.trim();
    if (!heading) {
      loose.push(row);
      continue;
    }
    const key = heading.toLowerCase();
    const group = filed.get(key) ?? { name: heading, children: [] };
    group.children.push(row);
    filed.set(key, group);
  }

  const out: MilestoneGroup[] = [];
  for (const [key, group] of filed) {
    if (group.children.length < 2) {
      loose.push(...group.children);
      continue;
    }
    out.push({
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
  out.sort((a, b) => byRecency(a.on, b.on, a.name, b.name));
  loose.sort((a, b) => byRecency(a.achieved_on, b.achieved_on, a.name, b.name));

  return { groups: out, loose };
}

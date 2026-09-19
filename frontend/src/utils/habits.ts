/**
 * What this account repeatedly does — the arithmetic behind the Habits tab.
 *
 * The three analysis tabs divide the same record between them: Habits is *what
 * I do*, Insights is *why and how I do it*, Recommendations is *how I improve*.
 * Keeping that boundary is the whole point of the split, so nothing in this
 * file explains a behaviour. It identifies one, counts it, and says how steady
 * it is. The explanations live in utils/insight and the instructions in
 * utils/advice, and both read the shapes built here rather than recomputing
 * them — which is what stops the three tabs from quietly disagreeing.
 *
 * ## What counts as a habit
 *
 * Nothing in the data model is called a habit, so one has to be inferred, and
 * there are exactly two honest signals for it:
 *
 * - **A subject.** The app's own taxonomy. Every task may carry one, and a
 *   subject worked on repeatedly is a habit by any reasonable definition.
 * - **A repeated title.** "Morning Study" written down eleven times is a
 *   routine whether or not it was ever filed under a subject.
 *
 * Both are built, then merged with the title stems winning: "Violin Practice"
 * is a more useful card than "Music", and a stem that is really just its
 * subject under another name is dropped rather than shown twice.
 *
 * ## The two units
 *
 * A streak means different things for a thing done six days a week and a thing
 * done every Sunday, and reporting both in days makes the weekly one look
 * broken — a perfect twelve-week run reads as "1-day streak". So each habit
 * carries the unit its own cadence justifies and every figure is stated in it.
 * `unit` is the field; `cadence` is the word for a reader.
 */
import type { GrowthDay, Task } from '@/types';
import { countActiveDays } from './activeDay';

const num = (value: unknown) => Number(value) || 0;

/** ISO date `n` days from `iso`, negative to go back. Local, no timezone. */
export function shiftDay(iso: string, n: number): string {
  const at = new Date(`${iso}T00:00:00`);
  at.setDate(at.getDate() + n);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(
    at.getDate(),
  ).padStart(2, '0')}`;
}

/** The Sunday that opens the week `iso` falls in — the key weekly counts use. */
function weekKey(iso: string): string {
  return shiftDay(iso, -new Date(`${iso}T00:00:00`).getDay());
}

function daysBetween(fromIso: string, toIso: string): number {
  if (!fromIso || !toIso) return 0;
  const ms = new Date(`${toIso}T00:00:00`).getTime() - new Date(`${fromIso}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

// --------------------------------------------------------------------------
// The habit itself
// --------------------------------------------------------------------------
export type HabitStrength = 'strong' | 'developing' | 'inconsistent' | 'declining';

export const STRENGTH_LABEL: Record<HabitStrength, string> = {
  strong: 'Strong',
  developing: 'Developing',
  inconsistent: 'Inconsistent',
  declining: 'Declining',
};

export const STRENGTH_TONE: Record<HabitStrength, string> = {
  strong: 'green',
  developing: 'blue',
  inconsistent: 'amber',
  declining: 'pink',
};

export const STRENGTH_NOTE: Record<HabitStrength, string> = {
  strong: 'Turns up in most weeks and is not fading. These are the ones holding your totals up.',
  developing: 'Appearing regularly but not yet every week — the habit exists, the routine does not.',
  inconsistent: 'Real gaps between appearances. It happens when it happens rather than on a schedule.',
  declining: 'Running well below its own earlier rate. Still alive, but on the way out unless something changes.',
};

export interface Habit {
  id: string;
  name: string;
  /** Which signal produced it — shown so a reader knows why the card exists. */
  source: 'subject' | 'routine';
  /** Share of the weeks in the range this appeared in at all, 0-100. */
  consistency: number;
  /** The run still running, in `unit`. Zero when it has already broken. */
  streak: number;
  bestStreak: number;
  unit: 'day' | 'week';
  /** Completions per week, averaged over the range. */
  frequency: number;
  cadence: string;
  /** Finished against everything filed under it in the range, 0-100. */
  completionRate: number;
  /** Later half against earlier half, as a percentage. Null when too short. */
  trend: number | null;
  lastCompleted: string | null;
  firstSeen: string | null;
  strength: HabitStrength;
  /** Completions per week across the range — the card's sparkline. */
  weekly: number[];
  /** The range in four chunks, as completions per week. The timeline row. */
  phases: number[];
  total: number;
  xp: number;
}

/**
 * A title reduced to the thing it is about.
 *
 * "Math practice #4", "Math practice - week 12" and "math practice" are one
 * routine written down three ways, and a card per spelling is a card nobody
 * asked for. Digits, punctuation and the handful of words people use to number
 * a repeat are stripped; what survives is the stem two entries have to share
 * to be counted as the same thing.
 */
function stemOf(title: string): string {
  return String(title || '')
    .toLowerCase()
    .replace(/[#№]/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(part|pt|week|wk|day|no|number|session|round|vol|chapter|ch|unit)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Title Case, for a stem that is about to become a card heading. */
function titleCase(text: string): string {
  return text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

interface Bucket {
  name: string;
  source: Habit['source'];
  /** The distinct days it happened on, ascending. */
  days: string[];
  seen: Set<string>;
  total: number;
  xp: number;
  /** Everything filed under it in the range, done or not — the completion rate. */
  filed: number;
  finished: number;
}

function emptyBucket(name: string, source: Habit['source']): Bucket {
  return { name, source, days: [], seen: new Set(), total: 0, xp: 0, filed: 0, finished: 0 };
}

/** The longest run of consecutive keys in an ascending list, by a step function. */
function longestRun(sorted: string[], next: (key: string) => string): number {
  let best = 0;
  let run = 0;
  sorted.forEach((key, index) => {
    run = index > 0 && next(sorted[index - 1]!) === key ? run + 1 : 1;
    if (run > best) best = run;
  });
  return best;
}

/** The run still running as of `endIso`, allowing one grace period for today. */
function currentRun(sorted: string[], endIso: string, step: number, next: (key: string) => string): number {
  if (sorted.length === 0 || !endIso) return 0;
  const seen = new Set(sorted);
  // Today may simply not have happened yet, so a run that reaches yesterday is
  // still a run. Anything older than that has broken.
  let cursor = seen.has(endIso) ? endIso : shiftDay(endIso, -step);
  if (!seen.has(cursor)) return 0;
  let run = 0;
  while (seen.has(cursor)) {
    run += 1;
    cursor = next(cursor);
  }
  return run;
}

/**
 * How often a habit happens, as the word and the unit its streak is counted in.
 *
 * One table for both, because they were two constants and they disagreed: a
 * habit at 3.2 a week was labelled "A few times a week" and given a *day*
 * streak, which is 0 almost every time it is read — three sessions spread over
 * seven days rarely land on consecutive days, so a perfectly healthy habit
 * reported no run at all. A streak is only meaningful in the unit the habit
 * actually recurs in, and the cut is the same cut as the label: near-daily
 * things get days, everything else gets weeks.
 */
const CADENCES: Array<{ from: number; label: string; unit: 'day' | 'week' }> = [
  { from: 6, label: 'Daily', unit: 'day' },
  { from: 3.5, label: 'Most days', unit: 'day' },
  { from: 1.5, label: 'A few times a week', unit: 'week' },
  { from: 0.7, label: 'Weekly', unit: 'week' },
  { from: 0, label: 'Occasional', unit: 'week' },
];

function cadenceFor(perWeek: number) {
  return CADENCES.find((entry) => perWeek >= entry.from) ?? CADENCES[CADENCES.length - 1]!;
}

/**
 * Every recurring thing this account does in the range, strongest first.
 *
 * The floor is four separate days: three is a coincidence and a page of
 * coincidences is what makes an analytics page stop being read. `nameOf` turns
 * a subject id into its name and is the caller's business — this module never
 * touches the subject catalogue.
 */
export function buildHabits(
  tasks: Task[],
  nameOf: (id: string) => string,
  fromIso: string,
  toIso: string,
  limit = 8,
): Habit[] {
  if (!fromIso || !toIso) return [];

  const bySubject = new Map<string, Bucket>();
  const byStem = new Map<string, Bucket>();
  /** The most common original spelling of a stem, for the card heading. */
  const spelling = new Map<string, Map<string, number>>();

  const inRange = (day: string) => Boolean(day) && day >= fromIso && day <= toIso;

  tasks.forEach((task) => {
    const done = task.status === 'done';
    const doneDay = String(task.completed_at || '').slice(0, 10);
    // An unfinished task has no completion date, so it is placed by when it was
    // meant to happen — that is what makes a completion rate mean anything.
    const placedDay = done ? doneDay : String(task.due_date || task.created_at || '').slice(0, 10);
    if (!inRange(placedDay)) return;

    const stem = stemOf(task.title);
    const targets: Bucket[] = [];

    if (task.subject) {
      const key = `subject:${task.subject}`;
      const bucket = bySubject.get(key) ?? emptyBucket(nameOf(task.subject), 'subject');
      bySubject.set(key, bucket);
      targets.push(bucket);
    }
    if (stem.length >= 3) {
      const bucket = byStem.get(stem) ?? emptyBucket(titleCase(stem), 'routine');
      byStem.set(stem, bucket);
      targets.push(bucket);
      const counts = spelling.get(stem) ?? new Map<string, number>();
      counts.set(task.title, (counts.get(task.title) ?? 0) + 1);
      spelling.set(stem, counts);
    }

    targets.forEach((bucket) => {
      bucket.filed += 1;
      if (!done) return;
      bucket.finished += 1;
      bucket.total += 1;
      bucket.xp += num(task.xp_value);
      if (!bucket.seen.has(doneDay)) {
        bucket.seen.add(doneDay);
        bucket.days.push(doneDay);
      }
    });
  });

  // The commonest spelling wins the heading — "Violin practice" beats the stem
  // "violin practice" as a thing to read.
  spelling.forEach((counts, stem) => {
    const bucket = byStem.get(stem);
    if (!bucket) return;
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) bucket.name = best[0];
  });

  const FLOOR = 4;
  const kept = [...byStem.values(), ...bySubject.values()].filter(
    (bucket) => bucket.days.length >= FLOOR,
  );

  // A stem and a subject that describe the same work produce two identical
  // cards. The routine keeps the slot: it is the more specific of the two.
  const seenNames = new Set<string>();
  const unique = kept
    .sort((a, b) => (a.source === b.source ? 0 : a.source === 'routine' ? -1 : 1))
    .filter((bucket) => {
      const key = bucket.name.trim().toLowerCase();
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });

  const span = daysBetween(fromIso, toIso);
  const weeks = Math.max(1, Math.ceil(span / 7));
  const weekStarts: string[] = [];
  for (let index = 0; index < weeks; index++) {
    weekStarts.push(weekKey(shiftDay(fromIso, index * 7)));
  }

  const habits = unique.map<Habit>((bucket) => {
    const days = [...bucket.days].sort();
    const weekCounts = new Map<string, number>();
    days.forEach((day) => {
      const key = weekKey(day);
      weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
    });

    const weekly = weekStarts.map((start) => weekCounts.get(start) ?? 0);
    const activeWeeks = weekly.filter((count) => count > 0).length;
    const frequency = days.length / weeks;
    const cadence = cadenceFor(frequency);
    const unit = cadence.unit;

    const half = Math.floor(weekly.length / 2);
    const early = weekly.slice(0, half);
    const late = weekly.slice(half);
    const mean = (list: number[]) =>
      list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;
    const earlyRate = mean(early);
    const trend =
      early.length >= 2 && late.length >= 2 && earlyRate > 0
        ? Math.round(((mean(late) - earlyRate) / earlyRate) * 100)
        : null;

    const keys = unit === 'day' ? days : [...new Set(days.map(weekKey))].sort();
    const step = unit === 'day' ? 1 : 7;
    const next = (key: string) => shiftDay(key, -step);
    const forward = (key: string) => shiftDay(key, step);

    const consistency = Math.round((activeWeeks / weeks) * 100);
    const streak = currentRun(keys, unit === 'day' ? toIso : weekKey(toIso), step, next);
    const bestStreak = longestRun(keys, forward);

    // Four chunks rather than a point per week: the timeline is a sentence
    // ("3/wk → 5/wk → 6/wk"), and a sentence with fifty-two clauses is a chart.
    const size = Math.max(1, Math.ceil(weekly.length / 4));
    const phases: number[] = [];
    for (let at = 0; at < weekly.length; at += size) {
      phases.push(mean(weekly.slice(at, at + size)));
    }

    const strength: HabitStrength =
      trend !== null && trend <= -30
        ? 'declining'
        : consistency >= 70
          ? 'strong'
          : consistency >= 40
            ? 'developing'
            : 'inconsistent';

    return {
      id: `${bucket.source}:${bucket.name}`,
      name: bucket.name,
      source: bucket.source,
      consistency,
      streak,
      bestStreak,
      unit,
      frequency: Math.round(frequency * 10) / 10,
      cadence: cadence.label,
      completionRate: bucket.filed ? Math.round((bucket.finished / bucket.filed) * 100) : 100,
      trend,
      lastCompleted: days[days.length - 1] ?? null,
      firstSeen: days[0] ?? null,
      strength,
      weekly,
      phases,
      total: bucket.total,
      xp: Math.round(bucket.xp),
    };
  });

  return habits
    .sort((a, b) => b.consistency - a.consistency || b.total - a.total)
    .slice(0, limit);
}

// --------------------------------------------------------------------------
// The calendar
// --------------------------------------------------------------------------
export interface HabitDay {
  date: string;
  count: number;
  xp: number;
  /** What was completed, most valuable first. What a clicked square shows. */
  names: string[];
}

/** Every day in the range that had anything finished on it, keyed by date. */
export function habitDays(
  tasks: Task[],
  fromIso: string,
  toIso: string,
): Map<string, HabitDay> {
  const out = new Map<string, HabitDay>();
  tasks.forEach((task) => {
    if (task.status !== 'done') return;
    const day = String(task.completed_at || '').slice(0, 10);
    if (!day || day < fromIso || day > toIso) return;
    const entry = out.get(day) ?? { date: day, count: 0, xp: 0, names: [] };
    entry.count += 1;
    entry.xp += num(task.xp_value);
    entry.names.push(task.title);
    out.set(day, entry);
  });
  out.forEach((entry) => entry.names.sort((a, b) => a.localeCompare(b)));
  return out;
}

export type CalendarKey = '7' | '30' | '90' | '365' | 'all';

export const CALENDAR_WINDOWS: Array<{ key: CalendarKey; label: string; days: number | null }> = [
  { key: '7', label: '7D', days: 7 },
  { key: '30', label: '30D', days: 30 },
  { key: '90', label: '90D', days: 90 },
  { key: '365', label: '1Y', days: 365 },
  { key: 'all', label: 'All Time', days: null },
];

export interface CalendarCell {
  date: string | null;
  count: number;
  /** 0-4. Quartiles of the window's own busiest day, so any account is legible. */
  level: number;
}

export interface CalendarWeek {
  /** The month initial on the week a month opens in, '' on every other. */
  label: string;
  days: CalendarCell[];
}

/**
 * The range as a grid of squares — a week per column, a weekday per row.
 *
 * The same shape `heatmapGrid` builds for the consistency panel and for the
 * same reasons, with two differences this tab needs: the window runs from a
 * week to the whole account rather than three fixed sizes, and every square
 * keeps its date so the panel can be clicked. A square outside the window is
 * drawn as an outline rather than left out — a grid with holes cannot tell a
 * quiet Tuesday from a Tuesday before the account existed.
 */
export function habitCalendar(
  byDate: Map<string, HabitDay>,
  lastIso: string,
  window: CalendarKey,
  accountDays = 365,
): CalendarWeek[] {
  if (!lastIso) return [];
  const option = CALENDAR_WINDOWS.find((entry) => entry.key === window) ?? CALENDAR_WINDOWS[1]!;
  // All Time is capped: past about three years the columns are thinner than
  // the gaps between them and the map stops being one.
  const span = option.days ?? Math.min(Math.max(accountDays, 30), 1095);
  const weeks = Math.ceil(span / 7) + 1;

  const first = shiftDay(lastIso, -(span - 1));
  const end = shiftDay(lastIso, 6 - new Date(`${lastIso}T00:00:00`).getDay());
  const start = shiftDay(end, -(weeks * 7 - 1));

  const peak = Math.max(1, ...[...byDate.values()].map((entry) => entry.count));
  const rows: CalendarWeek[] = [];
  let previousMonth = -1;

  for (let week = 0; week < weeks; week++) {
    const cells: CalendarCell[] = [];
    let label = '';
    for (let weekday = 0; weekday < 7; weekday++) {
      const iso = shiftDay(start, week * 7 + weekday);
      const inside = iso >= first && iso <= lastIso;
      if (!inside) {
        cells.push({ date: null, count: 0, level: 0 });
        continue;
      }
      const month = new Date(`${iso}T00:00:00`).getMonth();
      if (weekday === 0 && month !== previousMonth) {
        label = new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short' });
        previousMonth = month;
      }
      const count = byDate.get(iso)?.count ?? 0;
      cells.push({
        date: iso,
        count,
        level: count === 0 ? 0 : Math.min(4, Math.ceil((count / peak) * 4)),
      });
    }
    rows.push({ label, days: cells });
  }

  return rows;
}

// --------------------------------------------------------------------------
// Patterns
// --------------------------------------------------------------------------
export interface HabitPattern {
  id: string;
  /** The observation, in the present tense and without a cause attached. */
  text: string;
  /** What in the record it was counted off. */
  support: string;
  /** How often it holds — the word, not a number, because it is a tendency. */
  frequency: 'Usually' | 'Frequently' | 'Sometimes';
  tone: string;
}

const PART_OF_DAY: Array<{ from: number; to: number; label: string }> = [
  { from: 5, to: 11, label: 'the morning' },
  { from: 12, to: 16, label: 'the afternoon' },
  { from: 17, to: 21, label: 'the evening' },
  { from: 22, to: 28, label: 'the late hours' },
];

function partOfDay(hour: number): string {
  const at = hour < 5 ? hour + 24 : hour;
  return PART_OF_DAY.find((slot) => at >= slot.from && at <= slot.to)?.label ?? 'the evening';
}

/**
 * When the day's work actually happened, in four buckets.
 *
 * The plainest thing that can be said about time of day, and the only one that
 * is honest on an account's fifth day: a count per part of day, no tendency
 * claimed, no "you are a morning person" inferred from nine tasks. `habitPatterns`
 * above says the stronger version once there is enough behind it — this is
 * what the early stages of the analytics page show instead, and it shares
 * `PART_OF_DAY` with that so the two can never disagree about where the
 * evening ends.
 *
 * Tasks with no completion time are skipped rather than bucketed somewhere:
 * `completed_at` is a date with no clock on it for tasks finished before the
 * column carried one, and putting those in "the morning" would be inventing
 * the very thing this is meant to report.
 */
export interface DayPart {
  label: string;
  count: number;
}

export function partsOfDay(tasks: Task[], fromIso: string, toIso: string): DayPart[] {
  const counts = new Map<string, number>(PART_OF_DAY.map((slot) => [slot.label, 0]));
  let seen = 0;

  tasks.forEach((task) => {
    if (task.status !== 'done') return;
    const stamp = String(task.completed_at || '');
    // A bare date has no hour in it. Length is the test the file already uses.
    if (stamp.length <= 10) return;
    const day = stamp.slice(0, 10);
    if (day < fromIso || day > toIso) return;
    const hour = Number(stamp.slice(11, 13));
    if (Number.isNaN(hour)) return;
    const label = partOfDay(hour);
    counts.set(label, (counts.get(label) ?? 0) + 1);
    seen += 1;
  });

  if (seen === 0) return [];
  return PART_OF_DAY.map((slot) => ({ label: slot.label, count: counts.get(slot.label) ?? 0 }));
}

const wordFor = (share: number): HabitPattern['frequency'] =>
  share >= 75 ? 'Usually' : share >= 50 ? 'Frequently' : 'Sometimes';

/**
 * Recurring behaviours, stated and not explained.
 *
 * This is the line between the Habits tab and the Insights tab, and it is worth
 * being strict about: "usually studies mathematics in the evening" belongs
 * here, "studies mathematics in the evening because focus is higher then"
 * belongs one tab over. Everything below is a count with a word in front of it.
 *
 * A pattern needs a floor of observations before it is stated at all — five
 * for a per-habit tendency, twenty days for anything about the week. Below
 * that the tab says how much more data it needs rather than inventing a
 * tendency out of a fortnight.
 */
export function habitPatterns(tasks: Task[], habits: Habit[], fromIso: string, toIso: string): HabitPattern[] {
  const out: HabitPattern[] = [];
  const done = tasks.filter((task) => {
    if (task.status !== 'done') return false;
    const day = String(task.completed_at || '').slice(0, 10);
    return Boolean(day) && day >= fromIso && day <= toIso && String(task.completed_at).length > 10;
  });
  if (done.length === 0) return out;

  const hourOf = (task: Task) => Number(String(task.completed_at || '').slice(11, 13));

  // ---- when each habit tends to happen -----------------------------------
  habits.slice(0, 4).forEach((habit) => {
    const key = habit.name.trim().toLowerCase();
    const mine = done.filter(
      (task) => task.title.trim().toLowerCase() === key || stemOf(task.title) === stemOf(habit.name),
    );
    if (mine.length < 5) return;
    const buckets = new Map<string, number>();
    mine.forEach((task) => {
      const hour = hourOf(task);
      if (Number.isNaN(hour)) return;
      const part = partOfDay(hour);
      buckets.set(part, (buckets.get(part) ?? 0) + 1);
    });
    const best = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!best) return;
    const share = Math.round((best[1] / mine.length) * 100);
    if (share < 45) return;
    out.push({
      id: `when-${habit.id}`,
      text: `${habit.name} happens in ${best[0]}`,
      support: `${best[1]} of ${mine.length} sessions — ${share}%`,
      frequency: wordFor(share),
      tone: 'blue',
    });
  });

  // ---- the weekend --------------------------------------------------------
  const span = daysBetween(fromIso, toIso);
  if (span >= 20) {
    let weekend = 0;
    let weekday = 0;
    done.forEach((task) => {
      const at = new Date(`${String(task.completed_at).slice(0, 10)}T00:00:00`).getDay();
      if (at === 0 || at === 6) weekend += 1;
      else weekday += 1;
    });
    const weekendRate = weekend / Math.max(1, (span * 2) / 7);
    const weekdayRate = weekday / Math.max(1, (span * 5) / 7);
    if (weekdayRate > 0) {
      const ratio = weekendRate / weekdayRate;
      if (ratio <= 0.65) {
        out.push({
          id: 'weekend-light',
          text: 'you do much less on weekends',
          support: `${Math.round(weekendRate * 10) / 10} finished on an average weekend day against ${
            Math.round(weekdayRate * 10) / 10
          } on a weekday`,
          frequency: 'Usually',
          tone: 'amber',
        });
      } else if (ratio >= 1.35) {
        out.push({
          id: 'weekend-heavy',
          text: 'you do more on weekends',
          support: `${Math.round(weekendRate * 10) / 10} finished on an average weekend day against ${
            Math.round(weekdayRate * 10) / 10
          } on a weekday`,
          frequency: 'Usually',
          tone: 'amber',
        });
      }
    }
  }

  // ---- hard work early ----------------------------------------------------
  const hard = done.filter((task) => task.priority === 'high' && !Number.isNaN(hourOf(task)));
  const rest = done.filter((task) => task.priority !== 'high' && !Number.isNaN(hourOf(task)));
  if (hard.length >= 6 && rest.length >= 6) {
    const mean = (list: Task[]) => list.reduce((sum, task) => sum + hourOf(task), 0) / list.length;
    const gap = mean(rest) - mean(hard);
    if (Math.abs(gap) >= 1.5) {
      out.push({
        id: 'hard-timing',
        text: `high-priority work lands ${Math.abs(Math.round(gap))}h ${
          gap > 0 ? 'earlier' : 'later'
        } in the day than everything else`,
        support: `${hard.length} high-priority tasks against ${rest.length} others`,
        frequency: 'Frequently',
        tone: 'violet',
      });
    }
  }

  // ---- a second sitting ---------------------------------------------------
  const byDay = new Map<string, number[]>();
  done.forEach((task) => {
    const day = String(task.completed_at).slice(0, 10);
    const hour = hourOf(task);
    if (Number.isNaN(hour)) return;
    const list = byDay.get(day) ?? [];
    list.push(hour);
    byDay.set(day, list);
  });
  const workedDays = [...byDay.values()];
  if (workedDays.length >= 12) {
    const split = workedDays.filter(
      (hours) => hours.some((hour) => hour < 17) && hours.some((hour) => hour >= 19),
    ).length;
    const share = Math.round((split / workedDays.length) * 100);
    if (share >= 30) {
      out.push({
        id: 'second-session',
        text: 'you often work again in the evening',
        support: `${split} of ${workedDays.length} days had work before 5 PM and after 7 PM`,
        frequency: wordFor(share),
        tone: 'green',
      });
    }
  }

  // ---- what follows what --------------------------------------------------
  if (habits.length >= 2) {
    const pairs = new Map<string, number>();
    byDay.forEach((_hours, day) => {
      const names = new Set(
        done
          .filter((task) => String(task.completed_at).slice(0, 10) === day)
          .map((task) => stemOf(task.title)),
      );
      habits.slice(0, 5).forEach((a) => {
        habits.slice(0, 5).forEach((b) => {
          if (a.id === b.id) return;
          if (names.has(stemOf(a.name)) && names.has(stemOf(b.name))) {
            const key = [a.name, b.name].sort().join(' + ');
            pairs.set(key, (pairs.get(key) ?? 0) + 1);
          }
        });
      });
    });
    const best = [...pairs.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 5) {
      const share = Math.round((best[1] / workedDays.length) * 100);
      out.push({
        id: 'pairing',
        text: `${best[0].replace(' + ', ' and ')} happen on the same day`,
        support: `${best[1]} days of ${workedDays.length}`,
        frequency: wordFor(share),
        tone: 'pink',
      });
    }
  }

  return out;
}

// --------------------------------------------------------------------------
// What changed lately
// --------------------------------------------------------------------------
export interface HabitShift {
  name: string;
  /** What happened to it, as a verb a reader recognises. */
  event: 'started' | 'strengthened' | 'weakened' | 'stopped';
  detail: string;
  tone: string;
}

/**
 * The behavioural history — what appeared, grew, faded or stopped.
 *
 * Read off `phases` rather than recomputed, so the timeline row on a card and
 * the entry in this list can never disagree about the same habit.
 */
export function habitShifts(habits: Habit[], toIso: string): HabitShift[] {
  const out: HabitShift[] = [];

  habits.forEach((habit) => {
    const first = habit.phases[0] ?? 0;
    const last = habit.phases[habit.phases.length - 1] ?? 0;
    const gapDays = habit.lastCompleted ? daysBetween(habit.lastCompleted, toIso) : 0;

    if (last === 0 && first > 0) {
      out.push({
        name: habit.name,
        event: 'stopped',
        detail: `None in the last ${gapDays} days.`,
        tone: 'pink',
      });
      return;
    }
    if (first === 0 && last > 0) {
      out.push({
        name: habit.name,
        event: 'started',
        detail: `New. Now ${last.toFixed(1)}× a week.`,
        tone: 'blue',
      });
      return;
    }
    if (first > 0 && last / first >= 1.4) {
      out.push({
        name: habit.name,
        event: 'strengthened',
        detail: `${first.toFixed(1)}× a week → ${last.toFixed(1)}× a week.`,
        tone: 'green',
      });
      return;
    }
    if (first > 0 && last / first <= 0.65) {
      out.push({
        name: habit.name,
        event: 'weakened',
        detail: `${first.toFixed(1)}× a week → ${last.toFixed(1)}× a week.`,
        tone: 'amber',
      });
    }
  });

  return out;
}

// --------------------------------------------------------------------------
// The overall picture
// --------------------------------------------------------------------------
export interface HabitSummary {
  tracked: number;
  strong: number;
  /** Share of the range's days with at least one completion, 0-100. */
  activeRate: number;
  /** The steadiest habit, by consistency. */
  anchor: Habit | null;
  /** The one falling fastest, if any is. */
  slipping: Habit | null;
}

export function habitSummary(habits: Habit[], days: GrowthDay[]): HabitSummary {
  const worked = countActiveDays(days);
  const declining = habits
    .filter((habit) => habit.trend !== null && habit.trend < 0)
    .sort((a, b) => (a.trend ?? 0) - (b.trend ?? 0));

  return {
    tracked: habits.length,
    strong: habits.filter((habit) => habit.strength === 'strong').length,
    activeRate: days.length ? Math.round((worked / days.length) * 100) : 0,
    anchor: habits[0] ?? null,
    slipping: declining[0] ?? null,
  };
}

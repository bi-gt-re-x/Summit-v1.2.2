/**
 * What the account's own record says about how this person works.
 *
 * The growth and analytics pages answer *how much* — totals, trajectories,
 * whether this stretch beat the last one. This answers *how*: which days carry
 * the work, what hour it happens at, how long a sitting lasts, how long the
 * gaps run, and whether effort is spread across subjects or piled on one.
 *
 * Two pages read it and they read it for opposite reasons. Insights states the
 * findings; Recommendations turns the same numbers into things to do
 * differently. Keeping the arithmetic here is what stops the two pages from
 * quietly disagreeing — a recommendation that contradicts the insight it was
 * derived from is the failure mode this module exists to prevent.
 *
 * Everything is derived from the day series and the account's tasks. Nothing
 * here is invented, and where the record cannot answer a question the function
 * says so with a null rather than guessing.
 */
import { isActiveDay } from './activeDay';
import type { GrowthDay, Task } from '@/types';

const num = (value: unknown) => Number(value) || 0;

/** Sunday first, matching every other weekday list in the app. */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// --------------------------------------------------------------------------
// The week
// --------------------------------------------------------------------------
export interface WeekdayStat {
  index: number;
  label: string;
  /** XP per occurrence of this weekday, not summed. */
  avgXp: number;
  avgFocusMinutes: number;
  /** Share of this weekday that had anything on it, 0-100. */
  activeRate: number;
  days: number;
}

/**
 * Each weekday averaged over its own occurrences.
 *
 * Averaged rather than totalled, and this is the one rule that matters here: a
 * ninety-day range holds thirteen Mondays and twelve Sundays, so a total makes
 * the extra Monday look like a preference. Per occurrence, the comparison is
 * about the day and not about the calendar.
 */
export function weekdayProfile(days: GrowthDay[]): WeekdayStat[] {
  const buckets = Array.from({ length: 7 }, () => ({ xp: 0, focus: 0, active: 0, days: 0 }));

  days.forEach((day) => {
    const at = new Date(`${day.date}T00:00:00`).getDay();
    const bucket = buckets[at]!;
    bucket.xp += num(day.xp_earned);
    bucket.focus += num(day.focus_minutes);
    bucket.days += 1;
    if (isActiveDay(day)) bucket.active += 1;
  });

  return buckets.map((bucket, index) => ({
    index,
    label: WEEKDAYS[index]!,
    avgXp: bucket.days ? bucket.xp / bucket.days : 0,
    avgFocusMinutes: bucket.days ? bucket.focus / bucket.days : 0,
    activeRate: bucket.days ? (bucket.active / bucket.days) * 100 : 0,
    days: bucket.days,
  }));
}

export interface WeekShape {
  stats: WeekdayStat[];
  best: WeekdayStat | null;
  worst: WeekdayStat | null;
  /** Weekday average against weekend average, as a percentage difference. */
  weekendGap: number | null;
  /** How lopsided the week is: the best day over the average day. */
  spread: number;
}

export function weekShape(days: GrowthDay[]): WeekShape {
  const stats = weekdayProfile(days);
  const withDays = stats.filter((stat) => stat.days > 0);
  if (withDays.length === 0) {
    return { stats, best: null, worst: null, weekendGap: null, spread: 1 };
  }

  const best = withDays.reduce((a, b) => (b.avgXp > a.avgXp ? b : a));
  const worst = withDays.reduce((a, b) => (b.avgXp < a.avgXp ? b : a));
  const mean = withDays.reduce((sum, stat) => sum + stat.avgXp, 0) / withDays.length;

  const pick = (indices: number[]) => {
    const chosen = stats.filter((stat) => indices.includes(stat.index) && stat.days > 0);
    if (chosen.length === 0) return null;
    return chosen.reduce((sum, stat) => sum + stat.avgXp, 0) / chosen.length;
  };
  const weekend = pick([0, 6]);
  const weekday = pick([1, 2, 3, 4, 5]);

  return {
    stats,
    best,
    worst,
    weekendGap:
      weekend !== null && weekday !== null && weekday > 0
        ? Math.round(((weekend - weekday) / weekday) * 100)
        : null,
    spread: mean > 0 ? best.avgXp / mean : 1,
  };
}

// --------------------------------------------------------------------------
// The clock
// --------------------------------------------------------------------------
export interface HourStat {
  hour: number;
  label: string;
  tasks: number;
  xp: number;
}

export interface ClockShape {
  hours: HourStat[];
  peak: HourStat | null;
  /** The narrowest run of hours holding half the finished work. */
  coreWindow: { from: number; to: number; share: number } | null;
  /** Share of tasks finished after 10 PM or before 5 AM, 0-100. */
  lateShare: number;
}

/** "6 PM", "12 AM" — the hour, the way a person says it. */
export function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

/**
 * When in the day work actually gets finished.
 *
 * Read off `completed_at`, which is the only timestamp on a task that records
 * a moment the person was present — `created_at` is when it was written down,
 * which is a different act and often a different day.
 *
 * The core window is the tightest run of consecutive hours holding half the
 * work. A single peak hour overstates how concentrated a habit is; a run says
 * "this is the shape of your day" and survives one unusual evening.
 */
export function clockShape(tasks: Task[]): ClockShape {
  const hours: HourStat[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: hourLabel(hour),
    tasks: 0,
    xp: 0,
  }));

  let total = 0;
  let late = 0;
  tasks.forEach((task) => {
    if (task.status !== 'done') return;
    const stamp = String(task.completed_at || '');
    const hour = Number(stamp.slice(11, 13));
    if (!stamp || Number.isNaN(hour)) return;
    const bucket = hours[hour];
    if (!bucket) return;
    bucket.tasks += 1;
    bucket.xp += num(task.xp_value);
    total += 1;
    if (hour >= 22 || hour < 5) late += 1;
  });

  if (total === 0) return { hours, peak: null, coreWindow: null, lateShare: 0 };

  const peak = hours.reduce((a, b) => (b.tasks > a.tasks ? b : a));

  // The shortest window covering half the work, tried at every width.
  let coreWindow: ClockShape['coreWindow'] = null;
  for (let width = 1; width <= 24 && !coreWindow; width++) {
    for (let from = 0; from < 24; from++) {
      let inside = 0;
      for (let step = 0; step < width; step++) inside += hours[(from + step) % 24]!.tasks;
      if (inside / total >= 0.5) {
        coreWindow = {
          from,
          to: (from + width) % 24,
          share: Math.round((inside / total) * 100),
        };
        break;
      }
    }
  }

  return { hours, peak, coreWindow, lateShare: Math.round((late / total) * 100) };
}

// --------------------------------------------------------------------------
// Sittings and gaps
// --------------------------------------------------------------------------
export interface RhythmShape {
  /** Focus minutes on a day that had any, averaged. */
  typicalSession: number;
  /** The best single day's focus, and when. */
  longestSession: { minutes: number; date: string } | null;
  /** Days worked out of days in the range, 0-100. */
  activeRate: number;
  /** The longest run of consecutive days with nothing on them. */
  longestGap: { days: number; from: string; to: string } | null;
  /** How many separate gaps of three days or more the range holds. */
  gapCount: number;
  /** Days in the range. */
  span: number;
}

/**
 * How the work is spaced out.
 *
 * A gap of three days is the threshold, and it is a judgement rather than a
 * measurement: one day off is a rest, two is a weekend, and three is the point
 * at which a habit has stopped and has to be restarted. Counting every
 * single-day gap would report a healthy routine as hundreds of interruptions.
 */
export function rhythmShape(days: GrowthDay[]): RhythmShape {
  const worked = days.filter(isActiveDay);
  const focusDays = days.filter((day) => num(day.focus_minutes) > 0);

  const typicalSession = focusDays.length
    ? focusDays.reduce((sum, day) => sum + num(day.focus_minutes), 0) / focusDays.length
    : 0;

  const longest = focusDays.reduce<RhythmShape['longestSession']>((best, day) => {
    const minutes = num(day.focus_minutes);
    return !best || minutes > best.minutes ? { minutes, date: day.date } : best;
  }, null);

  let longestGap: RhythmShape['longestGap'] = null;
  let gapCount = 0;
  let run = 0;
  let runStart = '';

  const close = (endedOn: string) => {
    if (run >= 3) {
      gapCount += 1;
      if (!longestGap || run > longestGap.days) {
        longestGap = { days: run, from: runStart, to: endedOn };
      }
    }
    run = 0;
  };

  /* A gap is broken by *any* day that had work on it, not only one that
     earned XP. Focus sessions earn none — see utils/activeDay — so counting
     XP here told somebody who sat down every day of a fortnight and logged it
     that they had taken a fourteen-day break, and then priced a
     "fill the three-day gaps" recommendation off the fiction. */
  days.forEach((day) => {
    if (isActiveDay(day)) {
      close(day.date);
      return;
    }
    if (run === 0) runStart = day.date;
    run += 1;
  });
  close(days[days.length - 1]?.date ?? '');

  return {
    typicalSession,
    longestSession: longest,
    activeRate: days.length ? (worked.length / days.length) * 100 : 0,
    longestGap,
    gapCount,
    span: days.length,
  };
}

// --------------------------------------------------------------------------
// Momentum
// --------------------------------------------------------------------------
export interface Momentum {
  label: string;
  now: number;
  before: number;
  /** Percentage change, or null when there is no earlier window to compare. */
  delta: number | null;
  format: (value: number) => string;
}

/**
 * The last stretch against the one before it, on four measures.
 *
 * Ninety days by default: long enough that a bad fortnight does not read as a
 * decline, short enough that a change of habit six months ago is not still
 * being reported as news.
 */
export function momentum(days: GrowthDay[], window = 90): Momentum[] {
  const now = days.slice(-window);
  const before = days.slice(-window * 2, -window);
  const comparable = before.length === now.length && now.length > 0;

  const sum = (rows: GrowthDay[], read: (day: GrowthDay) => number) =>
    rows.reduce((total, day) => total + read(day), 0);
  const change = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

  const build = (
    label: string,
    read: (day: GrowthDay) => number,
    format: (value: number) => string,
    perDay = false,
  ): Momentum => {
    const scale = (rows: GrowthDay[]) =>
      perDay && rows.length ? sum(rows, read) / rows.length : sum(rows, read);
    const a = scale(now);
    const b = comparable ? scale(before) : 0;
    return { label, now: a, before: b, delta: comparable ? change(a, b) : null, format };
  };

  return [
    build('XP earned', (day) => num(day.xp_earned), (v) => Math.round(v).toLocaleString()),
    build('Tasks finished', (day) => num(day.tasks_completed), (v) => Math.round(v).toLocaleString()),
    build('Focus hours', (day) => num(day.focus_minutes) / 60, (v) => `${Math.round(v)}h`),
    build(
      'Days worked',
      // The row is called "Days worked", so it counts days worked — all three
      // ways of doing it. See utils/activeDay.
      (day) => (isActiveDay(day) ? 1 : 0),
      (v) => `${Math.round(v)}`,
    ),
  ];
}

// --------------------------------------------------------------------------
// Balance
// --------------------------------------------------------------------------
export interface BalanceRow {
  name: string;
  xp: number;
  /** Its share of the window's subject XP, 0-100. */
  share: number;
  /** XP in the earlier half of the range, and in the later one. */
  early: number;
  late: number;
  /**
   * Which way it is going: `up` and `down` are a third's worth of movement
   * between the two halves, `steady` is anything smaller, and `stopped` is
   * real work in the first half and none at all in the second.
   */
  direction: 'up' | 'down' | 'steady' | 'stopped';
}

export interface BalanceShape {
  /** Share of XP held by the largest subject, 0-100. */
  concentration: number;
  leader: string | null;
  /** Named subjects carrying at least a twentieth of the work. */
  carrying: number;
  /** Subjects touched in the earlier half but not the later one. */
  fading: string[];
  /**
   * The same subjects, as ids rather than names.
   *
   * `fading` is what a panel prints and is therefore whatever the subject is
   * called today. This is what a recommendation about one of them is keyed on,
   * so that the follow-up measuring whether it was restarted is looking at the
   * same subject a month later even if it has been renamed since — see
   * `measureFor` in utils/followup. Same order as `fading`.
   */
  fadingIds: string[];
  /** Every subject with XP in the window, largest first. */
  rows: BalanceRow[];
  /** The window's total subject XP — what every share is a share of. */
  total: number;
}

/**
 * How evenly effort is spread, and what has quietly stopped.
 *
 * A fading subject is one with real work behind it in the first half of the
 * range and none in the second — which is a fact worth surfacing and is
 * invisible on any total, because the total still remembers it.
 */
export function balanceShape(
  tasks: Task[],
  nameOf: (id: string) => string,
  fromIso: string,
  toIso: string,
): BalanceShape {
  const nothing: BalanceShape = {
    concentration: 0,
    leader: null,
    carrying: 0,
    fading: [],
    fadingIds: [],
    rows: [],
    total: 0,
  };

  // The range can have no ends: the first render, before the day series has
  // arrived, asks for the balance of an empty window, and so does an account
  // with no days in it at all. There is no midpoint between two dates that are
  // not there — and asking for one throws rather than answering badly, which
  // took the whole page down with it. Answer the empty shape instead.
  const from = new Date(`${fromIso}T00:00:00`).getTime();
  const to = new Date(`${toIso}T00:00:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return nothing;

  const mid = new Date((from + to) / 2).toISOString().slice(0, 10);

  const early = new Map<string, number>();
  const late = new Map<string, number>();
  const all = new Map<string, number>();
  let total = 0;

  tasks.forEach((task) => {
    if (task.status !== 'done') return;
    const day = String(task.completed_at || '').slice(0, 10);
    if (!day || day < fromIso || day > toIso) return;
    const subject = task.subject;
    if (!subject) return;
    const xp = num(task.xp_value);
    total += xp;
    all.set(subject, (all.get(subject) ?? 0) + xp);
    const side = day < mid ? early : late;
    side.set(subject, (side.get(subject) ?? 0) + xp);
  });

  if (total === 0) return nothing;

  const ranked = [...all.entries()].sort((a, b) => b[1] - a[1]);
  const [leaderId, leaderXp] = ranked[0]!;

  // The two halves per subject, which the panel draws as a direction. The
  // threshold is a third rather than anything smaller: these are halves of one
  // window, so a subject worked on twice in one half and three times in the
  // other has not changed direction — it has been worked on five times.
  const rows: BalanceRow[] = ranked.map(([id, xp]) => {
    const before = early.get(id) ?? 0;
    const after = late.get(id) ?? 0;
    const direction: BalanceRow['direction'] =
      before > 0 && after === 0
        ? 'stopped'
        : after >= before * 1.33
          ? 'up'
          : after <= before * 0.67
            ? 'down'
            : 'steady';
    return { name: nameOf(id), xp, share: (xp / total) * 100, early: before, late: after, direction };
  });

  // Worked out once and split two ways: the names for the panels, the ids for
  // the recommendation that will be measured against them later.
  const fadingIds = [...early.entries()]
    .filter(([id, xp]) => xp / total >= 0.02 && !late.has(id))
    .map(([id]) => id);

  return {
    concentration: Math.round((leaderXp / total) * 100),
    leader: nameOf(leaderId),
    carrying: ranked.filter(([, xp]) => xp / total >= 0.05).length,
    fading: fadingIds.map(nameOf),
    fadingIds,
    rows,
    total,
  };
}

// --------------------------------------------------------------------------
// Subjects, by how well they are actually going
// --------------------------------------------------------------------------

/**
 * Fewest finished tasks in a subject before its ratings are worth reading.
 *
 * Five is low, and deliberately so: this is the floor for *reporting* a
 * subject's numbers, not for recommending a change on them. The rules in
 * utils/advice that act on this ask for more.
 */
export const SUBJECT_FLOOR = 5;

export interface SubjectQuality {
  id: string;
  name: string;
  /** Finished tasks in the window. */
  done: number;
  /**
   * Finished tasks in this subject over the whole record, not just the window.
   *
   * Here because the two questions want different spans. Whether a subject is
   * going well is a question about now, and reading it over a year would let a
   * good spring hide a bad fortnight. Whether it has been *dropped* cannot be
   * asked of the window at all: a subject last touched five weeks ago has
   * nothing inside a fortnight to be absent from, so on the window alone it
   * does not appear as neglected — it does not appear.
   */
  lifetimeDone: number;
  /** How many of those carried both ratings. */
  rated: number;
  /** Mean execution, 1-5, or null when too few were rated. */
  execution: number | null;
  /** Mean difficulty, 1-5, or null when too few were rated. */
  difficulty: number | null;
  /**
   * Execution in the later half of the window minus the earlier half.
   *
   * Null unless both halves carry at least two rated tasks — the one number
   * here that a single task can otherwise invent a trend out of.
   */
  movement: number | null;
  /** Days since the most recent finished task in this subject, over the whole record. */
  sinceDays: number | null;
}

export interface SubjectQualityShape {
  rows: SubjectQuality[];
  /** Mean execution across every subject with a reading. Null when none has. */
  average: number | null;
}

/**
 * Each subject as a quality reading rather than a quantity one.
 *
 * `balanceShape` above answers *where the effort went*; this answers *whether
 * it worked*. They are different questions and an account regularly gets
 * opposite answers to them — the subject carrying half the week is quite often
 * the one rated worst, which is exactly the finding neither an XP share nor a
 * task count can produce on its own.
 *
 * Everything is null where the record cannot answer. A subject nobody rated has
 * `execution: null`, which is not the same as a subject rated badly, and the
 * rules reading this must never collapse the two.
 */
export function subjectQuality(
  tasks: Task[],
  nameOf: (id: string) => string,
  fromIso: string,
  toIso: string,
  now: Date = new Date(),
): SubjectQualityShape {
  const from = new Date(`${fromIso}T00:00:00`).getTime();
  const to = new Date(`${toIso}T00:00:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return { rows: [], average: null };
  const mid = (from + to) / 2;

  /* Two passes over the same tasks. `lifetime` is every finished task in a
     subject, ever, and is what answers "when did this last happen"; `buckets`
     is the window, and is what answers "how is it going". A subject with a long
     history and nothing this fortnight has a row in `lifetime` and an empty one
     in `buckets`, which is exactly the state the dropped-subject rule looks
     for and the state a window-only pass cannot represent. */
  const lifetime = new Map<string, Task[]>();
  const buckets = new Map<string, Task[]>();
  tasks.forEach((task) => {
    if (task.status !== 'done' || !task.subject || !task.completed_at) return;
    const at = new Date(task.completed_at).getTime();
    if (!Number.isFinite(at)) return;
    const all = lifetime.get(task.subject) ?? [];
    all.push(task);
    lifetime.set(task.subject, all);
    if (at < from || at > to + 86_400_000) return;
    const list = buckets.get(task.subject) ?? [];
    list.push(task);
    buckets.set(task.subject, list);
  });

  const isRated = (task: Task) => num(task.difficulty) > 0 && num(task.execution) > 0;
  const avg = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  const rows: SubjectQuality[] = [...lifetime.entries()].map(([id, everything]) => {
    const list = buckets.get(id) ?? [];
    const rated = list.filter(isRated);
    const early = rated.filter((task) => new Date(task.completed_at!).getTime() < mid);
    const late = rated.filter((task) => new Date(task.completed_at!).getTime() >= mid);
    const earlyMean = early.length >= 2 ? avg(early.map((task) => num(task.execution))) : null;
    const lateMean = late.length >= 2 ? avg(late.map((task) => num(task.execution))) : null;

    /* By date, not by timestamp. `completed_at` carries a time of day, so a
       task finished at 7pm and read at 9am the next morning is "-1 days ago"
       if the two are subtracted directly — which is how a subject last worked
       on today ends up reported as dropped. Both sides are floored to local
       midnight, and the answer is never below zero. */
    const newest = everything
      .map((task) => {
        const at = new Date(task.completed_at!);
        if (Number.isNaN(at.getTime())) return NaN;
        return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
      })
      .filter((at) => Number.isFinite(at))
      .sort((a, b) => b - a)[0];
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return {
      id,
      name: nameOf(id),
      done: list.length,
      lifetimeDone: everything.length,
      rated: rated.length,
      execution: rated.length >= 3 ? avg(rated.map((task) => num(task.execution))) : null,
      difficulty: rated.length >= 3 ? avg(rated.map((task) => num(task.difficulty))) : null,
      movement: earlyMean !== null && lateMean !== null ? lateMean - earlyMean : null,
      sinceDays:
        newest === undefined ? null : Math.max(0, Math.round((midnight - newest) / 86_400_000)),
    };
  });

  rows.sort((a, b) => b.done - a.done);

  const readable = rows.filter((row) => row.execution !== null);
  return {
    rows,
    average: readable.length
      ? readable.reduce((sum, row) => sum + row.execution!, 0) / readable.length
      : null,
  };
}

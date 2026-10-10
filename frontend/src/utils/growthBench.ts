/**
 * The arithmetic behind Benchmarks — progress against a standard.
 *
 * ## Which standard
 *
 * There are three honest ones in this data and one dishonest one.
 *
 *   **The reader's own past.** Where this month stands against every other
 *   month they have had. This is the one most of the tab is built on.
 *   **A goal they set.** The Goals feature already stores a target and a
 *   deadline; this reads them and works out whether the pace they are going is
 *   the pace that gets there.
 *   **A ladder of round numbers.** Level tiers, XP tiers, streak tiers — the
 *   rungs anybody would pick, with the date each was cleared.
 *
 * The dishonest one is a cohort. This app stores one account's days; there is
 * no population in it, and a percentile against an invented peer group would be
 * a number with nothing behind it. So the only percentile on this page is
 * against the reader's own history — every 30-day window they have lived — and
 * it is shown only once there are enough windows for the figure to mean
 * something. Below that it says so and shows the baseline comparison instead.
 *
 * External standards — Codeforces, LeetCode, an RCM grade — are not in this
 * database at all. Rather than draw four empty categories, the page says which
 * ones it cannot see and points at the one place they can be tracked, which is
 * a goal with a number on it.
 */
import { countActiveDays } from './activeDay';
import type { Goal, GrowthDay, Task } from '@/types';
import { goalNumbers } from '@/components/Goals/numbers';

const num = (value: unknown): number => Number(value) || 0;

/** How long a window has to be before it is worth comparing. */
const WINDOW_DAYS = 30;

/** How many windows the account needs before a percentile is worth printing. */
const PERCENTILE_FLOOR = 45;

function sumOver(days: GrowthDay[], read: (day: GrowthDay) => number): number {
  return days.reduce((total, day) => total + read(day), 0);
}

// --------------------------------------------------------------------------
// The hero
// --------------------------------------------------------------------------
export interface BenchHero {
  /** Where the last 30 days rank among every 30-day window, or null. */
  percentile: number | null;
  /** How many windows that was measured over. */
  windows: number;
  /** The last 30 days against the account's opening stretch, as a percentage.
   *  The opening stretch is scaled to the same length first — see below. */
  fromBaseline: number | null;
  baselineXp: number;
  currentXp: number;
  /** The best 30-day stretch the account has ever had. */
  bestXp: number;
  bestEndedOn: string | null;
}

/**
 * Where the present sits in the account's own history.
 *
 * Both figures are 30-day totals, which is the shortest window that survives a
 * bad Tuesday. The percentile counts every 30-day window the account has had,
 * overlapping ones included — a reader who has been going eight months has
 * about two hundred of them, and the question "is this a good month for me" is
 * exactly the question that ranking answers.
 */
export function benchHero(all: GrowthDay[]): BenchHero {
  const xp = (day: GrowthDay) => num(day.xp_earned);
  const current = sumOver(all.slice(-WINDOW_DAYS), xp);

  // The baseline is the account's opening window, and it must not overlap the
  // closing one — a comparison that shares days with itself flatters whichever
  // end the shared days fell in. On an account younger than two months both
  // windows shrink to half its life, so the figure appears from about a
  // two weeks in rather than waiting for the sixtieth day.
  const baselineDays = Math.min(WINDOW_DAYS, Math.floor(all.length / 2));
  const baseline = sumOver(all.slice(0, baselineDays), xp);
  // Scaled to the same length as the window it is compared against, or a short
  // baseline would read as a collapse rather than as a shorter month.
  const scaled = baselineDays > 0 ? (baseline / baselineDays) * Math.min(WINDOW_DAYS, all.length) : 0;

  const totals: Array<{ value: number; endsOn: string }> = [];
  for (let end = WINDOW_DAYS - 1; end < all.length; end++) {
    totals.push({
      value: sumOver(all.slice(end - WINDOW_DAYS + 1, end + 1), xp),
      endsOn: all[end]!.date,
    });
  }

  const best = totals.reduce<{ value: number; endsOn: string } | null>(
    (top, row) => (!top || row.value > top.value ? row : top),
    null,
  );
  const below = totals.filter((row) => row.value < current).length;

  return {
    percentile:
      totals.length >= PERCENTILE_FLOOR ? Math.round((below / totals.length) * 100) : null,
    windows: totals.length,
    fromBaseline:
      scaled > 0 && all.length >= 14 ? Math.round(((current - scaled) / scaled) * 100) : null,
    baselineXp: Math.round(scaled),
    currentXp: Math.round(current),
    bestXp: Math.round(best?.value ?? 0),
    bestEndedOn: best?.endsOn ?? null,
  };
}

// --------------------------------------------------------------------------
// The categories
// --------------------------------------------------------------------------
export interface BenchRow {
  key: string;
  label: string;
  /** Where it stands now, formatted — the units differ per row. */
  current: string;
  /** The equivalent window before this one. */
  previous: string;
  /** A phrase printed in place of "was …", for the rows where the middle
   *  figure is not an earlier reading of the same thing. */
  note?: string;
  /** The account's best, and when. */
  best: string;
  bestOn: string | null;
  /** Now against best, 0-100 — what the bar draws. */
  percent: number;
  /** Now against previous, as a percentage, or null. */
  delta: number | null;
}

export interface BenchCategory {
  key: string;
  label: string;
  /** What the category is measuring, in a sentence. */
  note: string;
  rows: BenchRow[];
}

/**
 * The benchmarks this account can actually answer, grouped.
 *
 * Every row is the same shape — now, before, best — because that is the shape
 * of a benchmark: a reading, a reading it can be compared with, and the bar it
 * is trying to clear. The bar is always the reader's own record, so a row at
 * 100% means they are equalling their best and there is no way for the page to
 * flatter or bully anybody.
 */
export function benchCategories(all: GrowthDay[], tasks: Task[], streak: number): BenchCategory[] {
  const xp = (day: GrowthDay) => num(day.xp_earned);
  const done = (day: GrowthDay) => num(day.tasks_completed);
  const focus = (day: GrowthDay) => num(day.focus_minutes);

  const now = all.slice(-WINDOW_DAYS);
  const before = all.slice(-WINDOW_DAYS * 2, -WINDOW_DAYS);

  /** The best rolling 30-day window for a reading, and the day it ended on. */
  const bestWindow = (read: (day: GrowthDay) => number) => {
    let value = 0;
    let endsOn: string | null = null;
    for (let end = WINDOW_DAYS - 1; end < all.length; end++) {
      const total = sumOver(all.slice(end - WINDOW_DAYS + 1, end + 1), read);
      if (total > value) {
        value = total;
        endsOn = all[end]!.date;
      }
    }
    return { value, endsOn };
  };

  const row = (
    key: string,
    label: string,
    read: (day: GrowthDay) => number,
    unit: (value: number) => string,
  ): BenchRow => {
    const nowValue = sumOver(now, read);
    const beforeValue = sumOver(before, read);
    const best = bestWindow(read);
    return {
      key,
      label,
      current: unit(nowValue),
      previous: before.length ? unit(beforeValue) : '—',
      best: unit(best.value),
      bestOn: best.endsOn,
      percent: best.value > 0 ? Math.min(100, Math.round((nowValue / best.value) * 100)) : 0,
      delta:
        beforeValue > 0 ? Math.round(((nowValue - beforeValue) / beforeValue) * 100) : null,
    };
  };

  /* `countActiveDays` rather than a local "had XP" test: a focus session earns
     none, and the row this feeds is labelled "days worked". See
     utils/activeDay. The streak below stays on XP — it is the backend's own
     streak rule mirrored, and changing that here would put two different
     streaks on one page. */
  const activeDays = countActiveDays;
  const bestStreak = (() => {
    let best = 0;
    let run = 0;
    all.forEach((day) => {
      if (xp(day) > 0) {
        run += 1;
        best = Math.max(best, run);
      } else run = 0;
    });
    return best;
  })();

  const asXp = (value: number) => `${Math.round(value).toLocaleString()} XP`;
  const asCount = (value: number) => Math.round(value).toLocaleString();
  const asHours = (value: number) => `${(value / 60).toFixed(1)} hrs`;

  return [
    {
      key: 'output',
      label: 'Output',
      note: 'What the last 30 days produced, against your best 30.',
      rows: [
        row('xp', 'XP earned', xp, asXp),
        row('tasks', 'Tasks completed', done, asCount),
      ],
    },
    {
      key: 'discipline',
      label: 'Discipline',
      note: 'Whether the work keeps landing, against the best run you have had.',
      rows: [
        {
          key: 'active',
          label: 'Days worked',
          current: `${activeDays(now)} of ${now.length}`,
          previous: before.length ? `${activeDays(before)} of ${before.length}` : '—',
          best: `${bestStreak} in a row`,
          bestOn: null,
          percent: now.length ? Math.round((activeDays(now) / now.length) * 100) : 0,
          delta:
            before.length && activeDays(before) > 0
              ? Math.round(
                  ((activeDays(now) - activeDays(before)) / activeDays(before)) * 100,
                )
              : null,
        },
        {
          key: 'streak',
          label: 'Current streak',
          current: `${streak} days`,
          previous: '—',
          best: `${bestStreak} days`,
          bestOn: null,
          percent: bestStreak > 0 ? Math.min(100, Math.round((streak / bestStreak) * 100)) : 0,
          delta: null,
        },
      ],
    },
    {
      key: 'focus',
      label: 'Focus',
      note: 'Tracked focus time, against your deepest 30 days.',
      rows: [row('focus', 'Hours focused', focus, asHours)],
    },
    {
      key: 'quality',
      label: 'Quality',
      note: 'How heavy the work was, and whether it beat its own deadlines.',
      rows: [
        {
          key: 'pertask',
          label: 'XP a task',
          current: asXp(sumOver(now, done) > 0 ? sumOver(now, xp) / sumOver(now, done) : 0),
          previous:
            before.length && sumOver(before, done) > 0
              ? asXp(sumOver(before, xp) / sumOver(before, done))
              : '—',
          best: asXp(
            Math.max(0, ...all.map((day) => (done(day) > 0 ? xp(day) / done(day) : 0))),
          ),
          bestOn: null,
          percent: (() => {
            const peak = Math.max(
              0,
              ...all.map((day) => (done(day) > 0 ? xp(day) / done(day) : 0)),
            );
            const value = sumOver(now, done) > 0 ? sumOver(now, xp) / sumOver(now, done) : 0;
            return peak > 0 ? Math.min(100, Math.round((value / peak) * 100)) : 0;
          })(),
          delta: null,
        },
        (() => {
          const timed = tasks.filter(
            (task) => task.status === 'done' && typeof task.met_deadline === 'boolean',
          );
          const met = timed.filter((task) => task.met_deadline).length;
          const pct = timed.length ? Math.round((met / timed.length) * 100) : 0;
          return {
            key: 'ontime',
            label: 'Beat the deadline',
            current: timed.length ? `${pct}%` : 'no timed tasks',
            previous: '—',
            note: timed.length ? `${met} of ${timed.length} timed` : 'nothing timed yet',
            // Every timed task on time. The one row on the page whose bar is
            // against a perfect score rather than against a personal best,
            // because "on time" has a ceiling and a personal best does not.
            best: '100%',
            bestOn: null,
            percent: pct,
            delta: null,
          };
        })(),
      ],
    },
  ];
}

// --------------------------------------------------------------------------
// The ladder
// --------------------------------------------------------------------------
export interface LadderStep {
  value: number;
  label: string;
  state: 'done' | 'current' | 'future';
  /** The day it was cleared, for the ones that were. */
  on: string | null;
  /** Days to reach it at the last 30 days' pace, for the ones ahead. */
  inDays: number | null;
}

/** The rungs. Round numbers, because a ladder nobody would have picked is not one. */
const XP_RUNGS = [500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000];

/**
 * The XP ladder, with the date each rung was cleared.
 *
 * Six rungs are drawn — the ones just behind and the ones just ahead — because
 * a ladder from 500 to 100,000 on one line makes every rung a reader has
 * actually cleared invisible at the left end.
 */
export function xpLadder(all: GrowthDay[], span = 6): LadderStep[] {
  const total = num(all[all.length - 1]?.cumulative_xp);
  const rate =
    all.length > 0
      ? sumOver(all.slice(-WINDOW_DAYS), (day) => num(day.xp_earned)) /
        Math.min(WINDOW_DAYS, all.length)
      : 0;

  const clearedOn = (rung: number): string | null => {
    const day = all.find((entry) => num(entry.cumulative_xp) >= rung);
    return day?.date ?? null;
  };

  const nextIndex = XP_RUNGS.findIndex((rung) => rung > total);
  const at = nextIndex === -1 ? XP_RUNGS.length : nextIndex;
  const from = Math.max(0, Math.min(at - 2, XP_RUNGS.length - span));

  return XP_RUNGS.slice(from, from + span).map((rung, index) => {
    const done = total >= rung;
    const remaining = Math.max(0, rung - total);
    return {
      value: rung,
      label: rung >= 1000 ? `${rung / 1000}k` : String(rung),
      state: done ? 'done' : from + index === at ? 'current' : 'future',
      on: done ? clearedOn(rung) : null,
      inDays: !done && rate > 0 ? Math.ceil(remaining / rate) : null,
    };
  });
}

// --------------------------------------------------------------------------
// Records
// --------------------------------------------------------------------------
export interface BestRecord {
  key: string;
  label: string;
  /** The figure as it is printed — "1,240 XP". */
  value: string;
  /**
   * The same figure as a number, at the precision `value` shows it to.
   *
   * Both, rather than one built from the other, because the two callers want
   * different things. The analytics tab prints the string and is done; the
   * Records page counts the number up from zero, and a count-up needs the
   * number, the unit and the decimal places kept apart — see hooks/useCountUp,
   * which asks to be fed the value at the precision it is displayed so it does
   * not animate digits nobody can see.
   */
  amount: number;
  /** What follows the number: "XP", "days", "hrs", or nothing. */
  unit: string;
  /** How many decimals `value` shows. */
  decimals: number;
  on: string | null;
  icon: string;
}

/** The account's high scores, each with the day it was set. */
export function personalRecords(all: GrowthDay[], tasks: Task[], streak: number): BestRecord[] {
  const peak = (read: (day: GrowthDay) => number) =>
    all.reduce<{ value: number; on: string | null }>(
      (top, day) => (read(day) > top.value ? { value: read(day), on: day.date } : top),
      { value: 0, on: null },
    );

  const bestWindow = (size: number) => {
    let value = 0;
    let on: string | null = null;
    for (let end = size - 1; end < all.length; end++) {
      const total = sumOver(all.slice(end - size + 1, end + 1), (day) => num(day.xp_earned));
      if (total > value) {
        value = total;
        on = all[end]!.date;
      }
    }
    return { value, on };
  };

  /* XP, not `isActiveDay`, and that is on purpose in both streak loops here:
     this mirrors the backend's own streak rule (`refresh_streak` in
     backend/tracking/xp.py), and a streak computed one way on this row and
     another way on the dashboard would be two streaks on one account. See
     utils/activeDay for the wider definition every "days worked" figure uses. */
  let best = 0;
  let run = 0;
  all.forEach((day) => {
    if (num(day.xp_earned) > 0) {
      run += 1;
      best = Math.max(best, run);
    } else run = 0;
  });

  const bestXpDay = peak((day) => num(day.xp_earned));
  const bestTasks = peak((day) => num(day.tasks_completed));
  const bestFocus = peak((day) => num(day.focus_minutes));
  const week = bestWindow(7);
  const heaviest = tasks
    .filter((task) => task.status === 'done')
    .reduce<{ value: number; on: string | null }>(
      (top, task) =>
        num(task.xp_value) > top.value
          ? { value: num(task.xp_value), on: (task.completed_at || '').slice(0, 10) || null }
          : top,
      { value: 0, on: null },
    );

  /** One row, with the printed form and the number kept in step. */
  const record = (
    key: string,
    label: string,
    amount: number,
    unit: string,
    decimals: number,
    on: string | null,
    icon: string,
  ): BestRecord => {
    const rounded = decimals > 0
      ? Number(amount.toFixed(decimals))
      : Math.round(amount);
    const printed = decimals > 0
      ? rounded.toFixed(decimals)
      : rounded.toLocaleString();
    return {
      key,
      label,
      value: unit ? `${printed} ${unit}` : printed,
      amount: rounded,
      unit,
      decimals,
      on,
      icon,
    };
  };

  return [
    record('day', 'Best day', bestXpDay.value, 'XP', 0, bestXpDay.on, 'spark'),
    record('week', 'Best week', week.value, 'XP', 0, week.on, 'trend'),
    record('tasks', 'Most tasks in a day', bestTasks.value, '', 0, bestTasks.on, 'check'),
    record('focus', 'Deepest day', bestFocus.value / 60, 'hrs', 1, bestFocus.on, 'clock'),
    record('streak', 'Longest streak', best, 'days', 0, null, 'flame'),
    record('heaviest', 'Heaviest single task', heaviest.value, 'XP', 0, heaviest.on, 'trophy'),
    record('now', 'Streak right now', streak, 'days', 0, null, 'target'),
  ];
}

// --------------------------------------------------------------------------
// The next record
// --------------------------------------------------------------------------
export interface RecordChase {
  key: string;
  /** The record being chased — "Best day". */
  label: string;
  /** What the live figure is measured over: "today", "the last 7 days". */
  window: string;
  /** The standing record. Beating it means passing this. */
  target: number;
  /** Where the live counterpart stands right now. */
  current: number;
  /** Still to go. Zero once the record has been matched or passed. */
  remaining: number;
  /** 0-100, capped. */
  percent: number;
  unit: string;
  decimals: number;
  icon: string;
  /** True when the live figure has already reached the record. */
  held: boolean;
}

/**
 * What it would take to beat each record, and how close today is.
 *
 * Only the records with a live counterpart are here, and that is the whole
 * selection rule. "Best day" has one — today — so the gap between them is a
 * real thing to chase. "Heaviest single task" does not: there is no running
 * total of the biggest task you might finish later, and a bar showing 0% of it
 * every day until the day it is beaten would be a bar that is wrong on every
 * day but one.
 *
 * A record the account is currently holding — today *is* the best day — reads
 * as held rather than as 100% of itself, because those are different facts and
 * only one of them is worth being pleased about.
 *
 * The XP ladder is not folded in here. Its rungs are round numbers somebody
 * else picked, not records this account set, and mixing "beat your own best
 * week" with "reach 25,000 XP" in one list would blur the only thing that
 * makes a personal record personal.
 */
export function recordChase(all: GrowthDay[], streak: number): RecordChase[] {
  if (all.length === 0) return [];

  const records = personalRecords(all, [], streak);
  const by = new Map(records.map((row) => [row.key, row]));
  const today = all[all.length - 1]!;

  const lastSeven = sumOver(all.slice(-7), (day) => num(day.xp_earned));

  const chase = (
    key: string,
    window: string,
    current: number,
  ): RecordChase | null => {
    const record = by.get(key);
    if (!record) return null;
    const decimals = record.decimals;
    const at = decimals > 0 ? Number(current.toFixed(decimals)) : Math.round(current);
    const target = record.amount;
    // A record of zero is not a record — an account with no focus time yet has
    // nothing to beat, and a bar at 100% of nothing says otherwise.
    if (target <= 0) return null;
    return {
      key,
      label: record.label,
      window,
      target,
      current: at,
      remaining: Math.max(0, Number((target - at).toFixed(decimals))),
      percent: Math.min(100, (at / target) * 100),
      unit: record.unit,
      decimals,
      icon: record.icon,
      held: at >= target,
    };
  };

  return [
    chase('day', 'today', num(today.xp_earned)),
    chase('week', 'the last 7 days', lastSeven),
    chase('tasks', 'today', num(today.tasks_completed)),
    chase('focus', 'today', num(today.focus_minutes) / 60),
    chase('streak', 'right now', streak),
  ].filter((row): row is RecordChase => row !== null);
}

// --------------------------------------------------------------------------
// Goals as benchmarks
// --------------------------------------------------------------------------
export type GoalStanding = 'ahead' | 'on track' | 'behind' | 'no deadline' | 'done';

export interface GoalBench {
  key: string;
  title: string;
  unit: string;
  current: number;
  target: number;
  percent: number;
  deadline: string | null;
  daysLeft: number | null;
  /** Per day, to get there by the deadline. */
  needPace: number | null;
  /** Per day, what the account is actually doing. */
  havePace: number | null;
  standing: GoalStanding;
}

/**
 * The reader's own goals, read as benchmarks with a pace on each.
 *
 * A goal already knows its target and its deadline; what it does not say is
 * whether the rate the account is going is the rate that arrives on time. That
 * is two divisions, and it is the difference between a progress bar and a plan.
 *
 * The pace comes from the last 30 days of the series rather than from the
 * goal's own history, because a goal set yesterday has no history and the
 * reader's recent pace is the best available guess at what they will keep
 * doing. A streak goal has no pace at all — a streak is survived rather than
 * accumulated — so its row carries the days remaining and nothing more.
 */
export function goalBenchmarks(goals: Goal[], all: GrowthDay[], todayIso: string): GoalBench[] {
  const days = Math.max(1, Math.min(WINDOW_DAYS, all.length));
  const window = all.slice(-days);
  const perDay = {
    xp: sumOver(window, (day) => num(day.xp_earned)) / days,
    tasks: sumOver(window, (day) => num(day.tasks_completed)) / days,
    focus: sumOver(window, (day) => num(day.focus_minutes)) / days,
    streak: 1,
  };

  return goals
    .map((goal) => {
      const figures = goalNumbers(goal);
      const deadline = (goal.deadline || '').slice(0, 10) || null;
      const daysLeft = deadline
        ? Math.round(
            (new Date(`${deadline}T00:00:00`).getTime() -
              new Date(`${todayIso}T00:00:00`).getTime()) /
              86_400_000,
          )
        : null;

      const remaining = Math.max(0, figures.target - figures.current);
      const havePace = perDay[figures.goalType] ?? null;
      const needPace = daysLeft !== null && daysLeft > 0 ? remaining / daysLeft : null;

      let standing: GoalStanding;
      if (goal.status === 'completed' || remaining <= 0) standing = 'done';
      else if (daysLeft === null) standing = 'no deadline';
      else if (needPace === null) standing = 'behind';
      else if (havePace >= needPace * 1.15) standing = 'ahead';
      else if (havePace >= needPace * 0.9) standing = 'on track';
      else standing = 'behind';

      return {
        key: goal.id,
        title: goal.title,
        unit: figures.label,
        current: figures.current,
        target: figures.target,
        percent: Math.round(figures.progress),
        deadline,
        daysLeft,
        needPace,
        havePace,
        standing,
      };
    })
    .sort((a, b) => a.percent - b.percent);
}

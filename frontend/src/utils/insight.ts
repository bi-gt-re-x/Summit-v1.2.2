/**
 * Why and how — the interpretive layer behind the Insights tab.
 *
 * The Habits tab counts what happens. This one connects two counts together
 * and says what the connection looks like, which is a different and more
 * dangerous job: the moment a page starts explaining behaviour it becomes very
 * easy to state a coincidence as a cause. So three rules run through every
 * function here, and they are the reason this file exists separately from
 * utils/behaviour rather than growing inside it.
 *
 * **Nothing claims causation.** A relationship is reported as "associated
 * with", "tends to", "appears to". The one place a causal word would be
 * correct — a total that fell because fewer days were worked, which is
 * arithmetic and not inference — says so explicitly and shows the arithmetic.
 *
 * **Every finding carries its evidence.** `Strength` is computed from the
 * sample size and the correlation, never assigned by hand, and it is printed
 * beside the finding. A reader who disagrees with a conclusion can see exactly
 * how thin the thing underneath it is.
 *
 * **A thin record produces no finding at all.** Each function has a floor and
 * returns nothing below it. `unlock` turns that into the sentence the tab shows
 * instead — "keep using Summit for 9 more days" beats a confident claim drawn
 * from a fortnight, which is the failure mode this whole file is arranged
 * against.
 */
import type { GrowthDay, Task } from '@/types';
import { activeRate } from './activeDay';
import type { BalanceShape, ClockShape, RhythmShape, WeekShape } from './behaviour';
import { hourLabel } from './behaviour';

const num = (value: unknown) => Number(value) || 0;

// --------------------------------------------------------------------------
// Evidence
// --------------------------------------------------------------------------
export type Strength = 'strong' | 'likely' | 'weak';

export const STRENGTH_TEXT: Record<Strength, string> = {
  strong: 'Strong evidence',
  likely: 'Likely',
  weak: 'Weak evidence',
};

export const STRENGTH_HUE: Record<Strength, string> = {
  strong: 'green',
  likely: 'blue',
  weak: 'amber',
};

/**
 * Pearson's r over paired observations, with the pairs counted.
 *
 * Pearson rather than anything cleverer because the alternative is a
 * correlation nobody reading the page can check. Both of these series are
 * small, noisy and human, and a coefficient whose meaning is widely understood
 * is worth more here than one that fits slightly better.
 */
export function correlate(pairs: Array<[number, number]>): { r: number; n: number } {
  const n = pairs.length;
  if (n < 3) return { r: 0, n };
  const meanA = pairs.reduce((sum, [a]) => sum + a, 0) / n;
  const meanB = pairs.reduce((sum, [, b]) => sum + b, 0) / n;
  let top = 0;
  let leftSq = 0;
  let rightSq = 0;
  pairs.forEach(([a, b]) => {
    const da = a - meanA;
    const db = b - meanB;
    top += da * db;
    leftSq += da * da;
    rightSq += db * db;
  });
  const bottom = Math.sqrt(leftSq * rightSq);
  return { r: bottom === 0 ? 0 : top / bottom, n };
}

/**
 * How much weight a coefficient can carry, from its size and its sample.
 *
 * Both matter and neither alone is enough: r = 0.9 over four days is a
 * coincidence with a decimal point, and r = 0.2 over four hundred is real and
 * too small to act on. The thresholds are conventional rather than derived,
 * which is why they are stated in one place a reader can find and argue with.
 */
export function strengthOf(r: number, n: number): Strength {
  const size = Math.abs(r);
  if (n >= 30 && size >= 0.55) return 'strong';
  if (n >= 15 && size >= 0.32) return 'likely';
  return 'weak';
}

// --------------------------------------------------------------------------
// Enough data?
// --------------------------------------------------------------------------
export interface Unlock {
  /** True when the section can be drawn from the reader's own record. */
  ready: boolean;
  /** What to say when it cannot. */
  message: string;
}

/**
 * Whether a section has the history it needs, and what to say when it does not.
 *
 * Deliberately not an error state. The section is not broken; it is waiting,
 * and telling somebody how many more days it needs is both true and the only
 * useful thing to say — an empty panel with a shrug in it teaches nobody that
 * the page gets better.
 */
export function unlock(have: number, need: number, what: string): Unlock {
  if (have >= need) return { ready: true, message: '' };
  const short = need - have;
  return {
    ready: false,
    message: `Shows ${what} after ${short} more ${short === 1 ? 'day' : 'days'} of use.`,
  };
}

// --------------------------------------------------------------------------
// A finding
// --------------------------------------------------------------------------
export interface Finding {
  id: string;
  /** The claim, hedged in proportion to its evidence. */
  headline: string;
  /** The figures it was read off. */
  detail: string;
  strength: Strength;
  tone: string;
}

/** "18%" from a ratio, always positive — the direction is in the sentence. */
const pct = (value: number) => `${Math.abs(Math.round(value))}%`;

const mean = (list: number[]) =>
  list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;

// --------------------------------------------------------------------------
// Why
// --------------------------------------------------------------------------
/**
 * What is behind the way the last stretch went.
 *
 * The first finding is arithmetic rather than inference and is stated as such:
 * a period's XP is its active days times its XP per active day, so a change in
 * the total decomposes exactly into those two, and whichever moved more is
 * *the* reason in a sense that needs no hedging. Everything after it is a
 * correlation and is hedged.
 */
export function whyFindings(days: GrowthDay[], window = 30): Finding[] {
  const out: Finding[] = [];
  const now = days.slice(-window);
  const before = days.slice(-window * 2, -window);
  if (now.length < 7 || before.length !== now.length) return out;

  /* Days that *earned*, not days worked — narrower than `isActiveDay` on
     purpose. The finding below states an identity: a period's total is working
     days times XP on a working day. That only holds if the days counted are
     the ones the XP came from, so a focus-only day does not belong in this
     particular denominator. See utils/activeDay. */
  const activeOf = (rows: GrowthDay[]) => rows.filter((day) => num(day.xp_earned) > 0);
  const sum = (rows: GrowthDay[]) => rows.reduce((total, day) => total + num(day.xp_earned), 0);

  const nowActive = activeOf(now);
  const wasActive = activeOf(before);
  const nowTotal = sum(now);
  const wasTotal = sum(before);
  if (wasTotal <= 0 || wasActive.length === 0) return out;

  const totalChange = ((nowTotal - wasTotal) / wasTotal) * 100;
  const daysChange = ((nowActive.length - wasActive.length) / wasActive.length) * 100;
  const perDayNow = nowTotal / Math.max(1, nowActive.length);
  const perDayWas = wasTotal / wasActive.length;
  const perDayChange = ((perDayNow - perDayWas) / perDayWas) * 100;

  if (Math.abs(totalChange) >= 8) {
    const byDays = Math.abs(daysChange) >= Math.abs(perDayChange);
    out.push({
      id: 'why-decomposition',
      headline: `Your XP ${totalChange > 0 ? 'rose' : 'fell'} ${pct(totalChange)} in the last ${window} days, mostly because of ${
        byDays ? 'how often you worked' : 'how much you did each day'
      }`,
      detail: `Days worked went ${daysChange >= 0 ? 'up' : 'down'} ${pct(daysChange)} (${
        wasActive.length
      } → ${nowActive.length}) and XP per day went ${
        perDayChange >= 0 ? 'up' : 'down'
      } ${pct(perDayChange)} (${Math.round(perDayWas).toLocaleString()} → ${Math.round(
        perDayNow,
      ).toLocaleString()}).`,
      strength: 'strong',
      tone: totalChange > 0 ? 'green' : 'amber',
    });
  }

  // ---- the weekend's part in it ------------------------------------------
  const weekendShare = (rows: GrowthDay[]) => {
    const weekend = rows.filter((day) => {
      const at = new Date(`${day.date}T00:00:00`).getDay();
      return at === 0 || at === 6;
    });
    const total = sum(rows);
    return total > 0 ? (sum(weekend) / total) * 100 : 0;
  };
  const shareNow = weekendShare(now);
  const shareWas = weekendShare(before);
  if (Math.abs(shareNow - shareWas) >= 6) {
    out.push({
      id: 'why-weekend',
      headline: `You're doing ${shareNow > shareWas ? 'more' : 'less'} on weekends`,
      detail: `Weekends made up ${Math.round(shareNow)}% of your XP in the last ${window} days, compared with ${Math.round(
        shareWas,
      )}% before.`,
      strength: now.length >= 28 ? 'likely' : 'weak',
      tone: 'blue',
    });
  }

  // ---- steadiness ---------------------------------------------------------
  const spread = (rows: GrowthDay[]) => {
    const active = activeOf(rows).map((day) => num(day.xp_earned));
    if (active.length < 5) return null;
    const average = mean(active);
    const variance = mean(active.map((value) => (value - average) ** 2));
    return average > 0 ? Math.sqrt(variance) / average : null;
  };
  const spreadNow = spread(now);
  const spreadWas = spread(before);
  if (spreadNow !== null && spreadWas !== null && Math.abs(spreadNow - spreadWas) >= 0.15) {
    const steadier = spreadNow < spreadWas;
    out.push({
      id: 'why-variance',
      headline: steadier ? 'Your days are more consistent' : 'Your days are less consistent',
      detail: `The variation in your daily XP ${
        steadier ? 'fell' : 'rose'
      } from ${spreadWas.toFixed(2)} to ${spreadNow.toFixed(2)}. ${
        steadier ? 'You have a steadier routine.' : 'You are working in bursts.'
      }`,
      strength: 'likely',
      tone: steadier ? 'green' : 'amber',
    });
  }

  return out;
}

// --------------------------------------------------------------------------
// How
// --------------------------------------------------------------------------
/**
 * The conditions this account's better work tends to appear under.
 *
 * Every clause here is a comparison of two subsets of the reader's own record —
 * scheduled tasks against spontaneous ones, long sittings against short — and
 * every one of them is stated as a tendency, because that is all a comparison
 * of two subsets can support.
 */
export function howFindings(
  days: GrowthDay[],
  tasks: Task[],
  clock: ClockShape,
  rhythm: RhythmShape,
): Finding[] {
  const out: Finding[] = [];

  // ---- how long a productive sitting runs --------------------------------
  /* Both, and an `&&` rather than the usual `||`: this finding correlates one
     against the other, so a day missing either has no point to plot. Not the
     shared "day worked" test — see utils/activeDay. */
  const focusDays = days.filter((day) => num(day.focus_minutes) > 0 && num(day.xp_earned) > 0);
  if (focusDays.length >= 12) {
    const sorted = [...focusDays].sort((a, b) => num(a.focus_minutes) - num(b.focus_minutes));
    const third = Math.max(1, Math.floor(sorted.length / 3));
    const short = sorted.slice(0, third);
    const long = sorted.slice(-third);
    const perMinute = (rows: GrowthDay[]) =>
      mean(rows.map((day) => num(day.xp_earned) / Math.max(1, num(day.focus_minutes))));
    const shortRate = perMinute(short);
    const longRate = perMinute(long);
    const bestBand = longRate >= shortRate ? long : short;
    const bandLow = Math.round(num(bestBand[0]?.focus_minutes));
    const bandHigh = Math.round(num(bestBand[bestBand.length - 1]?.focus_minutes));
    const { r, n } = correlate(
      focusDays.map((day) => [num(day.focus_minutes), num(day.xp_earned)] as [number, number]),
    );
    out.push({
      id: 'how-session',
      headline: `You work best in ${bandLow}–${bandHigh} minute sessions`,
      detail: `Over ${focusDays.length} days, your ${
        longRate >= shortRate ? 'longest' : 'shortest'
      } sessions earned ${pct(
        ((Math.max(longRate, shortRate) - Math.min(longRate, shortRate)) /
          Math.max(0.0001, Math.min(longRate, shortRate))) *
          100,
      )} more XP per minute than your ${longRate >= shortRate ? 'shortest' : 'longest'}.`,
      strength: strengthOf(r, n),
      tone: 'green',
    });
  }

  // ---- scheduled against spontaneous -------------------------------------
  const withDate = tasks.filter((task) => Boolean(task.due_date));
  const without = tasks.filter((task) => !task.due_date);
  if (withDate.length >= 10 && without.length >= 10) {
    const rate = (list: Task[]) =>
      (list.filter((task) => task.status === 'done').length / list.length) * 100;
    const scheduled = rate(withDate);
    const spontaneous = rate(without);
    if (Math.abs(scheduled - spontaneous) >= 5) {
      out.push({
        id: 'how-scheduled',
        headline: `Tasks with a due date are ${pct(scheduled - spontaneous)} ${
          scheduled > spontaneous ? 'more' : 'less'
        } likely to get done`,
        detail: `You finished ${Math.round(scheduled)}% of ${withDate.length} dated tasks and ${Math.round(
          spontaneous,
        )}% of ${without.length} without a date.`,
        strength: strengthOf(0.4, Math.min(withDate.length, without.length)),
        tone: 'violet',
      });
    }
  }

  // ---- difficulty against completion -------------------------------------
  const byPriority = (level: Task['priority']) => tasks.filter((task) => task.priority === level);
  const high = byPriority('high');
  const low = byPriority('low');
  if (high.length >= 8 && low.length >= 8) {
    const rate = (list: Task[]) =>
      (list.filter((task) => task.status === 'done').length / list.length) * 100;
    const hard = rate(high);
    const easy = rate(low);
    if (Math.abs(hard - easy) >= 8) {
      out.push({
        id: 'how-difficulty',
        headline: hard >= easy ? 'You finish your high-priority tasks' : 'Your high-priority tasks are slipping',
        detail: `You finish ${Math.round(hard)}% of high-priority tasks and ${Math.round(
          easy,
        )}% of low-priority ones.`,
        strength: strengthOf(0.4, Math.min(high.length, low.length)),
        tone: 'amber',
      });
    }
  }

  // ---- the window it happens in ------------------------------------------
  if (clock.coreWindow && clock.coreWindow.share >= 45) {
    out.push({
      id: 'how-window',
      headline: `You get most done between ${hourLabel(
        clock.coreWindow.from,
      )} and ${hourLabel(clock.coreWindow.to)}`,
      detail: `${clock.coreWindow.share}% of your tasks are finished in this window. ${
        clock.coreWindow.share >= 60
          ? 'Schedule important work here.'
          : 'The rest are spread across the day.'
      }`,
      strength: clock.coreWindow.share >= 60 ? 'strong' : 'likely',
      tone: 'blue',
    });
  }

  // ---- what a gap costs ---------------------------------------------------
  if (rhythm.gapCount > 0 && rhythm.span >= 60) {
    out.push({
      id: 'how-gaps',
      headline: 'Breaks are costing you momentum',
      detail: `You had ${rhythm.gapCount} breaks of 3+ days in ${rhythm.span.toLocaleString()} days. The first day back is usually slower.`,
      strength: rhythm.gapCount >= 4 ? 'likely' : 'weak',
      tone: 'pink',
    });
  }

  return out;
}

// --------------------------------------------------------------------------
// What is working
// --------------------------------------------------------------------------
export interface Win {
  id: string;
  text: string;
  figure: string;
  tone: string;
}

/**
 * The things currently going right, and only those.
 *
 * A page that only ever finds faults gets closed, and an account improving on
 * four measures deserves to be told so in the same tone the problems are stated
 * in. Nothing here is generated on a schedule: every entry is a measured
 * improvement over the previous period of the same length, so a genuinely flat
 * stretch produces an empty list and the panel says so.
 */
export function whatsWorking(
  days: GrowthDay[],
  habits: Array<{ name: string; strength: string; streak: number; unit: string; consistency: number }>,
  window = 30,
): Win[] {
  const out: Win[] = [];
  const now = days.slice(-window);
  const before = days.slice(-window * 2, -window);
  const comparable = before.length === now.length && now.length >= 7;

  if (comparable) {
    const measure = (
      id: string,
      label: string,
      read: (day: GrowthDay) => number,
      format: (value: number) => string,
      tone: string,
    ) => {
      const a = mean(now.map(read));
      const b = mean(before.map(read));
      if (b <= 0 || a <= b) return;
      const change = ((a - b) / b) * 100;
      if (change < 5) return;
      out.push({
        id,
        text: `${label} is up ${pct(change)} on the previous ${window} days`,
        figure: `${format(b)} → ${format(a)}`,
        tone,
      });
    };

    measure('win-xp', 'Your daily XP', (day) => num(day.xp_earned), (v) => Math.round(v).toLocaleString(), 'violet');
    measure('win-tasks', 'Task completion', (day) => num(day.tasks_completed), (v) => v.toFixed(1), 'green');
    measure(
      'win-focus',
      'Average focus time',
      (day) => num(day.focus_minutes),
      (v) => `${Math.round(v)}m`,
      'blue',
    );

    const rate = activeRate;
    const nowRate = rate(now);
    const wasRate = rate(before);
    if (nowRate - wasRate >= 4) {
      out.push({
        id: 'win-consistency',
        text: `You're working on more days`,
        figure: `${Math.round(wasRate)}% → ${Math.round(nowRate)}% of days worked`,
        tone: 'amber',
      });
    }
  }

  habits
    .filter((habit) => habit.strength === 'strong' && habit.streak >= 3)
    .slice(0, 2)
    .forEach((habit) => {
      out.push({
        id: `win-habit-${habit.name}`,
        text: `${habit.name}: ${habit.streak} ${habit.unit === 'day' ? 'days' : 'weeks'} in a row`,
        figure: `${habit.consistency}% consistent`,
        tone: 'green',
      });
    });

  return out;
}

// --------------------------------------------------------------------------
// Relationships
// --------------------------------------------------------------------------
export interface Relationship {
  id: string;
  /** "Focus time → XP earned", read as an association and drawn as one. */
  pair: string;
  r: number;
  n: number;
  strength: Strength;
  /** What it means, hedged. Never a mechanism. */
  reading: string;
  /** The scatter, already normalised to 0-1 on both axes. */
  points: Array<[number, number]>;
  tone: string;
}

/**
 * Pairs of variables that move together, with the coefficient printed.
 *
 * The scatter is drawn rather than a line of best fit, deliberately: a line
 * asserts a model and a cloud of dots asserts nothing more than the dots. If
 * the relationship is real the reader will see it, and if it is a smear they
 * will see that too, which is the honest outcome for most of these.
 */
export function relationships(days: GrowthDay[], tasks: Task[], week: WeekShape): Relationship[] {
  const out: Relationship[] = [];

  const normalise = (pairs: Array<[number, number]>): Array<[number, number]> => {
    const maxA = Math.max(...pairs.map(([a]) => a), 1);
    const maxB = Math.max(...pairs.map(([, b]) => b), 1);
    return pairs.map(([a, b]) => [a / maxA, b / maxB] as [number, number]);
  };

  const add = (
    id: string,
    pair: string,
    raw: Array<[number, number]>,
    positive: string,
    negative: string,
    tone: string,
  ) => {
    if (raw.length < 8) return;
    const { r, n } = correlate(raw);
    const strength = strengthOf(r, n);
    out.push({
      id,
      pair,
      r: Math.round(r * 100) / 100,
      n,
      strength,
      reading:
        strength === 'weak'
          ? `No clear link yet (${n} days of data).`
          : r >= 0
            ? positive
            : negative,
      points: normalise(raw),
      tone,
    });
  };

  /* Days that earned, because XP is an axis on every chart below and a day
     with none of it is a point at zero rather than a point. Narrower than
     `isActiveDay` on purpose; see utils/activeDay. */
  const active = days.filter((day) => num(day.xp_earned) > 0);

  add(
    'rel-focus-xp',
    'Focus time → XP earned',
    active
      .filter((day) => num(day.focus_minutes) > 0)
      .map((day) => [num(day.focus_minutes), num(day.xp_earned)] as [number, number]),
    'More focus time means more XP.',
    'More focus time does not mean more XP. Some focus time is not turning into finished tasks.',
    'green',
  );

  add(
    'rel-tasks-xp',
    'Tasks finished → XP earned',
    active.map((day) => [num(day.tasks_completed), num(day.xp_earned)] as [number, number]),
    'Your XP rises with the number of tasks you finish.',
    'A few large tasks make up most of your XP.',
    'violet',
  );

  add(
    'rel-session-quality',
    'Session length → XP per task',
    active
      .filter((day) => num(day.focus_minutes) > 0 && num(day.avg_task_xp) > 0)
      .map((day) => [num(day.focus_minutes), num(day.avg_task_xp)] as [number, number]),
    'Longer sessions go with bigger tasks.',
    'Longer sessions go with many small tasks.',
    'blue',
  );

  // Weekday index against how much that weekday carries. Seven points, which is
  // never enough for a coefficient to mean much, so it is stated as a spread.
  const weekPairs = week.stats
    .filter((stat) => stat.days > 0)
    .map((stat) => [stat.index, stat.avgXp] as [number, number]);
  if (weekPairs.length >= 5) {
    const values = weekPairs.map(([, xp]) => xp);
    const top = Math.max(...values);
    const bottom = Math.min(...values);
    out.push({
      id: 'rel-weekday',
      pair: 'Day of week → output',
      r: 0,
      // The days behind the seven averages, not the seven. Reporting 7 put
      // "Observations: 7" beside a Strong evidence chip, which reads as the
      // page contradicting its own rule about sample size — and understates
      // it badly, because each of those points is an average over dozens of
      // occurrences rather than a single reading.
      n: week.stats.reduce((sum, stat) => sum + stat.days, 0),
      strength: top > 0 && bottom / top <= 0.5 ? 'strong' : 'likely',
      reading:
        top > 0 && bottom / top <= 0.5
          ? `Your best weekday has ${(top / Math.max(bottom, 1)).toFixed(
              1,
            )}× the output of your worst. Plan around that.`
          : 'Your weekdays are fairly even.',
      points: normalise(weekPairs),
      tone: 'amber',
    });
  }

  // Planning against completion, as a per-week pair rather than per task: the
  // question is whether weeks with more scheduling are weeks with more done.
  const byWeek = new Map<string, { dated: number; done: number }>();
  tasks.forEach((task) => {
    const day = String(task.completed_at || task.created_at || '').slice(0, 10);
    if (!day) return;
    const at = new Date(`${day}T00:00:00`);
    at.setDate(at.getDate() - at.getDay());
    const key = at.toISOString().slice(0, 10);
    const entry = byWeek.get(key) ?? { dated: 0, done: 0 };
    if (task.due_date) entry.dated += 1;
    if (task.status === 'done') entry.done += 1;
    byWeek.set(key, entry);
  });
  add(
    'rel-planning',
    'Tasks scheduled → tasks finished',
    [...byWeek.values()].map((entry) => [entry.dated, entry.done] as [number, number]),
    'Weeks with more scheduled tasks are weeks you finish more.',
    'Scheduling more tasks does not mean you finish more.',
    'pink',
  );

  return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

// --------------------------------------------------------------------------
// You, right now
// --------------------------------------------------------------------------
export interface CurrentState {
  /** The phase, as a short label for the badge. */
  phase: string;
  tone: string;
  /** The paragraph. Assembled, never written, so it cannot drift. */
  sentence: string;
  /** The single weakest thing, named plainly. */
  weakness: string;
}

/**
 * A snapshot of where this account currently is.
 *
 * Assembled from the same shapes the panels above are drawn from, clause by
 * clause, with every clause dropped when the figure behind it is missing — a
 * summary that says "you are in a null phase" is worse than a shorter summary.
 */
export function currentState(
  days: GrowthDay[],
  rhythm: RhythmShape,
  week: WeekShape,
  balance: BalanceShape,
  window = 21,
): CurrentState {
  const now = days.slice(-window);
  const before = days.slice(-window * 2, -window);
  const rate = activeRate;

  const nowRate = rate(now);
  const wasRate = rate(before);
  const perDay = (rows: GrowthDay[]) => mean(rows.map((day) => num(day.xp_earned)));
  const change = perDay(before) > 0 ? ((perDay(now) - perDay(before)) / perDay(before)) * 100 : null;

  const phase =
    nowRate >= 75
      ? 'High consistency'
      : nowRate >= 45
        ? 'Building'
        : nowRate >= 20
          ? 'Intermittent'
          : 'Dormant';
  const tone =
    phase === 'High consistency' ? 'green' : phase === 'Building' ? 'blue' : phase === 'Intermittent' ? 'amber' : 'pink';

  const parts: string[] = [
    `${phase}: you worked ${Math.round(
      nowRate,
    )}% of the last ${window} days${
      before.length === now.length ? ` (${Math.round(wasRate)}% before)` : ''
    }`,
  ];
  if (change !== null && Math.abs(change) >= 5) {
    parts.push(`daily XP is ${change > 0 ? 'up' : 'down'} ${pct(change)}`);
  }
  if (rhythm.typicalSession > 0) {
    parts.push(`and a typical session is ${Math.round(rhythm.typicalSession)} minutes`);
  }

  const weaknesses: string[] = [];
  if (week.weekendGap !== null && week.weekendGap <= -35) {
    weaknesses.push(`weekends (${Math.abs(week.weekendGap)}% lighter than weekdays)`);
  }
  if (rhythm.gapCount >= 2) {
    weaknesses.push(`gaps (${rhythm.gapCount} breaks of 3+ days)`);
  }
  if (balance.fading.length > 0) {
    weaknesses.push(`${balance.fading[0]}, which you have stopped`);
  }
  if (rhythm.activeRate < 50) {
    weaknesses.push(`how often you work (${Math.round(rhythm.activeRate)}% of days)`);
  }

  return {
    phase,
    tone,
    sentence: `${parts.join(', ')}.`,
    weakness: weaknesses.length
      ? `Weakest area: ${weaknesses[0]}.`
      : 'No weak spots right now.',
  };
}

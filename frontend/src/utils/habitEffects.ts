/**
 * What a habit is worth — the consequence half of the Habits tab.
 *
 * A streak tracker says "you did this 12 times". That is a fact about the
 * reader's diary and it changes nothing: they already know. What changes a
 * decision is what the behaviour is *for*, and that is a comparison:
 *
 *     Deep Work          12 this week, 3 more than last
 *                        Best under 45-75 minutes of focus in the day
 *                        +14% on how the work goes
 *     Late-night work    41% of weeks
 *                        -11% on tasks finished a day
 *
 * ## This is a boundary change, and it is deliberate
 *
 * The Habits tab's rule was that it never says why — the moment it did, the
 * Insights tab had no reason to exist. That rule is now narrower rather than
 * gone: **Habits says what one behaviour of yours costs or buys. Insights says
 * what is true across your whole record and why.** A per-habit effect could
 * only ever live on the card it belongs to; putting it on Insights would mean
 * repeating every habit's name there to hang it off.
 *
 * ## Three readings, and all three are two groups and one measure
 *
 * Nothing here is a coefficient. Every figure is the same shape as
 * utils/patterns: split the reader's own tasks in two, compare one measure, and
 * refuse to speak unless both sides clear a floor.
 *
 *     week       this week's completions against last week's — the only
 *                figure here that is a count rather than a comparison
 *     condition  the habit's own tasks, split by a condition it might depend
 *                on, keeping the split with the widest gap
 *     effect     the habit's tasks against everything else the reader
 *                finished, on how the work went
 *
 * ## Why execution and not XP
 *
 * The effect is measured on `execution` — the reader's own verdict on how the
 * work went — because XP is a function of how much they did, and a habit that
 * happens more often would show a positive "effect" on XP by definition. That
 * is a tautology with a percentage on it. Where a habit has no rated tasks there
 * is no verdict to read, so the effect falls back to tasks finished per day on
 * days the habit ran against days it did not, which is a genuinely different
 * claim and is labelled as one.
 *
 * ## What it will not say
 *
 * Cause. "Deep work is +14%" does not mean deep work causes better work — the
 * reader may simply schedule the work they are confident about into long
 * sessions. Every sentence here states the association and stops, and every one
 * carries the counts it was drawn from.
 */
import type { GrowthDay, Task } from '@/types';
import type { Habit } from './habits';
import { stemOf } from './habits';
import type { Strength } from './insight';
import { mean, pctChange } from './recent';

/** Fewest tasks on each side of a split before it is read. */
const MIN_GROUP = 6;

/** Fewest days on each side of the day-level split. */
const MIN_DAYS = 5;

/** Below this difference, the two groups are the same group. */
const MIN_LIFT = 8;

/** The focus bands a day falls in, for the condition reading. */
const BANDS: ReadonlyArray<{ label: string; from: number; to: number }> = [
  { label: 'under 45 minutes of focus', from: 1, to: 45 },
  { label: '45-75 minutes of focus', from: 45, to: 75 },
  { label: 'over 75 minutes of focus', from: 75, to: Infinity },
];

const num = (value: unknown) => Number(value) || 0;
const isRated = (task: Task) => num(task.difficulty) > 0 && num(task.execution) > 0;

function hourOf(task: Task): number | null {
  if (!task.completed_at) return null;
  const at = new Date(task.completed_at);
  return Number.isNaN(at.getTime()) ? null : at.getHours();
}

const dayOf = (task: Task) => String(task.completed_at ?? '').slice(0, 10);

function strengthFor(smaller: number, lift: number): Strength {
  if (smaller >= 20 && Math.abs(lift) >= 15) return 'strong';
  if (smaller >= 12 && Math.abs(lift) >= 12) return 'likely';
  return 'weak';
}

/** This week's completions and last week's. */
export interface HabitWeek {
  now: number;
  before: number;
  /** now − before. Signed, in completions, not a percentage. */
  change: number;
}

/** The condition the habit goes best under. */
export interface HabitCondition {
  /** "45-75 minutes of focus", "before 5pm" — reads after "Best". */
  label: string;
  /** Signed percentage against the habit's other tasks. */
  lift: number;
  basis: string;
}

/** What the habit is associated with, and on which measure. */
export interface HabitEffect {
  /** Signed percentage. */
  lift: number;
  /** What moved: "how the work goes", "tasks finished a day". */
  measure: string;
  basis: string;
  strength: Strength;
}

export interface HabitFacts {
  week: HabitWeek | null;
  condition: HabitCondition | null;
  effect: HabitEffect | null;
}

/**
 * The keys a task files under — the same two rules `buildHabits` bucketed by.
 *
 * A task belongs to a subject habit and to a routine habit at once, which is
 * why this returns a list. Kept beside the reading that uses it rather than
 * exported from utils/habits, because it is a *re-derivation* and it should be
 * obvious where to look when the bucketing changes.
 */
function keysFor(task: Task): string[] {
  const keys: string[] = [];
  if (task.subject) keys.push(`subject:${task.subject}`);
  const stem = stemOf(task.title);
  if (stem.length >= 3) keys.push(`stem:${stem}`);
  return keys;
}

/** The widest of the splits worth reading, or null when none clears the floor. */
function conditionFor(mine: Task[], focusByDay: Map<string, number>): HabitCondition | null {
  const rated = mine.filter(isRated);
  if (rated.length < MIN_GROUP * 2) return null;

  const found: HabitCondition[] = [];

  const compare = (label: string, inside: Task[], outside: Task[], basis: string) => {
    if (inside.length < MIN_GROUP || outside.length < MIN_GROUP) return;
    const lift = pctChange(
      mean(inside.map((task) => num(task.execution))),
      mean(outside.map((task) => num(task.execution))),
    );
    if (lift === null || lift < MIN_LIFT) return;
    found.push({ label, lift, basis });
  };

  // ---- The day's focus, in bands ------------------------------------------
  // Bands rather than a median split: "45-75 minutes" is a length somebody can
  // plan a session around, and "above your median" is not.
  if (focusByDay.size > 0) {
    BANDS.forEach((band) => {
      const inside = rated.filter((task) => {
        const minutes = focusByDay.get(dayOf(task)) ?? 0;
        return minutes >= band.from && minutes < band.to;
      });
      const outside = rated.filter((task) => {
        const minutes = focusByDay.get(dayOf(task)) ?? 0;
        return minutes > 0 && !(minutes >= band.from && minutes < band.to);
      });
      compare(
        band.label,
        inside,
        outside,
        `${inside.length} of these tasks on days like that, ${outside.length} on other days.`,
      );
    });
  }

  // ---- Before the evening ------------------------------------------------
  const timed = rated.filter((task) => hourOf(task) !== null);
  compare(
    'before 5pm',
    timed.filter((task) => hourOf(task)! < 17),
    timed.filter((task) => hourOf(task)! >= 17),
    `${timed.filter((task) => hourOf(task)! < 17).length} finished before 5pm, ${
      timed.filter((task) => hourOf(task)! >= 17).length
    } after.`,
  );

  // ---- One a day, or several ---------------------------------------------
  const perDay = new Map<string, number>();
  mine.forEach((task) => {
    const day = dayOf(task);
    if (day) perDay.set(day, (perDay.get(day) ?? 0) + 1);
  });
  const alone = rated.filter((task) => (perDay.get(dayOf(task)) ?? 0) === 1);
  const stacked = rated.filter((task) => (perDay.get(dayOf(task)) ?? 0) > 1);
  compare(
    'on its own, once a day',
    alone,
    stacked,
    `${alone.length} on days with one, ${stacked.length} on days with several.`,
  );
  compare(
    'stacked, more than once a day',
    stacked,
    alone,
    `${stacked.length} on days with several, ${alone.length} on days with one.`,
  );

  return found.sort((a, b) => b.lift - a.lift)[0] ?? null;
}

/** What the habit is associated with, on ratings where there are any. */
function effectFor(
  mine: Task[],
  others: Task[],
  myDays: Set<string>,
  days: GrowthDay[],
): HabitEffect | null {
  const mineRated = mine.filter(isRated);
  const othersRated = others.filter(isRated);

  if (mineRated.length >= MIN_GROUP && othersRated.length >= MIN_GROUP) {
    const lift = pctChange(
      mean(mineRated.map((task) => num(task.execution))),
      mean(othersRated.map((task) => num(task.execution))),
    );
    if (lift !== null && Math.abs(lift) >= MIN_LIFT) {
      return {
        lift,
        measure: 'how the work goes',
        basis: `${mineRated.length} rated tasks here against ${othersRated.length} elsewhere.`,
        strength: strengthFor(Math.min(mineRated.length, othersRated.length), lift),
      };
    }
    return null;
  }

  /* No ratings to read, so the claim changes rather than being stretched: how
     much gets finished on the days this happens, against the days it does not.
     A different measure, and the sentence says which. */
  const on = days.filter((day) => myDays.has(day.date));
  const off = days.filter((day) => !myDays.has(day.date) && num(day.xp_earned) > 0);
  if (on.length < MIN_DAYS || off.length < MIN_DAYS) return null;
  const lift = pctChange(
    mean(on.map((day) => num(day.tasks_completed))),
    mean(off.map((day) => num(day.tasks_completed))),
  );
  if (lift === null || Math.abs(lift) < MIN_LIFT) return null;
  return {
    lift,
    measure: 'tasks finished a day',
    basis: `${on.length} days with it against ${off.length} working days without.`,
    strength: strengthFor(Math.min(on.length, off.length), lift),
  };
}

export interface HabitEffectsInput {
  habits: Habit[];
  /** Every task the account has. Finished ones are what get read. */
  tasks: Task[];
  /** The day series, for the focus bands and the day-level fallback. */
  days: GrowthDay[];
  /** Last day of the window — "this week" is the 7 days ending here. */
  toIso: string;
}

/**
 * Habit key → its week, its best condition and its effect.
 *
 * Keyed rather than merged onto the habit, so `buildHabits` stays a function of
 * the task list alone and this stays optional: a caller that does not draw the
 * consequence line does not pay for the comparison.
 */
export function habitEffects({
  habits,
  tasks,
  days,
  toIso,
}: HabitEffectsInput): Map<string, HabitFacts> {
  const out = new Map<string, HabitFacts>();
  if (habits.length === 0) return out;

  const finished = tasks.filter((task) => task.status === 'done' && dayOf(task));
  const focusByDay = new Map(days.map((day) => [day.date, num(day.focus_minutes)]));

  /* The two 7-day windows, as date strings. Counting on the strings keeps this
     free of timezone arithmetic: the record is filed by ISO day and so is the
     comparison. */
  const start = (back: number) => {
    const at = new Date(`${toIso}T00:00:00`);
    at.setDate(at.getDate() - back);
    return at.toISOString().slice(0, 10);
  };
  const weekFrom = toIso ? start(6) : '';
  const beforeFrom = toIso ? start(13) : '';
  const beforeTo = toIso ? start(7) : '';

  habits.forEach((habit) => {
    const mine = finished.filter((task) => keysFor(task).includes(habit.key));
    const others = finished.filter((task) => !keysFor(task).includes(habit.key));
    const myDays = new Set(mine.map(dayOf));

    const week: HabitWeek | null = toIso
      ? (() => {
          const now = mine.filter((task) => dayOf(task) >= weekFrom && dayOf(task) <= toIso).length;
          const before = mine.filter(
            (task) => dayOf(task) >= beforeFrom && dayOf(task) <= beforeTo,
          ).length;
          return { now, before, change: now - before };
        })()
      : null;

    out.set(habit.key, {
      week,
      condition: conditionFor(mine, focusByDay),
      effect: effectFor(mine, others, myDays, days),
    });
  });

  return out;
}

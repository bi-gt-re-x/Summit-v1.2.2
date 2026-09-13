/**
 * What a month amounted to — the arithmetic behind the Month view's grid, its
 * summary bar and its overview column.
 *
 * Every figure on that page comes from here, and every one of them is counted
 * from the same three sources the rest of the calendar reads: the database's
 * tasks, the browser's event store, and the server's focus record. Nothing is
 * invented and nothing is stored — the month is recomputed from those three
 * on every render, so a task completed elsewhere cannot leave a stale number
 * behind.
 *
 * Three definitions run through all of it, and they are the ones to argue with
 * if a number ever looks wrong:
 *
 * - **What a day is carrying** is everything *scheduled* on it: its events,
 *   plus its tasks whether or not they are finished. A future day with work on
 *   it reads as a day with work on it, which is the point of a month grid.
 * - **XP** comes in two flavours and both are used. The grid cell shows the XP
 *   *on offer* that day, so a Thursday still to come is not a blank square.
 *   Everything summarising the month — the overview tile, the summary bar, Top
 *   Performing Days — shows XP *earned*, because that is what actually
 *   happened.
 * - **A completed day** is one where everything scheduled on it got done. Days
 *   with nothing scheduled do not count either way: they are not wins and they
 *   are not failures. Only tasks are tested, because a stored event has no
 *   completion state anywhere in this app.
 *
 * The completion ratio stops at today. A month still being lived through would
 * otherwise be marked against its own future — every unstarted Friday counted
 * as a Friday missed — and the figure would climb only because the days ran
 * out. A month already past is scored in full.
 */
import { taskCalendarDay } from './calendarIntensity';
import { familyForSection } from './calendarColors';
import { familyForSubject } from './eventPalette';
import type { Family } from './eventPalette';
import { isoDate } from './dates';
import type { CalendarData } from './calendarStore';
import type { FocusHistory, Task } from '@/types';

/** One day of the month, with everything the grid and the panels need. */
/**
 * How good a day was, by what it was worth.
 *
 * The month grid used to shade a day by its priority-weighted load measured
 * against the busiest day *on screen* — which meant the same Tuesday changed
 * colour when you stepped to a month with a heavier day in it, and no colour
 * meant anything you could write down. These are fixed thresholds, so a green
 * day is a green day in January and in July, and the legend under the grid can
 * say what each one is.
 */
export type XpBandKey = 'exceptional' | 'great' | 'good' | 'low' | 'none';

/** The bands, richest first — the order the legend prints them in. */
export const XP_BANDS: { key: XpBandKey; label: string; note: string }[] = [
  { key: 'exceptional', label: 'Exceptional', note: '800+ XP' },
  { key: 'great', label: 'Great', note: '500–799 XP' },
  { key: 'good', label: 'Good', note: '200–499 XP' },
  { key: 'low', label: 'Low', note: 'under 200 XP' },
  { key: 'none', label: 'Nothing on it', note: '' },
];

/**
 * The family a day's work mostly went on, or null.
 *
 * Ties go to the family that reached the total first, which is the order the
 * day was counted in — tasks before events. Arbitrary, but stable: the same
 * day must not change colour between two renders of the same data.
 */
function heaviest(tally: Map<Family, number> | undefined): Family | null {
  if (!tally || tally.size === 0) return null;
  let best: Family | null = null;
  let most = -1;
  tally.forEach((weight, family) => {
    if (weight > most) {
      most = weight;
      best = family;
    }
  });
  return best;
}

export function xpBand(xp: number): XpBandKey {
  if (xp >= 800) return 'exceptional';
  if (xp >= 500) return 'great';
  if (xp >= 200) return 'good';
  if (xp > 0) return 'low';
  return 'none';
}

export interface MonthDay {
  /** The store's key, unpadded: "2026-8-6". */
  key: string;
  /** The real ISO date: "2026-08-06". */
  iso: string;
  /** Day of the month, 1…31. */
  day: number;
  /** Everything scheduled: events plus tasks, finished or not. */
  events: number;
  /** XP on offer that day — earned and still available. */
  xp: number;
  /** XP actually banked that day. */
  earned: number;
  /** Tasks scheduled on the day, and how many of them are done. */
  tasks: number;
  done: number;
  /** Everything scheduled got done, and there was something to do. */
  settled: boolean;
  /**
   * One band per thing on the day, in the order they were counted, capped.
   *
   * The cell draws these as segments along its foot, so a day reads as "four
   * things, two of them big" at a glance rather than as a number that has to
   * be converted into an impression. Capped because a cell is a seventh of a
   * grid and eleven segments is a texture rather than a count.
   */
  marks: XpBandKey[];
  /**
   * What the day was *about*, as one of the calendar's twelve colour families.
   *
   * The bands above say how much a day was worth, and they are one hue on
   * purpose — they are a scale, and a scale drawn in four unrelated colours is
   * not one. That left the grid with nothing to say about the other question a
   * month gets read for: not "how heavy was the ninth" but "what have I been
   * doing" — a rhythm that is obvious in the Week and Day views, where every
   * block is painted by its subject, and was invisible here.
   *
   * The day's busiest family wins, measured in XP rather than in count,
   * because what a day was about is what most of it went on. `null` for an
   * empty day, or one whose work carries no subject.
   */
  family: Family | null;
}

/** How many segments a cell's foot will draw. Past this it is a texture. */
export const MAX_MARKS = 6;

/** A month, as the Month view reads it. */
export interface MonthFigures {
  /** Every day of the month, in order. */
  days: MonthDay[];
  /** Tasks landing in the month, and how many are finished. */
  tasks: number;
  done: number;
  /** XP earned across the month. */
  xpEarned: number;
  /** Focused against planned, in seconds. */
  focused: number;
  planned: number;
  /** Days where everything scheduled got done, out of days that had anything. */
  settled: number;
  scheduled: number;
  /** The mean of each day's focus against its own goal, as a percentage. */
  avgGoal: number;
  /** The month's best day by XP earned, and the three best. */
  best: MonthDay | null;
  top: MonthDay[];
}

/** A month's key facts against the month before it. */
export interface MonthInsight {
  headline: string;
  hint: string;
}

/** The store's key for a day: unpadded, as the store has always written it. */
function keyOf(year: number, month: number, day: number): string {
  return `${year}-${month + 1}-${day}`;
}

/**
 * Every day of the month, counted.
 *
 * Tasks are placed by `taskCalendarDay`, the same rule that shades the grid,
 * fills the day panel and draws the blocks: a task shown on the calendar sits
 * on its deadline, and a dashboard to-do sits on no day at all. So the four can
 * never disagree about which day a task belongs to, or about whether it belongs
 * on the calendar in the first place.
 */
export function monthDays(
  year: number,
  month: number,
  tasks: Task[],
  data: CalendarData,
): MonthDay[] {
  const length = new Date(year, month + 1, 0).getDate();
  const byKey = new Map<string, MonthDay>();

  /* XP per family per day, while the day is being counted. Kept beside the
     entries rather than on them: it is scaffolding for one number the cell
     actually draws, and a Map of Maps on every MonthDay would be a field every
     consumer has to ignore. */
  const weights = new Map<string, Map<Family, number>>();
  const weigh = (key: string, family: Family, xp: number) => {
    let tally = weights.get(key);
    if (!tally) weights.set(key, (tally = new Map()));
    // `+ 1` so a day of zero-XP work still has a subject. Without it a day
    // whose only entries are unscored events would come back colourless, which
    // is the majority of a calendar somebody uses for scheduling rather than
    // for scoring.
    tally.set(family, (tally.get(family) ?? 0) + xp + 1);
  };

  const days = Array.from({ length }, (_, index) => {
    const day = index + 1;
    const key = keyOf(year, month, day);
    const entry: MonthDay = {
      key,
      iso: isoDate(new Date(year, month, day)),
      day,
      events: 0,
      xp: 0,
      earned: 0,
      tasks: 0,
      done: 0,
      settled: false,
      marks: [],
      family: null,
    };
    byKey.set(key, entry);
    return entry;
  });

  tasks.forEach((task) => {
    const key = taskCalendarDay(task);
    const entry = key ? byKey.get(key) : undefined;
    if (!entry) return;

    const xp = Number(task.xp_value) || 0;
    entry.events += 1;
    entry.tasks += 1;
    entry.xp += xp;
    if (entry.marks.length < MAX_MARKS) entry.marks.push(xpBand(xp));
    // Only a task that says what it is about. `familyForSubject` answers
    // 'gray' for an empty subject, and a grey chip on a third of the month is
    // noise pretending to be information.
    if (task.subject) weigh(key as string, familyForSubject(task.subject), xp);
    if (task.status === 'done') {
      entry.done += 1;
      entry.earned += xp;
    }
  });

  // Events the calendar itself holds. A task the day panel materialised into
  // the store is skipped: it has already been counted from the database above,
  // and counting it twice would inflate both the tally and the XP.
  Object.entries(data).forEach(([key, day]) => {
    const entry = byKey.get(key);
    if (!entry) return;
    day.timestamps.forEach((section) => {
      if (section.isDashboardTask) return;
      entry.events += 1;
      const xp = Number(section.xp) || 0;
      entry.xp += xp;
      if (entry.marks.length < MAX_MARKS) entry.marks.push(xpBand(xp));
      // An event always resolves to a family — it was given one when it was
      // made, and `familyForSection` reads a pre-palette one back off its
      // colour. This is the same call the Week and Day views paint from, so a
      // Tuesday is the same colour in all three views.
      weigh(key, familyForSection(section), xp);
    });
  });

  days.forEach((entry) => {
    entry.settled = entry.tasks > 0 && entry.done === entry.tasks;
    entry.family = heaviest(weights.get(entry.key));
  });

  return days;
}

/**
 * The month, totalled.
 *
 * `now` is passed rather than read so the figures are a pure function of their
 * inputs — and so the completion ratio's cut-off can be tested.
 *
 * `throughDay` stops the totals at a day of the month, 1-based and inclusive.
 * It exists for the comparison the Month view draws: eight days into August is
 * eight days of work, and holding it up against the whole of July says only
 * that July had more month in it. The previous month is counted to the same
 * depth as the current one has been lived, so the delta is about the reader
 * rather than about the calendar. Left out, the whole month counts, which is
 * what a month already finished wants.
 *
 * `days` is always the full month regardless — the grid draws every square,
 * and only the arithmetic is windowed.
 */
export function monthFigures(
  year: number,
  month: number,
  tasks: Task[],
  data: CalendarData,
  history: FocusHistory,
  now: Date = new Date(),
  throughDay?: number,
): MonthFigures {
  const days = monthDays(year, month, tasks, data);
  const today = isoDate(now);
  const counted =
    throughDay === undefined ? days : days.filter((day) => day.day <= throughDay);

  let taskCount = 0;
  let doneCount = 0;
  let xpEarned = 0;
  let settled = 0;
  let scheduled = 0;

  counted.forEach((day) => {
    taskCount += day.tasks;
    doneCount += day.done;
    xpEarned += day.earned;
    // A day still to come is not yet a day that went wrong: it is not on
    // either side of the ratio until it has been lived.
    if (day.tasks > 0 && day.iso <= today) {
      scheduled += 1;
      if (day.settled) settled += 1;
    }
  });

  let focused = 0;
  let planned = 0;
  let goalDays = 0;
  let goalSum = 0;

  counted.forEach((day) => {
    const record = history[day.iso];
    if (!record) return;
    const seconds = Number(record.seconds) || 0;
    const goal = (Number(record.goal_hours) || 0) * 3600;
    focused += seconds;
    planned += goal;
    // Each day is scored against its own goal and the scores averaged, rather
    // than one total divided by another: a single 12-hour day would otherwise
    // carry a month of missed ones.
    if (goal > 0 && day.iso <= today) {
      goalDays += 1;
      goalSum += Math.min(100, (seconds / goal) * 100);
    }
  });

  const ranked = counted
    .filter((day) => day.earned > 0)
    .sort((a, b) => b.earned - a.earned || a.day - b.day);

  return {
    days,
    tasks: taskCount,
    done: doneCount,
    xpEarned,
    focused,
    planned,
    settled,
    scheduled,
    avgGoal: goalDays > 0 ? Math.round(goalSum / goalDays) : 0,
    best: ranked[0] ?? null,
    top: ranked.slice(0, 3),
  };
}

/**
 * A percentage change, or null when there is nothing to change from.
 *
 * A month that follows a month with no XP at all has not improved by an
 * infinite amount; it has simply nothing to be compared against, and the
 * summary bar says nothing rather than something absurd.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * What to say about the month, given the stretch of the month before it that
 * the month on screen has actually lived through.
 *
 * One sentence of fact and one of what to do with it. Which pair is chosen
 * depends only on the figures, so the card cannot congratulate a month that
 * went backwards — the failure mode of every "insights" panel that ships a
 * fixed string.
 *
 * `against` names what `previous` covers, and the sentences use it rather than
 * saying "last month" flat. Eight days into August, `previous` is the first
 * eight days of July and the card has to say so — "two more days than last
 * month" would be a claim about a whole month that nobody made.
 */
export function monthInsight(
  current: MonthFigures,
  previous: MonthFigures,
  future: boolean,
  against = 'last month',
): MonthInsight {
  if (future) {
    return {
      headline: 'Nothing has happened here yet.',
      hint: 'Plan the days you already know about and the rest will follow.',
    };
  }

  if (current.scheduled === 0) {
    return {
      headline: 'No tasks landed on this month.',
      hint: 'Schedule something and this panel will have an answer.',
    };
  }

  const dayGap = current.settled - previous.settled;
  if (dayGap > 0) {
    return {
      headline: `Great consistency! You completed ${dayGap} more ${
        dayGap === 1 ? 'day' : 'days'
      } than ${against}.`,
      hint: 'Try to maintain your momentum into next month.',
    };
  }

  const xpGap = percentChange(current.xpEarned, previous.xpEarned);
  if (xpGap !== null && xpGap > 0) {
    return {
      headline: `You earned ${xpGap}% more XP than ${against}.`,
      hint: 'Fewer days, heavier ones — worth keeping an eye on.',
    };
  }

  if (dayGap < 0) {
    return {
      headline: `You finished ${Math.abs(dayGap)} fewer ${
        Math.abs(dayGap) === 1 ? 'day' : 'days'
      } than ${against}.`,
      hint: 'Clearing one day at a time is what pulls the number back up.',
    };
  }

  const rate =
    current.scheduled > 0 ? Math.round((current.settled / current.scheduled) * 100) : 0;
  return {
    headline: `You cleared every task on ${rate}% of your scheduled days.`,
    hint: 'Steady is its own kind of progress — hold the line.',
  };
}

/**
 * How much this account has actually told us, and what that earns.
 *
 * ## The bug this exists to fix
 *
 * Every gate on the analytics page counted `growth_data.length`. That array is
 * built by backend/tracking/growth.py, which walks *every calendar day* from
 * the account's creation to today and pads the empty ones with zeros — so its
 * length is the account's age and nothing else. An account opened five weeks
 * ago and used twice passed a gate that says it needs twenty-one days of
 * record, and got a page of confident analysis drawn over two days of data.
 *
 * So the number every gate reads is `activeDays`: days with something recorded
 * on them. Calendar age is still computed, as `spanDays`, because "you have
 * been here five weeks" is worth saying — but it is context, never a gate.
 *
 * A day is active when **any one** of three things happened on it: a task was
 * finished, a focus session was logged, or any XP was earned. One of them, of
 * any size. That definition is utils/activeDay's, shared with every other
 * count of "days worked" in the app so the gates and the consistency figures
 * beside them cannot describe the same Tuesday differently.
 *
 * ## Stages, and why they are floors rather than ranges
 *
 * Five, and a stage is simply the highest floor an account has reached. That
 * shape matters: a reader who works nine days in a fortnight and then stops
 * for a month does not fall back to `early`, because nothing they learned
 * about themselves became untrue. Data does not expire, so stages do not
 * either — the only direction is up.
 *
 * `full` is the existing analytics page, unchanged and unqualified. Everything
 * below it is the same page with the parts that cannot be honest yet replaced
 * by the reason they cannot. Nothing here computes an analysis; it decides
 * which analyses have enough behind them to be worth drawing.
 *
 * ## The whole progression, in one place
 *
 *   0-2 active days    `Collecting`, and the counts that are already true:
 *                      tasks, focus, XP, streak, completion rate, where the
 *                      work went. No trend, no comparison, no grade.
 *   3-6                the two Early tallies — when you worked, what you
 *                      finish — each wearing the day count it was read from.
 *   7-13               the real tab. Delta tiles, the trajectory line, the
 *                      consistency and streak panels, the subject split with
 *                      its per-row change.
 *   14-29              the readings that grade a person: the score, its
 *                      letter, the percentile, quality. Plus a line saying how
 *                      much record they rest on, and a strip naming the tabs
 *                      still filling.
 *   30+                exactly the above with the staging notice off. There is
 *                      no separate mature component to transition into, which
 *                      is the point — see `stageShows`.
 *
 * The gates the tabs already had land inside that ladder on their own, once
 * they count active days: Recommendations at 14, Habits at 21, Insights at 28.
 * None of those numbers were chosen for this feature; they were in the
 * codebase and were being read against the wrong denominator.
 */
import { countActiveDays, isActiveDay } from './activeDay';
import type { GrowthDay } from '@/types';

/* Re-exported because this module is where the concept was first written down
   and half the app still reaches for it here. The definition itself moved to
   utils/activeDay when it turned out four other modules were each counting
   "days worked" their own way — see the header there. */
export { isActiveDay };

/**
 * The five stages, and the active-day count each one starts at.
 *
 * The numbers are the brief — day 3, 7, 14, 30 — read as days of real work
 * rather than days on the calendar, which is the whole point. They are
 * deliberately the same figures a reader would have been told, because the
 * promise "a week of use" is a promise about their effort, not about the
 * Earth's rotation.
 *
 * So `full` at 30 means thirty days that had work on them, however long those
 * thirty took: thirty days on the trot, or thirty across four months. A day
 * counts on one finished task, one logged focus session, or any XP at all —
 * see utils/activeDay, which is the only place that decides.
 */
export const STAGE_FLOOR = {
  new: 0,
  early: 3,
  weekly: 7,
  developing: 14,
  full: 30,
} as const;

export type Stage = keyof typeof STAGE_FLOOR;

/** Weakest first. The order is load-bearing: `stageFor` walks it downward. */
export const STAGES: Stage[] = ['new', 'early', 'weekly', 'developing', 'full'];

/** What each stage is called where a reader can see it. */
export const STAGE_LABEL: Record<Stage, string> = {
  new: 'Getting started',
  early: 'Early insight',
  weekly: 'Weekly trends',
  developing: 'Developing profile',
  full: 'Full analytics',
};

/**
 * What each stage *opens*, as opposed to what it is called.
 *
 * `STAGE_LABEL` names the rung somebody is standing on; this names what
 * standing on it gets them. Both are needed and neither is a rewording of the
 * other: "Developing profile" is where you are, "Performance" is what being
 * there buys you. A reader on day two does not care what their stage is
 * called — they care what arrives next, and that is a different word.
 *
 * Kept here beside the floors rather than in the component that draws them,
 * because the ladder and the countdown sentences have to name the same thing
 * the same way. Two vocabularies for five stages is how a page ends up
 * promising "weekly trends" in one place and "your first patterns" in another
 * for the same threshold.
 */
export const STAGE_BRINGS: Record<Stage, string> = {
  new: 'Activity',
  early: 'Patterns',
  weekly: 'Trends',
  developing: 'Performance',
  full: 'Deep insights',
};

/**
 * What a stage is allowed to draw.
 *
 * The five decisions the page makes about a stage, in one place, because they
 * were made in two and disagreed in shape: the Overview tab asked "is this
 * developing or full" and the page asked "is this new, early or weekly", which
 * are the same rule written from opposite ends. Two places to change when a
 * threshold moves is one place too many, and the failure mode is silent — a
 * grade appearing on the page opening while the panel it belongs to is still
 * held back on the tab.
 *
 * `full` is every flag on and `note` off, which is the whole of step five: the
 * mature analytics page with nothing added to it and nothing taken away. There
 * is no separate full-analytics component and nothing to transition into.
 *
 * ## Not everything staged is decided here
 *
 * The two Early tallies follow `waitFor('habits')` rather than a stage, so
 * they hand over to the tab that answers the same question better rather than
 * disappearing on a day number. That is a rule about two tabs agreeing, not a
 * rule about maturity, and putting it here would make this table lie.
 */
export interface StageShows {
  /** The counts that are true immediately. Every stage. */
  counts: boolean;
  /** Panels about the record: trends, comparisons, where the work went. */
  trends: boolean;
  /** Panels that grade the person: the score, its letter, the percentile. */
  judgement: boolean;
  /** The "still learning" line and the strip under it. */
  note: boolean;
}

export function stageShows(stage: Stage): StageShows {
  const at = STAGES.indexOf(stage);
  return {
    counts: true,
    trends: at >= STAGES.indexOf('weekly'),
    judgement: at >= STAGES.indexOf('developing'),
    note: stage !== 'full',
  };
}

export interface Maturity {
  /** Days with something recorded on them. The figure every gate reads. */
  activeDays: number;
  /**
   * Calendar days from the first recorded day to the last row of the series.
   *
   * Context only. An account with thirty of these and four active days knows
   * less than one with eight of each, and the gates have to agree with that.
   */
  spanDays: number;
  stage: Stage;
  /** The next stage up, or null once there is nothing above. */
  next: Stage | null;
  /** Active days still needed to reach it. Null at `full`. */
  toNext: number | null;
  /** How far through the current stage toward the next, 0-1. 1 at `full`. */
  progress: number;
  /** The most recent day with anything on it, ISO. Null on an empty record. */
  lastActive: string | null;
}

/** The highest floor `activeDays` has reached. */
export function stageFor(activeDays: number): Stage {
  for (let index = STAGES.length - 1; index >= 0; index -= 1) {
    const stage = STAGES[index]!;
    if (activeDays >= STAGE_FLOOR[stage]) return stage;
  }
  return 'new';
}

/** Whole days between two ISO dates, or 0 when either will not parse. */
function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00`);
  const end = Date.parse(`${to.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export function dataMaturity(days: GrowthDay[]): Maturity {
  const active = days.filter(isActiveDay);
  const activeDays = countActiveDays(days);
  const stage = stageFor(activeDays);

  const at = STAGES.indexOf(stage);
  const next = at < STAGES.length - 1 ? STAGES[at + 1]! : null;
  const toNext = next ? Math.max(0, STAGE_FLOOR[next] - activeDays) : null;

  /* Through the current stage, not through the whole ladder. A bar that
     measures the distance to `full` sits almost empty for a fortnight and
     tells a reader on day six that they have barely begun, which is both
     discouraging and false — they are one day from the next thing opening. */
  const floor = STAGE_FLOOR[stage];
  const ceiling = next ? STAGE_FLOOR[next] : floor;
  const progress = next && ceiling > floor ? (activeDays - floor) / (ceiling - floor) : 1;

  const first = active[0]?.date ?? null;
  const lastRow = days[days.length - 1]?.date ?? null;

  return {
    activeDays,
    spanDays: first && lastRow ? daysBetween(first, lastRow) + 1 : 0,
    stage,
    next,
    toNext,
    progress: Math.max(0, Math.min(1, progress)),
    lastActive: active[active.length - 1]?.date ?? null,
  };
}

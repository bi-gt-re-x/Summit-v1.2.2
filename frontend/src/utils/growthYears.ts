/**
 * The account, a year at a time — the arithmetic behind the Growth tab.
 *
 * The question is "how have I actually improved", and the honest answer is not
 * a total. Totals grow because time passes: an account that did the same amount
 * of the same work every week for five years has a rising XP line and has
 * improved at nothing. So the figures that carry the claim here are *rates* and
 * *ratings*, and the totals are context beside them.
 *
 * ## Two sources, on purpose, and never mixed into one ratio
 *
 * **Volume comes from the day series.** `tasks_completed` and `xp_earned` there
 * are built from the XP ledger (backend/tracking/growth.py reads
 * `xp_tracking.daily_totals`), which is append-only: it records what was
 * earned, and a task deleted afterwards does not un-earn it. The tasks table is
 * current state and loses those rows. On the account this was built against the
 * two disagree by 16 tasks in 2026 for exactly that reason, and the ledger is
 * the one that is right about what happened.
 *
 * **Ratings come from the tasks themselves.** The series carries per-day
 * `avg_difficulty` and `avg_execution` too, and on the account this was built
 * against the two agree to within a hundredth — so this is a preference for
 * the exact figure rather than a fix for a wrong one. The series stores each
 * day's mean rounded to one decimal, so a year read off it is a mean of
 * rounded means, weighted by `rated_tasks`; reading the tasks is the same
 * number without the two extra steps that can silently go wrong.
 *
 * A rating is only ever read off a task that still exists, so the deletion
 * problem that makes the ledger authoritative for volume does not arise here.
 *
 * ## Difficulty is averaged over the tasks that carry both rows
 *
 * The trap that is easy to walk into and hard to see afterwards. On this
 * account 2022 has 279 tasks with a difficulty on them and 242 with both a
 * difficulty and an execution, and the mean difficulty over those two
 * populations is 3.45 and 3.51. Both are true; only one of them can be set
 * beside an execution figure and described as the same work. `qualityOf`
 * returns null unless both rows are there, which is what keeps the pair
 * honest — the whole claim this page makes is a comparison between the two,
 * and a comparison across different populations is not one.
 *
 * The ledger and the ratings therefore have different denominators — the
 * ledger's task count and the number of rated rows on the books are not the
 * same population — and nothing here divides one by the other. `rated` is
 * reported as a count, never as a share of `tasks`.
 *
 * ## Partial years are marked, not hidden
 *
 * The first year starts when the account did and the last one is still
 * running, so both are short. Dropping them would throw away the beginning and
 * the present; drawing their totals beside five full years would report the
 * account's first months and its current ones as collapses. So every year
 * carries `partial`, and every comparison this module makes is per active day.
 */
import { qualityOf } from './ratings';
import type { GrowthDay, Task } from '@/types';

/** One calendar year of the account. */
export interface GrowthYear {
  year: number;
  label: string;
  /**
   * Whether the account was present for less than the whole year — its first
   * year, and the one still running.
   */
  partial: boolean;
  /** Days of this year that are on the record at all. The partial's measure. */
  coveredDays: number;
  /** Days of those with a finished task or logged focus on them. */
  activeDays: number;

  // ---- From the ledger --------------------------------------------------
  tasks: number;
  xp: number;
  focusHours: number;

  // ---- Rates, which is what a partial year can honestly be compared on ---
  tasksPerActiveDay: number;
  xpPerActiveDay: number;
  /** Share of the year's covered days that had work on them, 0-100. */
  activeRate: number;

  // ---- From the tasks ---------------------------------------------------
  /** Tasks finished this year carrying both ratings. A count, never a share. */
  rated: number;
  /** Mean of 1-5, or null when the year has nothing rated. */
  difficulty: number | null;
  execution: number | null;
  /** Mean difficulty × execution out of 25, or null. */
  quality: number | null;
}

const mean = (values: number[]): number | null =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** The year an ISO date falls in, or null when it is not one. */
function yearOf(iso: string | undefined | null): number | null {
  const text = String(iso || '').slice(0, 4);
  if (!/^\d{4}$/.test(text)) return null;
  return Number(text);
}

/**
 * The account's years, oldest first.
 *
 * `days` is the whole series — `series(0)`, every day since the account was
 * created, which is what the analytics page already fetches. `tasks` is the
 * whole task list, which the account endpoint returns uncapped.
 *
 * A year appears when the series covers any of it, whether or not anything
 * happened in it: a year off is a fact about the account and a gap in the
 * middle of the table says it better than a missing row would.
 */
export function growthYears(days: GrowthDay[], tasks: Task[]): GrowthYear[] {
  if (days.length === 0) return [];

  interface Bucket {
    covered: number;
    active: number;
    tasks: number;
    xp: number;
    minutes: number;
  }
  const ledger = new Map<number, Bucket>();

  days.forEach((day) => {
    const year = yearOf(day.date);
    if (year === null) return;
    const bucket = ledger.get(year)
      ?? { covered: 0, active: 0, tasks: 0, xp: 0, minutes: 0 };
    const finished = Number(day.tasks_completed) || 0;
    const minutes = Number(day.focus_minutes) || 0;

    bucket.covered += 1;
    // Focus counts as an active day even with nothing ticked off. An hour sat
    // is work, and a page about improvement that only counts completions would
    // read a week of reading as a week off.
    if (finished > 0 || minutes > 0) bucket.active += 1;
    bucket.tasks += finished;
    bucket.xp += Number(day.xp_earned) || 0;
    bucket.minutes += minutes;
    ledger.set(year, bucket);
  });

  /* The ratings, from the tasks and keyed on when the work was finished —
     the same rule `_ratings_by_day` uses on the server, so a task rated the
     morning after belongs to the day it was done. */
  const ratings = new Map<number, { difficulty: number[]; execution: number[]; quality: number[] }>();
  tasks.forEach((task) => {
    if (task.status !== 'done') return;
    const year = yearOf(task.completed_at);
    if (year === null) return;
    const quality = qualityOf(task);
    if (quality === null) return;
    const bucket = ratings.get(year) ?? { difficulty: [], execution: [], quality: [] };
    bucket.difficulty.push(Math.round(Number(task.difficulty)));
    bucket.execution.push(Math.round(Number(task.execution)));
    bucket.quality.push(quality);
    ratings.set(year, bucket);
  });

  const first = yearOf(days[0]?.date);
  const last = yearOf(days[days.length - 1]?.date);

  return [...ledger.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, bucket]) => {
      const rated = ratings.get(year);
      const difficulty = rated ? mean(rated.difficulty) : null;
      const execution = rated ? mean(rated.execution) : null;
      const quality = rated ? mean(rated.quality) : null;

      return {
        year,
        label: String(year),
        /* The first and last years of a series are the ones the account was
           not present for the whole of. A leap year makes 365 wrong as a test
           and `covered` is what the series actually holds, so the ends are
           identified by position rather than by counting days. */
        partial: year === first || year === last,
        coveredDays: bucket.covered,
        activeDays: bucket.active,
        tasks: bucket.tasks,
        xp: bucket.xp,
        focusHours: round1(bucket.minutes / 60),
        tasksPerActiveDay: bucket.active ? round2(bucket.tasks / bucket.active) : 0,
        xpPerActiveDay: bucket.active ? Math.round(bucket.xp / bucket.active) : 0,
        activeRate: bucket.covered ? Math.round((bucket.active / bucket.covered) * 100) : 0,
        rated: rated ? rated.quality.length : 0,
        difficulty: difficulty === null ? null : round2(difficulty),
        execution: execution === null ? null : round2(execution),
        quality: quality === null ? null : round1(quality),
      };
    });
}

// --------------------------------------------------------------------------
// The arc — what the years add up to
// --------------------------------------------------------------------------
/**
 * How much of a move on the 1-5 rating scale counts as a move.
 *
 * Both rows are integers a person picks after finishing something, so a year's
 * mean drifting by a tenth is the population changing slightly, not the reader
 * changing. Four tenths is a fifth of the usable range and is not something
 * that happens by accident across a whole year of ratings.
 */
export const MOVE = 0.4;

/**
 * Ratings a year needs before it can anchor a claim about improvement.
 *
 * A year with four rated tasks has a mean, and it means nothing. Twenty is
 * where a yearly average stops being a handful of afternoons — low enough that
 * a light year still counts, high enough that one good week cannot carry it.
 */
export const MIN_RATED = 20;

export type ArcKind = 'better' | 'harder' | 'both' | 'flat' | 'slipped';

export interface GrowthArc {
  /** The earliest and latest years with enough ratings to compare. */
  from: GrowthYear | null;
  to: GrowthYear | null;
  /** Latest minus earliest, on the 1-5 scale. Null without both ends. */
  executionGain: number | null;
  difficultyShift: number | null;
  kind: ArcKind | null;
  /**
   * The reading, in one sentence, or null when the record cannot support one.
   *
   * Assembled rather than written, so it cannot drift from the two figures
   * beside it — the same rule `currentState` follows in utils/insight.
   */
  sentence: string | null;
  /**
   * The same reading in four or five words, for setting large.
   *
   * The Growth tab prints this at the top in the biggest type on the page and
   * the sentence underneath it, so the two are one claim at two lengths and
   * are assigned in the same branch for the same reason `sentence` is
   * assembled rather than written: a headline kept anywhere else drifts.
   *
   * It exists because `kind` cannot be printed. Five kinds cover six branches
   * — `harder` is both "you took on more" and "some of this is easier work",
   * which are opposite news — so a caller mapping the kind to a phrase would
   * have to re-derive the branch off `difficultyShift` to tell them apart, and
   * that is the duplicated arithmetic this field removes.
   */
  headline: string | null;
}

const noArc: GrowthArc = {
  from: null, to: null, executionGain: null, difficultyShift: null, kind: null,
  sentence: null, headline: null,
};

/**
 * What the years say, if they say anything.
 *
 * The claim this exists to make is the one a page of totals cannot: that the
 * work got *better* rather than merely *more*. Execution is the reader's own
 * account of how well a task went and difficulty is their account of how hard
 * it was, so the two together separate the two ways a rating can rise — you
 * improved, or you started picking easier things. A page that showed execution
 * climbing without saying what happened to difficulty would be flattering the
 * reader with a number they could have got by lowering their standards.
 *
 * Every branch names both figures. Which one leads is the only difference.
 */
export function growthArc(years: GrowthYear[]): GrowthArc {
  const anchors = years.filter(
    (year) => year.rated >= MIN_RATED && year.execution !== null && year.difficulty !== null,
  );
  if (anchors.length < 2) return noArc;

  const from = anchors[0]!;
  const to = anchors[anchors.length - 1]!;
  const executionGain = round2(to.execution! - from.execution!);
  const difficultyShift = round2(to.difficulty! - from.difficulty!);

  const rose = executionGain >= MOVE;
  const fell = executionGain <= -MOVE;
  const harder = difficultyShift >= MOVE;
  const easier = difficultyShift <= -MOVE;

  const span = `${from.label} to ${to.label}`;
  const exec = `${from.execution!.toFixed(1)} to ${to.execution!.toFixed(1)}`;
  const diff = `${from.difficulty!.toFixed(1)} to ${to.difficulty!.toFixed(1)}`;

  let kind: ArcKind;
  let sentence: string;
  let headline: string;

  if (rose && !harder && !easier) {
    kind = 'better';
    headline = 'You got better at the work';
    sentence = `From ${span} your execution went ${exec} out of 5, with difficulty steady at ` +
    `${to.difficulty!.toFixed(1)}.`;
  } else if (rose && harder) {
    kind = 'both';
    headline = 'Harder work, executed better';
    sentence = `From ${span} your execution went ${exec} out of 5 and the difficulty you took on `
      + `went ${diff}. Harder work, executed better.`;
  } else if (rose && easier) {
    // Said plainly. This is the one case where a rising execution score is not
    // evidence of improvement, and the page does not get to omit it.
    kind = 'harder';
    headline = 'Some of the rise is easier work';
    sentence = `From ${span} your execution went ${exec} out of 5, but the difficulty of what you `
      + `took on went ${diff}. Some of that rise is easier work.`;
  } else if (harder && !fell) {
    kind = 'harder';
    headline = 'Harder work, held steady';
    sentence = `From ${span} the difficulty you took on went ${diff} and your execution held at `
      + `${to.execution!.toFixed(1)} out of 5. Harder work, held steady.`;
  } else if (fell) {
    kind = 'slipped';
    headline = 'Execution slipped';
    sentence = `From ${span} your execution went ${exec} out of 5, against difficulty going `
      + `${diff}.`;
  } else {
    kind = 'flat';
    headline = 'Steady on both';
    sentence = `From ${span} your execution held around ${to.execution!.toFixed(1)} out of 5 and `
      + `the difficulty you took on around ${to.difficulty!.toFixed(1)}. Steady on both.`;
  }

  return { from, to, executionGain, difficultyShift, kind, sentence, headline };
}

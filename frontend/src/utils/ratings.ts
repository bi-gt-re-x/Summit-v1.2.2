/**
 * What the reader said about the work, once they had done it.
 *
 * Every other number in this app is measured off the record: XP is banked when
 * a task is completed, focus minutes are counted by a timer, a deadline is met
 * or it is not. Two things are not in the record and cannot be — how hard the
 * task actually was, and how well it actually went — and the prompt after a
 * completed task is the only place either one enters the system. See
 * components/Tasks/RatePrompt.
 *
 * ## Quality is the product, not the average
 *
 * `difficulty × execution`, 1 to 25. A trivial task done perfectly and a brutal
 * one botched both average to three and are not the same week; multiplied, they
 * are 5 and 5 respectively only by coincidence of the numbers — a 1×5 and a 5×1
 * — and everything either side of them separates. The scale is deliberately
 * top-heavy: 25 is a brutal task done excellently and there is no other way to
 * reach it, which is the behaviour the metric is trying to reward.
 *
 * ## Everything here is optional and none of it may pretend otherwise
 *
 * The prompt can be dismissed, and a large share of them are. That makes an
 * unrated task **missing data, not a bad score**, and the distinction runs
 * through every function in this file:
 *
 * - Unrated tasks are never counted as zero. They are not in the denominator.
 * - Coverage is reported beside every average, because "18.2 out of 25" from
 *   four ratings and from four hundred are different claims.
 * - A window with nothing rated returns `null`, not 0 — so a panel has to
 *   decide what to say about silence rather than drawing it as a bad review.
 *
 * The temptation this file exists to resist is treating rating frequency as a
 * proxy for quality. They are uncorrelated at best: the weeks somebody is too
 * busy to answer a dialog are often their best ones.
 */
import type { Task } from '@/types';

/** The best a single task can score: 5 for difficulty times 5 for execution. */
export const QUALITY_MAX = 25;

/** The five stars, in words. Shared with the prompt that collects them. */
export const DIFFICULTY_WORDS = ['Trivial', 'Easy', 'Fair', 'Hard', 'Brutal'];
export const EXECUTION_WORDS = ['Poor', 'Patchy', 'Solid', 'Strong', 'Excellent'];

// --------------------------------------------------------------------------
// The third question
// --------------------------------------------------------------------------
/**
 * Why a task went the way it did — asked only at rating_depth 'reasons'.
 *
 * Twelve words, six a side, and the fixed vocabulary is the entire reason this
 * is worth asking. A text box would collect twelve spellings of "I got
 * distracted" and produce twelve findings of one task each, which is no
 * finding; a closed list of six can be counted, ranked, and compared against
 * the month before it.
 *
 * Which six are offered follows the execution star rather than being chosen:
 * a task rated 1 or 2 is asked what made it hard, one rated 3 or better is
 * asked what made it go well. The same list on both sides would ask somebody
 * who has just done something well what went wrong with it.
 *
 * The keys are what the database stores and must match ALL_REASONS in
 * backend/api/tasks.py. The words are only ever read here.
 */
export interface Reason {
  key: string;
  label: string;
  /** What it looks like in a sentence: "…because it was bigger than expected". */
  phrase: string;
}

export const STRUGGLE_REASONS: Reason[] = [
  { key: 'distracted', label: 'Could not focus', phrase: 'could not focus' },
  { key: 'unclear', label: 'Did not know where to start', phrase: 'was unclear where to start' },
  { key: 'underestimated', label: 'Bigger than it looked', phrase: 'was bigger than it looked' },
  { key: 'no-time', label: 'Ran out of time', phrase: 'ran out of time' },
  { key: 'low-energy', label: 'Low energy', phrase: 'was done on low energy' },
  { key: 'interrupted', label: 'Kept getting interrupted', phrase: 'kept getting interrupted' },
];

export const WENT_WELL_REASONS: Reason[] = [
  { key: 'prepared', label: 'Knew exactly what to do', phrase: 'was clear from the start' },
  { key: 'deep-focus', label: 'Had a clear run at it', phrase: 'had a clear run at it' },
  { key: 'momentum', label: 'Carried momentum in', phrase: 'carried momentum in' },
  { key: 'broken-down', label: 'Broken into small steps', phrase: 'was broken into small steps' },
  { key: 'fresh', label: 'Was fresh', phrase: 'was done fresh' },
  { key: 'familiar', label: 'Had done one like it', phrase: 'was familiar work' },
];

export type ReasonSide = 'struggle' | 'went-well';

/** Which six a task is offered, from the execution star it was given. */
export function reasonsFor(execution: number): Reason[] {
  return execution >= 3 ? WENT_WELL_REASONS : STRUGGLE_REASONS;
}

const BY_KEY = new Map<string, { reason: Reason; side: ReasonSide }>();
STRUGGLE_REASONS.forEach((reason) => BY_KEY.set(reason.key, { reason, side: 'struggle' }));
WENT_WELL_REASONS.forEach((reason) => BY_KEY.set(reason.key, { reason, side: 'went-well' }));

/** One stored reason, or null for a word this build does not know. */
export function reasonOf(key: string | undefined | null) {
  return (key && BY_KEY.get(key)) || null;
}

/**
 * A task's quality score, or null when it was not rated on both rows.
 *
 * Both halves or neither, matching `rating_of` on the backend. The prompt lets
 * somebody answer one row and close the dialog, and that is a real answer to
 * the row they filled in — but it is not a quality score, because half the
 * product is missing and standing an average in for it would invent the exact
 * opinion the prompt exists to collect.
 */
export function qualityOf(task: Task): number | null {
  const difficulty = Number(task.difficulty);
  const execution = Number(task.execution);
  if (!Number.isFinite(difficulty) || !Number.isFinite(execution)) return null;
  if (difficulty < 1 || difficulty > 5 || execution < 1 || execution > 5) return null;
  return Math.round(difficulty) * Math.round(execution);
}

export interface RatedTask {
  id: string;
  name: string;
  difficulty: number;
  execution: number;
  /** difficulty × execution, 1-25. */
  quality: number;
  /** ISO day it was finished, for ordering and for the window filter. */
  on: string;
}

/** The rated tasks finished inside a window, oldest first. */
export function ratedTasks(tasks: Task[], fromIso: string, toIso: string): RatedTask[] {
  const out: RatedTask[] = [];
  tasks.forEach((task) => {
    const quality = qualityOf(task);
    if (quality === null) return;
    const on = String(task.completed_at || '').slice(0, 10);
    if (!on || on < fromIso || on > toIso) return;
    out.push({
      id: String(task.id),
      name: task.title,
      difficulty: Math.round(Number(task.difficulty)),
      execution: Math.round(Number(task.execution)),
      quality,
      on,
    });
  });
  return out.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
}

export interface RatingSummary {
  /** How many finished tasks in the window carry both ratings. */
  rated: number;
  /** How many were finished at all. `rated / finished` is the coverage. */
  finished: number;
  /** Share of finished tasks that were rated, 0-100. */
  coverage: number;
  /** Mean difficulty × execution, or null when nothing is rated. */
  quality: number | null;
  difficulty: number | null;
  execution: number | null;
  /** The single best and worst rated task, or null. */
  best: RatedTask | null;
  worst: RatedTask | null;
}

const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

/**
 * The window's ratings in one object, with the coverage that qualifies them.
 *
 * `finished` counts every completed task in the window and `rated` only the
 * ones with both stars, so a panel can always say "34 of 112" rather than
 * implying the average speaks for all the work. A window with nothing rated
 * comes back with three nulls and a coverage of 0 — the caller decides what to
 * say about that, and the honest options are all sentences rather than charts.
 */
export function summariseRatings(
  tasks: Task[],
  fromIso: string,
  toIso: string,
): RatingSummary {
  const rated = ratedTasks(tasks, fromIso, toIso);
  const finished = tasks.filter((task) => {
    const on = String(task.completed_at || '').slice(0, 10);
    return Boolean(on) && on >= fromIso && on <= toIso;
  }).length;

  let best: RatedTask | null = null;
  let worst: RatedTask | null = null;
  rated.forEach((task) => {
    if (!best || task.quality > best.quality) best = task;
    if (!worst || task.quality < worst.quality) worst = task;
  });

  return {
    rated: rated.length,
    finished,
    coverage: finished ? Math.round((rated.length / finished) * 100) : 0,
    quality: mean(rated.map((task) => task.quality)),
    difficulty: mean(rated.map((task) => task.difficulty)),
    execution: mean(rated.map((task) => task.execution)),
    best,
    worst,
  };
}

export interface QualityCell {
  difficulty: number;
  execution: number;
  count: number;
  /** difficulty × execution — what a task landing here is worth. */
  quality: number;
}

/**
 * The 5×5 grid of where rated tasks land.
 *
 * The one picture in this app that cannot be drawn from the record, and the
 * reason the prompt is worth asking at all. A cloud in the bottom-right is
 * hard work going well; one in the top-left is easy work going badly, which is
 * a different problem with a different fix and produces an identical XP total.
 * The diagonal is the interesting axis: tasks above it went better than their
 * difficulty predicted, tasks below it went worse.
 *
 * Always all 25 cells, including the empty ones. A grid drawn only where there
 * are tasks is a scatter of blocks with no frame, and the *empty* regions are
 * half the finding — an account with nothing in the right-hand columns is an
 * account that has not attempted anything hard.
 */
export function qualityGrid(rated: RatedTask[]): QualityCell[] {
  const counts = new Map<string, number>();
  rated.forEach((task) => {
    const key = `${task.difficulty}:${task.execution}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const cells: QualityCell[] = [];
  // Execution descends so the strongest row is at the top, the way a reader
  // expects a y-axis to run; difficulty ascends left to right.
  for (let execution = 5; execution >= 1; execution--) {
    for (let difficulty = 1; difficulty <= 5; difficulty++) {
      cells.push({
        difficulty,
        execution,
        count: counts.get(`${difficulty}:${execution}`) ?? 0,
        quality: difficulty * execution,
      });
    }
  }
  return cells;
}

export interface QualityBand {
  label: string;
  hint: string;
  count: number;
  share: number;
  tone: string;
}

/**
 * The four quadrants of that grid, counted.
 *
 * The grid shows where the work landed and refuses to say what that means; this
 * says it. Three-and-up counts as "hard" and as "well" — the midpoint of a
 * five-star row is 3, and putting the cut anywhere else would be choosing a
 * conclusion before counting.
 */
export function qualityBands(rated: RatedTask[]): QualityBand[] {
  const total = rated.length;
  const count = (test: (task: RatedTask) => boolean) => rated.filter(test).length;
  const band = (label: string, hint: string, tone: string, n: number): QualityBand => ({
    label,
    hint,
    count: n,
    share: total ? Math.round((n / total) * 100) : 0,
    tone,
  });

  return [
    band(
      'Hard, done well',
      'Difficulty 3+ and execution 3+. The work worth having a record of.',
      'green',
      count((task) => task.difficulty >= 3 && task.execution >= 3),
    ),
    band(
      'Hard, went badly',
      'Difficulty 3+, execution below 3. Worth knowing what these had in common.',
      'amber',
      count((task) => task.difficulty >= 3 && task.execution < 3),
    ),
    band(
      'Easy, done well',
      'Difficulty below 3, execution 3+. Real work, but it is not stretching you.',
      'blue',
      count((task) => task.difficulty < 3 && task.execution >= 3),
    ),
    band(
      'Easy, went badly',
      'Difficulty below 3, execution below 3. Usually an off day, not the task.',
      'pink',
      count((task) => task.difficulty < 3 && task.execution < 3),
    ),
  ];
}

export interface RatingFinding {
  headline: string;
  hint: string;
  tone: 'good' | 'watch' | 'note';
}

/**
 * What the ratings support saying, and nothing beyond it.
 *
 * Every rule here is guarded on a count as well as a figure, because these are
 * self-reported numbers on an opt-in prompt and the samples are small. Under
 * `FLOOR` ratings the function returns a single row saying so — an account that
 * rated three tasks does not have a pattern, and a panel that announces one
 * from three is teaching the reader to discount the rows that arrive later.
 */
const FLOOR = 8;

export function ratingFindings(summary: RatingSummary, rated: RatedTask[]): RatingFinding[] {
  if (summary.rated < FLOOR) {
    return [
      {
        tone: 'note',
        headline: `${summary.rated} rated ${summary.rated === 1 ? 'task' : 'tasks'} in this window.`,
        hint: `Findings need ${FLOOR}. Rating is optional.`,
      },
    ];
  }

  const out: RatingFinding[] = [];
  const difficulty = summary.difficulty ?? 0;
  const execution = summary.execution ?? 0;

  // The gap between how hard the work is and how well it goes. Both are on the
  // same 1-5 scale, which is the only reason subtracting them means anything.
  const gap = execution - difficulty;
  if (Math.abs(gap) >= 0.6) {
    out.push(
      gap > 0
        ? {
            tone: 'watch',
            headline: 'Your tasks may be too easy.',
            hint: `Execution ${execution.toFixed(1)}, difficulty ${difficulty.toFixed(1)}. Try harder tasks.`,
          }
        : {
            tone: 'watch',
            headline: 'Your tasks may be too hard.',
            hint: `Difficulty ${difficulty.toFixed(1)}, execution ${execution.toFixed(1)}. Fine for now, but keep an eye on it.`,
          },
    );
  } else {
    out.push({
      tone: 'good',
      headline: 'Your tasks are the right difficulty.',
      hint: `Difficulty ${difficulty.toFixed(1)}, execution ${execution.toFixed(1)}. You're challenged but still doing well.`,
    });
  }

  // Whether the hard work is actually going anywhere.
  const hard = rated.filter((task) => task.difficulty >= 4);
  if (hard.length >= 3) {
    const hardWell = hard.filter((task) => task.execution >= 3).length;
    const share = Math.round((hardWell / hard.length) * 100);
    out.push({
      tone: share >= 60 ? 'good' : 'watch',
      headline: `${share}% of your hardest tasks went well.`,
      hint: `${hardWell} of ${hard.length} hard tasks (4–5 difficulty) rated 3+ for execution.`,
    });
  }

  // Movement across the window, second half against the first. Only when both
  // halves have enough in them to be halves.
  const half = Math.floor(rated.length / 2);
  const early = rated.slice(0, half);
  const late = rated.slice(rated.length - half);
  if (half >= 4) {
    const avg = (list: RatedTask[]) =>
      list.reduce((sum, task) => sum + task.quality, 0) / list.length;
    const change = avg(late) - avg(early);
    if (Math.abs(change) >= 1.5) {
      out.push({
        tone: change > 0 ? 'good' : 'watch',
        headline: `Quality ${change > 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(1)} points.`,
        hint: `From ${avg(early).toFixed(1)} (first ${early.length} tasks) to ${avg(late).toFixed(1)} (last ${late.length}).`,
      });
    }
  }

  // The coverage caveat, always last and always present. Everything above is
  // drawn from a self-selected sample, and the reader should be told how large
  // it is even when — especially when — the findings sound confident.
  out.push({
    tone: 'note',
    headline: `Based on ${summary.rated} of ${summary.finished} finished tasks.`,
    hint:
      summary.coverage >= 60
        ? 'Enough to be reliable.'
        : 'Less than half your tasks, so treat this as a rough guide.',
  });

  return out;
}

// --------------------------------------------------------------------------
// What the reasons add up to
// --------------------------------------------------------------------------
export interface ReasonCount {
  key: string;
  label: string;
  phrase: string;
  side: ReasonSide;
  count: number;
  /** Share of the answers on that side, 0-100. Not of all answers: the two
      sides are asked of different tasks and comparing across them is
      meaningless — "distracted 40%, prepared 60%" is not a sentence. */
  share: number;
}

export interface ReasonSummary {
  struggle: ReasonCount[];
  wentWell: ReasonCount[];
  /** How many finished tasks in the window carry a reason at all. */
  answered: number;
  /** Of those, how many landed on each side. */
  struggled: number;
  succeeded: number;
}

/**
 * The reasons given inside a window, counted and ranked.
 *
 * Both lists come back ordered by count and include only the reasons actually
 * given — unlike `qualityGrid`, which draws its empty cells on purpose. The
 * difference is what the empty means: an empty cell in the grid says nothing
 * ever landed there, which is a finding, while a reason nobody picked is just
 * a word on a list and printing six zeroes under a heading is noise.
 */
export function summariseReasons(
  tasks: Task[],
  fromIso: string,
  toIso: string,
): ReasonSummary {
  const counts = new Map<string, number>();
  let answered = 0;

  tasks.forEach((task) => {
    const on = String(task.completed_at || '').slice(0, 10);
    if (!on || on < fromIso || on > toIso) return;
    const found = reasonOf(task.reason);
    if (!found) return;
    answered += 1;
    counts.set(task.reason as string, (counts.get(task.reason as string) ?? 0) + 1);
  });

  const side = (which: ReasonSide, list: Reason[]): ReasonCount[] => {
    const rows = list
      .map((reason) => ({
        key: reason.key,
        label: reason.label,
        phrase: reason.phrase,
        side: which,
        count: counts.get(reason.key) ?? 0,
        share: 0,
      }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    rows.forEach((row) => {
      row.share = total ? Math.round((row.count / total) * 100) : 0;
    });
    return rows;
  };

  const struggle = side('struggle', STRUGGLE_REASONS);
  const wentWell = side('went-well', WENT_WELL_REASONS);

  return {
    struggle,
    wentWell,
    answered,
    struggled: struggle.reduce((sum, row) => sum + row.count, 0),
    succeeded: wentWell.reduce((sum, row) => sum + row.count, 0),
  };
}

/**
 * What the reasons support saying.
 *
 * Guarded on a count for the same reason `ratingFindings` is, and with a
 * higher floor: a reason is one of six, so three answers can put two on the
 * same word by chance alone. Under `REASON_FLOOR` on a side, that side gets no
 * claim made about it.
 */
export const REASON_FLOOR = 5;

export function reasonFindings(summary: ReasonSummary): RatingFinding[] {
  const out: RatingFinding[] = [];

  const top = (rows: ReasonCount[]) => rows[0] ?? null;
  const worst = top(summary.struggle);
  const best = top(summary.wentWell);

  if (summary.answered === 0) return out;

  if (summary.struggled >= REASON_FLOOR && worst) {
    out.push({
      tone: 'watch',
      headline: `When work goes badly, it ${worst.phrase}.`,
      hint: `${worst.count} of ${summary.struggled} low-rated tasks (${worst.share}%) gave this reason.`,
    });
  }

  if (summary.succeeded >= REASON_FLOOR && best) {
    out.push({
      tone: 'good',
      headline: `When it goes well, it ${best.phrase}.`,
      hint: `${best.count} of ${summary.succeeded} well-rated tasks (${best.share}%) gave this reason. Plan for it.`,
    });
  }

  // The pair, when both sides have enough behind them. Two reasons that are
  // opposite faces of the same thing — a clear run against interruptions — is
  // the most actionable finding this data can produce, so it is stated
  // outright rather than left for the reader to notice.
  const OPPOSITES: Record<string, string> = {
    distracted: 'deep-focus',
    interrupted: 'deep-focus',
    unclear: 'prepared',
    underestimated: 'broken-down',
    'low-energy': 'fresh',
    'no-time': 'broken-down',
  };
  if (worst && best && summary.struggled >= REASON_FLOOR && summary.succeeded >= REASON_FLOOR) {
    if (OPPOSITES[worst.key] === best.key) {
      out.push({
        tone: 'note',
        headline: 'Your best and worst tasks have the same cause.',
        hint: `Bad tasks ${worst.phrase}; good ones ${best.phrase}. Protect that condition.`,
      });
    }
  }

  if (out.length === 0) {
    out.push({
      tone: 'note',
      headline: `${summary.answered} ${summary.answered === 1 ? 'reason' : 'reasons'} given so far.`,
      hint: `Findings appear after ${REASON_FLOOR} answers.`,
    });
  }

  return out;
}

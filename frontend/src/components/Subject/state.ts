/**
 * The Subject State — the deterministic half of subject analytics.
 *
 * ## What this is, and why it is separate from `model`
 *
 * `./model` answers "how is this subject going" for the page's own panels: a
 * score, four rates, difficulty bands, a run of recent work. This answers the
 * three questions the analytics are actually for —
 *
 *     WHERE AM I?  WHY AM I THERE?  WHAT SHOULD I DO NEXT?
 *
 * — and it does the first two entirely in arithmetic, so that the third can be
 * asked of a model over a table of facts rather than over a database. That
 * division is the whole architecture: **the backend counts, the model
 * interprets.** Nothing here calls anything; it is a pure function of the
 * account's own tasks, which is what makes every figure in it checkable and
 * every one of them testable.
 *
 * ## What the record can and cannot support
 *
 * This is the constraint that shapes the file, and it is worth stating plainly
 * because the temptation is to paper over it.
 *
 * A task in Summit carries a subject, a difficulty (1-5), an execution rating
 * (1-5), a completion time, a deadline result, a reason from a closed
 * vocabulary, and a goal link. That is all. There is no sub-skill column, no
 * recorded estimate of how long a task *should* take, no count of mistakes, no
 * confidence-before and confidence-after, and no session grouping. So:
 *
 *   * **Sub-skill mastery is not computed here.** The skill trees that name
 *     sub-skills are authored — every node is written by hand and its state is
 *     illustrative — and reading them back as "your circle geometry is 68%"
 *     would be inventing the reader. The dimension this file *can* measure is
 *     difficulty, which is recorded on every rated task, and the difficulty
 *     curve below is what stands in for it.
 *   * **Expected time is derived, not stored.** Nobody is asked how long a
 *     task should take, so "expected" here means *the account's own median
 *     time at that difficulty in this subject* — which is a better baseline
 *     than a guess anyway, because it is what this person actually does.
 *     `timeAnalysis` says so in its own note.
 *   * **Mistake patterns are the twelve reasons**, and only for accounts whose
 *     rating depth collects them.
 *
 * Every figure below is derived from something recorded. Nothing is invented,
 * and a dimension with no evidence returns `known: false` rather than a zero
 * that would read as a bad score.
 *
 * ## Evidence is not decoration
 *
 * Every dimension carries the counts it was computed from. A page that says
 * "Execution: 73" and cannot answer "why" is a page asking to be trusted; one
 * that says "73 — 84 rated tasks, mean 3.7 of 5, 41 of them at Hard or above"
 * is arguable. The AI layer is handed the same evidence and is forbidden from
 * producing figures that are not in it, which is only a workable instruction
 * because it is all here.
 */
import { DIFFICULTY_WORDS, qualityOf, reasonOf } from '@/utils/ratings';
import { spanFor, type Span } from './model';
import type { WindowKey } from '@/components/Analytics/data';
import type { AnalyticsTask } from '@/services/analytics';
import { secondsSpent } from '@/utils/timeSpent';

// --------------------------------------------------------------------------
// Small shared arithmetic
// --------------------------------------------------------------------------
function dayOf(stamp: string | undefined): string {
  return (stamp ?? '').slice(0, 10);
}

function within(day: string, from: string, to: string): boolean {
  if (!day) return false;
  if (from && day < from) return false;
  return !to || day <= to;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function pct(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

/** A rated task: both rows answered, which is what makes it a quality score. */
function rated(task: AnalyticsTask): boolean {
  return qualityOf(task as never) !== null;
}

/** Minutes a task took, or null when nothing was timed against it. */
function minutesOf(task: AnalyticsTask): number | null {
  // Time spent, not `completion_seconds` raw — see utils/timeSpent.
  const seconds = secondsSpent(task);
  return seconds === null ? null : seconds / 60;
}

// --------------------------------------------------------------------------
// The seven dimensions
// --------------------------------------------------------------------------
/**
 * One measured dimension of a subject, with what it was measured from.
 *
 * `known: false` is a first-class answer and is not the same as zero. An
 * account that has never rated a task has no execution figure, and printing
 * a nought there would score somebody for not using a feature — the failure
 * the note on `Rate` in ./model describes.
 */
export interface Dimension {
  key: DimensionKey;
  label: string;
  /** 0-100, or null when there is nothing to measure it from. */
  value: number | null;
  known: boolean;
  /** One line: what this dimension is, in the reader's own terms. */
  meaning: string;
  /** The counts behind the figure. Never empty when `known`. */
  evidence: string[];
  /** Points against the same figure in the run immediately before. */
  delta: number | null;
}

export type DimensionKey =
  | 'mastery'
  | 'execution'
  | 'quality'
  | 'efficiency'
  | 'consistency'
  | 'productivity'
  | 'momentum';

/**
 * Mastery and execution are deliberately different measures.
 *
 * The distinction is the most useful thing on the page and it is easy to
 * collapse by accident, so it is written down here.
 *
 * **Mastery** is what the reader takes on: the mean difficulty of the work
 * they finish, as a share of the hardest there is. Somebody working almost
 * entirely at Brutal has high mastery whatever their execution, because they
 * are operating at the top of the scale.
 *
 * **Execution** is how it goes when they do: the mean execution rating. It
 * says nothing about what was attempted.
 *
 * The gap between them is the finding. High mastery with low execution is
 * somebody reaching past what they can currently land — and the instruction
 * for that ("drop a band and drill application") is the opposite of the one
 * for the reverse case ("you are coasting; go up a band"). A single blended
 * "skill" figure cannot tell those apart, which is why there are two.
 */
function masteryOf(done: AnalyticsTask[]): number | null {
  const levels = done.filter(rated).map((task) => Number(task.difficulty));
  const average = mean(levels);
  // 1-5 mapped onto 0-100 with 1 as the floor: a subject worked entirely at
  // Trivial is not "20% masterful", it is at the bottom of the scale.
  return average === null ? null : pct(((average - 1) / 4) * 100);
}

function executionOf(done: AnalyticsTask[]): number | null {
  const marks = done.filter(rated).map((task) => Number(task.execution));
  const average = mean(marks);
  return average === null ? null : pct(((average - 1) / 4) * 100);
}

/** Difficulty times execution, against the 25 it is scored out of. */
function qualityRate(done: AnalyticsTask[]): number | null {
  const scores = done
    .map((task) => qualityOf(task as never))
    .filter((score): score is number => score !== null);
  const average = mean(scores);
  return average === null ? null : pct((average / 25) * 100);
}

// --------------------------------------------------------------------------
// The difficulty curve — where performance starts to go
// --------------------------------------------------------------------------
/**
 * One rung of the difficulty ladder, and how the account does on it.
 *
 * The single most useful analytic in the system, and the reason is that it
 * answers a question an average cannot. "Your execution is 74%" is one number
 * over five very different populations; "94% at Fair, 71% at Hard, 54% at
 * Brutal" names the rung where the work stops landing, and the rung is what a
 * recommendation is actually about.
 */
export interface Rung {
  /** 1-5. */
  level: number;
  /** "Trivial" … "Brutal", from utils/ratings so the words never diverge. */
  label: string;
  /** Rated tasks finished at this level in the window. */
  done: number;
  /** Mean execution, 0-100. Null under the floor. */
  execution: number | null;
  /** Mean quality against 25, 0-100. Null under the floor. */
  quality: number | null;
  /** Median minutes one took. Null when nothing here was timed. */
  minutes: number | null;
  /**
   * The share finished at execution 4 or 5 — "landed it" rather than "got
   * through it". A mean hides a level split between excellent and poor, and
   * that split is a different finding from a level that is uniformly middling.
   */
  cleared: number | null;
}

/**
 * How many rated tasks a rung needs before it is a finding.
 *
 * Three is not a sample; it is the floor at which naming something stops
 * being noise — the same floor ./model uses for its bands, deliberately, so
 * the two cannot disagree about whether a level counts.
 */
export const RUNG_FLOOR = 3;

/**
 * How far execution has to fall between two adjacent levels to be a cliff.
 *
 * Points, and twenty is not arbitrary. Execution is recorded as one to five
 * stars, so a whole star is twenty-five points on the 0-100 scale everything
 * here is expressed in — which means a threshold of twelve would fire on
 * *half a star* of difference between two levels, and half a star between
 * Fair and Hard is not a finding, it is the scale being coarse. Twenty catches
 * a real step down (4.0 to 3.2 and worse) without firing on ordinary
 * variation.
 */
export const CLIFF = 20;

export interface DifficultyCurve {
  rungs: Rung[];
  /** True once at least two rungs clear the floor. One rung is not a curve. */
  any: boolean;
  /** The best-executed rung with enough behind it. */
  best: Rung | null;
  /**
   * The level where it falls apart — the steepest single step down between two
   * adjacent measured levels, when that step is at least `CLIFF`.
   *
   * The *steepest*, not the first. A reader is almost always strongest at the
   * bottom of the scale, so "the first level below your best" is nearly always
   * the second rung and says nothing; and a page that named a 25-point step
   * while a 50-point one sat two levels up would be pointing at the wrong
   * problem with perfect confidence. There is one cliff, and it is the biggest
   * one.
   *
   * Null when the curve does not fall away anywhere, which is a real answer
   * with its own instruction — go up a level, rather than practise more.
   */
  threshold: Rung | null;
  /**
   * The level immediately below the threshold: the one that is holding, and
   * therefore the one to work. This is what a recommendation is about, and it
   * is why the threshold is worth finding at all.
   */
  holds: Rung | null;
  /** Points between `holds` and `threshold`. Null without both. */
  drop: number | null;
  /** The highest rung with any rated work at all. */
  ceiling: Rung | null;
}

export function difficultyCurve(done: AnalyticsTask[]): DifficultyCurve {
  const rungs: Rung[] = DIFFICULTY_WORDS.map((label, at) => {
    const level = at + 1;
    const here = done.filter((task) => rated(task) && Number(task.difficulty) === level);
    const enough = here.length >= RUNG_FLOOR;
    const marks = here.map((task) => Number(task.execution));
    const times = here.map(minutesOf).filter((value): value is number => value !== null);

    return {
      level,
      label,
      done: here.length,
      execution: enough ? pct(((mean(marks) ?? 1) - 1) / 4 * 100) : null,
      quality: enough ? pct(((level * (mean(marks) ?? 0)) / 25) * 100) : null,
      minutes: times.length ? Math.round((median(times) ?? 0) * 10) / 10 : null,
      cleared: enough
        ? pct((marks.filter((mark) => mark >= 4).length / marks.length) * 100)
        : null,
    };
  });

  const measured = rungs.filter((rung) => rung.execution !== null);
  const best = [...measured].sort((a, b) => b.execution! - a.execution!)[0] ?? null;
  const ceiling = [...rungs].reverse().find((rung) => rung.done > 0) ?? null;

  /* The steepest step down between adjacent measured levels. Adjacent in the
     *measured* sequence rather than by level number: a reader with nothing at
     Easy has Trivial next to Fair, and the step between them is still the
     step they took. */
  let threshold: Rung | null = null;
  let holds: Rung | null = null;
  let steepest = 0;
  for (let at = 1; at < measured.length; at += 1) {
    const below = measured[at - 1]!;
    const here = measured[at]!;
    const fall = below.execution! - here.execution!;
    if (fall >= CLIFF && fall > steepest) {
      steepest = fall;
      threshold = here;
      holds = below;
    }
  }

  return {
    rungs,
    any: measured.length >= 2,
    best,
    threshold,
    holds,
    drop: threshold && holds ? Math.round(holds.execution! - threshold.execution!) : null,
    ceiling,
  };
}

// --------------------------------------------------------------------------
// Time, read against what it bought
// --------------------------------------------------------------------------
/**
 * How long the work takes, and whether the time is doing anything.
 *
 * ## Fast is not good
 *
 * The rule this exists to enforce. Thirty minutes of expected work finished in
 * eighteen at 52% quality is not efficiency, it is a task that was abandoned;
 * the same thirty finished in twenty-two at 91% is. So the figure this
 * produces is a **composite**: how much faster than usual, weighted by whether
 * the quality held. Speed alone is reported beside it and is never the score.
 *
 * ## "Expected" is the account's own median, and that is deliberate
 *
 * Summit never asks how long a task should take, so there is no stored estimate
 * to compare against. The baseline used here is the reader's own median time
 * at that difficulty in this subject — which is the better baseline anyway:
 * a personal estimate is a guess about the future, and this is a measurement
 * of the past. It also means the figure is meaningless with one data point,
 * which is what `known` is for.
 */
export interface TimeAnalysis {
  known: boolean;
  /** Median minutes per finished task in this window. */
  typical: number | null;
  /** Total hours logged against the finished tasks. */
  hours: number;
  /**
   * Minutes above (positive) or below (negative) the account's own median for
   * the difficulty, averaged over the window's rated and timed tasks.
   */
  drift: number | null;
  /** 0-100. Faster than usual *and* holding quality. Null without both. */
  efficiency: number | null;
  /** The share of timed tasks that came in under their level's median. */
  quicker: number | null;
  /**
   * The case the composite exists to catch: finished fast and rated poorly.
   * A count, because it is a list of specific tasks rather than a rate.
   */
  rushed: number;
  /** Finished slowly and rated well — the opposite, and not a problem. */
  thorough: number;
}

/** Under this execution rating, speed is not a saving. */
const RUSHED_UNDER = 3;

export function timeAnalysis(done: AnalyticsTask[]): TimeAnalysis {
  const timed = done
    .map((task) => ({ task, minutes: minutesOf(task) }))
    .filter((row): row is { task: AnalyticsTask; minutes: number } => row.minutes !== null);

  const hours = timed.reduce((sum, row) => sum + row.minutes, 0) / 60;
  const typical = timed.length ? Math.round((median(timed.map((r) => r.minutes)) ?? 0) * 10) / 10 : null;

  // The per-level baselines, from the same window. A level with one task has
  // no median worth the name, so it is left out of the comparison entirely.
  const baseline = new Map<number, number>();
  for (let level = 1; level <= 5; level += 1) {
    const here = timed.filter((row) => Number(row.task.difficulty) === level);
    if (here.length >= RUNG_FLOOR) baseline.set(level, median(here.map((r) => r.minutes)) ?? 0);
  }

  const comparable = timed.filter(
    (row) => rated(row.task) && baseline.has(Number(row.task.difficulty)),
  );

  if (!comparable.length) {
    return {
      known: false,
      typical,
      hours: Math.round(hours * 10) / 10,
      drift: null,
      efficiency: null,
      quicker: null,
      rushed: 0,
      thorough: 0,
    };
  }

  const drifts = comparable.map(
    (row) => row.minutes - baseline.get(Number(row.task.difficulty))!,
  );
  const quicker = drifts.filter((value) => value < 0).length;

  const rushed = comparable.filter(
    (row, at) => drifts[at]! < 0 && Number(row.task.execution) < RUSHED_UNDER,
  ).length;
  const thorough = comparable.filter(
    (row, at) => drifts[at]! > 0 && Number(row.task.execution) >= 4,
  ).length;

  /* ---- The composite -----------------------------------------------------
     Centred on 50, so "usual time at a middling rating" is the middle rather
     than a failure, and built from two terms:

       (held − ½) × 60   how it was rated. The larger term, because a task
                         that did not go well was not made efficient by being
                         quick.
       speed × 30 × (2·held − 1)
                         the time, **signed by the rating**. That sign is the
                         whole point: being under your usual time is a credit
                         when the work landed and a debit when it did not, so
                         finishing early and rating it Poor scores below
                         finishing late and rating it Poor.

     Against the two cases that decide whether the measure is any good:

       30 usual → 18 actual, rated ~52%   →  52   not efficient
       30 usual → 22 actual, rated ~91%   →  81   efficient

     which is the reading a person would give them, and the reading a plain
     time ratio gets exactly backwards. */
  const scored = comparable.map((row, at) => {
    const expected = baseline.get(Number(row.task.difficulty))!;
    // −1 … +1, clamped: twice the usual time is as far as the axis goes.
    const speed = expected > 0 ? Math.max(-1, Math.min(1, -drifts[at]! / expected)) : 0;
    const held = (Number(row.task.execution) - 1) / 4;
    return 50 + (held - 0.5) * 60 + speed * 30 * (2 * held - 1);
  });

  return {
    known: true,
    typical,
    hours: Math.round(hours * 10) / 10,
    drift: Math.round((mean(drifts) ?? 0) * 10) / 10,
    efficiency: pct(mean(scored) ?? 50),
    quicker: pct((quicker / comparable.length) * 100),
    rushed,
    thorough,
  };
}

// --------------------------------------------------------------------------
// Momentum
// --------------------------------------------------------------------------
/**
 * Recent improvement, not standing.
 *
 * Somebody at 80 and climbing has more momentum than somebody at 90 and flat,
 * and the two want opposite advice. Measured as the later half of the window
 * against the earlier half, in points of execution — halves rather than a
 * fitted slope because a slope over a dozen points is a number with a
 * confidence interval wider than itself, and this is read as a direction.
 */
export interface Momentum {
  known: boolean;
  /** Points of execution, later half minus earlier half. */
  change: number | null;
  earlier: number | null;
  later: number | null;
  direction: 'climbing' | 'slipping' | 'flat' | 'unknown';
}

/** Rated tasks each half needs before the comparison means anything. */
export const HALF_FLOOR = 4;

/** Points of change that count as a direction rather than as noise. */
export const DRIFT = 3;

export function momentumOf(done: AnalyticsTask[]): Momentum {
  const ordered = done
    .filter(rated)
    .sort((a, b) => dayOf(a.completed_at).localeCompare(dayOf(b.completed_at)));

  const half = Math.floor(ordered.length / 2);
  if (half < HALF_FLOOR) {
    return { known: false, change: null, earlier: null, later: null, direction: 'unknown' };
  }

  const earlier = executionOf(ordered.slice(0, half));
  const later = executionOf(ordered.slice(ordered.length - half));
  if (earlier === null || later === null) {
    return { known: false, change: null, earlier: null, later: null, direction: 'unknown' };
  }

  const change = Math.round(later - earlier);
  return {
    known: true,
    change,
    earlier,
    later,
    direction: change >= DRIFT ? 'climbing' : change <= -DRIFT ? 'slipping' : 'flat',
  };
}

// --------------------------------------------------------------------------
// Achievements, counted rather than awarded
// --------------------------------------------------------------------------
/**
 * A standing this subject's record either reaches or does not.
 *
 * Every one is a threshold over counted evidence, and each carries how far
 * along it is — so an unreached one is a target with a distance rather than a
 * greyed-out box. Nothing here is stored: they are recomputed from the tasks
 * every time, which is what stops them from drifting out of agreement with
 * the figures they are made of.
 */
export interface Standing {
  id: string;
  title: string;
  detail: string;
  reached: boolean;
  /** 0-100 toward it. 100 exactly when reached. */
  progress: number;
  /** Where it stands, in the counts it is measured in. */
  at: string;
}

/** Execution rating that counts as landing a task. */
const LANDED = 4;

export function standings(done: AnalyticsTask[], curve: DifficultyCurve): Standing[] {
  const out: Standing[] = [];
  const ratedTasks = done.filter(rated);

  // ---- Reaching, and landing it ------------------------------------------
  const hard = ratedTasks.filter(
    (task) => Number(task.difficulty) >= 4 && Number(task.execution) >= LANDED,
  ).length;
  out.push({
    id: 'breakthrough',
    title: 'Difficulty breakthrough',
    detail: 'Ten tasks at Hard or above, landed at Strong or better.',
    reached: hard >= 10,
    progress: pct((hard / 10) * 100),
    at: `${hard} of 10`,
  });

  // ---- Doing it again ----------------------------------------------------
  /* The longest run of consecutive rated tasks at Strong or better. A rate
     would let a bad fortnight hide inside a good quarter; a run is the thing
     the achievement is actually about. */
  let run = 0;
  let best = 0;
  for (const task of [...ratedTasks].sort((a, b) =>
    dayOf(a.completed_at).localeCompare(dayOf(b.completed_at)),
  )) {
    run = Number(task.execution) >= LANDED ? run + 1 : 0;
    best = Math.max(best, run);
  }
  out.push({
    id: 'consistency',
    title: 'Held the line',
    detail: 'Twenty tasks in a row at Strong or better.',
    reached: best >= 20,
    progress: pct((best / 20) * 100),
    at: `best run ${best}`,
  });

  // ---- Working across the ladder -----------------------------------------
  const levels = curve.rungs.filter((rung) => rung.done >= RUNG_FLOOR).length;
  out.push({
    id: 'range',
    title: 'Full range',
    detail: 'Real work at four of the five difficulty levels.',
    reached: levels >= 4,
    progress: pct((levels / 4) * 100),
    at: `${levels} of 5 levels`,
  });

  // ---- Fast and good, which is the only kind that counts ------------------
  const analysis = timeAnalysis(done);
  out.push({
    id: 'efficiency',
    title: 'Quick without cutting',
    detail: 'Ten hard tasks under your usual time, still landed.',
    reached: analysis.thorough === 0 ? false : analysis.rushed === 0 && hard >= 10,
    progress: pct((Math.max(0, hard - analysis.rushed) / 10) * 100),
    at: analysis.rushed > 0 ? `${analysis.rushed} rushed` : `${hard} clean`,
  });

  return out;
}

// --------------------------------------------------------------------------
// Mistakes, where the account collects them
// --------------------------------------------------------------------------
/**
 * What the reader said when a session went badly, counted.
 *
 * The twelve reasons are a closed vocabulary precisely so they can be counted
 * — see utils/ratings. An account whose rating depth does not ask for them has
 * none of this, and the honest page for that says what it is waiting for
 * rather than drawing an empty panel.
 */
export interface Mistake {
  key: string;
  label: string;
  count: number;
  /** Share of the badly-rated tasks that named it. */
  share: number;
}

/** Under this execution rating a task counts as having gone badly. */
const BADLY = 3;

export function mistakes(done: AnalyticsTask[]): Mistake[] {
  const bad = done.filter((task) => rated(task) && Number(task.execution) <= BADLY);
  const counts = new Map<string, number>();
  for (const task of bad) {
    const found = reasonOf(task.reason);
    if (found && found.side === 'struggle') {
      counts.set(found.reason.key, (counts.get(found.reason.key) ?? 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  return [...counts]
    .map(([key, count]) => ({
      key,
      label: reasonOf(key)?.reason.label ?? key,
      count,
      share: total ? pct((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

// --------------------------------------------------------------------------
// The whole state
// --------------------------------------------------------------------------
export interface SubjectState {
  /** Whether there is anything at all filed under this subject. */
  any: boolean;
  span: Span;
  /** Finished in the window, and in the equal-length run before it. */
  finished: number;
  finishedBefore: number;
  /** Rated on both rows — what every dimension but productivity is made of. */
  ratedCount: number;
  /** Days in the window with a finished task here. */
  activeDays: number;

  dimensions: Dimension[];
  /** The mean of every known dimension except momentum. 0-100. */
  overall: number | null;

  curve: DifficultyCurve;
  time: TimeAnalysis;
  momentum: Momentum;
  standings: Standing[];
  mistakes: Mistake[];
}

/**
 * Everything the deterministic layer knows about one subject.
 *
 * `today` is passed rather than read from the clock so the whole thing is a
 * pure function of its inputs — which is what makes it checkable, and what
 * lets a test pin a curve without a calendar around it.
 */
export function subjectState(
  all: AnalyticsTask[],
  subjectId: string,
  key: WindowKey,
  today: string,
): SubjectState {
  const mine = all.filter((task) => task.subject === subjectId);
  const span = spanFor(key, today);

  const finishedIn = (from: string, to: string) =>
    mine.filter((task) => task.status === 'done' && within(dayOf(task.completed_at), from, to));

  const done = finishedIn(span.from, span.to);
  const before = span.previousFrom ? finishedIn(span.previousFrom, span.previousTo) : [];

  const curve = difficultyCurve(done);
  const time = timeAnalysis(done);
  const momentum = momentumOf(done);
  const ratedTasks = done.filter(rated);

  const days = new Set(done.map((task) => dayOf(task.completed_at)).filter(Boolean));

  /* Productivity is volume against the window's own length, and it is the one
     dimension that needs no rating — which is deliberate, so an account that
     rates nothing still has one figure that is about them. Six finished tasks
     a week is the ceiling: past that the number stops discriminating, and a
     scale that everybody maxes out is not a measure. */
  const perWeek = span.days > 0 ? (done.length / span.days) * 7 : 0;
  const productivity = span.days > 0 ? pct((perWeek / 6) * 100) : null;

  const consistency = span.days > 0 ? pct((days.size / span.days) * 100) : null;

  const delta = (now: number | null, then: number | null) =>
    now === null || then === null ? null : Math.round(now - then);

  const dimensions: Dimension[] = [
    {
      key: 'mastery',
      label: 'Mastery',
      value: masteryOf(done),
      known: ratedTasks.length > 0,
      meaning: 'How hard the work you take on is, on the five-level scale.',
      evidence: ratedTasks.length
        ? [
            `${ratedTasks.length} rated ${ratedTasks.length === 1 ? 'task' : 'tasks'}`,
            `mean difficulty ${(mean(ratedTasks.map((t) => Number(t.difficulty))) ?? 0).toFixed(1)} of 5`,
            curve.ceiling ? `reaching ${curve.ceiling.label.toLowerCase()}` : '',
          ].filter(Boolean)
        : [],
      delta: delta(masteryOf(done), before.length ? masteryOf(before) : null),
    },
    {
      key: 'execution',
      label: 'Execution',
      value: executionOf(done),
      known: ratedTasks.length > 0,
      meaning: 'How it goes when you do it — the rating you gave yourself after.',
      evidence: ratedTasks.length
        ? [
            `mean ${(mean(ratedTasks.map((t) => Number(t.execution))) ?? 0).toFixed(1)} of 5`,
            `${ratedTasks.filter((t) => Number(t.execution) >= LANDED).length} of ${ratedTasks.length} landed at Strong or better`,
            curve.best ? `best at ${curve.best.label.toLowerCase()}` : '',
          ].filter(Boolean)
        : [],
      delta: delta(executionOf(done), before.length ? executionOf(before) : null),
    },
    {
      key: 'quality',
      label: 'Quality',
      value: qualityRate(done),
      known: ratedTasks.length > 0,
      meaning: 'Difficulty times execution, against the 25 that product tops out at.',
      evidence: ratedTasks.length
        ? [
            `${ratedTasks.length} rated ${ratedTasks.length === 1 ? 'task' : 'tasks'}`,
            `mean product ${(mean(ratedTasks.map((t) => qualityOf(t as never) ?? 0)) ?? 0).toFixed(1)} of 25`,
          ]
        : [],
      delta: delta(qualityRate(done), before.length ? qualityRate(before) : null),
    },
    {
      key: 'efficiency',
      label: 'Efficiency',
      value: time.efficiency,
      known: time.known,
      meaning: 'Time against your own usual for that difficulty, weighted by whether it held up.',
      evidence: time.known
        ? [
            time.typical === null ? '' : `usually ${time.typical} min a task`,
            time.drift === null
              ? ''
              : time.drift < 0
                ? `${Math.abs(time.drift)} min under your median`
                : `${time.drift} min over your median`,
            time.rushed > 0 ? `${time.rushed} finished fast and rated poorly` : '',
            time.thorough > 0 ? `${time.thorough} took longer and landed` : '',
          ].filter(Boolean)
        : [],
      delta: null,
    },
    {
      key: 'consistency',
      label: 'Consistency',
      value: consistency,
      known: span.days > 0,
      meaning: 'Days with work here, against the days in the window.',
      evidence: span.days > 0 ? [`${days.size} of ${span.days} days`] : [],
      delta: null,
    },
    {
      key: 'productivity',
      label: 'Productivity',
      value: productivity,
      known: span.days > 0 && done.length > 0,
      meaning: 'Finished tasks a week, against six.',
      evidence:
        span.days > 0
          ? [
              `${done.length} finished in ${span.days} days`,
              `${perWeek.toFixed(1)} a week`,
              before.length ? `${before.length} the window before` : '',
            ].filter(Boolean)
          : [],
      delta:
        before.length && span.days > 0
          ? Math.round(((done.length - before.length) / before.length) * 100)
          : null,
    },
    {
      key: 'momentum',
      label: 'Momentum',
      /* Centred on 50 so it can sit in the same row as the others: 50 is flat,
         above is climbing. The signed figure the reader wants is `change` on
         the momentum object, which is what the card prints. */
      value: momentum.known ? pct(50 + (momentum.change ?? 0) * 2) : null,
      known: momentum.known,
      meaning: 'The later half of this window against the earlier half.',
      evidence: momentum.known
        ? [
            `${momentum.earlier}% → ${momentum.later}% execution`,
            `${(momentum.change ?? 0) > 0 ? '+' : ''}${momentum.change} points`,
          ]
        : [],
      delta: momentum.change,
    },
  ];

  const scored = dimensions
    .filter((entry) => entry.key !== 'momentum' && entry.known && entry.value !== null)
    .map((entry) => entry.value!);

  return {
    any: mine.length > 0,
    span,
    finished: done.length,
    finishedBefore: before.length,
    ratedCount: ratedTasks.length,
    activeDays: days.size,
    dimensions,
    overall: scored.length ? Math.round(mean(scored)!) : null,
    curve,
    time,
    momentum,
    standings: standings(done, curve),
    mistakes: mistakes(done),
  };
}

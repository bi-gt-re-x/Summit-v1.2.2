/**
 * Everything the subject page states, worked out from one fetch.
 *
 * ## The rule this file exists to keep
 *
 * **Every figure here is counted off this account's own tasks.** The analytics
 * page's own note says it and it holds harder on this page than anywhere else:
 * there is no sample data and no placeholder mode. Four tabs of that page once
 * fell back to invented figures behind a small chip, and it taught readers to
 * discount the real ones when they arrived.
 *
 * That rule is what shaped the sections below, because the obvious design for
 * a subject page asks for things Summit has never recorded. A page about
 * Mathematics wants to say "Geometry 68%, Algebra 94%" — and there is no
 * evidence anywhere in this app for either number. Tasks carry a *subject* and
 * nothing finer. The skill trees do name sub-skills, but they are authored
 * hierarchies whose node states are illustrative (see skills/subjectTrees), so
 * reading mastery off them would be reporting a designer's guess as the
 * reader's record. Likewise "47 problems attempted, 32 correct": Summit counts
 * tasks, not questions, and has no notion of a right answer.
 *
 * So each of those questions is answered with the nearest thing the record can
 * actually support, and the panel says which:
 *
 *   the sub-skill breakdown   →  the difficulty bands, which *are* recorded
 *                                (the difficulty star on every rated task)
 *   the mistake analysis      →  the twelve reasons, which are a closed
 *                                vocabulary precisely so they can be counted
 *   solve time by difficulty  →  `completion_seconds` grouped the same way
 *   problems correct          →  nothing. It is not asked.
 *
 * The shape of the page is the one that was asked for. The numbers in it are
 * the ones that are true.
 *
 * ## Rates, and changes, are two different jobs
 *
 * The **score** is the mean of four rates that are each already 0-100 by
 * construction — a share of something out of something. Nothing is normalised
 * onto an invented scale to get there, which is what keeps the letter grade
 * checkable: `howScored` prints the four numbers it was made of.
 *
 * The **growth** figures are percentage *changes* against the window
 * immediately before, which is where a count of tasks or a mean solve time can
 * be honest without a scale. A count has no natural ceiling; its change does.
 *
 * Both use the same window and the same equal-length period before it, for the
 * reason `sliceWindow` gives in components/Analytics/data: a baseline of a
 * different length reports the difference in length as a change in behaviour.
 */
import {
  DIFFICULTY_WORDS,
  qualityOf,
  reasonOf,
  type ReasonSide,
} from '@/utils/ratings';
import { gradeFor } from '@/utils/analyticalScore';
import type { Grade } from '@/types';
import { windowOption, type WindowKey } from '@/components/Analytics/data';
import { goalNumbers } from '@/components/Goals/numbers';
import { goalPace } from '@/utils/goalHealth';
import type { AnalyticsTask } from '@/services/analytics';
import type { Goal } from '@/types';

// --------------------------------------------------------------------------
// Days
// --------------------------------------------------------------------------

/** The ISO day a stamp falls on. Stamps arrive as dates or as date-times. */
function dayOf(stamp: string | undefined): string {
  return (stamp ?? '').slice(0, 10);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shift(iso: string, days: number): string {
  const at = new Date(`${iso}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return isoDay(at);
}

/**
 * The window's own days and the equal-length run before it.
 *
 * All Time has no before by definition, and `previousFrom` is empty rather
 * than reaching for the account's creation date: comparing a record against
 * the void it was made out of is not a comparison.
 */
export interface Span {
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  /** Days the current window covers, for the rates that divide by it. */
  days: number;
}

export function spanFor(key: WindowKey, today: string): Span {
  const { days } = windowOption(key);
  if (days === null) {
    return { from: '', to: today, previousFrom: '', previousTo: '', days: 0 };
  }
  const from = shift(today, -(days - 1));
  return {
    from,
    to: today,
    previousFrom: shift(from, -days),
    previousTo: shift(from, -1),
    days,
  };
}

/** Whether a day falls inside a range. An empty `from` means "no floor". */
function within(day: string, from: string, to: string): boolean {
  if (!day) return false;
  if (from && day < from) return false;
  return !to || day <= to;
}

// --------------------------------------------------------------------------
// The four rates the score is made of
// --------------------------------------------------------------------------

/**
 * One 0-100 rate, with the window before it for comparison.
 *
 * `before` is null when there is nothing to compare against — All Time, or a
 * previous window in which nothing happened. A delta of zero would be a claim
 * ("no change") where the honest answer is silence.
 */
export interface Rate {
  key: string;
  label: string;
  /** 0-100. */
  now: number;
  before: number | null;
  /** Percentage points, now minus before. */
  delta: number | null;
  /** What the rate is a share of, in the reader's own words. */
  note: string;
  /** Whether this rate could be measured at all. */
  known: boolean;
}

function rate(
  key: string,
  label: string,
  note: string,
  now: number | null,
  before: number | null,
): Rate {
  const known = now !== null;
  return {
    key,
    label,
    note,
    known,
    now: now ?? 0,
    before,
    delta: now !== null && before !== null ? Math.round(now - before) : null,
  };
}

/** Mean quality as a percentage. Quality is difficulty x execution, 1-25. */
function qualityRate(tasks: AnalyticsTask[]): number | null {
  const scores = tasks.map((task) => qualityOf(task)).filter((q): q is number => q !== null);
  if (!scores.length) return null;
  return (scores.reduce((sum, q) => sum + q, 0) / scores.length / 25) * 100;
}

/** Days with a finished task, out of the days the window covers. */
function consistencyRate(tasks: AnalyticsTask[], days: number): number | null {
  if (days <= 0) return null;
  const active = new Set(tasks.map((task) => dayOf(task.completed_at)).filter(Boolean));
  return Math.min(100, (active.size / days) * 100);
}

/**
 * The share of finished work that met its deadline.
 *
 * Only tasks that *had* a deadline are counted. A subject worked without due
 * dates is not a subject that misses them, and scoring it at zero would make
 * the letter grade a report on whether the reader uses a feature.
 */
function timelinessRate(tasks: AnalyticsTask[]): number | null {
  const dated = tasks.filter((task) => task.due_date);
  if (!dated.length) return null;
  return (dated.filter((task) => task.met_deadline).length / dated.length) * 100;
}

/** Finished, out of everything filed under the subject that is old enough to judge. */
function followThroughRate(done: number, open: number): number | null {
  const all = done + open;
  return all ? (done / all) * 100 : null;
}

// --------------------------------------------------------------------------
// The breakdown that replaces sub-skills
// --------------------------------------------------------------------------

/**
 * One difficulty band, and how the account does at it.
 *
 * This is the honest form of "which parts of this subject are you weak at".
 * The difficulty star is recorded on every rated task, so a band is evidence;
 * a named sub-skill would not be. `holding` is the mean execution star as a
 * percentage — how well the work went, at that difficulty.
 */
export interface Band {
  /** The difficulty star, 1-5. */
  level: number;
  label: string;
  done: number;
  /** Mean execution at this difficulty, 0-100. Null when none were rated. */
  holding: number | null;
  /** Percentage points against the same band in the window before. */
  delta: number | null;
  /** Mean seconds a task at this difficulty took, or null. */
  seconds: number | null;
  /** Seconds against the same band before — negative is faster. */
  secondsDelta: number | null;
}

function bandsOf(now: AnalyticsTask[], before: AnalyticsTask[]): Band[] {
  const holdingOf = (list: AnalyticsTask[], level: number): number | null => {
    const rated = list.filter(
      (task) => Math.round(Number(task.difficulty)) === level && Number(task.execution) >= 1,
    );
    if (!rated.length) return null;
    return (rated.reduce((sum, task) => sum + Number(task.execution), 0) / rated.length / 5) * 100;
  };

  const paceOf = (list: AnalyticsTask[], level: number): number | null => {
    const timed = list.filter(
      (task) =>
        Math.round(Number(task.difficulty)) === level && Number(task.completion_seconds) > 0,
    );
    if (!timed.length) return null;
    return timed.reduce((sum, task) => sum + Number(task.completion_seconds), 0) / timed.length;
  };

  return [1, 2, 3, 4, 5].map((level) => {
    const holding = holdingOf(now, level);
    const was = holdingOf(before, level);
    const seconds = paceOf(now, level);
    const secondsWas = paceOf(before, level);
    return {
      level,
      label: DIFFICULTY_WORDS[level - 1] ?? `${level}`,
      done: now.filter((task) => Math.round(Number(task.difficulty)) === level).length,
      holding,
      delta: holding !== null && was !== null ? Math.round(holding - was) : null,
      seconds,
      secondsDelta:
        seconds !== null && secondsWas !== null ? Math.round(seconds - secondsWas) : null,
    };
  });
}

// --------------------------------------------------------------------------
// The counted reasons that replace a mistake taxonomy
// --------------------------------------------------------------------------

/**
 * One reason, counted.
 *
 * The twelve words are a closed vocabulary for exactly this — see the note in
 * utils/ratings. A free-text box would collect twelve spellings of "I got
 * distracted" and produce twelve findings of one task each.
 */
export interface Driver {
  key: string;
  label: string;
  phrase: string;
  side: ReasonSide;
  count: number;
  /** Share of the reasons given on this side, 0-100. */
  share: number;
}

function driversOf(tasks: AnalyticsTask[], side: ReasonSide): Driver[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const found = reasonOf(task.reason);
    if (!found || found.side !== side) continue;
    counts.set(task.reason!, (counts.get(task.reason!) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  if (!total) return [];

  return [...counts.entries()]
    .map(([key, count]) => {
      const found = reasonOf(key)!;
      return {
        key,
        label: found.reason.label,
        phrase: found.reason.phrase,
        side,
        count,
        share: Math.round((count / total) * 100),
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// --------------------------------------------------------------------------
// What has been done lately
// --------------------------------------------------------------------------

export interface Recent {
  id: string;
  title: string;
  on: string;
  /** difficulty x execution out of 25, or null when it was not rated on both. */
  quality: number | null;
  seconds: number | null;
  /** The one-word reading of the execution star. */
  verdict: 'went well' | 'mixed' | 'struggled' | 'not rated';
}

function verdictOf(task: AnalyticsTask): Recent['verdict'] {
  const execution = Number(task.execution);
  if (!Number.isFinite(execution) || execution < 1) return 'not rated';
  if (execution >= 4) return 'went well';
  if (execution >= 3) return 'mixed';
  return 'struggled';
}

/**
 * How the last stretch of rated work went, oldest first.
 *
 * Quality as a percentage of the 25 it is scored out of, so the row of
 * readings is on the same scale as everything else on the page.
 */
export interface Run {
  readings: Array<{ id: string; on: string; percent: number }>;
  /** The second half against the first, in percentage points. */
  trend: number | null;
}

function runOf(done: AnalyticsTask[], most: number): Run {
  const rated = done
    .map((task) => ({ task, quality: qualityOf(task) }))
    .filter((entry): entry is { task: AnalyticsTask; quality: number } => entry.quality !== null)
    .slice(-most);

  const readings = rated.map(({ task, quality }) => ({
    id: task.id,
    on: dayOf(task.completed_at),
    percent: Math.round((quality / 25) * 100),
  }));

  // Halves rather than a fitted line: with ten readings a regression is a
  // more precise answer to a question this thin cannot support, and the two
  // means are something a reader can check by looking at the row.
  if (readings.length < 4) return { readings, trend: null };
  const half = Math.floor(readings.length / 2);
  const mean = (list: typeof readings) =>
    list.reduce((sum, entry) => sum + entry.percent, 0) / list.length;
  return {
    readings,
    trend: Math.round(mean(readings.slice(half)) - mean(readings.slice(0, half))),
  };
}

// --------------------------------------------------------------------------
// What to do about it
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// The shape of it over time
// --------------------------------------------------------------------------

/**
 * The window, cut into buckets a chart can draw.
 *
 * Buckets rather than days, because the window picker spans a week to a
 * lifetime and one point per day is either eight points or seven hundred. The
 * count is held near twelve at every setting, so the chart reads the same way
 * whichever window is chosen and no setting produces a line that is really a
 * scatter or a smear.
 */
export interface Series {
  /** One per bucket, for the crosshair readout. */
  labels: string[];
  /** The sparse x-axis labels the chart prints under itself. */
  marks: string[];
  /** Tasks finished in each bucket. */
  done: number[];
  /** Mean quality in each bucket as a percentage, or null where none were rated. */
  quality: Array<number | null>;
  /** Whether there is enough here to be worth drawing. */
  any: boolean;
}

/** About this many points, at every window. */
const BUCKETS = 12;

function seriesOf(done: AnalyticsTask[], span: Span, today: string): Series {
  /* All Time has no fixed length, so the axis runs from the first thing
     finished rather than from a date arithmetic cannot produce. An account
     with one task gets a one-bucket chart, which `any` then declines to draw. */
  const days = done.map((task) => dayOf(task.completed_at)).filter(Boolean).sort();
  const from = span.from || days[0] || today;
  const to = span.to || today;

  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  const total = Math.max(1, Math.round((end - start) / 86_400_000) + 1);
  const size = Math.max(1, Math.ceil(total / BUCKETS));
  const count = Math.ceil(total / size);

  const buckets: AnalyticsTask[][] = Array.from({ length: count }, () => []);
  for (const task of done) {
    const day = dayOf(task.completed_at);
    if (!day) continue;
    const at = Math.floor(
      (new Date(`${day}T00:00:00Z`).getTime() - start) / 86_400_000 / size,
    );
    if (at >= 0 && at < count) buckets[at]!.push(task);
  }

  const labels = buckets.map((_, index) => {
    const first = shift(from, index * size);
    const last = shift(from, Math.min(total - 1, (index + 1) * size - 1));
    return size === 1 ? first : `${first} to ${last}`;
  });

  return {
    labels,
    /* Four labels across the axis rather than twelve. Twelve dates under a
       600-unit chart is a grey smear; the crosshair carries the exact one. */
    marks: buckets.map((_, index) =>
      index % Math.ceil(count / 4) === 0 ? shift(from, index * size).slice(5) : '',
    ),
    done: buckets.map((list) => list.length),
    quality: buckets.map((list) => {
      const scores = list
        .map((task) => qualityOf(task))
        .filter((score): score is number => score !== null);
      if (!scores.length) return null;
      return Math.round((scores.reduce((sum, q) => sum + q, 0) / scores.length / 25) * 100);
    }),
    // Two buckets is a line between two dots, which says less than the tiles
    // above it already do.
    any: buckets.filter((list) => list.length > 0).length >= 3,
  };
}

// --------------------------------------------------------------------------
// The goal this subject is for
// --------------------------------------------------------------------------

/**
 * A goal this subject is filed under, read as a pace rather than a percentage.
 *
 * A goal's `progress` says where it is; only the pace says whether it is going
 * to arrive, and arriving is the thing the reader actually wants to know. The
 * arithmetic is `goalPace` in utils/goalHealth — reused rather than repeated
 * because the Goals tab already states these numbers and two derivations of
 * "will this land" that disagreed would be worse than either.
 */
export interface SubjectGoal {
  id: string;
  title: string;
  /** 0-100. */
  progress: number;
  deadline: string;
  /** Units a day needed to arrive on time, and the rate it is moving at. */
  need: number | null;
  have: number | null;
  /** Days late (positive) or early (negative) it lands at the current rate. */
  drift: number | null;
  unit: string;

  // ---- The plan, read off the record --------------------------------------
  /** Where the figure stands and what it is aimed at, in the goal's own units. */
  current: number;
  target: number;
  /** False for a milestone goal — ticks, not a quantity. See Goals/numbers. */
  numeric: boolean;
  /** target − current. Null when there is no target to be short of. */
  remaining: number | null;
  /** Days to the deadline. Negative once it has passed, null with no date. */
  daysLeft: number | null;
  /** Where the current rate lands it, as an ISO day. Null if it never does. */
  lands: string | null;
  /**
   * Where the calendar says it should be, 0-100, against `progress`.
   *
   * The one figure that turns a percentage into a judgement. 40% done is fine
   * with 60% of the time left and a disaster with a week to go, and the bar
   * alone cannot say which — so the bar carries this as a mark on it.
   */
  expected: number | null;
  /** `need` / `have`. Above 1 is the factor the rate has to rise by. */
  factor: number | null;
  /** Checkpoints ticked, of the ones the goal carries. */
  stagesDone: number;
  stagesTotal: number;

  // ---- What this subject has actually put into it -------------------------
  /** Finished tasks in this subject, in this window, pointed at this goal. */
  aimed: number;
  /** Finished tasks in this subject in this window, for the share above. */
  ofFinished: number;
  /**
   * Days in the last fortnight with a finished task here pointed at it.
   *
   * A fortnight rather than the page's window, and that is not a detail. As a
   * share of a window this figure is unreadable: fifty-five days a year on one
   * goal in one subject is a lot of work and 15% of a year, so a cadence read
   * against the window would fire its lever on almost every account that
   * chose 1Y and on almost none that chose 7D — the reader's picker deciding
   * whether they get told off. A fortnight is what "lately" means regardless
   * of what the rest of the page is showing.
   */
  recentDays: number;
  /** Days since the last one. Null when there has never been one. */
  sinceWork: number | null;

  /** What to change to make it land, hardest constraint first. */
  levers: Lever[];
}

/**
 * One thing to change about how this goal is being pursued.
 *
 * Not the same object as `Advice`, and the difference is the point. Advice
 * ranks the *subject's* findings — the weak band, the commonest reason a
 * session goes badly — and the goal is one of the things it ranks. A lever is
 * about the goal itself: whether the work is pointed at it, whether it is
 * being touched, whether the rate it is getting can reach the number by the
 * date. Both carry the figure that produced them, for the reason the note on
 * `Advice` gives.
 */
export interface Lever {
  id: string;
  /** What to do, as an instruction. */
  title: string;
  /** The counted figure that says so. Never a claim without one. */
  fact: string;
  /**
   * `blocking` — nothing else matters until this changes.
   * `raise`     — it is moving, but not fast enough for the date.
   * `hold`      — it is working; the lever is not to break it.
   */
  weight: 'blocking' | 'raise' | 'hold';
}

/**
 * The stretch "lately" means, for the cadence figure.
 *
 * The same fortnight `goalHealth` measures recency and consistency over
 * (utils/goalHealth), because two parts of the app disagreeing about how long
 * ago counts as recently is how a goal reads as neglected on one page and
 * active on the other.
 */
const RECENT_DAYS = 14;

/** Days between two ISO days. Positive when `to` is later. */
function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * How much of a goal's time has gone, 0-100.
 *
 * The same arithmetic as `expected` in utils/goalHealth, in the units this
 * page prints. It is recomputed rather than imported because `goalHealth`
 * wants the account's whole task list to answer the other three signals it
 * blends, and this page has no reason to hand it one for a single ratio.
 */
function elapsedShare(goal: Goal, today: string): number | null {
  const start = dayOf(goal.start_date) || dayOf(goal.created_at);
  const end = dayOf(goal.deadline);
  if (!start || !end) return null;
  const total = daysBetween(start, end);
  if (total <= 0) return null;
  return Math.max(0, Math.min(100, (daysBetween(start, today) / total) * 100));
}

/**
 * What has to change for this goal to land, hardest constraint first.
 *
 * ## The order is a filter, not a ranking
 *
 * These are not four suggestions of equal standing. A goal with no target and
 * no date has no pace to raise; a goal nothing is pointed at cannot be made to
 * move faster by working harder at the subject around it. Each case below
 * makes the ones under it unanswerable, so the first that fires is the only
 * one worth printing at full weight and the rest follow it as context.
 *
 * ## Why the first two are about pointing rather than working
 *
 * The commonest way a goal on this page reads as failing is not that the
 * reader is doing too little. It is that the work is happening and nothing
 * says so: tasks finished in this subject with no `goal_id` on them advance
 * the subject's own figures and leave the goal at the number it was set at.
 * That is a bookkeeping failure with the same shape as a discipline failure,
 * and telling somebody to try harder when the fix is a dropdown is the worst
 * thing this panel could do.
 */
function leversFor(goal: SubjectGoal, period: string): Lever[] {
  const out: Lever[] = [];
  const per = (value: number) => (value >= 10 ? Math.round(value).toString() : value.toFixed(1));

  // ---- Is there a plan to read at all? ------------------------------------
  if (goal.target <= 0 || !goal.deadline) {
    const missing = goal.target <= 0 && !goal.deadline
      ? 'a target and a date'
      : goal.target <= 0
        ? 'a target number'
        : 'a date';
    out.push({
      id: 'terms',
      title: `Give it ${missing}`,
      fact: goal.target > 0
        ? `${per(goal.current)} of ${per(goal.target)} ${goal.unit}, but with no due date there is no pace to track.`
        : 'Without a target, the progress bar is only an estimate.',
      weight: 'blocking',
    });
  }

  // ---- Is the work pointed at it? -----------------------------------------
  if (goal.ofFinished > 0 && goal.aimed === 0) {
    out.push({
      id: 'unaimed',
      title: 'Link your tasks to this goal',
      fact: `None of the ${goal.ofFinished} ${goal.ofFinished === 1 ? 'task' : 'tasks'} you `
        + `finished here in ${period} were linked to this goal.`,
      weight: 'blocking',
    });
  } else if (goal.ofFinished >= 4 && goal.aimed / goal.ofFinished < 0.25) {
    out.push({
      id: 'thin-aim',
      title: 'Link more tasks to this goal',
      fact: `Only ${goal.aimed} of ${goal.ofFinished} tasks here in ${period} `
        + `(${Math.round((goal.aimed / goal.ofFinished) * 100)}%) were linked to it.`,
      weight: 'raise',
    });
  }

  // ---- Is it being touched? -----------------------------------------------
  if (goal.sinceWork !== null && goal.sinceWork >= 7) {
    out.push({
      id: 'quiet',
      title: 'Get back to this goal',
      fact: `No work on it in ${goal.sinceWork} days`
        + (goal.daysLeft !== null && goal.daysLeft >= 0
          ? `, with ${goal.daysLeft} days left.`
          : '.'),
      weight: 'blocking',
    });
  } else if (goal.recentDays > 0 && goal.recentDays <= 2) {
    out.push({
      id: 'cadence',
      title: 'Work on it more often',
      fact: `Only ${goal.recentDays} of the last ${RECENT_DAYS} days had work on it.`,
      weight: 'raise',
    });
  }

  // ---- Is the rate enough for the date? -----------------------------------
  if (goal.need !== null && goal.have !== null && goal.factor !== null && goal.factor > 1.05) {
    out.push({
      id: 'rate',
      title: `Speed up about ${goal.factor >= 10 ? '10×' : `${goal.factor.toFixed(1)}×`}`,
      fact: `Needs ${per(goal.need * 7)} ${goal.unit} a week to finish on time; you're doing `
        + `${per(goal.have * 7)}`
        + (goal.lands ? `. At this rate it finishes ${goal.lands}.` : '.'),
      weight: 'raise',
    });
  }

  // ---- Do the stages fit in the time left? --------------------------------
  const stagesLeft = goal.stagesTotal - goal.stagesDone;
  if (stagesLeft > 0 && goal.daysLeft !== null && goal.daysLeft > 0) {
    const each = Math.floor(goal.daysLeft / stagesLeft);
    out.push({
      id: 'stages',
      title: each >= 1
        ? `One stage every ${each} ${each === 1 ? 'day' : 'days'} from here`
        : 'More stages left than days left',
      fact: `${stagesLeft} of ${goal.stagesTotal} checkpoints left, `
        + `with ${goal.daysLeft} days to go.`,
      weight: each >= 1 ? 'raise' : 'blocking',
    });
  }

  /* Nothing to fix is a finding, and it gets said. A panel that goes blank
     when the answer is good reads as a panel that failed to load, and the
     reader learns nothing about what to keep doing. */
  if (!out.length) {
    out.push({
      id: 'hold',
      title: 'On track. Keep going',
      fact: goal.drift !== null && goal.drift < 0
        ? `At this rate it finishes ${Math.abs(goal.drift)} `
          + `${Math.abs(goal.drift) === 1 ? 'day' : 'days'} early.`
        : `${Math.round(goal.progress)}% done`
          + (goal.aimed > 0
            ? `, with ${goal.aimed} of ${goal.ofFinished} tasks here in `
              + `${period} linked to it.`
            : '.'),
      weight: 'hold',
    });
  }

  return out;
}

/**
 * The goals that name this subject, nearest deadline first.
 *
 * Read against the window's own finished tasks rather than against the goal
 * alone. A goal card on the goals page can only say how full the bar is; this
 * page knows which of the reader's work in *this subject* was pointed at it,
 * on how many days, and how recently — which is the difference between "you
 * are behind" and "here is the thing to change".
 */
function goalsFor(
  goals: Goal[],
  subjectId: string,
  today: string,
  /** Finished in this subject, in this window. */
  done: AnalyticsTask[],
  /** Finished in this subject, ever — for the recency the window cannot see. */
  everDone: AnalyticsTask[],
  span: Span,
): SubjectGoal[] {
  const at = new Date(`${today}T00:00:00`);
  const period = span.days > 0 ? `the last ${span.days} days` : 'all time';
  return goals
    .filter((goal) => {
      if (goal.status !== 'active') return false;
      // `subject_ids` is a comma-separated string, split at the call sites
      // that read it — see the note on the field in types/models.
      return String(goal.subject_ids ?? '')
        .split(',')
        .map((id) => id.trim())
        .includes(subjectId);
    })
    .map((goal) => {
      const pace = goalPace(goal, at);
      const numbers = goalNumbers(goal);
      const linked = done.filter((task) => task.goal_id === goal.id);
      /* Off every task in the subject rather than the window's, for the same
         reason recency is: a seven-day window cannot see a fortnight. */
      const since = shift(today, -(RECENT_DAYS - 1));
      const days = new Set(
        everDone
          .filter((task) => task.goal_id === goal.id && dayOf(task.completed_at) >= since)
          .map((task) => dayOf(task.completed_at))
          .filter(Boolean),
      );

      /* Recency is counted over every task in this subject, not over the
         window: a goal last touched four months ago is stale, and a
         seven-day window that simply cannot see that far back would report
         the same "never" as a goal nothing has ever been pointed at. */
      const everLast = lastDayAgainst(goal.id);
      const stages = goal.milestones ?? [];

      const remaining = numbers.target > 0 ? Math.max(0, numbers.target - numbers.current) : null;
      const factor =
        pace.need !== null && pace.have !== null && pace.have > 0 ? pace.need / pace.have : null;

      const read: SubjectGoal = {
        id: goal.id,
        title: goal.title,
        progress: goal.progress,
        deadline: goal.deadline,
        need: pace.need,
        have: pace.have,
        drift: pace.drift,
        /* `goalNumbers` knows what a counter goal counts — "XP", "Days" —
           and `goal.unit` is only set on an outcome goal, so a counter read
           through the old fallback said "units a week" about XP. */
        unit: numbers.label || goal.unit || 'units',
        current: numbers.current,
        target: numbers.target,
        numeric: numbers.numeric,
        remaining,
        daysLeft: goal.deadline ? daysBetween(today, dayOf(goal.deadline)) : null,
        lands: pace.lands,
        expected: elapsedShare(goal, today),
        factor,
        stagesDone: stages.filter((row) => row.status === 'done').length,
        stagesTotal: stages.length,
        aimed: linked.length,
        ofFinished: done.length,
        recentDays: days.size,
        sinceWork: everLast ? daysBetween(everLast, today) : null,
        levers: [],
      };
      return { ...read, levers: leversFor(read, period) };
    })
    .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));

  /** The most recent day anything in this subject was finished against a goal. */
  function lastDayAgainst(goalId: string): string {
    let last = '';
    for (const task of everDone) {
      if (task.goal_id !== goalId) continue;
      const day = dayOf(task.completed_at);
      if (day > last) last = day;
    }
    return last;
  }
}

/**
 * A recommendation, with the arithmetic that produced it attached.
 *
 * `why` is not a flourish. It is the rule the Recommendations tab is built on
 * — an instruction with a number behind it, and the number shown — and a
 * subject page that said "practise more geometry" without saying what made it
 * say so would be the horoscope this app is written against.
 */
export interface Advice {
  id: string;
  title: string;
  detail: string;
  why: string;
  weight: 'first' | 'second' | 'upkeep';
}

/**
 * What to do next, led by what the subject is *for*.
 *
 * ## The goal comes first, and that is the whole ordering
 *
 * A page that ranks advice by which internal measure is lowest is ranking by
 * its own arithmetic rather than by what the reader is trying to do. "Quality
 * is the measure holding the grade down" is a true sentence that answers a
 * question nobody asked; "your goal lands eleven days late at this rate" is
 * the same record read against the thing the reader actually said they wanted.
 * So an active goal on this subject leads, every time, and the measures are
 * read as *why* it is or is not going to land rather than as findings of their
 * own.
 *
 * With no goal set, the order falls back to what the record can still say:
 * the widest gap between difficulty bands, then the commonest thing that makes
 * a session go badly, then — once — the weakest of the four rates.
 *
 * ## Only one rate is ever named, and only if it is the lowest
 *
 * This used to push one card per rate under 60, each captioned "the lowest of
 * the four". Two of them could be on screen at once, both claiming to be the
 * lowest, which is not a wording problem: it is the page contradicting itself
 * in the panel whose entire job is to be trusted. There is one lowest measure,
 * it is named once, and the card says how far below the next one it actually
 * sits — which is the figure that decides whether it is worth acting on.
 */
function adviceFrom(
  bands: Band[],
  struggles: Driver[],
  rates: Rate[],
  goals: SubjectGoal[],
): Advice[] {
  const out: Advice[] = [];

  // The weakest band that has enough behind it to be a finding rather than a
  // bad afternoon. Three is not a sample; it is the floor at which naming
  // something stops being noise.
  const measured = bands.filter((band) => band.holding !== null && band.done >= 3);
  const weakest = [...measured].sort((a, b) => a.holding! - b.holding!)[0];
  const strongest = [...measured].sort((a, b) => b.holding! - a.holding!)[0];
  const top = struggles[0];

  // ---- What the goal needs ------------------------------------------------
  /* Three cases, not two, and the third is the one worth spelling out. A goal
     with no target number or no date has no projection, and "on course" is a
     claim — the same kind of claim as a rate of zero standing in for a rate
     nobody measured. So an unprojectable goal says it is unprojectable and
     says what would fix it, rather than being quietly sorted into the good
     pile because `drift` failed to be a positive number. */
  for (const goal of goals.slice(0, 2)) {
    const rate =
      goal.need !== null && goal.have !== null
        ? `It needs ${goal.need.toFixed(1)} ${goal.unit} a day to arrive on time and has been `
          + `moving at ${goal.have.toFixed(1)}.`
        : `It is ${Math.round(goal.progress)}% of the way there.`;
    const due = `Goal due ${goal.deadline || 'with no date set'}, ${Math.round(goal.progress)}% done`;

    if (goal.drift === null) {
      out.push({
        id: `goal-${goal.id}`,
        title: `Give "${goal.title}" a target and a date`,
        detail: 'Both are needed to track pace.',
        why: `${due}.`,
        weight: 'second',
      });
    } else if (goal.drift > 0) {
      out.push({
        id: `goal-${goal.id}`,
        title: `Work "${goal.title}": ${goal.drift} ${goal.drift === 1 ? 'day' : 'days'} late`,
        detail: rate,
        why: `${due}, projected ${goal.drift} days late.`,
        weight: 'first',
      });
    } else {
      out.push({
        id: `goal-${goal.id}`,
        title: `"${goal.title}" is on track`,
        detail: rate,
        why: `${due}, on track to finish on time.`,
        weight: 'upkeep',
      });
    }
  }

  // ---- Where the work should go inside the subject ------------------------
  if (weakest && strongest && weakest.level !== strongest.level) {
    out.push({
      id: 'weakest-band',
      title: `Drill ${weakest.label.toLowerCase()} work`,
      detail:
        `${Math.round(weakest.holding!)}% here, compared with ${Math.round(strongest.holding!)}% on `
        + `${strongest.label.toLowerCase()} work.`,
      why:
        `${weakest.done} ${weakest.done === 1 ? 'task' : 'tasks'} at ${weakest.label.toLowerCase()}, `
        + `average execution ${(weakest.holding! / 20).toFixed(1)}/5.`,
      weight: goals.length ? 'second' : 'first',
    });
  }

  if (top) {
    out.push({
      id: `reason-${top.key}`,
      title: `Fix "${top.label.toLowerCase()}" before the next session`,
      detail:
        `The cause of ${top.share}% of your bad sessions here.`,
      why: `${top.count} of the rated tasks you struggled with ${top.phrase}.`,
      weight: 'second',
    });
  }

  // ---- The one measure worth naming --------------------------------------
  /* Sorted, then the first — not filtered by a threshold and looped. There is
     one lowest measure. The gap to the next one is what says whether it is a
     real weak spot or just the low end of four numbers that are all fine, and
     a measure that is lowest by two points is not worth a card. */
  const ranked = [...rates].filter((entry) => entry.known).sort((a, b) => a.now - b.now);
  const lowest = ranked[0];
  const next = ranked[1];
  if (lowest && lowest.now < 60 && (!next || next.now - lowest.now >= 5)) {
    out.push({
      id: `rate-${lowest.key}`,
      title: `${lowest.label} is dragging the grade`,
      detail:
        `${Math.round(lowest.now)}%`
        + (next
          ? `, ${Math.round(next.now - lowest.now)} points below ${next.label.toLowerCase()}.`
          : '.'),
      why: lowest.note,
      weight: 'upkeep',
    });
  }

  return out;
}

// --------------------------------------------------------------------------
// The whole page
// --------------------------------------------------------------------------

/**
 * The bold line at the top of the page.
 *
 * The page used to open with four tiles and a paragraph, and a reader had to
 * assemble the verdict from them. This states it: the grade, and one short
 * sentence naming the single thing most responsible for it. Everything under
 * it is the working.
 *
 * `verdict` is deliberately short — it is set in large bold type, and a
 * sentence that wraps to three lines there stops being a headline and becomes
 * the paragraph it replaced.
 */
export interface Headline {
  /** "B", or null when nothing in the window was measurable. */
  grade: Grade | null;
  score: number | null;
  /** One short sentence. Never more than a line at the size it is set. */
  verdict: string;
}

export interface SubjectModel {
  /** Whether there is enough here to say anything at all. */
  any: boolean;
  span: Span;
  headline: Headline;
  series: Series;

  done: AnalyticsTask[];
  open: number;

  /** The four rates, and the score and letter they average to. */
  rates: Rate[];
  score: number | null;
  grade: Grade | null;
  howScored: string;

  /** Percentage change against the window before, per thing counted. */
  growth: Array<{ key: string; label: string; change: number | null; note: string }>;

  invested: number;
  streak: number;
  finished: number;
  finishedBefore: number;

  bands: Band[];
  weakest: Band | null;
  strongest: Band | null;

  struggles: Driver[];
  wentWell: Driver[];

  run: Run;
  recent: Recent[];
  goalAimed: number | null;
  goals: SubjectGoal[];

  advice: Advice[];
  insight: string | null;
}

/** How many finished tasks the page will draw a run of. */
const RUN_LENGTH = 10;

/** How many rows the recent-work list prints. */
const RECENT_ROWS = 6;

/**
 * The whole page, from the account's tasks.
 *
 * `today` is passed rather than read so the arithmetic is a pure function of
 * its inputs — a model that reached for the clock could not be tested, and
 * every window on this page is measured back from it.
 */
export function subjectModel(
  all: AnalyticsTask[],
  subjectId: string,
  key: WindowKey,
  today: string,
  /** The account's goals, for the advice that leads the page. */
  goals: Goal[] = [],
): SubjectModel {
  const mine = all.filter((task) => task.subject === subjectId);
  const span = spanFor(key, today);

  const finishedIn = (from: string, to: string) =>
    mine.filter(
      (task) => task.status === 'done' && within(dayOf(task.completed_at), from, to),
    );

  const done = finishedIn(span.from, span.to);
  const before = span.previousFrom ? finishedIn(span.previousFrom, span.previousTo) : [];
  const open = mine.filter((task) => task.status !== 'done').length;

  // ---- The four rates, and the letter they come to ------------------------
  const rates: Rate[] = [
    rate(
      'quality',
      'Quality',
      'Difficulty × execution on rated tasks, out of 25.',
      qualityRate(done),
      qualityRate(before),
    ),
    rate(
      'consistency',
      'Consistency',
      'Share of days you did work in this subject.',
      consistencyRate(done, span.days || new Set(mine.map((t) => dayOf(t.completed_at))).size),
      span.previousFrom ? consistencyRate(before, span.days) : null,
    ),
    rate(
      'timeliness',
      'Timeliness',
      'Share of dated tasks finished on time.',
      timelinessRate(done),
      timelinessRate(before),
    ),
    rate(
      'follow-through',
      'Follow-through',
      'Share of all tasks in this subject that are finished.',
      followThroughRate(mine.filter((task) => task.status === 'done').length, open),
      null,
    ),
  ];

  const measured = rates.filter((entry) => entry.known);
  const score = measured.length
    ? Math.round(measured.reduce((sum, entry) => sum + entry.now, 0) / measured.length)
    : null;

  const howScored = measured.length
    ? `${measured.map((entry) => `${entry.label} ${Math.round(entry.now)}`).join(', ')} — `
      + `the mean of ${measured.length === 1 ? 'that one' : `those ${measured.length}`}, `
      + `${score} out of 100.`
    : '';

  // ---- Change against the window before -----------------------------------
  const change = (now: number, was: number): number | null =>
    was > 0 ? Math.round(((now - was) / was) * 100) : null;

  /** The volume change, named because the headline reads it too. */
  const finishedChange = change(done.length, before.length);

  const seconds = (list: AnalyticsTask[]) =>
    list.reduce((sum, task) => sum + Math.max(0, Number(task.completion_seconds) || 0), 0);

  const activeDays = (list: AnalyticsTask[]) =>
    new Set(list.map((task) => dayOf(task.completed_at)).filter(Boolean)).size;

  const meanPace = (list: AnalyticsTask[]) => {
    const timed = list.filter((task) => Number(task.completion_seconds) > 0);
    return timed.length ? seconds(timed) / timed.length : 0;
  };

  const growth = [
    {
      key: 'volume',
      label: 'Volume',
      change: finishedChange,
      note: `${done.length} finished against ${before.length} the window before.`,
    },
    {
      key: 'time',
      label: 'Time on it',
      change: change(seconds(done), seconds(before)),
      note: 'Logged time on the tasks you finished.',
    },
    {
      key: 'turning-up',
      label: 'Turning up',
      change: change(activeDays(done), activeDays(before)),
      note: `${activeDays(done)} days with work in them against ${activeDays(before)}.`,
    },
    {
      key: 'pace',
      /* Inverted on purpose, and the label says so. A mean solve time falling
         is an improvement, and a bare "-18%" beside three figures where up is
         good would be read as the one thing going wrong. */
      label: 'Pace (faster is up)',
      change: (() => {
        const now = meanPace(done);
        const was = meanPace(before);
        return was > 0 && now > 0 ? Math.round(((was - now) / was) * 100) : null;
      })(),
      note: 'Mean time a finished task took, against the window before.',
    },
  ];

  // ---- The streak, counted back from today --------------------------------
  const activeSet = new Set(
    mine
      .filter((task) => task.status === 'done')
      .map((task) => dayOf(task.completed_at))
      .filter(Boolean),
  );
  /* From today, or from yesterday when today has nothing in it yet. A streak
     that broke the moment the clock passed midnight would report every reader
     as having lost it every morning. */
  let cursor = activeSet.has(today) ? today : shift(today, -1);
  let streak = 0;
  while (activeSet.has(cursor)) {
    streak += 1;
    cursor = shift(cursor, -1);
  }

  // ---- The rest -----------------------------------------------------------
  const bands = bandsOf(done, before);
  const rankable = bands.filter((band) => band.holding !== null && band.done >= 3);
  const weakest = [...rankable].sort((a, b) => a.holding! - b.holding!)[0] ?? null;
  const strongest = [...rankable].sort((a, b) => b.holding! - a.holding!)[0] ?? null;

  const struggles = driversOf(done, 'struggle');
  const wentWell = driversOf(done, 'went-well');

  const byRecency = [...done].sort((a, b) =>
    dayOf(a.completed_at).localeCompare(dayOf(b.completed_at)),
  );

  const recent: Recent[] = byRecency
    .slice(-RECENT_ROWS)
    .reverse()
    .map((task) => ({
      id: task.id,
      title: task.title,
      on: dayOf(task.completed_at),
      quality: qualityOf(task),
      seconds: Number(task.completion_seconds) > 0 ? Number(task.completion_seconds) : null,
      verdict: verdictOf(task),
    }));

  const goalAimed = done.length
    ? Math.round((done.filter((task) => task.goal_id).length / done.length) * 100)
    : null;

  /* Every finished task in this subject, not just the window's, because
     "nothing has been pointed at this in 40 days" is exactly the reading a
     seven-day window is blind to — and it is the one worth having. */
  const everDone = mine.filter((task) => task.status === 'done' && task.completed_at);
  const subjectGoals = goalsFor(goals, subjectId, today, done, everDone, span);
  const advice = adviceFrom(bands, struggles, rates, subjectGoals);

  /* The one sentence, in priority order: a goal that is going to miss, then
     the gap between bands, then the weakest rate, then the volume. Whichever
     fires first is the thing most responsible for the grade — the same
     ordering the recommendations use, said in one line. */
  const behind = subjectGoals.find((goal) => goal.drift !== null && goal.drift > 0);
  const lowest = [...rates].filter((entry) => entry.known).sort((a, b) => a.now - b.now)[0];
  const verdict = (() => {
    if (!done.length) return 'Nothing finished here in this window.';
    if (behind) {
      return `On track for everything except "${behind.title}", which is ${behind.drift} days late.`;
    }
    if (weakest && strongest && weakest.level !== strongest.level
        && strongest.holding! - weakest.holding! >= 15) {
      return `${strongest.label} work is solid. ${weakest.label} work is what is holding you back.`;
    }
    if (lowest && lowest.now < 60) return `${lowest.label} is the weak measure here.`;
    if (finishedChange !== null && finishedChange > 15) return 'Speeding up, and holding quality.';
    if (finishedChange !== null && finishedChange < -15) return 'Slowing down against last period.';
    return 'Steady. Nothing here needs fixing.';
  })();

  /* The one sentence the page is for, and it is only written when the record
     supports it. A "key insight" generated whether or not there is one is the
     line that teaches a reader to skip the box it lives in. */
  const insight =
    weakest && strongest && weakest.level !== strongest.level && strongest.holding! - weakest.holding! >= 15
      ? `Your ${strongest.label.toLowerCase()} work scores `
        + `${Math.round(strongest.holding!)}%, but ${weakest.label.toLowerCase()} work scores `
        + `${Math.round(weakest.holding!)}%. Improving that raises the whole subject.`
      : null;

  return {
    any: mine.length > 0,
    span,
    headline: { grade: score === null ? null : gradeFor(score), score, verdict },
    series: seriesOf(done, span, today),
    done,
    open,
    rates,
    score,
    grade: score === null ? null : gradeFor(score),
    howScored,
    growth,
    invested: seconds(done),
    streak,
    finished: done.length,
    finishedBefore: before.length,
    bands,
    weakest,
    strongest,
    struggles,
    wentWell,
    run: runOf(byRecency, RUN_LENGTH),
    recent,
    goalAimed,
    goals: subjectGoals,
    advice,
    insight,
  };
}

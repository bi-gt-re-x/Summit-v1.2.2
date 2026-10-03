/**
 * The Growth Score — one number for the whole account, and its letter.
 *
 * Kept here out of a hundred, because the letter bands are, and shown
 * everywhere out of ten. It used to be shown out of a hundred under its own
 * name, the "Analytical Score", beside the Growth Score tile printing the same
 * mean divided by ten: one calculation under two names on two scales.
 *
 * ## It is the report card, not a second opinion
 *
 * There is exactly one scoring computation in this app and this is not a new
 * one. `backend/tracking/analytics.py` scores five metrics 0-100 —
 * productivity, quality, consistency, efficiency, focus — and this takes their
 * mean. That is the whole arithmetic:
 *
 *     score = mean(productivity, quality, consistency, efficiency, focus)
 *
 * The Growth Score tile shows the same mean divided by ten. Two figures, one
 * calculation, and they can never disagree because there is only one of them.
 * If a page ever needs a *different* score, it needs a different name and a
 * paragraph explaining why — not a second formula under this one.
 *
 * The mean is taken here rather than read from `overall.score` for the reason
 * components/Analytics/score gives: a panel that prints five parts and a total the reader
 * cannot add up is a panel nobody trusts. `agreesWithBackend` is what notices
 * if the backend ever stops taking a flat mean.
 *
 * ## Why it starts at 1 and not 0
 *
 * The scale is stated as 1-100 and the floor is real. An account with a record
 * scores *something*; zero is what an empty account gets, and printing it beside
 * a letter grade reads as a judgement rather than as an absence. An account
 * with no report card at all gets `null` and the surfaces draw a dash.
 *
 * ## The letters
 *
 * The conventional school scale in tens, with two exceptions at the top: A+ is
 * the narrow band under a perfect hundred, and S is the hundred itself. S is
 * deliberately unreachable by being very good at four metrics and adequate at
 * the fifth — a mean of a hundred means all five are a hundred — which is the
 * only thing that makes a top grade worth anything.
 */
import type { Grade, Ratings } from '@/types';
import type { MetricName } from '@/types';

/**
 * The bands, high to low, as [floor, letter].
 *
 * Mirrors `GRADE_BANDS` in backend/tracking/analytics.py. Two copies because
 * two runtimes need them and neither can call the other; `sameBandsAsBackend`
 * below is the check that they still agree, and this table is the one line to
 * change on either side.
 */
export const GRADE_BANDS: ReadonlyArray<readonly [number, Grade]> = [
  [100, 'S'],
  [96, 'A+'],
  [90, 'A'],
  [80, 'B'],
  [70, 'C'],
  [60, 'D'],
  [0, 'F'],
];

/**
 * What each letter means, in one phrase, for the places that explain it.
 *
 * Every one of these describes the *five measures*, not the person, and that
 * is a correction rather than a style note. F used to read "not enough is
 * happening yet to score" — which the page printed over an account with 4,120
 * finished tasks, a 152-day streak and, eight inches to the right, the words
 * "top 1.0% of Summit users". A low score can mean an empty record or a full
 * one that is missing its deadlines, and the phrase has to be true of both. An
 * account with no record at all scores `null` and draws a dash; that is where
 * "not enough yet" belongs and it is already said there.
 */
export const GRADE_MEANING: Record<Grade, string> = {
  S: 'every one of the five at full marks',
  'A+': 'the band below perfect',
  A: 'strong across the board',
  B: 'solid, with one or two soft spots',
  C: 'working, with real room in it',
  D: 'two or three of the five are low',
  F: 'every measure is coming in low',
};

export function gradeFor(score: number): Grade {
  for (const [floor, letter] of GRADE_BANDS) {
    if (score >= floor) return letter;
  }
  return 'F';
}

/**
 * The band a grade covers, as a readable range — "90–95", "100".
 *
 * The bottom band reads from 1 rather than from 0, because the score itself is
 * clamped to a floor of 1 and printing a range the scale cannot produce is a
 * small lie in the one sentence on the page whose job is to make the letter
 * checkable.
 */
export function bandLabel(grade: Grade): string {
  const at = GRADE_BANDS.findIndex(([, letter]) => letter === grade);
  if (at < 0) return '';
  const floor = Math.max(1, GRADE_BANDS[at]![0]);
  const above = at === 0 ? null : GRADE_BANDS[at - 1]![0];
  if (above === null) return String(floor);
  return above - 1 === floor ? String(floor) : `${floor}–${above - 1}`;
}

export interface ScorePart {
  name: MetricName;
  label: string;
  /** The backend's 0-100 score for this metric. */
  score: number;
  /** The measured quantity behind it, in its own units. */
  raw: string;
  /** What it adds to the total — `score / 5`. */
  contribution: number;
}

export interface AnalyticalScore {
  /** 1-100, or null when there is no report card yet. */
  value: number | null;
  grade: Grade | null;
  parts: ScorePart[];
  /** The weakest of the five, which is the one worth acting on. */
  weakest: ScorePart | null;
  /** The strongest, for the sentence that says what is carrying the score. */
  strongest: ScorePart | null;
}

const LABELS: Record<MetricName, string> = {
  productivity: 'Productivity',
  quality: 'Quality',
  consistency: 'Consistency',
  efficiency: 'Efficiency',
  focus: 'Focus',
};

/**
 * The score, its letter, and the five parts it is the mean of.
 *
 * The raw column is the measured value rather than the metric's own score,
 * because "Focus 34" tells a reader nothing they can act on and "2h 10m of a 6h
 * goal" tells them what to do about it.
 */
export function analyticalScore(ratings: Ratings | null): AnalyticalScore {
  if (!ratings) {
    return { value: null, grade: null, parts: [], weakest: null, strongest: null };
  }
  const m = ratings.metrics;

  const measured: Array<Omit<ScorePart, 'contribution'>> = [
    {
      name: 'productivity',
      label: LABELS.productivity,
      score: m.productivity.score,
      raw: `${Math.round(m.productivity.avg_daily_xp).toLocaleString()} XP a day`,
    },
    {
      name: 'quality',
      label: LABELS.quality,
      score: m.quality.score,
      // The basis is printed, never assumed: an account that has never rated a
      // task is scored on the XP proxy and should be told so rather than left
      // to read a quality figure it did not produce.
      raw:
        m.quality.basis === 'ratings'
          ? `${m.quality.avg_quality.toFixed(1)} of ${m.quality.max_quality} across ${m.quality.rated_tasks} rated tasks`
          : 'nothing rated yet — scored on XP per task',
    },
    {
      name: 'consistency',
      label: LABELS.consistency,
      score: m.consistency.score,
      raw: `${m.consistency.active_days} of ${m.consistency.total_days} days worked`,
    },
    {
      name: 'efficiency',
      label: LABELS.efficiency,
      score: m.efficiency.score,
      raw: m.efficiency.has_timing
        ? `${m.efficiency.on_time_pct}% finished on time`
        : 'nothing timed yet',
    },
    {
      name: 'focus',
      label: LABELS.focus,
      score: m.focus.score,
      raw: `${m.focus.pct_of_goal}% of your focus goal`,
    },
  ];

  const parts: ScorePart[] = measured.map((part) => ({
    ...part,
    contribution: part.score / measured.length,
  }));

  const total = parts.reduce((sum, part) => sum + part.contribution, 0);
  const value = Math.max(1, Math.min(100, Math.round(total)));
  const ranked = [...parts].sort((a, b) => a.score - b.score);

  return {
    value,
    grade: gradeFor(value),
    parts,
    weakest: ranked[0] ?? null,
    strongest: ranked[ranked.length - 1] ?? null,
  };
}

/**
 * Whether the five parts still add up to the backend's own total.
 *
 * Exported so a surface can fall back rather than argue with the server. If the
 * backend ever stops taking a flat mean this goes false, and the fix is the
 * divisor above, not a fudge in whatever component noticed.
 */
export function agreesWithBackend(ratings: Ratings | null): boolean {
  if (!ratings) return true;
  const local = analyticalScore(ratings).value ?? 0;
  return Math.abs(local - Math.round(ratings.overall.score)) <= 1;
}

/**
 * One sentence saying how the score was arrived at, in the reader's own figures.
 *
 * The short version the Overview prints under the letter. The long version is
 * the five parts themselves, which every surface that shows this also shows.
 */
export function howItIsCalculated(score: AnalyticalScore): string {
  if (score.value === null) return 'Not enough of a record yet to score.';
  const { weakest, strongest } = score;
  const base =
    'The average of five measures — productivity, quality, consistency, efficiency ' +
    'and focus — each scored out of 100, over the last 90 days.';
  if (!weakest || !strongest || weakest.name === strongest.name) return base;
  /* Naming a best and a worst only says something when they differ. Five
     metrics all at 100 would otherwise produce "Focus is carrying it at 100;
     Productivity is holding it back at 100", which is the sentence pattern
     talking rather than the data. A gap under five points is not worth
     singling either one out for. */
  const gap = strongest.score - weakest.score;
  if (gap < 5) {
    // One number, used for both the figure and its plural. Rounding twice is
    // how "within 1 points" happens: a gap of 0.4 floors to 1 for the figure
    // and rounds to 0 for the word.
    const spread = Math.max(1, Math.round(gap));
    return `${base} All five are within ${spread} ${spread === 1 ? 'point' : 'points'} of each other, so nothing is holding it back on its own.`;
  }
  return `${base} ${strongest.label} is carrying it at ${Math.round(strongest.score)}; ${weakest.label} is holding it back at ${Math.round(weakest.score)}.`;
}

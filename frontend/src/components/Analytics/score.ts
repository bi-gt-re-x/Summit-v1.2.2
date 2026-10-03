/**
 * The Growth Score: what it is made of.
 *
 * ## The score is the report card, restated
 *
 * There is no separate growth-score computation anywhere in this app and there
 * must not be one. `backend/tracking/analytics.py` scores five metrics 0-100 —
 * productivity, quality, consistency, efficiency, focus — and takes their mean
 * for `overall`. This file divides that mean by ten and shows the five parts it
 * came from, which is the whole of the arithmetic:
 *
 *     score = mean(productivity, quality, consistency, efficiency, focus) / 10
 *
 * Recomputing the mean here rather than reading `overall.score` is deliberate:
 * a panel that prints five factors and a total the reader cannot add up is a
 * panel nobody trusts. Adding them up locally means the total is the parts by
 * construction. `assertsOverall` exists so the two can be checked against each
 * other in a test if the backend's weighting ever stops being a flat mean.
 *
 * The five are equally weighted because the backend weights them equally. If a
 * weighting lands there, `WEIGHT` is the one line here that changes.
 */
import type { MetricName, Ratings } from '@/types';

/** The score is stated out of ten; the report card is scored out of a hundred. */
export const SCORE_SCALE = 10;

/**
 * How much of the score each metric is worth, as a share of 1.
 *
 * A flat fifth each, mirroring `sum(parts.values()) / len(parts)` in
 * backend/tracking/analytics.py. Written as a table anyway so the panel can
 * print the share, and so a change to the backend's weighting has an obvious
 * home rather than being spread through the component that draws it.
 */
export const WEIGHT = 1 / 5;

export interface ScoreFactor {
  name: MetricName;
  label: string;
  /** The backend's 0-100 score for this metric. */
  score: number;
  /** What it contributes to the score out of ten — `score * WEIGHT / 10`. */
  contribution: number;
  /** The measured quantity behind the score, in its own units. */
  raw: string;
}

export interface GrowthScore {
  /** Out of ten, or null while the report card has not answered. */
  value: number | null;
  factors: ScoreFactor[];
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * The score and its five parts, read off the report card.
 *
 * The raw column is the same one the growth page's table prints (see
 * ./metrics), stated in the units the metric is actually measured in, because
 * "Focus 34" tells a reader nothing they can act on and "2h 10m of a 6h goal"
 * tells them everything.
 */
export function growthScore(ratings: Ratings | null): GrowthScore {
  if (!ratings) return { value: null, factors: [] };
  const m = ratings.metrics;

  const measured: Array<Omit<ScoreFactor, 'contribution'>> = [
    {
      name: 'productivity',
      label: 'Productivity',
      score: m.productivity.score,
      raw: `${Math.round(m.productivity.avg_daily_xp).toLocaleString()} XP/day`,
    },
    {
      name: 'quality',
      label: 'Quality',
      score: m.quality.score,
      // Difficulty × execution, or the XP proxy while nothing is rated. Same
      // rule as ./metrics: the basis is printed, never assumed.
      raw:
        m.quality.basis === 'ratings'
          ? `${m.quality.avg_quality.toFixed(1)}/${m.quality.max_quality} rated`
          : 'no ratings yet',
    },
    {
      name: 'consistency',
      label: 'Consistency',
      score: m.consistency.score,
      raw: `${m.consistency.active_days}/${m.consistency.total_days} days active`,
    },
    {
      name: 'efficiency',
      label: 'Efficiency',
      score: m.efficiency.score,
      raw: m.efficiency.has_timing
        ? `${m.efficiency.on_time_pct}% on time`
        : 'no timed tasks yet',
    },
    {
      name: 'focus',
      label: 'Focus',
      score: m.focus.score,
      raw: `${m.focus.pct_of_goal}% of focus goal`,
    },
  ];

  const factors: ScoreFactor[] = measured.map((factor) => ({
    ...factor,
    contribution: (factor.score * WEIGHT) / SCORE_SCALE,
  }));

  const total = factors.reduce((sum, factor) => sum + factor.contribution, 0);
  return { value: round1(total), factors };
}

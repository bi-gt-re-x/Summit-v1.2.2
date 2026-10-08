/**
 * Growth: the day-by-day series, the report card, and the XP ledger rolled up.
 *
 * Not in the original services list because the growth page had no service of
 * its own — it called the endpoints directly. It has one now for the same
 * reason the others do: the shapes are fiddly and worth naming once.
 *
 * `ratings()` is not a pure read. Asking for the report card files a dated
 * snapshot per metric into the database, which is how the grades build up a
 * history — so it is worth calling when a page opens and not on a timer.
 *
 * Backend: backend/api/growth.py, backend/tracking/analytics.py.
 */
import { get, post } from './api';
import type { ApiResult, GrowthDay, Ratings } from '@/types';

export interface GrowthSeries {
  created_date: string;
  days_since_creation: number;
  /** One row per day, including days with nothing on them. */
  growth_data: GrowthDay[];
}

/**
 * The day-by-day series.
 *
 * `days` is how many of the most recent to ask for, and **0 means all of
 * them**. The growth page asks for all and slices client-side: it lets the
 * reader choose 7, 30, 90 or the whole account, and every figure on it that
 * says "vs the previous 30 days" needs the 30 before the 30 on screen. One
 * request that answers every range beats a request per range, and the rows are
 * small.
 */
export function series(
  days = 30,
): Promise<ApiResult<GrowthSeries>> {
  return get<GrowthSeries>('/api/get_growth_data', { days });
}

/**
 * The five-metric graded report card, with today's grades filed as a dated
 * snapshot — which is why it is a POST. `GET` on the same path reads the card
 * without filing anything; no GET writes.
 */
export function ratings(): Promise<ApiResult<Ratings>> {
  return post<Ratings>('/api/get_growth_ratings');
}

export interface XpSnapshot {
  user: {
    username: string;
    created_date: string;
    days_active: number;
  };
  stats: {
    level: number;
    /** XP within the current level. */
    current_xp: number;
    total_xp: number;
    xp_required: number;
    tasks_completed: number;
  };
  /** Every day since the account was created, not just the last 30. */
  growth_data: Array<
    Pick<
      GrowthDay,
      'date' | 'day_number' | 'xp_earned' | 'tasks_completed' | 'cumulative_xp' | 'avg_task_xp'
    >
  >;
  summary: {
    total_days: number;
    total_xp: number;
    average_xp_per_day: number;
    most_productive_day: GrowthDay | null;
  };
}

export function xpSnapshot(): Promise<ApiResult<XpSnapshot>> {
  return get<XpSnapshot>('/api/get_xp_data');
}

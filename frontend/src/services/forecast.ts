/**
 * Goal forecast: when each dated goal finishes at the current pace.
 *
 * Backend: backend/api/forecast.py, over backend/tracking/forecast.py. The
 * server does all the math and writes the line; the page only draws it. The
 * book call works the count out again on the server.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';
import type { Booked } from './next';

export type ForecastState = 'on_track' | 'behind' | 'stalled' | 'done' | 'missing';

export type ForecastMissing = 'no_subject' | 'no_steps' | 'too_new' | 'nothing_done' | 'no_sessions';

export interface GoalForecast {
  goal_id: string;
  title: string;
  /** ISO day. */
  deadline: string;
  days_left: number;
  state: ForecastState;
  /** What's missing, when the state is 'missing'. */
  missing: ForecastMissing | null;
  /** The sentence to show, written by the server. */
  line: string;
  /** Steps done and the pace, when known. */
  facts: string | null;
  per_week: number | null;
  need_per_week: number | null;
  more_per_week: number | null;
  /** ISO day it finishes at this pace, when there's a pace. */
  finish: string | null;
  /** Sessions to book this week. 0 means no button. */
  to_book: number;
  booked_this_week: number;
}

export function goalForecast(): Promise<ApiResult<{ goals: GoalForecast[] }>> {
  return get<{ goals: GoalForecast[] }>('/api/goal_forecast');
}

/** Book the sessions this week is short of for one goal. */
export function bookForecast(goalId: string): Promise<ApiResult<Booked>> {
  return post<Booked>('/api/goal_forecast/book', { goal_id: goalId });
}

/**
 * The weekly review and the tests it bets on.
 *
 * Backend: backend/api/experiments.py, rules in backend/tracking/experiments.py and
 * backend/tracking/weekly.py.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';

export type Tone = 'good' | 'bad' | 'flat';
export type Verdict = 'better' | 'worse' | 'same' | 'leaning_better' | 'leaning_worse' | 'thin' | 'early';

export interface Bars {
  type: 'compare';
  max: number;
  unit: string;
  rows: Array<{ label: string; value: number; text?: string; n?: number }>;
}

/** A test, running or done, as the page draws it. */
export interface Experiment {
  id: string;
  kind: string;
  title: string;
  why: string;
  how: string;
  scope: string;
  phase: 'running' | 'ready' | 'decided' | 'stopped';
  days_done: number;
  days_total: number;
  started_on: string;
  ends_on: string;
  ends_label: string;
  measure: string;
  design: 'split' | 'before_after';
  verdict: Verdict;
  tone: Tone;
  headline: string;
  tip: string;
  chart: Bars | null;
  adherence: { done: number; of: number } | null;
  evidence: string | null;
  compared_with: string;
  sessions: number;
  kept: boolean | null;
}

/** A test worth running, from the reader's own record. */
export interface Proposal {
  kind: string;
  title: string;
  why: string;
  how: string;
  params: Record<string, unknown>;
  goal: string;
  subject: string;
  measure: string;
  design: 'split' | 'before_after';
  scope: string;
}

export interface ReviewLine {
  tone: Tone;
  title: string;
  detail: string;
  icon: string;
}

export interface ReviewTile {
  key: 'sessions' | 'days' | 'output' | 'goals';
  label: string;
  value: number;
  before?: number;
  of?: number;
  days?: boolean[];
}

export interface WeeklyReview {
  week: { start: string; end: string; label: string; this_week: boolean };
  reviewed: boolean;
  note: string;
  streak: number;
  headline: string;
  tiles: ReviewTile[];
  moved: ReviewLine[];
  stalled: ReviewLine[];
  ready: Experiment[];
  running: Experiment[];
  proposals: Proposal[];
  can_start: boolean;
  past: Experiment[];
  reasons: Array<{ key: string; label: string }>;
}

export function weeklyReview(): Promise<ApiResult<WeeklyReview>> {
  return get<WeeklyReview>('/api/weekly_review');
}

export function finishReview(note: string): Promise<ApiResult<{ week_start: string }>> {
  return post<{ week_start: string }>('/api/weekly_review', { note });
}

export interface StartTest {
  kind: string;
  params?: Record<string, unknown>;
  goal?: string;
  subject?: string;
  title: string;
  why?: string;
  days?: number;
}

export function startTest(test: StartTest): Promise<ApiResult<{ id: string; ends_on: string }>> {
  return post<{ id: string; ends_on: string }>('/api/experiments', test);
}

export function stopTest(id: string): Promise<ApiResult<Record<string, never>>> {
  return post<Record<string, never>>(`/api/experiments/${encodeURIComponent(id)}/stop`);
}

export function extendTest(id: string): Promise<ApiResult<{ ends_on: string }>> {
  return post<{ ends_on: string }>(`/api/experiments/${encodeURIComponent(id)}/extend`);
}

export function decideTest(id: string, keep: boolean): Promise<ApiResult<{ verdict: Verdict }>> {
  return post<{ verdict: Verdict }>(`/api/experiments/${encodeURIComponent(id)}/decide`, { keep });
}

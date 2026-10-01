/**
 * What the reader got right and wrong, per skill.
 *
 * Backend: backend/api/skillattempts.py, over the table in
 * data/sql/skillattempts.sql. Three calls — read them all, add one, take one
 * back — and nothing here derives anything: a level is utils/skillLevel, a
 * reading of these rows at a date.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';

/** How a problem was graded. The page says Easy / Medium / Hard. */
export type Tier = 'warmup' | 'core' | 'stretch';

export interface Attempt {
  id: string;
  node_id: string;
  /** The step of the node's written programme, 1-based. 0 is the node as a whole. */
  ordinal: number;
  /** Which of the step's problems, for a marked one. Absent on a log. */
  slot?: number;
  weight: Tier;
  /** Problems in this row — always 1 for a marked problem. */
  attempted: number;
  correct: number;
  /** A problem marked on the problems screen, or work logged from elsewhere. */
  source: 'problem' | 'log';
  /** Local ISO time, written by the server. */
  at: string;
}

export interface NewAttempt {
  node_id: string;
  ordinal: number;
  slot?: number;
  weight: Tier;
  attempted: number;
  correct: number;
  source: 'problem' | 'log';
}

export function list(): Promise<ApiResult<{ attempts: Attempt[] }>> {
  return get<{ attempts: Attempt[] }>('/api/skill-attempts');
}

export function add(attempt: NewAttempt): Promise<ApiResult<{ attempt: Attempt }>> {
  return post<{ attempt: Attempt }>('/api/skill-attempts', { ...attempt });
}

export function remove(id: string): Promise<ApiResult<{ id: string }>> {
  return post<{ id: string }>('/api/skill-attempts/delete', { id });
}

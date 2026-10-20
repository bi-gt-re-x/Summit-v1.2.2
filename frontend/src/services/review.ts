/**
 * The review queue: what you got wrong, back on 1, 3, 7 and 14 days.
 *
 * Backend: backend/api/review.py, over backend/tracking/review.py. The server
 * works out what's due. A problem is reviewed by answering it again through
 * skillAttempts.add; a task set or a logged step is marked here.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';
import type { Tier } from './skillAttempts';

export type ReviewKind = 'problem' | 'step' | 'set';

export interface ReviewProblem {
  slot: number;
  weight: Tier;
  prompt: string;
  answer: string;
  hint: string;
}

export interface ReviewItem {
  /** 'p:<node>#<step>#<slot>', 's:<node>#<step>' or 't:<task id>'. */
  key: string;
  kind: ReviewKind;
  state: 'due' | 'later' | 'cleared';
  /** Right answers since the last miss. Cleared at 4. */
  rung: number;
  reviews_left: number;
  missed_on: string;
  due: string | null;
  /** Days past due. */
  late: number;
  title: string;
  /** The skill or subject it's from. */
  where: string | null;
  /** One plain line: when it was missed and which try this is. */
  line: string;
  minutes: number;
  tree: string | null;
  tree_title: string | null;
  node_id: string | null;
  ordinal: number | null;
  slot: number | null;
  weight: Tier | null;
  /** Easy, Medium or Hard. */
  level: string | null;
  prompt: string | null;
  answer: string | null;
  hint: string;
  /** A step's own problems, to review it by answering some. */
  problems: ReviewProblem[];
  subject: string | null;
  task_id: string | null;
  got: number | null;
  of: number | null;
  missed: number | null;
}

export interface ReviewQueue {
  due: ReviewItem[];
  later: ReviewItem[];
  due_count: number;
  later_count: number;
  /** Coming back within a week. */
  this_week: number;
  next_due: string | null;
  cleared_lately: number;
  /** Minutes for the first sitting's worth. */
  minutes: number;
  sitting: number;
}

/** Days between reviews, by rung. Past the end, it's cleared. The server's
 *  LADDER in backend/tracking/review.py; used only for the note shown right
 *  after an answer, before the next read confirms it. */
export const LADDER = [1, 3, 7, 14] as const;

/** What one answer does: the new rung, and days until it's back (null once cleared). */
export function after(rung: number, right: boolean): { rung: number; days: number | null } {
  if (!right) return { rung: 0, days: LADDER[0] };
  const next = rung + 1;
  return { rung: next, days: LADDER[next] ?? null };
}

export function reviewQueue(): Promise<ApiResult<ReviewQueue>> {
  return get<ReviewQueue>('/api/review_queue');
}

/** Mark a set or a step as redone. A problem is answered through skillAttempts. */
export function markReview(item: string, result: 'right' | 'missed'): Promise<ApiResult<ReviewQueue>> {
  return post<ReviewQueue>('/api/review_queue/mark', { item, result });
}

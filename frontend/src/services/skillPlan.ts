/**
 * Skill tree plans: what to practice next in a tree, and a session to book.
 *
 * Backend: backend/api/skill_plan.py, over backend/tracking/skill_plan.py. The
 * server reads your answers and the tree's prerequisites and writes every
 * line; the page only draws them.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';
import type { ReviewItem } from './review';
import type { Tier } from './skillAttempts';

export type SuggestionKind =
  | 'review'
  | 'step-back'
  | 'ease-off'
  | 'harder'
  | 'continue'
  | 'ready'
  | 'start'
  | 'cold';

export interface Suggestion {
  kind: SuggestionKind;
  /** The skill to practice. For a step back, the base, not the one going badly. */
  node_id: string | null;
  node: string | null;
  /** For a step back: the skill that's going badly. */
  from_id: string | null;
  /** The written step, when there is one. */
  ordinal: number | null;
  weight: Tier | null;
  /** Easy, Medium or Hard. */
  level_word: string | null;
  title: string;
  because: string;
  minutes: number;
  /** For a review: how many are due. */
  count?: number;
}

export interface SkillSession {
  blocks: Suggestion[];
  minutes: number;
  budget: number;
}

export interface SkillPlan {
  tree: string;
  title: string;
  subject: string | null;
  suggestions: Suggestion[];
  session: SkillSession;
  session_title: string;
  /** This tree's due reviews, to do right here. */
  due: ReviewItem[];
  skills: number;
  practiced: number;
  got: number;
  budgets: number[];
}

export interface TreeSummary {
  tree: string;
  title: string;
  /** ISO day last practiced. */
  last: string;
  idle: number;
  top: Suggestion | null;
  due: number;
  practiced: number;
  got: number;
  skills: number;
}

export interface BookedSession {
  task_id: string;
  title: string;
  minutes: number;
  start: string;
  end: string;
}

export function skillPlan(tree: string, budget?: number): Promise<ApiResult<SkillPlan>> {
  const query = budget ? `&budget=${encodeURIComponent(budget)}` : '';
  return get<SkillPlan>(`/api/skill_plan?tree=${encodeURIComponent(tree)}${query}`);
}

export function skillTrees(): Promise<ApiResult<{ trees: TreeSummary[] }>> {
  return get<{ trees: TreeSummary[] }>('/api/skill_plan/trees');
}

export function bookSkillSession(tree: string, budget: number): Promise<ApiResult<BookedSession>> {
  return post<BookedSession>('/api/skill_plan/book', { tree, budget });
}

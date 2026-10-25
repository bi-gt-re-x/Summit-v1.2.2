/**
 * Topics: the account's finished tasks filed below their subject (subsubject,
 * then topic), each scored against the rest of the subject, and a plan for
 * each active goal built from them.
 *
 * Two calls on one path. `topicLibrary` reads what's stored and says whether
 * it's out of date; `buildTopics` files every task again and answers with the
 * same shape. The page reads, and rebuilds when `stale` comes back true.
 *
 * Backend: backend/api/topics.py, rules in backend/tracking/topics.py.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';

export type TopicStatus = 'weak' | 'steady' | 'strong' | 'untested' | 'unknown';

/** One row of the library: a subject, a subsubject and a topic. */
export interface TopicRow {
  subject: string;
  subject_label: string;
  /** A skill tree id, or '' when the names didn't say. */
  subsubject: string;
  subsubject_label: string;
  /** A topic id, or '' for work that names the area but no topic in it. */
  topic: string;
  label: string;
  /** The node a finer topic sits under ("Counting"), when it has one. */
  under: string;
  tasks: number;
  rated: number;
  /** Mean rating, 1-5. */
  execution: number | null;
  /** The subject's mean rating, which `gap` is measured from. */
  base: number | null;
  gap: number | null;
  difficulty: number | null;
  score_pct: number | null;
  late_share: number | null;
  reason: string;
  /** Contest or course id → how many of these tasks named it. */
  contexts: Record<string, number>;
  examples: string[];
  status: TopicStatus;
  first_at: string;
  last_at: string;
  goal_ids: string[];
}

export interface TopicMove {
  id: string;
  weight: 'now' | 'next' | 'keep';
  title: string;
  why: string;
  topic: string;
  context: string;
  resource: { name: string; url: string } | null;
}

export interface TopicInsight {
  id: string;
  tone: 'good' | 'bad' | 'flat';
  title: string;
  figure: string;
  means: string;
}

export interface GoalTopicPlan {
  goal_id: string;
  title: string;
  /** The contests and courses the goal names, most specific first. */
  contexts: string[];
  /** The goal's syllabus, each topic with how it's going. */
  position: {
    topic: string;
    label: string;
    subsubject_label: string;
    status: TopicStatus | 'untouched';
    tasks: number;
    execution: number | null;
  }[];
  covered: number;
  unnamed: number;
  moves: TopicMove[];
  insights: TopicInsight[];
}

export interface TopicLibrary {
  built: boolean;
  stale: boolean;
  subject: string;
  rows: TopicRow[];
  /** Tasks in this subject that filed under a subsubject, and all of them. */
  filed: number;
  total: number;
  /** Goal id → its plan. */
  goals: Record<string, GoalTopicPlan>;
}

/** The stored library for one subject, and each goal's plan. Never writes. */
export function topicLibrary(subject: string): Promise<ApiResult<TopicLibrary>> {
  return get<TopicLibrary>('/api/topics', { subject });
}

/** File every finished task again, store it, and answer as the read does. */
export function buildTopics(subject: string): Promise<ApiResult<TopicLibrary>> {
  return post<TopicLibrary>('/api/topics', {}, { subject });
}

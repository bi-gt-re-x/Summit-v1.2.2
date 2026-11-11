/**
 * Behavior: the patterns a reader already knows they fall into, tracked until they stop.
 *
 * Backend: backend/api/behavior.py, rules in backend/tracking/behavior.py, tables in
 * data/sql/behavior.sql. Everything a pattern says (how often, whether it comes back,
 * whether the fix worked, its stage) is worked out on the server each time it's read.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';

export type BehaviorStatus = 'identified' | 'intervening' | 'improving' | 'resolved';
export type BehaviorScope = 'study' | 'tests' | 'subject' | 'words';
export type BehaviorSource = 'own' | 'log' | 'reason' | 'easy' | 'length';
export type Tone = 'good' | 'bad' | 'flat';

export interface Fix {
  key?: string;
  title: string;
  how: string;
}

/** A bar chart's rows: two groups as percentages. */
export interface CompareChart {
  type: 'compare';
  max: number;
  unit: string;
  rows: { label: string; value: number; text: string }[];
}

export interface FixEffect {
  before: { hits: number; of: number; percent: number };
  during: { hits: number; of: number; percent: number };
  used: { done: number; of: number } | null;
  evidence: string | null;
  split: { line: string; evidence: string | null; helps: boolean } | null;
  verdict: string;
  tone: Tone;
  headline: string;
  tip: string;
}

export interface CheckDot {
  id: string | null;
  day: string;
  day_label: string;
  times: number;
  used: boolean | null;
  /** 'task' answered after a task, 'logged' by hand, 'record' read from the task itself. */
  from: 'task' | 'logged' | 'record';
  label: string;
}

export interface Behavior {
  id: string;
  title: string;
  detail: string;
  scope: BehaviorScope;
  scope_label: string;
  subject: string;
  words: string[];
  source: BehaviorSource;
  source_label: string;
  /** Measured from the tasks too, not only from checks. */
  from_record: boolean;
  stored_status: 'open' | 'resolved' | 'archived';
  status: BehaviorStatus;
  status_label: string;
  identified_on: string;
  identified_label: string;
  resolved_label: string | null;
  came_back: number;
  returned_label: string | null;
  frequency: { times: number; sessions: number; checked: number; days: number; line: string };
  recurrence: { hits: number; of: number; percent: number; evidence: string | null; line: string } | null;
  fix: {
    id: string;
    title: string;
    how: string;
    started_on: string;
    started_label: string;
    days: number;
    used: { done: number; of: number } | null;
  } | null;
  effect: FixEffect | null;
  past_fixes: { id: string; title: string; how: string; started_label: string; ended_label: string;
    outcome: string; verdict: string; headline: string }[];
  when: {
    found: { key: string; line: string; suggests: string; evidence: string; chart: CompareChart } | null;
    quiet: string[];
    need: number;
    linked: number;
  };
  recent: CheckDot[];
  checks: number;
  ready_to_resolve: boolean;
  fixes: Fix[];
}

export interface BehaviorSummary {
  named: number;
  counts: Record<BehaviorStatus, number>;
  repeat: { hits: number; of: number; percent: number } | null;
  /** `of` counts fixes far enough along to judge; `waiting` the ones too new to. */
  fixes: { working: number; of: number; waiting?: number };
  headline: string | null;
  figures: string | null;
  suggests: string | null;
  shared?: string;
}

export interface Suggestion {
  source: BehaviorSource;
  source_ref: string;
  title: string;
  detail: string;
  based_on: string;
  scope: BehaviorScope;
  scope_label: string;
  fixes: Fix[];
}

export interface Reminder {
  behavior_id: string;
  title: string;
  fix: string;
  how: string;
  tasks: string[];
  more: number;
}

export interface BehaviorPage {
  behaviors: Behavior[];
  summary: BehaviorSummary;
  suggestions: Suggestion[];
  today: Reminder[];
  scopes: { key: BehaviorScope; label: string }[];
  statuses: { key: BehaviorStatus; label: string }[];
  library: Fix[];
}

/** A pattern as the question after a task shows it. */
export interface TaskPattern {
  id: string;
  title: string;
  fix: { id: string; title: string } | null;
  /** An answer already given for this task. */
  times: number | null;
  used: boolean | null;
}

export interface NewPattern {
  title: string;
  detail?: string;
  scope?: BehaviorScope;
  subject?: string;
  words?: string[];
  source?: BehaviorSource;
  source_ref?: string;
  fix_title?: string;
  fix_how?: string;
}

export function read(): Promise<ApiResult<BehaviorPage>> {
  return get<BehaviorPage>('/api/behavior');
}

export function forTask(taskId: string): Promise<ApiResult<{ behaviors: TaskPattern[] }>> {
  return get<{ behaviors: TaskPattern[] }>('/api/behavior/for_task', { task_id: taskId });
}

export function add(pattern: NewPattern): Promise<ApiResult<{ id: string }>> {
  return post<{ id: string }>('/api/behavior/add', pattern);
}

export function update(id: string, change: Partial<Omit<NewPattern, 'source' | 'source_ref'>>): Promise<ApiResult<{ id: string }>> {
  return post<{ id: string }>('/api/behavior/update', { id, ...change });
}

export function setStatus(id: string, status: 'open' | 'resolved' | 'archived'): Promise<ApiResult<{ id: string }>> {
  return post<{ id: string }>('/api/behavior/status', { id, status });
}

export function remove(id: string): Promise<ApiResult<{ id: string }>> {
  return post<{ id: string }>('/api/behavior/delete', { id });
}

export function startFix(id: string, title: string, how: string): Promise<ApiResult<{ id: string }>> {
  return post<{ id: string }>('/api/behavior/fix', { id, title, how });
}

export function endFix(id: string, outcome: 'kept' | 'dropped'): Promise<ApiResult<{ id: string }>> {
  return post<{ id: string }>('/api/behavior/fix/end', { id, outcome });
}

export interface LoggedSession {
  id?: string;
  behavior_id: string;
  day: string;
  times: number;
  used?: boolean | null;
  label?: string;
  note?: string;
}

export function logSession(session: LoggedSession): Promise<ApiResult<{ id: string }>> {
  return post<{ id: string }>('/api/behavior/check', session);
}

export function removeSession(id: string): Promise<ApiResult<{ id: string }>> {
  return post<{ id: string }>('/api/behavior/check/delete', { id });
}

export function answerForTask(
  taskId: string,
  checks: { behavior_id: string; times: number; used: boolean | null }[],
): Promise<ApiResult<{ saved: string[] }>> {
  return post<{ saved: string[] }>('/api/behavior/checks', { task_id: taskId, checks });
}

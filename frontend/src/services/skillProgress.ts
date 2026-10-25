/**
 * The skill tree's reading of real work, and the skill check.
 *
 *   reading()          where the account stands on every node
 *   book(node)         a task for the step the reader is on, on the calendar
 *   fileTask(task, n)  which node a task counts toward ('-' none, '' by name)
 *   startCheck(node)   the node's check, or the one already running
 *   answer(...)        grade one answer; the last one finishes the check
 *
 * The rules are all on the server (backend/tracking/skill_progress.py and
 * skill_check.py). Every write answers with the whole reading again, so the
 * page swaps it in rather than working out what changed.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';

/** Work that counted toward a node, newest first, one row per name: a
 *  routine that repeats its name is one row with a count. `id` and `day` are
 *  the newest task's. */
export interface NodeWorkItem {
  kind: 'task' | 'sitting';
  id: string;
  title: string;
  day: string;
  sessions: number;
  /** How many tasks share this name. */
  count: number;
  done: boolean;
  /** How it was filed: 'booked' carries its node, the rest are the topic
   *  library's words (named, described). */
  how: string;
}

export interface NodeCheckSummary {
  tries: number;
  best: number;
  asked: number;
  passed_on: string;
  last_on: string;
}

/** What the record says about one node. Absent for a node with nothing. */
export interface NodeWork {
  sessions: number;
  target: number;
  percent: number;
  /** Has a check, did its sessions, hasn't passed it yet. */
  ready: boolean;
  /** The day it was mastered, or ''. */
  on: string;
  last: string;
  planned: number;
  goal_ids: string[];
  check: NodeCheckSummary | null;
  work: NodeWorkItem[];
  tasks: number;
}

export type ReadStatus = 'complete' | 'progress' | 'available';

export interface SkillReading {
  /** Node id → status. A node left out is locked. */
  status: Record<string, ReadStatus>;
  nodes: Record<string, NodeWork>;
  /** Tree id → finished tasks that named the tree but no skill on it. */
  unfiled: Record<string, { count: number; titles: string[] }>;
  goals: Record<string, string>;
  checkable: string[];
  targets: Record<string, number>;
}

export function reading(): Promise<ApiResult<SkillReading>> {
  return get<SkillReading>('/api/skill-progress');
}

export interface Booked {
  id: string;
  title: string;
  start: string;
  end: string;
  xp: number;
}

export function book(nodeId: string): Promise<ApiResult<SkillReading & { task: Booked }>> {
  return post<SkillReading & { task: Booked }>('/api/skill-progress/book', { node_id: nodeId });
}

/** `nodeId` is a node id, '-' for "counts toward no skill", or '' to file
 *  the task by its name again. `sameName` moves every task with its name. */
export function fileTask(
  taskId: string,
  nodeId: string,
  sameName = false,
): Promise<ApiResult<SkillReading & { task_id: string; node_id: string; moved: number }>> {
  return post<SkillReading & { task_id: string; node_id: string; moved: number }>('/api/skill-progress/file', {
    task_id: taskId,
    node_id: nodeId,
    same_name: sameName,
  });
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------
export interface CheckResult {
  given: string;
  right: boolean;
  how: 'auto' | 'self' | 'skipped' | string;
  answer: string;
}

export interface CheckQuestion {
  index: number;
  ordinal: number;
  /** The title of the step the problem is from. */
  step: string;
  weight: 'warmup' | 'core' | 'stretch';
  prompt: string;
  hint: string;
  /** Graded on the number typed. Otherwise the reader compares with the
   *  worked answer and says whether theirs matched. */
  auto: boolean;
  result: CheckResult | null;
}

export interface SkillCheck {
  id: string;
  node_id: string;
  node_name: string;
  asked: number;
  need: number;
  correct: number;
  finished: boolean;
  passed: boolean | null;
  questions: CheckQuestion[];
}

export function startCheck(
  nodeId: string,
): Promise<ApiResult<{ check: SkillCheck; resumed: boolean }>> {
  return post<{ check: SkillCheck; resumed: boolean }>('/api/skill-checks/start', { node_id: nodeId });
}

export interface AnswerReply {
  check: SkillCheck;
  /** A sentence answer, shown before anything is recorded. */
  reveal?: { index: number; answer: string; given: string };
  result?: { index: number; right: boolean; how: string; answer: string };
  /** On the last answer: the new reading, and what a pass opened. */
  progress?: SkillReading;
  opened?: { id: string; name: string }[];
}

export function answer(body: {
  id: string;
  index: number;
  given?: string;
  mark?: 'right' | 'wrong';
  skip?: boolean;
}): Promise<ApiResult<AnswerReply>> {
  return post<AnswerReply>('/api/skill-checks/answer', body);
}

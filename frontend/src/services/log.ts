/**
 * Log: the private journal, and what Summit has learned from it.
 *
 * Backend: backend/api/journal.py, over the tables in data/sql/log.sql. A save
 * returns at once; the reading happens on the server afterwards, and
 * `insights` is what the review panel polls to see it land.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';

export type InsightKind = 'goal' | 'pattern' | 'preference' | 'feeling';

export interface Entry {
  id: string;
  title: string;
  body: string;
  /** Whether the current text has been read for insights yet. */
  learn_state: 'waiting' | 'done' | 'failed' | 'off';
  created_at: string;
  updated_at: string;
}

export interface Insight {
  id: string;
  kind: InsightKind;
  topic: string;
  text: string;
  /** 'retired' when a later entry said it stopped being true. */
  status: 'active' | 'retired';
  /** When a passing feeling stops counting. Absent for every other kind. */
  expires_at?: string;
  /** The entries that back it up. */
  sources: string[];
  created_at: string;
  updated_at: string;
}

export interface EntryDraft {
  id?: string;
  title: string;
  body: string;
  /** The Save button rather than an autosave: read it now. */
  final?: boolean;
}

export function list(): Promise<ApiResult<{ entries: Entry[]; insights: Insight[]; learning: boolean }>> {
  return get<{ entries: Entry[]; insights: Insight[]; learning: boolean }>('/api/log');
}

export function insights(): Promise<ApiResult<{ insights: Insight[]; waiting: string[]; learning: boolean }>> {
  return get<{ insights: Insight[]; waiting: string[]; learning: boolean }>('/api/log/insights');
}

export function save(draft: EntryDraft): Promise<ApiResult<{ entry: Entry }>> {
  return post<{ entry: Entry }>('/api/log/save', { ...draft });
}

/** Queue again any entry a server restart left waiting to be read. */
export function resume(): Promise<ApiResult<{ resumed: number }>> {
  return post<{ resumed: number }>('/api/log/resume');
}

export function remove(id: string): Promise<ApiResult<{ id: string; removed: number }>> {
  return post<{ id: string; removed: number }>('/api/log/delete', { id });
}

export function forget(id: string): Promise<ApiResult<{ id: string }>> {
  return post<{ id: string }>('/api/log/insights/remove', { id });
}

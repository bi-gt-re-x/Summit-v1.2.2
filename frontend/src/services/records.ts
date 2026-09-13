/**
 * Records and milestones — the hall of fame the account writes itself.
 *
 * Backend: backend/api/records.py, over the table in data/sql/records.sql.
 *
 * Three calls, and `save` is one of them rather than two: create and edit
 * differ by whether an `id` is sent and the page has one dialog. The same
 * shape notes.ts uses, for the same reason.
 *
 * Nothing here derives anything. What the personal best is, which entries are
 * an improvement, what the evolution looks like — all of that is utils/records,
 * because it is a view of rows the client already holds.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';

/** 'record' has a figure that can be beaten; 'milestone' either happened or has not. */
export type RecordKind = 'record' | 'milestone';

/**
 * Which end of a record's range is the good end.
 *
 * A word rather than a `lower_is_better` boolean, because a boolean cannot
 * grow a third case and "closest to a target" is one this app may want. What
 * it means for every comparison on the page is in utils/records.
 */
export type Direction = 'higher' | 'lower';

export interface RecordRow {
  id: string;
  user_id: string;
  kind: RecordKind;
  /** "AMC 8". Rows sharing this are the same record over time. */
  name: string;
  /** The reader's own heading — "Competitive Math". Free text, not a subject id. */
  category: string;
  value: number;
  /** The "out of" for a capped score: 25 / 25. Zero means none. */
  target: number;
  /** What `value` counts: 'points', 'minutes', 'days', 'lines'. */
  unit: string;
  /**
   * Which way is better. Null on every row written before the column existed,
   * and read as 'higher' there — see `directionOf` in utils/records, which is
   * the only place allowed to do that reading.
   */
  comparison_direction: Direction | null;
  note: string;
  /** ISO day. Empty on a milestone not reached yet. */
  achieved_on: string;
  created_at: string;
  updated_at: string;
}

/** What a save sends. Everything but the id is written as given. */
export interface RecordDraft {
  id?: string;
  kind: RecordKind;
  name: string;
  category?: string;
  value?: number;
  target?: number;
  unit?: string;
  comparison_direction?: Direction;
  note?: string;
  achieved_on?: string;
}

export function list(): Promise<ApiResult<{ records: RecordRow[] }>> {
  return get<{ records: RecordRow[] }>('/api/records');
}

export function save(
  draft: RecordDraft,
): Promise<ApiResult<{ record: RecordRow }>> {
  return post<{ record: RecordRow }>('/api/records/save', { ...draft });
}

export function remove(id: string): Promise<ApiResult<{ id: string }>> {
  return post<{ id: string }>('/api/records/delete', { id });
}

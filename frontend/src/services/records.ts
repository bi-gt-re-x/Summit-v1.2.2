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
  /**
   * A milestone's target date, ISO, or empty for none. Null on rows written
   * before the column existed. Always empty on a record.
   */
  due_on?: string | null;
  /**
   * The records a milestone is linked to, by name, as a JSON array. Null or
   * '' on rows that predate it and on every record. Read through `linksOf`
   * in utils/records, never parsed at a call site.
   */
  links?: string | null;
  /**
   * The linked record whose best counts as a milestone's progress, by name,
   * or empty when the progress is typed in by hand (or not tracked at all).
   */
  progress_from?: string | null;
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
  due_on?: string;
  /** Record names. Sent as a list; stored as JSON. */
  links?: string[];
  progress_from?: string;
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

// ---------------------------------------------------------------------------
// The records, read against the rest of the account
// ---------------------------------------------------------------------------
/** A finding, already a sentence. See backend/tracking/record_reads.py. */
export interface RecordRead {
  id: string;
  kind: 'climb' | 'fresh' | 'stalled' | 'slipping' | 'goal' | 'fastest';
  record: string;
  tone: 'good' | 'bad' | 'flat';
  title: string;
  detail: string;
  weight: number;
}

/** A goal a record works toward, and how far its best gets toward the number in it. */
export interface RecordGoal {
  id: string;
  title: string;
  /** How it was tied: 'contest', 'name', 'tree', 'subject'. */
  by: string[];
  score: number;
  progress: { target: number; percent: number; met: boolean } | null;
  days_left: number | null;
}

export interface AnalysedRecord {
  name: string;
  category: string;
  unit: string;
  target: number;
  direction: Direction;
  /** What it was read as. Empty strings when its words file nowhere. */
  subject: string;
  subject_name: string;
  tree: string;
  tree_label: string;
  topic: string;
  topic_label: string;
  context: string;
  context_label: string;
  how: 'name' | 'category' | 'subject' | 'none';
  first: number;
  first_on: string;
  best: number;
  best_on: string;
  latest: number;
  latest_on: string;
  /** Signed toward better. */
  gain: number;
  percent: number;
  entries: number;
  days_to_best: number | null;
  days_since_best: number;
  after_best: number;
  rate_per_month: number | null;
  trend: { word: 'improving' | 'steady' | 'slipping'; early: boolean; basis: number } | null;
  steps: Array<{ on: string; jump: number; value: number }>;
  work: {
    /** How the tasks were matched: 'context', 'tree', 'subject', or '' for none. */
    basis: '' | 'context' | 'tree' | 'subject';
    climb_tasks: number;
    climb_seconds: number;
    since_tasks: number;
    since_seconds: number;
    window_tasks: number;
    window_seconds: number;
    seconds_per_unit: number | null;
  };
  window: {
    logged: number;
    new_bests: number;
    previous_bests: number;
    gain: number | null;
    started_in_window: boolean;
    previous_gain: number | null;
  };
  goals: RecordGoal[];
  milestones: string[];
}

export interface RecordSubject {
  key: string;
  label: string;
  /** False when the records filed nowhere and this is their own category. */
  inferred: boolean;
  records: number;
  improving: number;
  new_bests: number;
  median_percent: number | null;
  window_seconds: number;
  top: { name: string; percent: number; gain: string } | null;
  names: string[];
}

export interface RecordAnalysis {
  days: number;
  since: string;
  summary: {
    records: number;
    with_history: number;
    improving: number;
    not_yet: number;
    new_bests: number;
    previous_bests: number;
    logged: number;
    median_percent: number | null;
    stalled: number;
    tied_to_goals: number;
  };
  by_subject: RecordSubject[];
  records: AnalysedRecord[];
  reads: RecordRead[];
}

/** Every record read against the work and the goals, over the last `days` days. */
export function analysis(days: number): Promise<ApiResult<RecordAnalysis>> {
  return get<RecordAnalysis>(`/api/records/analysis?days=${Math.round(days)}`);
}

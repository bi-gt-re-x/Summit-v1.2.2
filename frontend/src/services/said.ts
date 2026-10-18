/**
 * Said vs did: what the reader told Summit (About you, the Log) held up
 * against what they actually did. Rules: backend/tracking/said_did.py.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';

export type Verdict = 'strong' | 'some' | 'little' | 'none';

export interface Standing {
  subject: string;
  name: string;
  /** Tasks in the last `days` that count toward it, by filing or by name. */
  tasks: number;
  /** Those tasks as a share of everything finished in the stretch. */
  share: number;
  rank: number | null;
  of: number;
  last_on: string | null;
  verdict: Verdict;
}

export interface SaidItem extends Standing {
  kind: string;
  text: string;
  source: 'About you' | 'Log';
}

export interface TimingRead {
  text: string;
  said: string;
  share: number;
  busiest: string;
  busiest_share: number;
  matches: boolean;
  tasks: number;
}

export interface TopicRow {
  subject: string;
  name: string;
  tasks: number;
}

export interface SaidVsDid {
  days: number;
  month_tasks: number;
  aims: SaidItem[];
  activities: SaidItem[];
  timing: TimingRead[];
  topics: Array<{ subject: string; name: string; tasks: number; topics: TopicRow[] }>;
  unfiled: { total: number; groups: Array<{ subject: string; name: string; ids: string[] }> };
}

export function read(): Promise<ApiResult<SaidVsDid>> {
  return get<SaidVsDid>('/api/analytics/said');
}

/** File unfiled tasks under the subject their names say. */
export function fileInferred(subject: string, ids: string[]): Promise<ApiResult<SaidVsDid & { filed: number }>> {
  return post<SaidVsDid & { filed: number }>('/api/analytics/file_inferred', { subject, ids });
}

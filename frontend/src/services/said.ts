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

// ---------------------------------------------------------------------------
// Mood vs output: how the days felt (the Log) against what they did.
// Rules: backend/tracking/mood.py.
// ---------------------------------------------------------------------------
export type Confidence = 'early' | 'pattern' | 'solid';

export interface MoodBand {
  key: 'rough' | 'okay' | 'good';
  label: string;
  days: number;
  tasks_avg: number;
  focus_avg: number;
  execution_avg: number | null;
  /** Percent against the usual day, or null with no days. */
  vs_usual: number | null;
  enough: boolean;
}

export interface FeelingRead {
  kind: 'tired' | 'stressed' | 'down' | 'good' | 'driven';
  label: string;
  days: number;
  enough: boolean;
  /** Only when `enough`. */
  sign?: number;
  other_days?: number;
  tasks_avg?: number;
  other_avg?: number;
  change?: number | null;
  next_day_avg?: number;
  next_change?: number | null;
  words?: string[];
  confidence?: Confidence;
  need?: number;
}

export interface PerceptionCheck {
  day: string;
  side: 'low' | 'high';
  quote: string;
  tasks: number;
  focus_min: number;
  usual: number;
  verdict: 'harsher' | 'matches' | 'close' | 'generous' | 'deep';
}

export interface MoodDay {
  day: string;
  mood: number | null;
  source: 'said' | 'read' | null;
  tasks: number;
  focus_min: number;
}

export interface MoodVsOutput {
  window_days: number;
  logged_days: number;
  mood_days: number;
  said_days: number;
  read_days: number;
  today: { mood: number | null; source: 'said' | 'read' | null } | null;
  usual: { tasks: number; focus_min: number; days: number };
  bands: MoodBand[];
  feelings: FeelingRead[];
  checks: PerceptionCheck[];
  harsher: number;
  energy: Array<{ level: number; label: string; days: number; tasks_avg: number; enough: boolean }>;
  energy_ready: boolean;
  recovery: { days: number; lows: number } | null;
  weekdays: Array<{ day: string; mood: number; days: number }>;
  series: MoodDay[];
  min_days: number;
  small_change: number;
  headline: { text: string; tone: 'insight' | 'steady' | 'building'; confidence: Confidence } | null;
}

export function readMood(): Promise<ApiResult<MoodVsOutput>> {
  return get<MoodVsOutput>('/api/analytics/mood');
}

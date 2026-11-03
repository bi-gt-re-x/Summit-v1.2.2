/**
 * Activity, output, progress and mastery. The rules, and why the four stay apart,
 * are in backend/tracking/measures.py.
 */
import { get } from './api';
import type { ApiResult } from '@/types';

export type MeasureKey = 'activity' | 'output' | 'progress' | 'mastery';

export interface Measure {
  key: MeasureKey;
  label: string;
  /** The question this measure answers, and the only one. */
  question: string;
  /** What it's read from, so "Your ratings" and "Tested" don't look the same. */
  evidence: string;
  figure: string;
  unit: string;
  now: number;
  before: number;
  change: string;
  lines: string[];
  suggests: string;
  /** Activity only: what the finished tasks were. */
  mix?: { key: string; label: string; count: number }[];
  to?: string;
  action?: string;
}

export interface Measures {
  days: number;
  reading: {
    kind: string;
    headline: string;
    figures: string;
    suggests: string;
    to?: string;
    action?: string;
  };
  measures: Measure[];
}

export function measures(): Promise<ApiResult<Measures>> {
  return get<Measures>('/api/analytics/measures');
}

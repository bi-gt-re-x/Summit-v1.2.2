import { get, post } from './api';
import type { ApiResult } from '@/types';
import type { Answers, Detail } from '@/utils/background';

/** One line of the answers, filed by backend/tracking/background.py. */
export interface Fact {
  id: string;
  kind: 'achievement' | 'stat' | 'activity' | 'aim' | 'about';
  text: string;
  /** The subject id it names, if any. */
  subject: string | null;
  value: number | null;
  unit: string;
  question: string;
}

export interface Background {
  answers: Answers;
  detail: Detail;
  facts: Fact[];
  updated_at: string | null;
}

export function read(): Promise<ApiResult<Background>> {
  return get<Background>('/api/background');
}

export function save(answers: Answers): Promise<ApiResult<Background>> {
  return post<Background>('/api/background', answers);
}

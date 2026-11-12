/**
 * The AMC prep API (backend/api/amc.py): dashboard, problems, review, topics,
 * contests, study plan and search. Every call is for the signed-in account.
 */
import { del, get, post, put } from './api';

export type Level = 'AMC 10' | 'AMC 12' | 'AIME';
export type Status = 'new' | 'solved' | 'missed' | 'review';
export type CategoryId = 'algebra' | 'number-theory' | 'counting' | 'geometry' | 'misc';

export interface ProblemSummary {
  id: string;
  level: Level;
  topic: string;
  topic_name: string;
  category: CategoryId;
  difficulty: number;
  technique_name: string;
  preview: string;
  source: string;
  status: Status;
  attempts: number;
}

export interface Source {
  contest: string;
  name: string;
  number: number;
}

export interface Problem {
  id: string;
  level: Level;
  topic: string;
  topic_name: string;
  category: CategoryId;
  category_name: string;
  also: { id: string; name: string }[];
  technique: string;
  technique_name: string;
  difficulty: number;
  statement: string;
  choices: string[] | null;
  format: 'choice' | 'integer';
  sources: Source[];
  answer?: string | number;
  solution?: string;
  insight?: string;
  trap?: string;
}

export interface ReviewItem extends ProblemSummary {
  stage: number;
  due: string;
  review_status: 'active' | 'mastered';
  note: string;
  misses: number;
  overdue: boolean;
  is_due: boolean;
}

export interface Category {
  id: CategoryId;
  name: string;
  color: string;
  blurb: string;
  problems: number;
  attempted: number;
  solved: number;
  accuracy: number | null;
}

export interface TopicStats {
  problems: number;
  attempted: number;
  solved: number;
  first_right: number;
  review: number;
  accuracy: number | null;
  mastery: number;
}

export interface Topic extends TopicStats {
  id: string;
  category: CategoryId;
  name: string;
  weight: number;
  levels: Level[];
  summary: string;
  ideas: string[];
}

export interface MockBrief {
  id: string;
  contest_id: string;
  name: string;
  level: Level | '';
  kind: 'mock' | 'logged';
  score: number;
  correct: number;
  wrong: number;
  blank: number;
  seconds: number;
  note: string;
  at: string;
  max?: number;
}

export interface TodayItem {
  key: string;
  label: string;
  to: string;
  done: boolean;
  progress?: number;
  goal?: number;
}

export interface PlanWeek {
  number: number;
  start: string;
  end: string;
  phase: 'Foundations' | 'Core' | 'Contest mode' | 'Taper';
  note: string;
  focus: { id: string; name: string; category: CategoryId }[];
  problems: number;
  mock: boolean;
  mock_done: boolean;
  current: boolean;
  past: boolean;
}

export interface Dashboard {
  stats: {
    solved: number;
    attempted: number;
    total: number;
    accuracy: number | null;
    streak: number;
    due: number;
    in_review: number;
    mastered: number;
    minutes: number;
    mocks: number;
  };
  target: Level;
  goal: number;
  projected: Record<Level, number>;
  categories: Category[];
  weakest: { id: string; name: string; mastery: number; accuracy: number | null }[];
  next_problem: ProblemSummary | null;
  recent: (ProblemSummary & { correct: boolean; at: string; via: string })[];
  plan: null | {
    target: Level;
    exam_date: string;
    goal_score: number;
    days_left: number;
    week: PlanWeek | null;
    today: TodayItem[];
  };
  last_mock: MockBrief | null;
}

export interface ProblemFilters {
  level?: string;
  category?: string;
  topic?: string;
  difficulty?: string;
  status?: string;
  technique?: string;
  q?: string;
  sort?: string;
}

export interface ProblemList {
  problems: ProblemSummary[];
  total: number;
  counts: Record<Status, number>;
  topics: { id: string; name: string; category: CategoryId }[];
  categories: Category[];
  techniques: { id: string; name: string }[];
}

export interface ProblemDetail {
  problem: Problem;
  status: Status;
  attempts: { answer: string; correct: boolean; at: string; source: string; seconds: number }[];
  review: ReviewItem | null;
  related: ProblemSummary[];
  prev: string | null;
  next: string | null;
}

export interface AttemptReply {
  correct: boolean;
  given: string;
  problem: Problem;
  review: { stage: number; due: string; status: string } | null;
  moved: boolean;
}

export interface ReviewQueue {
  due: ReviewItem[];
  upcoming: ReviewItem[];
  mastered: ReviewItem[];
  forecast: { date: string; count: number }[];
  by_topic: { name: string; count: number }[];
  intervals: number[];
}

export interface Format {
  count: number;
  minutes: number;
  max: number;
  scoring: string;
}

export interface MockContest extends Format {
  id: string;
  name: string;
  level: Level;
  blurb: string;
  attempts: number;
  best: number | null;
}

export interface PastContest extends Format {
  id: string;
  name: string;
  year: number;
  level: Level;
  paper: string;
  season: string;
  problems_url: string;
  answers_url: string;
  logged?: MockBrief | null;
}

export interface ContestList {
  mocks: MockContest[];
  years: { year: number; contests: PastContest[] }[];
  history: MockBrief[];
  formats: Record<Level, Format>;
}

export interface ContestDetail {
  contest: (MockContest & { kind: 'mock' }) | (PastContest & { kind: 'past' });
  problems?: (Problem & { number: number })[];
  history: MockBrief[];
}

export interface MockRow {
  number: number;
  problem_id: string;
  given: string;
  answer: string | number;
  result: 'correct' | 'wrong' | 'blank';
  topic: string;
  topic_name: string;
  difficulty: number;
  statement: string;
  solution: string;
  insight: string;
  trap: string;
  choices: string[] | null;
}

export interface MockResult {
  result: MockBrief & Format;
  contest: { id: string; name: string; level: Level };
  rows: MockRow[];
  report: {
    topics: { topic: string; name: string; total: number; correct: number; lost: number }[];
    bands: { label: string; correct: number; total: number; lost: number }[];
  };
  attempts: MockBrief[];
}

export interface PlanSettings {
  target: Level;
  exam_date: string;
  goal_score: number;
  hours: number;
}

export interface PlanPayload {
  plan: null | (PlanSettings & { days_left: number; created_at: string; updated_at: string });
  weeks?: PlanWeek[];
  today?: TodayItem[];
  projected?: number;
  coverage?: { id: string; name: string; category: CategoryId; mastery: number; weight: number }[];
  defaults: { dates: Record<Level, string>; goals: Record<Level, number> };
}

export interface SearchResults {
  query: string;
  problems: { id: string; level: Level; topic_name: string; difficulty: number; preview: string; source: string }[];
  topics: { id: string; name: string; summary: string; category_name: string }[];
  contests: { id: string; name: string; level: Level; kind: 'mock' | 'past' }[];
  pages: { name: string; to: string }[];
}

export const amc = {
  dashboard: () => get<Dashboard>('/api/amc/dashboard'),
  problems: (filters: ProblemFilters) => get<ProblemList>('/api/amc/problems', { ...filters }),
  problem: (id: string) => get<ProblemDetail>(`/api/amc/problems/${encodeURIComponent(id)}`),
  attempt: (id: string, answer: string, seconds: number, source: 'practice' | 'review' = 'practice') =>
    post<AttemptReply>(`/api/amc/problems/${encodeURIComponent(id)}/attempt`, { answer, seconds, source }),
  reveal: (id: string) => post<{ problem: Problem }>(`/api/amc/problems/${encodeURIComponent(id)}/reveal`),
  review: () => get<ReviewQueue>('/api/amc/review'),
  addReview: (id: string) => post<object>(`/api/amc/review/${encodeURIComponent(id)}`),
  removeReview: (id: string) => del<object>(`/api/amc/review/${encodeURIComponent(id)}`),
  noteReview: (id: string, note: string) => post<object>(`/api/amc/review/${encodeURIComponent(id)}/note`, { note }),
  topics: () => get<{ categories: (Category & { topics: Topic[] })[] }>('/api/amc/topics'),
  topic: (id: string) =>
    get<{
      topic: Topic & { category_name: string };
      problems: ProblemSummary[];
      siblings: { id: string; name: string }[];
      techniques: { id: string; name: string; count: number }[];
    }>(`/api/amc/topics/${encodeURIComponent(id)}`),
  contests: () => get<ContestList>('/api/amc/contests'),
  contest: (id: string) => get<ContestDetail>(`/api/amc/contests/${encodeURIComponent(id)}`),
  submit: (id: string, answers: Record<string, string>, seconds: number) =>
    post<{ id: string }>(`/api/amc/contests/${encodeURIComponent(id)}/submit`, { answers, seconds }),
  mock: (id: string) => get<MockResult>(`/api/amc/mocks/${encodeURIComponent(id)}`),
  deleteMock: (id: string) => del<object>(`/api/amc/mocks/${encodeURIComponent(id)}`),
  logScore: (id: string, score: number, note: string) =>
    post<object>(`/api/amc/contests/${encodeURIComponent(id)}/log`, { score, note }),
  plan: () => get<PlanPayload>('/api/amc/plan'),
  savePlan: (settings: PlanSettings) => put<PlanPayload>('/api/amc/plan', settings),
  clearPlan: () => del<object>('/api/amc/plan'),
  check: (key: string, done: boolean) => post<PlanPayload>('/api/amc/plan/check', { key, done }),
  search: (q: string, limit = 20) => get<SearchResults>('/api/amc/search', { q, limit }),
};

/** Fired when an answer, a mock or a plan change moves the dashboard's numbers. */
export const AMC_CHANGED = 'summit:amc-changed';

export function announceAmcChanged(): void {
  window.dispatchEvent(new Event(AMC_CHANGED));
}

export const CATEGORY_TONE: Record<CategoryId, string> = {
  algebra: 'blue',
  'number-theory': 'amber',
  counting: 'green',
  geometry: 'rose',
  misc: 'slate',
};

export function pct(value: number | null | undefined): string {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

export function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

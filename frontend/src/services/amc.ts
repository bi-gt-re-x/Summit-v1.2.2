/**
 * The AMC prep API (backend/api/amc.py): dashboard, problems, review, topics,
 * contests, study plan, analytics and search. Every call is for the signed-in account.
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
  /** AoPS competition-scale rating (1-10). */
  rating?: number | null;
  technique_name: string;
  preview: string;
  source: string;
  /** A compact label, such as M10-2·5. */
  short?: string;
  /** The contest it first appears in, and its number there. */
  contest_id?: string | null;
  number?: number | null;
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
  rating?: number | null;
  statement: string;
  choices: string[] | null;
  format: 'choice' | 'integer';
  sources: Source[];
  /** An imported official problem: no write-up, maybe a diagram not drawn here. */
  official?: boolean;
  /** Asymptote source, 'image', or '' when there is no diagram. */
  diagram?: string;
  /** The problem's page on the AoPS wiki (official problems only). */
  aops_url?: string | null;
  /** Written by the AI and kept after an independent second solve agreed. */
  ai?: boolean;
  answer?: string | number;
  /** Numbered steps; null for official problems. */
  solution?: string[] | null;
  insight?: string | null;
  trap?: string | null;
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

/** One problem as a pill: a short label, coloured by status. */
export interface Pill {
  id: string;
  short: string;
  difficulty: number;
  rating?: number | null;
  status: Status;
  /** Full source and a preview, for the tooltip. */
  title: string;
}

export interface StrategyGroup {
  id: string;
  name: string;
  idea: string;
  pills: Pill[];
}

export interface StrategyFamily {
  id: string;
  name: string;
  color: string;
  blurb: string;
  problems: number;
  solved: number;
  techniques: (StrategyGroup & { solved: number; topics: { id: string; name: string }[] })[];
}

export interface Topic extends TopicStats {
  id: string;
  category: CategoryId;
  name: string;
  weight: number;
  levels: Level[];
  summary: string;
  ideas: string[];
  /** The Ideas card: what to do, when, and a worked example (backend/amc/ideas.py). */
  playbook?: PlaybookMove[];
  /** The mistake that costs the most points on this topic. */
  trap?: string;
  pills?: Pill[];
}

export interface PlaybookMove {
  move: string;
  when: string;
  example: string;
}

/** A problem on a topic page's strategy list: a pill plus what the row shows. */
export interface TopicRow extends Pill {
  source: string;
  statement: string;
}

/** A problem and solution someone posted by hand (backend/amc/posts.py). */
export interface Post {
  id: string;
  author: string;
  level: Level;
  title: string;
  statement: string;
  /** Five choices for the AMC; null for an AIME problem. */
  choices: string[] | null;
  /** A letter A-E, or the AIME integer. */
  answer: string;
  solution: string;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
}

export interface PostDraft {
  level: Level;
  title: string;
  statement: string;
  choices: string[] | null;
  answer: string;
  solution: string;
}

/** One of the up-to-three problems a topic page suggests doing next. */
export interface NextPick extends ProblemSummary {
  kind: 'retry' | 'next' | 'stretch';
  reason: string;
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
  /** Null until `projection_min` problems have been answered. */
  projected: Record<Level, number | null>;
  projection_min: number;
  categories: Category[];
  weakest: { id: string; name: string; mastery: number; accuracy: number | null }[];
  next_problem: ProblemSummary | null;
  performance: RecentPerformance;
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

export interface PerformanceWindow {
  answered: number;
  correct: number;
  accuracy: number | null;
  revealed: number;
  minutes: number;
  avg_seconds: number | null;
  days: number;
  hardest: { id: string; rating: number; short: string } | null;
}

export interface ScorePoint {
  id: string;
  contest_id: string;
  name: string;
  level: Level | '';
  kind: 'mock' | 'logged';
  score: number;
  max: number | null;
  at: string;
}

export interface Note {
  tone: 'up' | 'down' | 'flat';
  text: string;
}

/** The dashboard's recent performance: this week against last. */
export interface RecentPerformance {
  this_week: PerformanceWindow;
  last_week: PerformanceWindow;
  days: { date: string; answered: number; correct: number }[];
  mocks: ScorePoint[];
  notes: Note[];
}

export interface RatingRow {
  rating: number;
  attempted: number;
  first_right: number;
  accuracy: number | null;
  avg_seconds: number | null;
}

export interface ContestGuide {
  level: Level;
  count: number;
  minutes: number;
  max: number;
  scoring: string;
  who: string;
  format: string;
  qualify: string;
  sections: { range: string; rating: string; minutes: number; what: string }[];
  shares: { id: string; name: string; share: number }[];
  measured: null | { papers: number; problems: number; shares: Record<string, number> };
  bands: { last: number; rating: number }[];
  key_topics: { id: string; name: string; category: string }[];
}

export interface Analytics {
  target: Level;
  goal: number;
  has_plan: boolean;
  exam_date: string | null;
  days_left: number | null;
  hours: number | null;
  performance: {
    attempted: number;
    solved: number;
    accuracy: number | null;
    avg_seconds: number | null;
    minutes: number;
    active_days: number;
    projected: Record<Level, number | null>;
    projection_min: number;
    categories: Category[];
    ratings: RatingRow[];
    ceiling: number | null;
    weeks: { start: string; answered: number; correct: number; accuracy: number | null }[];
    topics: {
      id: string; name: string; category: string; weight: number; levels: Level[];
      attempted: number; problems: number; accuracy: number | null; mastery: number; review: number;
    }[];
    recovery: { missed_first: number; recovered: number; open: number; revealed: number };
    mocks: ScorePoint[];
  };
  contests: Record<Level, ContestGuide>;
  prepare: {
    goal: number;
    right_needed: number;
    split: string;
    need_rating: number | null;
    ceiling: number | null;
    reach: string;
    gap: number | null;
    focus: { id: string; name: string; category: string; weight: number; mastery: number; accuracy: number | null }[];
    steps: { title: string; body: string; to: string }[];
    week: { what: string; hours: number }[];
    phase: null | { name: string; weeks: number; text: string };
  };
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
  source?: string;
  /** Whole rating steps, comma separated: "3" covers 3 and 3.5. */
  rating?: string;
  /** Problem number within its contest, a past paper's year, or a mock contest id. */
  number?: string;
  year?: string;
  mock?: string;
}

export interface ProblemList {
  problems: ProblemSummary[];
  total: number;
  counts: Record<Status, number>;
  /** Problems in each whole rating step, "1" to "10". */
  rating_counts: Record<string, number>;
  kinds: Record<'summit' | 'step' | 'official' | 'ai', number>;
  mocks: { id: string; name: string; level: Level; family: 'summit' | 'step'; set: number | null }[];
  years: { year: number; count: number }[];
  families: { id: string; name: string; techniques: { id: string; name: string }[] }[];
  official: number;
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
  /** 'summit': the five full sets per contest; 'step': the original warm-up mocks. */
  family: 'summit' | 'step';
  set: number | null;
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
  /** How many of its problems have been imported (count = all of them). */
  imported?: number;
}

export interface ContestList {
  mocks: MockContest[];
  years: { year: number; contests: PastContest[] }[];
  history: MockBrief[];
  formats: Record<Level, Format>;
  imported: number;
  /** Whether this account may import papers (only `temu`). */
  can_import: boolean;
}

export interface ContestDetail {
  contest: (MockContest & { kind: 'mock' }) | (Omit<PastContest, 'imported'> & { kind: 'past'; imported: boolean });
  problems: (Problem & { number: number; status: Status })[];
  history: MockBrief[];
  /** Whether this account may import or remove the paper (only `temu`). */
  can_import: boolean;
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
  rating?: number | null;
  statement: string;
  solution: string[] | null;
  insight: string | null;
  trap: string | null;
  choices: string[] | null;
  diagram: string;
}

export interface MockResult {
  result: MockBrief & Format;
  contest: { id: string; name: string; level: Level; official: boolean };
  rows: MockRow[];
  report: {
    topics: { topic: string; name: string; total: number; correct: number; lost: number }[];
    bands: { label: string; correct: number; total: number; lost: number }[];
  };
  attempts: MockBrief[];
}

export interface PlanDetails {
  experience?: 'first' | 'taken' | 'qualified';
  /** School grade, '6'-'12' or 'Other'. */
  grade?: string;
  last_score?: number;
  days_per_week?: number;
  strong?: string[];
  weak?: string[];
  resources?: string;
  notes?: string;
}

export interface PlanSettings {
  target: Level;
  exam_date: string;
  goal_score: number;
  hours: number;
  details?: PlanDetails;
}

/** The AI coach's plan (backend/amc/coach.py). */
export interface CoachPlan {
  summary: string;
  starting_point: string;
  phases: { name: string; weeks: string; goal: string; focus_topics: string[]; routine: string }[];
  weekly_schedule: { day: string; task: string; minutes: number }[];
  milestones: { week: number; target: string }[];
  focus_order: string[];
  tips: string[];
  questions: string[];
}

export interface PlanPayload {
  plan: null | (PlanSettings & {
    days_left: number;
    created_at: string;
    updated_at: string;
    details: PlanDetails;
    coach: CoachPlan | null;
    coach_at: string;
    coach_by: string;
  });
  /** Whether an AI model is configured, and which one. */
  ai: { available: boolean; label: string };
  weeks?: PlanWeek[];
  today?: TodayItem[];
  projected?: number | null;
  coverage?: { id: string; name: string; category: CategoryId; mastery: number; weight: number }[];
  defaults: { dates: Record<Level, string>; goals: Record<Level, number> };
}

// ---------------------------------------------------------------------------
// Smart insights and the AI layer (backend/amc/smart.py, backend/api/amc_ai.py)
// ---------------------------------------------------------------------------
export interface AIStatus {
  available: boolean;
  provider: string;
  label: string;
  used_today: number;
  limit: number;
  setup: string;
}

export interface ContestForecast {
  expected: number;
  low: number;
  high: number;
  target: number | null;
  chance: number | null;
  reach: number;
  count: number;
}

export interface TopicAbility {
  id: string;
  name: string;
  category: CategoryId;
  weight: number;
  answered: number;
  right: number;
  theta: number | null;
  se: number | null;
  relevant: boolean;
  priority: number;
}

export interface PatternRow {
  kind: 'careless' | 'slow' | 'rushed' | 'revealed';
  count: number;
  text: string;
  problems: { id: string; short: string; topic: string; rating: number }[];
}

export interface SmartStats {
  level: Level;
  goal: number;
  answered: number;
  confident: boolean;
  theta: number;
  se: number;
  band: string;
  contests: Record<Level, ContestForecast>;
  topics: TopicAbility[];
  techniques: { id: string; name: string; answered: number; theta: number }[];
  focus: TopicAbility[];
  strong: TopicAbility[];
  patterns: PatternRow[];
  trend: { week_end: string; answered: number; theta: number | null }[];
  mocks: null | { taken: number; scores: { contest: string; score: number; at: string }[]; blank_rate: number | null; by_fifth: (number | null)[] };
  next_problems: { id: string; short: string; topic: string; topic_name: string; rating: number; chance: number }[];
  review_due: number;
}

export interface Diagnosis {
  headline: string;
  diagnosis: string;
  strengths: string[];
  weaknesses: string[];
  this_week: { action: string; why: string; minutes: number; topic: string; topic_name: string }[];
  contest_strategy: string;
}

export interface InsightsPayload {
  stats: SmartStats;
  ai: AIStatus;
  diagnosis: Diagnosis | null;
  diagnosis_at: string | null;
}

export interface Explanation {
  likely_mistake: string;
  habit: string;
  right_approach: string;
  given: string;
}

export interface ImportBatch {
  url: string;
  label: string;
  contests: string[];
}

export interface BundleRow {
  id: string;
  name: string;
  problems: number;
  count: number;
  answers: number;
  complete: boolean;
  diagrams: number;
  issues: string[];
  saved: boolean;
}

export interface ImportPreview {
  preview: {
    number: number;
    statement: string;
    choices: string[] | null;
    diagram: boolean;
    topic: string;
    answer: string | number | null;
  }[];
  issues: string[];
  saved: boolean;
  count: number;
  diagrams: number;
  /** Every problem and answer found: it can be saved (missing choices are only a warning). */
  complete?: boolean;
}

export interface SearchResults {
  query: string;
  problems: { id: string; level: Level; topic_name: string; difficulty: number; rating?: number | null; preview: string; source: string }[];
  topics: { id: string; name: string; summary: string; category_name: string }[];
  contests: { id: string; name: string; level: Level; kind: 'mock' | 'past' }[];
  pages: { name: string; to: string }[];
}

export const amc = {
  dashboard: () => get<Dashboard>('/api/amc/dashboard'),
  analytics: () => get<Analytics>('/api/amc/analytics'),
  insights: () => get<InsightsPayload>('/api/amc/insights'),
  diagnose: (refresh = false) =>
    post<{ diagnosis: Diagnosis; at: string; cached: boolean }>('/api/amc/insights/ai', { refresh }),
  aiStatus: () => get<AIStatus>('/api/amc/ai/status'),
  hint: (id: string, level: number) =>
    post<{ hint: string; level: number }>(`/api/amc/ai/hint/${encodeURIComponent(id)}`, { level }),
  explain: (id: string) => post<Explanation>(`/api/amc/ai/explain/${encodeURIComponent(id)}`, {}),
  posts: (level = '') => get<{ posts: Post[]; levels: Level[] }>('/api/amc/posts', level ? { level } : {}),
  createPost: (draft: PostDraft) => post<{ post: Post }>('/api/amc/posts', draft),
  editPost: (id: string, draft: PostDraft) => put<{ post: Post }>(`/api/amc/posts/${encodeURIComponent(id)}`, draft),
  deletePost: (id: string) => del<object>(`/api/amc/posts/${encodeURIComponent(id)}`),
  splitChoices: (statement: string) =>
    post<{ statement: string; choices: string[] }>('/api/amc/posts/split', { statement }),
  createProblem: (body: { like?: string; level?: string; topic?: string; technique?: string; rating?: number }) =>
    post<{ id: string }>('/api/amc/ai/create', body),
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
      by_strategy: (Omit<StrategyGroup, 'pills'> & { pills: TopicRow[] })[];
      next: NextPick[];
    }>(`/api/amc/topics/${encodeURIComponent(id)}`),
  strategies: () => get<{ families: StrategyFamily[]; untagged: number }>('/api/amc/strategies'),
  contests: () => get<ContestList>('/api/amc/contests'),
  contest: (id: string) => get<ContestDetail>(`/api/amc/contests/${encodeURIComponent(id)}`),
  submit: (id: string, answers: Record<string, string>, seconds: number) =>
    post<{ id: string }>(`/api/amc/contests/${encodeURIComponent(id)}/submit`, { answers, seconds }),
  mock: (id: string) => get<MockResult>(`/api/amc/mocks/${encodeURIComponent(id)}`),
  deleteMock: (id: string) => del<object>(`/api/amc/mocks/${encodeURIComponent(id)}`),
  importContest: (id: string, problems: string, key: string, save: boolean) =>
    post<ImportPreview>(`/api/amc/contests/${encodeURIComponent(id)}/import`, { problems, key, save }),
  removeImport: (id: string) => del<object>(`/api/amc/contests/${encodeURIComponent(id)}/import`),
  importBatches: () => get<{ batches: ImportBatch[]; missing: number; total: number }>('/api/amc/official/batches'),
  importBundle: (text: string, save: boolean) =>
    post<{ contests: BundleRow[]; saved: number }>('/api/amc/official/import', { text, save }),
  logScore: (id: string, score: number, note: string) =>
    post<object>(`/api/amc/contests/${encodeURIComponent(id)}/log`, { score, note }),
  plan: () => get<PlanPayload>('/api/amc/plan'),
  savePlan: (settings: PlanSettings) => put<PlanPayload>('/api/amc/plan', settings),
  clearPlan: () => del<object>('/api/amc/plan'),
  check: (key: string, done: boolean) => post<PlanPayload>('/api/amc/plan/check', { key, done }),
  coach: (answers: Record<string, string> = {}) =>
    post<PlanPayload>('/api/amc/plan/coach', { answers }, undefined),
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

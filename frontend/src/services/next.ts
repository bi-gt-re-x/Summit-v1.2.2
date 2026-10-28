/**
 * What to do next — the one list, decided on the server.
 *
 * The dashboard shows its top item and the analytics page's Recommendations
 * tab shows the whole plan, both from `/api/next_actions`, so the two cannot
 * suggest different things. The rules are backend/tracking/next_actions.py;
 * this is the shape they arrive in.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';
import type { GoalLens } from '@/utils/goalLens';

/** The minute buttons on the Recommendations tab. The server's BUDGETS. */
export const BUDGETS = [15, 30, 45, 60, 90, 120] as const;
export const DEFAULT_BUDGET = 45;

export type ActionKind =
  | 'deadline'
  | 'triage'
  | 'misses'
  | 'stuck'
  | 'overdue'
  | 'due'
  | 'goal'
  | 'weak-subject'
  | 'neglected'
  | 'review'
  | 'stale'
  | 'momentum'
  | 'streak'
  | 'slipping'
  | 'goal-quiet'
  | 'xp'
  /** The strongest suggestion from a skill tree. See backend/tracking/skill_plan.py. */
  | 'skill';

export interface NextAction {
  id: string;
  kind: ActionKind;
  /** The instruction: "Finish “Chapter 7”", "Practice Geometry". */
  title: string;
  /** The reason, with the figure behind it. */
  because: string;
  minutes: number;
  taskId?: string;
  subject?: string;
  goalId?: string;
  /** How the server ranked it. Not shown. */
  weight: number;
  /** A deadline row's sittings for this week: what "Book these" puts on the calendar. */
  book?: { count: number; minutes: number; title: string; milestoneId?: string | null };
  /** A deadline row's days to its date. */
  daysLeft?: number;
  /** A triage row's leftover routines: what "Clear them" deletes. */
  clear?: string[];
  /** Where the row's work is done: the review list ('/recommendations#review')
   *  or a skill on its tree ('/skill-trees?node=…'). */
  to?: string;
}

export interface Plan {
  budget: number;
  /** What fits, in order. The last may be part-started to use up the time. */
  actions: NextAction[];
  /** Minutes the plan leaves unused. */
  spare: number;
  /** Ranked too, but longer than what was left. */
  more: NextAction[];
  planned: number;
  /** The single best suggestion, whatever it costs — the dashboard's line. */
  top: NextAction | null;
}

export interface NextResult {
  plan: Plan;
  /** The goal the plan leans toward, and how — or null when none leads. */
  lens: GoalLens | null;
}

/** An empty plan, for before the answer arrives. */
export const NO_PLAN: Plan = {
  budget: DEFAULT_BUDGET, actions: [], spare: DEFAULT_BUDGET, more: [], planned: 0, top: null,
};

export function nextActions(budget: number = DEFAULT_BUDGET): Promise<ApiResult<NextResult>> {
  return get<NextResult>(`/api/next_actions?budget=${encodeURIComponent(budget)}`);
}

export interface Booked {
  /** `why` says why that time, in a sentence (backend/tracking/session_timing.py). */
  booked: { task_id: string; start: string; end: string; why?: string }[];
  title: string;
  minutes: number;
}

/**
 * Book the sittings a dated goal needs this week, on separate days, at the
 * hours the reader's record says work goes best. The server works the count
 * out again from the record rather than trusting the page's.
 */
export function bookSessions(goalId: string): Promise<ApiResult<Booked>> {
  return post<Booked>('/api/next_actions/book', { goal_id: goalId });
}

/** Delete the leftover routines a triage row named. Only real leftovers go. */
export function clearLeftovers(taskIds: string[]): Promise<ApiResult<{ cleared: string[] }>> {
  return post<{ cleared: string[] }>('/api/next_actions/clear', { task_ids: taskIds });
}

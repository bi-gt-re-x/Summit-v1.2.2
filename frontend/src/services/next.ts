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
  | 'skill'
  /** A dated thing no goal covers (an audition, an essay due), taking today's first
   *  block. See backend/tracking/priority.py. */
  | 'commitment'
  /** A skill whose sessions are done and whose check is waiting. Opens the check. */
  | 'check';

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
  /** Where the time should go and why. backend/tracking/priority.py. */
  priority?: PriorityDecision;
  /** True when the reader didn't pick a length and the plan is sized to what fits today. */
  auto_budget?: boolean;
  /** Fixes from Your patterns (Insights) to have in mind before today's sessions. */
  behavior?: BehaviorReminder[];
}

export interface BehaviorReminder {
  behavior_id: string;
  title: string;
  fix: string;
  how: string;
  tasks: string[];
  more: number;
}

/** A dated thing coming up that needs preparing for. backend/tracking/capacity.py. */
export interface Commitment {
  key: string;
  title: string;
  kind: 'event' | 'task';
  day: string;
  days_left: number;
  time?: string;
  task_id?: string;
  subject?: string;
  /** The goal it's about, when it shares the goal's words or contest. */
  goal_id?: string;
  goal?: string;
}

/** How much fits today. backend/tracking/capacity.py. */
export interface Capacity {
  /** Minutes usually worked on this weekday (or on days worked lately), or null when unknown. */
  usual: number | null;
  usual_days: number;
  usual_of: number;
  usual_label: string | null;
  weekday: boolean;
  evidence: string | null;
  done: number;
  busy: number;
  free: number;
  left: number;
  total: number | null;
  booked: number;
  over: number;
  asked: { task_id: string; title: string; minutes: number; goal_id: string }[];
  move: { task_id: string; title: string; minutes: number; goal_id: string }[];
  auto: boolean;
  line: string;
}

/** How pressing things are: a date inside two weeks, one that's behind, or neither. */
export type PriorityMode = 'none' | 'balance' | 'push' | 'crunch';

export interface PriorityAllotment {
  goal_id: string;
  title: string;
  minutes: number;
  /** The next open step, by the reader's own title. */
  step: string | null;
  days_left: number | null;
  state: string;
  percent: number;
  /** Checkpoints that come after this one. */
  waiting: number;
  /** The weakest part of the goal to spend it on, when the record can name one. */
  best_use: string | null;
  /** 'commitment' for a dated thing no goal covers, taking the first block. */
  kind?: 'goal' | 'commitment';
  commitment?: Commitment | null;
}

export interface PriorityGoal {
  goal_id: string;
  title: string;
  days_left: number | null;
  state: string;
  percent: number;
  priority: number;
  gets_time: boolean;
  needs: number | null;
  pace: number | null;
  /** Percent of the goal a session has moved so far, when there's enough to say. */
  gain: number | null;
  gain_evidence: string | null;
  matters: string;
  /** Ambition: the goal's own 1-10, how much it matters overall. */
  ambition?: number;
  ambition_label?: string;
  /** Priority right now: 'Today', 'Next', 'Waits', 'Can wait' or 'Done', and why. */
  now?: string;
  now_why?: string;
  /** A commitment that's about this goal: its nearest date this week. */
  commitment?: { title: string; days_left: number } | null;
}

export interface PriorityDecision {
  mode: PriorityMode;
  headline: string | null;
  warning?: string | null;
  /** Why nothing could be decided, when `mode` is 'none'. */
  note?: string | null;
  focus: {
    goal_id: string;
    title: string;
    days_left: number | null;
    percent: number;
    next: string | null;
    state: string;
    subject: string | null;
  } | null;
  until: string | null;
  allocation: PriorityAllotment[];
  /** Goals that move anyway, because they're the same work. */
  also?: string[];
  answers: { key: string; question: string; answer: string }[];
  /** What to deliberately leave alone, and why. */
  not_now: { key: string; title: string; why: string }[];
  counters: number;
  goals: PriorityGoal[];
  /** Dated things coming up, each with the goal it's about when there is one. */
  commitments?: Commitment[];
  /** The commitment taking today's first block, when one does. */
  lead?: Commitment | null;
  /** The goal that matters most to the reader, whatever today needs. */
  ambition_top?: { goal_id: string; title: string; priority: number; gets_time: boolean } | null;
  capacity?: Capacity | null;
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

/** Today's plan. With no budget, the server sizes it to what fits today. */
export function nextActions(budget?: number | null): Promise<ApiResult<NextResult>> {
  return get<NextResult>('/api/next_actions', budget ? { budget } : undefined);
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

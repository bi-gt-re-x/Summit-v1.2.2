/**
 * Goals — "earn N XP", "reach an N-day streak", "complete N tasks",
 * "focus N minutes".
 *
 * Two of the four track themselves and the client should not try to help. A
 * streak goal follows the account's live streak, up as it grows and back to
 * zero when it breaks; a focus goal measures time accumulated since it was
 * set. Both are re-synced by the backend on every `getGoals()`, which is why
 * that call is the way to refresh them and why polling it is how the goals
 * page stays live.
 *
 * Backend: backend/api/goals.py.
 */
import { get, post } from './api';
import type { ApiResult, Goal, GoalCategory, GoalMeasure, GoalType, MilestoneStatus, MilestoneStep } from '@/types';

export interface GoalsResult {
  goals: Goal[];
  /** Average XP per active day — the goals page's "IN PROGRESS" card. */
  avg_xp_per_day: number;
}

/** Every goal, with the self-tracking ones brought up to date first. */
export function getGoals(): Promise<ApiResult<GoalsResult>> {
  return get<GoalsResult>('/api/get_goals');
}

export interface NewGoal {
  title: string;
  goal_type: GoalType;
  description?: string;
  /** Only the target matching `goal_type` is required. */
  target_xp?: number;
  target_streak?: number;
  target_tasks?: number;
  target_focus?: number;
  priority?: number;
  deadline?: string;
  id?: string;

  /**
   * How success is measured. Left out, the backend falls back to `goal_type`
   * — which is what the old modal, which does not know this field exists,
   * relies on.
   */
  measure?: GoalMeasure;
  category?: GoalCategory;
  why?: string;
  start_date?: string;
  unit?: string;
  current_value?: number;
  target_number?: number;
  subject_ids?: string;
  /** Which chart the card draws; empty lets the page pick. */
  chart?: string;
  /** Checkpoint titles to create with the goal, in execution order. */
  milestones?: string[];
}

export function addGoal(
  goal: NewGoal,
): Promise<ApiResult<{ message: string; id: string }>> {
  return post('/api/add_goal', { ...goal });
}

/**
 * Edit a goal. Only the fields present are written.
 *
 * `progress` is not on the list and cannot be: it is what the goal's own
 * numbers come to, recomputed on the server after every write. Sending one
 * would be a client asserting a percentage its own milestone list disagrees
 * with. Set `current_value`, tick a milestone, or move a target instead.
 */
export type GoalEdit = Partial<
  Pick<
    Goal,
    | 'title'
    | 'description'
    | 'status'
    | 'goal_type'
    | 'deadline'
    | 'priority'
    | 'current_xp'
    | 'current_streak'
    | 'current_tasks'
    | 'current_focus'
    | 'target_xp'
    | 'target_streak'
    | 'target_tasks'
    | 'target_focus'
    | 'measure'
    | 'category'
    | 'why'
    | 'start_date'
    | 'unit'
    | 'current_value'
    | 'target_number'
    | 'subject_ids'
    | 'chart'
  >
>;

export function updateGoal(
  goalId: string,
  edit: GoalEdit,
): Promise<ApiResult<Record<string, never>>> {
  return post('/api/update_goal', { id: goalId, ...edit });
}

export function deleteGoal(
  goalId: string,
): Promise<ApiResult<Record<string, never>>> {
  return post('/api/delete_goal', { goal_id: goalId });
}

// --------------------------------------------------------------------------
// Milestones
// --------------------------------------------------------------------------
/**
 * The checkpoints come down with their goal on every `getGoals`, so there is
 * no read call here — only the four writes. Each one is followed by a re-read
 * on the page, for the same reason every other write on it is: the server
 * re-derives the goal's percentage and status from the checkpoint that just
 * moved, and patching that in the client would be a second opinion.
 */
export function addMilestone(
  goalId: string,
  milestone: { title: string; note?: string; target_date?: string },
): Promise<ApiResult<{ id: string }>> {
  return post<{ id: string }>('/api/add_milestone', { goal_id: goalId, ...milestone });
}

/**
 * Five step titles for one checkpoint, from the model. Writes nothing.
 *
 * The checklist counterpart of `suggestMilestones`, with the same contract:
 * a draft, and every failure back as `success: false` with a message meant to
 * be shown. `updateMilestone` is what saves them, exactly as it saves a
 * checklist typed by hand.
 *
 * Identify the checkpoint with `milestoneId` — it carries its goal with it —
 * or pass a `title` and the `goalId` it sits under, for one not yet written.
 */
export function suggestSteps(
  step: { milestoneId?: string; goalId?: string; title?: string },
): Promise<ApiResult<{ steps: string[] }>> {
  return post<{ steps: string[] }>('/api/suggest_steps', {
    milestone_id: step.milestoneId,
    goal_id: step.goalId,
    title: step.title,
  });
}

export function updateMilestone(
  milestoneId: string,
  edit: {
    title?: string;
    note?: string;
    status?: MilestoneStatus;
    target_date?: string;
    /** The whole checklist. Sent entire — see UpdateMilestone in the API. */
    steps?: MilestoneStep[];
  },
): Promise<ApiResult<Record<string, never>>> {
  return post('/api/update_milestone', { id: milestoneId, ...edit });
}

export function deleteMilestone(
  milestoneId: string,
): Promise<ApiResult<Record<string, never>>> {
  return post('/api/delete_milestone', { id: milestoneId });
}

/**
 * Five checkpoint titles for a goal, from the model. Writes nothing.
 *
 * A draft the page puts into five editable fields — `setMilestones` below is
 * what saves them. Identify an existing goal with `goalId`, or pass a `title`
 * for one that does not exist yet, which is what the creation wizard has.
 *
 * Failure here is ordinary: no API key configured, the model unreachable, an
 * answer that could not be read. All of them come back as `success: false`
 * with a message written to be shown, so the caller reports it on the goal
 * rather than treating it as the page breaking.
 */
export function suggestMilestones(
  goal: {
    goalId?: string;
    title?: string;
    why?: string;
    description?: string;
    category?: string;
    /** For a goal not yet written; an existing one's is read from its row. */
    deadline?: string;
  },
): Promise<ApiResult<{ milestones: string[] }>> {
  return post<{ milestones: string[] }>('/api/suggest_milestones', {
    goal_id: goal.goalId,
    title: goal.title,
    why: goal.why,
    description: goal.description,
    category: goal.category,
    deadline: goal.deadline,
  });
}

/** A whole goal, drafted from one sentence. Nothing is created. */
export interface DraftedGoal {
  title: string;
  why: string;
  category: GoalCategory;
  /** An ISO day, computed on the server from the duration the model gave. */
  deadline: string;
  milestones: string[];
}

/**
 * Turn one sentence into a filled-in goal. Writes nothing.
 *
 * The other two suggestion calls break down a goal that exists. This one comes
 * first: the reader types roughly what they want and gets back a title, the
 * reason, a field, a target date and the five checkpoints, all of it landing
 * in the creation wizard's own fields for them to edit. Only the wizard's save
 * creates anything.
 *
 * Needs a provider that will hold a fixed shape, which is not all of them —
 * the failure message says so and names the ones that do.
 */
export function draftGoal(idea: string): Promise<ApiResult<DraftedGoal>> {
  return post<DraftedGoal>('/api/draft_goal', { idea });
}

/**
 * Write a goal's whole checkpoint list at once, in order.
 *
 * The other half of the suggestion flow, and the reason it is one call: five
 * drafts saved through `addMilestone` would be five writes and five re-reads
 * for something the user did once. The server reuses existing rows by
 * position, so a checkpoint that keeps its place keeps its id, its status and
 * the tasks pointed at it — renaming the third does not reopen it.
 *
 * At most five, which is what the ladder on the page draws.
 */
export function setMilestones(
  goalId: string,
  titles: string[],
): Promise<ApiResult<Record<string, never>>> {
  return post('/api/set_milestones', { goal_id: goalId, titles });
}

/** The new execution order, as milestone ids. */
export function reorderMilestones(
  goalId: string,
  order: string[],
): Promise<ApiResult<Record<string, never>>> {
  return post('/api/reorder_milestones', { goal_id: goalId, order });
}

export interface ProgressResult {
  goal_type: GoalType;
  current: number;
  target: number;
  status: Goal['status'];
  completed: boolean;
}

/**
 * Add to one goal's counter by hand, capped at its target.
 *
 * Only XP, streak and task goals can be advanced this way — a focus goal reads
 * its progress from tracked focus time and ignores a manual nudge.
 */
export function addProgress(
  goalId: string,
  amount: { xp?: number; streak?: number; tasks?: number },
): Promise<ApiResult<ProgressResult>> {
  return post<ProgressResult>('/api/update_goal_progress', {
    goal_id: goalId,
    xp_to_add: amount.xp ?? 0,
    streak_to_add: amount.streak ?? 0,
    tasks_to_add: amount.tasks ?? 0,
  });
}

export interface AppliedXp {
  updated: Array<{
    id: string;
    title: string;
    current_xp: number;
    target_xp: number;
    status: Goal['status'];
  }>;
  completed: AppliedXp['updated'];
}

/**
 * Apply a completed task's XP to every active XP goal.
 *
 * `completeTask` already does this server-side, so this is for the cases where
 * XP was earned some other way — not something to call after a completion, or
 * the XP counts twice.
 */
export function applyTaskXp(
  xp: number,
): Promise<ApiResult<AppliedXp>> {
  return post<AppliedXp>('/api/auto_apply_task_xp', { xp });
}

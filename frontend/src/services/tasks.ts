/**
 * Tasks — the unit of work the whole app is built on.
 *
 * `completeTask` is the one that matters. It is a single call because the
 * backend does the whole thing in one pass: stamps the task done, records how
 * long it took and whether it beat its deadline, awards the XP, recalculates
 * the level, extends the streak, writes a row to the XP ledger and counts the
 * completion toward the user's "complete N tasks" goals. The client never
 * computes any of that — it renders what comes back.
 *
 * Backend: backend/api/tasks.py, backend/api/dashboard.py.
 */
import { del, get, post, put } from './api';
import type { ApiResult, Task, UserStats } from '@/types';

// --------------------------------------------------------------------------
// Reading
// --------------------------------------------------------------------------
export interface UserData {
  stats: UserStats;
  tasks: Task[];
}

/**
 * The dashboard's first call, and the one most other pages piggyback on.
 *
 * Reading this also decays a streak that went stale overnight, so it is the
 * call that makes every page agree on the streak.
 */
export function getUserData(): Promise<ApiResult<UserData>> {
  return get<UserData>('/api/get_user_data');
}

/**
 * The six numbers, without the task list.
 *
 * The read every page makes. `getUserData` above is the same six numbers plus
 * several megabytes of tasks, which is why it is no longer what the rail and
 * the top bar call — see context/StatsProvider.
 *
 * This is also the call that decays a streak gone stale overnight. Exactly one
 * endpoint does that (backend/api/dashboard.py says why it is this one), so
 * this is the read that makes every page agree on the streak.
 */
export function getStats(): Promise<ApiResult<{ stats: UserStats }>> {
  return get<{ stats: UserStats }>('/api/stats');
}

/**
 * Three counts about the account's tasks. Counted in SQL, not by filtering a
 * list.
 *
 * **The bell no longer reads this.** It is a list of rows now — see
 * services/notifications and backend/tracking/notify.py — because a count
 * cannot be deleted, and being able to throw a notification away is the whole
 * of what the bell was missing.
 *
 * Kept for the reason the calendar entry wrappers in services/events are: the
 * endpoint is real, cheap and correct, and this file is the shape of the API
 * rather than a list of what happens to be called this week.
 */
export interface Alerts {
  /** Open tasks whose date has passed, and the oldest one's title. */
  late: number;
  late_title: string | null;
  /** Open tasks dated today, and one of their titles. */
  due_today: number;
  due_today_title: string | null;
  /** Whether anything at all has been finished today. */
  finished_today: boolean;
}

/**
 * @param day The caller's local ISO day. Sent rather than left to the server
 *            because stored stamps carry no timezone, so "today" is the
 *            reader's day and only the reader knows it.
 */
export function getAlerts(day: string): Promise<ApiResult<{ alerts: Alerts }>> {
  return get<{ alerts: Alerts }>('/api/alerts', { day });
}

/**
 * Title search for the top bar's panel.
 *
 * Was a `.filter()` over the account's whole task list, which is most of why
 * the top bar needed that list. Unfinished results come first, which is the
 * ordering the panel has always applied.
 *
 * @param openOnly Drop the finished ones. The top bar passes this: what it
 *                 does with a result is take the reader to it, and a finished
 *                 task is not somewhere anybody needs taking. It also matters
 *                 because the server caps the answer at eight — without it a
 *                 word appearing in nine done tasks and one live one comes
 *                 back without the live one.
 */
export function searchTasks(
  query: string,
  openOnly = false,
): Promise<ApiResult<{ tasks: Task[] }>> {
  return get<{ tasks: Task[] }>('/api/tasks/search', {
    q: query,
    open: openOnly ? 1 : undefined,
  });
}

export function listTasks(): Promise<ApiResult<{ tasks: Task[] }>> {
  return get<{ tasks: Task[] }>('/api/tasks');
}

// --------------------------------------------------------------------------
// Writing
// --------------------------------------------------------------------------
export interface NewTask {
  name: string;
  priority?: Task['priority'];
  xp_reward?: number;
  due_date?: string | null;
  show_on_calendar?: boolean;
  /**
   * What the task is about — an id from the catalogue the backend serves at
   * /api/subjects. Optional, and anything the catalogue does not recognise is
   * dropped there rather than stored.
   */
  subject?: string | null;
  /** The week calendar's drag-to-create uses this to place the block. */
  created_at?: string;
  id?: string;
  /**
   * What this task is execution for.
   *
   * Everything that reads a goal link — goal health, Next Moves, a goal card's
   * action list — has always read these two columns, and until now nothing
   * could write one. The goals page's "Add new action" is the first caller.
   * Both are checked against the account's own goals server-side and dropped if
   * they do not hold up; see `_link` in backend/api/tasks.py.
   */
  goal_id?: string;
  milestone_id?: string;
}

export function createTask(
  task: NewTask,
): Promise<ApiResult<{ task_id: string }>> {
  return post<{ task_id: string }>('/api/tasks', { ...task });
}

/**
 * Edit a task. Only the fields present are written.
 *
 * `completed` is meaningful as `false` — it re-opens a finished task — so the
 * caller must leave it out rather than pass undefined when it means "don't
 * touch this".
 */
export interface TaskEdit {
  name?: string;
  priority?: Task['priority'];
  xp_reward?: number;
  timer_duration?: number;
  due_date?: string | null;
  completed?: boolean;
  /** `null` clears it; leaving it out leaves whatever is stored alone. */
  subject?: string | null;
  /**
   * The goal this task is execution for. `null` unlinks it; leaving it out
   * leaves the stored link alone. Checked against the account's own goals
   * server-side, so a stale id unlinks rather than failing the write.
   */
  goal_id?: string | null;
  milestone_id?: string | null;
}

export function updateTask(
  taskId: string,
  edit: TaskEdit,
): Promise<ApiResult<Record<string, never>>> {
  return put(`/api/tasks/${encodeURIComponent(taskId)}`, { ...edit });
}

export function deleteTask(
  taskId: string,
): Promise<ApiResult<Record<string, never>>> {
  return del(`/api/tasks/${encodeURIComponent(taskId)}`);
}

/**
 * Delete a task with no XP, streak or count side effects.
 *
 * For a terminated timer: the task never happened, so nothing about the
 * account's progression should move.
 */
export function deleteTaskWithoutTracking(
  taskId: string,
): Promise<ApiResult<Record<string, never>>> {
  return post('/api/delete_task_no_tracking', { id: taskId });
}

export function pushDueDate(
  taskId: string,
  dueDate: string,
): Promise<ApiResult<Record<string, never>>> {
  return post('/api/update_task_due_date', {
    id: taskId,
    due_date: dueDate,
  });
}

// --------------------------------------------------------------------------
// Status, timers, completion
// --------------------------------------------------------------------------
export function getTaskStatus(
  taskId: string,
): Promise<ApiResult<{ status: Task['status']; completed: boolean }>> {
  return post('/api/get_task_status', { task_id: taskId });
}

/** Record that a task's timer ran out before it was finished. */
export function timerExpired(
  taskId: string,
): Promise<ApiResult<{ message: string; task_id: string }>> {
  return post('/api/timer_expired', { task_id: taskId });
}

/** Everything that moves when a task is completed. */
export interface CompletionResult {
  message: string;
  xp_earned: number;
  /** XP within the new level, not the lifetime total. */
  new_xp: number;
  new_level: number;
  new_tasks_completed: number;
  xp_required: number;
  current_streak: number;
  best_streak: number;
  task_id: string;
  completion_status: 'done';
}

export function completeTask(
  taskId: string,
): Promise<ApiResult<CompletionResult>> {
  return post<CompletionResult>('/api/complete_task', {
    task_id: taskId,
  });
}

/** What one batch completion did, task by task, and where it left the account. */
export interface BatchCompletionResult {
  /** Finished by this call, each with the XP it earned. */
  completed: { task_id: string; xp_earned: number; completed_at: string }[];
  /** Already finished before it. Nothing was awarded again. */
  already_done: string[];
  /** Not this account's, or not there. */
  not_found: string[];
  /** In a chunk the server could not write. Untouched, and safe to send again. */
  failed: string[];
  xp_earned: number;
  new_xp: number;
  new_level: number;
  new_tasks_completed: number;
  xp_required: number;
  current_streak: number;
  best_streak: number;
}

/** The most one request may carry; backend MAX_COMPLETE. */
export const MAX_COMPLETE = 1000;

/**
 * Complete many tasks as one action.
 *
 * One request for any selection up to MAX_COMPLETE, rather than one per task.
 * Duplicate ids are dropped before sending. A larger selection goes as several
 * requests, one after another — never in parallel, since they all move the
 * same account — and the replies are merged into one, so the caller still
 * makes one state update however many requests it took.
 *
 * Safe to retry: a task already done is reported in `already_done` and earns
 * nothing twice.
 */
export async function completeTasks(
  taskIds: readonly string[],
): Promise<ApiResult<BatchCompletionResult>> {
  const ids = [...new Set(taskIds.map(String))];
  const merged: BatchCompletionResult = {
    completed: [], already_done: [], not_found: [], failed: [],
    xp_earned: 0, new_xp: 0, new_level: 0, new_tasks_completed: 0,
    xp_required: 0, current_streak: 0, best_streak: 0,
  };
  if (ids.length === 0) return { success: true, ...merged };

  for (let at = 0; at < ids.length; at += MAX_COMPLETE) {
    const part = ids.slice(at, at + MAX_COMPLETE);
    const result = await post<BatchCompletionResult>('/api/complete_tasks', { task_ids: part });
    if (!result.success) {
      // Everything not yet sent is as untouched as a failed chunk, and as safe
      // to send again.
      if (at === 0) return result;
      merged.failed.push(...ids.slice(at));
      break;
    }
    merged.completed.push(...result.completed);
    merged.already_done.push(...result.already_done);
    merged.not_found.push(...result.not_found);
    merged.failed.push(...result.failed);
    merged.xp_earned += result.xp_earned;
    // The account's standing is whatever the last reply left it at.
    merged.new_xp = result.new_xp;
    merged.new_level = result.new_level;
    merged.new_tasks_completed = result.new_tasks_completed;
    merged.xp_required = result.xp_required;
    merged.current_streak = result.current_streak;
    merged.best_streak = result.best_streak;
    if (result.failed.length) break;
  }
  return { success: true, ...merged };
}

export interface TaskRating {
  task_id: string;
  difficulty?: number;
  execution?: number;
  /** Null when the answer was taken back, absent when it was never asked. */
  reason?: string | null;
}

/**
 * What the person thought of a task they just finished.
 *
 * A separate call from `completeTask`, and deliberately so: completing is the
 * act and this is an opinion about it. A task stays done whether or not the
 * prompt that follows is answered, dismissed, or fails to reach the server —
 * nobody's XP sits behind a dialog.
 *
 * Any of the three may be omitted. A reader who answers one row and closes the
 * dialog keeps the answer they gave. `reason` is only ever sent by an account
 * whose rating_depth is 'reasons'; the server drops a word it does not know
 * rather than failing the whole call over it.
 */
export function rateTask(
  taskId: string,
  ratings: { difficulty?: number; execution?: number; reason?: string },
): Promise<ApiResult<TaskRating>> {
  return post<TaskRating>('/api/rate_task', {
    task_id: taskId,
    ...ratings,
  });
}

/**
 * The most recent completion, as `{xp, at}` where `at` is its ledger id.
 *
 * The goals page polls this so a task completed on the dashboard signals
 * through to its console — `at` changes, and that is the signal.
 */
export function lastCompletion(
): Promise<ApiResult<{ xp: number | null; at: string | null }>> {
  return get('/api/last_task_completion');
}

// --------------------------------------------------------------------------
// Stats
// --------------------------------------------------------------------------
/** Fold a batch of XP and completions into today's single ledger row. */
export function trackDailyXp(
  xpEarned: number,
  tasksCompleted: number,
): Promise<ApiResult<{ message: string }>> {
  return post('/api/track_daily_xp', {
    xp_earned: xpEarned,
    tasks_completed: tasksCompleted,
  });
}

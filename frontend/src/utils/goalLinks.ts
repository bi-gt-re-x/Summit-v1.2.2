/**
 * Which goals a task counts toward — the one question every goal figure asks.
 *
 * The answer is worked out on the server when a task is written and arrives
 * on the task as `goal_ids` (backend/goal_matcher). Nothing here matches
 * anything: these read what was stored, so a page counting ten thousand tasks
 * does ten thousand array lookups and no text comparison at all.
 *
 * Every goal count on the Goals and Analytics pages goes through these rather
 * than reading `task.goal_id`. That field is only the goal linked *by hand*;
 * reading it alone leaves out every task the matcher tied to a goal from its
 * title, which is most of them.
 *
 * `goal_id` is still honoured on its own for a task the matcher has not
 * reached yet — one written before it existed. It is the explicit link, so it
 * is right; it just may not be all of the answer.
 */

interface Linkable {
  goal_id?: string | null;
  goal_ids?: string[] | null;
}

const NONE: readonly string[] = Object.freeze([]);

/** Every goal the task counts toward, strongest first. Empty when none. */
export function goalIdsOf(task: Linkable): readonly string[] {
  if (task.goal_ids && task.goal_ids.length) {
    // The hand-made link is stored as a match too, but a task linked after it
    // was last matched could carry one the list does not have yet.
    if (task.goal_id && !task.goal_ids.includes(task.goal_id)) {
      return [task.goal_id, ...task.goal_ids];
    }
    return task.goal_ids;
  }
  return task.goal_id ? [task.goal_id] : NONE;
}

/** Whether the task counts toward this goal. */
export function countsToward(task: Linkable, goalId: string): boolean {
  if (task.goal_id === goalId) return true;
  return Boolean(task.goal_ids && task.goal_ids.includes(goalId));
}

/** Whether the task counts toward any goal at all. */
export function isGoalWork(task: Linkable): boolean {
  return Boolean(task.goal_id) || Boolean(task.goal_ids && task.goal_ids.length);
}

/**
 * Tasks per goal, in one pass over the list.
 *
 * The loop the design asks for: each task adds one to every goal it counts
 * toward. A task toward two goals counts once for each — it is work on both.
 */
export function tasksByGoal<T extends Linkable>(tasks: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const task of tasks) {
    for (const goalId of goalIdsOf(task)) {
      const list = out.get(goalId);
      if (list) list.push(task);
      else out.set(goalId, [task]);
    }
  }
  return out;
}

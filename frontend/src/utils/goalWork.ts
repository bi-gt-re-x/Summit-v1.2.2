/**
 * What has actually been done toward each goal, and how that work got there.
 *
 * ## The gap this fills
 *
 * The Goals tab could say whether a goal was on pace, how its checkpoints were
 * falling and what share of the reader's effort it held — and not one panel
 * said *what they had done*. A goal at 20% with four finished tasks and a goal
 * at 20% with forty are different situations, and the tab drew them
 * identically. `effortAgainstPriority` comes closest and is a different
 * question: it is about allocation between goals, as proportions, and a
 * proportion cannot tell you whether the denominator is four tasks or four
 * hundred.
 *
 * So this counts the work itself — tasks finished, XP earned, time recorded,
 * and when the last of it happened — per goal, from the same task rows every
 * other panel on the page reads.
 *
 * ## Chosen, matched, and neither
 *
 * A task counts toward a goal in one of two ways, and the difference is worth
 * keeping rather than summing away:
 *
 *   * **chosen** — the reader said so, either in the form that created the task
 *     or from the row menu afterwards. Stored as `goal_id`, and nothing
 *     recomputes it.
 *   * **matched** — the matcher read the title and the subject and decided.
 *     Stored in `goal_ids` (backend/goal_matcher), and rebuilt whenever the
 *     goal or the task changes.
 *
 * A reader looking at "43 tasks toward this goal" is entitled to know how many
 * of them they filed there themselves, because the two carry different
 * confidence: the first is a statement, the second is an inference that can be
 * wrong. `coverage` below is the same split over the whole record, which is
 * what makes the counting rule visible on the page rather than being something
 * the reader has to deduce from a goal's total moving on its own.
 *
 * Nothing here invents a link. A task the reader did not file and the matcher
 * did not recognise counts toward nothing, and is reported as exactly that.
 */
import { countsToward, goalIdsOf } from './goalLinks';
import type { Goal, Task } from '@/types';

/** One goal's record of work. */
export interface GoalWorkRow {
  id: string;
  title: string;
  /** Finished tasks that count toward it, however they came to. */
  finished: number;
  /** Of those, the ones the reader filed here themselves. */
  chosen: number;
  /** Of those, the ones the matcher recognised from the name. */
  matched: number;
  /** XP earned by the finished ones. */
  xp: number;
  /** Recorded time on the finished ones, in minutes. 0 when none was timed. */
  minutes: number;
  /** The day the most recent one was finished, ISO, or '' for none. */
  lastWorked: string;
  /** Days since that day, or null when there is nothing to date. */
  daysSince: number | null;
}

/** How the whole record reaches goals, or fails to. */
export interface LinkCoverage {
  /** Finished tasks, all of them. */
  finished: number;
  /** Finished tasks the reader filed against a goal. */
  chosen: number;
  /** Finished tasks the matcher linked and the reader did not. */
  matched: number;
  /** Finished tasks counting toward nothing. */
  loose: number;
  /** `chosen + matched` as a share of `finished`, 0-1. */
  share: number;
}

const DAY = 86_400_000;

function dayOf(task: Task): string {
  return String(task.completed_at ?? '').slice(0, 10);
}

function minutesOf(task: Task): number {
  const seconds = Number(task.completion_seconds);
  return Number.isFinite(seconds) && seconds > 0 ? seconds / 60 : 0;
}

/**
 * Per-goal work, busiest first, for the live goals.
 *
 * Completed goals are left out for the same reason the effort panel leaves them
 * out: this is a panel about where the work is going, and a finished goal is
 * not somewhere it can still go. What was done toward it is on its own card.
 *
 * Goals with no finished work are kept. A goal the reader set and has not
 * touched is the strongest row this can produce, and dropping it would hide
 * exactly the case worth seeing — the same rule `effortAgainstPriority`
 * follows and for the same reason.
 */
export function goalWork(goals: Goal[], tasks: Task[], today: Date = new Date()): GoalWorkRow[] {
  const live = goals.filter((goal) => goal.status !== 'completed');
  if (live.length === 0) return [];

  const midnight = new Date(today.toDateString()).getTime();

  return live
    .map((goal) => {
      const id = String(goal.id);
      let finished = 0;
      let chosen = 0;
      let matched = 0;
      let xp = 0;
      let minutes = 0;
      let lastWorked = '';

      for (const task of tasks) {
        if (task.status !== 'done') continue;
        if (!countsToward(task, id)) continue;
        finished += 1;
        // The chosen link wins where both exist: the matcher stores its result
        // alongside a hand-made link rather than replacing it, so a task can
        // be both and is only one thing to the reader who filed it.
        if (String(task.goal_id ?? '') === id) chosen += 1;
        else matched += 1;
        xp += Number(task.xp_value) || 0;
        minutes += minutesOf(task);
        const day = dayOf(task);
        if (day > lastWorked) lastWorked = day;
      }

      const at = lastWorked ? Date.parse(`${lastWorked}T00:00:00`) : NaN;
      return {
        id,
        title: goal.title,
        finished,
        chosen,
        matched,
        xp,
        minutes: Math.round(minutes),
        lastWorked,
        daysSince: Number.isNaN(at) ? null : Math.max(0, Math.round((midnight - at) / DAY)),
      };
    })
    .sort((a, b) => b.finished - a.finished || b.xp - a.xp)
    .slice(0, 8);
}

/**
 * The same split over the whole record: what reaches a goal, and what does not.
 *
 * Counted over finished tasks only. An unfinished task counts toward nothing
 * yet whatever it is linked to, and including them would make the "counting
 * toward nothing" figure a measure of how much is on the list rather than of
 * how much of the work was aimed.
 *
 * `loose` is not a fault and is not reported as one. Most accounts have real
 * work that belongs to no goal, and a page that treats every unlinked task as
 * something to go and fix would be asking the reader to file "email Mr Chen"
 * against a five-year plan.
 */
export function linkCoverage(tasks: Task[]): LinkCoverage {
  let finished = 0;
  let chosen = 0;
  let matched = 0;

  for (const task of tasks) {
    if (task.status !== 'done') continue;
    finished += 1;
    if (task.goal_id) chosen += 1;
    else if (goalIdsOf(task).length > 0) matched += 1;
  }

  const linked = chosen + matched;
  return {
    finished,
    chosen,
    matched,
    loose: finished - linked,
    share: finished > 0 ? linked / finished : 0,
  };
}

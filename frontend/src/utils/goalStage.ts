/**
 * Which checkpoint a goal is on.
 *
 * One rule, in one place, because three pages now say it out loud: the goal
 * card (components/Goals/ActiveGoalCard), the goal's own rail
 * (`GoalChain` in components/Goals/Outcome) and the climb on the Timer page.
 * Both of the first two carried the rule inline with a comment warning that it
 * had to agree with the other — which is a duplication asking to be noticed,
 * and the third copy is what turns "asking to be noticed" into a page saying a
 * goal is on two different stages.
 *
 * The rule: the checkpoint explicitly made **active**, else the first one that
 * is not **done**. The second half is why the order matters — checkpoints are
 * held in execution order (`position`, dense from 0, see `Milestone` in
 * types/models.ts) and never sorted by date, so "the first not done" means the
 * next one in the plan and not the next one in the calendar.
 *
 * Null when every checkpoint is finished, and null for a goal with none: a
 * goal measured some other way is not on a stage, and inventing one for it
 * would put a checkpoint on a page that its owner never wrote.
 */
import type { Goal, Milestone } from '@/types';

export function currentStone(goal: Goal): Milestone | null {
  const stones = goal.milestones ?? [];
  return stones.find((stone) => stone.status === 'active')
    ?? stones.find((stone) => stone.status !== 'done')
    ?? null;
}

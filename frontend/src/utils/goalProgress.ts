/**
 * A checkpoint goal's progress, worked out the way the server works it out.
 *
 * The server is the one that stores a goal's `progress` (`_recompute` in
 * backend/api/goals.py), and it counts every ticked step, not only every
 * reached checkpoint: an open checkpoint counts for the share of its named
 * steps that are ticked, capped below a whole one. This is the same rule on
 * the client, so the Goals page can move a card's ring, figure and route the
 * moment a step is ticked, rather than a round trip later. When the server
 * answers, its figure replaces this one, and they agree.
 *
 * Kept in step with the backend by tests on both sides: goalProgress.test.ts
 * here, tests/test_goal_verify.py there.
 */
import type { Goal, Milestone, MilestoneStep } from '@/types';

/** The most an open checkpoint counts for. Matches OPEN_STONE_CAP on the server. */
export const OPEN_STONE_CAP = 0.9;

/** How much of one checkpoint is done, from 0 to 1. */
export function stoneShare(stone: Pick<Milestone, 'status' | 'steps'>): number {
  if (stone.status === 'done') return 1;
  const named = (stone.steps ?? []).filter((step) => !step.placeholder);
  if (!named.length) return 0;
  return Math.min(OPEN_STONE_CAP, named.filter((step) => step.done).length / named.length);
}

/** A checkpoint goal's progress, 0-100, to one decimal. */
export function stonesProgress(stones: Pick<Milestone, 'status' | 'steps'>[]): number {
  if (!stones.length) return 0;
  const sum = stones.reduce((total, stone) => total + stoneShare(stone), 0);
  return Math.round((1000 * sum) / stones.length) / 10;
}

/**
 * The goal as it will be once a change to its checkpoints is saved.
 *
 * Only a checkpoint goal's figures are worked out here; anything else keeps
 * the server's. Reaching the last checkpoint completes the goal and raises the
 * "is it really done?" question at once, the same two things the server does
 * — see `_mark_reached` there.
 */
export function withStones(goal: Goal, stones: Milestone[]): Goal {
  const measure = goal.measure || goal.goal_type;
  if (measure !== 'milestones' || !stones.length) return { ...goal, milestones: stones };
  const reached = stones.every((stone) => stone.status === 'done');
  const wasDone = goal.status === 'completed';
  return {
    ...goal,
    milestones: stones,
    progress: stonesProgress(stones),
    status: reached ? 'completed' : 'active',
    needs_verify: reached ? (wasDone ? goal.needs_verify : !goal.verified_at) : false,
    verified_at: reached ? goal.verified_at : undefined,
  };
}

/** One checkpoint's checklist replaced. */
export function withSteps(goal: Goal, milestoneId: string, steps: MilestoneStep[]): Goal {
  return withStones(goal, (goal.milestones ?? []).map((stone) =>
    stone.id === milestoneId ? { ...stone, steps } : stone));
}

/** One checkpoint's status changed. */
export function withStoneStatus(goal: Goal, milestoneId: string, status: Milestone['status']): Goal {
  return withStones(goal, (goal.milestones ?? []).map((stone) => {
    if (stone.id === milestoneId) {
      return { ...stone, status, completed_at: status === 'done' ? new Date().toISOString() : undefined };
    }
    // One focus per goal, as the server enforces.
    return status === 'active' && stone.status === 'active' ? { ...stone, status: 'pending' } : stone;
  }));
}

/** Whether the goal is waiting for the reader to say it is really done. */
export function awaitingVerify(goal: Pick<Goal, 'status' | 'needs_verify'>): boolean {
  return goal.status === 'completed' && Boolean(goal.needs_verify);
}

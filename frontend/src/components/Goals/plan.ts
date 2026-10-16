/**
 * The model filling in a goal's plan: its checkpoints, then the steps under
 * each one.
 *
 * Both model calls already existed — backend/tracking/planner.py drafts five
 * checkpoints for a goal and five steps for a checkpoint — but each was wired
 * to one door and the doors disagreed:
 *
 * - A goal made in the wizard had its checkpoints drafted *over* whatever the
 *   reader had typed on the wizard's last step. `add_goal` wrote their list,
 *   then `set_milestones` renamed every row to the model's.
 * - Those drafted checkpoints never got steps. Only a checkpoint added by hand
 *   in the drawer was broken down, so a new goal arrived as five checkpoints of
 *   three empty prompts each — a plan in outline and nothing under it.
 * - Accepting a drafted ladder on the card was the same: checkpoints, no steps.
 *
 * So the chain lives here, once, and every door runs it:
 *
 *     checkpoints the reader wrote are kept; the model drafts them only when
 *     there are none — and then every checkpoint with no written step, and
 *     not already reached, gets a checklist.
 *
 * Nothing here throws. Every failure is ordinary — no key configured, a model
 * that did not answer, an answer that could not be read — and comes back as
 * `problem`, worded by the server for the page to print, beside counts of what
 * did get written. A goal whose plan could not be drafted is still a goal.
 */
import { goals as goalService } from '@/services';
import { fromTitles, stepProgress } from '@/utils/milestoneSteps';
import { measureOf } from './numbers';
import type { Goal } from '@/types';

export interface PlanResult {
  /** Checkpoints the model wrote. 0 when the reader's own were kept. */
  milestones: number;
  /** Checkpoints given a drafted checklist. */
  checklists: number;
  /** The first thing that went wrong, worded for the page; null if nothing did. */
  problem: string | null;
}

/** One goal as the server has it now — checkpoints, ids and steps included. */
async function readGoal(goalId: string): Promise<Goal | null> {
  const result = await goalService.getGoals();
  if (!result.success) return null;
  return (result.goals ?? []).find((goal) => goal.id === goalId) ?? null;
}

/** Whether the model has anything to add to a checkpoint's checklist. */
function needsSteps(stone: NonNullable<Goal['milestones']>[number]): boolean {
  // Placeholders do not count as written — see utils/milestoneSteps — so a
  // checkpoint of three greyed prompts is a checkpoint with no steps.
  return stone.status !== 'done' && stepProgress(stone.steps ?? []).total === 0;
}

/**
 * Draft a checklist for every checkpoint on the goal that has no written step.
 *
 * Read back from the server first rather than handed the checkpoints, because
 * the ids it needs are the ones a write a moment ago created. A checkpoint the
 * reader has already written steps into is left alone — the model proposes,
 * the account owns it, and a checklist somebody typed is not a draft.
 *
 * In parallel: they are independent rows and independent model calls, and five
 * one after another is half a minute of a goal saying it is still thinking.
 */
export async function fillSteps(goalId: string): Promise<Omit<PlanResult, 'milestones'>> {
  const goal = await readGoal(goalId);
  if (!goal) return { checklists: 0, problem: "That goal couldn't be read back." };

  const outcomes = await Promise.all(
    (goal.milestones ?? []).filter(needsSteps).map(async (stone): Promise<string | null> => {
      const drafted = await goalService.suggestSteps({ milestoneId: stone.id });
      if (!drafted.success) return drafted.message ?? "Those steps couldn't be drafted.";
      if (!drafted.steps?.length) return 'The model returned no steps. Try again.';
      const saved = await goalService.updateMilestone(stone.id, {
        steps: fromTitles(drafted.steps),
      });
      return saved.success ? null : (saved.message ?? "Those steps couldn't be saved.");
    }),
  );

  const problems = outcomes.filter((entry): entry is string => entry !== null);
  return { checklists: outcomes.length - problems.length, problem: problems[0] ?? null };
}

/**
 * The whole plan for a goal that has just been made.
 *
 * Counters are never planned: "earn 50,000 XP" has no checkpoints, and a
 * ladder drafted under one is a second, invented measure of a goal the app
 * already counts. See components/Goals/SystemGoals.
 */
export async function planGoal(goalId: string): Promise<PlanResult> {
  const goal = await readGoal(goalId);
  if (!goal) return { milestones: 0, checklists: 0, problem: "That goal couldn't be read back." };
  if (!['milestones', 'number'].includes(measureOf(goal))) {
    return { milestones: 0, checklists: 0, problem: null };
  }

  let milestones = 0;
  if (!(goal.milestones ?? []).length) {
    const drafted = await goalService.suggestMilestones({ goalId });
    if (!drafted.success) {
      return { milestones: 0, checklists: 0, problem: drafted.message ?? 'No checkpoints came back.' };
    }
    if (!drafted.milestones?.length) return { milestones: 0, checklists: 0, problem: null };
    const saved = await goalService.setMilestones(goalId, drafted.milestones);
    if (!saved.success) {
      return { milestones: 0, checklists: 0, problem: saved.message ?? "Those checkpoints couldn't be saved." };
    }
    milestones = drafted.milestones.length;
  }

  const steps = await fillSteps(goalId);
  return { milestones, ...steps };
}

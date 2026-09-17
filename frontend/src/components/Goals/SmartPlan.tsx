/**
 * The model's offers for one goal, in one place, whatever state the goal is in.
 *
 * ## Why this exists
 *
 * Every offer on this page was attached to an *absence*. "Suggest checkpoints"
 * appeared only on a goal with no checkpoints; "Suggest steps" only on a rung
 * with an empty checklist. That is the right default for a prompt the reader
 * did not ask for — an empty panel is exactly where a suggestion belongs — and
 * it had a consequence nobody looked for:
 *
 *     once a goal had a plan, every model feature on this page vanished.
 *
 * Not moved, not disabled. Gone, with nothing on screen saying the app could
 * still do any of it. A reader who wanted the checklists filled in on the four
 * rungs they had not written yet, or who wanted a ladder they had outgrown
 * redrafted, had one menu item behind a ⋯ and no way to know it was there.
 *
 * So the offers get a home that does not depend on emptiness, and the emptiness
 * prompts stay exactly where they were. A reader who has never thought about
 * this still meets the suggestion in the empty box; a reader who wants it later
 * has somewhere to go.
 *
 * ## The offers change, the row does not
 *
 * Which buttons appear is a reading of the goal, so the row is never a wall of
 * greyed-out controls:
 *
 *   no checkpoints        → draft the whole plan
 *   checkpoints, gaps     → fill the empty checklists, and redraft the ladder
 *   checkpoints, complete → redraft the ladder
 *
 * ## What is safe and what asks first
 *
 * Filling empty checklists is additive: `fillSteps` skips any rung with a
 * written step and any rung already reached (components/Goals/plan), so the
 * worst case is that nothing happens. It runs on a press.
 *
 * Redrafting the ladder is not. `setMilestones` writes the list entire, so on a
 * goal with five written checkpoints that button renames five things somebody
 * typed. It is routed through `onRedraftStones`, which confirms — see
 * `redraftStones` in pages/Goals — and it is the only destructive thing here.
 *
 * ## Counters get nothing
 *
 * "Earn 50,000 XP" has no checkpoints and cannot have any: the app counts it
 * directly, and a drafted ladder under one is a second, invented measure of a
 * goal that already has a real one. `planGoal` refuses these and so does this
 * row, rather than offering a button that quietly does nothing.
 */
import { AskModel } from './AskModel';
import { measureOf } from './numbers';
import { stepProgress } from '@/utils/milestoneSteps';
import type { Goal } from '@/types';

export interface SmartPlanProps {
  goal: Goal;
  /** A model call is in flight for this goal. */
  busy: boolean;
  /** Draft the ladder. Confirms first where one already exists. */
  onRedraftStones: (goal: Goal) => void;
  /** Draft a checklist for every rung that has none. Additive; never asks. */
  onFillSteps: (goal: Goal) => void;
  /** The compact form, for the goal card. Drops the explanatory line. */
  compact?: boolean;
}

/** Rungs that could take a drafted checklist: unreached, and nothing written. */
function gaps(goal: Goal): number {
  return (goal.milestones ?? []).filter(
    (stone) => stone.status !== 'done' && stepProgress(stone.steps ?? []).total === 0,
  ).length;
}

export function SmartPlan({
  goal,
  busy,
  onRedraftStones,
  onFillSteps,
  compact = false,
}: SmartPlanProps) {
  // See "Counters get nothing" above. The same test `planGoal` makes.
  if (!['milestones', 'number'].includes(measureOf(goal))) return null;

  const stones = goal.milestones ?? [];
  const empty = gaps(goal);

  return (
    <div className={`gx-smart${compact ? ' is-compact' : ''}`}>
      <div className="gx-smart-row">
        {stones.length === 0 ? (
          <AskModel
            label="Draft the whole plan"
            busy={busy}
            onAsk={() => onRedraftStones(goal)}
            primary
            title="Draft the whole plan — checkpoints and the steps under each, all editable"
          />
        ) : (
          <>
            {empty > 0 && (
              <AskModel
                label={`Fill in ${empty} checklist${empty === 1 ? '' : 's'}`}
                busy={busy}
                onAsk={() => onFillSteps(goal)}
                primary
                /* The promise is the safety, so it is on the control. A reader
                   deciding whether to press this wants to know what it will
                   not touch. */
                title="Draft steps for the checkpoints that have none. Anything you have written is left alone."
              />
            )}
            <AskModel
              label="Redraft checkpoints"
              busy={busy}
              onAsk={() => onRedraftStones(goal)}
              title="Replace the whole checkpoint list with a fresh draft. You will be asked first."
            />
          </>
        )}
      </div>

      {!compact && (
        <p className="gx-smart-note">
          {stones.length === 0
            ? 'Five checkpoints and a checklist under each, drafted from this goal’s own terms. Every row is yours to rename, retime or delete.'
            : empty > 0
              ? 'Only the checkpoints with nothing written get steps. Redrafting replaces the whole ladder, and asks first.'
              : 'Every checkpoint has steps. Redrafting replaces the whole ladder, and asks first.'}
        </p>
      )}
    </div>
  );
}

/**
 * The optional "what is this for?" field on every form that creates a task.
 *
 * ## Why it is optional, and why it is a field rather than a step
 *
 * Linking a task to a goal has always been possible *after* the fact — the row
 * menu on the tasks page has had "Link to goal" for as long as the column has
 * existed — and the matcher in backend/goal_matcher has always read the title
 * and worked it out. What was missing was the one moment the reader actually
 * knows the answer: while they are writing the task down.
 *
 * So it is a field with a default, not a question with a required answer.
 * "Email Mr Chen" is not for anything and never will be, and a form that
 * insists on a goal for it is a form that stops being used — which is the same
 * reasoning that keeps everything but the name optional on the composer.
 *
 * ## The default is not "no goal"
 *
 * It is "work it out from the name", which is a different claim and the honest
 * one: leaving the field alone hands the task to the matcher, and the matcher
 * links it if the title says so and leaves it alone if it does not. Saying
 * that in the option's own text is the point of this component — a bare
 * "None" would tell the reader that skipping the field means the work does not
 * count toward anything, and it usually does.
 *
 * Choosing a goal is the stronger statement: it is stored on the task as
 * `goal_id` and no amount of rematching removes it. See `goalIdsOf` in
 * utils/goalLinks, which is the one place that decides what a task counts
 * toward, and prefers the chosen link over the matched ones.
 *
 * ## Why it wears its own classes
 *
 * It is rendered inside three hosts with three stylesheets — the tasks page's
 * composer, the dashboard's dialog and the calendar's — and the tasks page's
 * `--tk-*` variables do not resolve in the other two. So this is written in
 * `ui-` classes off the global tokens in styles/tokens.css, the way everything
 * in components/ui is, and looks the same in all three.
 */
import { useMemo } from 'react';
import { measureOf } from '@/components/Goals/numbers';
import type { Goal } from '@/types';

/** The default: the matcher decides. Not a goal id, and never sent as one. */
export const MATCH_BY_NAME = '';

export interface GoalFieldProps {
  goals: Goal[];
  /** The chosen goal id, or MATCH_BY_NAME to let the matcher decide. */
  value: string;
  onChange: (goalId: string) => void;
  /** Distinguishes the control from the other forms' copies of it. */
  id: string;
  /** The tasks page's composer is a dense row; the dialogs have more room. */
  hint?: boolean;
}

/**
 * Only outcome goals, for the same reason the row menu only offers those: a
 * counter goal ("500 XP this month") advances itself off the ledger, so naming
 * one here would be offering to file work against something that is not
 * counting the work.
 */
export function linkableGoals(goals: Goal[]): Goal[] {
  return goals.filter(
    (goal) => goal.status !== 'completed' && ['number', 'milestones'].includes(measureOf(goal)),
  );
}

export function GoalField({ goals, value, onChange, id, hint = false }: GoalFieldProps) {
  const linkable = useMemo(() => linkableGoals(goals), [goals]);
  if (linkable.length === 0) return null;

  const chosen = linkable.find((goal) => String(goal.id) === value) ?? null;

  return (
    <label className="ui-goal-field">
      <span>Counts toward</span>
      <select
        className="ui-goal-select"
        id={`${id}-goal`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value={MATCH_BY_NAME}>Work it out from the name</option>
        {linkable.map((goal) => (
          <option key={goal.id} value={String(goal.id)}>
            {goal.title}
          </option>
        ))}
      </select>
      {hint && (
        <small className="ui-goal-hint">
          {chosen
            ? 'Counted toward this goal whatever it is called.'
            : 'Linked if the name matches a goal, and left alone if it does not.'}
        </small>
      )}
    </label>
  );
}

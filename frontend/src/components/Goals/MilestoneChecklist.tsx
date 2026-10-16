/**
 * The editable checklist under one checkpoint, in the detail drawer.
 *
 * The drawer is the only place a step's text can be written — the card draws
 * the same three rows and lets you tick them, but not rename them. That split
 * is deliberate: ticking is something you do while working, and naming is
 * something you do while planning, and a card that scrolls past four goals is
 * the wrong place to be typing.
 *
 * ## Editing is local until it settles
 *
 * Each row is an uncontrolled-ish input holding its own draft, committed on
 * blur or Enter. Writing on every keystroke would put a request per character
 * behind a list that is rewritten whole, and the reply — which re-normalises,
 * re-pads and re-ids — would land back in the box mid-word.
 *
 * Escape abandons the draft. Enter commits and leaves the field, because the
 * next thing a reader does after naming step one is name step two, and a form
 * that keeps focus after submit makes that a click rather than a Tab.
 *
 * ## The floor is enforced here as well as in the API
 *
 * Delete on a list at `MIN_STEPS` empties the row instead of removing it, so
 * the three prompts are always on screen. See utils/milestoneSteps — every
 * mutation goes through that module and none of the arithmetic lives here.
 */
import { useState } from 'react';
import {
  MAX_STEPS,
  MIN_STEPS,
  STEP_MAX,
  addStep,
  dueStep,
  editStep,
  promptFor,
  removeStep,
  stepProgress,
  toggleStep,
} from '@/utils/milestoneSteps';
import type { MilestoneStep } from '@/types';

export interface MilestoneChecklistProps {
  steps: MilestoneStep[];
  busy: boolean;
  onChange: (steps: MilestoneStep[]) => void;
  /** Due dates of the tasks steps are linked to, keyed by task id. */
  taskDue?: Map<string, string | undefined>;
}

/** "14 Sep". Short, because these sit in a column an inch wide. */
function shortDay(iso: string): string {
  const at = Date.parse(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(at)) return '';
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Strictly before today, and not already done.
 *
 * A step due today is not late, and a finished step is never late whenever it
 * was due — it is finished. Marking one amber tells the reader to go and do
 * something they have already done.
 */
function overdue(iso: string | null, done = false): boolean {
  if (!iso || done) return false;
  const at = Date.parse(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(at)) return false;
  return at < new Date(new Date().toDateString()).getTime();
}

export function MilestoneChecklist({ steps, busy, onChange, taskDue }: MilestoneChecklistProps) {
  /** Which row is being typed in, and what is in it. One at a time. */
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const { done, total } = stepProgress(steps);

  const commit = () => {
    if (!editing) return;
    onChange(editStep(steps, editing.index, editing.text));
    setEditing(null);
  };

  return (
    <div className="gx-checklist">
      <div className="gx-checklist-head">
        <span className="gx-quiet">
          {total === 0
            ? `${MIN_STEPS} steps to name`
            : `${done} of ${total} step${total === 1 ? '' : 's'} done`}
        </span>
        <button
          type="button"
          className="gx-checklist-add"
          disabled={busy || steps.length >= MAX_STEPS}
          title={
            steps.length >= MAX_STEPS
              ? `A checkpoint needing more than ${MAX_STEPS} steps is two checkpoints`
              : 'Add a step'
          }
          onClick={() => onChange(addStep(steps))}
        >
          + step
        </button>
      </div>

      <ul className="gx-checklist-list">
        {steps.map((step, index) => {
          const linkedDue = step.task_id ? taskDue?.get(step.task_id) ?? null : null;
          return (
          <li className={`gx-cstep${step.done ? ' is-done' : ''}${step.placeholder ? ' is-empty' : ''}`} key={step.id}>
            <button
              type="button"
              className="gx-cstep-tick"
              // Nothing to tick on a row nobody has written. See `toggleStep`.
              disabled={busy || step.placeholder}
              aria-label={
                // An unwritten row has no name to put in the label, and
                // "Finish " with nothing after it is what that reads as.
                step.placeholder
                  ? 'Name this step before you can tick it'
                  : step.done
                    ? `Undo ${step.title}`
                    : `Finish ${step.title}`
              }
              onClick={() => onChange(toggleStep(steps, index))}
            >
              <span aria-hidden="true">{step.done ? '✓' : ''}</span>
            </button>

            {editing?.index === index ? (
              <input
                autoFocus
                className="gx-cstep-input"
                value={editing.text}
                maxLength={STEP_MAX}
                placeholder={promptFor(index)}
                onChange={(event) => setEditing({ index, text: event.target.value })}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commit();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setEditing(null);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="gx-cstep-text"
                disabled={busy}
                onClick={() => setEditing({ index, text: step.title })}
              >
                {step.placeholder ? promptFor(index) : step.title}
              </button>
            )}

            {/* A date of its own, and only where nothing else holds one. A
                linked step takes the task's date, so a second control here
                would be a second answer to "when" — the row prints the
                task's instead. See `stepDue` in utils/milestoneSteps. */}
            {step.placeholder ? (
              <span />
            ) : step.task_id ? (
              <span
                className="gx-cstep-due is-borrowed"
                title="This step takes its date from the task it is linked to"
              >
                {linkedDue ? shortDay(linkedDue) : 'from task'}
              </span>
            ) : (
              <label className="gx-cstep-due">
                <span className={overdue(step.due, step.done) ? 'is-late' : undefined}>
                  {step.due ? shortDay(step.due) : '+ date'}
                </span>
                <input
                  type="date"
                  value={step.due ?? ''}
                  disabled={busy}
                  aria-label={`When to finish ${step.title}`}
                  onChange={(event) => onChange(dueStep(steps, index, event.target.value))}
                />
              </label>
            )}

            <button
              type="button"
              className="gx-cstep-cut"
              disabled={busy || (step.placeholder && steps.length <= MIN_STEPS)}
              aria-label={steps.length <= MIN_STEPS ? 'Clear this step' : 'Remove this step'}
              title={
                steps.length <= MIN_STEPS
                  ? `Clears it. Every checkpoint keeps at least ${MIN_STEPS} steps.`
                  : 'Remove this step'
              }
              onClick={() => onChange(removeStep(steps, index))}
            >
              ×
            </button>
          </li>
          );
        })}
      </ul>
    </div>
  );
}

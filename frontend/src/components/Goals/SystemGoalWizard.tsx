/**
 * Setting a system goal — a target on something Summit already counts.
 *
 * ## Why it is not the other wizard
 *
 * The only way to make one used to be NewGoalWizard, which is built for an
 * outcome: it asks what you want to accomplish and why, will not go on without
 * a subject, and then has the model draft checkpoints under the result. None of
 * that applies to a counter, and what came out was not one — it was an outcome
 * goal (`measure: 'milestones'`) filed on the Active tab rather than this one,
 * with five invented checkpoints under "earn 50,000 XP" and no target the app
 * could count toward.
 *
 * A counter is two decisions: which of the four things, and what number. So it
 * is two steps. The first is a list, because the four are the whole choice and
 * each needs a sentence on what exactly it counts — "from today" and "your
 * live streak" behave differently, and the difference is the thing a reader
 * picking one needs to know.
 *
 * Nothing here asks the model for anything, and nothing here asks for a
 * subject: GoalModal's note says why a counter is not about one.
 */
import { useCallback, useMemo, useState } from 'react';
import { COUNTER_ICON } from './SystemGoals';
import type { NewGoal } from '@/services/goals';
import type { Goal, GoalType } from '@/types';

interface Counter {
  type: GoalType;
  label: string;
  /** What the number is, in one sentence — see the note at the top. */
  counts: string;
  /** What the target is entered in. Focus is hours here and minutes stored. */
  unit: string;
  placeholder: string;
  /** The title the goal gets unless the reader writes their own. */
  title: (n: string) => string;
}

const COUNTERS: Counter[] = [
  {
    type: 'xp',
    label: 'XP',
    counts: 'Counts the XP you earn from today.',
    unit: 'XP',
    placeholder: '5000',
    title: (n) => `Earn ${n} XP`,
  },
  {
    type: 'streak',
    label: 'Streak',
    counts: 'Follows your live streak, and drops back if it breaks.',
    unit: 'days',
    placeholder: '30',
    title: (n) => `Reach a ${n}-day streak`,
  },
  {
    type: 'tasks',
    label: 'Tasks',
    counts: 'Counts the tasks you finish from today.',
    unit: 'tasks',
    placeholder: '100',
    title: (n) => `Complete ${n} tasks`,
  },
  {
    type: 'focus',
    label: 'Focus time',
    counts: 'Counts the focus time you log from today.',
    unit: 'hours',
    placeholder: '50',
    title: (n) => `Focus for ${n} hours`,
  },
];

const STEPS = ['What should Summit count?', "What's the target?"] as const;

/** "5,000" for the title; the field keeps what was typed. */
function figure(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString() : 'N';
}

export interface SystemGoalWizardProps {
  open: boolean;
  busy: boolean;
  /** The counters already set, so a choice can say one is already running. */
  counters: Goal[];
  onClose: () => void;
  onSave: (goal: NewGoal) => void;
}

export function SystemGoalWizard({ open, busy, counters, onClose, onSave }: SystemGoalWizardProps) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState<GoalType | null>(null);
  const [target, setTarget] = useState('');
  /* The title follows the target until the reader types into it, and is
     theirs from then on — overwriting a title somebody wrote because they then
     changed the number would be the form arguing with them. */
  const [ownTitle, setOwnTitle] = useState<string | null>(null);
  const [deadline, setDeadline] = useState('');

  const counter = COUNTERS.find((entry) => entry.type === type) ?? null;
  const title = ownTitle ?? (counter ? counter.title(figure(target)) : '');

  const reset = useCallback(() => {
    setStep(0);
    setType(null);
    setTarget('');
    setOwnTitle(null);
    setDeadline('');
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  /** How many of each counter are already running — said on its row. */
  const running = useMemo(() => {
    const out: Partial<Record<GoalType, number>> = {};
    counters.forEach((goal) => {
      out[goal.goal_type] = (out[goal.goal_type] ?? 0) + 1;
    });
    return out;
  }, [counters]);

  const value = Number(target);
  const blocked = step === 0 ? !counter : !(value > 0) || !title.trim();

  const save = useCallback(() => {
    if (!counter || !(value > 0) || !title.trim()) return;
    const draft: NewGoal = {
      title: title.trim(),
      // Both, and the same. `measure` is what the server reads; `goal_type`
      // is the column the counters have always been keyed on.
      goal_type: counter.type,
      measure: counter.type,
      priority: 5,
      deadline,
    };
    if (counter.type === 'xp') draft.target_xp = Math.trunc(value);
    else if (counter.type === 'streak') draft.target_streak = Math.trunc(value);
    else if (counter.type === 'tasks') draft.target_tasks = Math.trunc(value);
    else draft.target_focus = Math.round(value * 60); // hours in, minutes stored
    onSave(draft);
    reset();
  }, [counter, deadline, onSave, reset, title, value]);

  if (!open) return null;

  return (
    <div className="gx-drawer-backdrop" onClick={close} role="presentation">
      <div
        className="gx-wizard"
        role="dialog"
        aria-label="New system goal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="gx-wizard-head">
          <span className="gx-wizard-step">
            System goal · Step {step + 1} of {STEPS.length}
          </span>
          <h2>{STEPS[step]}</h2>
          <button type="button" className="gx-close" onClick={close} aria-label="Close">
            ×
          </button>
        </header>

        <span className="gx-wizard-rail" aria-hidden="true">
          {STEPS.map((label, index) => (
            <i key={label} className={index <= step ? 'is-on' : ''} />
          ))}
        </span>

        <div className="gx-wizard-body">
          {step === 0 && (
            <>
              <p className="gx-hint">
                You set the target. Summit keeps the count, so there's nothing to tick off and
                nothing to update by hand.
              </p>
              <ul className="gx-syspick" aria-label="What to count">
                {COUNTERS.map((entry) => {
                  const on = entry.type === type;
                  const already = running[entry.type] ?? 0;
                  return (
                    <li key={entry.type}>
                      <button
                        type="button"
                        className={`gx-syspick-row${on ? ' is-on' : ''}`}
                        aria-pressed={on}
                        onClick={() => setType(entry.type)}
                      >
                        <span className={`gx-sys-ico is-${entry.type}`} aria-hidden="true">
                          {COUNTER_ICON[entry.type]}
                        </span>
                        <span className="gx-syspick-text">
                          <strong>{entry.label}</strong>
                          <span>{entry.counts}</span>
                        </span>
                        {already > 0 && (
                          <span className="gx-syspick-note">
                            {already === 1 ? '1 running' : `${already} running`}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {step === 1 && counter && (
            <>
              <label htmlFor="gx-sys-target">Target ({counter.unit})</label>
              <input
                id="gx-sys-target"
                type="number"
                min={counter.type === 'focus' ? 0.5 : 1}
                step={counter.type === 'focus' ? 0.5 : 1}
                autoFocus
                placeholder={counter.placeholder}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              />
              <p className="gx-hint">{counter.counts}</p>

              <label htmlFor="gx-sys-title">Call it</label>
              <input
                id="gx-sys-title"
                value={title}
                onChange={(event) => setOwnTitle(event.target.value)}
              />

              <label htmlFor="gx-sys-deadline">By when</label>
              <input
                id="gx-sys-deadline"
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
              <p className="gx-hint">Optional. With a date, the page can say whether you're on pace.</p>
            </>
          )}
        </div>

        <footer className="gx-wizard-foot">
          <button
            type="button"
            className="gx-btn is-quiet"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="gx-btn is-primary"
              disabled={blocked}
              onClick={() => setStep(step + 1)}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="gx-btn is-primary"
              disabled={busy || blocked}
              onClick={save}
            >
              Set goal
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

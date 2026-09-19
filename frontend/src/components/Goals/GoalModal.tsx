/**
 * The add / edit goal dialog.
 *
 * The original kept one modal in the markup and swapped its title, its button
 * label and a hidden `editingGoalId` to make it serve both jobs. This does the
 * same job with a prop: `goal` present means edit, absent means add.
 *
 * Which target field is shown follows the goal type — the original toggled
 * four label/input pairs with `style.display`, and the port renders only the
 * one that applies. Focus is entered in hours and stored in minutes, which is
 * the one conversion on this page and the reason the hint appears.
 *
 * ## Why the subject is here as well as in the wizard
 *
 * The wizard requires one, so every goal made from today has a subject. Goals
 * made before it does not, and there is no other screen that can give them
 * one: `subject_ids` is what the subject page reads to find the goals it is
 * for, so a goal without it is invisible to exactly the page that would have
 * explained it. This is the repair route, and it is why the field is here
 * rather than only on the creation path.
 *
 * It is *not* a gate here, and that is deliberate. This dialog also edits a
 * plain XP counter — "earn 25,000 XP" is not about a subject — and refusing to
 * save a title change on a goal that never had one would be the rule punishing
 * the reader for a decision the app made before they arrived.
 */
import { useEffect, useState } from 'react';
import { SubjectPicker } from '@/components/SubjectPicker';
import type { Subject } from '@/services/subjects';
import type { Goal, GoalType } from '@/types';
import type { NewGoal } from '@/services/goals';
import { Icon } from '@/components/Icon';

export interface GoalModalProps {
  open: boolean;
  /** The goal being edited, or undefined when adding. */
  goal?: Goal;
  busy?: boolean;
  /** The account's catalogue, for the subject this goal is filed under. */
  subjects: Subject[];
  onClose: () => void;
  onSave: (draft: NewGoal) => void;
}

const TARGETS: Record<
  GoalType,
  { label: string; placeholder: string; min: string; step?: string }
> = {
  xp: { label: 'Target XP', placeholder: 'e.g., 1000', min: '1' },
  streak: { label: 'Target Streak (days)', placeholder: 'e.g., 30', min: '1' },
  tasks: { label: 'Target Tasks', placeholder: 'e.g., 100', min: '1' },
  focus: {
    label: 'Target Focus Time (hours)',
    placeholder: 'e.g., 10',
    min: '0.5',
    step: '0.5',
  },
};

/** The stored target for a type, back in the units the form takes. */
function targetOf(goal: Goal | undefined, type: GoalType): string {
  if (!goal) return '';
  if (type === 'xp') return goal.target_xp ? String(goal.target_xp) : '';
  if (type === 'streak')
    return goal.target_streak ? String(goal.target_streak) : '';
  if (type === 'tasks')
    return goal.target_tasks ? String(goal.target_tasks) : '';
  // Minutes on the way in, hours on the way out.
  return goal.target_focus ? String(goal.target_focus / 60) : '';
}

export function GoalModal({
  open,
  goal,
  busy = false,
  subjects,
  onClose,
  onSave,
}: GoalModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<GoalType>('xp');
  const [target, setTarget] = useState('');
  const [priority, setPriority] = useState(5);
  const [deadline, setDeadline] = useState('');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<{ title?: boolean; target?: boolean }>(
    {},
  );

  // Refill from the goal each time the dialog opens, so a cancelled edit does
  // not leave its values behind for the next one.
  useEffect(() => {
    if (!open) return;
    setTitle(goal?.title ?? '');
    setDescription(goal?.description ?? '');
    const t = goal?.goal_type ?? 'xp';
    setType(t);
    setTarget(targetOf(goal, t));
    setPriority(
      goal
        ? Math.max(1, Math.min(10, Math.trunc(Number(goal.priority)) || 5))
        : 5,
    );
    setDeadline(goal?.deadline ?? '');
    /* The column is a comma-separated list and this control picks one, so a
       goal that somehow names several keeps the first and loses the rest on
       save. Nothing in the app writes more than one today; the field's own
       note in types/models says why the column is a list anyway. */
    setSubjectId(String(goal?.subject_ids ?? '').split(',')[0]?.trim() || null);
    setInvalid({});
  }, [open, goal]);

  if (!open) return null;

  const spec = TARGETS[type];

  function changeType(next: GoalType) {
    setType(next);
    setTarget(targetOf(goal, next));
    setInvalid((was) => ({ ...was, target: false }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = parseFloat(target);
    const bad = {
      title: !title.trim(),
      target: !value || value <= 0,
    };
    setInvalid(bad);
    if (bad.title || bad.target) return;

    const draft: NewGoal = {
      title: title.trim(),
      description: description.trim(),
      goal_type: type,
      priority,
      deadline,
    };
    if (type === 'xp') draft.target_xp = Math.trunc(value);
    else if (type === 'streak') draft.target_streak = Math.trunc(value);
    else if (type === 'tasks') draft.target_tasks = Math.trunc(value);
    else draft.target_focus = Math.round(value * 60); // hours in, minutes stored
    if (goal) draft.id = goal.id;
    /* Sent on every save, empty included, so clearing the subject is a change
       this dialog can actually make. `UpdateGoal` writes the fields that were
       sent rather than the ones that are truthy — see backend/api/goals.py. */
    draft.subject_ids = subjectId ?? '';

    onSave(draft);
  }

  return (
    <div id="goalModal" className="modal" style={{ display: 'block' }}>
      <div className="modal-content goal-modal-modern">
        <span
          className="close"
          onClick={onClose}
          role="button"
          aria-label="Close"
        >
          ×
        </span>
        <h2 id="modalTitle">{goal ? 'Edit Goal' : 'Add New Goal'}</h2>

        <form onSubmit={submit}>
          <label htmlFor="goalTitle">Goal Title</label>
          <input
            type="text"
            id="goalTitle"
            className={invalid.title ? 'invalid-input' : ''}
            placeholder="e.g., Complete 100 tasks"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <label htmlFor="goalDescription">Description (optional)</label>
          <textarea
            id="goalDescription"
            placeholder="Describe your goal..."
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="gm-row">
            <div className="gm-col">
              <label htmlFor="goalType">Goal Type</label>
              <select
                id="goalType"
                value={type}
                onChange={(e) => changeType(e.target.value as GoalType)}
              >
                <option value="xp">XP Based</option>
                <option value="streak">Streak Based</option>
                <option value="tasks">Tasks Completed</option>
                <option value="focus">Focus Time</option>
              </select>
            </div>
            <div className="gm-col">
              <label htmlFor="goalTarget">{spec.label}</label>
              <input
                type="number"
                id="goalTarget"
                className={invalid.target ? 'invalid-input' : ''}
                placeholder={spec.placeholder}
                min={spec.min}
                step={spec.step}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
          </div>

          {type === 'focus' && (
            <p className="gm-hint" id="focusGoalHint">
              <Icon name="timer" /> Fills in as you log focus time after the goal is set.
            </p>
          )}

          <label htmlFor="goalPriority" className="gm-priority-label">
            Priority Rank <span className="gm-priority-val">{priority}</span>/10
          </label>
          <input
            type="range"
            id="goalPriority"
            min="1"
            max="10"
            step="1"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          />

          <label htmlFor="goalDeadline">Deadline (optional)</label>
          <input
            type="date"
            id="goalDeadline"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />

          <label>Subject</label>
          <div className="gm-subject">
            <SubjectPicker
              id="gm-subject"
              label="Subject:"
              subjects={subjects}
              value={subjectId}
              onChange={setSubjectId}
            />
          </div>
          <p className="gm-hint">
            What links this goal to your record. Its subject's analytics page reads the goal
            and says what your work there is doing about it.
          </p>

          <button
            type="submit"
            className="confirm-add-btn"
            id="saveGoalBtn"
            disabled={busy}
          >
            {goal ? 'Save Changes' : 'Add Goal'}
          </button>
        </form>
      </div>
    </div>
  );
}

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The page's four confirmations — delete, give up, complete early, and the
 * deadline extension's sibling — were four near-identical blocks of markup in
 * goals.html. They are one component with different words in it.
 */
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div className="modal" style={{ display: 'block' }}>
      <div className="modal-content">
        <span
          className="close"
          onClick={onCancel}
          role="button"
          aria-label="Close"
        >
          ×
        </span>
        <h2>{title}</h2>
        <p>{body}</p>
        <div
          style={{
            display: 'flex',
            gap: '10px',
            justifyContent: 'center',
            marginTop: '20px',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="confirm-add-btn"
            style={{ background: '#666' }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="confirm-add-btn"
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

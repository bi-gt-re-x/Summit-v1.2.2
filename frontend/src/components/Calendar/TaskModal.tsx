/**
 * Add or edit a task, from the calendar rather than the dashboard.
 *
 * The same layout as the event dialog with XP in place of nothing, because a
 * task on the grid is a real task: it is created in the database with
 * `show_on_calendar`, it is worth XP, and finishing it from the grid awards
 * that XP exactly as ticking it off on the dashboard does.
 *
 * A task's times are its span. `created_at` is the start and `due_date` the
 * end — the grid draws the block between them — which is why the dialog asks
 * for both and why editing one moves the block rather than nudging a deadline.
 *
 * Difficulty is not asked for. It follows from XP — Easy through Very
 * Challenging across 10-250, see utils/priority.ts — so asking again would be
 * inviting the two to disagree.
 */
import { useEffect, useState } from 'react';
import { RecurrencePicker } from './RecurrencePicker';
import { TimePicker } from './TimePicker';
import { SubjectPicker } from '@/components/SubjectPicker';
import { useSubjects } from '@/hooks/useSubjects';
import { useLinkableGoals } from '@/hooks/useLinkableGoals';
import { GoalField, MATCH_BY_NAME } from '@/components/Tasks/GoalField';
import { MAX_TASK_XP, MIN_TASK_XP } from '@/utils/priority';
import type { Scope } from '@/hooks/useCalendarStore';
import type { RecurrenceType } from '@/utils/calendarStore';

/* Re-exported rather than redefined: every dialog, card and grid block bands
   a task the same way, and one place decides how. */
export { MAX_TASK_XP, MIN_TASK_XP, xpToPriority } from '@/utils/priority';

export interface TaskDraft {
  name: string;
  startTime: string;
  endTime: string;
  xp: number;
  /** The chosen subject's id, or null. Optional on every task. */
  subject: string | null;
  /**
   * The goal this is for, or '' to let the matcher read the name. Optional on
   * every task, and only offered when the account has an outcome goal to
   * offer — see `GoalField`.
   */
  goalId: string;
  recurrence: RecurrenceType;
  recurrenceDays: number[];
}

export interface TaskModalProps {
  initial?: {
    name: string;
    startTime: string;
    endTime: string;
    xp: number;
    subject?: string | null;
  };
  /** Whose subjects to offer — the list is ordered by what they use most. */
  username?: string | null;
  /** True when this task repeats — the edit dialog then asks about scope. */
  recurring?: boolean;
  defaults?: { startTime: string; endTime: string; name?: string };
  /** The Day view acts on one task only, so it never offers a repeat. */
  allowRecurrence?: boolean;
  onSave: (draft: TaskDraft, scope: Scope) => void;
  onClose: () => void;
  wide?: boolean;
}

export function TaskModal({
  initial,
  username,
  recurring,
  defaults,
  allowRecurrence = true,
  onSave,
  onClose,
  wide,
}: TaskModalProps) {
  const editing = Boolean(initial);
  const subjects = useSubjects(username ?? null);
  const goals = useLinkableGoals(username ?? null);

  const [name, setName] = useState(initial?.name ?? defaults?.name ?? '');
  const [subject, setSubject] = useState<string | null>(initial?.subject ?? null);
  const [goalId, setGoalId] = useState(MATCH_BY_NAME);
  const [startTime, setStartTime] = useState(initial?.startTime ?? defaults?.startTime ?? '');
  const [endTime, setEndTime] = useState(initial?.endTime ?? defaults?.endTime ?? '');
  const [xp, setXp] = useState(initial?.xp ?? MIN_TASK_XP);
  const [recurrence, setRecurrence] = useState<RecurrenceType>('none');
  const [days, setDays] = useState<number[]>([]);
  const [scope, setScope] = useState<Scope>('one');
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const missingName = !name.trim();
  const missingDays = recurrence !== 'none' && days.length === 0;

  const setClampedXp = (value: number) =>
    setXp(Math.max(MIN_TASK_XP, Math.min(MAX_TASK_XP, Math.round(value) || MIN_TASK_XP)));

  const save = () => {
    if (missingName || !startTime || !endTime || missingDays) {
      setShowErrors(true);
      return;
    }
    onSave(
      {
        name: name.trim(),
        startTime,
        endTime,
        xp,
        subject,
        goalId,
        recurrence: allowRecurrence ? recurrence : 'none',
        recurrenceDays: allowRecurrence ? days : [],
      },
      scope,
    );
  };

  return (
    // week.css scopes the XP row's widths under #addTaskModal to out-specify
    // the modal's generic input rules, so the id has to survive the port.
    <div
      id="addTaskModal"
      className={`modal${wide ? ' from-week' : ''}`}
      style={{ display: 'block' }}
      role="dialog"
      aria-modal="true"
      aria-label={editing ? 'Edit task' : 'Add new task'}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h3>{editing ? 'Edit Task' : 'Add New Task'}</h3>
          <span className="close-btn" role="button" tabIndex={0} onClick={onClose}>
            ×
          </span>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="taskName">Task Name:</label>
            <input
              id="taskName"
              type="text"
              className={showErrors && missingName ? 'invalid-input' : ''}
              placeholder="e.g., Finish essay"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>

          <TimePicker
            id="taskStart"
            label="Start Time:"
            value={startTime}
            onChange={setStartTime}
            invalid={showErrors && !startTime}
          />
          <TimePicker
            id="taskEnd"
            label="End Time:"
            value={endTime}
            onChange={setEndTime}
            invalid={showErrors && !endTime}
          />

          <SubjectPicker
            id="calSubject"
            subjects={subjects}
            value={subject}
            onChange={setSubject}
          />

          {/* Only on the way in. An edit here rewrites the block's rows (see
              `saveTask`), and offering the field on that path would mean a
              reader changing a block's end time silently re-deciding what it
              counts toward. Changing a link is the row menu's job. */}
          {!editing && (
            <GoalField goals={goals} value={goalId} onChange={setGoalId} id="calGoal" hint />
          )}

          <div className="form-group">
            <label htmlFor="taskXpSlider">
              XP Reward: <span className="xp-value">{xp}</span>
            </label>
            <div className="xp-slider-row">
              <input
                id="taskXpSlider"
                type="range"
                min={MIN_TASK_XP}
                max={MAX_TASK_XP}
                value={xp}
                style={{ flex: 1, accentColor: '#A38A70' }}
                onChange={(event) => setClampedXp(Number(event.target.value))}
              />
              <input
                type="number"
                className="xp-input-field"
                min={MIN_TASK_XP}
                max={MAX_TASK_XP}
                value={xp}
                onChange={(event) => setClampedXp(Number(event.target.value))}
              />
            </div>
          </div>

          {editing && recurring && (
            <div className="form-group">
              <label>Apply changes to:</label>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    name="taskEditScope"
                    checked={scope === 'one'}
                    onChange={() => setScope('one')}
                  />{' '}
                  This occurrence
                </label>
                <label>
                  <input
                    type="radio"
                    name="taskEditScope"
                    checked={scope === 'all'}
                    onChange={() => setScope('all')}
                  />{' '}
                  All occurrences
                </label>
              </div>
            </div>
          )}

          {!editing && allowRecurrence && (
            <RecurrencePicker
              name="taskRecurrenceType"
              type={recurrence}
              days={days}
              onChange={(type, chosen) => {
                setRecurrence(type);
                setDays(chosen);
              }}
              invalid={showErrors && missingDays}
            />
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-confirm" onClick={save}>
            {editing ? 'Save Changes' : 'Add Task'}
          </button>
        </div>
      </div>
    </div>
  );
}

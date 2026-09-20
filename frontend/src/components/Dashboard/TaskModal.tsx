/**
 * The dashboard's "Add New Task" dialog.
 *
 * A task carries an XP reward and, optionally, *either* a timer duration *or*
 * a due date — the two are alternatives, which is why the original put an "OR"
 * between the two dropdown buttons. Opening one closes the other here, so the
 * exclusivity is enforced rather than implied.
 *
 * The XP slider and its number box are two views of one value; the original
 * kept them in step with a pair of `oninput` handlers that each wrote to the
 * other, and this holds the value once and renders both from it.
 *
 * A due date is assembled from four controls (date, hour, minute, AM/PM) and
 * sent as one ISO-ish local string, the way `addTaskFromModal` did it.
 *
 * It opens on the account's default XP and priority (Settings, Tasks), which
 * the tasks page's composer has always honoured and this dialog never did — it
 * started every task at the floor of the scale, so a reader who had set their
 * default to 60 got 10 from one of the app's two Add Task forms and 60 from
 * the other.
 */
import { useEffect, useState } from 'react';
import { SubjectPicker } from '@/components/SubjectPicker';
import { GoalField, MATCH_BY_NAME } from '@/components/Tasks/GoalField';
import { useSubjects } from '@/hooks/useSubjects';
import { MAX_TASK_XP, MIN_TASK_XP, xpToPriority } from '@/utils/priority';
import type { NewTask } from '@/services/tasks';
import type { Goal } from '@/types';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ui';

export interface TaskModalProps {
  open: boolean;
  busy?: boolean;
  /** Whose subjects to offer — the list is ordered by what they use most. */
  username?: string | null;
  /** What a new task is worth before the reader changes it. From Settings. */
  defaultXp?: number;
  /** Used only while the XP slider is untouched — see `submit`. */
  defaultPriority?: NewTask['priority'];
  /** The account's goals, for the optional "counts toward" field. */
  goals?: Goal[];
  onClose: () => void;
  onAdd: (task: NewTask & { timer_duration?: number }) => void;
}

const MIN_XP = MIN_TASK_XP;
const MAX_XP = MAX_TASK_XP;

type Panel = 'none' | 'timer' | 'due';

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, '0'),
);

export function TaskModal({
  open,
  busy = false,
  username,
  defaultXp = MIN_TASK_XP,
  defaultPriority = 'medium',
  goals = [],
  onClose,
  onAdd,
}: TaskModalProps) {
  const subjects = useSubjects(username ?? null);
  /* Clamped here rather than trusted: the preference is validated on the way
     into the database, but this dialog's slider has its own floor and ceiling
     and a value outside them would render a thumb off the end of the track. */
  const opening = Math.max(MIN_XP, Math.min(MAX_XP, Math.round(defaultXp)));
  const [name, setName] = useState('');
  const [subject, setSubject] = useState<string | null>(null);
  const [goalId, setGoalId] = useState(MATCH_BY_NAME);
  const [xp, setXp] = useState(opening);
  const [panel, setPanel] = useState<Panel>('none');
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [date, setDate] = useState('');
  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('');
  const [ampm, setAmpm] = useState('');
  const [invalid, setInvalid] = useState(false);

  // Fresh every time it opens, so yesterday's half-filled task is not waiting.
  useEffect(() => {
    if (!open) return;
    setName('');
    setSubject(null);
    setGoalId(MATCH_BY_NAME);
    setXp(opening);
    setPanel('none');
    setHours(0);
    setMinutes(0);
    setDate('');
    setHour('');
    setMinute('');
    setAmpm('');
    setInvalid(false);
  }, [open, opening]);

  if (!open) return null;

  /** Clamp anything typed into the number box back into range. */
  function clampXp(value: string) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return;
    setXp(Math.max(MIN_XP, Math.min(MAX_XP, n)));
  }

  /**
   * The four due-date controls as one local datetime string, or null.
   *
   * A 12-hour clock needs both the hour and the meridiem to mean anything, so
   * an incomplete time is treated as no time rather than as midnight.
   */
  function dueDate(): string | null {
    if (panel !== 'due' || !date) return null;
    if (!hour || !minute || !ampm) return `${date}T00:00`;
    let h = parseInt(hour, 10) % 12;
    if (ampm === 'PM') h += 12;
    return `${date}T${String(h).padStart(2, '0')}:${minute}`;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setInvalid(true);
      return;
    }
    const task: NewTask & { timer_duration?: number } = {
      name: name.trim(),
      // This dialog used to send no priority at all, so the backend stored
      // "medium" for every task made here — a 90 XP task then drew on the
      // grid in the medium colour and read as Medium on its card. The band
      // follows the XP, the way it does everywhere else — except while the XP
      // is still sitting on the account's default, where the account's default
      // priority is the better answer. The composer on the tasks page draws the
      // same line, in the same words.
      priority: xp === opening ? defaultPriority : xpToPriority(xp),
      xp_reward: xp,
      due_date: dueDate(),
      // A to-do, and said so out loud. This dialog asks for a name, an XP
      // reward, a subject, and *either* a timer *or* a deadline — never a
      // start and an end, which is what a block on a calendar is. Sending
      // nothing used to mean the backend's default, and its default is `True`
      // (backend/api/tasks.py), so every task made here landed on the calendar
      // as a block running from the moment it was typed to whenever it was
      // due: a day-long bar nobody had scheduled, over a grid the reader keeps
      // for things they had. Tasks reach the calendar by being made on it.
      show_on_calendar: false,
    };
    // Left out entirely when nothing was chosen, rather than sent as null: the
    // field is optional and an absent key is what "not answered" looks like.
    if (subject) task.subject = subject;
    // Same rule as the subject: absent means "not answered", which the backend
    // reads as "let the matcher decide from the name".
    if (goalId) task.goal_id = goalId;
    // Stored in minutes, entered as hours + minutes.
    if (panel === 'timer') {
      const total = hours * 60 + minutes;
      if (total > 0) task.timer_duration = total;
    }
    onAdd(task);
  }

  return (
    <div id="taskModal" className="modal" style={{ display: 'block' }}>
      <div className="modal-content">
        <span
          className="close"
          role="button"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </span>
        <h2>Add New Task</h2>

        <form onSubmit={submit}>
          <input
            type="text"
            id="modalTaskName"
            className={invalid ? 'invalid-input' : ''}
            placeholder="Task Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (invalid) setInvalid(false);
            }}
          />

          <SubjectPicker
            id="dashSubject"
            subjects={subjects}
            value={subject}
            onChange={setSubject}
          />

          <GoalField
            goals={goals}
            value={goalId}
            onChange={setGoalId}
            id="dashGoal"
            hint
          />

          <div style={{ marginTop: '20px', textAlign: 'left' }}>
            <label
              style={{ fontSize: '13px', fontWeight: 500, color: '#6C757D' }}
            >
              XP Reward:{' '}
              <span id="xpValue" style={{ color: '#A38A70', fontWeight: 700 }}>
                {xp}
              </span>
            </label>
            <div
              style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                marginTop: '6px',
              }}
            >
              <input
                type="range"
                id="xpSlider"
                min={MIN_XP}
                max={MAX_XP}
                value={xp}
                style={{ flex: 1, accentColor: '#A38A70' }}
                onChange={(e) => setXp(Number(e.target.value))}
              />
              <input
                type="number"
                id="xpInput"
                className="xp-input-field"
                min={MIN_XP}
                max={MAX_XP}
                value={xp}
                onChange={(e) => clampXp(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-separator" />

          <div className="dropdown-buttons">
            <div className="dropdown-row">
              <button
                type="button"
                className="dropdown-btn"
                onClick={() =>
                  setPanel((p) => (p === 'timer' ? 'none' : 'timer'))
                }
              >
                Task Timer <span className="dropdown-arrow">▼</span>
              </button>
              <span className="or-text">OR</span>
              <button
                type="button"
                className="dropdown-btn"
                onClick={() => setPanel((p) => (p === 'due' ? 'none' : 'due'))}
              >
                Due Date <span className="dropdown-arrow">▼</span>
              </button>
            </div>

            {panel === 'timer' && (
              <div id="timerDropdown" className="dropdown-content">
                <div className="timer-section">
                  <label
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#6C757D',
                    }}
                  >
                    Timer Duration:
                  </label>
                  <div className="timer-inputs" style={{ marginTop: '8px' }}>
                    <div className="timer-input-group">
                      <label htmlFor="timerHours">Hours</label>
                      <input
                        type="range"
                        id="timerHours"
                        min={0}
                        max={12}
                        value={hours}
                        style={{ accentColor: '#2C302E' }}
                        onChange={(e) => setHours(Number(e.target.value))}
                      />
                      <input
                        type="number"
                        id="timerHoursInput"
                        className="xp-input-field"
                        style={{
                          width: '55px',
                          padding: '4px',
                          fontSize: '12px',
                        }}
                        min={0}
                        max={12}
                        value={hours}
                        onChange={(e) =>
                          setHours(
                            Math.max(
                              0,
                              Math.min(12, Number(e.target.value) || 0),
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="timer-input-group">
                      <label htmlFor="timerMinutes">Minutes</label>
                      <input
                        type="range"
                        id="timerMinutes"
                        min={0}
                        max={60}
                        value={minutes}
                        style={{ accentColor: '#2C302E' }}
                        onChange={(e) => setMinutes(Number(e.target.value))}
                      />
                      <input
                        type="number"
                        id="timerMinutesInput"
                        className="xp-input-field"
                        style={{
                          width: '55px',
                          padding: '4px',
                          fontSize: '12px',
                        }}
                        min={0}
                        max={60}
                        value={minutes}
                        onChange={(e) =>
                          setMinutes(
                            Math.max(
                              0,
                              Math.min(60, Number(e.target.value) || 0),
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {panel === 'due' && (
              <div id="dueDateDropdown" className="dropdown-content">
                <div
                  className="due-date-section"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div>
                    <label
                      htmlFor="dueDate"
                      style={{
                        fontSize: '12px',
                        color: '#6C757D',
                        display: 'block',
                        marginBottom: '4px',
                      }}
                    >
                      Select Due Date:
                    </label>
                    <input
                      type="date"
                      id="dueDate"
                      className="due-date-input"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      id="dueHour"
                      className="due-date-input"
                      style={{ flex: 1 }}
                      value={hour}
                      onChange={(e) => setHour(e.target.value)}
                    >
                      <option value="">Hour</option>
                      {HOURS.map((h) => (
                        <option value={h} key={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <select
                      id="dueMinute"
                      className="due-date-input"
                      style={{ flex: 1 }}
                      value={minute}
                      onChange={(e) => setMinute(e.target.value)}
                    >
                      <option value="">Minute</option>
                      {MINUTES.map((m) => (
                        <option value={m} key={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      id="dueAmPm"
                      className="due-date-input"
                      style={{ flex: 1 }}
                      value={ampm}
                      onChange={(e) => setAmpm(e.target.value)}
                    >
                      <option value="">AM/PM</option>
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          <p className="calendar-hint">
            <Icon name="calendar" /> To put a task on the calendar, open the{' '}
            <a href="/calendar">Calendar</a>, drag across a time slot, and
            choose <strong>Task</strong>.
          </p>

          <Button type="submit" variant="primary" size="lg" block className="dash-modal-submit" disabled={busy}>
            Confirm &amp; Add Task
          </Button>
        </form>
      </div>
    </div>
  );
}

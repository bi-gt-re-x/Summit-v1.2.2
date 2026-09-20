/**
 * Adding a task, as a row at the top of the list rather than a dialog.
 *
 * A dialog to add a task is a dialog to be dismissed: this page exists to have
 * a lot of tasks on it, and the reader adding one is usually adding three. The
 * form stays open, keeps the priority and subject they last chose, clears the
 * name, and puts the cursor back — so the second and third cost a sentence
 * each rather than a round trip through a modal.
 *
 * Only the name is required. Everything else has a default the backend would
 * have applied anyway, and asking for five fields to write down "email Mr Chen"
 * is how a task list stops being used.
 */
import { useEffect, useRef, useState } from 'react';
import { SubjectPicker } from '@/components';
import { GoalField, MATCH_BY_NAME } from './GoalField';
import type { Subject } from '@/services/subjects';
import type { NewTask } from '@/services/tasks';
import type { Goal, Task } from '@/types';
import { MAX_TASK_XP, MIN_TASK_XP, XP_BANDS, xpToBand, xpToPriority } from '@/utils/priority';

export interface ComposerProps {
  subjects: Subject[];
  /** The account's goals, for the optional "counts toward" field. */
  goals: Goal[];
  busy: boolean;
  onAdd: (task: NewTask) => void;
  /** What a new task is worth before the reader changes it. From Settings. */
  defaultXp: number;
  /** Only used when the reader has not moved the XP field off its default:
      priority is otherwise derived from what the task is worth, and a stored
      preference should not override a number the reader just typed. */
  defaultPriority: Task['priority'];
}

export function Composer({ subjects, goals, busy, onAdd, defaultXp, defaultPriority }: ComposerProps) {
  const [name, setName] = useState('');
  const [xp, setXp] = useState(defaultXp);
  const [due, setDue] = useState('');
  const [subject, setSubject] = useState<string | null>(null);
  const [goalId, setGoalId] = useState(MATCH_BY_NAME);
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  /* The preferences are read near the root and land a moment after the page
     does, so the form is often built before the account's default XP is known.
     Following it until the reader touches the field is what makes the
     preference true here rather than true-if-you-reload — and stopping there
     is what stops it from resetting a number they just typed. */
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setXp(defaultXp);
  }, [defaultXp]);

  const chooseXp = (value: number) => {
    touched.current = true;
    setXp(value);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const title = name.trim();
    if (!title || busy) return;
    // Clamped on the way out, the way both task dialogs do it. `min` and `max`
    // on a number input are advice to the spinner, not a limit on what can be
    // typed into it.
    const worth = Math.max(MIN_TASK_XP, Math.min(MAX_TASK_XP, Number(xp) || defaultXp));
    onAdd({
      name: title,
      // The preference stands while the XP field is untouched; past that the
      // number the reader typed is the better answer and decides it.
      priority: worth === defaultXp ? defaultPriority : xpToPriority(worth),
      xp_reward: worth,
      due_date: due || null,
      subject,
      // Absent rather than empty when the reader left it alone: the backend
      // reads "no goal_id" as "let the matcher decide", and an empty string
      // would be a link to a goal that does not exist.
      ...(goalId ? { goal_id: goalId } : {}),
    });
    // The name is the only field cleared: the rest are almost always the same
    // for the next one, and re-choosing them every time is the friction this
    // form exists to remove.
    setName('');
    field.current?.focus();
  };

  return (
    <form className="tk-composer" onSubmit={submit}>
      <div className="tk-composer-main">
        <input
          ref={field}
          className="tk-composer-name"
          value={name}
          placeholder="Add a task…"
          aria-label="Task name"
          onChange={(event) => setName(event.target.value)}
          onFocus={() => setOpen(true)}
        />
        <button type="submit" className="tk-btn is-primary" disabled={busy || !name.trim()}>
          Add
        </button>
        <button
          type="button"
          className="tk-btn is-quiet"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Fewer options' : 'More options'}
        </button>
      </div>

      {open && (
        <div className="tk-composer-more">
          {/* Difficulty, not priority.
              This was a Priority select of High/Medium/Low sitting beside an
              XP box, and the two were free to disagree — the form opened on
              "Medium" and 10 XP, which is to say on a task the page would file
              as medium priority and label Easy, from the same row of controls.
              Every other surface in the app derives the band from the XP and
              says so; this was the one place that asked twice and believed
              both answers.

              So it asks once. The select is the six bands, it moves the XP box
              to the band's floor, and the XP box moves it back — one value,
              two grains. The stored priority is computed from the number on
              the way out, exactly as the two task dialogs do it. */}
          <label className="tk-field">
            <span>Difficulty</span>
            <select
              className="tk-select"
              value={xpToBand(xp)}
              onChange={(event) => {
                const band = XP_BANDS.find((entry) => entry.label === event.target.value);
                if (band) chooseXp(band.from);
              }}
            >
              {XP_BANDS.map((band) => (
                <option key={band.label} value={band.label}>
                  {band.label}
                </option>
              ))}
            </select>
          </label>

          <label className="tk-field">
            <span>XP</span>
            <input
              className="tk-input"
              type="number"
              /* The same floor and ceiling the two task dialogs use. This box
                 accepted 0 to 999, so the one form on the Tasks page could
                 write a task worth nothing, or worth four times the top of the
                 scale every other surface bands against. */
              min={MIN_TASK_XP}
              max={MAX_TASK_XP}
              value={xp}
              onChange={(event) => chooseXp(Number(event.target.value))}
            />
          </label>

          <label className="tk-field">
            <span>Due</span>
            <input
              className="tk-input"
              type="date"
              value={due}
              onChange={(event) => setDue(event.target.value)}
            />
          </label>

          <div className="tk-field tk-field-subject">
            <SubjectPicker
              subjects={subjects}
              value={subject}
              onChange={setSubject}
              label="Subject"
              id="tk-composer"
            />
          </div>

          {/* Kept, like the subject and the difficulty, when the name clears:
              somebody adding three tasks for one goal chooses it once. */}
          <GoalField goals={goals} value={goalId} onChange={setGoalId} id="tk-composer" />
        </div>
      )}
    </form>
  );
}

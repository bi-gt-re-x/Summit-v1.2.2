/**
 * One task on the dashboard's list.
 *
 * The checkbox is a **div**, not an `<input type="checkbox">`: what the
 * stylesheet dresses is a rounded box with a bronze border that gets a ✓
 * written into it, and an input wearing those rules renders as a native
 * control in the wrong clothes. It carries `role="checkbox"` and answers the
 * keyboard, so it is still a checkbox to anything that asks.
 *
 * Completing is a three-beat animation: the check appears, the row goes green,
 * and after a beat it collapses and leaves. The classes are `is-checked` and
 * `is-leaving`; what is here is the sequence, not the styling.
 *
 * Under the title is the task's priority, colour-coded. The design this came
 * from showed a category there — see the note on `priorityMeta` for why it
 * cannot be one.
 *
 * The subject is on the right, ahead of the due date: the two together are
 * *what* and *when*, which is the pair a reader scanning the list is actually
 * comparing rows on, and both are facts about the task rather than about the
 * work it names. It is the same icon the calendar draws on the task's block and
 * the same one the picker showed when it was chosen, so a row here and a block
 * there are visibly the same task. A task with no subject simply has one fewer
 * thing on its row.
 *
 * A completed row is not clickable: re-opening a finished task is an edit, and
 * this list does not edit.
 */
import { timeText } from '@/utils/clock';
import { useCallback, useEffect, useRef, useState } from 'react';
import { priorityMeta } from './summary';
import { iconUrl, type Subject } from '@/services/subjects';
import type { Task } from '@/types';

/** How long the ✓ shows before the row starts leaving. */
const CHECK_MS = 220;
/** How long the leaving animation runs before the row is gone. */
const REMOVE_MS = 420;

export interface TaskRowProps {
  task: Task;
  busy?: boolean;
  /** A row in the Completed tab: shown finished, and inert. */
  done?: boolean;
  /** What the task is about, resolved from the catalogue. Absent when it has none. */
  subject?: Subject | null;
  onComplete: (task: Task) => void;
}

/** "Jul 30, 2:30 PM" — the same shape the calendar prints a due time in. */
function dueLabel(due: Date): string {
  const day = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = timeText(due);
  return `${day}, ${time}`;
}

export function TaskRow({
  task,
  busy = false,
  done = false,
  subject = null,
  onComplete,
}: TaskRowProps) {
  const [phase, setPhase] = useState<'idle' | 'checked' | 'leaving'>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const complete = useCallback(() => {
    // Guard against a second click while the row is on its way out.
    if (done || phase !== 'idle' || busy) return;
    setPhase('checked');
    timers.current.push(
      setTimeout(() => {
        setPhase('leaving');
        timers.current.push(setTimeout(() => onComplete(task), REMOVE_MS));
      }, CHECK_MS),
    );
  }, [done, phase, busy, onComplete, task]);

  const checked = done || phase !== 'idle';
  const classes = [
    'dash-task',
    checked ? 'is-checked' : '',
    phase === 'leaving' ? 'is-leaving' : '',
    done ? 'is-done' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const priority = priorityMeta(task.priority);
  const parsed = task.due_date ? new Date(task.due_date) : null;
  const due = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;

  return (
    <li className={classes}>
      <div
        className="dash-task-check"
        role="checkbox"
        aria-checked={checked}
        aria-label={done ? `${task.title} completed` : `Complete ${task.title}`}
        aria-disabled={done || undefined}
        tabIndex={done ? -1 : 0}
        onClick={complete}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            complete();
          }
        }}
      >
        {checked ? '✓' : ''}
      </div>

      <div className="dash-task-body">
        <span className="dash-task-name">{task.title || 'Untitled'}</span>
        <span className={`dash-task-tag tone-${priority.tone}`}>
          <span className="dash-task-dot" aria-hidden="true" />
          {priority.label}
        </span>
      </div>

      {/* What it is about, then when it is due. The icon is a mask painted in
          the pill's own colour, the same way the calendar's blocks draw it. */}
      {subject && (
        <span className="dash-task-subject" title={subject.name}>
          <i
            className="cal-ico"
            style={{ ['--ico' as string]: `url(${iconUrl(subject)})` }}
            aria-hidden="true"
          />
          <span className="dash-task-subject-name">{subject.label}</span>
        </span>
      )}

      <span className="dash-task-when">
        {done ? (
          <span className="dash-task-xp">+{Number(task.xp_value) || 0} XP</span>
        ) : due ? (
          `Due: ${dueLabel(due)}`
        ) : (
          <span className="dash-task-nodue">No due date</span>
        )}
      </span>
    </li>
  );
}

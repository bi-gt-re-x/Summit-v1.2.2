/**
 * One task, as a row.
 *
 * The row answers, left to right, the questions asked of it in order: is it
 * done, what is it, how urgent, what is it about, when is it owed, how long
 * will it take, what is it worth. The colour down the left edge repeats the
 * priority rather than replacing the badge — it is what makes a screenful of
 * rows scannable at a glance, and a colour alone would be the only carrier of
 * the information for a reader who cannot see it.
 *
 * Renaming happens in place: double-click the title, or press Enter on it. The
 * alternative is a dialog for the single most common edit there is.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Goal, Task } from '@/types';
import { dueLine, spellDuration } from './board';

export interface TaskRowProps {
  task: Task;
  /** The subject's printable name, already looked up. */
  subject: string | null;
  /** The outcome goals this task could be linked to. Empty when there are none. */
  goals: Goal[];
  /** Seconds set aside for it on the calendar, or null when it has no block. */
  estimate: number | null;
  /** How many notes are about it (utils/noteLinks). Zero draws nothing. */
  notes?: number;
  selected: boolean;
  starred: boolean;
  busy: boolean;
  /**
   * Painted for a couple of seconds, for a row somebody was *sent* to.
   *
   * The top bar's search navigates to `/tasks?task=<id>` and that page reveals
   * the row — see the note on it. Without the mark the reader arrives at a
   * board that scrolled somewhere for no visible reason.
   */
  marked?: boolean;
  onSelect: (task: Task, on: boolean) => void;
  onComplete: (task: Task) => void;
  onReopen: (task: Task) => void;
  onRename: (task: Task, title: string) => void;
  onDelete: (task: Task) => void;
  onStar: (task: Task) => void;
  /** Link the task to a goal, or `null` to unlink it. */
  onLink: (task: Task, goalId: string | null) => void;
}

const TARGET = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" />
  </svg>
);

const CAL = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

const NOTE = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M14 3v5h5M9 13h7M9 17h5" />
  </svg>
);

const CLOCK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export function TaskRow({
  task,
  subject,
  goals,
  estimate,
  notes = 0,
  selected,
  starred,
  busy,
  marked = false,
  onSelect,
  onComplete,
  onReopen,
  onRename,
  onDelete,
  onStar,
  onLink,
}: TaskRowProps) {
  const done = task.status === 'done';
  // The goal submenu is a second level on the row's overflow, opened from it
  // and closed with it — one menu's worth of state, not two.
  const [linking, setLinking] = useState(false);
  const goal = goals.find((entry) => String(entry.id) === String(task.goal_id)) ?? null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [menu, setMenu] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) field.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!menu) {
      setLinking(false);
      return;
    }
    const away = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [menu]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== task.title) onRename(task, next);
    else setDraft(task.title);
  };

  const when = dueLine(task);

  return (
    /* `data-task` is how the top bar's search finds this row on the page:
       it navigates to /tasks?task=<id> and pages/Tasks scrolls to whatever
       carries the id. An attribute rather than a DOM id because a row is
       rendered once per grouping and an id has to be unique on the page. */
    <li
      className={
        `tk-row is-${task.priority}${done ? ' is-done' : ''}`
        + `${busy ? ' is-busy' : ''}${marked ? ' is-found' : ''}`
      }
      data-task={task.id}
    >
      <label className="tk-check">
        <input
          type="checkbox"
          checked={done}
          disabled={busy}
          aria-label={done ? `Re-open ${task.title}` : `Complete ${task.title}`}
          onChange={() => (done ? onReopen(task) : onComplete(task))}
        />
        <span aria-hidden="true" />
      </label>

      <div className="tk-row-body">
        <div className="tk-row-line">
          {editing ? (
            <input
              ref={field}
              className="tk-rename"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit();
                if (event.key === 'Escape') {
                  setDraft(task.title);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <span
              className="tk-title"
              role="button"
              tabIndex={0}
              title="Double-click to rename"
              onDoubleClick={() => setEditing(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setEditing(true);
              }}
            >
              {task.title}
            </span>
          )}
          <span className={`tk-tag is-${task.priority}`}>
            {task.priority[0]!.toUpperCase() + task.priority.slice(1)}
          </span>
          {subject && <span className="tk-tag is-subject">{subject}</span>}
        </div>

        <div className="tk-row-meta">
          {when && (
            <span className={task.status !== 'done' && when.includes('late') ? 'is-late' : undefined}>
              <i aria-hidden="true">{CAL}</i>
              {when}
            </span>
          )}
          {goal && (
            <span className="tk-goal-chip" title={`Work toward ${goal.title}`}>
              <i aria-hidden="true">{TARGET}</i>
              {goal.title}
            </span>
          )}
          {notes > 0 && (
            <Link className="tk-notes-chip" to={`/notes?task=${encodeURIComponent(task.id)}`}
              title={`Your notes about ${task.title}`}>
              <i aria-hidden="true">{NOTE}</i>
              {notes} {notes === 1 ? 'note' : 'notes'}
            </Link>
          )}
          {estimate !== null && (
            <span title="The block you set aside for this on the calendar">
              <i aria-hidden="true">{CLOCK}</i>
              Est. {spellDuration(estimate)}
            </span>
          )}
        </div>
      </div>

      <span className="tk-xp">+{(Number(task.xp_value) || 0).toLocaleString()} XP</span>

      <button
        type="button"
        className={`tk-star${starred ? ' is-on' : ''}`}
        aria-pressed={starred}
        aria-label={starred ? `Unstar ${task.title}` : `Star ${task.title}`}
        onClick={() => onStar(task)}
      >
        <svg viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z" />
        </svg>
      </button>

      <div className="tk-row-menu" ref={menuRef}>
        <button
          type="button"
          className="tk-more"
          aria-label={`More for ${task.title}`}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="19" cy="12" r="1.7" />
          </svg>
        </button>
        {menu && linking && (
          <div className="tk-menu-panel is-row is-goals">
            <button
              type="button"
              className="tk-menu-item is-back"
              onClick={() => setLinking(false)}
            >
              ← Back
            </button>
            {goals.length === 0 ? (
              <p className="tk-menu-empty">No outcome goals yet.</p>
            ) : (
              <>
                {goal && (
                  <button
                    type="button"
                    className="tk-menu-item is-bad"
                    onClick={() => { setMenu(false); onLink(task, null); }}
                  >
                    Unlink from {goal.title}
                  </button>
                )}
                {goals.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`tk-menu-item${String(entry.id) === String(task.goal_id) ? ' is-on' : ''}`}
                    onClick={() => { setMenu(false); onLink(task, String(entry.id)); }}
                  >
                    {entry.title}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        {menu && !linking && (
          <div className="tk-menu-panel is-row">
            {/* Opens the timer with this task picked, so the sittings that
                follow are logged against it. See `?task=` in pages/Timer. */}
            {!done && (
              <Link className="tk-menu-item is-link" to={`/timer?task=${encodeURIComponent(task.id)}`}>
                Focus on this
              </Link>
            )}
            <Link className="tk-menu-item is-link" to={`/notes?task=${encodeURIComponent(task.id)}&new=1`}>
              Write a note
            </Link>
            <button type="button" className="tk-menu-item" onClick={() => { setMenu(false); setEditing(true); }}>
              Rename
            </button>
            <button type="button" className="tk-menu-item" onClick={() => setLinking(true)}>
              {goal ? 'Change goal' : 'Link to goal'}
            </button>
            <label className="tk-menu-item is-pick">
              <input
                type="checkbox"
                checked={selected}
                onChange={(event) => onSelect(task, event.target.checked)}
              />
              Select
            </label>
            <button type="button" className="tk-menu-item" onClick={() => { setMenu(false); onStar(task); }}>
              {starred ? 'Remove star' : 'Star'}
            </button>
            <button
              type="button"
              className="tk-menu-item is-bad"
              onClick={() => { setMenu(false); onDelete(task); }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

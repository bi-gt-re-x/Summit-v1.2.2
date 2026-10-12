/**
 * The moment a goal is confirmed done.
 *
 * A goal is the biggest thing the app tracks, and finishing one used to get
 * the same two-second card corner a checkpoint gets. This is the whole
 * window: a burst, the goal's name, and what it took — days, checkpoints,
 * steps, tasks — read from the record the server keeps for the Analytics
 * page, so the figures here are the ones that will be there. They arrive a
 * moment after the burst does (the confirmation is a round trip and the
 * celebration does not wait on it), and fade in when they land.
 *
 * It stays until it is closed: by the button, by Escape, or by a click on the
 * dimmed page around it. Nothing behind it can be used meanwhile. The burst is
 * decoration and is left out under reduced motion; the card is not.
 */
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { FinishedGoal } from '@/services/goals';
import type { Goal } from '@/types';

export interface Celebration {
  goal: Goal;
  /** The figures it finished on, once the server has them. */
  record: Omit<FinishedGoal, 'goal_id' | 'at'> | null;
}

/** Pieces in the burst. Placed by nth-child in styles/goals.css, not by script. */
const PIECES = 36;

export function GoalCelebration({ celebration, onClose }: {
  celebration: Celebration;
  onClose: () => void;
}) {
  const done = useRef<HTMLButtonElement>(null);
  const { goal, record } = celebration;

  useEffect(() => {
    done.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const figures = record
    ? [
        // A goal finished the day it was set has no length worth printing.
        record.days !== null && record.days > 0 && { label: record.days === 1 ? 'day' : 'days', value: record.days },
        record.checkpoints > 0 && { label: record.checkpoints === 1 ? 'checkpoint' : 'checkpoints', value: record.checkpoints },
        record.steps > 0 && { label: record.steps === 1 ? 'step' : 'steps', value: record.steps },
        record.tasks > 0 && { label: record.tasks === 1 ? 'task' : 'tasks', value: record.tasks },
      ].filter((entry): entry is { label: string; value: number } => Boolean(entry))
    : [];

  return (
    <div className="gc-veil" onClick={onClose}>
      <span className="gc-burst" aria-hidden="true">
        {Array.from({ length: PIECES }, (_, at) => <i key={at} />)}
      </span>
      <div
        className="gc-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gc-title"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="gc-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <p className="gc-kicker">Goal complete</p>
        <h2 id="gc-title" className="gc-title">{goal.title}</h2>
        <p className="gc-line">You said you&apos;d do it, and you did.</p>

        <ul className={`gc-figures${record ? ' is-in' : ''}`} aria-live="polite">
          {figures.map((figure) => (
            <li key={figure.label}>
              <strong>{figure.value.toLocaleString()}</strong>
              <span>{figure.label}</span>
            </li>
          ))}
        </ul>

        <p className={`gc-saved${record ? ' is-in' : ''}`}>
          {record ? (
            <>Saved to your <Link to="/analytics#goals-finished" onClick={onClose}>Analytics</Link>.</>
          ) : 'Saving it to your record…'}
        </p>

        <button ref={done} type="button" className="gc-done" onClick={onClose}>
          Nice
        </button>
      </div>
    </div>
  );
}

/**
 * "Complete today's tasks" — one press for the whole day.
 *
 * Used in both places a task is finished: at the head of the tasks page's list,
 * and under the dashboard's Tasks card. It holds no opinion about which tasks
 * are today's — `tasks` is whatever the caller means by the day, and the two
 * callers do not mean quite the same thing. The tasks page means what is *due*
 * today, because overdue work is grouped and labelled apart there. The
 * dashboard means what its Today tab holds, which is the plate: due today,
 * overdue, and undated. Each button sits directly under the list it acts on,
 * which is what makes both readings the obvious one where they are.
 *
 * ## Why it is not the bulk bar
 *
 * The bulk bar already completes many tasks at once, and this could have been
 * "select all, then press it". It is separate because the two answer different
 * questions. The bulk bar acts on *what the reader picked*, whatever that is;
 * this acts on *what today is*, which is a fact about the account and not about
 * the current selection or the current filters. Making it a selection shortcut
 * would mean the day's meaning changed when a subject chip was pressed, and a
 * button called "today" that completes four of the day's seven tasks because
 * three are filtered out is a button that lies.
 *
 * So it reaches past what is on screen deliberately, and pays for it by saying
 * so. `hidden` is how many of the tasks it is about the reader cannot see — the
 * tasks page's filters keeping them out, or the dashboard card's row cap — and
 * the dialog prints that line whenever it is not zero. The rule both surfaces
 * are built on is that a reader is never surprised by what an action touched,
 * and disclosure satisfies it; silence would not.
 *
 * ## Two questions in one dialog
 *
 * Completing a day's work is a dozen XP awards, a streak extension and a level
 * recalculation, and it is tedious to undo one row at a time — so it confirms.
 * The confirmation names the count and lists the first few titles, because
 * "complete 7 tasks?" is not something anybody can check the truth of.
 *
 * The second question rides along rather than following as a second dialog:
 * whether to be asked, afterwards, how each one went. It appears only when the
 * account has ratings switched on at all (`rating_depth` is not 'none'), which
 * is what `canReview` carries — this component never reads settings itself, so
 * the page keeps that decision in the one place it already lives.
 *
 * It defaults to on. The account has said in Settings that it wants to rate its
 * work; defaulting the box to off would quietly overrule that, and the whole
 * reason the box is here is that seven prompts in a row is a bigger ask than
 * one and deserves to be declinable in advance. See components/Tasks/RatePrompt
 * for what is then asked, and why nothing about it is required.
 */
import { useEffect, useState } from 'react';
import type { Task } from '@/types';
import '@/styles/day-complete.css';

/** How many titles the confirmation lists before it starts counting instead. */
const NAMED = 4;

export interface DayCompleteProps {
  /** Today's still-open tasks, filters ignored. Empty hides the button. */
  tasks: Task[];
  /**
   * How many of `tasks` the current filters are keeping off screen. Printed as
   * a warning line; the action covers them either way.
   */
  hidden: number;
  /** Mid-write: the button says so and refuses a second press. */
  busy: boolean;
  /** Whether the account rates its work at all, so whether to offer the box. */
  canReview: boolean;
  /** Confirmed. `review` is the box, and is always false when `canReview` is. */
  onConfirm: (review: boolean) => void;
}

export function DayComplete({ tasks, hidden, busy, canReview, onConfirm }: DayCompleteProps) {
  const [asking, setAsking] = useState(false);
  const [review, setReview] = useState(true);

  // Escape closes, like every other dialog in the app.
  useEffect(() => {
    if (!asking) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAsking(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asking]);

  // A day with nothing left in it needs no button. The page prints its own line
  // about an empty list; this is not the place for a second one.
  if (tasks.length === 0) return null;

  const count = tasks.length;
  const named = tasks.slice(0, NAMED);
  const rest = count - named.length;

  return (
    <>
      <button
        type="button"
        className="tk-day-all"
        disabled={busy}
        onClick={() => setAsking(true)}
      >
        <span className="tk-day-tick" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </span>
        Complete {count === 1 ? "today's task" : `all ${count} of today's tasks`}
      </button>

      {asking && (
        <div
          className="tk-day-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setAsking(false);
          }}
        >
          <div
            className="tk-day-popup"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tk-day-title"
          >
            <h3 className="tk-day-title" id="tk-day-title">
              {count === 1 ? 'Complete this task?' : `Complete all ${count} tasks?`}
            </h3>
            <p className="tk-day-blurb">
              Marks all of these done, with XP, streak and goal progress. Reopening a task later doesn't take the XP back.
            </p>

            <ul className="tk-day-list">
              {named.map((task) => (
                <li key={task.id} title={task.title}>
                  {task.title}
                </li>
              ))}
              {rest > 0 && <li className="tk-day-rest">and {rest} more</li>}
            </ul>

            {hidden > 0 && (
              <p className="tk-day-warn">
                {hidden === 1
                  ? '1 of these is not shown in the list.'
                  : `${hidden} of these aren't shown in the list.`}
              </p>
            )}

            {canReview && (
              <label className="tk-day-review">
                <input
                  type="checkbox"
                  checked={review}
                  onChange={(event) => setReview(event.target.checked)}
                />
                <span>
                  Rate them afterwards
                  <small>
                    {count === 1
                      ? "One quick prompt once it's done."
                      : `One prompt each, ${count} in a row. Every one can be skipped.`}
                  </small>
                </span>
              </label>
            )}

            <div className="tk-day-actions">
              <button
                type="button"
                className="tk-day-cancel"
                onClick={() => setAsking(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tk-day-go"
                disabled={busy}
                onClick={() => {
                  setAsking(false);
                  onConfirm(canReview && review);
                }}
              >
                {count === 1 ? 'Complete it' : `Complete ${count}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

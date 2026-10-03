/**
 * What to do next — the top of the one list.
 *
 * The list is decided on the server (backend/tracking/next_actions.py) and the
 * analytics page's Recommendations tab shows the rest of it, so this line and
 * that tab cannot suggest different things. It used to be two lines here — a
 * "what now" read off today's timed tasks, and a "worth changing" from a
 * planner the browser ran with its own inputs — and neither agreed with the
 * Recommendations tab, which ran the same planner with different ones.
 *
 * `refresh` is bumped by the page when a task is finished, so a suggestion to
 * finish that task leaves rather than sitting there done.
 */
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '@/hooks';
import { next as nextService } from '@/services';
import type { NextResult } from '@/services/next';

export interface NextMoveProps {
  /** Who is signed in; nothing is asked for without one. */
  username: string | null;
  /** Bumped by the page after a write that could change the answer. */
  refresh?: unknown;
}

export function NextMove({ username, refresh }: NextMoveProps) {
  const call = useCallback(
    () =>
      username
        ? nextService.nextActions()
        : Promise.resolve({ success: false as const, message: 'Sign in to see what to do next.' }),
    [username],
  );
  const { data } = useApi<NextResult>(call, [username, refresh]);

  const move = data?.plan.top;
  if (!move) return null;

  return (
    <section className="dash-move" aria-label="What to do next">
      <span className="dash-move-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
      </span>
      <div className="dash-move-main">
        <span className="dash-move-label">Next</span>
        <strong className="dash-move-title">{move.title}</strong>
        <span className="dash-move-why">{move.because}</span>
      </div>
      <Link className="dash-move-all" to="/recommendations">
        See the plan<span aria-hidden="true"> →</span>
      </Link>
    </section>
  );
}

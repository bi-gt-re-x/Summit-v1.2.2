/**
 * The goals the reader has confirmed done, as an Overview panel.
 *
 * Fed by the record the Goals page writes when somebody answers "yes, it's
 * done" (`verify_goal` in backend/api/goals.py, a `goal_completed` row in
 * activity_log), which keeps the figures the goal finished on: how long it
 * took, how many checkpoints, steps and tasks it came to. A goal its numbers
 * finished but nobody confirmed is not here, and that is the point of asking.
 *
 * Its own read rather than one of the page's two: it is a short list, nothing
 * else on the page needs it, and the panel simply does not draw until there is
 * at least one. The celebration links here by `#goals-finished`, so the panel
 * scrolls itself into view when it arrives with that address.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Panel } from './charts';
import { finishedGoals, type FinishedGoal } from '@/services/goals';

/** Rows listed before the rest are left to the Goals page. */
const SHOWN = 6;

function when(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function plural(count: number, word: string): string {
  return `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;
}

export function GoalsFinished() {
  const [rows, setRows] = useState<FinishedGoal[]>([]);
  const { hash } = useLocation();
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    finishedGoals()
      .then((result) => {
        if (live && result.success) setRows(result.goals ?? []);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (hash === '#goals-finished' && rows.length) {
      anchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [hash, rows.length]);

  if (!rows.length) return null;

  const timed = rows.filter((row) => row.days !== null);
  const typical = timed.length
    ? Math.round(timed.reduce((sum, row) => sum + (row.days ?? 0), 0) / timed.length)
    : null;
  const thisYear = rows.filter((row) => row.at.slice(0, 4) === String(new Date().getFullYear())).length;

  return (
    <div id="goals-finished" ref={anchor} className="ax-section">
      <Panel
        title="Goals finished"
        note="Goals you finished and how long each took"
        aside={<Link className="ax-link" to="/goals">Your goals</Link>}
      >
        <dl className="ax-gf-stats">
          <div><dt>Finished</dt><dd>{rows.length.toLocaleString()}</dd></div>
          <div><dt>This year</dt><dd>{thisYear.toLocaleString()}</dd></div>
          {typical !== null && (
            <div><dt>Typical time</dt><dd>{typical === 0 ? 'Same day' : plural(typical, 'day')}</dd></div>
          )}
        </dl>
        <ul className="ax-gf-list">
          {rows.slice(0, SHOWN).map((row) => (
            <li key={`${row.goal_id}-${row.at}`}>
              <span className="ax-gf-title">{row.title}</span>
              <span className="ax-gf-when">{when(row.at)}</span>
              <span className="ax-gf-took">
                {[
                  row.days === null ? null : row.days === 0 ? 'same day' : plural(row.days, 'day'),
                  row.checkpoints ? plural(row.checkpoints, 'checkpoint') : null,
                  row.steps ? plural(row.steps, 'step') : null,
                  row.tasks ? plural(row.tasks, 'task') : null,
                ].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/**
 * Where a goal is on the way from where it started to where it is going.
 *
 * ## Why a rail and not another percentage
 *
 * "88%" is true and says almost nothing. It does not say 88% of what, it does
 * not say what the number would have to become, and it does not say how far
 * that is from here. A rail says all three at once: the scale is drawn, the
 * target is a mark on it, and the distance between them is a length you can
 * see rather than a subtraction you have to do.
 *
 * So a number goal draws its own scale — 0 to the target, marked at the value
 * it is on — and prints the three figures underneath that a percentage hides:
 * where you are, where you are going, and what is left.
 *
 * ## Milestone goals get stops instead
 *
 * A checkpoint goal has no scale, because checkpoints are not a quantity. Five
 * of them is not "five units of progress", and drawing them on a ruler implies
 * an evenness that is not there — the fifth checkpoint is nearly always the
 * long one. They are drawn as stops on a line instead, in order, with the ones
 * already reached filled in. That is the same shape the ladder above uses, at
 * a size you can take in without reading.
 *
 * ## What is deliberately not here
 *
 * A "best ever" figure, which the design this was built from asks for. The
 * goals table keeps `current_value` and nothing behind it, so a personal best
 * is not a number this app has ever recorded — only the value right now, which
 * is overwritten each time it moves. Printing today's value under a "Best"
 * heading would be a fabrication that happens to be right on the day somebody
 * sets a record. It wants a history table, and that is a migration.
 */
import { useMemo } from 'react';
import { categoryOf } from './Outcome';
import { fmtGoalNumber, goalNumbers } from './numbers';
import type { Goal } from '@/types';

export interface Reading {
  current: number;
  target: number;
  /** What is still to be covered. Never negative. */
  left: number;
  pct: number;
  label: string;
}

/** The three figures a numeric goal's rail prints. */
export function reading(goal: Goal): Reading | null {
  const numbers = goalNumbers(goal);
  if (!numbers.numeric || !(numbers.target > 0)) return null;
  return {
    current: numbers.current,
    target: numbers.target,
    left: Math.max(0, numbers.target - numbers.current),
    pct: Math.max(0, Math.min(100, numbers.progress)),
    label: numbers.label || '',
  };
}

export function Trajectory({
  goals,
  onOpen,
  limit = 4,
}: {
  goals: Goal[];
  onOpen: (goal: Goal) => void;
  limit?: number;
}) {
  const shown = useMemo(
    () => goals.filter((goal) => goal.status !== 'completed').slice(0, limit),
    [goals, limit],
  );

  if (shown.length === 0) {
    return <p className="gx-empty">No active goal to plot yet.</p>;
  }

  return (
    <ul className="gx-traj">
      {shown.map((goal) => {
        const category = categoryOf(goal);
        const numbers = reading(goal);
        const stops = goal.milestones ?? [];

        return (
          <li className={`gx-traj-row tone-${category.tone}`} key={goal.id}>
            <button type="button" className="gx-traj-head" onClick={() => onOpen(goal)}>
              <span className="gx-traj-title">{goal.title}</span>
              <span className="gx-quiet">{Math.round(goalNumbers(goal).progress)}%</span>
            </button>

            {numbers ? (
              <>
                <div className="gx-traj-rail">
                  <span className="gx-traj-fill" style={{ width: `${numbers.pct}%` }} />
                  <span
                    className="gx-traj-dot"
                    style={{ left: `${numbers.pct}%` }}
                    aria-hidden="true"
                  />
                  <span className="gx-traj-end" aria-hidden="true" />
                </div>

                <dl className="gx-traj-figs">
                  <div>
                    <dt>Current</dt>
                    <dd>
                      {fmtGoalNumber(numbers.current, goalNumbers(goal))}
                      {numbers.label && <em> {numbers.label}</em>}
                    </dd>
                  </div>
                  <div>
                    <dt>Target</dt>
                    <dd>{fmtGoalNumber(numbers.target, goalNumbers(goal))}</dd>
                  </div>
                  <div>
                    <dt>Needed</dt>
                    <dd className={numbers.left === 0 ? 'is-there' : undefined}>
                      {numbers.left === 0
                        ? 'reached'
                        : `+${fmtGoalNumber(numbers.left, goalNumbers(goal))}`}
                    </dd>
                  </div>
                </dl>
              </>
            ) : stops.length > 0 ? (
              /* Checkpoint goals: stops, not a scale. See the docstring. */
              <ol className="gx-stops">
                {stops.map((stop) => (
                  <li
                    key={stop.id}
                    className={`gx-stop is-${stop.status}`}
                    title={stop.title}
                  >
                    <i aria-hidden="true" />
                    <span>{stop.title}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="gx-traj-none">
                No target or checkpoints yet, so there's nothing to chart.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

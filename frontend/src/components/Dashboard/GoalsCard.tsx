/**
 * The two goals worth looking at today.
 *
 * The dashboard had nothing about goals at all — the one word "goal" on the
 * page was the daily XP target, which is a different thing. So it could tell
 * you that you earned 150 XP today and nothing whatever about what the XP was
 * *for*, on a page whose whole premise is long-term progress.
 *
 * ## Which two
 *
 * Not the first two, and not the nearest done. **The two furthest behind**:
 * `goalPace` (utils/goalHealth) projects where a goal lands at the rate it has
 * actually been moving, and `drift` is how many days late that projection is.
 * A goal that is slipping is the one a reader can still do something about
 * today; a goal that is comfortably ahead needs nothing from them and would be
 * taking the slot.
 *
 * A goal with no deadline has no pace to be behind — nothing is late when
 * nothing is due — so those are ranked under the dated ones, least finished
 * first, and only fill a slot the dated ones leave empty.
 *
 * ## What it does not do
 *
 * It does not score, diagnose or advise. Analytics has a whole tab for that
 * and does it far better with the room to. This is a reminder with a bar on
 * it, and the link goes to the page that can say more.
 */
import { Link } from 'react-router-dom';
import { goalNumbers } from '@/components/Goals';
import { goalPace } from '@/utils/goalHealth';
import type { Goal } from '@/types';
import { Card } from '@/components/ui';

export interface GoalsCardProps {
  goals: Goal[];
  /** How many to draw. Two is what the row has room for. */
  limit?: number;
}

/** How late a goal is heading, in days. Undated goals sort after every dated one. */
function lateness(goal: Goal): number {
  const { drift } = goalPace(goal);
  if (drift === null) return -Infinity;
  return drift;
}

export function GoalsCard({ goals, limit = 2 }: GoalsCardProps) {
  const live = goals
    .filter((goal) => goal.status === 'active')
    .map((goal) => ({ goal, numbers: goalNumbers(goal), drift: lateness(goal) }))
    .sort(
      (a, b) =>
        b.drift - a.drift
        // Same drift, or both undated: the one with least behind it.
        || a.numbers.progress - b.numbers.progress,
    )
    .slice(0, limit);

  return (
    <Card className="dash-panel dash-insight dash-goals">
      <h2 className="dash-panel-title dash-insight-title">
        <span className="dash-stat-ico dash-ico-goal" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="8.5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="12" cy="12" r="1" />
          </svg>
        </span>
        What it is for
        <Link className="dash-goals-all" to="/goals">
          All goals
        </Link>
      </h2>

      {live.length === 0 ? (
        <p className="dash-empty">
          No goals running. <Link to="/goals">Set one</Link> and the day&rsquo;s work
          starts adding up to something.
        </p>
      ) : (
        <ul className="dash-goal-list">
          {live.map(({ goal, numbers, drift }) => {
            const percent = Math.max(0, Math.min(100, Math.round(numbers.progress)));
            /* Said only when it is worth saying. "Two days early" is not news
               and "on track" is the state a reader assumes; a goal running
               late is the reason this card picked it. */
            const late = drift > 0 && Number.isFinite(drift);

            return (
              <li key={goal.id}>
                <span className="dash-goal-head">
                  <span className="dash-goal-name" title={goal.title}>
                    {goal.title}
                  </span>
                  <span className="dash-goal-pct">{percent}%</span>
                </span>
                <span className="dash-goal-track">
                  <i
                    className={`dash-goal-fill${late ? ' is-late' : ''}`}
                    style={{ width: `${Math.max(2, percent)}%` }}
                  />
                </span>
                <span className="dash-goal-foot">
                  <span>
                    {Math.round(numbers.current).toLocaleString()}
                    {numbers.target > 0 && ` / ${Math.round(numbers.target).toLocaleString()}`}
                    {numbers.label && ` ${numbers.label}`}
                  </span>
                  {late && (
                    <span className="dash-goal-late">
                      {drift === 1 ? '1 day behind' : `${drift} days behind`}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

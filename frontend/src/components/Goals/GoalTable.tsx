/**
 * The tab strip, and every goal as one row.
 *
 * ## Why the page grew tabs
 *
 * It had eleven bands on it. Each one earns its place on its own and together
 * they are more than anybody reads in a sitting — which is the failure mode
 * the goals page was explicitly built to avoid, and it had crept back. Tabs
 * are the cheap fix: the same bands, four smaller pages, and Overview is the
 * one that opens. Nothing is removed and nothing is hidden that was not
 * already below the fold.
 *
 * The tabs are state rather than routes. A goals page is one page in the
 * router and a reader who lands on it from the rail expects Overview, not
 * whichever tab they left open a week ago; making them URLs would also put
 * five entries in the back button for what is one screen.
 *
 * ## Why a table
 *
 * The cards above answer "how is this one goal going" and are the right shape
 * for four goals. A table answers "how are all of them going", which is a
 * different question and the one you ask when there are ten — it puts the
 * progress, the health and the date in the same column for every row, so they
 * can be compared down the page instead of held in your head across cards.
 */
import { useMemo } from 'react';
import { categoryOf } from './Outcome';
import { formatGoalDate, goalNumbers, isOverdue } from './numbers';
import { goalHealth, healthFactors } from '@/utils/goalHealth';
import type { Goal, Task } from '@/types';
import { countsToward } from '@/utils/goalLinks';

const DAY = 86_400_000;

/**
 * The four the page is divided into.
 *
 * They are four questions rather than four groupings of the same content, which
 * is what the previous five were not: Overview, All Goals and Milestones each
 * drew a different arrangement of the same goals, so the tab strip was asking
 * the reader to pick a layout rather than a subject.
 *
 *     Active Goals  what am I doing, one full card each
 *     Timeline      when does it land — the rails and the calendar
 *     System Goals  the counters the app keeps: XP, streak, tasks, focus
 *     Stats         where I stand, what is next, and whether it is going to
 *                   happen
 *
 * Completed went with them: it was a tab holding one band, and that band is a
 * button in the header that reveals it wherever you are. */
export const TABS = [
  { id: 'active', label: 'Active Goals' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'system', label: 'System Goals' },
  { id: 'stats', label: 'Stats' },
] as const;

export type TabId = (typeof TABS)[number]['id'];

export function GoalTabs({ tab, onTab }: { tab: TabId; onTab: (id: TabId) => void }) {
  return (
    <div className="gx-tabs" role="tablist" aria-label="Which part of your goals">
      {TABS.map((entry) => (
        <button
          key={entry.id}
          type="button"
          role="tab"
          aria-selected={tab === entry.id}
          className={`gx-tab${tab === entry.id ? ' is-on' : ''}`}
          onClick={() => onTab(entry.id)}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
/** "Today", "2 days ago" — when work last landed against a goal. */
function lastActivity(goal: Goal, tasks: Task[], today: Date): string {
  const ids = new Set((goal.milestones ?? []).map((row) => row.id));
  let newest = 0;

  for (const task of tasks) {
    if (task.status !== 'done' || !task.completed_at) continue;
    const mine = countsToward(task, goal.id) || (task.milestone_id && ids.has(task.milestone_id));
    if (!mine) continue;
    const at = new Date(task.completed_at).getTime();
    if (!Number.isNaN(at) && at > newest) newest = at;
  }

  if (!newest) return 'No work yet';
  const days = Math.floor((today.getTime() - newest) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.round(days / 7)} week${days < 14 ? '' : 's'} ago`;
  return `${Math.round(days / 30)} month${days < 60 ? '' : 's'} ago`;
}

const HEALTH_LABEL: Record<string, string> = {
  'on-track': 'On Track',
  'at-risk': 'At Risk',
  'off-track': 'Off Track',
  'not-started': 'Not Started',
};

export interface GoalTableProps {
  goals: Goal[];
  tasks: Task[];
  onOpen: (goal: Goal) => void;
  onEdit: (goal: Goal) => void;
  today?: Date;
}

export function GoalTable({ goals, tasks, onOpen, onEdit, today = new Date() }: GoalTableProps) {
  const rows = useMemo(
    () =>
      goals.map((goal) => {
        const numbers = goalNumbers(goal);
        const health = goalHealth(goal, tasks, today);
        const next = (goal.milestones ?? []).find((row) => row.status !== 'done');
        const deadline = goal.deadline
          ? Math.round(
              (new Date(`${String(goal.deadline).slice(0, 10)}T00:00:00`).getTime() -
                today.getTime()) /
                DAY,
            )
          : null;
        return { goal, numbers, health, next, deadline };
      }),
    [goals, tasks, today],
  );

  if (rows.length === 0) {
    return <p className="gx-empty">No goals to list.</p>;
  }

  return (
    <div className="gx-table-wrap">
      <table className="gx-table">
        <thead>
          <tr>
            <th>Goal</th>
            <th>Progress</th>
            <th>Health</th>
            <th>Target</th>
            <th>Next milestone</th>
            <th>Last activity</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ goal, numbers, health, next, deadline }) => {
            const category = categoryOf(goal);
            return (
              <tr key={goal.id} className={`tone-${category.tone}`}>
                <td>
                  <button type="button" className="gx-table-goal" onClick={() => onOpen(goal)}>
                    <span className="gx-table-title">{goal.title}</span>
                    <span className="gx-quiet">{category.label}</span>
                  </button>
                </td>

                <td>
                  <div className="gx-table-pct">
                    <strong>{Math.round(numbers.progress)}%</strong>
                    <span className="gx-table-bar" aria-hidden="true">
                      <i style={{ width: `${Math.max(2, Math.min(100, numbers.progress))}%` }} />
                    </span>
                  </div>
                  <span className="gx-quiet">
                    {numbers.numeric && numbers.target > 0
                      ? `${numbers.current} / ${numbers.target}${numbers.label ? ` ${numbers.label}` : ''}`
                      : `${numbers.current} / ${numbers.target} milestones`}
                  </span>
                </td>

                <td>
                  <span className={`gx-pill is-${health.state}`}>
                    {HEALTH_LABEL[health.state] ?? health.state}
                  </span>
                </td>

                <td>
                  {goal.deadline ? (
                    <>
                      <span className="gx-table-date">{formatGoalDate(goal.deadline)}</span>
                      <span className={`gx-quiet${isOverdue(goal) ? ' is-late' : ''}`}>
                        {deadline === null
                          ? ''
                          : deadline < 0
                            ? `${Math.abs(deadline)} days over`
                            : `${deadline} days left`}
                      </span>
                    </>
                  ) : (
                    <span className="gx-quiet">No date</span>
                  )}
                </td>

                <td>
                  {next ? (
                    <>
                      <span className="gx-table-next">{next.title}</span>
                      <span className="gx-quiet">
                        {next.target_date ? `Due ${formatGoalDate(next.target_date)}` : 'No date'}
                      </span>
                    </>
                  ) : (
                    <span className="gx-quiet">Every checkpoint reached</span>
                  )}
                </td>

                <td>
                  <span className="gx-quiet">{lastActivity(goal, tasks, today)}</span>
                </td>

                <td>
                  <button
                    type="button"
                    className="gx-table-more"
                    aria-label={`Edit ${goal.title}`}
                    title="Edit this goal"
                    onClick={() => onEdit(goal)}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="12" cy="5" r="1.7" />
                      <circle cx="12" cy="12" r="1.7" />
                      <circle cx="12" cy="19" r="1.7" />
                    </svg>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
/**
 * Which goals are in which state, and why.
 *
 * The ring above it says four numbers; this says which goals they are. It
 * exists because the ring is a short card sitting in a two-column row beside a
 * tall one, and the empty half-column under it was the page's largest patch of
 * nothing — but a filler would have been worse than the gap. A reader who sees
 * "3 off track" immediately wants to know which three, and `goalHealth`
 * already computes the one-line reason for each, so the answer was sitting
 * there uncollected.
 *
 * Worst first: a list of things needing attention that opens with the things
 * that do not is a list nobody reads to the end of.
 */
const ORDER: Record<string, number> = {
  'off-track': 0,
  'at-risk': 1,
  'not-started': 2,
  'on-track': 3,
};

export function HealthBreakdown({
  goals,
  tasks,
  onOpen,
  today = new Date(),
  limit = 6,
}: {
  goals: Goal[];
  tasks: Task[];
  onOpen: (goal: Goal) => void;
  today?: Date;
  limit?: number;
}) {
  const rows = useMemo(
    () =>
      goals
        .filter((goal) => goal.status !== 'completed')
        .map((goal) => ({ goal, health: goalHealth(goal, tasks, today) }))
        .sort(
          (a, b) =>
            (ORDER[a.health.state] ?? 9) - (ORDER[b.health.state] ?? 9) ||
            a.health.score - b.health.score,
        )
        .slice(0, limit),
    [goals, limit, tasks, today],
  );

  if (rows.length === 0) return null;

  return (
    <ul className="gx-health-list">
      {rows.map(({ goal, health }) => {
        /* Two of each at most. The blend has four signals and a goal in real
           trouble fails most of them, so an uncapped list turns a diagnosis
           into a wall — and the two heaviest are the two worth acting on,
           which is what the ordering in `healthFactors` is for. */
        const found = healthFactors(health);
        const helping = found.filter((one) => one.good).slice(0, 2);
        const holding = found.filter((one) => !one.good).slice(0, 2);

        return (
          <li key={goal.id} className={`gx-health-row is-${health.state}`}>
            <button type="button" onClick={() => onOpen(goal)}>
              <i aria-hidden="true" />
              <span className="gx-health-name">{goal.title}</span>
              <span className="gx-health-score">
                {health.score}
                <em>{health.label}</em>
              </span>
            </button>

            {/* The working, not a second opinion. Everything here went into
                the score printed above it — a reader who has come this far has
                come to ask why, and one sentence about the weakest signal
                leaves them guessing which of four things to change. */}
            {(helping.length > 0 || holding.length > 0) && (
              <div className="gx-health-why">
                {holding.length > 0 && (
                  <div className="gx-health-side is-bad">
                    <h5>Holding it back</h5>
                    <ul>
                      {holding.map((one) => (
                        <li key={one.key}>{one.note}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {helping.length > 0 && (
                  <div className="gx-health-side is-good">
                    <h5>Helping</h5>
                    <ul>
                      {helping.map((one) => (
                        <li key={one.key}>{one.note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The row under the month: what to add, what is coming, and what it is for.
 *
 * The grid and the strip above it are both retrospective — this is what
 * happened and how it compares. A month view that only looks backwards is a
 * report; these three make it a place to work from.
 *
 * **Quick Add** is four doors, not four dialogs. Two of them open the dialogs
 * this page already owns (a task and an event on the selected day) and two go
 * to the pages that own the other two kinds. A goal or a note made in a corner
 * of the calendar would be a second, worse version of a page that exists.
 *
 * **Next Up** is the account's own dated work, forwards. The grid says what a
 * day holds only once you find the day; this says which day to look at, and it
 * is the one panel here that reads the future rather than the month — a
 * deadline four days out matters just as much when it falls after the 30th.
 *
 * **Goals Progress** is the answer to "what was all that XP for". Two goals,
 * the ones nearest done, because the panel is a reminder rather than the goals
 * page — which is one click away and says everything.
 */
import { Link } from 'react-router-dom';
import { goalNumbers } from '@/components/Goals';
import { dates } from '@/utils';
import type { Goal } from '@/types';

/** One thing coming up: a task with a date, or an event on the calendar. */
export interface Upcoming {
  key: string;
  name: string;
  iso: string;
  /** "9:00 AM", or '' for something with no time on it. */
  at: string;
  kind: 'task' | 'event';
}

export interface MonthToolsProps {
  /** The next few dated things, soonest first. Three are drawn. */
  upcoming: Upcoming[];
  /** The account's live goals. The two nearest done are drawn. */
  goals: Goal[];
  onAddTask: () => void;
  onAddEvent: () => void;
}

/** "in 4 days", "tomorrow", "today" — how far off something is. */
function away(iso: string, from: Date = new Date()): string {
  const day = dates.fromIsoDate(iso);
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const gap = Math.round((day.getTime() - start.getTime()) / 86_400_000);
  if (gap <= 0) return 'today';
  if (gap === 1) return 'tomorrow';
  if (gap < 7) return `in ${gap} days`;
  if (gap < 14) return 'next week';
  return `in ${Math.round(gap / 7)} weeks`;
}

const ICONS = {
  task: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="m9 12 2 2 4-4.5" />
    </svg>
  ),
  event: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
    </svg>
  ),
  goal: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  ),
  note: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3.5h8.5L19 8v12.5H6z" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  ),
};

export function MonthTools({ upcoming, goals, onAddTask, onAddEvent }: MonthToolsProps) {
  /* Nearest done first, and only the ones actually being worked. A goal at
     100% is a result rather than a reminder, and belongs on the page that
     celebrates it. */
  const live = goals
    .filter((goal) => goal.status === 'active')
    .map((goal) => ({ goal, numbers: goalNumbers(goal) }))
    .sort((a, b) => b.numbers.progress - a.numbers.progress)
    .slice(0, 2);

  return (
    <div className="mv-tools">
      <section className="mv-card mv-quickadd">
        <h3 className="mv-card-title">Quick add</h3>
        <div className="mv-quick-grid">
          <button type="button" className="mv-quick tone-task" onClick={onAddTask}>
            <span className="mv-quick-ico">{ICONS.task}</span>
            Task
          </button>
          <button type="button" className="mv-quick tone-event" onClick={onAddEvent}>
            <span className="mv-quick-ico">{ICONS.event}</span>
            Event
          </button>
          {/* Goals and notes have pages of their own. A second editor in the
              corner of a calendar would be a worse copy of one that exists. */}
          <Link className="mv-quick tone-goal" to="/goals">
            <span className="mv-quick-ico">{ICONS.goal}</span>
            Goal
          </Link>
          <Link className="mv-quick tone-note" to="/notes">
            <span className="mv-quick-ico">{ICONS.note}</span>
            Note
          </Link>
        </div>
      </section>

      <section className="mv-card">
        <h3 className="mv-card-title">Next up</h3>
        {upcoming.length === 0 ? (
          <p className="mv-empty">Nothing dated ahead of today.</p>
        ) : (
          <ul className="mv-upcoming">
            {upcoming.slice(0, 3).map((entry) => (
              <li key={entry.key}>
                <span className={`mv-upcoming-ico tone-${entry.kind}`} aria-hidden="true">
                  {ICONS[entry.kind]}
                </span>
                <span className="mv-upcoming-main">
                  <span className="mv-upcoming-name">{entry.name}</span>
                  <span className="mv-upcoming-when">
                    {dates.formatDate(dates.fromIsoDate(entry.iso), {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    {entry.at && ` · ${entry.at}`}
                  </span>
                </span>
                <span className="mv-upcoming-away">{away(entry.iso)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mv-card">
        <div className="mv-card-head">
          <h3 className="mv-card-title">Goals</h3>
          <Link className="mv-card-link" to="/goals">
            View all
          </Link>
        </div>
        {live.length === 0 ? (
          <p className="mv-empty">No goals yet. Start one on the Goals page.</p>
        ) : (
          <ul className="mv-goals">
            {live.map(({ goal, numbers }) => (
              <li key={goal.id}>
                <span className="mv-goal-ico" aria-hidden="true">
                  {ICONS.goal}
                </span>
                <span className="mv-goal-main">
                  <span className="mv-goal-name">{goal.title}</span>
                  <span className="mv-goal-track">
                    <i
                      className="mv-goal-fill"
                      style={{ width: `${Math.max(2, Math.min(100, numbers.progress))}%` }}
                    />
                  </span>
                </span>
                <span className="mv-goal-figs">
                  <strong>{Math.round(numbers.current).toLocaleString()}</strong>
                  {numbers.target > 0 && ` / ${Math.round(numbers.target).toLocaleString()}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

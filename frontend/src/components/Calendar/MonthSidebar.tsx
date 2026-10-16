/**
 * The Month view's overview column — everything below the day's plan.
 *
 * Three panels, and each is scoped to the month on screen rather than to
 * "now": stepping back a month steps all of them back, so every number in the
 * column is answering a question about the same thirty days as the grid beside
 * it. That is the whole reason the column is readable.
 *
 * Monthly Overview is four tiles of fact. Top Performing Days is the same
 * month's XP, ranked — the one panel that tells the reader *which* days did the
 * work, which is a question a grid of shaded squares can only gesture at.
 * Monthly Insights is one sentence about the month against the month before,
 * chosen from the figures rather than fixed (see utils/monthSummary).
 *
 * Nothing here has a "no data" state that hides the panel: a month with nothing
 * in it is a real answer and the panels say so, because a column that vanishes
 * when the month is empty is a column the reader learns not to trust.
 */
import { Overview } from './Overview';
import { fmtHM } from '@/hooks/useFocusSession';
import { dates } from '@/utils';
import type { MonthDay, MonthInsight } from '@/utils/monthSummary';

export interface MonthSidebarProps {
  /** Tasks landing in the month, and how many are finished. */
  tasks: number;
  done: number;
  /** Focused against planned, in seconds. */
  focused: number;
  planned: number;
  xpEarned: number;
  best: MonthDay | null;
  /** The three best days by XP earned, best first. */
  top: MonthDay[];
  insight: MonthInsight;
  onViewAll: () => void;
}

/** "Aug 15 (Sat)" — how Top Performing Days names a day. */
function dayLabel(iso: string): string {
  const date = dates.fromIsoDate(iso);
  const short = dates.formatDate(date, { month: 'short', day: 'numeric' });
  const weekday = dates.formatDate(date, { weekday: 'short' });
  return `${short} (${weekday})`;
}


export function MonthSidebar({
  tasks,
  done,
  focused,
  planned,
  xpEarned,
  best,
  top,
  insight,
  onViewAll,
}: MonthSidebarProps) {
  // Every bar is a share of the best day, so the leader fills the track and
  // the rest are read against it. That is the comparison the panel exists for.
  const peak = top[0]?.earned ?? 0;

  return (
    <>
      {/* The panel all three views share — components/Calendar/Overview.tsx.
          It was written here, as the Month view's own four tiles, and the Week
          and Day views each had a differently-shaped answer to the same three
          questions. The fourth tile is still this view's: a best day is a
          thing only a month can have. */}
      <Overview
        scale="month"
        tasks={tasks}
        done={done}
        focused={fmtHM(focused)}
        planned={fmtHM(planned)}
        xp={xpEarned}
        extra={{
          icon: (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m12 4 2.4 5 5.6.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.6-.8z" />
            </svg>
          ),
          label: 'Best day',
          value: best
            ? dates.formatDate(dates.fromIsoDate(best.iso), { month: 'short', day: 'numeric' })
            : '-',
          sub: best ? `${best.earned.toLocaleString()} XP` : 'nothing yet',
        }}
      />

      <section className="mv-card">
        <div className="mv-card-head">
          <h3 className="mv-card-title">Best days</h3>
          <button type="button" className="mv-card-link" onClick={onViewAll}>
            View all
          </button>
        </div>

        {top.length === 0 ? (
          <p className="mv-empty">No XP earned this month yet.</p>
        ) : (
          <ol className="mv-topdays">
            {top.map((day, index) => (
              <li key={day.iso}>
                <span className="mv-topday-rank">{index + 1}</span>
                <span className="mv-topday-name">{dayLabel(day.iso)}</span>
                <span className="mv-topday-track">
                  <i
                    className="mv-topday-fill"
                    style={{ width: `${peak > 0 ? Math.max(6, (day.earned / peak) * 100) : 0}%` }}
                  />
                </span>
                <span className="mv-topday-xp">{day.earned.toLocaleString()} XP</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mv-card">
        <h3 className="mv-card-title">This month</h3>
        <div className="mv-insight">
          <span className="mv-insight-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M9.5 18h5M10 21h4" />
              <path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .9 1.6h5.2c.1-.6.4-1.2.9-1.6A6 6 0 0 0 12 3Z" />
            </svg>
          </span>
          <span className="mv-insight-body">
            <span className="mv-insight-head">{insight.headline}</span>
            <span className="mv-insight-hint">{insight.hint}</span>
          </span>
        </div>
      </section>
    </>
  );
}

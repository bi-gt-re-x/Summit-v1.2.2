/**
 * The strip under the month grid — how the month is going, in one line.
 *
 * A ring and three figures, each carried against the same month a year's worth
 * of habit is actually judged by: the one before it. The comparison is the
 * point of the strip. "6,240 XP" is a number; "6,240 XP, up 18% on July" is a
 * month.
 *
 * A figure with nothing to compare against says nothing rather than something
 * absurd — a first month is not an infinite improvement on the void before it —
 * so the delta line is simply absent until there is a previous month with
 * something in it.
 *
 * This stands where "Day Completion Progress" used to. That ring answered a
 * question about the selected day while sitting under a grid of thirty of
 * them, and the day it described already has a whole column of its own on the
 * right.
 */
import { useCountUp } from '@/hooks/useCountUp';
import { percentChange } from '@/utils/monthSummary';

const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

export interface MonthSummaryBarProps {
  /** Days where everything scheduled got done, out of days that had anything. */
  settled: number;
  scheduled: number;
  xpEarned: number;
  avgGoal: number;
  /** The account's live streak, and the longest it has ever been. */
  streak: number;
  bestStreak: number;
  /** The same three figures for the month before, for the deltas. */
  previous: { settled: number; xpEarned: number; avgGoal: number };
  /** "Jul" — the month the deltas are against. */
  previousName: string;
  onViewAnalytics: () => void;
}

/**
 * One "↑ 18% vs Jul" line.
 *
 * Up is green and down is red, but the arrow carries the same claim as the
 * colour so the line still reads without it.
 */
function Delta({
  value,
  suffix,
  against,
}: {
  value: number | null;
  suffix: string;
  against: string;
}) {
  if (value === null || value === 0) return <span className="mv-delta is-flat">vs. {against}</span>;
  const up = value > 0;
  return (
    <span className={`mv-delta${up ? ' is-up' : ' is-down'}`}>
      <span aria-hidden="true">{up ? '↑' : '↓'}</span> {Math.abs(value)}
      {suffix} vs {against}
    </span>
  );
}

/**
 * One figure: an icon chip, the number, what it is, and the line under it.
 *
 * The chip is what makes four figures in a row scannable — without it they are
 * a paragraph of numerals in the same weight, and the eye has nothing to land
 * on between them.
 */
function Figure({
  tone,
  icon,
  label,
  value,
  children,
}: {
  tone: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mv-summary-fig">
      <span className={`mv-fig-ico tone-${tone}`} aria-hidden="true">
        {icon}
      </span>
      <span className="mv-fig-body">
        <span className="mv-fig-label">{label}</span>
        <span className="mv-fig-value">{value}</span>
        {children}
      </span>
    </div>
  );
}

export function MonthSummaryBar({
  settled,
  scheduled,
  xpEarned,
  avgGoal,
  previous,
  previousName,
  streak,
  bestStreak,
  onViewAnalytics,
}: MonthSummaryBarProps) {
  const percent = scheduled > 0 ? Math.round((settled / scheduled) * 100) : 0;

  // The strip is four numbers about one month; replacing all four between
  // frames when the reader steps to another month leaves nothing to say which
  // of them moved. Travelling to the new figures is what makes the change
  // legible. Nothing moves under prefers-reduced-motion — see useCountUp.
  const shownPercent = Math.round(useCountUp(percent));
  const shownXp = Math.round(useCountUp(xpEarned));
  const shownDays = Math.round(useCountUp(settled));
  const shownGoal = Math.round(useCountUp(avgGoal));

  const filled = (Math.max(0, Math.min(100, shownPercent)) / 100) * RING_C;

  return (
    <section className="mv-summary" aria-label="Month completion progress">
      <div className="mv-summary-ring">
        <svg viewBox="0 0 64 64" role="img" aria-label={`${percent}% of scheduled days cleared`}>
          <circle className="mv-ring-track" cx="32" cy="32" r={RING_R} />
          <circle
            className="mv-ring-fill"
            cx="32"
            cy="32"
            r={RING_R}
            strokeDasharray={`${filled} ${RING_C - filled}`}
            transform="rotate(-90 32 32)"
          />
        </svg>
        <span className="mv-ring-pct">{shownPercent}%</span>
      </div>

      <div className="mv-summary-lead">
        <span className="mv-summary-title">Month Progress</span>
        <span className="mv-summary-sub">
          {settled} of {scheduled} days completed
        </span>
        {/* One line of verdict, and it is read off the same ratio the ring
            draws rather than being a mood. Silent on a month with nothing
            scheduled, which has no pace to be ahead or behind of. */}
        {scheduled > 0 && (
          <span className={`mv-summary-verdict${percent >= 60 ? ' is-good' : ''}`}>
            <span aria-hidden="true">{percent >= 60 ? '↑' : '·'}</span>{' '}
            {percent >= 80
              ? 'On track to beat your goal!'
              : percent >= 60
                ? 'Holding a good pace this month.'
                : percent > 0
                  ? "There's still month left to turn it around."
                  : 'Nothing cleared yet this month.'}
          </span>
        )}

        {/* Under the sentence it belongs to rather than out on the strip's far
            end. It was a two-line square button there, and with a fourth
            figure beside it the row ran out of width and dropped it onto a
            line of its own — a whole extra band of strip for one link. */}
        <button type="button" className="mv-analytics" onClick={onViewAnalytics}>
          View full analytics <span aria-hidden="true">→</span>
        </button>
      </div>

      <div className="mv-summary-figs">
        <Figure
          tone="xp"
          icon={
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M13 3 5.5 13.5H11l-1 7.5 8-11H12.5z" />
            </svg>
          }
          label="Total XP Earned"
          value={shownXp.toLocaleString()}
        >
          <Delta
            value={percentChange(xpEarned, previous.xpEarned)}
            suffix="%"
            against={previousName}
          />
        </Figure>
        <Figure
          tone="days"
          icon={
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3.5" y="5" width="17" height="15" rx="3" />
              <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
            </svg>
          }
          label="Days Completed"
          value={String(shownDays)}
        >
          {/* A count, so the delta is a count too — "8 more days", not "8%". */}
          <Delta value={settled - previous.settled} suffix="" against={previousName} />
        </Figure>
        <Figure
          tone="goal"
          icon={
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="12" cy="12" r="1" />
            </svg>
          }
          label="Avg. daily goal"
          value={`${shownGoal}%`}
        >
          <Delta value={avgGoal - previous.avgGoal} suffix="%" against={previousName} />
        </Figure>
        {/* The one figure here that is not about the month on screen, and it
            earns the place: a streak is the only thing in the app that can be
            lost by doing nothing, so it belongs beside the pace rather than
            three panels away. Its second line is its own record instead of a
            comparison, because "up 4 days on July" is not what anybody wants
            to know about a streak. */}
        <Figure
          tone="streak"
          icon={
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M13 3c.4 3-1.4 4.2-2.6 5.4C9 9.8 8 11 8 13a4 4 0 0 0 8 0c0-1.4-.6-2.4-1.2-3.2.2 1.4-.5 2.2-1.1 2.2-.8 0-1.2-.7-1.1-1.7.2-2.5-.2-5.5.4-7.3Z" />
            </svg>
          }
          label="Current Streak"
          value={`${streak} ${streak === 1 ? 'day' : 'days'}`}
        >
          <span className="mv-delta is-flat">Best: {bestStreak} days</span>
        </Figure>
      </div>

    </section>
  );
}

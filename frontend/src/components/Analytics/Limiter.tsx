/**
 * The limiter — a goal, the one thing most holding it up, and the way in.
 *
 * Two shapes of the same finding, because the five tabs that print it want it
 * at two different sizes.
 *
 * `LimiterCard` is the full reading: the goal named, the movement clause, the
 * subject carrying the shortfall, the share and the counts behind it, and the
 * two links. It belongs on the tabs a reader opens *to* ask why — Insights and
 * Recommendations.
 *
 * `LimiterLine` is one sentence and one link. It belongs where the finding is
 * context rather than the subject of the page: Overview, Habits and Subjects
 * each have their own job, and a titled card about goals on any of them would
 * quietly turn that tab into a fourth copy of the goals page.
 *
 * Neither computes anything. Every figure arrives from utils/goalLimiter, which
 * is where the arithmetic and the floors under it live.
 */
import { Link } from 'react-router-dom';
import type { GoalLimiter } from '@/utils/goalLimiter';

/** What the share was counted out of, in the words a sentence can carry. */
function basisPhrase(row: GoalLimiter): string {
  return row.basis === 'rated'
    ? 'the work on this goal that went badly'
    : 'what is still open on this goal';
}

export function LimiterCard({ row }: { row: GoalLimiter }) {
  return (
    <article className={`ax-limiter is-${row.direction}`}>
      <p className="ax-limiter-goal">
        <span>Goal</span>
        <Link to="/analytics/goals" className="ax-link">
          {row.goalTitle}
        </Link>
      </p>

      {/* The sentence the panel exists for. The movement clause first, because
          a reader told only what is wrong with a goal that is in fact improving
          will read the whole card as bad news and act on it as such. */}
      <p className="ax-limiter-read">
        {row.movement}, but <strong>{row.subjectName}</strong> is currently the biggest limiter.
      </p>

      <p className="ax-limiter-share">
        <span aria-hidden="true">→</span> This accounts for about{' '}
        <strong>{row.share}%</strong> of {basisPhrase(row)}.
      </p>

      {/* The working, under the claim rather than instead of it. */}
      <p className="ax-limiter-because">{row.because}</p>

      <p className="ax-limiter-links">
        <Link to={row.treeHref} className="ax-btn">
          Open the {row.subjectName} skill tree
        </Link>
        <Link to={row.subjectHref} className="ax-link">
          See the work in {row.subjectName}
        </Link>
      </p>
    </article>
  );
}

export function LimiterLine({ row }: { row: GoalLimiter }) {
  return (
    <p className="ax-goal-line">
      <strong>{row.goalTitle}</strong> — {row.movement.toLowerCase()}, but{' '}
      <strong>{row.subjectName}</strong> is the biggest limiter, at about {row.share}% of{' '}
      {basisPhrase(row)}.{' '}
      <Link to={row.treeHref} className="ax-link">
        Open the {row.subjectName} skill tree
      </Link>
    </p>
  );
}

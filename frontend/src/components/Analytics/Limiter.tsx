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

/**
 * Is this subject the whole of the shortfall rather than the largest part?
 *
 * 95 rather than 100, because the share is rounded for display and a goal
 * whose work is 49 tasks in one subject and one in another arrives here as
 * 98%. "The biggest limiter, at 98%" is a comparison with a rounding error in
 * it; "all of it" is what the reader is looking at.
 */
function only(row: GoalLimiter): boolean {
  return row.share >= 95;
}

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
          will read the whole card as bad news and act on it as such.

          "The biggest limiter" is a comparison, and a comparison needs
          something to compare against. At 100% there is nothing else in the
          field — one subject holds the entire shortfall — and calling it the
          biggest is the card being careful about a question nobody asked. It
          says where the work is instead. */}
      <p className="ax-limiter-read">
        {only(row) ? (
          <>
            {row.movement}, and all of it is <strong>{row.subjectName}</strong>.
          </>
        ) : (
          <>
            {row.movement}, but <strong>{row.subjectName}</strong> is currently the biggest limiter.
          </>
        )}
      </p>

      {/* The share, and only when it is a share of something.
          "This accounts for about 100% of the work on this goal that went
          badly" directly above "26 of the 26 tasks you rated as going badly on
          this goal are filed under Computer Science" is one fact, written
          twice, the second time better. The count stays; the percentage goes,
          and takes an arrow and a line of card height with it. */}
      {!only(row) && (
        <p className="ax-limiter-share">
          <span aria-hidden="true">→</span> This accounts for about{' '}
          <strong>{row.share}%</strong> of {basisPhrase(row)}.
        </p>
      )}

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

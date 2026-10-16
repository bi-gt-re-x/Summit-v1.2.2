/**
 * The limiter — a goal, the one thing most holding it up, and the way in.
 *
 * `LimiterLine` is one sentence and one link, for the Subjects tab, where the
 * finding is context on a subject rather than the subject of the page. The
 * full card that sat on Recommendations went with that tab's goal rows
 * (2026-10-11).
 *
 * It computes nothing. Every figure arrives from utils/goalLimiter, which
 * is where the arithmetic and the floors under it live.
 */
import { Link } from 'react-router-dom';
import type { GoalLimiter } from '@/utils/goalLimiter';

/** What the share was counted out of, in the words a sentence can carry. */
function basisPhrase(row: GoalLimiter): string {
  return row.basis === 'rated'
    ? 'the work on this goal that went badly'
    : "what's still open on this goal";
}

export function LimiterLine({ row }: { row: GoalLimiter }) {
  return (
    <p className="ax-goal-line">
      <strong>{row.goalTitle}</strong>: {row.movement.toLowerCase()}. <strong>{row.subjectName}</strong>{' '}
      is holding it back the most. It's about {row.share}% of {basisPhrase(row)}.{' '}
      <Link to={row.treeHref} className="ax-link">
        Open the {row.subjectName} skill tree
      </Link>
    </p>
  );
}

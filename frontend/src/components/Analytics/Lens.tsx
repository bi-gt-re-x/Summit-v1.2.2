/**
 * The lens, said out loud.
 *
 * A page that quietly reorders itself is worse than one that does not. The
 * reader opens Analytics twice, sees two different orders, and has no way to
 * learn why — so the reordering has to announce itself, name the goal that
 * caused it, and give the figure it was chosen on.
 *
 * That is this component's whole job. It changes nothing; `useAnalyticsModel`
 * has already applied the lens by the time this renders. It is the label on a
 * decision the page made, which is the difference between a page that is tuned
 * to somebody and a page that is unpredictable.
 *
 * Two sizes, same rule as ./Limiter: the tab a reader opens to ask what to do
 * gets the full card with what to watch listed out, and the tabs with their own
 * job get one sentence.
 */
import { Link } from 'react-router-dom';
import type { GoalLens } from '@/utils/goalLens';

export function LensCard({ lens }: { lens: GoalLens }) {
  return (
    <article className={`ax-lens is-${lens.id}`}>
      <p className="ax-lens-head">
        <span>Focused on</span>
        <strong className="ax-lens-badge">{lens.label}</strong>
      </p>

      <p className="ax-lens-read">
        Because you're working toward{' '}
        <Link to="/goals" className="ax-link">
          {lens.goalTitle}
        </Link>
        , this page starts with what matters most for it.
      </p>

      {/* The working. Without it "Accuracy and control" is a mood. */}
      <p className="ax-lens-because">{lens.because}</p>

      <ul className="ax-lens-watch">
        {lens.watch.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      {/* What it does *not* do, stated once and on the card rather than in a
          tooltip. A reader who suspects the page is hiding something from them
          stops trusting the parts that are not hidden either. */}
      <p className="ax-lens-foot">
        This only changes the order of the panels. Your numbers stay the same.
      </p>
    </article>
  );
}

export function LensLine({ lens }: { lens: GoalLens }) {
  return (
    <p className="ax-goal-line">
      Sorted for <strong>{lens.goalTitle}</strong>. It starts with{' '}
      <strong>{lens.label.toLowerCase()}</strong> because that matters most for this goal.{' '}
      <Link to="/recommendations" className="ax-link">
        What that changes
      </Link>
    </p>
  );
}

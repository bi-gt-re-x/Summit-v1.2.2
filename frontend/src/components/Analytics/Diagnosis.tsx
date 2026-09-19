/**
 * The growth diagnosis — what the numbers mean, rather than what they are.
 *
 * A score panel says "Productivity: 87" and leaves the reader to work out
 * whether that is good, what moved it, and what to do. These cards say the
 * other thing, in three parts that are always in the same order:
 *
 *     the tension   Your output is holding, but each task is costing more.
 *     the figures   92% of dated work finished; 18% longer per task.
 *     the action    Put a timer on the next three sittings and stop when it goes.
 *
 * The figures are in the middle rather than at the top because they are the
 * *evidence*, not the headline. A reader who accepts the first sentence can
 * skip to the third; a reader who does not can check the claim in the second.
 * That ordering is the whole design — it is what makes the panel arguable
 * rather than authoritative, and analytics drawn from somebody's own life had
 * better be arguable.
 *
 * ## Why some of these are good news
 *
 * Three of the rules behind this fire on things going right. A page that only
 * ever reports problems is one the reader learns to dread, and "you moved up a
 * level of difficulty without losing quality" is the single most useful thing
 * the app can tell somebody — it is the difference between practising and
 * improving, and no chart on this page shows it.
 *
 * ## Why there is a "watch this" line
 *
 * An action with no measure attached is a suggestion. With one, it is an
 * experiment the reader can settle in a fortnight against a figure this page
 * already draws. That line is what makes the next visit worth making.
 */
import { Panel } from './charts';
import type { Diagnosis, DiagnosisTone } from '@/utils/diagnosis';

const TONE_LABEL: Record<DiagnosisTone, string> = {
  good: 'Going well',
  tension: 'Mixed signals',
  warning: 'Needs attention',
};

const TONE_CLASS: Record<DiagnosisTone, string> = {
  good: 'is-good',
  tension: 'is-tension',
  warning: 'is-warning',
};

export function DiagnosisCards({ items }: { items: Diagnosis[] }) {
  if (items.length === 0) return null;

  return (
    <div className="ax-diag-grid">
      {items.map((item) => (
        <article key={item.id} className={`ax-panel ax-diag ${TONE_CLASS[item.tone]}`}>
          <span className="ax-diag-tone">{TONE_LABEL[item.tone]}</span>
          <h3 className="ax-diag-head">{item.headline}</h3>
          <p className="ax-diag-detail">{item.detail}</p>
          <div className="ax-diag-action">
            <span className="ax-diag-arrow" aria-hidden="true">
              →
            </span>
            <p>{item.action}</p>
          </div>
          <p className="ax-diag-watch">
            <strong>Watch:</strong> {item.watch}
          </p>
        </article>
      ))}
    </div>
  );
}

/**
 * The empty state, which is a real finding rather than a placeholder.
 *
 * An account whose fortnight looks like the fortnight before it genuinely has
 * no tension to report, and saying so is more useful than relaxing a threshold
 * until something fires.
 */
export function DiagnosisEmpty({
  enoughRecord,
  reported,
}: {
  enoughRecord: boolean;
  /**
   * The obstacle the reader named most often after finishing a task, and how
   * many times, when they answer that question at all.
   *
   * The counts found nothing to report; what the reader typed is a separate
   * record and is not nothing. An account that logged "distracted" after nine
   * tasks has told this page something specific about a fortnight the
   * arithmetic just called unremarkable — and this panel was throwing it away
   * to print a sentence about rounding errors. Null when the account has that
   * question switched off, or has answered it about nothing.
   */
  reported?: { phrase: string; count: number } | null;
}) {
  return (
    <Panel title="Growth diagnosis" className="ax-diag-empty">
      <p className="ax-empty">
        {enoughRecord
          ? 'No big changes from the fortnight before. Your pace, ratings and spread are steady.'
          : 'This compares the last two fortnights, so it needs about a month of history. It will fill in as you go.'}
      </p>
      {/* Their own words, under the arithmetic's silence. Stated as a count
          rather than as a cause: this is what was reported, and how often —
          the page does not get to promote it to a diagnosis on its own. */}
      {reported && (
        <p className="ax-empty">
          You reported <strong>{reported.phrase}</strong> after{' '}
          {reported.count} {reported.count === 1 ? 'task' : 'tasks'} this fortnight.
        </p>
      )}
    </Panel>
  );
}

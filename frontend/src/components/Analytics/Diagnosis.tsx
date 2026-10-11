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
 * the app can tell somebody — it is the difference between practicing and
 * improving, and no chart on this page shows it.
 *
 * ## Why there is a "watch this" line
 *
 * An action with no measure attached is a suggestion. With one, it is an
 * experiment the reader can settle in two weeks against a figure this page
 * already draws. That line is what makes the next visit worth making.
 */
import type { ReactElement } from 'react';
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

/* One mark per tone, drawn in the tone's colour by `.ax-diag-icon`: a tick for
   going well, a bulb for mixed signals, a target for what needs attention. */
const ICON_PROPS = {
  width: 30,
  height: 30,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const TONE_ICON: Record<DiagnosisTone, ReactElement> = {
  good: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.6 2.5L16 9.5" />
    </svg>
  ),
  tension: (
    <svg {...ICON_PROPS}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />
    </svg>
  ),
  warning: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <path d="m16 8 4-4M17 4h3v3" />
    </svg>
  ),
};

export function DiagnosisCards({ items }: { items: Diagnosis[] }) {
  if (items.length === 0) return null;

  return (
    <div className="ax-diag-grid">
      {items.map((item) => (
        <article key={item.id} className={`ax-panel ax-diag ${TONE_CLASS[item.tone]}`}>
          <header className="ax-diag-top">
            <span className="ax-diag-icon" aria-hidden="true">
              {TONE_ICON[item.tone]}
            </span>
            <div>
              <span className="ax-diag-tone">{TONE_LABEL[item.tone]}</span>
              <h3 className="ax-diag-head">{item.headline}</h3>
              <p className="ax-diag-detail">{item.detail}</p>
            </div>
          </header>
          {/* The specifics: which subject, which day, which task. */}
          {item.points.length > 0 && (
            <ul className="ax-diag-points">
              {item.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          )}
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
 * An account whose two weeks looks like the two weeks before it genuinely has
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
   * tasks has told this page something specific about two weeks the
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
          ? 'No big changes from the two weeks before. Your pace, ratings and spread are steady.'
          : 'This compares the last four weeks, so it needs about a month of history. It will fill in as you go.'}
      </p>
      {/* Their own words, under the arithmetic's silence. Stated as a count
          rather than as a cause: this is what was reported, and how often —
          the page does not get to promote it to a diagnosis on its own. */}
      {reported && (
        <p className="ax-empty">
          You reported <strong>{reported.phrase}</strong> after{' '}
          {reported.count} {reported.count === 1 ? 'task' : 'tasks'} in the last two weeks.
        </p>
      )}
    </Panel>
  );
}

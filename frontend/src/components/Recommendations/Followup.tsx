/**
 * What happened after you changed something.
 *
 * The tab's other panels look forward — here is what to change, here is what it
 * would be worth. This one looks back, and it is the only thing on the page
 * that can be wrong in a way the reader will notice. That shapes every decision
 * in this file: the two figures are always shown, the windows behind them are
 * always dated, and no row ever claims the change is what moved the number.
 *
 * A row is one adopted recommendation in one of six states, and three of those
 * are refusals — too new, too little record, no number to measure. Those are
 * not failure states and they are not styled as errors: an honest "ask me in
 * nine days" is the correct output for a change made last week, and it is a
 * better answer than a verdict drawn from five days of data.
 *
 * The arithmetic is all in utils/followup. This draws it.
 */
import { Panel } from '@/components/Analytics';
import {
  shortDate,
  type Review,
  type ReviewSummary,
} from '@/utils/followup';

/** What each outcome is called in the chip, and which tone carries it. */
const OUTCOME: Record<Review['outcome'], { label: string; tone: string }> = {
  improved: { label: 'Moved', tone: 'good' },
  worsened: { label: 'Went the other way', tone: 'bad' },
  held: { label: 'Held', tone: 'flat' },
  early: { label: 'Too new', tone: 'wait' },
  thin: { label: 'Cannot compare', tone: 'wait' },
  unmeasured: { label: 'No measure', tone: 'wait' },
};

/** Rounds a figure the way the panel prints it. */
function figure(value: number, unit: string): string {
  const shown = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${shown}${unit}`;
}

export interface FollowupPanelProps {
  reviews: Review[];
  summary: ReviewSummary;
  /** Forgets an adoption. The task it created is not touched. */
  onDrop: (id: string) => void;
  /** The id currently being forgotten, so only its own control waits. */
  dropping: string | null;
}

export function FollowupPanel({ reviews, summary, onDrop, dropping }: FollowupPanelProps) {
  if (reviews.length === 0) return null;

  return (
    <Panel
      title="What happened after"
      note={summary.headline}
    >
      <ul className="ax-followup">
        {reviews.map((row) => {
          const state = OUTCOME[row.outcome];
          const measured =
            row.outcome === 'improved' || row.outcome === 'worsened' || row.outcome === 'held';

          return (
            <li key={row.id} className={`ax-followup-row is-${state.tone}`}>
              <div className="ax-followup-head">
                <div className="ax-followup-name">
                  <strong>{row.title}</strong>
                  <span>Adopted {shortDate(row.on)}</span>
                </div>
                <span className={`ax-followup-chip is-${state.tone}`}>{state.label}</span>
              </div>

              {measured && row.unit !== undefined && (
                <>
                  {/* Both numbers, always. A panel that printed only the change
                      would be asking to be trusted about the starting point,
                      which is the one figure a sceptical reader most wants. */}
                  <div className="ax-followup-figures">
                    <span className="ax-followup-was">
                      <em>{row.label}</em>
                      {figure(row.before ?? 0, row.unit)}
                    </span>
                    <span className="ax-followup-arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="ax-followup-now">{figure(row.after ?? 0, row.unit)}</span>
                    {/* Suppressed when the measure is itself a percentage. "41%
                        of days, down 36%" is two percentages meaning different
                        things side by side, and the one a reader would take
                        from it is the wrong one — the move there is 23 points,
                        which the sentence below already says. */}
                    {row.unit !== '%' && row.pct !== null && row.pct !== undefined && (
                      <span className="ax-followup-pct">
                        {row.pct > 0 ? '+' : ''}
                        {Math.round(row.pct)}%
                      </span>
                    )}
                  </div>

                  {/* The dated windows. This is the line that makes the claim
                      checkable against the reader's own memory of the month,
                      which is the only external check this page can offer. */}
                  <p className="ax-followup-window">
                    {shortDate(row.beforeFrom ?? '')}–{shortDate(row.beforeTo ?? '')} against{' '}
                    {shortDate(row.afterFrom ?? '')}–{shortDate(row.afterTo ?? '')}
                  </p>
                </>
              )}

              <p className="ax-followup-note">{row.note}</p>

              <button
                type="button"
                className="ax-followup-drop"
                disabled={dropping === row.id}
                onClick={() => onDrop(row.id)}
              >
                {dropping === row.id ? 'Removing…' : 'Stop tracking this'}
              </button>
            </li>
          );
        })}
      </ul>

      {/* The caveat, once, at the bottom — not repeated on every row where it
          would become wallpaper. It is the most important sentence in the panel
          and it is the one a reader will stop seeing if it appears six times. */}
      <p className="ax-followup-caveat">
        A simple before-and-after. Other things may have changed too.
      </p>
    </Panel>
  );
}

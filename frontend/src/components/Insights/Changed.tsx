/**
 * What changed — three cards, three kinds, and the kind is visible.
 *
 * This is the section the Insights tab exists for, and it is drawn differently
 * from everything around it on purpose. The rest of the tab is panels: a title,
 * a chart, a note. These are claims about the reader's last month, and a claim
 * reads as a claim only when it is the biggest thing in its own box.
 *
 * So each card leads with what kind of finding it is — getting stronger, an
 * emerging problem, a hidden pattern — because that is the part a reader scans
 * for, and a column of four identically-styled cards is a column nobody scans.
 * The movement, where there is one, sits to the right in the same place on every
 * card; the evidence sits under the sentence in the smallest type on the tab.
 *
 * ## Why the strength chip is not on every card
 *
 * Three of the four sources grade themselves and one does not: a diagnosis is a
 * tension between two readings of the same record and has no sample to be
 * confident about. Printing "possible, not established" on it would invent a
 * grade, and printing nothing where the others carry one is the honest
 * difference. See utils/changed for which rule produces which.
 */
import { Panel, PanelNote } from '@/components/Analytics/charts';
import { STRENGTH_TEXT } from '@/utils/insight';
import { CHANGE_TITLE, type Change, type ChangeKind } from '@/utils/changed';

/** The mark each kind wears, and the tone it is drawn in. */
const KIND: Record<ChangeKind, { mark: string; tone: string }> = {
  gain: { mark: '↑', tone: 'green' },
  problem: { mark: '!', tone: 'pink' },
  pattern: { mark: '◆', tone: 'blue' },
};

export interface ChangedPanelProps {
  changes: Change[];
  /** How many days back the comparison reaches, for the note. */
  window: number;
}

export function ChangedPanel({ changes, window: days }: ChangedPanelProps) {
  return (
    <Panel
      title="What changed"
      note={
        changes.length > 0
          ? `Against the ${days} days before this one.`
          : undefined
      }
      className="ax-changed"
      footer={
        <PanelNote label="Where these come from">
          <ul className="ax-tips">
            <li><b>Gains:</b> Your last {days} days vs. the {days} before.</li>
            <li><b>Problems:</b> Two numbers from the same days that don't line up.</li>
            <li><b>Patterns:</b> Your tasks split into two groups and compared.</li>
            <li><b>Mixed on purpose:</b> Good news can't crowd out the one thing to fix.</li>
            <li><b>What to do:</b> That's on the Recommendations tab.</li>
          </ul>
        </PanelNote>
      }
    >
      {changes.length === 0 ? (
        <p className="ax-empty">
          Nothing has changed much yet. This fills in once you have enough days to compare.
        </p>
      ) : (
        <ul className="ax-changes">
          {changes.map((change) => {
            const kind = KIND[change.kind];
            return (
              <li key={change.id} className={`ax-change ax-tone-${kind.tone}`}>
                <div className="ax-change-head">
                  <span className="ax-change-mark" aria-hidden="true">
                    {kind.mark}
                  </span>
                  <span className="ax-change-kind">{CHANGE_TITLE[change.kind]}</span>
                  {change.move && <span className="ax-change-move">{change.move}</span>}
                </div>
                <p className="ax-change-text">{change.text}</p>
                {(change.basis || change.strength) && (
                  <p className="ax-change-basis">
                    {change.basis}
                    {change.strength && (
                      <span className="ax-change-strength">{STRENGTH_TEXT[change.strength]}</span>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

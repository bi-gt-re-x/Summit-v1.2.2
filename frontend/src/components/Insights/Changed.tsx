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
          <p>
            Each card is a measured difference, never a summary of the graphs below it. A gain
            compares the last {days} days with the {days} before them; a problem is a tension
            between two readings of the same stretch; a pattern splits your own finished tasks in
            two and compares them.
          </p>
          <p>
            Cards are drawn one kind at a time rather than strongest first, so a good month cannot
            fill the section with good news and hide the one finding worth acting on.
          </p>
          <p>
            Nothing here tells you what to do about it. That is the Recommendations tab.
          </p>
        </PanelNote>
      }
    >
      {changes.length === 0 ? (
        <p className="ax-empty">
          Nothing has moved far enough to call a change yet. This fills in as the record gets
          long enough to compare two stretches of it.
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

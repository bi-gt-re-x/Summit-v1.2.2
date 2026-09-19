/**
 * Discovered patterns — the conditions your better work happens under.
 *
 * "Your execution is 14% higher on tasks you finish before 5pm" is a different
 * kind of statement from anything else on this page. Every other panel reports
 * a measure over time; this one reports a *difference between two groups of
 * your own tasks*, which is the only shape of finding that can answer "why am
 * I improving?" rather than "am I?".
 *
 * ## The strength chip is the most important thing here
 *
 * A pattern-finder run over enough splits will always find something, and a
 * page that prints a finding drawn from eight tasks in the same voice as one
 * drawn from sixty is lying by typography. So every card carries how much
 * weight it can take, and the basis line underneath prints the actual counts on
 * both sides of the split.
 *
 * A reader should be able to dismiss a weak finding in one glance. That is not
 * a weakness of the panel — it is the panel working.
 *
 * ## Association, never cause
 *
 * The sentences are written to stop at the association. "Higher before 5pm"
 * does not mean finishing earlier makes you better; you may simply schedule
 * your easy revision for the evening. Where a finding suggests something worth
 * trying it goes in the "worth trying" line, phrased as a test rather than a
 * conclusion.
 */
import { Panel, PanelNote } from './charts';
import { STRENGTH_TEXT, type Strength } from '@/utils/insight';
import type { Pattern, PatternKind } from '@/utils/patterns';

const KIND_LABEL: Record<PatternKind, string> = {
  timing: 'When',
  subject: 'Subject',
  streak: 'Over time',
  context: 'Conditions',
  quality: 'Quality',
};

const STRENGTH_CLASS: Record<Strength, string> = {
  strong: 'is-strong',
  likely: 'is-likely',
  weak: 'is-weak',
};

export interface PatternsProps {
  items: Pattern[];
  /** How many days the search ran over, for the note. */
  window: number;
}

export function Patterns({ items, window: days }: PatternsProps) {
  return (
    <Panel
      title="Patterns"
      note={
        items.length > 0
          ? `Differences in your tasks over the last ${days} days.`
          : undefined
      }
      className="ax-pat"
      footer={
        <PanelNote label="How patterns are found">
          <p>
            Each pattern compares two groups of your finished tasks, like before and after 5pm, or
            weekdays and weekends. It only shows when both groups have at least 6 tasks and differ
            by 10% or more.
          </p>
          <p>
            That bar is high on purpose, to avoid showing patterns that are just chance.
          </p>
          <p>
            A pattern is not proof of a cause. Treat "worth trying" as an experiment.
          </p>
        </PanelNote>
      }
    >
      {items.length === 0 ? (
        <p className="ax-empty">
          No patterns yet. Keep logging tasks and they will show up here.
        </p>
      ) : (
        <ul className="ax-pat-list">
          {items.map((item) => (
            <li key={item.id} className={`ax-pat-row ${STRENGTH_CLASS[item.strength]}`}>
              <div className="ax-pat-top">
                <span className="ax-pat-kind">{KIND_LABEL[item.kind]}</span>
                <span className="ax-pat-strength" title={STRENGTH_TEXT[item.strength]}>
                  {item.strength}
                </span>
                <span className="ax-pat-lift">
                  {item.lift >= 0 ? '+' : '−'}
                  {Math.round(Math.abs(item.lift))}%
                </span>
              </div>
              <p className="ax-pat-text">{item.text}</p>
              <p className="ax-pat-basis">{item.basis}</p>
              {item.soWhat && (
                <p className="ax-pat-so">
                  <strong>Worth trying:</strong> {item.soWhat}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

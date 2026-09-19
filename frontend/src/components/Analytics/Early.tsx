/**
 * The panels that can be honest on an account's fifth day, and the mark that
 * says how far to trust them.
 *
 * ## Why a mark at all
 *
 * The rest of the page states things. These state things too, off three to six
 * days of record, and the difference between "you work in the evening" said
 * from five days and said from five months is the entire question a reader
 * should be asking. A chip is the cheapest way to keep that difference in
 * front of them without hedging every sentence into uselessness.
 *
 * It reads "Early" rather than "Unreliable" or "Preview" on purpose. The
 * figures are exact — they are counts of things that happened — and the
 * qualification is about *how much* was counted, not about whether the count
 * is right. "Preview" would suggest sample data, which is the one thing this
 * page has never shown.
 *
 * ## What is not here
 *
 * Nothing that infers. No correlations, no causes, no "because", no
 * projections, no bests or worsts. Both panels below are a tally with its own
 * denominator printed beside it, and the sentence under each says what it
 * would take to turn the tally into a finding. That line is the Habits and
 * Insights tabs' job, and they have gates of their own for it.
 */
import { Columns, Panel } from './charts';
import type { DayPart } from '@/utils/habits';
import type { Task } from '@/types';

/** The qualification, worn by every panel on this file. */
export function EarlyMark({ of }: { of: string }) {
  return (
    <span className="ax-early" title={`Read from ${of}. It will sharpen as you record more.`}>
      Early · {of}
    </span>
  );
}

export interface WhenPanelProps {
  parts: DayPart[];
  /** Days of record behind it, for the mark. */
  days: number;
}

/**
 * When the work happened, as four counts.
 *
 * Not "your peak hour" and not a best. The tallest bar is visible without
 * being named, which is the right amount of claim for five days: a reader can
 * see that most of their work lands in the evening and is not being told that
 * evenings are when they work, which may well be untrue of their next fortnight.
 */
export function WhenPanel({ parts, days }: WhenPanelProps) {
  const total = parts.reduce((sum, part) => sum + part.count, 0);

  return (
    <Panel title="When you worked" aside={<EarlyMark of={`${days} days`} />}>
      {total === 0 ? (
        <p className="ax-empty ax-empty-sm">
          No finished task carries a time of day yet. Tasks completed inside Summit record one;
          older ones do not.
        </p>
      ) : (
        <>
          <Columns
            columns={parts.map((part) => ({
              // "the morning" reads as a sentence fragment under a bar.
              label: part.label.replace(/^the /, ''),
              value: part.count,
              text: part.count === 0 ? '—' : String(part.count),
            }))}
            tone="blue"
            label="Finished tasks by part of the day"
          />
          <p className="ax-muted ax-early-foot">
            {total} finished {total === 1 ? 'task' : 'tasks'} with a time on {total === 1 ? 'it' : 'them'}.
            A few more weeks and Habits can say whether this is a pattern or just this week.
          </p>
        </>
      )}
    </Panel>
  );
}

export interface FinishPanelProps {
  tasks: Task[];
  days: number;
}

/** What a priority's tasks did, as a count. Ordered hardest first. */
const PRIORITIES: Array<{ key: Task['priority']; label: string }> = [
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
];

/**
 * How much of what you set, you finish — split by the priority you gave it.
 *
 * The one completion reading available immediately, because it needs no
 * history at all: every task on the books is either done or it is not. Split
 * by priority because that is the split a reader can act on — finishing the
 * low ones and leaving the high ones is a specific, fixable thing, and a
 * single blended rate hides it.
 *
 * A priority nobody has used is dropped rather than drawn at 0%, which would
 * read as a failure to do work that was never set.
 */
export function FinishPanel({ tasks, days }: FinishPanelProps) {
  const rows = PRIORITIES.map(({ key, label }) => {
    const mine = tasks.filter((task) => task.priority === key);
    const done = mine.filter((task) => task.status === 'done').length;
    return { key, label, done, total: mine.length };
  }).filter((row) => row.total > 0);

  if (rows.length === 0) {
    return (
      <Panel title="What you finish" aside={<EarlyMark of={`${days} days`} />}>
        <p className="ax-empty ax-empty-sm">Nothing on the books yet.</p>
      </Panel>
    );
  }

  return (
    <Panel title="What you finish" aside={<EarlyMark of={`${days} days`} />}>
      <ul className="ax-finish">
        {rows.map((row) => {
          const share = Math.round((row.done / row.total) * 100);
          return (
            <li key={row.key}>
              <span className="ax-finish-name">{row.label} priority</span>
              <span className="ax-finish-bar" role="img" aria-label={`${share}% finished`}>
                <i className={`is-${row.key}`} style={{ width: `${share}%` }} />
              </span>
              <span className="ax-finish-count">
                <strong>{row.done}</strong> / {row.total}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="ax-muted ax-early-foot">
        All your tasks, not just this period. With only a few tasks, one task moves this a lot.
      </p>
    </Panel>
  );
}

/**
 * The section that makes the page a model of somebody rather than a set of charts.
 *
 * Everything else here reads a *period*. This reads the reader — see the note
 * at the top of utils/knows for why that distinction is the whole point, and
 * for the floor under each fact.
 *
 * Deliberately plain. No tiles, no sparklines, no deltas: these are sentences,
 * and dressing a sentence as a metric is how it stops being read as one. The
 * heading above each is a label rather than a measure name, so the block scans
 * as a short profile instead of a fifth row of statistics.
 */
import type { Knowledge } from '@/utils/knows';

export function Knows({ facts }: { facts: Knowledge[] }) {
  if (facts.length === 0) return null;

  return (
    <section className="ax-knows" aria-label="What Summit knows about you">
      <p className="ax-knows-head">What Summit knows</p>
      <dl>
        {facts.map((fact) => (
          <div key={fact.key}>
            <dt>{fact.heading}</dt>
            <dd>{fact.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

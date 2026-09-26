/**
 * The section that makes the page a model of somebody rather than a set of charts.
 *
 * Everything else here reads a *period*. This reads the reader — see the note
 * at the top of utils/knows for why that distinction is the whole point, for
 * the floor under each fact, and for why each one now ends in something to do.
 *
 * Deliberately plain. No tiles, no sparklines, no deltas: these are sentences,
 * and dressing a sentence as a metric is how it stops being read as one. The
 * heading above each is a label rather than a measure name, so the block scans
 * as a short profile instead of a fifth row of statistics.
 *
 * ## The fact is set under the advice, not over it
 *
 * The figure used to be the whole entry, in body ink, and it read as four more
 * numbers on a page that already had ninety. It is still here — advice with no
 * evidence under it is a horoscope — but it is set small and muted beneath the
 * instruction it produced, so the eye takes the instruction first and the
 * number only when it wants to check the working. Same two sentences either
 * way round; the order is what decides whether the block coaches or recites.
 */
import type { Knowledge } from '@/utils/knows';

export function Knows({ facts }: { facts: Knowledge[] }) {
  if (facts.length === 0) return null;

  return (
    <section className="ax-knows" aria-label="What Summit makes of your record">
      <p className="ax-knows-head">Your coach's read</p>
      <dl>
        {facts.map((fact) => (
          <div key={fact.key}>
            <dt>{fact.heading}</dt>
            <dd>
              <span className="ax-knows-do">{fact.advice}</span>
              <span className="ax-knows-fact">{fact.text}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

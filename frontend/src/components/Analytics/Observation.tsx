/**
 * The first thing the page says about somebody, rather than about their totals.
 *
 * ## Why this is allowed to exist on a page of counts
 *
 * Everything else at the early stages is a tally. That is the right default —
 * see the note at the top of Collecting — but a product that only ever tallies
 * is one a reader never catches being clever, and "no unsupported claims" is
 * not an experience. This is the one panel permitted to state a tendency, and
 * every constraint on it is in utils/observations rather than here: a floor of
 * observations, an effect big enough not to be the rating scale talking, and a
 * confidence tier that has to be earned on both counts.
 *
 * ## The label is the hedge
 *
 * "Early observation" and "Established pattern" are different claims even when
 * the sentence under them is identical, so the tier does the qualifying and
 * the finding itself stays a plain sentence. The alternative — hedging inside
 * the sentence — produces "there is weak evidence that you may tend to", which
 * is the register that makes a reader stop reading.
 *
 * The sample is printed under it, always, and it is not decoration. A reader
 * who can see "from 9 rated tasks" can decide for themselves what the sentence
 * is worth, and that is the difference between a finding and a horoscope.
 */
import type { Observation } from '@/utils/observations';
import { CONFIDENCE_LABEL, CONFIDENCE_WORD } from '@/utils/observations';

export function ObservationNote({ observation }: { observation: Observation }) {
  return (
    <section className={`ax-observe is-${observation.confidence}`}>
      <p className="ax-observe-tier">
        <span>{CONFIDENCE_LABEL[observation.confidence]}</span>
        {/* The grade as well as the name of the tier. Belt and braces, and
            worth it: this component now appears on tabs that have not opened,
            where the copy around it is explaining that there is not enough
            record for an answer — and a reader could take "Early observation"
            there for the tab having quietly opened. "Confidence: Low" cannot
            be read that way. */}
        <span className="ax-observe-conf">
          Confidence: <em>{CONFIDENCE_WORD[observation.confidence]}</em>
        </span>
      </p>
      <p className="ax-observe-text">{observation.text}</p>
      <p className="ax-observe-support">{observation.support}</p>
    </section>
  );
}

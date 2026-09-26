/**
 * KEY INSIGHTS — everything the reading found, as one list of rows.
 *
 * ## It was three lists
 *
 * Findings with a confidence badge, then a numbered "In this order" block,
 * then insights in a `FROM:` / `SO:` layout. Three shapes, three type scales
 * and three ways of attaching evidence, stacked, all saying things about the
 * same handful of figures. The badges made it worse rather than better: a row
 * reading "a guess" in amber is the page shouting a caveat at a reader who
 * has not yet been told the claim.
 *
 * One list now. Icon, claim, one line of detail, and a word for which way it
 * cuts. A reader scans the words on the right, stops at the ones that say
 * "needs focus", and reads those. That is what a list of findings is for.
 *
 * ## The priorities are gone, not moved
 *
 * "In this order" was a third ranked list on a page that already has two —
 * the app's own ranked advice and the model's next steps, both directly
 * above this under "Do this next", both of which can be turned into tasks.
 * A ranking nobody can act on, under two that can, is the section a reader
 * learns to skip. The model still produces them; they order the steps.
 *
 * ## Confidence did not survive either, and that is deliberate
 *
 * It is still on the wire and still honest — but as a chip beside every row
 * it was noise on four rows out of five, and on the fifth it said "a guess"
 * about a claim the reader had no reason to doubt. What a low-confidence
 * finding needs is not a badge; it is not to be written. The prompt says so,
 * and `_clean` drops any row citing a figure nobody counted.
 */
import { Icon, type IconName } from '@/components/Icon';
import type { Diagnosis, EvidenceDirection, Insight } from '@/services/analytics';

/** What each direction is called on the row, and the tone it is drawn in. */
const WAY: Record<EvidenceDirection, { word: string; icon: IconName }> = {
  hurts: { word: 'needs focus', icon: 'target' },
  helps: { word: 'working', icon: 'trend' },
  watch: { word: 'worth watching', icon: 'lightbulb' },
};

/** One row of the list, whichever of the two shapes it came from. */
interface Finding {
  id: string;
  claim: string;
  /** One line under the claim. The evidence, or what to do about it. */
  detail: string;
  direction: EvidenceDirection;
}

/**
 * The findings and the insights, in that order, as one list.
 *
 * Merged here rather than server-side because they are two different
 * questions to a model — what is true, and what it means you should do — and
 * one thing to a reader. The prompt is told they draw as one list, so it
 * writes them as one and stops saying the same thing in both.
 */
export function findingRows(diagnosis: Diagnosis[], insights: Insight[]): Finding[] {
  return [
    ...diagnosis.map((entry, at) => ({
      id: `d${at}`,
      claim: entry.finding,
      /* The counted lines, joined. A diagnosis carries up to four and they
         are short — "Easy: execution 47 over 141 tasks" — so a bullet list
         under every row was three lines of chrome for one line of content. */
      detail: entry.evidence.join(' · '),
      direction: entry.direction,
    })),
    ...insights.map((entry, at) => ({
      id: `i${at}`,
      claim: entry.observation,
      /* The implication, not the evidence. An insight's whole reason for
         existing is that it says what to do differently, and if only one
         line fits it is that one. */
      detail: entry.implication || entry.evidence,
      direction: entry.direction,
    })),
  ].filter((row) => row.claim);
}

export function Reading({
  diagnosis,
  insights,
}: {
  diagnosis: Diagnosis[];
  insights: Insight[];
}) {
  const rows = findingRows(diagnosis, insights);
  if (!rows.length) return null;

  return (
    <ul className="sb-keys">
      {rows.map((row) => {
        const way = WAY[row.direction] ?? WAY.watch;
        return (
          <li key={row.id} className={`sb-key is-${row.direction}`}>
            <span className="sb-key-mark" aria-hidden="true">
              <Icon name={way.icon} size={18} />
            </span>
            <div className="sb-key-say">
              <strong>{row.claim}</strong>
              {row.detail && <p>{row.detail}</p>}
            </div>
            <span className="sb-key-tag">{way.word}</span>
          </li>
        );
      })}
    </ul>
  );
}

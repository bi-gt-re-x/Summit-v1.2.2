/**
 * DID THE ADVICE WORK — the question the whole loop exists to answer.
 *
 * ## Why this is arithmetic and not a reading
 *
 * Every other judgement on this page is a reading of figures. This one is the
 * figures themselves: execution in this subject on the day a recommendation
 * was given, against execution now, for the recommendations that were
 * actually acted on. There is nothing to interpret and therefore nothing to
 * ask a model for — and a great deal to get wrong by asking, because "did my
 * advice work" is the one question the thing that gave the advice should not
 * be the one answering.
 *
 * ## The distinction the whole design rests on
 *
 * **Untaken is not failed.** A recommendation nobody acted on says nothing
 * about whether it would have worked, and treating it as a nil result is how
 * a system concludes that everything it suggests is useless. It is still a
 * finding — a plan nobody follows is the wrong plan, and the fix for that is
 * usually a smaller plan rather than a different one — but it is a finding
 * about the recommendation, not about the intervention.
 *
 * So `untaken` is its own verdict and is counted separately everywhere.
 *
 * ## What a verdict is allowed to claim
 *
 * Very little. Two figures a fortnight apart, on one account, with no control
 * and no isolation: anything in between them could have moved execution. So
 * the words are `moved`, `flat` and `slipped` rather than `worked` and
 * `failed`, and the page says "coincided with" rather than "caused". That is
 * not hedging for its own sake — the reader is running one experiment at a
 * time on themselves, and the honest version of this is still enough to
 * decide what to do next, which is all it is for.
 *
 * `DECISIVE` is the movement that counts as movement. Execution is recorded
 * as one to five stars, so a star is twenty-five points on the 0-100 scale;
 * three points is well inside the noise of a handful of tasks, and anything
 * under it reads as flat.
 */
import type { PastRecommendation } from '@/services/analytics';

/** Points of execution that count as a direction rather than as noise. */
export const DECISIVE = 3;

export type VerdictWord = 'moved' | 'flat' | 'slipped' | 'untaken' | 'unmeasured';

export interface Verdict {
  id: string;
  title: string;
  /** The day it was advised, ISO. */
  on: string;
  /** The day it was acted on. Empty while it has not been. */
  takenOn: string;
  word: VerdictWord;
  /** Execution then and now, when both are known. */
  was: number | null;
  now: number | null;
  change: number | null;
}

/** Which of the five words two figures either side of the advice support. */
function wordFor(row: PastRecommendation, now: number | null): VerdictWord {
  if (!row.taken) return 'untaken';
  if (row.was === null || now === null) return 'unmeasured';
  const change = now - row.was;
  if (change >= DECISIVE) return 'moved';
  if (change <= -DECISIVE) return 'slipped';
  return 'flat';
}

/**
 * Every recommendation on record for this subject, settled where it can be.
 *
 * `now` is the account's execution figure in this subject as the page has it
 * — passed in rather than fetched, because the page already computed it and a
 * second derivation would be a second answer.
 *
 * Newest first, which is the order the server returns them in and the order a
 * reader wants: the last thing they were told is the thing they remember.
 */
export function verdictsFrom(
  rows: PastRecommendation[],
  now: number | null,
): Verdict[] {
  return rows.map((row) => {
    const word = wordFor(row, now);
    return {
      id: row.id,
      title: row.title,
      on: row.on,
      takenOn: row.taken_on,
      word,
      was: row.was,
      now: word === 'moved' || word === 'flat' || word === 'slipped' ? now : null,
      change: word === 'moved' || word === 'flat' || word === 'slipped'
        ? (now ?? 0) - (row.was ?? 0)
        : null,
    };
  });
}

export interface LoopSummary {
  /** Recommendations on record, and how many were acted on. */
  given: number;
  taken: number;
  /** Settled either way — the ones with a before and an after. */
  settled: number;
  moved: number;
  /**
   * What the record as a whole supports saying, or empty.
   *
   * Three states worth separating, because the wrong sentence for each is a
   * different kind of unhelpful: nothing tried yet (say so and stop), tried
   * and nothing settled (say what is missing), tried and settled (say what it
   * points at).
   */
  say: string;
}

/**
 * The one line the section leads with.
 *
 * It is deliberately not a score. "3 of 5 recommendations worked" invites a
 * percentage nobody should be computing off five paired observations on one
 * person — see the note at the top on what a verdict may claim. What it says
 * instead is what there is enough of to act on.
 */
export function summarise(verdicts: Verdict[]): LoopSummary {
  const taken = verdicts.filter((one) => one.word !== 'untaken');
  const settled = verdicts.filter(
    (one) => one.word === 'moved' || one.word === 'flat' || one.word === 'slipped',
  );
  const moved = settled.filter((one) => one.word === 'moved');

  let say = '';
  if (verdicts.length === 0) {
    say = '';
  } else if (taken.length === 0) {
    say = 'None of it has been acted on yet.';
  } else if (settled.length === 0) {
    say = 'Acted on, but nothing rated either side of it yet.';
  } else if (moved.length === 0) {
    say = 'Nothing here has been followed by a rise in execution. Try a '
      + 'different shape of session.';
  } else {
    /* Not "3 of 5 worked": that invites a percentage nobody should compute off
       five paired observations on one person. See what a verdict may claim,
       at the top of this file. */
    say = 'What was followed by movement is worth keeping in rotation — a '
      + 'pattern rather than a proof.';
  }

  return {
    given: verdicts.length,
    taken: taken.length,
    settled: settled.length,
    moved: moved.length,
    say,
  };
}

/**
 * The two sections the subject page now opens on.
 *
 * Named for what it is rather than for what it draws, because the arithmetic
 * behind it is `./objective` and a `Objective.tsx` beside an `objective.ts`
 * is two files on a case-insensitive filesystem and one on a case-sensitive
 * one. The pair is the same split the rest of this folder keeps: a lowercase
 * module that works things out, a capitalised one that lays them out.
 *
 * **The band** — what the reader is trying to accomplish, before anything
 * else and at the size of a heading. The goal as an aim rather than a label,
 * the kind of thing it is, and the one sentence saying what has to change
 * next.
 *
 * **What matters now** — the handful of facts that bear on *that goal*, each
 * as a claim with its counted figures under it. Three at most.
 *
 * ## Why a claim leads and the number follows
 *
 * "Execution: 76 (+4.2%)" is a figure the reader has to interpret. "Your
 * execution is improving, 24 to 30 across recent timed work" is the same
 * figure having been interpreted, and the interpretation is the part they
 * wanted. The number is not removed — it is in `evidence` under every card,
 * where it is arguable. It stops being the headline.
 *
 * ## The label that has to be there
 *
 * A card says whether it is the model's reading or the app's arithmetic, and
 * that is not a disclaimer. The counted cards are chosen by rule and cannot
 * know what kind of goal this is; the model's are chosen against the goal and
 * can be wrong in a way arithmetic cannot. A reader deciding how much to
 * trust a claim needs to know which kind it is, and no amount of care in the
 * wording substitutes for saying so.
 */
import type { EvidenceCard, Objective as ObjectiveRead } from './objective';
import { KIND_MEANS, KIND_WORDS } from './objective';

/** The arrow each direction draws. Never colour alone — see subject-state.css. */
const DIRECTION_MARK: Record<EvidenceCard['direction'], string> = {
  helps: '↑',
  hurts: '↓',
  watch: '→',
};

const DIRECTION_WORD: Record<EvidenceCard['direction'], string> = {
  helps: 'Working for you',
  hurts: 'In the way',
  watch: 'Worth watching',
};

export function ObjectiveBand({
  subject,
  objective,
}: {
  subject: string;
  objective: ObjectiveRead;
}) {
  const kindWord = KIND_WORDS[objective.kind];

  return (
    <section className="so-band" aria-label="What this subject is for">
      <p className="so-band-subject">{subject}</p>

      {objective.objective ? (
        <h2 className="so-band-goal">{objective.objective}</h2>
      ) : (
        /* No goal, no ambition, nothing to read. The band still draws, because
           the page's first question is "what is this for" and the honest
           answer to it here is that nobody has said — which is actionable, and
           a missing section is not. */
        <h2 className="so-band-goal is-empty">No goal set for this subject</h2>
      )}

      {kindWord && (
        <p className="so-band-kind">
          <span className="so-kind-chip" title={objective.whyKind || undefined}>
            {kindWord}
          </span>
          <span className="so-kind-means">{KIND_MEANS[objective.kind]}</span>
        </p>
      )}

      {objective.focus && (
        <p className="so-band-focus">
          <span className="so-band-focus-label">Current focus</span>
          {objective.focus}
        </p>
      )}

      {/* The reader's own words, kept when the model has rewritten them above.
          The rewrite is a reading of what they wrote, and a page that replaces
          somebody's sentence with its own paraphrase and shows only the
          paraphrase has quietly taken the goal off them. */}
      {objective.source === 'read' && objective.aim
        && objective.aim !== objective.objective && (
        <p className="so-band-yours">
          <span>You wrote</span> {objective.aim}
          {objective.level && <em> · at {objective.level} now</em>}
        </p>
      )}

      {objective.marks.length > 0 && (
        <ul className="so-band-marks">
          {objective.marks.map((mark) => (
            <li key={mark.label} className={`so-mark is-${mark.tone}`}>
              <span className="so-mark-label">{mark.label}</span>
              <strong>{mark.value}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function WhatMatters({ cards }: { cards: EvidenceCard[] }) {
  const first = cards[0];
  if (!first) return null;

  const read = first.source === 'read';

  return (
    <section className="so-matters" aria-label="What matters now">
      <div className="so-matters-head">
        <h2>What matters now</h2>
        <p className="so-matters-note">
          {read
            ? 'Read against your goal. Every figure under a claim was counted.'
            : 'Chosen by rule from your record. Read it back for the version '
              + 'that weighs these against your goal.'}
        </p>
      </div>

      <ul className="so-cards">
        {cards.map((card) => (
          <li key={card.id} className={`so-card is-${card.direction}`}>
            <p className="so-card-tag">
              <span aria-hidden="true">{DIRECTION_MARK[card.direction]}</span>
              {DIRECTION_WORD[card.direction]}
            </p>

            <p className="so-card-claim">{card.claim}</p>

            {card.evidence.length > 0 && (
              <ul className="so-card-evidence">
                {card.evidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}

            {card.relevance && <p className="so-card-why">{card.relevance}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

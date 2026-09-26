/**
 * The band the subject page opens its argument on.
 *
 * Named for what it is rather than for what it draws, because the arithmetic
 * behind it is `./objective` and an `Objective.tsx` beside an `objective.ts`
 * is two files on a case-insensitive filesystem and one on a case-sensitive
 * one. The pair is the same split the rest of this folder keeps: a lowercase
 * module that works things out, a capitalised one that lays them out.
 *
 * **The band** — what the reader is trying to accomplish, at the size of a
 * heading. The goal as an aim rather than a label, the kind of thing it is,
 * and the one sentence saying what has to change next.
 *
 * ## It used to have two neighbours
 *
 * `WhatMatters` drew three cards of evidence bearing on the goal, and
 * `BottleneckPanel` named the one thing most in the way underneath them.
 * All four were chosen out of the same arithmetic in `./objective`, so the
 * region argued one finding up to four times with the same counted lines
 * repeated under each — two screens of page restating the difficulty cliff.
 *
 * Both are gone. What survived is the bottleneck's *name*, which was the
 * only part of it a reader could act on: it is the "Focus area" card at the
 * top of the page now (components/Subject/Cards), and the figures the cards
 * were arguing from are the Evidence tab, which is what that tab is for.
 *
 * ## Why a claim leads and the number follows
 *
 * That rule outlived the cards and still governs this band. "Execution: 76
 * (+4.2%)" is a figure the reader has to interpret; "convert strong solving
 * into consistent contest execution" is the same record having been
 * interpreted, and the interpretation is the part they wanted.
 */
import type { Objective as ObjectiveRead } from './objective';
import { KIND_MEANS, KIND_WORDS } from './objective';

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

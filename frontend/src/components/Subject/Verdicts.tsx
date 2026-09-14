/**
 * DID YOUR LAST ADVICE WORK — the small section that makes the rest worth
 * anything.
 *
 * Every other section on this page is the app talking. This one is the app
 * being held to what it said: the last few recommendations, whether they were
 * acted on, and what execution did afterwards.
 *
 * ## Three rows, one line each
 *
 * It used to draw every recommendation on record, and each one carried four
 * lines — the kind, the dates, the prediction it was given with, and a
 * sentence reading the outcome. Six of those is a screen and a half of prose
 * saying the same three things over and over, because the reading for "flat"
 * is the same paragraph on every flat row.
 *
 * So the rows are one line now — what it was, whether it was done, what
 * execution did — and only the last `SHOWN` of them draw. The rest are counted
 * in the head. A loop the reader has to scroll to read is a loop they stop
 * reading, and the one sentence that actually answers the heading is the
 * summary above the list.
 *
 * ## Untaken rows still draw
 *
 * They are greyed, and they say nothing about the intervention, but they are
 * on the list: "you were told to do this and did not" is the commonest thing
 * the loop has to report, and hiding it would make the section a highlight
 * reel. See the note in ./verdict on why untaken is its own verdict rather
 * than a nil result.
 */
import type { LoopSummary, Verdict } from './verdict';

/** How many rows draw. The rest are counted in the head and not listed. */
export const SHOWN = 3;

/** The word each verdict draws with. Never colour alone. */
const WORDS: Record<Verdict['word'], string> = {
  moved: 'Execution rose after it',
  flat: 'No clear movement',
  slipped: 'Execution fell after it',
  untaken: 'Never acted on',
  unmeasured: 'Nothing rated either side',
};

const MARKS: Record<Verdict['word'], string> = {
  moved: '↑',
  flat: '→',
  slipped: '↓',
  untaken: '·',
  unmeasured: '?',
};

export function Verdicts({
  verdicts,
  summary,
}: {
  verdicts: Verdict[];
  summary: LoopSummary;
}) {
  if (verdicts.length === 0) return null;

  /* Newest first is the order `verdictsFrom` returns them in, so the last few
     are the head of the list rather than its tail. */
  const shown = verdicts.slice(0, SHOWN);
  const older = verdicts.length - shown.length;

  return (
    <section className="so-loop" aria-label="Did your last advice work">
      <div className="so-loop-head">
        <h2>Did your last advice work?</h2>
        <p className="so-loop-count">
          {summary.taken} of {summary.given} acted on
        </p>
      </div>

      {summary.say && <p className="so-loop-say">{summary.say}</p>}

      <ol className="so-loop-list">
        {shown.map((one) => (
          <li key={one.id} className={`so-verdict is-${one.word}`}>
            <strong className="so-verdict-name">{one.title}</strong>
            <span className="so-verdict-done">
              {one.takenOn ? 'acted on' : 'not acted on'}
            </span>
            <span className={`so-verdict-word is-${one.word}`}>
              <span aria-hidden="true">{MARKS[one.word]}</span>
              {WORDS[one.word]}
              {one.was !== null && one.now !== null && (
                <em>
                  {' '}
                  {one.was} → {one.now}
                </em>
              )}
            </span>
          </li>
        ))}
      </ol>

      {older > 0 && (
        <p className="so-loop-more">
          {older} older {older === 1 ? 'one' : 'ones'} not shown.
        </p>
      )}
    </section>
  );
}

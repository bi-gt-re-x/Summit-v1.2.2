/**
 * DID YOUR LAST ADVICE WORK — the small section that makes the rest worth
 * anything.
 *
 * Every other section on this page is the app talking. This one is the app
 * being held to what it said: each recommendation, whether it was acted on,
 * what it predicted would happen, and what the figures did afterwards.
 *
 * ## Why the prediction is shown next to the outcome
 *
 * A recommendation carries a `signal` — "if execution at Hard rises while the
 * level you file stays the same, this is working" — written when the advice
 * was given and stored beside it. Printing it here, next to what actually
 * happened, is the difference between a system that gives advice and one that
 * can be caught being wrong. Without the prediction on screen the reader has
 * only the outcome, and an outcome with no prediction against it can be read
 * as a success either way.
 *
 * ## Untaken rows still draw
 *
 * They are greyed and they say nothing about the intervention, but they are
 * on the list, because "you were told to do this and did not" is the
 * commonest thing the loop has to report and hiding it would make the section
 * a highlight reel. See the note in ./verdict on why untaken is its own
 * verdict rather than a nil result.
 */
import { STEP_WORDS } from '@/services/analytics';
import type { LoopSummary, Verdict } from './verdict';

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

  return (
    <section className="so-loop" aria-label="Did your last advice work">
      <div className="so-loop-head">
        <h2>Did your last advice work?</h2>
        <p className="so-loop-count">
          {summary.taken} of {summary.given} acted on
          {summary.settled > 0 && <> · {summary.settled} with a figure either side</>}
        </p>
      </div>

      {summary.say && <p className="so-loop-say">{summary.say}</p>}

      <ol className="so-loop-list">
        {verdicts.map((one) => (
          <li key={one.id} className={`so-verdict is-${one.word}`}>
            <div className="so-verdict-head">
              <strong>{one.title}</strong>
              <span className="so-verdict-kind">{STEP_WORDS[one.type] ?? one.type}</span>
            </div>

            <p className="so-verdict-when">
              Advised {one.on}
              {one.takenOn ? <> · acted on {one.takenOn}</> : <> · not acted on</>}
            </p>

            {/* What it said would happen, beside what did. */}
            {one.signal && (
              <p className="so-verdict-signal">
                <span>It said</span>
                {one.signal}
              </p>
            )}

            <p className={`so-verdict-word is-${one.word}`}>
              <span aria-hidden="true">{MARKS[one.word]}</span>
              {WORDS[one.word]}
              {one.was !== null && one.now !== null && (
                <em>
                  {' '}
                  execution {one.was} → {one.now}
                  {one.change !== null && (
                    <> ({one.change > 0 ? '+' : ''}{one.change})</>
                  )}
                </em>
              )}
            </p>

            <p className="so-verdict-reading">{one.reading}</p>
          </li>
        ))}
      </ol>

      {/* The aggregate, which is the part that gets more useful with time:
          which *kind* of session has been followed by movement for this
          particular account. It lived at the foot of Do This Next, which made
          it a footnote to a prescription rather than the evidence for one. */}
      {summary.kinds.length > 0 && (
        <div className="so-loop-kinds">
          <h3>By kind of session</h3>
          <ul>
            {summary.kinds.map((entry) => (
              <li key={entry.type}>
                <span className="so-kind-name">
                  {STEP_WORDS[entry.type] ?? entry.type}
                </span>
                <span className="so-kind-count">
                  {entry.taken} of {entry.given} acted on
                </span>
                <span
                  className={`so-kind-move${
                    entry.change === null ? '' : entry.change > 0 ? ' is-up' : ' is-down'
                  }`}
                >
                  {entry.change === null
                    ? 'no reading yet'
                    : `${entry.change > 0 ? '+' : ''}${entry.change} pts execution since`}
                </span>
              </li>
            ))}
          </ul>
          <p className="so-loop-note">
            Counted from your own record rather than claimed: execution when each was
            given, against execution now. Over this few sessions it is a correlation,
            not a proof.
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * DO THIS NEXT — the part of the page everything else exists to produce.
 *
 * ## The loop, and why the buttons matter more than the prose
 *
 *   activity → analytics → diagnosis → recommendation → action → new data → …
 *
 * Every panel above this one is the left-hand side of that arrow. This is the
 * right-hand side, and it only closes if the reader can act on a step *and*
 * the app finds out that they did. So each step carries two controls:
 *
 *   **Make it a task** — writes a real task, filed under this subject, at the
 *   recommended difficulty. Not a note to self: a task in the ordinary system,
 *   which means finishing it produces a rating, which is the new data.
 *
 *   **I did this** — records the step as taken without creating anything, for
 *   the reader who did the work outside Summit.
 *
 * Either one stamps `taken_at` on the stored recommendation. Without that
 * stamp the whole feedback loop is blind in the one way that matters: "this
 * kind of session did not help" becomes indistinguishable from "this kind of
 * session was never tried", and the second is by far the commoner case.
 *
 * ## What is a measurement and what is a suggestion
 *
 * The difficulty and the minutes on a step are the model's recommendations —
 * two of exactly three numbers on this page it is allowed to produce — and
 * they are drawn as chips rather than in the tabular figures used everywhere
 * else, so they do not read as counted. The `reason` under each is required to
 * cite a figure that *was* counted, which is what makes a step arguable
 * instead of oracular.
 *
 * ## Effectiveness, once there is any
 *
 * The strip at the foot is what the loop is for: which kinds of session have
 * actually been followed by movement for this account. It draws only when
 * something has been acted on, because a table of "0 taken" for six kinds is
 * not a finding about the reader, it is a finding about the feature.
 */
import { STEP_WORDS, type NextStep, type StepOutcome } from '@/services/analytics';
import { DIFFICULTY_WORDS } from '@/utils/ratings';

export interface NextStepsProps {
  steps: NextStep[];
  outcomes: StepOutcome[];
  /** Ids already acted on, so a step does not offer twice. */
  taken: Set<string>;
  busy: string;
  onMakeTask: (step: NextStep) => void;
  onDidIt: (step: NextStep) => void;
}

export function NextSteps({
  steps,
  outcomes,
  taken,
  busy,
  onMakeTask,
  onDidIt,
}: NextStepsProps) {
  if (!steps.length) return null;

  const acted = outcomes.filter((entry) => entry.taken > 0);

  return (
    <div className="sx-steps">
      <ol className="sx-step-list">
        {steps.map((step, at) => {
          const done = taken.has(step.id);
          return (
            <li key={step.id || step.title} className={`sx-step${done ? ' is-taken' : ''}`}>
              <span className="sx-step-rank" aria-hidden="true">
                {String(at + 1).padStart(2, '0')}
              </span>

              <div className="sx-step-body">
                <div className="sx-step-head">
                  <strong>{step.title}</strong>
                  <span className="sx-step-kind">{STEP_WORDS[step.type] ?? step.type}</span>
                </div>

                {/* The model's own two numbers, marked as suggestions. */}
                <div className="sx-step-chips">
                  <span className="sx-chip is-difficulty" data-level={step.difficulty}>
                    {DIFFICULTY_WORDS[step.difficulty - 1] ?? `Level ${step.difficulty}`}
                    <i>{step.difficulty}/5</i>
                  </span>
                  <span className="sx-chip">{step.minutes} min</span>
                  {step.focus && <span className="sx-chip is-focus">{step.focus}</span>}
                </div>

                <p className="sx-step-why">{step.reason}</p>

                {/* What would say this worked.

                    The field that turns a recommendation into an experiment
                    somebody can settle, and the reason it is worth a line of
                    its own rather than a clause in the reason: a reader who
                    knows what to watch can tell in a fortnight whether to keep
                    doing this, and the app records the same thing next to the
                    row. Without it, "that did not help" and "I never tried it"
                    look identical from here — the failure the whole loop
                    exists to prevent. */}
                {step.signal && (
                  <p className="sx-step-signal">
                    <span>Expected signal</span>
                    {step.signal}
                  </p>
                )}

                {step.drills.length > 0 && (
                  <ul className="sx-step-drills">
                    {step.drills.map((drill) => (
                      <li key={drill}>{drill}</li>
                    ))}
                  </ul>
                )}

                <div className="sx-step-actions">
                  {done ? (
                    <span className="sx-step-done">Recorded. It counts toward what works</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="sx-btn is-primary"
                        disabled={busy === step.id}
                        onClick={() => onMakeTask(step)}
                      >
                        {busy === step.id ? 'Adding…' : 'Make it a task'}
                      </button>
                      <button
                        type="button"
                        className="sx-btn is-quiet"
                        disabled={busy === step.id}
                        onClick={() => onDidIt(step)}
                      >
                        I did this
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {acted.length > 0 && (
        <div className="sx-effect">
          <h4>What has actually worked here</h4>
          <ul>
            {acted.map((entry) => (
              <li key={entry.type}>
                <span className="sx-effect-name">
                  {STEP_WORDS[entry.type] ?? entry.type}
                </span>
                <span className="sx-effect-count">
                  {entry.taken} of {entry.given} acted on
                </span>
                <span
                  className={`sx-effect-move${
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
          <p className="sx-effect-note">
            Counted from your own record rather than claimed by the model: execution when each
            was given, against execution now. Over this few sessions it is a correlation, not
            a proof.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The model's recommended sessions for one subject, three at a time, up to six.
 *
 * Restored from before 48bcdc4, where it was the second half of "Do this
 * next". Each step is a dropdown: the title, exactly what to work and the
 * chips on the shut row; the pace, where to get the material, the reason, the
 * signal, the drills and the actions inside. A second batch of three goes
 * under the first, so the list grows down to six.
 *
 * A step is an instruction, not a finding. "Easy algorithm drills, timed" is
 * a category; "Easy MATHCOUNTS Sprint #1-10, 2 min each, from mathcounts.org"
 * is something a person can start, and the three fields `problems`, `pace`
 * and `resource` are what the model is made to fill to get there.
 *
 * ## The loop, and why the buttons matter more than the prose
 *
 *   activity → analytics → diagnosis → recommendation → action → new data → …
 *
 * Each step carries two controls:
 *
 *   **Make it a task** — writes a real task, filed under this subject, at the
 *   recommended difficulty. Finishing it produces a rating, which is the new
 *   data the next batch is argued from.
 *
 *   **I did this** — records the step as taken without creating anything, for
 *   the reader who did the work outside Summit.
 *
 * Either one stamps `taken_at` on the stored recommendation. Without that
 * stamp "this kind of session did not help" is indistinguishable from "this
 * kind of session was never tried".
 *
 * ## What is a measurement and what is a suggestion
 *
 * The difficulty and the minutes are the model's suggestions and are drawn as
 * chips rather than as counted figures. The `reason` under each is required to
 * cite a figure that *was* counted, which is what makes a step arguable.
 */
import { STEP_WORDS, type NextStep } from '@/services/analytics';
import { DIFFICULTY_WORDS } from '@/utils/ratings';

/** How many steps make a batch. The model is asked for at most this many
    (backend/tracking/subject_ai.py) and the page never draws more. */
export const BATCH = 3;

/** The most the panel holds at once — two batches. Mirrors `MAX_STEPS` in
    backend/api/subject_ai.py, which enforces it. */
export const MAX_STEPS = 6;

export interface NextStepsProps {
  steps: NextStep[];
  /** Ids already acted on, so a step does not offer twice. */
  taken: Set<string>;
  busy: string;
  onMakeTask: (step: NextStep) => void;
  onDidIt: (step: NextStep) => void;
}

export function NextSteps({ steps, taken, busy, onMakeTask, onDidIt }: NextStepsProps) {
  const batch = steps.slice(0, MAX_STEPS);
  if (!batch.length) return null;

  return (
    <div className="sx-steps">
      <ol className="sx-step-list">
        {batch.map((step, at) => {
          const done = taken.has(step.id);
          return (
            <li key={step.id || step.title} className={`sx-step${done ? ' is-taken' : ''}`}>
              <span className="sx-step-rank" aria-hidden="true">
                {String(at + 1).padStart(2, '0')}
              </span>

              <details className="sx-step-body sx-step-fold" open={at === 0 && !done}>
                <summary>
                  <div className="sx-step-head">
                    <strong>{step.title}</strong>
                    <span className="sx-step-kind">{STEP_WORDS[step.type] ?? step.type}</span>
                  </div>

                  {/* Exactly what to work, on the shut row: the line that makes
                      this an instruction rather than a category. Left out when
                      the title already says it word for word. */}
                  {step.problems
                    && !step.title.toLowerCase().includes(step.problems.toLowerCase()) && (
                    <p className="sx-step-what">{step.problems}</p>
                  )}

                  {/* The model's own two numbers, marked as suggestions. */}
                  <div className="sx-step-chips">
                    <span className="sx-chip is-difficulty" data-level={step.difficulty}>
                      {DIFFICULTY_WORDS[step.difficulty - 1] ?? `Level ${step.difficulty}`}
                      <i>{step.difficulty}/5</i>
                    </span>
                    {step.pace && <span className="sx-chip is-pace">{step.pace}</span>}
                    <span className="sx-chip">{step.minutes} min</span>
                    {step.focus && <span className="sx-chip is-focus">{step.focus}</span>}
                    {done && <span className="sx-chip">Done</span>}
                  </div>
                </summary>

                <div className="sx-step-inside">
                  {step.resource && (
                    <p className="sx-step-resource">
                      <span>Where to get it</span>
                      {step.resource}
                    </p>
                  )}

                  {step.reason && <p className="sx-step-why">{step.reason}</p>}

                  {/* What would say this worked — the line that turns a
                      recommendation into something a reader can settle. */}
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
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

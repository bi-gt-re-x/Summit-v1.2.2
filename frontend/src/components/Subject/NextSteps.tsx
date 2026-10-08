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
 * a category; "Easy MATHCOUNTS Sprint #1-10, 2 min each" is something a person
 * can start, and so is "Practice Bach Concerto intonation" — `problems`,
 * `pace` and the minutes are filled when they help and left out when not.
 * Inside, up to three links say where the material is, best first, with the
 * ones the reader already keeps marked as theirs.
 *
 * The whole card is the dropdown's handle: a click anywhere on it that is not
 * on a link or a button opens or shuts it.
 *
 * ## The loop, and why the buttons matter more than the prose
 *
 *   activity → analytics → diagnosis → recommendation → action → new data → …
 *
 * Each step carries two controls:
 *
 *   **Plan my next session** — books the step into the next free calendar
 *   slot as a task filed under this subject, with an estimated length and XP
 *   (backend/tracking/session_plan.py). The step is then locked to that task:
 *   completing it marks the step done, deleting it opens the step again.
 *   Finishing it produces a rating, which is the new data the next batch is
 *   argued from.
 *
 *   **I did this** — records the step as done without creating anything, for
 *   the reader who did the work outside Summit.
 *
 * Done stamps `taken_at` on the stored recommendation. Without that stamp
 * "this kind of session did not help" is indistinguishable from "this kind of
 * session was never tried".
 *
 * ## What is a measurement and what is a suggestion
 *
 * The difficulty and the minutes are the model's suggestions and are drawn as
 * chips rather than as counted figures. The `reason` under each is required to
 * cite a figure that *was* counted, which is what makes a step arguable.
 */
import type { MouseEvent } from 'react';
import {
  STEP_WORDS,
  type NextStep,
  type PlannedSession,
  type StepResource,
  type StepState,
} from '@/services/analytics';
import { DIFFICULTY_WORDS } from '@/utils/ratings';
import { RULES } from '@/utils/sharedRules';

/** How many steps make a batch. The model is asked for at most this many
    and the page never draws more. From shared/rules.json, as the server's is. */
export const BATCH: number = RULES.recommendations.batch;

/** The most the panel holds at once — two batches. The server enforces the
    same number, from the same file. */
export const MAX_STEPS: number = RULES.recommendations.max_steps;

/** What the three link slots are called, best first. */
const RANK_WORDS = ['Best', 'Next best', 'Also'];

/** The links worth drawing: http(s) only, whatever a saved reading holds. */
export function stepLinks(step: NextStep): StepResource[] {
  return (step.resources ?? [])
    .filter((link) => /^https?:\/\//i.test(link.url ?? ''))
    .slice(0, 3);
}

/**
 * Whether a pace only says the session's length again — "30 minutes total"
 * beside a "30 min" chip — so it is not drawn twice.
 */
export function paceRepeatsLength(pace: string, minutes: number | null | undefined): boolean {
  const text = pace.trim().toLowerCase();
  const only = /^(\d+)\s*(?:min|mins|minutes?)(?:\s+(?:total|in total|overall|for the set|for the session))?$/.exec(text);
  return Boolean(only && minutes && Number(only[1]) === minutes);
}

function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * A click anywhere on a step's card opens or shuts it, not only on its head.
 *
 * The `summary` still does the toggling for itself (and for the keyboard), so
 * a click there is left to it; links and buttons do their own thing; and a
 * click that ends a text selection is somebody copying, not folding.
 */
function foldFromCard(event: MouseEvent<HTMLLIElement>) {
  const target = event.target as HTMLElement;
  if (target.closest('summary, a, button, input, select, textarea, label')) return;
  if (window.getSelection()?.toString()) return;
  const fold = event.currentTarget.querySelector('details');
  if (fold) fold.open = !fold.open;
}

/** "Tue 6 Oct, 4:00–4:45 PM" for a booked session's local ISO times. */
export function sessionWhen(task: PlannedSession): string {
  const start = new Date(task.start);
  const end = new Date(task.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  const day = start.toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
  });
  const time = (date: Date) =>
    date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time(start)}–${time(end)}`;
}

export interface NextStepsProps {
  steps: NextStep[];
  /** Where each step stands, by id. A step missing here is open. */
  status: Map<string, { state: StepState; task: PlannedSession | null }>;
  busy: string;
  onPlan: (step: NextStep) => void;
  onDidIt: (step: NextStep) => void;
}

export function NextSteps({ steps, status, busy, onPlan, onDidIt }: NextStepsProps) {
  const batch = steps.slice(0, MAX_STEPS);
  if (!batch.length) return null;

  return (
    <div className="sx-steps">
      <ol className="sx-step-list">
        {batch.map((step, at) => {
          const state = status.get(step.id)?.state ?? 'open';
          const planned = state === 'planned' ? status.get(step.id)?.task ?? null : null;
          const done = state === 'done';
          const links = stepLinks(step);
          return (
            <li
              key={step.id || step.title}
              className={`sx-step${done ? ' is-taken' : ''}`}
              onClick={foldFromCard}
            >
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
                    {step.pace && !paceRepeatsLength(step.pace, step.minutes) && (
                      <span className="sx-chip is-pace">{step.pace}</span>
                    )}
                    {step.minutes ? <span className="sx-chip">{step.minutes} min</span> : null}
                    {step.focus && <span className="sx-chip is-focus">{step.focus}</span>}
                    {planned && <span className="sx-chip is-planned">Planned</span>}
                    {done && <span className="sx-chip">Done</span>}
                  </div>
                </summary>

                <div className="sx-step-inside">
                  {/* Up to three links, best first, the reader's own marked.
                      A step from before links existed keeps its one named
                      source as plain text. */}
                  {links.length > 0 ? (
                    <div className="sx-step-resource">
                      <span>Where to get it</span>
                      <ol className="sx-step-links">
                        {links.map((link, n) => (
                          <li key={link.url}>
                            <a href={link.url} target="_blank" rel="noopener noreferrer">
                              {link.name || siteOf(link.url)}
                            </a>
                            <small>{siteOf(link.url)}</small>
                            <i className={`sx-link-rank${n === 0 ? ' is-best' : ''}`}>
                              {RANK_WORDS[n]}
                            </i>
                            {link.yours && <i className="sx-link-rank is-yours">Yours</i>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : step.resource ? (
                    <p className="sx-step-resource">
                      <span>Where to get it</span>
                      {step.resource}
                    </p>
                  ) : null}

                  {step.reason && (
                    <p className="sx-step-why">
                      <span>Why this one</span>
                      {step.reason}
                    </p>
                  )}

                  {/* What would say this worked — the line that turns a
                      recommendation into something a reader can settle. */}
                  {step.signal && (
                    <p className="sx-step-signal">
                      <span>How you'll know it's working</span>
                      {step.signal}
                    </p>
                  )}

                  {step.drills.length > 0 && (
                    <ul className="sx-step-drills" aria-label="In the session">
                      {step.drills.map((drill) => (
                        <li key={drill}>{drill}</li>
                      ))}
                    </ul>
                  )}

                  <div className="sx-step-actions">
                    {done ? (
                      <span className="sx-step-done">Recorded. It counts toward what works</span>
                    ) : planned ? (
                      <span className="sx-step-done">
                        Planned for {sessionWhen(planned)} · {planned.xp} XP. Complete or
                        delete that task to plan another from this.
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="sx-btn is-primary"
                          disabled={busy === step.id}
                          onClick={() => onPlan(step)}
                        >
                          {busy === step.id ? 'Planning…' : 'Plan my next session'}
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

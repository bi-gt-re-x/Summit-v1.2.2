/**
 * The model's recommended sessions for one subject, three at a time, up to six.
 *
 * Restored from before 48bcdc4, where it was the second half of "Do this
 * next". Each step is a dropdown: the title, its kind and subject, difficulty
 * and time on the shut row; where to get the material (or the equipment), why
 * this one, a timed session plan, the success criteria and the actions
 * inside. A second batch of three goes
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
  type StepPart,
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

/**
 * The session in order. A step written before plans existed has its drills,
 * untimed, so older steps still read as a list of what to do.
 */
export function stepPlan(step: NextStep): StepPart[] {
  if (step.plan?.length) return step.plan.filter((part) => part.what?.trim());
  return (step.drills ?? []).map((what) => ({ label: '', minutes: null, what }));
}

/** What to check off at the end. An older step has its one signal. */
export function stepSuccess(step: NextStep): string[] {
  if (step.success?.length) return step.success.filter((line) => line.trim());
  return step.signal ? [step.signal] : [];
}

/** One link to the material, with what it costs to open. */
function StepLink({ link }: { link: StepResource }) {
  const cost = link.yours
    ? 'Yours'
    : link.signup === 'quick'
      ? 'Free account'
      : link.signup
        ? 'Free'
        : '';
  return (
    <>
      <a href={link.url} target="_blank" rel="noopener noreferrer">
        {link.name || siteOf(link.url)}
      </a>
      {cost && <span className="sx-step-cost"> · {cost}</span>}
    </>
  );
}

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
  return `${day}, ${time(start)}-${time(end)}`;
}

export interface NextStepsProps {
  steps: NextStep[];
  /** Where each step stands, by id. A step missing here is open. */
  status: Map<string, { state: StepState; task: PlannedSession | null }>;
  busy: string;
  onPlan: (step: NextStep) => void;
  onDidIt: (step: NextStep) => void;
  /** Whether the first step starts open. Off where the steps sit side by side. */
  firstOpen?: boolean;
}

export function NextSteps({ steps, status, busy, onPlan, onDidIt, firstOpen = true }: NextStepsProps) {
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
          const plan = stepPlan(step);
          const success = stepSuccess(step);
          return (
            <li
              key={step.id || step.title}
              className={`sx-step${done ? ' is-taken' : ''}`}
              onClick={foldFromCard}
            >
              <span className="sx-step-rank" aria-hidden="true">
                {String(at + 1).padStart(2, '0')}
              </span>

              <details className="sx-step-body sx-step-fold" open={firstOpen && at === 0 && !done}>
                <summary>
                  <div className="sx-step-head">
                    <strong>{step.title}</strong>
                  </div>
                  <p className="sx-step-meta">
                    {[STEP_WORDS[step.type] ?? step.type, step.focus].filter(Boolean).join(' · ')}
                    {planned && <span className="sx-chip is-planned">Planned</span>}
                    {done && <span className="sx-chip">Done</span>}
                  </p>

                  {/* The model's own two numbers, marked as suggestions. */}
                  <p className="sx-step-facts">
                    <span className="is-difficulty" data-level={step.difficulty}>
                      <b>Difficulty:</b> {DIFFICULTY_WORDS[step.difficulty - 1] ?? `Level ${step.difficulty}`}
                      {' · '}{step.difficulty}/5
                    </span>
                    {step.minutes ? <span><b>Time:</b> {step.minutes} min</span> : null}
                  </p>

                  {/* Exactly what to work, on the shut row: the line that makes
                      this an instruction rather than a category. Left out when
                      the title already says it word for word. */}
                  {step.problems
                    && !step.title.toLowerCase().includes(step.problems.toLowerCase()) && (
                    <p className="sx-step-what">{step.problems}</p>
                  )}
                </summary>

                <div className="sx-step-inside">
                  {/* Where the material is, best first, the reader's own
                      marked. A step from before links existed keeps its one
                      named source as plain text. */}
                  {links.length === 1 ? (
                    <p className="sx-step-line">
                      <b>Where to get it:</b>{' '}
                      <StepLink link={links[0]!} />
                    </p>
                  ) : links.length > 1 ? (
                    <div className="sx-step-line">
                      <b>Where to get it:</b>
                      <ol className="sx-step-links">
                        {links.map((link) => (
                          <li key={link.url}><StepLink link={link} /></li>
                        ))}
                      </ol>
                    </div>
                  ) : step.resource ? (
                    <p className="sx-step-line"><b>Where to get it:</b> {step.resource}</p>
                  ) : null}

                  {step.equipment && (
                    <p className="sx-step-line"><b>Equipment:</b> {step.equipment}</p>
                  )}

                  {step.pace && !paceRepeatsLength(step.pace, step.minutes) && (
                    <p className="sx-step-line"><b>Pace:</b> {step.pace}</p>
                  )}

                  {step.reason && (
                    <section className="sx-step-section">
                      <h4>Why this recommendation</h4>
                      <p>{step.reason}</p>
                    </section>
                  )}

                  {plan.length > 0 && (
                    <section className="sx-step-section">
                      <h4>Your session plan</h4>
                      <ol className="sx-step-plan">
                        {plan.map((part, n) => (
                          <li key={`${n}-${part.label}`}>
                            {part.label && (
                              <b>
                                {part.label}
                                {part.minutes ? ` (${part.minutes} min)` : ''}:
                              </b>
                            )}{' '}
                            {part.what}
                          </li>
                        ))}
                      </ol>
                    </section>
                  )}

                  {success.length > 0 && (
                    <section className="sx-step-section">
                      <h4>Success criteria</h4>
                      <ul className="sx-step-success">
                        {success.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <div className="sx-step-actions">
                    {done ? (
                      <span className="sx-step-done">Saved. It helps us learn what works for you.</span>
                    ) : planned ? (
                      <span className="sx-step-done">
                        Planned for {sessionWhen(planned)} · {planned.xp} XP. Finish or delete that task to plan another.
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

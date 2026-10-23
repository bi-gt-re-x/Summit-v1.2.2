/**
 * The review list: each thing you missed, redone right here.
 *
 * Shared by the Recommendations tab (./ReviewPanel) and a tree's plan on the
 * skill tree page (components/SkillTree/TreePlan). The server decides what's
 * due (backend/tracking/review.py); this draws it and takes the answer.
 *
 * ## Three kinds, three ways to redo
 *
 * A **problem** opens to its own question. Show the answer, then Got it or
 * Missed it, which is a new skill attempt like any other, so the skill tree's
 * level moves with it. A **step** (a logged batch with misses) opens to a few
 * of its problems, answered the same way. A **set** (a task scored 6 of 10) has
 * no question here, so it's two buttons: Got them all, or Still missed some.
 *
 * After an answer the row stays, closed, saying when it's back, so the list
 * doesn't jump under the pointer. The next read drops it from "due".
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { skillAttempts } from '@/services';
import { after, markReview, type ReviewItem, type ReviewProblem } from '@/services/review';
import '@/styles/review.css';

type Outcome = { right: boolean; days: number | null };

const KIND_LABEL: Record<ReviewItem['kind'], string> = {
  problem: 'Problem',
  step: 'Step',
  set: 'Task',
};

/** "Back tomorrow", "Back in 3 days", or cleared. */
export function outcomeText({ right, days }: Outcome): string {
  if (days === null) return "Cleared. That one's stuck.";
  const when = days === 1 ? 'tomorrow' : `in ${days} days`;
  return right ? `Nice. Back ${when}.` : `No problem. It's back ${when}.`;
}

function Question({
  problem,
  onMark,
  busy,
  done,
}: {
  problem: { prompt: string; answer: string; hint: string };
  onMark: (right: boolean) => void;
  busy: boolean;
  done: boolean | null;
}) {
  const [hint, setHint] = useState(false);
  const [answer, setAnswer] = useState(false);
  return (
    <div className="rq-q">
      <p className="rq-q-prompt">{problem.prompt}</p>
      {hint && problem.hint && <p className="rq-q-hint">{problem.hint}</p>}
      {answer && <p className="rq-q-answer">{problem.answer}</p>}
      <div className="rq-q-acts">
        {problem.hint && !hint && !answer && (
          <button type="button" className="rq-link" onClick={() => setHint(true)}>
            Hint
          </button>
        )}
        {!answer && (
          <button type="button" className="rq-link is-strong" onClick={() => setAnswer(true)}>
            Show answer
          </button>
        )}
        {/* Marking is checking, so it waits for the answer. */}
        {answer && done === null && (
          <span className="rq-mark" role="group" aria-label="How did it go?">
            <button type="button" className="rq-mark-btn is-right" disabled={busy} onClick={() => onMark(true)}>
              Got it
            </button>
            <button type="button" className="rq-mark-btn is-wrong" disabled={busy} onClick={() => onMark(false)}>
              Missed it
            </button>
          </span>
        )}
        {done !== null && <span className="rq-q-done">{done ? 'Right' : 'Missed'}</span>}
      </div>
    </div>
  );
}

function Row({
  item,
  open,
  onToggle,
  outcome,
  onOutcome,
}: {
  item: ReviewItem;
  open: boolean;
  onToggle: () => void;
  outcome: Outcome | undefined;
  onOutcome: (outcome: Outcome) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* A step's problems answered on this visit, by slot. */
  const [stepMarks, setStepMarks] = useState<Record<number, boolean>>({});

  const attempt = async (problem: { slot: number; weight: ReviewProblem['weight'] }, right: boolean) => {
    if (!item.node_id || item.ordinal === null) return false;
    const result = await skillAttempts.add({
      node_id: item.node_id,
      ordinal: item.ordinal,
      slot: problem.slot,
      weight: problem.weight,
      attempted: 1,
      correct: right ? 1 : 0,
      source: 'problem',
    });
    if (!result.success) {
      setError(result.message ?? "That wasn't saved. Try again.");
      return false;
    }
    return true;
  };

  const run = async (work: () => Promise<boolean>, then: () => void) => {
    setBusy(true);
    setError(null);
    try {
      if (await work()) then();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const answerProblem = (right: boolean) =>
    run(
      () => attempt({ slot: item.slot ?? 1, weight: item.weight ?? 'core' }, right),
      () => onOutcome({ right, days: after(item.rung, right).days }),
    );

  const answerStepProblem = (problem: ReviewProblem, right: boolean) =>
    run(
      () => attempt(problem, right),
      () => {
        const next = { ...stepMarks, [problem.slot]: right };
        setStepMarks(next);
        const marks = Object.values(next);
        // The step is judged on the day: 80% right moves it up.
        if (marks.length === item.problems.length) {
          const good = marks.filter(Boolean).length / marks.length >= 0.8;
          onOutcome({ right: good, days: after(item.rung, good).days });
        }
      },
    );

  const mark = (right: boolean) =>
    run(
      async () => {
        const result = await markReview(item.key, right ? 'right' : 'missed');
        if (!result.success) {
          setError(result.message ?? "That wasn't saved. Try again.");
          return false;
        }
        return true;
      },
      () => onOutcome({ right, days: after(item.rung, right).days }),
    );

  const treeLink = item.node_id ? `/skill-trees?node=${encodeURIComponent(item.node_id)}` : null;
  const where = [item.where, item.tree_title && item.tree_title !== item.where ? item.tree_title : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className={`rq-row${outcome ? ' is-done' : ''}${open && !outcome ? ' is-open' : ''}`}>
      <button
        type="button"
        className="rq-head"
        aria-expanded={open && !outcome}
        disabled={Boolean(outcome)}
        onClick={onToggle}
      >
        <span className={`rq-tag is-${item.kind}`}>
          {KIND_LABEL[item.kind]}
          {item.level ? ` · ${item.level}` : ''}
        </span>
        <span className="rq-head-text">
          <span className="rq-title">
            {item.kind === 'set' ? `Redo the ${item.missed} you missed in "${item.title}"` : item.title}
          </span>
          <span className="rq-line">
            {outcome ? outcomeText(outcome) : [where, item.line].filter(Boolean).join('. ')}
          </span>
        </span>
        {!outcome && <span className="rq-mins">{item.minutes}m</span>}
      </button>

      {open && !outcome && (
        <div className="rq-body">
          {item.kind === 'problem' &&
            (item.prompt && item.answer ? (
              <Question
                problem={{ prompt: item.prompt, answer: item.answer, hint: item.hint }}
                busy={busy}
                done={null}
                onMark={(right) => void answerProblem(right)}
              />
            ) : (
              <div className="rq-plain">
                <p>
                  Open it in the skill tree, do it again, then say how it went.
                  {treeLink && (
                    <>
                      {' '}
                      <Link to={treeLink} className="rq-link is-strong">
                        Open it
                      </Link>
                    </>
                  )}
                </p>
                <span className="rq-mark" role="group" aria-label="How did it go?">
                  <button type="button" className="rq-mark-btn is-right" disabled={busy} onClick={() => void answerProblem(true)}>
                    Got it
                  </button>
                  <button type="button" className="rq-mark-btn is-wrong" disabled={busy} onClick={() => void answerProblem(false)}>
                    Missed it
                  </button>
                </span>
              </div>
            ))}

          {item.kind === 'step' &&
            (item.problems.length > 0 ? (
              <>
                <p className="rq-note">Do these {item.problems.length}. Get 80% right and the step moves up.</p>
                {item.problems.map((problem) => (
                  <Question
                    key={problem.slot}
                    problem={problem}
                    busy={busy}
                    done={stepMarks[problem.slot] ?? null}
                    onMark={(right) => void answerStepProblem(problem, right)}
                  />
                ))}
              </>
            ) : (
              <div className="rq-plain">
                <p>
                  Do a few problems from this step again.
                  {treeLink && (
                    <>
                      {' '}
                      <Link to={treeLink} className="rq-link is-strong">
                        Open the step
                      </Link>
                    </>
                  )}
                </p>
                <SetMarks busy={busy} onMark={(right) => void mark(right)} />
              </div>
            ))}

          {item.kind === 'set' && (
            <div className="rq-plain">
              <p>
                Redo the {item.missed} you got wrong last time ({item.got} of {item.of} right). Then say how it went.
              </p>
              <SetMarks busy={busy} onMark={(right) => void mark(right)} />
            </div>
          )}

          {error && (
            <p className="rq-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function SetMarks({ busy, onMark }: { busy: boolean; onMark: (right: boolean) => void }) {
  return (
    <span className="rq-mark" role="group" aria-label="How did it go?">
      <button type="button" className="rq-mark-btn is-right" disabled={busy} onClick={() => onMark(true)}>
        Got them all
      </button>
      <button type="button" className="rq-mark-btn is-wrong" disabled={busy} onClick={() => onMark(false)}>
        Still missed some
      </button>
    </span>
  );
}

export interface ReviewListProps {
  items: ReviewItem[];
  /** Called after each answer, with the item and how it went. */
  onAnswered?: (item: ReviewItem, right: boolean) => void;
}

export function ReviewList({ items, onAnswered }: ReviewListProps) {
  /* The first one starts open, so there's one less click to begin. */
  const [open, setOpen] = useState<string | null>(items[0]?.key ?? null);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});

  const settle = (item: ReviewItem, outcome: Outcome) => {
    setOutcomes((was) => ({ ...was, [item.key]: outcome }));
    // Straight on to the next one still to do.
    const index = items.findIndex((one) => one.key === item.key);
    const next = items.slice(index + 1).find((one) => !outcomes[one.key]);
    setOpen(next?.key ?? null);
    onAnswered?.(item, outcome.right);
  };

  return (
    <ol className="rq-list">
      {items.map((item) => (
        <Row
          key={item.key}
          item={item}
          open={open === item.key}
          onToggle={() => setOpen((was) => (was === item.key ? null : item.key))}
          outcome={outcomes[item.key]}
          onOutcome={(outcome) => settle(item, outcome)}
        />
      ))}
    </ol>
  );
}

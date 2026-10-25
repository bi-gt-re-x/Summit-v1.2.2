/**
 * The skill check: three to five of a node's problems, one screen at a time.
 *
 * ## Why it takes the whole window
 *
 * A check is the one place on the tree that asks for attention rather than
 * offering it, so everything else goes: the rail, the canvas, the panel. What
 * is left is the question, a box for the answer, and a bar along the bottom
 * that says Check and then says whether that was right. The same shape Khan
 * Academy's exercises use, because it is the shape that works: one decision on
 * screen, feedback straight after it, and the next question one key away.
 *
 * ## Two kinds of question
 *
 * The server grades an answer that is one number (backend/tracking/
 * skill_check.py), so those get a verdict the moment Check is pressed. An
 * answer that is a sentence cannot be marked by matching text, so Check shows
 * the worked answer and the reader says whether theirs matched. "Show me the
 * answer" is there for both and counts as missed, which is what lets a reader
 * be honest about not knowing instead of guessing.
 *
 * ## What the result does
 *
 * Passing masters the node, and the reading that comes back with the last
 * answer goes straight to the page (`onProgress`), so the tile behind this is
 * already lit when the check closes. Failing still counts: every answer is a
 * marked problem, and the step levels on the panel move with them.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as skillProgress from '@/services/skillProgress';
import type { CheckQuestion, SkillCheck as Check, SkillReading } from '@/services/skillProgress';
import { readingOf } from '@/hooks/useSkillReading';
import '@/styles/skillcheck.css';

/** What the problems' three grades are called on screen. */
const LEVEL: Record<CheckQuestion['weight'], string> = {
  warmup: 'Easy',
  core: 'Medium',
  stretch: 'Hard',
};

type Phase =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'asking' }
  | { kind: 'revealed'; answer: string }
  | { kind: 'graded'; right: boolean; how: string; answer: string }
  | { kind: 'done' };

interface Final {
  opened: { id: string; name: string }[];
}

export interface SkillCheckProps {
  nodeId: string;
  nodeName: string;
  onClose: () => void;
  /** The reading the last answer came back with. */
  onProgress?: (reading: SkillReading) => void;
}

function firstOpen(check: Check): number {
  const at = check.questions.findIndex((question) => !question.result);
  return at === -1 ? check.questions.length - 1 : at;
}

export function SkillCheck({ nodeId, nodeName, onClose, onProgress }: SkillCheckProps) {
  const titleId = useId();
  const [check, setCheck] = useState<Check | null>(null);
  const [index, setIndex] = useState(0);
  const [given, setGiven] = useState('');
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [final, setFinal] = useState<Final | null>(null);
  const [resumed, setResumed] = useState(false);
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  /* A request in flight. A ref as well as `busy`, because two clicks in one
     frame both read the `busy` of the render before either landed. */
  const sending = useRef(false);
  /* Which node a check was started for. React runs a mount effect twice in
     development, and two starts would open two checks. */
  const startedFor = useRef<string | null>(null);

  const begin = useCallback(async () => {
    setPhase({ kind: 'loading' });
    setFinal(null);
    setGiven('');
    setHint(false);
    try {
      const reply = await skillProgress.startCheck(nodeId);
      if (!reply.success) {
        setPhase({ kind: 'failed', message: reply.message ?? "Couldn't start the check." });
        return;
      }
      setCheck(reply.check);
      setResumed(reply.resumed && reply.check.questions.some((question) => question.result));
      setIndex(firstOpen(reply.check));
      setPhase({ kind: 'asking' });
    } catch {
      setPhase({ kind: 'failed', message: "Couldn't reach the server. Check your connection and try again." });
    }
  }, [nodeId]);

  useEffect(() => {
    if (startedFor.current === nodeId) return;
    startedFor.current = nodeId;
    void begin();
  }, [begin, nodeId]);

  // The page behind stays put while the check is up.
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = was;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The caret goes to the answer on each new question, and to Next once
  // there is a verdict, so the whole check can be done from the keyboard.
  useEffect(() => {
    if (phase.kind === 'asking') field.current?.focus();
    if (phase.kind === 'graded') next.current?.focus();
  }, [phase.kind, index]);

  const question = check?.questions[index] ?? null;

  const send = useCallback(
    async (body: { given?: string; mark?: 'right' | 'wrong'; skip?: boolean }) => {
      if (!check || !question || sending.current) return;
      sending.current = true;
      setBusy(true);
      try {
        const reply = await skillProgress.answer({ id: check.id, index: question.index, ...body });
        if (!reply.success) {
          setPhase({ kind: 'failed', message: reply.message ?? "That answer wasn't saved." });
          return;
        }
        setCheck(reply.check);
        if (reply.reveal) {
          setPhase({ kind: 'revealed', answer: reply.reveal.answer });
          return;
        }
        if (reply.result) {
          setPhase({
            kind: 'graded',
            right: reply.result.right,
            how: reply.result.how,
            answer: reply.result.answer,
          });
        }
        if (reply.progress) {
          onProgress?.(readingOf(reply.progress));
          setFinal({ opened: reply.opened ?? [] });
        }
      } catch {
        setPhase({ kind: 'failed', message: "Couldn't reach the server. Your answers so far are saved." });
      } finally {
        sending.current = false;
        setBusy(false);
      }
    },
    [check, onProgress, question],
  );

  const goOn = useCallback(() => {
    if (!check) return;
    if (final || check.finished) {
      setPhase({ kind: 'done' });
      return;
    }
    setIndex(firstOpen(check));
    setGiven('');
    setHint(false);
    setPhase({ kind: 'asking' });
  }, [check, final]);

  const answered = check?.questions.filter((one) => one.result).length ?? 0;
  const asked = check?.asked ?? 0;

  let body: React.ReactNode;
  if (phase.kind === 'loading') {
    body = <p className="skc-quiet">Getting your questions ready.</p>;
  } else if (phase.kind === 'failed') {
    body = (
      <div className="skc-card skc-card--note">
        <p className="skc-note">{phase.message}</p>
        <div className="skc-actions">
          <button type="button" className="skc-btn" onClick={onClose}>
            Back to the tree
          </button>
          <button type="button" className="skc-btn is-primary" onClick={() => void begin()}>
            Try again
          </button>
        </div>
      </div>
    );
  } else if (phase.kind === 'done' && check) {
    body = <Results check={check} opened={final?.opened ?? []} onAgain={() => void begin()} onClose={onClose} />;
  } else if (question) {
    const locked = phase.kind !== 'asking';
    body = (
      <form
        className="skc-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (phase.kind === 'asking' && given.trim()) void send({ given });
          else if (phase.kind === 'graded') goOn();
        }}
      >
        <p className="skc-eyebrow">
          <span>Question {question.index + 1} of {asked}</span>
          {question.step && <span className="skc-step">{question.step}</span>}
          <span className={`skc-level is-${question.weight}`}>{LEVEL[question.weight]}</span>
        </p>
        <p className="skc-prompt">{question.prompt}</p>

        {question.hint &&
          (hint ? (
            <p className="skc-hint">
              <b>Hint</b> {question.hint}
            </p>
          ) : (
            !locked && (
              <button type="button" className="skc-link" onClick={() => setHint(true)}>
                Get a hint
              </button>
            )
          ))}

        <label className="skc-label" htmlFor={`${titleId}-answer`}>
          Your answer
        </label>
        {question.auto ? (
          <input
            id={`${titleId}-answer`}
            ref={field}
            className="skc-input"
            value={given}
            disabled={locked || busy}
            autoComplete="off"
            inputMode="text"
            placeholder="Type a number"
            onChange={(event) => setGiven(event.target.value)}
          />
        ) : (
          <textarea
            id={`${titleId}-answer`}
            ref={field}
            className="skc-input skc-input--long"
            value={given}
            rows={3}
            disabled={locked || busy}
            placeholder="Write it out, then check it against the worked answer"
            onChange={(event) => setGiven(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && given.trim()) {
                event.preventDefault();
                void send({ given });
              }
            }}
          />
        )}
        {resumed && phase.kind === 'asking' && answered > 0 && (
          <p className="skc-quiet">Picked up where you left off.</p>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    );
  }

  /* The bar along the bottom: what to press now, and the verdict once there
     is one. Tinted by the verdict, the way a check reads at a glance. */
  let bar: React.ReactNode = null;
  if (question && check && phase.kind === 'asking') {
    bar = (
      <div className="skc-bar">
        <button type="button" className="skc-link" disabled={busy} onClick={() => void send({ skip: true })}>
          Show me the answer
        </button>
        <button
          type="button"
          className="skc-btn is-primary"
          disabled={busy || !given.trim()}
          onClick={() => void send({ given })}
        >
          Check
        </button>
      </div>
    );
  } else if (question && check && phase.kind === 'revealed') {
    bar = (
      <div className="skc-bar is-reveal">
        <div className="skc-verdict">
          <strong>Here's the worked answer</strong>
          <p className="skc-answer">{phase.answer}</p>
          <span>Did yours match?</span>
        </div>
        <div className="skc-actions">
          <button type="button" className="skc-btn is-miss" disabled={busy} onClick={() => void send({ given, mark: 'wrong' })}>
            No, I missed it
          </button>
          <button type="button" className="skc-btn is-primary" disabled={busy} onClick={() => void send({ given, mark: 'right' })}>
            Yes, I got it
          </button>
        </div>
      </div>
    );
  } else if (question && check && phase.kind === 'graded') {
    const last = Boolean(final) || check.finished;
    bar = (
      <div className={`skc-bar ${phase.right ? 'is-right' : 'is-wrong'}`} role="status">
        <div className="skc-verdict">
          <strong>
            {phase.right
              ? phase.how === 'self'
                ? 'Nice, that counts.'
                : 'Correct!'
              : phase.how === 'skipped'
                ? "Here's how it goes."
                : 'Not quite.'}
          </strong>
          {(!phase.right || phase.how === 'auto') && (
            <p className="skc-answer">
              {phase.right ? 'The answer is ' : 'The answer: '}
              {phase.answer}
            </p>
          )}
        </div>
        <button type="button" ref={next} className="skc-btn is-primary" onClick={goOn}>
          {last ? 'See results' : 'Next question'}
        </button>
      </div>
    );
  }

  return createPortal(
    <div className="skc" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="skc-head">
        <button type="button" className="skc-close" aria-label="Close the check" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <div className="skc-title">
          <span className="skc-kicker">Skill check</span>
          <h2 id={titleId}>{nodeName}</h2>
        </div>
        <span className="skc-count">
          {check && question && phase.kind !== 'done' && phase.kind !== 'loading' ? `${question.index + 1} of ${asked}` : ''}
        </span>
      </header>

      {check && phase.kind !== 'done' && (
        <ol className="skc-dots" aria-label={`${answered} of ${asked} answered`}>
          {check.questions.map((one) => (
            <li
              key={one.index}
              className={
                one.result
                  ? one.result.right
                    ? 'is-right'
                    : 'is-wrong'
                  : one.index === question?.index
                    ? 'is-now'
                    : ''
              }
            >
              <span className="skc-sr">
                Question {one.index + 1}: {one.result ? (one.result.right ? 'right' : 'missed') : 'not answered'}
              </span>
            </li>
          ))}
        </ol>
      )}

      <main className="skc-main">
        {check && phase.kind !== 'done' && phase.kind !== 'loading' && phase.kind !== 'failed' && (
          <p className="skc-need">
            Get {check.need} of {asked} right to master it.
          </p>
        )}
        {body}
      </main>

      {bar}
    </div>,
    document.body,
  );
}

function Results({
  check,
  opened,
  onAgain,
  onClose,
}: {
  check: Check;
  opened: { id: string; name: string }[];
  onAgain: () => void;
  onClose: () => void;
}) {
  const passed = Boolean(check.passed);
  return (
    <div className={`skc-card skc-results ${passed ? 'is-passed' : 'is-not-yet'}`}>
      <div className="skc-score" aria-hidden="true">
        <b>{check.correct}</b>
        <span>of {check.asked}</span>
      </div>
      <h3>{passed ? `You mastered ${check.node_name}!` : 'Not yet.'}</h3>
      <p className="skc-note">
        {passed
          ? `${check.correct} of ${check.asked} right. The tile is lit on your tree.`
          : `${check.correct} of ${check.asked} right, and you need ${check.need} to pass. Every answer still counts toward your level on each step.`}
      </p>
      {passed && opened.length > 0 && (
        <p className="skc-opened">
          That opened{' '}
          {opened.map((node, at) => (
            <span key={node.id}>
              {at > 0 && (at === opened.length - 1 ? ' and ' : ', ')}
              <b>{node.name}</b>
            </span>
          ))}
          .
        </p>
      )}
      <ol className="skc-review">
        {check.questions.map((question) => (
          <li key={question.index} className={question.result?.right ? 'is-right' : 'is-wrong'}>
            <span className="skc-review-mark" aria-hidden="true">
              {question.result?.right ? '✓' : '✗'}
            </span>
            <div>
              <p className="skc-review-prompt">{question.prompt}</p>
              {question.result && (
                <p className="skc-review-answer">
                  {question.result.given && question.result.how !== 'skipped' ? (
                    <>
                      You said <i>{question.result.given}</i>.{' '}
                    </>
                  ) : null}
                  Answer: {question.result.answer}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="skc-actions">
        {!passed && (
          <button type="button" className="skc-btn" onClick={onAgain}>
            Try a new check
          </button>
        )}
        <button type="button" className="skc-btn is-primary" onClick={onClose}>
          Back to the tree
        </button>
      </div>
    </div>
  );
}

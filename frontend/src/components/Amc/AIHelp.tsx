/**
 * The AI's help on a problem page (backend/api/amc_ai.py):
 *
 * - Hint, up to three, each stronger than the last and none giving the answer.
 *   Shown only before the problem is answered.
 * - Explain my mistake, after a wrong answer: the likely misstep that leads to
 *   the answer given, and a habit that would have caught it.
 * - More like this: a new problem on the same topic and technique at the same
 *   rating, kept only if an independent second solve agrees with its answer.
 *
 * Hidden entirely when no model key is set.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MathText } from './MathText';
import { useApi } from '@/hooks';
import { amc, type Explanation } from '@/services/amc';

export function AIHelp({ problemId, answered, wrong }: { problemId: string; answered: boolean; wrong: boolean }) {
  const navigate = useNavigate();
  const { data: status } = useApi(() => amc.aiStatus(), []);
  const [hints, setHints] = useState<string[]>([]);
  const [explained, setExplained] = useState<Explanation | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  if (!status?.available) return null;

  async function run<T>(what: string, call: () => Promise<{ success: true } & T | { success: false; message: string }>,
                        then: (reply: T) => void) {
    setBusy(what);
    setMessage('');
    try {
      const reply = await call();
      if (reply.success) then(reply as T);
      else setMessage((reply as { message: string }).message);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'The AI did not answer. Try again.');
    } finally {
      setBusy('');
    }
  }

  const nextHint = () => run<{ hint: string }>('hint', () => amc.hint(problemId, hints.length + 1),
    (reply) => setHints((h) => [...h, reply.hint]));
  const explain = () => run<Explanation>('explain', () => amc.explain(problemId), setExplained);
  const more = () => run<{ id: string }>('more', () => amc.createProblem({ like: problemId }),
    (reply) => navigate(`/problems/${reply.id}`));

  return (
    <section className="am-aihelp" aria-label="AI help">
      {!answered && hints.length > 0 && (
        <ol className="am-hints">
          {hints.map((h, i) => <li key={i}><strong>Hint {i + 1}.</strong> <MathText text={h} /></li>)}
        </ol>
      )}
      {explained && (
        <div className="am-callout am-explained">
          <span>Your answer: {explained.given}</span>
          <MathText text={explained.likely_mistake} as="p" />
          <p><strong>Habit:</strong> <MathText text={explained.habit} /></p>
          <MathText text={explained.right_approach} as="p" />
        </div>
      )}
      <div className="am-aihelp-bar">
        {!answered && hints.length < 3 && (
          <button type="button" className="am-btn am-btn-ghost am-btn-sm" disabled={Boolean(busy)} onClick={() => void nextHint()}>
            {busy === 'hint' ? 'Thinking…' : hints.length ? 'Another hint' : 'Hint'}
          </button>
        )}
        {answered && wrong && !explained && (
          <button type="button" className="am-btn am-btn-ghost am-btn-sm" disabled={Boolean(busy)} onClick={() => void explain()}>
            {busy === 'explain' ? 'Looking at your answer…' : 'Explain my mistake'}
          </button>
        )}
        <button type="button" className="am-btn am-btn-ghost am-btn-sm" disabled={Boolean(busy)} onClick={() => void more()}>
          {busy === 'more' ? 'Writing and checking one…' : 'More like this'}
        </button>
        <span className="am-muted" style={{ fontSize: 11 }}>{status.label}</span>
      </div>
      {message && <p className="am-error" style={{ fontSize: 13 }}>{message}</p>}
    </section>
  );
}

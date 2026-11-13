/**
 * A timed mock: one problem at a time, an answer sheet down the side, a
 * countdown at the top. Answers and the start time are kept in this
 * browser's storage, so a reload or an accidental back resumes the same
 * sitting with the same clock. Time running out hands it in.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { MathText } from '@/components/Amc/MathText';
import { AnswerInput, DiagramNote, clock } from '@/components/Amc/bits';
import { useApi, useDocumentTitle } from '@/hooks';
import { amc, announceAmcChanged } from '@/services/amc';
import '@/styles/amc.css';

interface Sitting {
  started: number;
  answers: Record<string, string>;
  flags: number[];
}

const key = (id: string) => `amc-mock:${id}`;

function readSitting(id: string): Sitting | null {
  try {
    const raw = localStorage.getItem(key(id));
    return raw ? (JSON.parse(raw) as Sitting) : null;
  } catch {
    return null;
  }
}

function writeSitting(id: string, sitting: Sitting | null) {
  try {
    if (sitting) localStorage.setItem(key(id), JSON.stringify(sitting));
    else localStorage.removeItem(key(id));
  } catch {
    /* storage blocked: the sitting still works, it just can't resume */
  }
}

export default function TakeMock() {
  const { contestId = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi(() => amc.contest(contestId), [contestId]);
  useDocumentTitle(data ? `${data.contest.name} — in progress` : 'Mock');

  const [sitting, setSitting] = useState<Sitting>(
    () => readSitting(contestId) ?? { started: Date.now(), answers: {}, flags: [] },
  );
  const [at, setAt] = useState(1);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submitted = useRef(false);

  useEffect(() => writeSitting(contestId, sitting), [contestId, sitting]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const minutes = data?.contest.minutes ?? 75;
  const elapsed = Math.floor((now - sitting.started) / 1000);
  const left = minutes * 60 - elapsed;
  const problems = useMemo(() => data?.problems ?? [], [data]);

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setMessage('');
    try {
      const reply = await amc.submit(contestId, sitting.answers, Math.min(elapsed, minutes * 60));
      if (reply.success) {
        writeSitting(contestId, null);
        announceAmcChanged();
        navigate(`/mocks/${reply.id}`, { replace: true });
      } else {
        submitted.current = false;
        setMessage(reply.message);
      }
    } catch (cause) {
      submitted.current = false;
      setMessage(cause instanceof Error ? cause.message : 'Could not hand it in. Try again.');
    } finally {
      setBusy(false);
    }
  }, [contestId, elapsed, minutes, navigate, sitting.answers]);

  // Time is up: hand it in as it stands.
  useEffect(() => {
    if (data && left <= 0 && !submitted.current) void submit();
  }, [data, left, submit]);

  // Arrow keys move between problems; A-E pick a choice.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (event.key === 'ArrowRight') setAt((n) => Math.min(problems.length, n + 1));
      if (event.key === 'ArrowLeft') setAt((n) => Math.max(1, n - 1));
      const p = problems[at - 1];
      const letter = event.key.toUpperCase();
      if (p?.choices && 'ABCDE'.includes(letter) && letter.length === 1 && !event.metaKey && !event.ctrlKey) {
        setSitting((s) => ({ ...s, answers: { ...s.answers, [String(at)]: s.answers[String(at)] === letter ? '' : letter } }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [at, problems]);

  if (loading && !data) return <Loading label="Setting out your paper" />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load this contest.'} onRetry={reload} />;
  if (!data.problems.length) {
    return (
      <div className="amc-page">
        <p>Import this contest before timing it. <Link className="am-link" to={`/contests/${contestId}`}>Back</Link></p>
      </div>
    );
  }

  const p = problems[at - 1];
  const answered = Object.values(sitting.answers).filter(Boolean).length;
  const flagged = sitting.flags.includes(at);
  const setAnswer = (value: string) =>
    setSitting((s) => ({ ...s, answers: { ...s.answers, [String(at)]: value } }));
  const toggleFlag = () =>
    setSitting((s) => ({ ...s, flags: flagged ? s.flags.filter((n) => n !== at) : [...s.flags, at] }));

  const handIn = () => {
    const blank = problems.length - answered;
    const ask = blank
      ? `Hand in now? ${blank} problem${blank === 1 ? ' is' : 's are'} blank.`
      : 'Hand in your answers?';
    if (window.confirm(ask)) void submit();
  };
  const abandon = () => {
    if (!window.confirm('Leave this mock? Your answers will be discarded and nothing is graded.')) return;
    writeSitting(contestId, null);
    navigate(`/contests/${contestId}`);
  };

  return (
    <div className="amc-page">
      <div className="am-exam-top">
        <strong>{data.contest.name}</strong>
        <span className={`am-exam-clock${left < 300 ? ' is-low' : ''}`} aria-live="off" aria-label="Time left">
          {clock(Math.max(0, left))}
        </span>
        <span className="am-muted" style={{ fontSize: 13 }}>{answered}/{problems.length} answered</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="am-btn am-btn-ghost am-btn-sm" onClick={abandon}>Leave</button>
          <button type="button" className="am-btn am-btn-primary am-btn-sm" disabled={busy} onClick={handIn}>
            Hand in
          </button>
        </div>
      </div>
      {message && <p className="am-error">{message}</p>}

      <div className="am-exam">
        <article className="am-card" style={{ padding: 28 }}>
          <p className="am-qnum">Problem {at} of {problems.length}</p>
          {p && (
            <>
              <MathText text={p.statement} as="p" className="am-statement" />
              {p.diagram && <DiagramNote diagram={p.diagram} />}
              <AnswerInput choices={p.choices} value={sitting.answers[String(at)] ?? ''} onChange={setAnswer} />
            </>
          )}
          <div className="am-nav-row">
            <button type="button" className="am-btn" disabled={at === 1} onClick={() => setAt(at - 1)}>← Previous</button>
            <button type="button" className={`am-btn${flagged ? ' am-btn-sage' : ''}`} onClick={toggleFlag}>
              {flagged ? 'Flagged' : 'Flag for later'}
            </button>
            {at < problems.length ? (
              <button type="button" className="am-btn" onClick={() => setAt(at + 1)}>Next →</button>
            ) : (
              <button type="button" className="am-btn am-btn-primary" onClick={handIn}>Hand in</button>
            )}
          </div>
        </article>

        <aside className="am-card am-exam-side">
          <div className="am-card-head"><h2>Answer sheet</h2></div>
          <div className="am-sheet">
            {problems.map((q) => {
              const a = sitting.answers[String(q.number)];
              return (
                <button
                  key={q.number}
                  type="button"
                  className={`${a ? 'is-answered' : ''}${sitting.flags.includes(q.number) ? ' is-flagged' : ''}${q.number === at ? ' is-current' : ''}`}
                  onClick={() => setAt(q.number)}
                  aria-label={`Problem ${q.number}${a ? `, answered ${a}` : ', blank'}`}
                >
                  {q.number}
                  {a && <small>{a}</small>}
                </button>
              );
            })}
          </div>
          <p className="am-muted" style={{ fontSize: 12, lineHeight: 1.5, margin: '12px 0 0' }}>
            ← → to move{p?.choices ? ', A–E to answer' : ''}. Amber underline = flagged.
          </p>
        </aside>
      </div>
    </div>
  );
}

/**
 * A timed contest, laid out like the real one: an instructions page first (the
 * clock starts only on Begin), then one problem at a time with a bubble answer
 * sheet beside it, a countdown, and Hand in. Time running out hands it in.
 *
 * Answers, flags and the start time are kept in this browser's storage, so a
 * reload or an accidental back resumes the same sitting with the same clock.
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

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
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

  const [sitting, setSitting] = useState<Sitting | null>(() => readSitting(contestId));
  const [at, setAt] = useState(1);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submitted = useRef(false);

  useEffect(() => {
    if (sitting) writeSitting(contestId, sitting);
  }, [contestId, sitting]);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const minutes = data?.contest.minutes ?? 75;
  const elapsed = sitting ? Math.floor((now - sitting.started) / 1000) : 0;
  const left = minutes * 60 - elapsed;
  const problems = useMemo(() => data?.problems ?? [], [data]);

  const submit = useCallback(async () => {
    if (submitted.current || !sitting) return;
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
  }, [contestId, elapsed, minutes, navigate, sitting]);

  // Time is up: hand it in as it stands.
  useEffect(() => {
    if (data && sitting && left <= 0 && !submitted.current) void submit();
  }, [data, sitting, left, submit]);

  const setAnswerFor = useCallback((n: number, value: string) => {
    setSitting((s) => (s ? { ...s, answers: { ...s.answers, [String(n)]: value } } : s));
  }, []);

  // Arrow keys move between problems; A-E mark (or clear) a bubble.
  useEffect(() => {
    if (!sitting) return undefined;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (event.key === 'ArrowRight') setAt((n) => Math.min(problems.length, n + 1));
      if (event.key === 'ArrowLeft') setAt((n) => Math.max(1, n - 1));
      const p = problems[at - 1];
      const letter = event.key.toUpperCase();
      if (p?.choices && LETTERS.includes(letter) && !event.metaKey && !event.ctrlKey) {
        setAnswerFor(at, sitting.answers[String(at)] === letter ? '' : letter);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [at, problems, sitting, setAnswerFor]);

  if (loading && !data) return <Loading label="Setting out your paper" />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load this contest.'} onRetry={reload} />;
  if (!data.problems.length) {
    return (
      <div className="amc-page">
        <p>This contest is not in Summit yet. <Link className="am-link" to={`/contests/${contestId}`}>Back</Link></p>
      </div>
    );
  }

  const c = data.contest;
  const aime = c.level === 'AIME';
  const back = c.kind === 'mock' ? '/mock-contests' : `/contests/${contestId}`;

  // The cover page: rules first, clock after.
  if (!sitting) {
    return (
      <div className="amc-page">
        <section className="am-card am-cover">
          <p className="am-kicker">{c.level}{c.kind === 'past' ? ' · Official' : ''}</p>
          <h1>{c.name}</h1>
          <ul className="am-cover-rules">
            <li><strong>{problems.length} problems, {c.minutes} minutes.</strong> The clock starts when you press Begin and keeps running if you leave the page.</li>
            {aime ? (
              <li>Every answer is an integer from 000 to 999. One point each; a wrong answer costs nothing, so answer every problem.</li>
            ) : (
              <li>Each problem has one correct answer. You score 6 for a correct answer, 1.5 for a blank and 0 for a wrong one.</li>
            )}
            <li>No calculators. Scratch paper, a pencil, a ruler and a compass are allowed.</li>
            <li>Problems get harder as you go, as on the real paper. Skip freely and come back; flag the ones to revisit.</li>
            <li>When time runs out your sheet is handed in as it stands. Wrong and blank answers go to Review.</li>
          </ul>
          <div className="am-cover-actions">
            <Link className="am-btn am-btn-ghost" to={back}>Not now</Link>
            <button type="button" className="am-btn am-btn-primary"
                    onClick={() => setSitting({ started: Date.now(), answers: {}, flags: [] })}>
              Begin
            </button>
          </div>
        </section>
      </div>
    );
  }

  const p = problems[at - 1];
  const answered = Object.values(sitting.answers).filter(Boolean).length;
  const flagged = sitting.flags.includes(at);
  const toggleFlag = () =>
    setSitting((s) => (s ? { ...s, flags: flagged ? s.flags.filter((n) => n !== at) : [...s.flags, at] } : s));

  const handIn = () => {
    const blank = problems.length - answered;
    const ask = blank
      ? `Hand in now? ${blank} problem${blank === 1 ? ' is' : 's are'} blank.`
      : 'Hand in your answers?';
    if (window.confirm(ask)) void submit();
  };
  const abandon = () => {
    if (!window.confirm('Leave this contest? Your answers will be discarded and nothing is graded.')) return;
    writeSitting(contestId, null);
    navigate(back);
  };

  return (
    <div className="amc-page">
      <div className="am-exam-top">
        <strong>{c.name}</strong>
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
        <article className="am-card am-exam-paper">
          <p className="am-qnum">Problem {at} of {problems.length}</p>
          {p && (
            <>
              <MathText text={p.statement} as="p" className="am-statement" />
              {p.diagram && <DiagramNote diagram={p.diagram} href={p.aops_url} />}
              <AnswerInput choices={p.choices} value={sitting.answers[String(at)] ?? ''} onChange={(v) => setAnswerFor(at, v)} />
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
          <ol className="am-bubbles" aria-label="Answer sheet">
            {problems.map((q) => {
              const a = sitting.answers[String(q.number)] ?? '';
              const rowClass = `am-bubble-row${q.number === at ? ' is-current' : ''}${sitting.flags.includes(q.number) ? ' is-flagged' : ''}`;
              return (
                <li key={q.number} className={rowClass}>
                  <button type="button" className="am-bubble-num" onClick={() => setAt(q.number)}
                          aria-label={`Go to problem ${q.number}`}>
                    {q.number}
                  </button>
                  {q.choices ? (
                    LETTERS.map((letter) => (
                      <button key={letter} type="button"
                              className={`am-bubble${a === letter ? ' is-filled' : ''}`}
                              aria-pressed={a === letter}
                              aria-label={`Problem ${q.number}, answer ${letter}`}
                              onClick={() => { setAt(q.number); setAnswerFor(q.number, a === letter ? '' : letter); }}>
                        {letter}
                      </button>
                    ))
                  ) : (
                    <button type="button" className={`am-bubble-int${a ? ' is-filled' : ''}`} onClick={() => setAt(q.number)}
                            aria-label={`Problem ${q.number}${a ? `, answered ${a.padStart(3, '0')}` : ', blank'}`}>
                      {a ? a.padStart(3, '0') : '—'}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="am-muted" style={{ fontSize: 12, lineHeight: 1.5, margin: '12px 0 0' }}>
            Fill a bubble to answer, click it again to erase. ← → move{p?.choices ? ', A–E answer' : ''}. Amber = flagged.
          </p>
        </aside>
      </div>
    </div>
  );
}

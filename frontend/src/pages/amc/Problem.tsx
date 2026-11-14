/**
 * One problem: the statement, an answer sheet, a stopwatch, and — once
 * answered or revealed — the solution, the key insight and the trap.
 *
 * `?review=1` is a review session's problem (pages/amc/Review.tsx): the answer
 * is sent as a review, which is what moves it along the 3/10/21-day schedule.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { MathText } from '@/components/Amc/MathText';
import {
  AnswerInput,
  clock,
  DiagramNote,
  Difficulty,
  ProblemRow,
  Solution,
  StatusPill,
  useStopwatch,
} from '@/components/Amc/bits';
import { useApi, useDocumentTitle } from '@/hooks';
import { amc, announceAmcChanged, shortDate, type AttemptReply, type Problem as ProblemData } from '@/services/amc';
import '@/styles/amc.css';

const STAGES = 3;

export function ReviewStage({ stage }: { stage: number }) {
  return (
    <span className="am-stage" title={`Stage ${Math.min(stage, STAGES)} of ${STAGES}`}>
      {Array.from({ length: STAGES }, (_, i) => <i key={i} className={i < stage ? 'on' : ''} />)}
    </span>
  );
}

export default function Problem() {
  const { problemId = '' } = useParams();
  const [params] = useSearchParams();
  const reviewing = params.get('review') === '1';
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi(() => amc.problem(problemId), [problemId]);
  useDocumentTitle(data ? data.problem.sources[0] ? `${data.problem.sources[0].name} #${data.problem.sources[0].number}` : 'Problem' : 'Problem');

  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<AttemptReply | null>(null);
  const [revealed, setRevealed] = useState<ProblemData | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(false);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  // A fresh slate per problem.
  useEffect(() => {
    setAnswer('');
    setResult(null);
    setRevealed(null);
    setMessage('');
    setRetry(false);
  }, [problemId]);
  useEffect(() => {
    setNote(data?.review?.note ?? '');
  }, [data?.review?.note]);

  const answered = Boolean(result || revealed);
  // A problem answered before shows its solution, unless the reader asks to
  // try it again (or it is a review, which is always a fresh try).
  const seenBefore = Boolean(data?.attempts.length) && !reviewing && !retry && !answered;
  const locked = answered || seenBefore;
  const [seconds, setSeconds] = useStopwatch(!locked && !loading);
  useEffect(() => setSeconds(0), [problemId, retry, setSeconds]);

  if (loading && !data) return <Loading label="Loading problem" />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load this problem.'} onRetry={reload} />;

  const p = result?.problem ?? revealed ?? data.problem;
  const source = p.sources[0];

  async function submit() {
    if (!answer || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const reply = await amc.attempt(problemId, answer, seconds, reviewing ? 'review' : 'practice');
      if (reply.success) {
        setResult(reply);
        announceAmcChanged();
        reload();
      } else {
        setMessage(reply.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    setBusy(true);
    try {
      const reply = await amc.reveal(problemId);
      if (reply.success) {
        setRevealed(reply.problem);
        announceAmcChanged();
        reload();
      }
    } finally {
      setBusy(false);
    }
  }

  /** The next problem due for review, or the review page when none is left. */
  async function nextDue() {
    const queue = await amc.review();
    const next = queue.success ? queue.due.find((item) => item.id !== problemId) : undefined;
    navigate(next ? `/problems/${next.id}?review=1` : '/review');
  }

  async function toggleReview() {
    if (data?.review?.review_status === 'active') await amc.removeReview(problemId);
    else await amc.addReview(problemId);
    announceAmcChanged();
    reload();
  }

  async function saveNote() {
    const reply = await amc.noteReview(problemId, note);
    if (reply.success) {
      setNoteSaved(true);
      window.setTimeout(() => setNoteSaved(false), 1600);
    }
  }

  const last = data.attempts[data.attempts.length - 1];
  const given = result?.given ?? (seenBefore ? last?.answer : undefined);
  const showKey = result != null || revealed != null || seenBefore;

  return (
    <div className="amc-page">
      <nav className="am-muted" style={{ fontSize: 13, marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Link to={reviewing ? '/review' : '/problems'} className="am-link">
          {reviewing ? '← Review' : '← Problems'}
        </Link>
        <span>/</span>
        <Link to={`/topics/${p.topic}`} className="am-link">{p.topic_name}</Link>
      </nav>

      <div className="am-grid am-grid-main">
        <div className="am-stack">
          <article className="am-card" style={{ padding: 28 }}>
            <div className="am-problem-meta">
              <span className="am-tag">{source ? `${source.name} #${source.number}` : `${p.level} drill`}</span>
              <Link className="am-tag" to={`/topics/${p.topic}`}>{p.topic_name}</Link>
              {p.also.map((t) => <Link key={t.id} className="am-tag" to={`/topics/${t.id}`}>{t.name}</Link>)}
              <span className="am-tag"><Difficulty value={p.difficulty} rating={p.rating} /></span>
              {p.official && <span className="am-tag">Official</span>}
              <StatusPill status={data.status} />
            </div>

            <MathText text={p.statement} as="p" className="am-statement" />
            {p.diagram && <DiagramNote diagram={p.diagram} href={p.aops_url} />}

            <AnswerInput
              choices={p.choices}
              value={showKey && !answer ? given ?? '' : answer}
              onChange={setAnswer}
              locked={locked}
              correct={showKey ? p.answer : undefined}
              given={showKey ? given : undefined}
              onSubmit={() => void submit()}
              autoFocus
            />

            {!locked && (
              <div className="am-answer-bar">
                <span className="am-timer" aria-label="Time on this problem">{clock(seconds)}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="am-btn am-btn-ghost" disabled={busy} onClick={() => void reveal()}>
                    {p.official ? 'Show answer' : 'Show solution'}
                  </button>
                  <button type="button" className="am-btn am-btn-primary" disabled={!answer || busy}
                          onClick={() => void submit()}>
                    Check answer
                  </button>
                </div>
              </div>
            )}
            {message && <p className="am-error">{message}</p>}

            {result && (
              <div className={`am-verdict ${result.correct ? 'is-right' : 'is-wrong'}`} role="status">
                {result.correct ? 'Correct.' : 'Not quite.'}
                <span>
                  {result.correct
                    ? result.moved && result.review
                      ? result.review.status === 'mastered'
                        ? 'Mastered. It leaves your review log.'
                        : `Next review ${shortDate(result.review.due)}.`
                      : `Solved in ${clock(seconds)}.`
                    : `The answer is ${p.format === 'choice' ? `(${p.answer})` : p.answer}. You'll see it again ${result.review ? shortDate(result.review.due) : 'later'}.`}
                </span>
              </div>
            )}
            {revealed && (
              <div className="am-verdict is-wrong" role="status">
                Revealed. <span>Counts as a miss. Back in 3 days.</span>
              </div>
            )}
            {seenBefore && last && (
              <div className={`am-verdict ${last.correct ? 'is-right' : 'is-wrong'}`}>
                {last.correct ? 'You solved this.' : 'You missed this last time.'}
                <span>
                  <button type="button" className="am-btn am-btn-sm" onClick={() => setRetry(true)}>
                    Try it again
                  </button>
                </span>
              </div>
            )}

            {(result || revealed || seenBefore) && (
              p.official ? (
                <p className="am-muted" style={{ margin: '16px 0 0', fontSize: 13, lineHeight: 1.6 }}>
                  Official problem: answer only, no write-up.
                </p>
              ) : (
                <Solution solution={p.solution} insight={p.insight} trap={p.trap} />
              )
            )}

            {reviewing && answered && (
              <div className="am-nav-row">
                <span />
                <button type="button" className="am-btn am-btn-primary" onClick={() => void nextDue()}>
                  Next due review →
                </button>
              </div>
            )}

            <div className="am-nav-row">
              {data.prev ? (
                <button type="button" className="am-btn" onClick={() => navigate(`/problems/${data.prev}`)}>← Previous</button>
              ) : <span />}
              {data.next && (
                <button type="button" className="am-btn" onClick={() => navigate(`/problems/${data.next}`)}>Next →</button>
              )}
            </div>
          </article>
        </div>

        <aside className="am-stack">
          <section className="am-card">
            <div className="am-card-head"><h2>Details</h2></div>
            <dl className="am-kv">
              <dt>Contest</dt><dd>{p.level}</dd>
              <dt>Category</dt><dd>{p.category_name}</dd>
              <dt>Technique</dt><dd><Link className="am-link" to={`/problems?technique=${p.technique}`}>{p.technique_name}</Link></dd>
              <dt>Rating</dt><dd>{p.rating != null ? `${p.rating}/10` : '—'} <span className="am-muted">AoPS scale</span></dd>
              {p.aops_url && (
                <><dt>Solutions</dt><dd><a className="am-link" href={p.aops_url} target="_blank" rel="noreferrer">AoPS wiki ↗</a></dd></>
              )}
              {p.sources.map((s) => (
                <span key={s.contest} style={{ display: 'contents' }}>
                  <dt>Appears in</dt>
                  <dd><Link className="am-link" to={`/contests/${s.contest}`}>{s.name} #{s.number}</Link></dd>
                </span>
              ))}
            </dl>
          </section>

          <section className="am-card">
            <div className="am-card-head">
              <h2>Review log</h2>
              {data.review && <ReviewStage stage={data.review.stage} />}
            </div>
            {data.review ? (
              <>
                <p className="am-muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5 }}>
                  {data.review.review_status === 'mastered'
                    ? 'Mastered.'
                    : `Stage ${data.review.stage} of 3 · next ${shortDate(data.review.due)} · missed ${data.review.misses}×`}
                </p>
                <div className="am-note-box">
                  <textarea className="am-input" placeholder="Why did you miss it?"
                            value={note} onChange={(e) => setNote(e.target.value)} aria-label="Review note" />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <button type="button" className="am-btn am-btn-ghost am-btn-sm" onClick={() => void toggleReview()}>
                      {data.review.review_status === 'active' ? 'Remove from log' : 'Review again'}
                    </button>
                    <button type="button" className="am-btn am-btn-sm" onClick={() => void saveNote()}>
                      {noteSaved ? 'Saved' : 'Save note'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="am-muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5 }}>
                  Misses are added on their own.
                </p>
                <button type="button" className="am-btn am-btn-sm" onClick={() => void toggleReview()}>
                  Add to review
                </button>
              </>
            )}
          </section>

          {data.attempts.length > 0 && (
            <section className="am-card">
              <div className="am-card-head"><h2>Your attempts</h2></div>
              <ul className="am-list">
                {data.attempts.slice(-6).reverse().map((a, i) => (
                  <li key={i}>
                    <span>{shortDate(a.at)} · {a.source}</span>
                    <span className={a.correct ? '' : 'am-muted'} style={{ color: a.correct ? 'var(--am-good)' : undefined }}>
                      {a.source === 'reveal' ? 'revealed' : `${a.answer || '—'} ${a.correct ? '✓' : '✗'}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.related.length > 0 && (
            <section>
              <h2 className="am-h2" style={{ marginBottom: 10 }}>Same topic</h2>
              <div className="am-rows">
                {data.related.map((r) => <ProblemRow key={r.id} problem={r} />)}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

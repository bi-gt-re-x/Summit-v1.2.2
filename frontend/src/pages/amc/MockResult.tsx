/**
 * A graded mock: the score, where the points went (by topic and by stretch of
 * the paper), and every problem with your answer, the key and the solution.
 */
import { Link, useParams } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { MathText } from '@/components/Amc/MathText';
import { DiagramNote, Difficulty, Meter, PageHeader, Solution } from '@/components/Amc/bits';
import { useApi, useDocumentTitle } from '@/hooks';
import { amc, shortDate } from '@/services/amc';
import { clock } from '@/components/Amc/bits';
import '@/styles/amc.css';

export default function MockResult() {
  const { mockId = '' } = useParams();
  const { data, error, loading, reload } = useApi(() => amc.mock(mockId), [mockId]);
  useDocumentTitle(data ? `${data.contest.name} report` : 'Mock report');
  if (loading && !data) return <Loading label="Grading" />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load this report.'} onRetry={reload} />;

  const { result, report, rows, contest } = data;
  const aime = contest.level === 'AIME';
  const fmt = (v: string | number) => (aime ? String(v).padStart(3, '0') : String(v));
  const worst = report.topics.filter((t) => t.lost > 0).slice(0, 6);
  const maxLost = Math.max(1, ...report.bands.map((b) => b.lost));

  return (
    <div className="amc-page">
      <nav className="am-muted" style={{ fontSize: 13, marginBottom: 12 }}>
        <Link to={`/contests/${contest.id}`} className="am-link">← {contest.name}</Link>
      </nav>
      <PageHeader kicker={`${contest.level} · ${shortDate(result.at)}`} title={contest.name}
                  actions={
                    <>
                      <Link className="am-btn" to="/review">Review misses</Link>
                      <Link className="am-btn am-btn-primary" to={`/contests/${contest.id}/take`}>Sit it again</Link>
                    </>
                  } />

      <div className="am-grid am-grid-3" style={{ marginBottom: 16 }}>
        <section className="am-card">
          <span className="am-kicker">Score</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="am-big">{result.score}</span>
            <span className="am-muted">/ {result.max}</span>
          </div>
          <p className="am-muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
            {result.correct} right · {result.wrong} wrong · {result.blank} blank · {clock(result.seconds)} used
          </p>
        </section>
        <section className="am-card">
          <span className="am-kicker">Points lost by position</span>
          <div className="am-bars" style={{ marginTop: 8 }}>
            {report.bands.map((b) => (
              <div key={b.label} className="am-bar-row">
                <span>{b.label}</span>
                <span className="am-muted" style={{ fontSize: 12 }}>{b.correct}/{b.total} · −{b.lost}</span>
                <Meter value={b.lost / maxLost} tone="bad" />
              </div>
            ))}
          </div>
        </section>
        <section className="am-card">
          <span className="am-kicker">Costliest topics</span>
          {worst.length ? (
            <ul className="am-list" style={{ marginTop: 8 }}>
              {worst.map((t) => (
                <li key={t.topic}>
                  <Link className="am-link" style={{ color: 'var(--am-ink)', fontWeight: 500 }} to={`/topics/${t.topic}`}>{t.name}</Link>
                  <span className="am-muted">−{t.lost} · {t.correct}/{t.total}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: '8px 0 0' }}>Perfect paper.</p>
          )}
        </section>
      </div>

      <section className="am-card">
        <div className="am-card-head"><h2>Problem by problem</h2></div>
        {rows.map((r) => (
          <div key={r.number} className="am-result-row">
            <span className="am-result-num">{r.number}</span>
            <div style={{ minWidth: 0 }}>
              <div className="am-row-head" style={{ marginBottom: 6 }}>
                <Link className="am-link" to={`/problems/${r.problem_id}`}>{r.topic_name}</Link>
                <Difficulty value={r.difficulty} rating={r.rating} />
              </div>
              <MathText text={r.statement} as="p" className="am-statement" />
              {r.diagram && <DiagramNote diagram={r.diagram} />}
              {r.solution && (
                <details>
                  <summary>Solution</summary>
                  <Solution solution={r.solution} insight={r.insight} trap={r.trap} />
                </details>
              )}
            </div>
            <div style={{ textAlign: 'right', display: 'grid', gap: 4, justifyItems: 'end' }}>
              <span className={`am-pill ${r.result === 'correct' ? 'am-pill-solved' : r.result === 'wrong' ? 'am-pill-missed' : ''}`}>
                {r.result === 'correct' ? 'Right' : r.result === 'wrong' ? 'Wrong' : 'Blank'}
              </span>
              <span className="am-muted" style={{ fontSize: 12 }}>
                You: {r.given ? fmt(r.given) : '—'} · Key: {fmt(r.answer)}
              </span>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

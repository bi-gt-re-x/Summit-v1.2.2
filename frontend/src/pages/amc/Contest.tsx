/**
 * One contest. A Step Mock shows its format, your past sittings, and the
 * button that starts the clock. An official paper links to its problems and
 * answer key and takes the score you got.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { CategoryDot, Difficulty, PageHeader } from '@/components/Amc/bits';
import { useApi, useDocumentTitle } from '@/hooks';
import { amc, announceAmcChanged, shortDate, type MockBrief } from '@/services/amc';
import '@/styles/amc.css';

function History({ rows, onDelete }: { rows: MockBrief[]; onDelete: (id: string) => void }) {
  if (!rows.length) return <p className="am-muted" style={{ margin: 0, fontSize: 13 }}>No sittings yet.</p>;
  return (
    <table className="am-table">
      <thead><tr><th>Date</th><th className="num">Score</th><th /></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.kind === 'mock' ? <Link to={`/mocks/${r.id}`}>{shortDate(r.at)}</Link> : shortDate(r.at)}
              {r.note && <div className="am-muted" style={{ fontSize: 12 }}>{r.note}</div>}</td>
            <td className="num">{r.score}{r.kind === 'mock' ? ` (${r.correct}✓ ${r.wrong}✗ ${r.blank}–)` : ''}</td>
            <td className="num">
              <button type="button" className="am-btn am-btn-ghost am-btn-sm" onClick={() => onDelete(r.id)}
                      aria-label="Delete this score">✕</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Contest() {
  const { contestId = '' } = useParams();
  const { data, error, loading, reload } = useApi(() => amc.contest(contestId), [contestId]);
  useDocumentTitle(data?.contest.name ?? 'Contest');
  const [score, setScore] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');

  if (loading && !data) return <Loading label="Loading contest" />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load this contest.'} onRetry={reload} />;
  const c = data.contest;

  async function remove(id: string) {
    if (!window.confirm('Delete this score? This cannot be undone.')) return;
    await amc.deleteMock(id);
    announceAmcChanged();
    reload();
  }

  async function log() {
    setMessage('');
    const value = Number(score);
    if (!score || Number.isNaN(value)) {
      setMessage('Enter your score.');
      return;
    }
    const reply = await amc.logScore(contestId, value, note);
    if (!reply.success) {
      setMessage(reply.message);
      return;
    }
    setScore('');
    setNote('');
    announceAmcChanged();
    reload();
  }

  if (c.kind === 'past') {
    return (
      <div className="amc-page">
        <nav className="am-muted" style={{ fontSize: 13, marginBottom: 12 }}>
          <Link to="/contests" className="am-link">← Past Contests</Link>
        </nav>
        <PageHeader kicker={`${c.year} · ${c.level}`} title={c.name}
                    actions={
                      <>
                        <a className="am-btn" href={c.answers_url} target="_blank" rel="noreferrer">Answer key ↗</a>
                        <a className="am-btn am-btn-primary" href={c.problems_url} target="_blank" rel="noreferrer">Open problems ↗</a>
                      </>
                    }>
          <p>
            {c.count} problems in {c.minutes} minutes · {c.scoring}. The problems and solutions are on the AoPS
            wiki; take it under real timing, then log your score here to track it beside your mocks.
          </p>
        </PageHeader>
        <div className="am-grid am-grid-2">
          <section className="am-card">
            <div className="am-card-head"><h2>Log a score</h2></div>
            <div className="am-form">
              <label className="am-field">
                <span>Score (out of {c.max})</span>
                <input className="am-input" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)}
                       placeholder={c.level === 'AIME' ? 'e.g. 7' : 'e.g. 103.5'} />
              </label>
              <label className="am-field">
                <span>Note</span>
                <input className="am-input" value={note} onChange={(e) => setNote(e.target.value)}
                       placeholder="Timed? Which ones cost you?" maxLength={300} />
              </label>
              <button type="button" className="am-btn am-btn-primary" onClick={() => void log()}>Save score</button>
            </div>
            {message && <p className="am-error">{message}</p>}
          </section>
          <section className="am-card">
            <div className="am-card-head"><h2>Your scores</h2></div>
            <History rows={data.history} onDelete={(id) => void remove(id)} />
          </section>
        </div>
      </div>
    );
  }

  const problems = data.problems ?? [];
  return (
    <div className="amc-page">
      <nav className="am-muted" style={{ fontSize: 13, marginBottom: 12 }}>
        <Link to="/contests" className="am-link">← Past Contests</Link>
      </nav>
      <PageHeader kicker={`${c.level} · Step Mock`} title={c.name}
                  actions={<Link className="am-btn am-btn-primary" to={`/contests/${c.id}/take`}>Start timed mock</Link>}>
        <p>{c.blurb} {c.count} problems, {c.minutes} minutes, {c.scoring}.</p>
      </PageHeader>
      <div className="am-grid am-grid-main">
        <section className="am-card">
          <div className="am-card-head">
            <h2>What's on it</h2>
            <span className="am-muted" style={{ fontSize: 13 }}>Statements stay hidden until you start</span>
          </div>
          <table className="am-table">
            <thead><tr><th>#</th><th>Topic</th><th>Technique</th><th className="num">Difficulty</th></tr></thead>
            <tbody>
              {problems.map((p) => (
                <tr key={p.number}>
                  <td>{p.number}</td>
                  <td><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><CategoryDot category={p.category} />{p.topic_name}</span></td>
                  <td className="am-muted">{p.technique_name}</td>
                  <td className="num"><Difficulty value={p.difficulty} label={false} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <aside className="am-stack">
          <section className="am-card">
            <div className="am-card-head"><h2>Before you start</h2></div>
            <ul className="am-list" style={{ display: 'grid', gap: 8 }}>
              <li>Find {c.minutes} quiet minutes. The clock keeps running if you leave the page.</li>
              <li>Scrap paper and pencil only — no calculator.</li>
              {c.level !== 'AIME' && <li>Leave a problem blank unless you'd bet on your answer: blanks are worth 1.5.</li>}
              <li>Wrong and blank answers go to your review log.</li>
            </ul>
          </section>
          <section className="am-card">
            <div className="am-card-head"><h2>Your sittings</h2></div>
            <History rows={data.history} onDelete={(id) => void remove(id)} />
          </section>
        </aside>
      </div>
    </div>
  );
}

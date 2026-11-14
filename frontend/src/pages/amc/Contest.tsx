/**
 * One contest. A Step Mock shows its format, your past sittings, and the
 * button that starts the clock. An imported official paper is shown whole, in
 * problem order like its AoPS wiki page, each problem with its choices, topic,
 * 1-10 rating and links to answer it here or read the AoPS solutions.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { CategoryDot, DiagramNote, Difficulty, PageHeader, StatusPill } from '@/components/Amc/bits';
import { MathText } from '@/components/Amc/MathText';
import { Importer } from '@/components/Amc/Importer';
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

  const logCard = c.kind === 'past' && (
    <section className="am-card">
      <div className="am-card-head"><h2>Took it on paper?</h2></div>
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
        <button type="button" className="am-btn" onClick={() => void log()}>Log score</button>
      </div>
      {message && <p className="am-error">{message}</p>}
    </section>
  );

  async function unimport() {
    if (!window.confirm('Remove this contest from Summit for every account? Answers already given are kept.')) return;
    await amc.removeImport(contestId);
    announceAmcChanged();
    reload();
  }

  const back = (
    <nav className="am-muted" style={{ fontSize: 13, marginBottom: 12 }}>
      {c.kind === 'mock'
        ? <Link to="/mock-contests" className="am-link">← Mock Contests</Link>
        : <Link to="/contests" className="am-link">← Past Contests</Link>}
    </nav>
  );

  // An official paper nobody has brought in yet: the importer, and a place to
  // log a score taken elsewhere.
  if (c.kind === 'past' && !c.imported) {
    return (
      <div className="amc-page">
        {back}
        <PageHeader kicker={`${c.year} · ${c.level}`} title={c.name}>
          <p>
            {c.count} problems in {c.minutes} minutes.{data.can_import ? ' Import it once to practice it here.' : ''}
          </p>
        </PageHeader>
        <div className="am-grid am-grid-main">
          {data.can_import ? (
            <Importer contest={{ ...c, imported: 0 }} onSaved={reload} />
          ) : (
            <section className="am-card">
              <div className="am-card-head"><h2>Not in Summit yet</h2></div>
              <p className="am-muted" style={{ margin: 0 }}>
                This paper hasn't been brought in yet. Read it on the{' '}
                <a className="am-link" href={c.problems_url} target="_blank" rel="noreferrer">AoPS wiki ↗</a>
                {' '}and log your score here.
              </p>
            </section>
          )}
          <aside className="am-stack">
            {logCard}
            <section className="am-card">
              <div className="am-card-head"><h2>Your scores</h2></div>
              <History rows={data.history} onDelete={(id) => void remove(id)} />
            </section>
          </aside>
        </div>
      </div>
    );
  }

  const problems = data.problems;
  const official = c.kind === 'past';
  const firstOpen = problems.find((p) => p.status === 'new') ?? problems[0];
  return (
    <div className="amc-page">
      {back}
      <PageHeader
        kicker={official ? `${c.year} · ${c.level} · Official` : `${c.level} · ${c.family === 'summit' ? 'Summit Mock' : 'Step Mock'}`}
        title={c.name}
        actions={
          <>
            {firstOpen && (
              <Link className="am-btn" to={`/problems/${firstOpen.id}`}>Practice one by one</Link>
            )}
            <Link className="am-btn am-btn-primary" to={`/contests/${c.id}/take`}>
              {official ? 'Start timed contest' : 'Start timed mock'}
            </Link>
          </>
        }
      >
        <p>
          {official ? `${c.count} problems in ${c.minutes} minutes.` : c.blurb}
        </p>
      </PageHeader>
      <div className="am-grid am-grid-main">
        <section className="am-card">
          <div className="am-card-head">
            <h2>{official ? 'Problems' : "What's on it"}</h2>
            <span className="am-muted" style={{ fontSize: 13 }}>
              {official ? (
                <>
                  <a className="am-link" href={c.problems_url} target="_blank" rel="noreferrer">AoPS page ↗</a>
                  {' · '}
                  <a className="am-link" href={c.answers_url} target="_blank" rel="noreferrer">Answer key ↗</a>
                </>
              ) : 'Hidden until you start'}
            </span>
          </div>
          {official ? (
            <ol className="am-booklet">
              {problems.map((p) => (
                <li key={p.number} id={`problem-${p.number}`} className="am-booklet-item">
                  <div className="am-booklet-head">
                    <h3><Link to={`/problems/${p.id}`}>Problem {p.number}</Link></h3>
                    <span className="am-booklet-tags">
                      <CategoryDot category={p.category} />
                      <Link className="am-muted" to={`/topics/${p.topic}`}>{p.topic_name}</Link>
                      <Difficulty value={p.difficulty} rating={p.rating} />
                      <StatusPill status={p.status} />
                    </span>
                  </div>
                  <MathText text={p.statement} as="p" className="am-statement" />
                  {p.diagram && <DiagramNote diagram={p.diagram} href={p.aops_url} />}
                  {p.choices && (
                    <p className="am-booklet-choices">
                      {p.choices.map((choice, i) => (
                        <span key={i}><strong>({'ABCDE'.charAt(i)})</strong> <MathText text={choice} /></span>
                      ))}
                    </p>
                  )}
                  <p className="am-booklet-links">
                    <Link className="am-link" to={`/problems/${p.id}`}>Answer it here</Link>
                    {p.aops_url && (
                      <a className="am-link" href={p.aops_url} target="_blank" rel="noreferrer">Solutions on AoPS ↗</a>
                    )}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <div className="am-table-wrap">
              <table className="am-table">
                <thead><tr><th>#</th><th>Topic</th><th>Technique</th><th className="num">Rating</th></tr></thead>
                <tbody>
                  {problems.map((p) => (
                    <tr key={p.number}>
                      <td>{p.number}</td>
                      <td><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><CategoryDot category={p.category} />{p.topic_name}</span></td>
                      <td className="am-muted">{p.technique_name}</td>
                      <td className="num"><Difficulty value={p.difficulty} rating={p.rating} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {official && (
            <p className="am-muted" style={{ fontSize: 12, margin: '12px 0 0' }}>
              Topics are guessed from the wording. Problems © MAA.{' '}
              {data.can_import && (
                <button type="button" className="am-link am-link-button" onClick={() => void unimport()}>Remove import</button>
              )}
            </p>
          )}
        </section>
        <aside className="am-stack">
          <section className="am-card">
            <div className="am-card-head"><h2>Before you start</h2></div>
            <ul className="am-list" style={{ display: 'grid', gap: 8 }}>
              <li>You need {c.minutes} minutes. The clock keeps running if you leave.</li>
              <li>Pencil and paper. No calculator.</li>
              {c.level !== 'AIME' && <li>A blank is worth 1.5, so skip what you can't narrow down.</li>}
              <li>Wrong and blank answers go to Review.</li>
            </ul>
          </section>
          {logCard}
          <section className="am-card">
            <div className="am-card-head"><h2>Your sittings</h2></div>
            <History rows={data.history} onDelete={(id) => void remove(id)} />
          </section>
        </aside>
      </div>
    </div>
  );
}

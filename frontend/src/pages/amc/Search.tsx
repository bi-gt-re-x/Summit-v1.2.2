/**
 * Full search results: problems, topics, contests and pages for every word in
 * the query. The top bar's drop-down shows the first few of each; this page is
 * where "See all results" and Enter go. The query lives in `?q=`.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { Difficulty, Empty, PageHeader } from '@/components/Amc/bits';
import { useApi, useDocumentTitle } from '@/hooks';
import { amc } from '@/services/amc';
import '@/styles/amc.css';

const SUGGESTIONS = ['circles', 'modular arithmetic', 'probability', '2019 AIME', 'Vieta', 'stars and bars', 'AMC 12B'];

function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  if (!words.length) return <>{text}</>;
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return (
    <>
      {text.split(pattern).map((part, i) =>
        i % 2 ? <mark key={i} className="am-hl">{part}</mark> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  useDocumentTitle(q ? `Search: ${q}` : 'Search');
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);
  const { data, error, loading, reload } = useApi(() => amc.search(q, 40), [q], { enabled: q.trim().length > 0 });

  const go = (value: string) => setParams(value.trim() ? { q: value.trim() } : {});
  const total = data ? data.problems.length + data.topics.length + data.contests.length + data.pages.length : 0;

  return (
    <div className="amc-page">
      <PageHeader title="Search">
        <p>Problems, topics and contests.</p>
      </PageHeader>
      <form className="am-search-box" onSubmit={(e) => { e.preventDefault(); go(draft); }}>
        <input className="am-input" type="search" autoFocus placeholder="Try “circles”, “2019 AIME” or “stars and bars”"
               aria-label="Search" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="am-btn am-btn-primary">Search</button>
      </form>

      {!q ? (
        <div className="am-chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="am-chip" onClick={() => go(s)}>{s}</button>
          ))}
        </div>
      ) : loading && !data ? (
        <Loading label="Searching" />
      ) : error || !data ? (
        <ErrorState message={error ?? 'Search failed.'} onRetry={reload} />
      ) : total === 0 ? (
        <Empty title={`Nothing matches “${q}”`}>Try fewer words.</Empty>
      ) : (
        <>
          {data.pages.length > 0 && (
            <section className="am-search-group">
              <h2>Pages</h2>
              <div className="am-chips">
                {data.pages.map((p) => <Link key={p.to} className="am-chip" to={p.to}>{p.name}</Link>)}
              </div>
            </section>
          )}
          {data.topics.length > 0 && (
            <section className="am-search-group">
              <h2>Topics <small className="am-muted" style={{ fontSize: 14 }}>{data.topics.length}</small></h2>
              <div className="am-grid am-grid-3">
                {data.topics.map((t) => (
                  <Link key={t.id} to={`/topics/${t.id}`} className="am-topic">
                    <h3><Highlight text={t.name} query={q} /></h3>
                    <p><Highlight text={t.summary} query={q} /></p>
                    <span className="am-muted" style={{ fontSize: 12 }}>{t.category_name}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {data.problems.length > 0 && (
            <section className="am-search-group">
              <h2>Problems <small className="am-muted" style={{ fontSize: 14 }}>{data.problems.length}</small></h2>
              <div className="am-rows">
                {data.problems.map((p) => (
                  <Link key={p.id} to={`/problems/${p.id}`} className="am-row">
                    <div className="am-row-main">
                      <div className="am-row-head">
                        <strong>{p.source}</strong>
                        <span className="am-muted">{p.topic_name}</span>
                      </div>
                      <p className="am-row-preview"><Highlight text={p.preview} query={q} /></p>
                    </div>
                    <div className="am-row-side"><Difficulty value={p.difficulty} rating={p.rating} label={false} /></div>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {data.contests.length > 0 && (
            <section className="am-search-group">
              <h2>Contests <small className="am-muted" style={{ fontSize: 14 }}>{data.contests.length}</small></h2>
              <div className="am-papers">
                {data.contests.map((c) => (
                  <Link key={c.id} className="am-paper" to={`/contests/${c.id}`}>
                    {c.name}{c.kind === 'mock' && <b>mock</b>}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

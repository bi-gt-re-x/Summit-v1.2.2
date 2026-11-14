/**
 * Topics, two ways: by topic (what a problem is about) and by strategy (what
 * cracks it). Each section lists its problems as rows of pills, coloured by
 * status and easiest first, so any problem is one click away.
 *
 * The view and the filter live in the URL (`?view=strategy&q=...`), and a
 * sticky bar of pills jumps between sections.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { CategoryDot, Meter, PageHeader, PillLegend, ProblemPills } from '@/components/Amc/bits';
import { useApi, useDocumentTitle } from '@/hooks';
import { amc, CATEGORY_TONE, pct } from '@/services/amc';
import '@/styles/amc.css';

type View = 'topic' | 'strategy';

function matches(query: string, ...texts: string[]): boolean {
  const q = query.trim().toLowerCase();
  return !q || texts.some((t) => t.toLowerCase().includes(q));
}

function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Scroll to `#topic-...` / `#tech-...` once the section it names is drawn.
 * Retried a few times: the page's arrival can reset the scroll just after the
 * first render, and a jump made before that is undone.
 */
function useHashJump(ready: boolean) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return undefined;
    const id = decodeURIComponent(hash.slice(1));
    const timers = [80, 350, 800].map((ms) =>
      window.setTimeout(() => {
        const el = document.getElementById(id);
        if (!el) return;
        const top = el.getBoundingClientRect().top;
        if (top < 0 || top > window.innerHeight * 0.4) el.scrollIntoView({ block: 'start' });
      }, ms),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [ready, hash]);
}

function TopicView({ query }: { query: string }) {
  const { data, error, loading, reload } = useApi(() => amc.topics(), []);
  useHashJump(Boolean(data));
  if (loading && !data) return <Loading label="Loading topics" />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load topics.'} onRetry={reload} />;

  const cats = data.categories
    .map((c) => ({ ...c, topics: c.topics.filter((t) => matches(query, t.name, t.summary, c.name)) }))
    .filter((c) => c.topics.length);

  return (
    <>
      <nav className="am-jump" aria-label="Jump to a category">
        {cats.map((c) => (
          <button key={c.id} type="button" className="am-chip" onClick={() => jump(`cat-${c.id}`)}>
            <CategoryDot category={c.id} /> {c.name} <small>{c.solved}/{c.problems}</small>
          </button>
        ))}
        <span className="am-jump-sep" aria-hidden="true" />
        {cats.flatMap((c) => c.topics).map((t) => (
          <button key={t.id} type="button" className="am-chip am-chip-quiet" onClick={() => jump(`topic-${t.id}`)}>
            {t.name}
          </button>
        ))}
      </nav>
      {!cats.length && <p className="am-muted">Nothing matches "{query}".</p>}
      {cats.map((cat) => (
        <section key={cat.id} id={`cat-${cat.id}`} className="am-cat am-anchor">
          <div className="am-cat-head">
            <h2>{cat.name}</h2>
            <p>{cat.blurb}</p>
          </div>
          <div className="am-grid am-grid-2">
            {cat.topics.map((t) => (
              <article key={t.id} id={`topic-${t.id}`} className="am-topic-block am-anchor"
                       style={{ ['--tone' as string]: `var(--am-${CATEGORY_TONE[cat.id]})` }}>
                <div className="am-topic-block-head">
                  <Link to={`/topics/${t.id}`} className="am-topic-block-name">{t.name}</Link>
                  <span className="am-muted">
                    {t.solved}/{t.problems} solved · {pct(t.accuracy)} first try
                  </span>
                </div>
                <p className="am-topic-block-summary">{t.summary}</p>
                <Meter value={t.problems ? t.solved / t.problems : 0} />
                <ProblemPills pills={t.pills ?? []} />
                <div className="am-topic-block-foot">
                  <span className="am-topic-levels">
                    {t.levels.map((l) => <span key={l}>{l.replace('AMC ', '')}</span>)}
                  </span>
                  <Link className="am-link" to={`/topics/${t.id}`}>Open →</Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function StrategyView({ query }: { query: string }) {
  const { data, error, loading, reload } = useApi(() => amc.strategies(), []);
  useHashJump(Boolean(data));
  if (loading && !data) return <Loading label="Loading strategies" />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load strategies.'} onRetry={reload} />;

  const families = data.families
    .map((f) => ({ ...f, techniques: f.techniques.filter((t) => matches(query, t.name, t.idea, f.name)) }))
    .filter((f) => f.techniques.length);

  return (
    <>
      <nav className="am-jump" aria-label="Jump to a strategy">
        {families.map((f) => (
          <button key={f.id} type="button" className="am-chip" onClick={() => jump(`fam-${f.id}`)}>
            <i className={`am-dot am-tone-${f.color}`} aria-hidden="true" /> {f.name} <small>{f.solved}/{f.problems}</small>
          </button>
        ))}
        <span className="am-jump-sep" aria-hidden="true" />
        {families.flatMap((f) => f.techniques).map((t) => (
          <button key={t.id} type="button" className="am-chip am-chip-quiet" onClick={() => jump(`tech-${t.id}`)}>
            {t.name}
          </button>
        ))}
      </nav>
      {!families.length && <p className="am-muted">Nothing matches "{query}".</p>}
      {families.map((f) => (
        <section key={f.id} id={`fam-${f.id}`} className="am-cat am-anchor">
          <div className="am-cat-head">
            <h2>{f.name}</h2>
            <p>{f.blurb}</p>
          </div>
          <div className="am-grid am-grid-2">
            {f.techniques.map((t) => (
              <article key={t.id} id={`tech-${t.id}`} className="am-topic-block am-anchor"
                       style={{ ['--tone' as string]: `var(--am-${f.color})` }}>
                <div className="am-topic-block-head">
                  <Link to={`/problems?technique=${t.id}`} className="am-topic-block-name">{t.name}</Link>
                  <span className="am-muted">{t.solved}/{t.pills.length} solved</span>
                </div>
                <p className="am-topic-block-summary">{t.idea}</p>
                <ProblemPills pills={t.pills} empty="No problems use this yet." />
                {t.topics.length > 0 && (
                  <div className="am-topic-block-foot">
                    <span className="am-muted am-used-in">
                      Used in{' '}
                      {t.topics.map((tp, i) => (
                        <span key={tp.id}>
                          {i > 0 && ', '}
                          <Link className="am-link" to={`/topics/${tp.id}`}>{tp.name}</Link>
                        </span>
                      ))}
                    </span>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
      {data.untagged > 0 && (
        <p className="am-muted" style={{ fontSize: 13 }}>
          {data.untagged} imported problem{data.untagged === 1 ? ' has' : 's have'} no strategy tag yet. Find
          {data.untagged === 1 ? ' it' : ' them'} under By topic.
        </p>
      )}
    </>
  );
}

export default function Topics() {
  useDocumentTitle('Topics');
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'strategy' ? 'strategy' : 'topic';
  const [query, setQuery] = useState(params.get('q') ?? '');

  const setView = (next: View) => {
    const p = new URLSearchParams(params);
    if (next === 'strategy') p.set('view', 'strategy');
    else p.delete('view');
    setParams(p, { replace: true });
  };
  const intro = useMemo(
    () =>
      view === 'topic'
        ? '32 topics in five areas.'
        : 'The same problems, grouped by the method that solves them.',
    [view],
  );

  return (
    <div className="amc-page">
      <PageHeader title="Topics">
        <p>{intro} Each pill is a problem.</p>
      </PageHeader>

      <div className="am-topics-bar">
        <div className="am-seg" role="tablist" aria-label="Organise by">
          <button type="button" role="tab" aria-selected={view === 'topic'} className={view === 'topic' ? 'is-on' : ''}
                  onClick={() => setView('topic')}>By topic</button>
          <button type="button" role="tab" aria-selected={view === 'strategy'} className={view === 'strategy' ? 'is-on' : ''}
                  onClick={() => setView('strategy')}>By strategy</button>
        </div>
        <input className="am-input" type="search" value={query} aria-label="Filter topics and strategies"
               placeholder={view === 'topic' ? 'Filter topics…' : 'Filter strategies…'}
               onChange={(e) => {
                 setQuery(e.target.value);
                 const p = new URLSearchParams(params);
                 if (e.target.value.trim()) p.set('q', e.target.value);
                 else p.delete('q');
                 setParams(p, { replace: true });
               }} />
        <PillLegend />
      </div>

      {view === 'topic' ? <TopicView query={query} /> : <StrategyView query={query} />}
    </div>
  );
}

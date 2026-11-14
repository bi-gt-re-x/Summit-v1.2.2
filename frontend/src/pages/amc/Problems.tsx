/**
 * The problem bank, filterable by contest, category, topic, difficulty,
 * technique and status. Every filter lives in the URL, so a filtered list can
 * be bookmarked, shared, and linked to from the topic pages and the plan.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { Empty, PageHeader, ProblemRow } from '@/components/Amc/bits';
import { useApi, useDocumentTitle } from '@/hooks';
import { amc, type ProblemFilters, type Status } from '@/services/amc';
import '@/styles/amc.css';

const LEVELS = ['AMC 10', 'AMC 12', 'AIME'];
const STATUSES: { id: Status; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'solved', label: 'Solved' },
  { id: 'missed', label: 'Missed' },
  { id: 'review', label: 'In review' },
];
/** The 1-5 difficulty filter, labelled with the AoPS ratings each step covers. */
const DIFFICULTY_CHIPS: [string, string][] = [['1', '1'], ['2', '1.5'], ['3', '2'], ['4', '2.5–3'], ['5', '3.5+']];
const KEYS: (keyof ProblemFilters)[] = ['source', 'level', 'category', 'topic', 'difficulty', 'status', 'technique', 'q', 'sort'];

export default function Problems() {
  useDocumentTitle('Problems');
  const [params, setParams] = useSearchParams();
  const filters: ProblemFilters = {};
  for (const key of KEYS) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  const signature = KEYS.map((k) => filters[k] ?? '').join('|');
  const { data, error, loading, reload } = useApi(() => amc.problems(filters), [signature]);

  const [q, setQ] = useState(filters.q ?? '');
  useEffect(() => setQ(filters.q ?? ''), [filters.q]);
  useEffect(() => {
    const id = window.setTimeout(() => {
      if ((filters.q ?? '') !== q.trim()) set('q', q.trim());
    }, 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function set(key: keyof ProblemFilters, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // A topic belongs to one category; changing the category clears it.
    if (key === 'category') next.delete('topic');
    setParams(next, { replace: true });
  }
  const toggle = (key: keyof ProblemFilters, value: string) => set(key, filters[key] === value ? '' : value);
  const diffs = new Set((filters.difficulty ?? '').split(',').filter(Boolean));
  const toggleDiff = (d: string) => {
    const next = new Set(diffs);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    set('difficulty', [...next].sort().join(','));
  };
  const anyFilter = KEYS.some((k) => k !== 'sort' && filters[k]);

  return (
    <div className="amc-page">
      <PageHeader
        title="Problems"
        actions={anyFilter ? (
          <button type="button" className="am-btn am-btn-ghost" onClick={() => setParams({}, { replace: true })}>
            Clear filters
          </button>
        ) : undefined}
      >
        <p>Step problems have full solutions. Official problems come from papers you import.</p>
      </PageHeader>

      <div className="am-filters">
        <div className="am-filters-row">
          <input className="am-input" type="search" placeholder="Search problem text, topic or technique"
                 aria-label="Search problems" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="am-select" aria-label="Sort" value={filters.sort ?? 'source'}
                  onChange={(e) => set('sort', e.target.value === 'source' ? '' : e.target.value)}>
            <option value="source">Contest order</option>
            <option value="difficulty">Easiest first</option>
            <option value="topic">By topic</option>
          </select>
        </div>
        <div className="am-filters-row">
          <label>Source</label>
          <div className="am-chips">
            <button type="button" className={`am-chip${!filters.source ? ' is-on' : ''}`} onClick={() => set('source', '')}>All</button>
            <button type="button" className={`am-chip${filters.source === 'official' ? ' is-on' : ''}`}
                    onClick={() => toggle('source', 'official')}>
              Official contests {data && <small>{data.official}</small>}
            </button>
            <button type="button" className={`am-chip${filters.source === 'step' ? ' is-on' : ''}`}
                    onClick={() => toggle('source', 'step')}>Step problems</button>
          </div>
        </div>
        {data && data.official === 0 && filters.source === 'official' && (
          <p className="am-muted" style={{ margin: 0, fontSize: 13 }}>
            No official contests imported yet. Open any paper under <Link className="am-link" to="/contests">Past Contests</Link> to bring it in.
          </p>
        )}
        <div className="am-filters-row">
          <label>Contest</label>
          <div className="am-chips">
            {LEVELS.map((l) => (
              <button key={l} type="button" className={`am-chip${filters.level === l ? ' is-on' : ''}`}
                      onClick={() => toggle('level', l)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="am-filters-row">
          <label>Category</label>
          <div className="am-chips">
            {data?.categories.map((c) => (
              <button key={c.id} type="button" className={`am-chip${filters.category === c.id ? ' is-on' : ''}`}
                      onClick={() => toggle('category', c.id)}>{c.name}</button>
            ))}
          </div>
        </div>
        <div className="am-filters-row">
          <label>AoPS rating</label>
          <div className="am-chips">
            {DIFFICULTY_CHIPS.map(([d, text]) => (
              <button key={d} type="button" className={`am-chip${diffs.has(d) ? ' is-on' : ''}`}
                      title={`Rated ${text} on the AoPS competition scale`} onClick={() => toggleDiff(d)}>{text}</button>
            ))}
          </div>
        </div>
        <div className="am-filters-row">
          <label>Status</label>
          <div className="am-chips">
            {STATUSES.map((s) => (
              <button key={s.id} type="button" className={`am-chip${filters.status === s.id ? ' is-on' : ''}`}
                      onClick={() => toggle('status', s.id)}>
                {s.label} {data && <small>{data.counts[s.id]}</small>}
              </button>
            ))}
          </div>
        </div>
        <div className="am-filters-row">
          <label>Topic</label>
          <select className="am-select" aria-label="Topic" value={filters.topic ?? ''}
                  onChange={(e) => set('topic', e.target.value)}>
            <option value="">All topics</option>
            {data?.topics
              .filter((t) => !filters.category || t.category === filters.category)
              .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="am-filters-row">
          <label>Technique</label>
          <select className="am-select" aria-label="Technique" value={filters.technique ?? ''}
                  onChange={(e) => set('technique', e.target.value)}>
            <option value="">All techniques</option>
            {data?.techniques.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {loading && !data ? (
        <Loading label="Loading problems" />
      ) : error || !data ? (
        <ErrorState message={error ?? 'Could not load problems.'} onRetry={reload} />
      ) : (
        <>
          <p className="am-results-head">
            <span>
              {data.problems.length} of {data.total} problems
            </span>
          </p>
          {data.problems.length ? (
            <div className="am-rows">
              {data.problems.map((p) => <ProblemRow key={p.id} problem={p} />)}
            </div>
          ) : (
            <Empty title="No problems match">Loosen a filter, or clear them all.</Empty>
          )}
        </>
      )}
    </div>
  );
}

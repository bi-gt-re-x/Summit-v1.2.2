/**
 * The problem bank, with a chooser down the left: source (Summit Mock sets,
 * Step problems, official papers), contest, mock set, year, problem number,
 * 1-10 rating, topic, technique and status. Every choice lives in the URL, so a
 * filtered list can be bookmarked, shared, and linked to from the topic pages
 * and the plan. On a phone the chooser folds into a "Filters" panel.
 */
import { useEffect, useState, type ReactNode } from 'react';
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
const RATING_STEPS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const KEYS: (keyof ProblemFilters)[] = ['source', 'level', 'mock', 'year', 'number', 'category', 'topic', 'rating',
  'difficulty', 'status', 'technique', 'q', 'sort'];
const SOURCES: { id: string; label: string; kind: 'summit' | 'step' | 'official' | 'ai' }[] = [
  { id: 'summit', label: 'Summit Mock sets', kind: 'summit' },
  { id: 'step', label: 'Step problems', kind: 'step' },
  { id: 'official', label: 'Official papers', kind: 'official' },
  { id: 'ai', label: 'AI practice', kind: 'ai' },
];

/** One group of the chooser: a heading and a list of choices. */
function Group({ title, open = true, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="am-choose-group" open={open}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

function Choice({ on, onClick, children, count, disabled = false }: {
  on: boolean; onClick: () => void; children: ReactNode; count?: number; disabled?: boolean;
}) {
  return (
    <li>
      <button type="button" className={`am-choice-item${on ? ' is-on' : ''}`} aria-pressed={on}
              disabled={disabled} onClick={onClick}>
        <span>{children}</span>
        {count != null && <small>{count}</small>}
      </button>
    </li>
  );
}

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

  // The chooser starts open beside the list, folded on a phone.
  const [wide] = useState(() => typeof window === 'undefined' || window.innerWidth > 860);
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
    // A topic belongs to one category; changing the category clears it. A mock
    // belongs to one contest and one source.
    if (key === 'category') next.delete('topic');
    if (key === 'level' || key === 'source') next.delete('mock');
    if (key === 'source' && value !== 'official') next.delete('year');
    setParams(next, { replace: true });
  }
  const toggle = (key: keyof ProblemFilters, value: string) => set(key, filters[key] === value ? '' : value);
  const ratings = new Set((filters.rating ?? '').split(',').filter(Boolean));
  const toggleRating = (r: string) => {
    const next = new Set(ratings);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    set('rating', [...next].sort((a, b) => Number(a) - Number(b)).join(','));
  };
  const anyFilter = KEYS.some((k) => k !== 'sort' && filters[k]);
  const maxNumber = filters.level === 'AIME' ? 15 : 25;

  const mocks = (data?.mocks ?? []).filter((m) => (!filters.level || m.level === filters.level)
    && (!filters.source || m.family === filters.source));
  const mockName = (id: string) => data?.mocks.find((m) => m.id === id)?.name ?? id;
  const active: [keyof ProblemFilters, string][] = [];
  if (filters.source) active.push(['source', SOURCES.find((s) => s.id === filters.source)?.label ?? filters.source]);
  if (filters.level) active.push(['level', filters.level]);
  if (filters.mock) active.push(['mock', mockName(filters.mock)]);
  if (filters.year) active.push(['year', filters.year]);
  if (filters.number) active.push(['number', `Problem #${filters.number}`]);
  if (filters.rating) active.push(['rating', `Rated ${filters.rating.split(',').join(', ')}`]);
  if (filters.category) active.push(['category', data?.categories.find((c) => c.id === filters.category)?.name ?? filters.category]);
  if (filters.topic) active.push(['topic', data?.topics.find((t) => t.id === filters.topic)?.name ?? filters.topic]);
  if (filters.technique) active.push(['technique', data?.techniques.find((t) => t.id === filters.technique)?.name ?? filters.technique]);
  if (filters.status) active.push(['status', STATUSES.find((s) => s.id === filters.status)?.label ?? filters.status]);
  if (filters.difficulty) active.push(['difficulty', `Difficulty ${filters.difficulty}`]);

  const chooser = data && (
    <div className="am-choose">
      <Group title="Source">
        <ul>
          <Choice on={!filters.source} onClick={() => set('source', '')} count={data.total}>All problems</Choice>
          {SOURCES.map((s) => (
            <Choice key={s.id} on={filters.source === s.id} onClick={() => toggle('source', s.id)} count={data.kinds[s.kind]}>
              {s.label}
            </Choice>
          ))}
        </ul>
      </Group>
      <Group title="Contest">
        <ul>
          <Choice on={!filters.level} onClick={() => set('level', '')}>All contests</Choice>
          {LEVELS.map((l) => <Choice key={l} on={filters.level === l} onClick={() => toggle('level', l)}>{l}</Choice>)}
        </ul>
      </Group>
      {filters.source !== 'official' && (
        <Group title="Mock" open={Boolean(filters.mock || filters.source === 'summit')}>
          <ul className="am-choose-scroll">
            <Choice on={!filters.mock} onClick={() => set('mock', '')}>Any mock</Choice>
            {mocks.map((m) => (
              <Choice key={m.id} on={filters.mock === m.id} onClick={() => toggle('mock', m.id)}>
                {m.family === 'summit' ? `${m.level} · Set ${m.set}` : `${m.level} · Step Mock`}
              </Choice>
            ))}
          </ul>
        </Group>
      )}
      {(filters.source === 'official' || data.years.length > 0) && (
        <Group title="Year" open={Boolean(filters.year)}>
          {data.years.length ? (
            <ul className="am-choose-scroll">
              <Choice on={!filters.year} onClick={() => set('year', '')}>Any year</Choice>
              {data.years.map((y) => (
                <Choice key={y.year} on={filters.year === String(y.year)} count={y.count}
                        onClick={() => toggle('year', String(y.year))}>{y.year}</Choice>
              ))}
            </ul>
          ) : (
            <p className="am-muted am-choose-note">No official papers imported yet.</p>
          )}
        </Group>
      )}
      <Group title="Problem number" open={Boolean(filters.number)}>
        <div className="am-choose-numbers">
          {Array.from({ length: maxNumber }, (_, i) => String(i + 1)).map((n) => (
            <button key={n} type="button" className={`am-choose-num${filters.number === n ? ' is-on' : ''}`}
                    aria-pressed={filters.number === n} onClick={() => toggle('number', n)}>{n}</button>
          ))}
        </div>
      </Group>
      <Group title="Rating (1–10)">
        <div className="am-choose-numbers">
          {RATING_STEPS.map((r) => {
            const n = data.rating_counts[r] ?? 0;
            return (
              <button key={r} type="button" className={`am-choose-num${ratings.has(r) ? ' is-on' : ''}`}
                      aria-pressed={ratings.has(r)} disabled={n === 0 && !ratings.has(r)}
                      title={`Rated ${r}${r === '10' ? '' : ` or ${r}.5`}: ${n} problems`} onClick={() => toggleRating(r)}>{r}</button>
            );
          })}
        </div>
      </Group>
      <Group title="Topic" open={Boolean(filters.topic || filters.category)}>
        <ul className="am-choose-scroll am-choose-tall">
          <Choice on={!filters.topic && !filters.category} onClick={() => { set('category', ''); }}>All topics</Choice>
          {data.categories.map((cat) => (
            <li key={cat.id} className="am-choose-sub">
              <button type="button" className={`am-choice-head${filters.category === cat.id && !filters.topic ? ' is-on' : ''}`}
                      onClick={() => toggle('category', cat.id)}>{cat.name}</button>
              <ul>
                {data.topics.filter((t) => t.category === cat.id).map((t) => (
                  <Choice key={t.id} on={filters.topic === t.id} onClick={() => toggle('topic', t.id)}>{t.name}</Choice>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Group>
      <Group title="Technique" open={Boolean(filters.technique)}>
        <ul className="am-choose-scroll am-choose-tall">
          <Choice on={!filters.technique} onClick={() => set('technique', '')}>All techniques</Choice>
          {data.families.map((f) => (
            <li key={f.id} className="am-choose-sub">
              <span className="am-choice-head is-static">{f.name}</span>
              <ul>
                {f.techniques.map((t) => (
                  <Choice key={t.id} on={filters.technique === t.id} onClick={() => toggle('technique', t.id)}>{t.name}</Choice>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Group>
      <Group title="Status">
        <ul>
          {STATUSES.map((s) => (
            <Choice key={s.id} on={filters.status === s.id} count={data.counts[s.id]} onClick={() => toggle('status', s.id)}>
              {s.label}
            </Choice>
          ))}
        </ul>
      </Group>
    </div>
  );

  return (
    <div className="amc-page">
      <PageHeader title="Problems">
        <p>Every Summit Mock and Step problem, with solutions, and the official papers brought into Summit.</p>
      </PageHeader>

      <div className="am-browse">
        <aside className="am-browse-side" aria-label="Choose problems">
          <details className="am-browse-fold" open={wide}>
            <summary>Filters{active.length ? ` (${active.length})` : ''}</summary>
            {chooser}
          </details>
        </aside>

        <section className="am-browse-main">
          <div className="am-filters-row" style={{ marginBottom: 12 }}>
            <input className="am-input" type="search" placeholder="Search problem text, topic or technique"
                   aria-label="Search problems" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: '1 1 220px' }} />
            <select className="am-select" aria-label="Sort" value={filters.sort ?? 'source'}
                    onChange={(e) => set('sort', e.target.value === 'source' ? '' : e.target.value)}>
              <option value="source">Contest order</option>
              <option value="difficulty">Easiest first</option>
              <option value="hardest">Hardest first</option>
              <option value="topic">By topic</option>
            </select>
          </div>
          {active.length > 0 && (
            <div className="am-active-filters">
              {active.map(([k, label]) => (
                <button key={k} type="button" className="am-chip is-on" onClick={() => set(k, '')}
                        aria-label={`Remove filter ${label}`}>{label} ✕</button>
              ))}
              {anyFilter && (
                <button type="button" className="am-link am-link-button" onClick={() => setParams({}, { replace: true })}>
                  Clear all
                </button>
              )}
            </div>
          )}

          {loading && !data ? (
            <Loading label="Loading problems" />
          ) : error || !data ? (
            <ErrorState message={error ?? 'Could not load problems.'} onRetry={reload} />
          ) : (
            <>
              <p className="am-results-head">
                <span>{data.problems.length} of {data.total} problems</span>
              </p>
              {data.official === 0 && filters.source === 'official' && (
                <p className="am-muted" style={{ fontSize: 13 }}>
                  No official papers are in Summit yet. See <Link className="am-link" to="/contests">Past Contests</Link>.
                </p>
              )}
              {data.problems.length ? (
                <div className="am-rows">
                  {data.problems.map((p) => <ProblemRow key={p.id} problem={p} />)}
                </div>
              ) : (
                <Empty title="No problems match">Loosen a filter, or clear them all.</Empty>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

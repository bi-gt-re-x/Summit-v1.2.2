/**
 * The error log. Every miss — practice, mock, or "show solution" — comes back
 * here after 3 days; a right answer on the day moves it to 10, then 21, then
 * out as mastered, and a wrong one starts it over. "Start review" walks the
 * due ones in order, each opened as a review on the problem page.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { Empty, PageHeader, ProblemRow } from '@/components/Amc/bits';
import { useApi, useDocumentTitle } from '@/hooks';
import { amc, shortDate, type ReviewItem } from '@/services/amc';
import { ReviewStage } from './Problem';
import '@/styles/amc.css';

type Tab = 'due' | 'upcoming' | 'mastered';

function Rows({ items, empty }: { items: ReviewItem[]; empty: { title: string; body: string } }) {
  if (!items.length) return <Empty title={empty.title}>{empty.body}</Empty>;
  return (
    <div className="am-rows">
      {items.map((item) => (
        <div key={item.id}>
          <ProblemRow
            problem={{ ...item }}
            extra={
              <span style={{ display: 'grid', gap: 4, justifyItems: 'end', fontSize: 12 }} className="am-muted">
                <ReviewStage stage={item.stage} />
                {item.review_status === 'mastered' ? 'mastered' : item.overdue ? `overdue · ${shortDate(item.due)}` : `due ${shortDate(item.due)}`}
              </span>
            }
          />
          {item.note && (
            <p className="am-muted" style={{ margin: 0, padding: '0 16px 12px', fontSize: 13, fontStyle: 'italic' }}>
              “{item.note}”
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Review() {
  useDocumentTitle('Review');
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi(() => amc.review(), []);
  const [tab, setTab] = useState<Tab>('due');
  if (loading && !data) return <Loading label="Loading your review log" />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load the review log.'} onRetry={reload} />;

  const max = Math.max(1, ...data.forecast.map((f) => f.count));
  const lists: Record<Tab, ReviewItem[]> = { due: data.due, upcoming: data.upcoming, mastered: data.mastered };

  return (
    <div className="amc-page">
      <PageHeader
        title="Review"
        actions={data.due.length ? (
          <button type="button" className="am-btn am-btn-primary"
                  onClick={() => navigate(`/problems/${data.due[0]?.id ?? ''}?review=1`)}>
            Start review ({data.due.length})
          </button>
        ) : undefined}
      >
        <p>Misses come back after {data.intervals.join(', ')} days. Get one right three times and it's mastered.</p>
      </PageHeader>

      <dl className="am-stats">
        <div className="am-stat"><dt>Due today</dt><dd className="am-stat-value">{data.due.length}</dd></div>
        <div className="am-stat"><dt>Coming up</dt><dd className="am-stat-value">{data.upcoming.length}</dd></div>
        <div className="am-stat"><dt>Mastered</dt><dd className="am-stat-value">{data.mastered.length}</dd></div>
        <div className="am-stat">
          <dt>Most missed</dt>
          <dd className="am-stat-value" style={{ fontSize: 20, lineHeight: 1.2 }}>{data.by_topic[0]?.name ?? '—'}</dd>
        </div>
      </dl>

      <div className="am-grid am-grid-main">
        <div>
          <div className="am-tabs" role="tablist">
            {(['due', 'upcoming', 'mastered'] as Tab[]).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t}
                      className={`am-tab${tab === t ? ' is-on' : ''}`} onClick={() => setTab(t)}>
                {t === 'due' ? 'Due now' : t === 'upcoming' ? 'Upcoming' : 'Mastered'}
                <small>{lists[t].length}</small>
              </button>
            ))}
          </div>
          <Rows
            items={lists[tab]}
            empty={
              tab === 'due'
                ? { title: 'All caught up', body: 'Nothing due today.' }
                : tab === 'upcoming'
                  ? { title: 'Nothing scheduled', body: 'Missed problems show up here.' }
                  : { title: 'Nothing mastered yet', body: 'Problems you get right on all three reviews end up here.' }
            }
          />
        </div>
        <aside className="am-stack">
          <section className="am-card">
            <div className="am-card-head"><h2>Next two weeks</h2></div>
            <div className="am-forecast" aria-label="Reviews due per day for the next 14 days">
              {data.forecast.map((f, i) => (
                <div key={f.date} className={`am-forecast-col${i === 0 ? ' is-today' : ''}`} title={`${shortDate(f.date)}: ${f.count}`}>
                  <i className={f.count ? '' : 'is-empty'} style={{ height: `${Math.max(4, (f.count / max) * 70)}px` }} />
                  <span>{new Date(`${f.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="am-card">
            <div className="am-card-head">
              <h2>By topic</h2>
              <Link to="/problems?status=missed">All misses</Link>
            </div>
            {data.by_topic.length ? (
              <ul className="am-list">
                {data.by_topic.map((t) => <li key={t.name}><span>{t.name}</span><span className="am-muted">{t.count}</span></li>)}
              </ul>
            ) : (
              <p className="am-muted" style={{ margin: 0, fontSize: 13 }}>Nothing yet.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

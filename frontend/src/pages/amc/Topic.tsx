/**
 * One topic: what it covers, the ideas that unlock it, which techniques its
 * problems lean on, how you're doing, and every problem filed under it.
 */
import { Link, useParams } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { MathText } from '@/components/Amc/MathText';
import { Empty, Meter, PageHeader, PillLegend, ProblemPills } from '@/components/Amc/bits';
import { useApi, useDocumentTitle } from '@/hooks';
import { amc, pct } from '@/services/amc';
import '@/styles/amc.css';

export default function Topic() {
  const { topicId = '' } = useParams();
  const { data, error, loading, reload } = useApi(() => amc.topic(topicId), [topicId]);
  useDocumentTitle(data?.topic.name ?? 'Topic');
  if (loading && !data) return <Loading label="Loading topic" />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load this topic.'} onRetry={reload} />;

  const { topic, problems } = data;
  const firstNew = problems.find((p) => p.status === 'new');
  const missed = problems.filter((p) => p.status === 'missed' || p.status === 'review').length;

  return (
    <div className="amc-page">
      <nav className="am-muted" style={{ fontSize: 13, marginBottom: 12 }}>
        <Link to="/topics" className="am-link">← Topics</Link>
      </nav>
      <PageHeader
        kicker={topic.category_name}
        title={topic.name}
        actions={firstNew ? (
          <Link className="am-btn am-btn-primary" to={`/problems/${firstNew.id}`}>Practise</Link>
        ) : undefined}
      >
        <p>{topic.summary} On the {topic.levels.join(', ')}.</p>
      </PageHeader>

      <div className="am-grid am-grid-main">
        <div className="am-stack">
          <section className="am-card">
            <div className="am-card-head"><h2>Ideas</h2></div>
            <ol className="am-ideas">
              {topic.ideas.map((idea) => <li key={idea}><MathText text={idea} /></li>)}
            </ol>
          </section>
          <section className="am-card">
            <div className="am-card-head">
              <h2>Problems by strategy</h2>
              <Link to={`/problems?topic=${topic.id}`}>Open as a list</Link>
            </div>
            <PillLegend />
            {data.by_strategy.length ? (
              <div className="am-strategy-groups">
                {data.by_strategy.map((g) => (
                  <div key={g.id} className="am-strategy-group">
                    <div className="am-strategy-group-head">
                      {g.id === 'official' ? (
                        <strong>{g.name}</strong>
                      ) : (
                        <Link className="am-link" to={`/topics?view=strategy#tech-${g.id}`}>{g.name}</Link>
                      )}
                      <span className="am-muted">{g.idea}</span>
                    </div>
                    <ProblemPills pills={g.pills} />
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="No problems yet" />
            )}
          </section>
        </div>
        <aside className="am-stack">
          <section className="am-card">
            <div className="am-card-head"><h2>Your progress</h2></div>
            <dl className="am-kv">
              <dt>Solved</dt><dd>{topic.solved} of {topic.problems}</dd>
              <dt>First-try accuracy</dt><dd>{pct(topic.accuracy)}</dd>
              <dt>Missed or in review</dt><dd>{missed}</dd>
              <dt>Weight on the contest</dt><dd>{['', 'Occasional', 'Regular', 'Every paper'][topic.weight]}</dd>
            </dl>
            <div style={{ marginTop: 14 }}><Meter value={topic.mastery} /></div>
          </section>
          {data.techniques.length > 0 && (
            <section className="am-card">
              <div className="am-card-head"><h2>Techniques</h2></div>
              <div className="am-chips">
                {data.techniques.map((t) => (
                  <Link key={t.id} className="am-chip" to={`/problems?technique=${t.id}`}>
                    {t.name} <small>{t.count}</small>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section className="am-card">
            <div className="am-card-head"><h2>Related topics</h2></div>
            <ul className="am-list">
              {data.siblings.map((s) => (
                <li key={s.id}><Link className="am-link" style={{ color: 'var(--am-ink)', fontWeight: 500 }} to={`/topics/${s.id}`}>{s.name}</Link></li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

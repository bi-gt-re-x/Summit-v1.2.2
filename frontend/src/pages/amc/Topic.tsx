/**
 * One topic: what it covers, the ideas that unlock it, which techniques its
 * problems lean on, how you're doing, and every problem filed under it.
 */
import { Link, useParams } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { MathText } from '@/components/Amc/MathText';
import { Difficulty, Empty, Meter, PageHeader } from '@/components/Amc/bits';
import { StrategyList } from '@/components/Amc/StrategyList';
import { useApi, useDocumentTitle } from '@/hooks';
import { amc, pct, type NextPick } from '@/services/amc';
import '@/styles/amc.css';

const PICK_LABEL: Record<NextPick['kind'], string> = { retry: 'Retry', next: 'Next step', stretch: 'Stretch' };

function Pick({ pick }: { pick: NextPick }) {
  return (
    <li>
      <Link to={`/problems/${pick.id}`} className={`am-pick is-${pick.kind}`}>
        <span className="am-pick-kind">{PICK_LABEL[pick.kind]}</span>
        <span className="am-pick-body">
          <strong>{pick.short ?? pick.id}</strong> <span className="am-muted">{pick.source}</span>
          <span className="am-pick-why">{pick.reason}</span>
        </span>
        <Difficulty value={pick.difficulty} rating={pick.rating} />
      </Link>
    </li>
  );
}

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
          <Link className="am-btn am-btn-primary" to={`/problems/${firstNew.id}`}>Practice</Link>
        ) : undefined}
      >
        <p>{topic.summary} On the {topic.levels.join(', ')}.</p>
      </PageHeader>

      <div className="am-grid am-grid-main">
        <div className="am-stack">
          {data.next.length > 0 && (
            <section className="am-card">
              <div className="am-card-head"><h2>Do these next</h2></div>
              <ol className="am-picks">
                {data.next.map((p) => <Pick key={p.kind} pick={p} />)}
              </ol>
            </section>
          )}
          <section className="am-card">
            <div className="am-card-head"><h2>Ideas</h2></div>
            {topic.playbook?.length ? (
              <ol className="am-play">
                {topic.playbook.map((m) => (
                  <li key={m.move}>
                    <h3><MathText text={m.move} /></h3>
                    <p className="am-play-when"><span>When</span><MathText text={m.when} /></p>
                    <p className="am-play-example"><span>Example</span><MathText text={m.example} /></p>
                  </li>
                ))}
              </ol>
            ) : (
              <ol className="am-ideas">
                {topic.ideas.map((idea) => <li key={idea}><MathText text={idea} /></li>)}
              </ol>
            )}
            {topic.trap && (
              <div className="am-callout am-play-trap">
                <span>Watch out</span>
                <MathText text={topic.trap} as="p" />
              </div>
            )}
          </section>
          <section className="am-card">
            <div className="am-card-head">
              <h2>Problems by strategy</h2>
              <Link to={`/problems?topic=${topic.id}`}>Open in Problems</Link>
            </div>
            {data.by_strategy.length ? <StrategyList groups={data.by_strategy} /> : <Empty title="No problems yet" />}
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

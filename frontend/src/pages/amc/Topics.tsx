/**
 * The topic map: five categories, thirty-odd topics, each with how much of it
 * is in hand. A topic opens on its key ideas and its problems.
 */
import { Link } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { CategoryDot, Meter, PageHeader } from '@/components/Amc/bits';
import { useApi, useDocumentTitle } from '@/hooks';
import { amc, CATEGORY_TONE, pct } from '@/services/amc';
import '@/styles/amc.css';

export default function Topics() {
  useDocumentTitle('Topics');
  const { data, error, loading, reload } = useApi(() => amc.topics(), []);
  if (loading && !data) return <Loading label="Loading topics" />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load topics.'} onRetry={reload} />;

  return (
    <div className="amc-page">
      <PageHeader kicker="Learn" title="Topics">
        <p>
          The AMC draws on five areas. Algebra dominates the early problems; geometry, number theory and counting take
          over from about #15. Each topic has its key ideas and every problem that uses it.
        </p>
      </PageHeader>

      <div className="am-chips" style={{ marginBottom: 24 }}>
        {data.categories.map((c) => (
          <a key={c.id} className="am-chip" href={`#${c.id}`}>
            <CategoryDot category={c.id} /> {c.name} <small>{c.solved}/{c.problems}</small>
          </a>
        ))}
      </div>

      {data.categories.map((cat) => (
        <section key={cat.id} id={cat.id} className="am-cat">
          <div className="am-cat-head">
            <h2>{cat.name}</h2>
            <p>{cat.blurb}</p>
          </div>
          <div className="am-grid am-grid-3">
            {cat.topics.map((t) => (
              <Link key={t.id} to={`/topics/${t.id}`} className="am-topic"
                    style={{ ['--tone' as string]: `var(--am-${CATEGORY_TONE[cat.id]})` }}>
                <h3>{t.name}</h3>
                <p>{t.summary}</p>
                <Meter value={t.problems ? t.solved / t.problems : 0} />
                <div className="am-topic-foot">
                  <span>{t.solved}/{t.problems} solved · {pct(t.accuracy)} first try</span>
                  <span className="am-topic-levels">
                    {t.levels.map((l) => <span key={l}>{l.replace('AMC ', '')}</span>)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

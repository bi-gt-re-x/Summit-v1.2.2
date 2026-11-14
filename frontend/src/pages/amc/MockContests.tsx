/**
 * Mock Contests: every timed paper this site can grade, by contest.
 *
 * Each contest has five Summit Mock sets, written in real problem order at real
 * difficulty (problem n sits where problem n sits on a real paper; the AMC 12
 * sets share eight problems with their AMC 10, as the real A and B papers do),
 * plus the shorter-ramp Step Mock as a warm-up. A card shows your best score
 * and starts the clock.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { PageHeader } from '@/components/Amc/bits';
import { useApi, useDocumentTitle } from '@/hooks';
import { amc, shortDate, type Level, type MockContest } from '@/services/amc';
import '@/styles/amc.css';

const LEVELS: Level[] = ['AMC 10', 'AMC 12', 'AIME'];

const RANGE: Record<Level, string> = {
  'AMC 10': 'Rated 1 to 4 out of 10, easiest first',
  'AMC 12': 'Rated 1 to 4.5 out of 10, easiest first',
  AIME: 'Rated 2.5 to 6.5 out of 10, easiest first',
};

function MockCard({ m }: { m: MockContest }) {
  const title = m.family === 'summit' ? `Set ${m.set}` : 'Step Mock';
  return (
    <article className={`am-mock${m.family === 'step' ? ' am-mock-step' : ''}`}>
      <span className="am-kicker" style={{ margin: 0 }}>
        {m.family === 'summit' ? m.level : `${m.level} · warm-up`}
      </span>
      <h3>{title}</h3>
      <p className="am-mock-meta">
        <span>{m.count} problems</span>
        <span>{m.minutes} min</span>
        <span>{m.level === 'AIME' ? 'Answers 000–999' : '6 / 1.5 / 0 scoring'}</span>
      </p>
      <div className="am-mock-foot">
        <span className="am-muted" style={{ fontSize: 13 }}>
          {m.attempts ? `Best ${m.best} / ${m.max} · ${m.attempts} sitting${m.attempts === 1 ? '' : 's'}` : 'Not taken yet'}
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          <Link className="am-btn am-btn-ghost am-btn-sm" to={`/contests/${m.id}`}>Details</Link>
          <Link className="am-btn am-btn-primary am-btn-sm" to={`/contests/${m.id}/take`}>Start</Link>
        </span>
      </div>
    </article>
  );
}

export default function MockContests() {
  useDocumentTitle('Mock Contests');
  const { data, error, loading, reload } = useApi(() => amc.contests(), []);
  const [level, setLevel] = useState<'All' | Level>('All');

  if (loading && !data) return <Loading label="Loading mock contests" />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load mock contests.'} onRetry={reload} />;

  const sittings = data.history.filter((h) => data.mocks.some((m) => m.id === h.contest_id));
  const shown = LEVELS.filter((l) => level === 'All' || l === level);

  return (
    <div className="amc-page">
      <PageHeader title="Mock Contests">
        <p>
          Five full sets for each contest, in real problem order at real difficulty, timed and scored like the real
          thing. Your answers go to Review.
        </p>
      </PageHeader>

      <div className="am-seg" role="group" aria-label="Contest" style={{ marginBottom: 20 }}>
        {(['All', ...LEVELS] as const).map((f) => (
          <button key={f} type="button" className={level === f ? 'is-on' : ''} onClick={() => setLevel(f)}>{f}</button>
        ))}
      </div>

      {shown.map((l) => {
        const mocks = data.mocks.filter((m) => m.level === l);
        const sets = mocks.filter((m) => m.family === 'summit');
        const step = mocks.filter((m) => m.family === 'step');
        return (
          <section key={l} className="am-mock-section" aria-labelledby={`mocks-${l}`}>
            <div className="am-mock-section-head">
              <h2 className="am-h2" id={`mocks-${l}`}>{l}</h2>
              <span className="am-muted">{RANGE[l]}</span>
            </div>
            <div className="am-mock-grid">
              {[...sets, ...step].map((m) => <MockCard key={m.id} m={m} />)}
            </div>
          </section>
        );
      })}

      <section className="am-card" style={{ marginTop: 8 }}>
        <div className="am-card-head"><h2>Recent sittings</h2></div>
        {sittings.length ? (
          <table className="am-table">
            <thead><tr><th>Mock</th><th className="num">Score</th><th className="num">Date</th></tr></thead>
            <tbody>
              {sittings.map((h) => (
                <tr key={h.id}>
                  <td><Link to={`/mocks/${h.id}`}>{h.name}</Link></td>
                  <td className="num">{h.score}</td>
                  <td className="num am-muted">{shortDate(h.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="am-muted" style={{ margin: 0, fontSize: 13 }}>No mocks taken yet. Set 1 of your contest is a good start.</p>
        )}
      </section>
    </div>
  );
}

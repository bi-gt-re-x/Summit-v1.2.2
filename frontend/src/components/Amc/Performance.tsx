/**
 * The dashboard's "Recent performance" card: this week against last, the last
 * two weeks day by day, the latest contest scores, and what changed. It
 * replaced a list of the last eight answers, which said what you did but not
 * how it was going.
 */
import { Link } from 'react-router-dom';
import { pct, shortDate, type PerformanceWindow, type RecentPerformance } from '@/services/amc';
import { Columns, Legend } from './Charts';
import { clock } from './bits';

function Delta({ now, before, kind }: { now: number | null; before: number | null; kind: 'pct' | 'count' | 'secs' }) {
  if (now == null || before == null) return null;
  const raw = kind === 'pct' ? Math.round((now - before) * 100) : Math.round(now - before);
  if (!raw) return <span className="am-delta">same</span>;
  // Faster is better for time; more is better for the rest.
  const good = kind === 'secs' ? raw < 0 : raw > 0;
  const text = kind === 'pct' ? `${Math.abs(raw)} pts` : kind === 'secs' ? clock(Math.abs(raw)) : String(Math.abs(raw));
  return (
    <span className={`am-delta ${good ? 'is-up' : 'is-down'}`}>
      {raw > 0 ? '▲' : '▼'} {text}
    </span>
  );
}

function Row({ label, now, before, kind, show }: {
  label: string;
  now: number | null;
  before: number | null;
  kind: 'pct' | 'count' | 'secs';
  show: (v: number | null) => string;
}) {
  return (
    <div className="am-compare-row">
      <dt>{label}</dt>
      <dd><strong>{show(now)}</strong> <Delta now={now} before={before} kind={kind} /></dd>
      <dd className="am-muted">{show(before)}</dd>
    </div>
  );
}

const count = (v: number | null) => (v == null ? '—' : String(v));
const secs = (v: number | null) => (v == null ? '—' : clock(v));

export function Compare({ now, before }: { now: PerformanceWindow; before: PerformanceWindow }) {
  return (
    <dl className="am-compare">
      <div className="am-compare-row am-compare-head" aria-hidden="true">
        <dt />
        <dd>This week</dd>
        <dd>Last week</dd>
      </div>
      <Row label="Answered" now={now.answered} before={before.answered} kind="count" show={count} />
      <Row label="Accuracy" now={now.accuracy} before={before.accuracy} kind="pct" show={pct} />
      <Row label="Time per problem" now={now.avg_seconds} before={before.avg_seconds} kind="secs" show={secs} />
      <Row label="Days practised" now={now.days} before={before.days} kind="count" show={count} />
    </dl>
  );
}

export function RecentPerformanceCard({ data }: { data: RecentPerformance }) {
  const { this_week: now, last_week: before } = data;
  const any = data.days.some((d) => d.answered) || data.mocks.length > 0;
  return (
    <section className="am-card">
      <div className="am-card-head">
        <h2>Recent performance</h2>
        <Link to="/analytics">Analytics</Link>
      </div>
      {!any ? (
        <p className="am-muted" style={{ margin: 0, lineHeight: 1.6 }}>
          Nothing in the last two weeks yet. Answer a few problems and this shows how this week compares with
          last — accuracy, pace, and your latest mock scores.
        </p>
      ) : (
        <div className="am-perf">
          <Compare now={now} before={before} />
          <div>
            <Columns
              caption="Problems answered each day for the last 14 days"
              idle={<>Last 14 days · {now.answered + before.answered} answered</>}
              labelEvery={7}
              points={data.days.map((d) => ({
                key: d.date,
                label: shortDate(d.date),
                value: d.answered,
                part: d.correct,
                tip: `${shortDate(d.date)} · ${d.answered} answered, ${d.correct} right`,
              }))}
            />
            <Legend items={[{ label: 'Right', tone: 'strong' }, { label: 'Answered', tone: 'soft' }]} />
          </div>
          {data.notes.length > 0 && (
            <ul className="am-notes">
              {data.notes.map((n) => (
                <li key={n.text} className={`is-${n.tone}`}>
                  <span aria-hidden="true">{n.tone === 'up' ? '▲' : n.tone === 'down' ? '▼' : '■'}</span>
                  {n.text}
                </li>
              ))}
            </ul>
          )}
          {now.hardest && (
            <p className="am-muted" style={{ margin: 0, fontSize: 13 }}>
              Hardest solved this week:{' '}
              <Link className="am-link" to={`/problems/${now.hardest.id}`}>{now.hardest.short}</Link>, AoPS{' '}
              {now.hardest.rating}.
            </p>
          )}
          {data.mocks.length > 0 && (
            <div className="am-rows">
              {data.mocks.slice(0, 3).map((m) => (
                <Link key={m.id} className="am-row"
                      to={m.kind === 'mock' ? `/mocks/${m.id}` : `/contests/${m.contest_id}`}>
                  <div className="am-row-main">
                    <div className="am-row-head">
                      <strong>{m.name}</strong>
                      <span className="am-muted">{m.kind === 'mock' ? 'Timed mock' : 'Logged score'}</span>
                    </div>
                  </div>
                  <div className="am-row-side">
                    <span className="am-muted" style={{ fontSize: 12 }}>{shortDate(m.at)}</span>
                    <strong>{m.score}{m.max ? ` / ${m.max}` : ''}</strong>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

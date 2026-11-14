/**
 * The dashboard: where signing in lands. Today's plan, the next problem worth
 * doing, a projected score against the goal, how each category is going, and
 * how this week compares with last.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { CategoryDot, Difficulty, Empty, Meter, PageHeader } from '@/components/Amc/bits';
import { RecentPerformanceCard } from '@/components/Amc/Performance';
import { useApi, useDocumentTitle } from '@/hooks';
import { useNametag } from '@/hooks/useNametag';
import {
  amc,
  announceAmcChanged,
  CATEGORY_TONE,
  pct,
  shortDate,
  type Dashboard as DashboardData,
  type Level,
  type TodayItem,
} from '@/services/amc';
import '@/styles/amc.css';

const LEVELS: Level[] = ['AMC 10', 'AMC 12', 'AIME'];
const MAX: Record<Level, number> = { 'AMC 10': 150, 'AMC 12': 150, AIME: 15 };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Check({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" className={`am-check${on ? ' is-on' : ''}`} aria-pressed={on} aria-label={label}
            onClick={onToggle}>
      {on && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round"
             strokeLinejoin="round">
          <path d="m5 12 5 5L20 7" />
        </svg>
      )}
    </button>
  );
}

export function TodayList({ items, onToggle }: { items: TodayItem[]; onToggle: (item: TodayItem) => void }) {
  if (!items.length) {
    return <Empty title="Done for today">Solve any problem to keep your streak.</Empty>;
  }
  return (
    <ul className="am-today">
      {items.map((item) => (
        <li key={item.key} className={item.done ? 'is-done' : ''}>
          <Check on={item.done} onToggle={() => onToggle(item)} label={`Mark "${item.label}" ${item.done ? 'not done' : 'done'}`} />
          <Link className="am-today-label" to={item.to}>{item.label}</Link>
          {item.goal != null && (
            <span className="am-today-progress">{item.progress}/{item.goal}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Projection({ data }: { data: DashboardData }) {
  const [level, setLevel] = useState<Level>(data.target);
  const score = data.projected[level];
  const max = MAX[level];
  const goal = level === data.target ? data.goal : null;
  return (
    <section className="am-card am-proj">
      <div className="am-card-head">
        <h2>Projected score</h2>
        <div className="am-seg" role="group" aria-label="Contest">
          {LEVELS.map((l) => (
            <button key={l} type="button" className={l === level ? 'is-on' : ''} onClick={() => setLevel(l)}>
              {l.replace('AMC ', '')}
            </button>
          ))}
        </div>
      </div>
      <div className="am-proj-score">
        <strong>{score ?? '—'}</strong>
        <span>/ {max} on the {level}</span>
      </div>
      <div className="am-proj-track" aria-hidden="true">
        <i style={{ width: `${((score ?? 0) / max) * 100}%` }} />
        {goal != null && <b style={{ left: `${(goal / max) * 100}%` }} title={`Goal ${goal}`} />}
      </div>
      <div className="am-proj-legend">
        <span>0</span>
        {goal != null && <span>Goal {goal}</span>}
        <span>{max}</span>
      </div>
      <p className="am-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        {score == null
          ? `Answer ${data.projection_min} problems to see this.`
          : 'Based on your first-try accuracy at each difficulty.'}
      </p>
    </section>
  );
}

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const tag = useNametag();
  const { data, error, loading, reload, mutate } = useApi(() => amc.dashboard(), []);

  if (loading && !data) return <Loading label="Loading your dashboard" />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load the dashboard.'} onRetry={reload} />;

  const { stats, plan } = data;

  const toggle = async (item: TodayItem) => {
    const reply = await amc.check(item.key, !item.done);
    if (reply.success && reply.today) {
      const today = reply.today;
      mutate((d) => (d.plan ? { ...d, plan: { ...d.plan, today } } : d));
      announceAmcChanged();
    }
  };

  return (
    <div className="amc-page">
      <PageHeader
        kicker={`${greeting()}, ${tag.name || 'there'}`}
        title={plan ? `${plan.days_left} days to the ${plan.target}` : 'Train for the AMC. Qualify for the AIME.'}
        actions={
          <>
            {stats.due > 0 && (
              <Link className="am-btn" to="/review">Review {stats.due} due</Link>
            )}
            {data.next_problem && (
              <Link className="am-btn am-btn-primary" to={`/problems/${data.next_problem.id}`}>
                Next problem
              </Link>
            )}
          </>
        }
      >
        {plan ? (
          <p>
            Week {plan.week?.number ?? 1} · {plan.week?.phase ?? 'Plan'} · exam on {shortDate(plan.exam_date)}, goal{' '}
            {plan.goal_score}.
          </p>
        ) : (
          <p>Pick a problem to start, or make a study plan.</p>
        )}
      </PageHeader>

      <dl className="am-stats">
        <div className="am-stat">
          <dt>Solved</dt>
          <dd className="am-stat-value">{stats.solved}</dd>
          <dd className="am-stat-hint">of {stats.total} problems</dd>
        </div>
        <div className="am-stat">
          <dt>First-try accuracy</dt>
          <dd className="am-stat-value">{pct(stats.accuracy)}</dd>
          <dd className="am-stat-hint">{stats.attempted} attempted</dd>
        </div>
        <div className="am-stat">
          <dt>Streak</dt>
          <dd className="am-stat-value">{stats.streak}</dd>
          <dd className="am-stat-hint">{stats.streak === 1 ? 'day' : 'days'} in a row</dd>
        </div>
        <div className="am-stat">
          <dt>Due for review</dt>
          <dd className="am-stat-value">{stats.due}</dd>
          <dd className="am-stat-hint">{stats.in_review} in Review</dd>
        </div>
        <div className="am-stat">
          <dt>Mock contests</dt>
          <dd className="am-stat-value">{stats.mocks}</dd>
          <dd className="am-stat-hint">{stats.minutes} min practised</dd>
        </div>
      </dl>

      <div className="am-grid am-grid-main">
        <div className="am-stack">
          <section className="am-card">
            <div className="am-card-head">
              <h2>Today</h2>
              <Link to="/study-plan">{plan ? 'Full plan' : 'Make a plan'}</Link>
            </div>
            {plan ? (
              <TodayList items={plan.today} onToggle={(item) => void toggle(item)} />
            ) : (
              <Empty title="No study plan yet">
                Pick your contest and date to get a weekly plan.
                <br />
                <Link className="am-btn am-btn-primary" to="/study-plan" style={{ marginTop: 12 }}>
                  Make a plan
                </Link>
              </Empty>
            )}
          </section>

          {data.next_problem && (
            <section className="am-card">
              <div className="am-card-head">
                <h2>Up next</h2>
                <Link to={`/topics/${data.next_problem.topic}`}>{data.next_problem.topic_name}</Link>
              </div>
              <p style={{ margin: '0 0 12px', lineHeight: 1.6, color: 'var(--am-body)' }}>{data.next_problem.preview}</p>
              <div className="am-nav-row" style={{ marginTop: 0, alignItems: 'center' }}>
                <span className="am-muted" style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
                  {data.next_problem.source} <Difficulty value={data.next_problem.difficulty} rating={data.next_problem.rating} />
                </span>
                <Link className="am-btn am-btn-sage" to={`/problems/${data.next_problem.id}`}>Solve it</Link>
              </div>
            </section>
          )}

          <RecentPerformanceCard data={data.performance} />
        </div>

        <div className="am-stack">
          <Projection data={data} />

          <section className="am-card">
            <div className="am-card-head">
              <h2>By category</h2>
              <Link to="/topics">Topics</Link>
            </div>
            <div className="am-bars">
              {data.categories.map((c) => (
                <div key={c.id} className="am-bar-row" style={{ ['--tone' as string]: `var(--am-${CATEGORY_TONE[c.id]})` }}>
                  <Link className="am-bar-label" to={`/problems?category=${c.id}`}>
                    <CategoryDot category={c.id} /> {c.name}
                  </Link>
                  <span className="am-muted" style={{ fontSize: 12 }}>
                    {c.solved}/{c.problems} · {pct(c.accuracy)}
                  </span>
                  <Meter value={c.problems ? c.solved / c.problems : 0} />
                </div>
              ))}
            </div>
          </section>

          <section className="am-card">
            <div className="am-card-head">
              <h2>Weakest topics</h2>
            </div>
            <ul className="am-list">
              {data.weakest.map((t) => (
                <li key={t.id}>
                  <Link to={`/topics/${t.id}`} className="am-link" style={{ fontWeight: 500, color: 'var(--am-ink)' }}>
                    {t.name}
                  </Link>
                  <span className="am-muted">{t.accuracy == null ? 'New' : pct(t.accuracy)}</span>
                </li>
              ))}
            </ul>
          </section>

        </div>
      </div>
    </div>
  );
}

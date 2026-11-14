/**
 * Insights: the smart analytics (backend/amc/smart.py) and the AI coach on top.
 *
 * The numbers need no key: an ability estimate on the problems' own 1-10
 * scale, a predicted score with a range and the chance of reaching the goal,
 * topic strengths shrunk toward that estimate, mistake patterns, a weekly
 * trend and specific problems to do next. With a model key (Grok first, Groq
 * otherwise) the coach reads them and writes the week's plan, and "Write me a
 * problem" makes a new, checked problem aimed at the weakest topic.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { Bars } from './Charts';
import { CategoryDot, Empty, Meter } from './bits';
import { MathText } from './MathText';
import { useApi } from '@/hooks';
import { amc, pct, type Diagnosis, type Level, type SmartStats } from '@/services/amc';

const LEVELS: Level[] = ['AMC 10', 'AMC 12', 'AIME'];
const MAX: Record<Level, number> = { 'AMC 10': 150, 'AMC 12': 150, AIME: 15 };

function Forecast({ stats, level }: { stats: SmartStats; level: Level }) {
  const c = stats.contests[level];
  return (
    <div className={`am-forecast${level === stats.level ? ' is-target' : ''}`}>
      <span className="am-kicker" style={{ margin: 0 }}>{level}{level === stats.level ? ' · your contest' : ''}</span>
      <strong className="am-forecast-score">{c.expected}<small> / {MAX[level]}</small></strong>
      <span className="am-muted">80% range {c.low}–{c.high}</span>
      {c.target != null && c.chance != null && (
        <span>
          <Meter value={c.chance} tone={c.chance >= 0.6 ? 'good' : c.chance >= 0.3 ? 'warn' : 'bad'} />
          <span className="am-muted" style={{ fontSize: 12 }}> {pct(c.chance)} chance of {c.target}+</span>
        </span>
      )}
      <span className="am-muted" style={{ fontSize: 12 }}>
        {c.reach ? `Usually right through #${c.reach} of ${c.count}` : `Not yet right more often than not on #1`}
      </span>
    </div>
  );
}

function Coach({ initial, available, setup, label }: {
  initial: Diagnosis | null; available: boolean; setup: string; label: string;
}) {
  const [d, setD] = useState<Diagnosis | null>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function run(refresh: boolean) {
    setBusy(true);
    setMessage('');
    try {
      const reply = await amc.diagnose(refresh);
      if (reply.success) setD(reply.diagnosis);
      else setMessage(reply.message);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'The coach did not answer. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="am-card am-coach">
      <div className="am-card-head">
        <h2>AI coach</h2>
        {available && <span className="am-muted" style={{ fontSize: 12 }}>{label}</span>}
      </div>
      {!available ? (
        <p className="am-muted" style={{ margin: 0, fontSize: 13 }}>{setup}</p>
      ) : !d ? (
        <>
          <p className="am-muted" style={{ marginTop: 0, fontSize: 13 }}>
            The coach reads the numbers on this page and tells you what they mean and what to do this week.
          </p>
          <button type="button" className="am-btn am-btn-primary" disabled={busy} onClick={() => void run(false)}>
            {busy ? 'Reading your results…' : 'Ask the coach'}
          </button>
        </>
      ) : (
        <div className="am-coach-body">
          <p className="am-coach-headline"><MathText text={d.headline} /></p>
          <MathText text={d.diagnosis} as="p" />
          <div className="am-grid am-grid-2" style={{ gap: 12 }}>
            {d.strengths.length > 0 && (
              <div><h3 className="am-h3">Going well</h3><ul className="am-list">{d.strengths.map((s) => <li key={s}><MathText text={s} /></li>)}</ul></div>
            )}
            {d.weaknesses.length > 0 && (
              <div><h3 className="am-h3">Costing you points</h3><ul className="am-list">{d.weaknesses.map((s) => <li key={s}><MathText text={s} /></li>)}</ul></div>
            )}
          </div>
          {d.this_week.length > 0 && (
            <>
              <h3 className="am-h3">This week</h3>
              <ol className="am-coach-week">
                {d.this_week.map((w, i) => (
                  <li key={i}>
                    <strong><MathText text={w.action} /></strong>
                    <span className="am-muted"> · {w.minutes} min{w.topic ? ' · ' : ''}</span>
                    {w.topic && <Link className="am-link" to={`/problems?topic=${w.topic}`}>{w.topic_name}</Link>}
                    <div className="am-muted" style={{ fontSize: 13 }}><MathText text={w.why} /></div>
                  </li>
                ))}
              </ol>
            </>
          )}
          {d.contest_strategy && (<><h3 className="am-h3">On the day</h3><MathText text={d.contest_strategy} as="p" /></>)}
          <button type="button" className="am-btn am-btn-ghost am-btn-sm" disabled={busy} onClick={() => void run(true)}>
            {busy ? 'Rewriting…' : 'Ask again'}
          </button>
        </div>
      )}
      {message && <p className="am-error" style={{ fontSize: 13 }}>{message}</p>}
    </section>
  );
}

function WriteProblem({ available }: { available: boolean }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!available) return null;
  async function go() {
    setBusy(true);
    setMessage('');
    try {
      const reply = await amc.createProblem({});
      if (reply.success) navigate(`/problems/${reply.id}`);
      else setMessage(reply.message);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not write a problem. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ marginTop: 12 }}>
      <button type="button" className="am-btn" disabled={busy} onClick={() => void go()}>
        {busy ? 'Writing and checking a problem…' : 'Write me a new problem for my weakest topic'}
      </button>
      <p className="am-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
        The AI writes it, then solves it again from scratch; it is kept only if both answers agree.
      </p>
      {message && <p className="am-error" style={{ fontSize: 13 }}>{message}</p>}
    </div>
  );
}

export function Insights() {
  const { data, error, loading, reload } = useApi(() => amc.insights(), []);
  if (loading && !data) return <Loading label="Modelling your results" />;
  if (error || !data) return <ErrorState message={error ?? 'Could not load insights.'} onRetry={reload} />;
  const s = data.stats;
  const trend = s.trend.filter((w) => w.theta != null);

  return (
    <div className="am-stack">
      <dl className="am-stats">
        <div className="am-stat">
          <dt>Your level</dt>
          <dd className="am-stat-value">{s.theta}<small style={{ fontSize: 14 }}> / 10</small></dd>
          <dd className="am-stat-hint">likely {s.band} · the rating you solve half the time</dd>
        </div>
        <div className="am-stat">
          <dt>First-try answers</dt>
          <dd className="am-stat-value">{s.answered}</dd>
          <dd className="am-stat-hint">{s.confident ? 'enough for a firm estimate' : 'answer 15+ for a firm estimate'}</dd>
        </div>
        <div className="am-stat">
          <dt>Reviews due</dt>
          <dd className="am-stat-value">{s.review_due}</dd>
          <dd className="am-stat-hint"><Link className="am-link" to="/review">open Review</Link></dd>
        </div>
      </dl>

      <section className="am-card">
        <div className="am-card-head"><h2>Predicted scores</h2><span className="am-muted" style={{ fontSize: 12 }}>answering when it beats a blank</span></div>
        <div className="am-forecasts">{LEVELS.map((l) => <Forecast key={l} stats={s} level={l} />)}</div>
      </section>

      <div className="am-grid am-grid-main">
        <Coach initial={data.diagnosis} available={data.ai.available} setup={data.ai.setup} label={data.ai.label} />
        <section className="am-card">
          <div className="am-card-head"><h2>Do next</h2></div>
          {s.next_problems.length ? (
            <ul className="am-list am-next">
              {s.next_problems.map((p) => (
                <li key={p.id}>
                  <Link className="am-link" to={`/problems/${p.id}`}>{p.short}</Link>
                  <span className="am-muted"> {p.topic_name} · {p.rating}/10 · {pct(p.chance)} likely</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="am-muted" style={{ margin: 0, fontSize: 13 }}>You have solved everything in your focus topics.</p>
          )}
          <WriteProblem available={data.ai.available} />
        </section>
      </div>

      <div className="am-grid am-grid-2">
        <section className="am-card">
          <div className="am-card-head"><h2>Worth the most points</h2></div>
          {s.focus.map((t) => (
            <div key={t.id} className="am-ability">
              <Link className="am-link" to={`/topics/${t.id}`}><CategoryDot category={t.category} /> {t.name}</Link>
              <span className="am-muted">{t.theta == null ? 'not tried yet' : `level ${t.theta} · ${t.right}/${t.answered} right`}</span>
            </div>
          ))}
          {s.strong.length > 0 && (
            <>
              <h3 className="am-h3" style={{ marginTop: 16 }}>Strongest</h3>
              {s.strong.map((t) => (
                <div key={t.id} className="am-ability">
                  <span><CategoryDot category={t.category} /> {t.name}</span>
                  <span className="am-muted">level {t.theta}</span>
                </div>
              ))}
            </>
          )}
        </section>
        <section className="am-card">
          <div className="am-card-head"><h2>Level by week</h2></div>
          {trend.length ? (
            <Bars max={7} format={(v) => v.toFixed(1)} rows={trend.map((w) => ({
              key: w.week_end, label: `to ${w.week_end.slice(5)}`, value: w.theta, hint: `${w.answered} answers so far`,
            }))} />
          ) : (
            <p className="am-muted" style={{ margin: 0, fontSize: 13 }}>Answer a few problems to start the trend.</p>
          )}
          {s.techniques.length > 0 && (
            <>
              <h3 className="am-h3" style={{ marginTop: 16 }}>Techniques to work on</h3>
              {s.techniques.slice(0, 4).map((t) => (
                <div key={t.id} className="am-ability">
                  <Link className="am-link" to={`/problems?technique=${t.id}`}>{t.name}</Link>
                  <span className="am-muted">level {t.theta} · {t.answered} answered</span>
                </div>
              ))}
            </>
          )}
        </section>
      </div>

      <section className="am-card">
        <div className="am-card-head"><h2>Patterns in your mistakes</h2></div>
        {s.patterns.length ? s.patterns.map((p) => (
          <div key={p.kind} className="am-pattern">
            <p style={{ margin: '0 0 6px' }}>{p.text}</p>
            <div className="am-chips">
              {p.problems.map((q) => <Link key={q.id} className="am-chip" to={`/problems/${q.id}`}>{q.short}</Link>)}
            </div>
          </div>
        )) : (
          <Empty title="Nothing flagged">No careless misses, time sinks or rushed answers so far.</Empty>
        )}
      </section>
    </div>
  );
}

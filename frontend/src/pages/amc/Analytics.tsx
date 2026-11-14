/**
 * Analytics, under Prep: three views of one question, how do I get my score?
 *
 *   Performance  how you are doing: accuracy by AoPS rating and category, the
 *                weekly trend, mock scores, topics, and what happens to misses.
 *   Contests     what appears on the AMC 10, AMC 12 and AIME: the format, the
 *                qualifying line, what each stretch of the paper tests, and the
 *                share of each category.
 *   Prepare      how to get from here to your goal: how the goal breaks down
 *                into right answers, which problems decide it, the topics worth
 *                most, and how to spend the week.
 *
 * All of it is computed from your answers on each visit (backend/amc/insights.py);
 * the view lives in the URL (?view=) so it can be linked to.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { Bars, Columns, Legend } from '@/components/Amc/Charts';
import { CategoryDot, clock, Empty, Meter, PageHeader } from '@/components/Amc/bits';
import { useApi, useDocumentTitle } from '@/hooks';
import {
  amc,
  CATEGORY_TONE,
  pct,
  shortDate,
  type Analytics as AnalyticsData,
  type CategoryId,
  type Level,
} from '@/services/amc';
import '@/styles/amc.css';

const VIEWS = [
  { id: 'performance', label: 'Performance' },
  { id: 'contests', label: 'The contest' },
  { id: 'prepare', label: 'Plan' },
] as const;
type View = (typeof VIEWS)[number]['id'];
const LEVELS: Level[] = ['AMC 10', 'AMC 12', 'AIME'];
const MAX: Record<Level, number> = { 'AMC 10': 150, 'AMC 12': 150, AIME: 15 };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="am-stat">
      <dt>{label}</dt>
      <dd className="am-stat-value">{value}</dd>
      {hint && <dd className="am-stat-hint">{hint}</dd>}
    </div>
  );
}

function tone(accuracy: number | null): string {
  if (accuracy == null) return 'sage';
  if (accuracy >= 0.75) return 'good';
  if (accuracy >= 0.5) return 'warn';
  return 'bad';
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------
function Performance({ data }: { data: AnalyticsData }) {
  const p = data.performance;
  if (!p.attempted) {
    return (
      <Empty title="No answers yet">
        Solve a few <Link className="am-link" to="/problems">problems</Link> to see your stats.
      </Empty>
    );
  }
  const tried = p.ratings.filter((r) => r.attempted);
  const weakest = p.topics.filter((t) => t.accuracy != null).slice(0, 6);
  const strongest = [...p.topics].filter((t) => t.accuracy != null && t.attempted >= 1)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0) || b.attempted - a.attempted).slice(0, 6);
  const sameLevel = p.mocks.length > 0 && p.mocks.every((m) => m.level === p.mocks[0]?.level);
  const scoreMax = sameLevel && p.mocks[0]?.level ? MAX[p.mocks[0].level as Level] : Math.max(...p.mocks.map((m) => m.max ?? 0), 1);
  const goalLine = sameLevel && p.mocks[0]?.level === data.target ? { value: data.goal, label: `Goal ${data.goal}` } : null;
  const r = p.recovery;

  return (
    <>
      <dl className="am-stats">
        <Stat label="Attempted" value={String(p.attempted)} hint={`${p.solved} solved`} />
        <Stat label="First-try accuracy" value={pct(p.accuracy)} />
        <Stat label="Time per problem" value={p.avg_seconds ? clock(p.avg_seconds) : '—'}
              hint={`contest pace ${data.target === 'AIME' ? '12:00' : '3:00'}`} />
        <Stat label="Reliable up to" value={p.ceiling != null ? `AoPS ${p.ceiling}` : '—'}
              hint={p.ceiling != null ? '70%+ right' : 'answer more'} />
        <Stat label="Active days" value={String(p.active_days)} hint={`${p.minutes} min practised`} />
      </dl>

      <div className="am-grid am-grid-2">
        <section className="am-card">
          <div className="am-card-head"><h2>By difficulty</h2></div>
          {tried.length ? (
            <Bars rows={tried.map((row) => ({
              key: String(row.rating),
              label: `AoPS ${row.rating}`,
              value: row.accuracy == null ? null : row.accuracy * 100,
              hint: `${row.first_right} of ${row.attempted} right first time${row.avg_seconds ? ` · ${clock(row.avg_seconds)} each` : ''}`,
              tone: tone(row.accuracy),
            }))} />
          ) : <p className="am-muted">No rated problems answered yet.</p>}
        </section>

        <section className="am-card">
          <div className="am-card-head"><h2>By category</h2><Link to="/topics">Topics</Link></div>
          <Bars rows={p.categories.map((c) => ({
            key: c.id,
            label: <><CategoryDot category={c.id as CategoryId} /> {c.name}</>,
            value: c.accuracy == null ? null : c.accuracy * 100,
            hint: `${c.attempted} of ${c.problems} tried`,
            tone: CATEGORY_TONE[c.id as CategoryId],
          }))} />
        </section>

        <section className="am-card">
          <div className="am-card-head"><h2>Week by week</h2></div>
          <Columns
            caption="Problems answered each week for the last 8 weeks"
            idle={<>Last 8 weeks</>}
            labelEvery={2}
            points={p.weeks.map((w) => ({
              key: w.start,
              label: shortDate(w.start),
              value: w.answered,
              part: w.correct,
              tip: `Week of ${shortDate(w.start)} · ${w.answered} answered, ${w.correct} right (${pct(w.accuracy)})`,
            }))}
          />
          <Legend items={[{ label: 'Right', tone: 'strong' }, { label: 'Answered', tone: 'soft' }]} />
        </section>

        <section className="am-card">
          <div className="am-card-head"><h2>Contest scores</h2><Link to="/contests">Past Contests</Link></div>
          {p.mocks.length ? (
            <>
              <Columns
                caption="Mock and logged contest scores, oldest first"
                idle={<>{p.mocks.length} contest{p.mocks.length === 1 ? '' : 's'}</>}
                max={scoreMax}
                goal={goalLine}
                labelEvery={Math.max(1, Math.ceil(p.mocks.length / 4))}
                points={p.mocks.map((m) => ({
                  key: m.id,
                  label: shortDate(m.at),
                  value: m.score,
                  part: m.score,
                  tip: `${m.name} · ${m.score}${m.max ? ` / ${m.max}` : ''} · ${shortDate(m.at)}`,
                }))}
              />
              {goalLine && <Legend items={[{ label: 'Score', tone: 'strong' }, { label: 'Your goal', tone: 'goal' }]} />}
            </>
          ) : (
            <Empty title="No scores yet">
              Take a <Link className="am-link" to="/contests">timed mock</Link>.
            </Empty>
          )}
        </section>

        <section className="am-card">
          <div className="am-card-head"><h2>Weakest topics</h2></div>
          {weakest.length ? (
            <ul className="am-list am-topic-list">
              {weakest.map((t) => (
                <li key={t.id}>
                  <Link className="am-link" to={`/topics/${t.id}`}>
                    <CategoryDot category={t.category as CategoryId} /> {t.name}
                  </Link>
                  <span className="am-muted">{pct(t.accuracy)} · {t.attempted} tried</span>
                </li>
              ))}
            </ul>
          ) : <p className="am-muted">Answer a few more problems.</p>}
        </section>

        <section className="am-card">
          <div className="am-card-head"><h2>Strongest topics</h2></div>
          {strongest.length ? (
            <ul className="am-list am-topic-list">
              {strongest.map((t) => (
                <li key={t.id}>
                  <Link className="am-link" to={`/topics/${t.id}`}>
                    <CategoryDot category={t.category as CategoryId} /> {t.name}
                  </Link>
                  <span className="am-muted">{pct(t.accuracy)} · {t.attempted} tried</span>
                </li>
              ))}
            </ul>
          ) : <p className="am-muted">Answer a few more problems.</p>}
        </section>

        <section className="am-card">
          <div className="am-card-head"><h2>Misses</h2><Link to="/review">Review</Link></div>
          <dl className="am-mini-stats">
            <div><dt>Missed</dt><dd>{r.missed_first}</dd></div>
            <div><dt>Fixed since</dt><dd>{r.recovered}</dd></div>
            <div><dt>Still open</dt><dd>{r.open}</dd></div>
            <div><dt>Revealed</dt><dd>{r.revealed}</dd></div>
          </dl>
        </section>

        <section className="am-card">
          <div className="am-card-head"><h2>Projected scores</h2></div>
          <div className="am-bars">
            {LEVELS.map((l) => {
              const score = p.projected[l];
              return (
                <div key={l} className="am-bar-row">
                  <span className="am-bar-label">{l}</span>
                  <span className="am-muted" style={{ fontSize: 12 }}>
                    {score == null ? `after ${p.projection_min} answers` : `${score} / ${MAX[l]}`}
                  </span>
                  <Meter value={(score ?? 0) / MAX[l]} />
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// What appears on each contest
// ---------------------------------------------------------------------------
function Contests({ data }: { data: AnalyticsData }) {
  const [level, setLevel] = useState<Level>(data.target);
  const g = data.contests[level];
  return (
    <>
      <div className="am-seg" role="group" aria-label="Contest" style={{ marginBottom: 'var(--space-4)' }}>
        {LEVELS.map((l) => (
          <button key={l} type="button" className={l === level ? 'is-on' : ''} onClick={() => setLevel(l)}>{l}</button>
        ))}
      </div>
      <dl className="am-stats">
        <Stat label="Problems" value={String(g.count)} hint={level === 'AIME' ? 'integer answers 0–999' : 'five choices each'} />
        <Stat label="Time" value={`${g.minutes} min`} hint={`about ${clock((g.minutes * 60) / g.count)} a problem`} />
        <Stat label="Top score" value={String(g.max)} hint={g.scoring} />
      </dl>
      <div className="am-grid am-grid-main">
        <div className="am-stack">
          <section className="am-card">
            <div className="am-card-head"><h2>The format</h2></div>
            <p className="am-prose">{g.format}</p>
            <p className="am-prose">{g.who}</p>
            <p className="am-prose" style={{ marginBottom: 0 }}>
              <strong>{level === 'AIME' ? 'Next round.' : 'AIME cutoff.'}</strong> {g.qualify}
            </p>
          </section>
          <section className="am-card">
            <div className="am-card-head"><h2>By problem number</h2></div>
            <ol className="am-sections">
              {g.sections.map((s) => (
                <li key={s.range}>
                  <div className="am-sections-head">
                    <strong>#{s.range}</strong>
                    <span className="am-muted">AoPS {s.rating} · ~{s.minutes} min</span>
                  </div>
                  <p>{s.what}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <div className="am-stack">
          <section className="am-card">
            <div className="am-card-head"><h2>Topic mix</h2><span className="am-muted" style={{ fontSize: 12 }}>approx.</span></div>
            <Bars max={40} rows={g.shares.map((s) => ({
              key: s.id,
              label: <><CategoryDot category={s.id as CategoryId} /> {s.name}</>,
              value: s.share,
              tone: CATEGORY_TONE[s.id as CategoryId],
            }))} format={(v) => `~${v}%`} />
            {g.measured && (
              <p className="am-card-sub" style={{ marginBottom: 0 }}>
                Your {g.measured.papers} imported paper{g.measured.papers === 1 ? '' : 's'}:{' '}
                {g.shares.map((s) => `${s.name} ${g.measured?.shares[s.id] ?? 0}%`).join(', ')}.
              </p>
            )}
          </section>
          <section className="am-card">
            <div className="am-card-head"><h2>Difficulty</h2></div>
            <table className="am-table">
              <thead><tr><th>Problems</th><th>AoPS rating</th></tr></thead>
              <tbody>
                {g.bands.map((b, i) => (
                  <tr key={b.last}>
                    <td>#{(g.bands[i - 1]?.last ?? 0) + 1}–{b.last}</td>
                    <td>{b.rating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="am-card">
            <div className="am-card-head"><h2>Common topics</h2></div>
            <div className="am-chips">
              {g.key_topics.map((t) => (
                <Link key={t.id} className="am-chip" to={`/topics/${t.id}`}>
                  <CategoryDot category={t.category as CategoryId} /> {t.name}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// How to prepare
// ---------------------------------------------------------------------------
function Prepare({ data }: { data: AnalyticsData }) {
  const p = data.prepare;
  const projected = data.performance.projected[data.target];
  const hours = data.hours ?? 4;
  return (
    <>
      {!data.has_plan && (
        <div className="am-callout am-callout-insight" style={{ marginBottom: 'var(--space-4)' }}>
          <span>No study plan</span>
          <p>
            Using the AMC 10, a goal of 100 and 4 hours a week.{' '}
            <Link className="am-link" to="/study-plan">Make a plan</Link>
          </p>
        </div>
      )}
      <dl className="am-stats">
        <Stat label="Your goal" value={String(p.goal)} hint={`on the ${data.target}`} />
        <Stat label="Projected now" value={projected == null ? '—' : String(projected)}
              hint={p.gap == null ? `after ${data.performance.projection_min} answers` : p.gap > 0 ? `${p.gap} to go` : 'goal reached'} />
        <Stat label="Right answers needed" value={String(p.right_needed)} hint={data.target === 'AIME' ? 'of 15' : 'rest left blank'} />
        <Stat label="Contest day" value={data.days_left != null ? `${data.days_left} days` : '—'}
              hint={data.exam_date ? shortDate(data.exam_date) : 'set it on Study Plan'} />
      </dl>
      <div className="am-grid am-grid-main">
        <div className="am-stack">
          {p.phase && (
            <section className="am-card am-phase-card">
              <span className="am-kicker">{p.phase.weeks} week{p.phase.weeks === 1 ? '' : 's'} out</span>
              <h2>{p.phase.name}</h2>
              <p className="am-prose" style={{ margin: 0 }}>{p.phase.text}</p>
            </section>
          )}
          <section className="am-card">
            <div className="am-card-head"><h2>Your goal</h2></div>
            <p className="am-prose">{p.split}</p>
            <p className="am-prose" style={{ marginBottom: 0 }}>{p.reach}</p>
          </section>
          <section className="am-card">
            <div className="am-card-head"><h2>Next steps</h2><Link to="/study-plan">Study Plan</Link></div>
            <ol className="am-steps-list">
              {p.steps.map((s) => (
                <li key={s.title}>
                  <Link to={s.to}><strong>{s.title}</strong></Link>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <div className="am-stack">
          <section className="am-card">
            <div className="am-card-head"><h2>Topics to study</h2></div>
            <ul className="am-list am-topic-list">
              {p.focus.map((t) => (
                <li key={t.id}>
                  <Link className="am-link" to={`/topics/${t.id}`}>
                    <CategoryDot category={t.category as CategoryId} /> {t.name}
                  </Link>
                  <span className="am-muted">{Math.round(t.mastery * 100)}%</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="am-card">
            <div className="am-card-head"><h2>Your week</h2><span className="am-muted" style={{ fontSize: 12 }}>{hours} h</span></div>
            <Bars max={hours} format={(v) => `${v} h`} rows={p.week.map((w) => ({
              key: w.what, label: w.what, value: w.hours,
            }))} />
          </section>
        </div>
      </div>
    </>
  );
}

export default function Analytics() {
  useDocumentTitle('Analytics');
  const [params, setParams] = useSearchParams();
  const view: View = (VIEWS.find((v) => v.id === params.get('view'))?.id) ?? 'performance';
  const { data, error, loading, reload } = useApi(() => amc.analytics(), []);

  return (
    <div className="amc-page">
      <PageHeader title="Analytics">
        <p>How you're doing, what's on the test, and what to do next.</p>
      </PageHeader>
      <div className="am-tabs" role="tablist" aria-label="Analytics">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id}
                  className={`am-tab${view === v.id ? ' is-on' : ''}`}
                  onClick={() => setParams(v.id === 'performance' ? {} : { view: v.id }, { replace: true })}>
            {v.label}
          </button>
        ))}
      </div>
      {loading && !data ? (
        <Loading label="Reading your answers" />
      ) : error || !data ? (
        <ErrorState message={error ?? 'Could not load analytics.'} onRetry={reload} />
      ) : view === 'performance' ? (
        <Performance data={data} />
      ) : view === 'contests' ? (
        <Contests data={data} />
      ) : (
        <Prepare data={data} />
      )}
    </div>
  );
}

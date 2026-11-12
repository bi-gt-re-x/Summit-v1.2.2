/**
 * The study plan: which contest, when, what score, how many hours a week. The
 * weeks are rebuilt from those four answers and your results every time the
 * page opens (backend/amc/engine.py plan_weeks), so the focus topics follow
 * your weak spots as they move: Foundations, Core, Contest mode, then a taper
 * in the exam's own week.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, Loading } from '@/components';
import { CategoryDot, Meter, PageHeader } from '@/components/Amc/bits';
import { useApi, useDocumentTitle } from '@/hooks';
import { amc, announceAmcChanged, shortDate, type Level, type PlanPayload, type PlanSettings } from '@/services/amc';
import { TodayList } from './Dashboard';
import '@/styles/amc.css';

const LEVELS: Level[] = ['AMC 10', 'AMC 12', 'AIME'];
const MAX: Record<Level, number> = { 'AMC 10': 150, 'AMC 12': 150, AIME: 15 };

function PlanForm({
  initial,
  defaults,
  onSaved,
  onCancel,
}: {
  initial: PlanSettings | null;
  defaults: PlanPayload['defaults'];
  onSaved: (payload: PlanPayload) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<PlanSettings>(
    initial ?? { target: 'AMC 10', exam_date: defaults.dates['AMC 10'], goal_score: defaults.goals['AMC 10'], hours: 5 },
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (target: Level) =>
    setForm((f) => ({
      ...f,
      target,
      exam_date: initial?.target === target ? initial.exam_date : defaults.dates[target],
      goal_score: initial?.target === target ? initial.goal_score : defaults.goals[target],
    }));

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const reply = await amc.savePlan(form);
      if (reply.success) {
        announceAmcChanged();
        onSaved(reply);
      } else setMessage(reply.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="am-card">
      <div className="am-card-head"><h2>{initial ? 'Edit your plan' : 'Build your plan'}</h2></div>
      <div className="am-form">
        <div className="am-field am-field-wide">
          <span>Contest</span>
          <div className="am-seg" role="group" aria-label="Contest">
            {LEVELS.map((l) => (
              <button key={l} type="button" className={form.target === l ? 'is-on' : ''} onClick={() => pick(l)}>{l}</button>
            ))}
          </div>
        </div>
        <label className="am-field">
          <span>Exam date</span>
          <input className="am-input" type="date" value={form.exam_date}
                 onChange={(e) => setForm({ ...form, exam_date: e.target.value })} />
        </label>
        <label className="am-field">
          <span>Goal score (of {MAX[form.target]})</span>
          <input className="am-input" type="number" min={1} max={MAX[form.target]} step={form.target === 'AIME' ? 1 : 1.5}
                 value={form.goal_score} onChange={(e) => setForm({ ...form, goal_score: Number(e.target.value) })} />
        </label>
        <label className="am-field">
          <span>Hours per week</span>
          <input className="am-input" type="number" min={1} max={40} value={form.hours}
                 onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} />
        </label>
      </div>
      <p className="am-muted" style={{ fontSize: 12, lineHeight: 1.5, margin: '12px 0 0' }}>
        The default goals ({defaults.goals['AMC 10']} on the AMC 10, {defaults.goals['AMC 12']} on the AMC 12) sit
        in the range recent AIME cutoffs have fallen in; check the MAA's published cutoffs for your year.
      </p>
      {message && <p className="am-error">{message}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="button" className="am-btn am-btn-primary" disabled={busy} onClick={() => void save()}>
          {initial ? 'Save changes' : 'Make my plan'}
        </button>
        {onCancel && <button type="button" className="am-btn am-btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </section>
  );
}

export default function StudyPlan() {
  useDocumentTitle('Study Plan');
  const { data, error, loading, reload } = useApi(() => amc.plan(), []);
  const [payload, setPayload] = useState<PlanPayload | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (data) setPayload(data);
  }, [data]);

  if (loading && !payload) return <Loading label="Loading your plan" />;
  if (error || !payload) return <ErrorState message={error ?? 'Could not load the plan.'} onRetry={reload} />;

  const { plan } = payload;
  if (!plan || editing) {
    return (
      <div className="amc-page">
        <PageHeader kicker="Plan" title="Study Plan">
          <p>
            Four answers and you get a week-by-week plan to contest day: your weakest high-weight topics first, timed
            mocks as the date gets close, and a light final week.
          </p>
        </PageHeader>
        <div style={{ maxWidth: 820 }}>
          <PlanForm
            initial={plan}
            defaults={payload.defaults}
            onSaved={(p) => {
              setPayload(p);
              setEditing(false);
            }}
            onCancel={plan ? () => setEditing(false) : undefined}
          />
        </div>
      </div>
    );
  }

  const weeks = payload.weeks ?? [];
  const current = weeks.find((w) => w.current);
  const projected = payload.projected ?? 0;

  async function toggle(key: string, done: boolean) {
    const reply = await amc.check(key, done);
    if (reply.success) {
      setPayload(reply);
      announceAmcChanged();
    }
  }

  async function clear() {
    if (!window.confirm('Delete your study plan? Your answers and review log are kept.')) return;
    await amc.clearPlan();
    announceAmcChanged();
    reload();
  }

  return (
    <div className="amc-page">
      <PageHeader
        kicker={`${plan.target} · ${shortDate(plan.exam_date)}`}
        title="Study Plan"
        actions={
          <>
            <button type="button" className="am-btn am-btn-ghost" onClick={() => void clear()}>Delete plan</button>
            <button type="button" className="am-btn" onClick={() => setEditing(true)}>Edit plan</button>
          </>
        }
      >
        <p>
          {weeks.length} week{weeks.length === 1 ? '' : 's'} to the {plan.target}, about {plan.hours} hour{plan.hours === 1 ? '' : 's'} a
          week. Focus topics are re-chosen from your results every time you open this page.
        </p>
      </PageHeader>

      <div className="am-grid am-grid-3" style={{ marginBottom: 16 }}>
        <section className="am-card">
          <span className="am-kicker">Countdown</span>
          <div className="am-countdown"><strong>{plan.days_left}</strong><span className="am-muted">days</span></div>
          <p className="am-muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
            {current ? `Week ${current.number} of ${weeks.length} · ${current.phase}` : 'Before the plan starts'}
          </p>
        </section>
        <section className="am-card">
          <span className="am-kicker">Projected vs goal</span>
          <div className="am-countdown"><strong>{projected}</strong><span className="am-muted">/ goal {plan.goal_score}</span></div>
          <div style={{ marginTop: 10 }}>
            <Meter value={projected / plan.goal_score} tone={projected >= plan.goal_score ? 'good' : 'sage'} />
          </div>
        </section>
        <section className="am-card">
          <span className="am-kicker">This week</span>
          {current?.focus.length ? (
            <div className="am-week-focus" style={{ marginTop: 6 }}>
              {current.focus.map((f) => (
                <Link key={f.id} className="am-tag" to={`/topics/${f.id}`}><CategoryDot category={f.category} />{f.name}</Link>
              ))}
            </div>
          ) : (
            <p style={{ margin: '6px 0 0' }}>Taper: review only.</p>
          )}
          <p className="am-muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
            {current ? `${current.problems} problems${current.mock ? ' + a timed mock' : ''}` : ''}
          </p>
        </section>
      </div>

      <div className="am-grid am-grid-main">
        <section>
          <h2 className="am-h2" style={{ marginBottom: 12 }}>Week by week</h2>
          <div className="am-weeks">
            {weeks.map((w) => (
              <div key={w.number} className={`am-week${w.current ? ' is-current' : ''}${w.past ? ' is-past' : ''}`}>
                <div className="am-week-when">
                  <strong>Week {w.number}</strong>
                  {shortDate(w.start)} – {shortDate(w.end)}
                </div>
                <div>
                  <span className={`am-phase am-phase-${w.phase.split(' ')[0]}`}>{w.phase}</span>
                  <div className="am-week-focus">
                    {w.focus.map((f) => (
                      <Link key={f.id} className="am-tag" to={`/topics/${f.id}`}><CategoryDot category={f.category} />{f.name}</Link>
                    ))}
                    {!w.focus.length && <span className="am-muted" style={{ fontSize: 13 }}>{w.note}</span>}
                  </div>
                </div>
                <div className="am-week-side">
                  {w.problems > 0 && <span>{w.problems} problems</span>}
                  {w.mock && <span className={`am-pill ${w.mock_done ? 'am-pill-solved' : 'am-pill-review'}`}>{w.mock_done ? 'Mock done' : 'Mock'}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="am-stack">
          <section className="am-card">
            <div className="am-card-head"><h2>Today</h2></div>
            <TodayList items={payload.today ?? []} onToggle={(item) => void toggle(item.key, !item.done)} />
            {current && <p className="am-muted" style={{ fontSize: 13, lineHeight: 1.5, margin: '12px 0 0' }}>{current.note}</p>}
          </section>
          <section className="am-card">
            <div className="am-card-head"><h2>Topic coverage</h2></div>
            <div className="am-bars">
              {(payload.coverage ?? []).sort((a, b) => a.mastery - b.mastery).slice(0, 10).map((t) => (
                <div key={t.id} className="am-bar-row">
                  <Link className="am-bar-label" to={`/topics/${t.id}`}><CategoryDot category={t.category} />{t.name}</Link>
                  <span className="am-muted" style={{ fontSize: 12 }}>{Math.round(t.mastery * 100)}%</span>
                  <Meter value={t.mastery} />
                </div>
              ))}
            </div>
            <p className="am-muted" style={{ fontSize: 12, margin: '12px 0 0' }}>Your ten least-covered topics for the {plan.target}.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

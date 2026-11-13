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
import {
  amc,
  announceAmcChanged,
  shortDate,
  type CategoryId,
  type Level,
  type PlanDetails,
  type PlanPayload,
  type PlanSettings,
} from '@/services/amc';
import { TodayList } from './Dashboard';
import '@/styles/amc.css';

const LEVELS: Level[] = ['AMC 10', 'AMC 12', 'AIME'];
const MAX: Record<Level, number> = { 'AMC 10': 150, 'AMC 12': 150, AIME: 15 };

const EXPERIENCE: { key: NonNullable<PlanDetails['experience']>; label: string }[] = [
  { key: 'first', label: 'First time' },
  { key: 'taken', label: 'Taken it before' },
  { key: 'qualified', label: 'Made the AIME before' },
];

/** Topic chips that toggle membership of a list. */
function TopicPicker({
  topics,
  value,
  onChange,
  exclude,
}: {
  topics: { id: string; name: string; category: CategoryId }[];
  value: string[];
  onChange: (next: string[]) => void;
  exclude: string[];
}) {
  return (
    <div className="am-chips">
      {topics.filter((t) => !exclude.includes(t.id)).map((t) => {
        const on = value.includes(t.id);
        return (
          <button key={t.id} type="button" className={`am-chip${on ? ' is-on' : ''}`} aria-pressed={on}
                  onClick={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])}>
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

function PlanForm({
  initial,
  defaults,
  ai,
  onSaved,
  onCancel,
}: {
  initial: (PlanSettings & { details?: PlanDetails }) | null;
  defaults: PlanPayload['defaults'];
  ai: PlanPayload['ai'];
  onSaved: (payload: PlanPayload, fresh: boolean) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<PlanSettings>(
    initial
      ? { target: initial.target, exam_date: initial.exam_date, goal_score: initial.goal_score, hours: initial.hours }
      : { target: 'AMC 10', exam_date: defaults.dates['AMC 10'], goal_score: defaults.goals['AMC 10'], hours: 5 },
  );
  const [details, setDetails] = useState<PlanDetails>(initial?.details ?? {});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: topicData } = useApi(() => amc.topics(), []);
  const topics = (topicData?.categories ?? [])
    .flatMap((c) => c.topics)
    .filter((t) => t.levels.includes(form.target));

  const pick = (target: Level) =>
    setForm((f) => ({
      ...f,
      target,
      exam_date: initial?.target === target ? initial.exam_date : defaults.dates[target],
      goal_score: initial?.target === target ? initial.goal_score : defaults.goals[target],
    }));
  const set = <K extends keyof PlanDetails>(key: K, value: PlanDetails[K]) =>
    setDetails((d) => ({ ...d, [key]: value }));

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const reply = await amc.savePlan({ ...form, details });
      if (reply.success) {
        announceAmcChanged();
        onSaved(reply, !initial || initial.target !== form.target);
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
        <label className="am-field">
          <span>Days per week</span>
          <input className="am-input" type="number" min={1} max={7} placeholder="e.g. 4"
                 value={details.days_per_week ?? ''}
                 onChange={(e) => set('days_per_week', e.target.value ? Number(e.target.value) : undefined)} />
        </label>
      </div>

      <h3 className="am-form-sub">Tell the coach about you</h3>
      <p className="am-muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
        Optional, and the more you say the more personal the plan.{' '}
        {ai.available ? `It's written by ${ai.label}.` : 'Add an AI key to .env to have it written for you.'}
      </p>
      <div className="am-form">
        <div className="am-field am-field-wide">
          <span>Experience</span>
          <div className="am-seg" role="group" aria-label="Experience">
            {EXPERIENCE.map((e) => (
              <button key={e.key} type="button" className={details.experience === e.key ? 'is-on' : ''}
                      onClick={() => set('experience', details.experience === e.key ? undefined : e.key)}>{e.label}</button>
            ))}
          </div>
        </div>
        <label className="am-field">
          <span>Last real score</span>
          <input className="am-input" type="number" min={0} max={MAX[form.target]} step={form.target === 'AIME' ? 1 : 1.5}
                 placeholder="If you have one" value={details.last_score ?? ''}
                 onChange={(e) => set('last_score', e.target.value ? Number(e.target.value) : undefined)} />
        </label>
        <label className="am-field">
          <span>Books, courses, sites</span>
          <input className="am-input" maxLength={300} placeholder="e.g. AoPS Intro to Counting, Alcumus"
                 value={details.resources ?? ''} onChange={(e) => set('resources', e.target.value)} />
        </label>
        <div className="am-field am-field-wide">
          <span>Strong at</span>
          <TopicPicker topics={topics} value={details.strong ?? []} exclude={details.weak ?? []}
                       onChange={(v) => set('strong', v)} />
        </div>
        <div className="am-field am-field-wide">
          <span>Weak at</span>
          <TopicPicker topics={topics} value={details.weak ?? []} exclude={details.strong ?? []}
                       onChange={(v) => set('weak', v)} />
        </div>
        <label className="am-field am-field-wide">
          <span>Anything else</span>
          <textarea className="am-input" maxLength={1000}
                    placeholder="Schedule limits, what usually goes wrong on contest day, other contests you're doing…"
                    value={details.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </label>
      </div>
      <p className="am-muted" style={{ fontSize: 12, lineHeight: 1.5, margin: '12px 0 0' }}>
        The default goals ({defaults.goals['AMC 10']} on the AMC 10, {defaults.goals['AMC 12']} on the AMC 12) sit
        in the range recent AIME cutoffs have fallen in; check the MAA's published cutoffs for your year.
      </p>
      {message && <p className="am-error">{message}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" className="am-btn am-btn-primary" disabled={busy} onClick={() => void save()}>
          {initial ? 'Save changes' : 'Make my plan'}
        </button>
        {onCancel && <button type="button" className="am-btn am-btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </section>
  );
}

/**
 * The AI coach's plan, and the way to ask for it, refine it with answers to
 * its follow-up questions, or have it rewritten.
 */
function CoachCard({
  payload,
  busy,
  error,
  onRun,
}: {
  payload: PlanPayload;
  busy: boolean;
  error: string;
  onRun: (answers: Record<string, string>) => void;
}) {
  const written = payload.plan?.coach ?? null;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const names = new Map((payload.coverage ?? []).map((t) => [t.id, t] as const));
  const answered = Object.values(answers).some((a) => a.trim());

  if (!payload.ai.available && !written) {
    return (
      <section className="am-card am-coach">
        <div className="am-card-head"><h2>AI coach</h2></div>
        <p className="am-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
          Add <code>GROQ_API_KEY</code> (free at console.groq.com) to <code>.env</code> — or <code>XAI_API_KEY</code> with{' '}
          <code>MILESTONE_PROVIDER=grok</code> for Grok — and restart the server. The coach will then write you a
          personal plan from your details and results.
        </p>
      </section>
    );
  }

  if (!written) {
    return (
      <section className="am-card am-coach">
        <div className="am-card-head"><h2>AI coach</h2><span className="am-muted" style={{ fontSize: 12 }}>{payload.ai.label}</span></div>
        <p style={{ margin: '0 0 12px', lineHeight: 1.6, color: 'var(--am-body)' }}>
          Have the coach turn your details and results into a personal plan: phases, a weekly routine, milestones
          and the order to study topics in.
        </p>
        {error && <p className="am-error">{error}</p>}
        <button type="button" className="am-btn am-btn-primary" disabled={busy} onClick={() => onRun({})}>
          {busy ? 'Writing your plan…' : 'Write my plan'}
        </button>
        {busy && <p className="am-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>This can take up to a minute.</p>}
      </section>
    );
  }

  return (
    <section className="am-card am-coach">
      <div className="am-card-head">
        <h2>Your coach's plan</h2>
        <span className="am-muted" style={{ fontSize: 12 }}>
          {payload.plan?.coach_by}{payload.plan?.coach_at ? ` · ${shortDate(payload.plan.coach_at)}` : ''}
        </span>
      </div>
      <p className="am-coach-summary">{written.summary}</p>
      {written.starting_point && <p className="am-muted am-coach-start">{written.starting_point}</p>}

      <div className="am-coach-phases">
        {written.phases.map((p, i) => (
          <div key={i} className="am-coach-phase">
            <div className="am-coach-phase-head"><strong>{p.name}</strong><span className="am-muted">Weeks {p.weeks}</span></div>
            <p>{p.goal}</p>
            {p.focus_topics.length > 0 && (
              <div className="am-week-focus">
                {p.focus_topics.map((id) => (
                  <Link key={id} className="am-tag" to={`/topics/${id}`}>
                    {names.get(id) && <CategoryDot category={names.get(id)!.category} />}{names.get(id)?.name ?? id}
                  </Link>
                ))}
              </div>
            )}
            <p className="am-muted" style={{ fontSize: 13 }}>{p.routine}</p>
          </div>
        ))}
      </div>

      {written.weekly_schedule.length > 0 && (
        <>
          <h3 className="am-form-sub">A typical week</h3>
          <ul className="am-coach-week">
            {written.weekly_schedule.map((d, i) => (
              <li key={i}><strong>{d.day}</strong><span>{d.task}</span><em>{d.minutes} min</em></li>
            ))}
          </ul>
        </>
      )}

      {written.milestones.length > 0 && (
        <>
          <h3 className="am-form-sub">Milestones</h3>
          <ul className="am-list">
            {written.milestones.map((m, i) => (
              <li key={i}><span>{m.target}</span><span className="am-muted">Week {m.week}</span></li>
            ))}
          </ul>
        </>
      )}

      {written.tips.length > 0 && (
        <>
          <h3 className="am-form-sub">Habits</h3>
          <ul className="am-coach-tips">{written.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </>
      )}

      {written.questions.length > 0 && (
        <div className="am-coach-questions">
          <h3 className="am-form-sub">The coach would like to know</h3>
          {written.questions.map((q) => (
            <label key={q} className="am-field">
              <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 13, color: 'var(--am-ink)' }}>{q}</span>
              <input className="am-input" value={answers[q] ?? ''}
                     onChange={(e) => setAnswers((a) => ({ ...a, [q]: e.target.value }))} />
            </label>
          ))}
        </div>
      )}

      {error && <p className="am-error">{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {written.questions.length > 0 && (
          <button type="button" className="am-btn am-btn-primary" disabled={busy || !answered} onClick={() => onRun(answers)}>
            {busy ? 'Refining…' : 'Refine with my answers'}
          </button>
        )}
        <button type="button" className="am-btn" disabled={busy || !payload.ai.available} onClick={() => onRun({})}>
          {busy && written.questions.length === 0 ? 'Rewriting…' : 'Rewrite plan'}
        </button>
      </div>
      <p className="am-muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
        The coach's topic order now leads your week-by-week plan.
      </p>
    </section>
  );
}

export default function StudyPlan() {
  useDocumentTitle('Study Plan');
  const { data, error, loading, reload } = useApi(() => amc.plan(), []);
  const [payload, setPayload] = useState<PlanPayload | null>(null);
  const [editing, setEditing] = useState(false);
  const [coaching, setCoaching] = useState(false);
  const [coachError, setCoachError] = useState('');
  useEffect(() => {
    if (data) setPayload(data);
  }, [data]);

  /** Ask the AI coach to write (or refine) the plan. Up to a minute. */
  async function runCoach(answers: Record<string, string>) {
    setCoaching(true);
    setCoachError('');
    try {
      const reply = await amc.coach(answers);
      if (reply.success) {
        setPayload(reply);
        announceAmcChanged();
      } else {
        setCoachError(reply.message);
      }
    } catch (cause) {
      setCoachError(cause instanceof Error ? cause.message : 'The coach could not be reached.');
    } finally {
      setCoaching(false);
    }
  }

  if (loading && !payload) return <Loading label="Loading your plan" />;
  if (error || !payload) return <ErrorState message={error ?? 'Could not load the plan.'} onRetry={reload} />;

  const { plan } = payload;
  if (!plan || editing) {
    return (
      <div className="amc-page">
        <PageHeader kicker="Plan" title="Study Plan">
          <p>
            A few answers and you get a week-by-week plan to contest day: your weakest high-weight topics first,
            timed mocks as the date gets close, and a light final week. Tell the coach more and{' '}
            {payload.ai.available ? `${payload.ai.label} writes` : 'an AI model can write'} a personal plan around it.
          </p>
        </PageHeader>
        <div style={{ maxWidth: 980 }}>
          <PlanForm
            initial={plan}
            defaults={payload.defaults}
            ai={payload.ai}
            onSaved={(p) => {
              setPayload(p);
              setEditing(false);
              // A new plan, or one without the coach's yet, gets written
              // straight away; an edited one is rewritten on request.
              if (p.ai.available && !p.plan?.coach) void runCoach({});
            }}
            onCancel={plan ? () => setEditing(false) : undefined}
          />
        </div>
      </div>
    );
  }

  const weeks = payload.weeks ?? [];
  const current = weeks.find((w) => w.current);
  const projected = payload.projected ?? null;

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
          <div className="am-countdown"><strong>{projected ?? '—'}</strong><span className="am-muted">/ goal {plan.goal_score}</span></div>
          <div style={{ marginTop: 10 }}>
            <Meter value={(projected ?? 0) / plan.goal_score} tone={projected != null && projected >= plan.goal_score ? 'good' : 'sage'} />
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

      <div style={{ marginBottom: 16 }}>
        <CoachCard payload={payload} busy={coaching} error={coachError} onRun={(a) => void runCoach(a)} />
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

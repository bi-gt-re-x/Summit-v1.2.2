/**
 * What each live source looks like, in each of its styles.
 *
 * One component per source. Each reads `config.view` for how to draw and
 * `config.metric` (where the source has one) for what the numbers are, and
 * draws with ./LiveCharts. The arithmetic is the server's
 * (backend/tracking/live.py); what is worked out here is only arrangement.
 */
import type { CSSProperties } from 'react';
import { Bar, Columns, Donut, HBars, HeatGrid, Insight, LineChart, Ring, Stat, Stats, colorVar, num } from './LiveCharts';
import {
  WEEKDAYS,
  amount,
  hourLabel,
  shortDate,
  whenFrom,
  type CalendarData,
  type GoalData,
  type GoalsData,
  type GrowthData,
  type HeatmapData,
  type LiveConfig,
  type LiveData,
  type Metric,
  type NodeState,
  type Pace,
  type ProductivityData,
  type RecordData,
  type RecordsData,
  type RhythmData,
  type SkillsData,
  type SubjectsData,
} from './live';

export function View({ config, data }: { config: LiveConfig; data: LiveData }) {
  const view = config.view;
  switch (config.source) {
    case 'goal':
      return 'empty' in data && data.empty ? <Note>No goal to show yet. Add one on the Goals page.</Note> : <GoalView view={view} data={data as GoalData} />;
    case 'goals':
      return <GoalsView view={view} data={data as GoalsData} />;
    case 'records':
      return <RecordsView view={view} data={data as RecordsData} />;
    case 'record':
      return 'empty' in data && data.empty ? <Note>No records yet. Log one on the Achievements page.</Note> : <RecordView view={view} data={data as RecordData} />;
    case 'calendar':
      return <CalendarView view={view} data={data as CalendarData} />;
    case 'productivity':
      return <ProductivityView view={view} data={data as ProductivityData} />;
    case 'growth':
      return <GrowthView view={view} data={data as GrowthData} />;
    case 'skills':
      return 'empty' in data && data.empty ? <Note>Pick a skill tree in settings.</Note> : <SkillsView view={view} data={data as SkillsData} />;
    case 'heatmap':
      return <HeatmapView view={view} metric={config.metric} data={data as HeatmapData} />;
    case 'rhythm':
      return <RhythmView view={view} metric={config.metric} data={data as RhythmData} />;
    case 'subjects':
      return <SubjectsView view={view} metric={config.metric} data={data as SubjectsData} />;
  }
}

function Note({ children }: { children: string }) {
  return <p className="sp-live-note">{children}</p>;
}

const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

// --------------------------------------------------------------------------
// Goals
// --------------------------------------------------------------------------
/** "On pace to finish Nov 4, 18 days early." in plain words. */
function paceWords(pace: Pace, done: boolean): string {
  if (done) return 'Done.';
  if (!pace.finish) return 'No progress yet, so no pace to go on.';
  const when = shortDate(pace.finish);
  if (pace.margin_days === null) return `At this pace you'll finish ${when}.`;
  if (pace.margin_days >= 0) return `On pace to finish ${when}, ${plural(pace.margin_days, 'day')} early.`;
  return `At this pace you'll finish ${when}, ${plural(-pace.margin_days, 'day')} late.`;
}

function PacePill({ pace, done }: { pace: Pace; done: boolean }) {
  if (done) return <span className="sp-live-pill is-on-track">Done</span>;
  if (pace.on_pace === null) return null;
  return <span className={`sp-live-pill ${pace.on_pace ? 'is-on-track' : 'is-behind'}`}>{pace.on_pace ? 'On pace' : 'Behind pace'}</span>;
}

function GoalView({ view, data }: { view: string; data: GoalData }) {
  const { goal, pace } = data;
  const done = goal.status === 'completed';
  const due = goal.deadline ? `Due ${shortDate(goal.deadline)} (${whenFrom(goal.deadline).toLowerCase()})` : 'No deadline';
  const late = goal.days_left !== null && goal.days_left < 0 && !done;
  const rates = (
    <Stats>
      <Stat value={`${pace.per_day}%`} label="a day so far" />
      {pace.needed_per_day !== null && <Stat value={`${pace.needed_per_day}%`} label="a day needed" />}
      <Stat value={String(data.done_this_week)} label="done this week" />
    </Stats>
  );

  if (view === 'ring') {
    return (
      <div className="sp-live-goal is-ring">
        <div className="sp-live-split">
          <Ring share={goal.progress} label={`${goal.title} progress`} size={130}>
            <strong>{Math.round(goal.progress)}%</strong>
            <span>{num(goal.current)}/{num(goal.target)}</span>
          </Ring>
          <div className="sp-live-goal-words">
            <PacePill pace={pace} done={done} />
            <span className={late ? 'is-late' : ''}>{done ? 'Done' : due}</span>
            <span>{paceWords(pace, done)}</span>
            {data.next_milestone && <span>Next: <strong>{data.next_milestone.title}</strong></span>}
          </div>
        </div>
        {rates}
      </div>
    );
  }

  if (view === 'timeline') {
    const start = new Date(`${pace.started}T00:00:00`).getTime();
    const endIso = goal.deadline ?? pace.finish ?? data.milestones.at(-1)?.date ?? null;
    const end = endIso ? new Date(`${endIso}T00:00:00`).getTime() : start + 30 * 86_400_000;
    const span = Math.max(1, end - start);
    const at = (iso: string | null) => (iso ? Math.max(0, Math.min(100, ((new Date(`${iso.slice(0, 10)}T00:00:00`).getTime() - start) / span) * 100)) : null);
    const today = at(new Date().toISOString().slice(0, 10));
    return (
      <div className="sp-live-goal is-timeline">
        <div className="sp-live-goal-top">
          <strong className="sp-live-big">{Math.round(goal.progress)}%</strong>
          <span className="sp-live-muted">{paceWords(pace, done)}</span>
          <PacePill pace={pace} done={done} />
        </div>
        <div className="sp-live-track" role="img" aria-label={`Checkpoints from ${shortDate(pace.started)} to ${goal.deadline ? shortDate(goal.deadline) : 'no deadline'}`}>
          <span className="sp-live-track-line" />
          <span className="sp-live-track-done" style={{ width: `${goal.progress}%` }} />
          {today !== null && <span className="sp-live-track-today" style={{ left: `${today}%` }} title="Today" />}
          {data.milestones.map((stone, i) => {
            const left = at(stone.date) ?? ((i + 1) / (data.milestones.length + 1)) * 100;
            return (
              <span key={stone.id} className={`sp-live-track-stone is-${stone.status}`} style={{ left: `${left}%` }} title={`${stone.title}${stone.date ? `, ${shortDate(stone.date)}` : ''}`} />
            );
          })}
        </div>
        <div className="sp-live-axis">
          <span>{shortDate(pace.started)}</span>
          <span>{goal.deadline ? shortDate(goal.deadline) : 'No deadline'}</span>
        </div>
        <ol className="sp-live-list sp-live-stones-list">
          {data.milestones.map((stone) => (
            <li key={stone.id} className={`is-${stone.status}`}>
              <span>{stone.status === 'done' ? '✓ ' : ''}{stone.title}</span>
              <span className="sp-live-muted">{stone.date ? shortDate(stone.date) : ''}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="sp-live-goal">
      <div className="sp-live-goal-top">
        <strong className="sp-live-big">{Math.round(goal.progress)}%</strong>
        <div className="sp-live-goal-words">
          <span>{num(goal.current)} of {num(goal.target)} {goal.unit}</span>
          <span className={late ? 'is-late' : ''}>{done ? 'Done' : due}</span>
        </div>
        <PacePill pace={pace} done={done} />
      </div>
      <Bar share={goal.progress} label={`${goal.title} progress`} />
      <Insight>{paceWords(pace, done)}</Insight>
      {data.next_milestone && (
        <div className="sp-live-next">
          <span className="sp-live-kicker">Next checkpoint</span>
          <strong>{data.next_milestone.title}</strong>
          <span>
            {data.next_milestone.date ? `${shortDate(data.next_milestone.date)} · ` : ''}
            {data.next_milestone.steps ? `${data.next_milestone.steps_done} of ${data.next_milestone.steps} steps` : 'No steps yet'}
          </span>
        </div>
      )}
      {rates}
      <div>
        <span className="sp-live-kicker">Recent work</span>
        {data.recent.length ? (
          <ul className="sp-live-list">
            {data.recent.slice(0, 3).map((row) => (
              <li key={`${row.at}-${row.title}`}>
                <span>{row.title}</span>
                <span className="sp-live-muted">{whenFrom(row.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sp-live-note">Nothing linked to this goal yet.</p>
        )}
      </div>
    </div>
  );
}

function GoalsView({ view, data }: { view: string; data: GoalsData }) {
  if (!data.goals.length) return <Note>No goals here yet.</Note>;
  const head = (
    <Stats>
      <Stat value={`${data.done}/${data.total}`} label="done" />
      <Stat value={String(data.on_pace)} label="on pace" />
      <Stat value={String(data.off_pace)} label="behind" />
      <Stat value={`${Math.round(data.average)}%`} label="average" />
    </Stats>
  );
  if (view === 'bars') {
    return (
      <div>
        {head}
        <HBars
          title="Goal progress"
          max={100}
          rows={data.goals.map((goal) => ({
            label: goal.title,
            value: goal.progress,
            display: `${Math.round(goal.progress)}%`,
            color: goal.done ? colorVar(1) : goal.pace.on_pace === false ? colorVar(3) : colorVar(0),
          }))}
        />
      </div>
    );
  }
  if (view === 'rings') {
    return (
      <div>
        {head}
        <div className="sp-live-rings">
          {data.goals.map((goal) => (
            <div key={goal.id} className="sp-live-rings-one">
              <Ring share={goal.progress} label={goal.title} size={84} color={goal.done ? colorVar(1) : goal.pace.on_pace === false ? colorVar(3) : undefined}>
                <strong>{Math.round(goal.progress)}%</strong>
              </Ring>
              <span title={goal.title}>{goal.title}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      {head}
      <ul className="sp-live-goals">
        {data.goals.map((goal) => (
          <li key={goal.id}>
            <div className="sp-live-goals-top">
              <strong title={goal.title}>{goal.title}</strong>
              <PacePill pace={goal.pace} done={goal.done} />
            </div>
            <Bar share={goal.progress} label={`${goal.title} progress`} color={goal.done ? colorVar(1) : undefined} />
            <span className="sp-live-muted">
              {Math.round(goal.progress)}%
              {goal.deadline && !goal.done ? ` · due ${whenFrom(goal.deadline).toLowerCase()}` : ''}
              {!goal.done && goal.pace.finish ? ` · lands ${shortDate(goal.pace.finish)}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --------------------------------------------------------------------------
// Records
// --------------------------------------------------------------------------
/** A small line through some values, no axes. */
function Spark({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return <span />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const d = values.map((v, i) => `${i ? 'L' : 'M'} ${(i / (values.length - 1)) * 100} ${28 - ((v - lo) / span) * 24}`).join(' ');
  return (
    <svg className="sp-live-spark" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const sinceFirst = (row: { improvement: number; direction: 'higher' | 'lower'; entries: number }) =>
  row.entries > 1 && row.improvement ? `${row.improvement > 0 ? '+' : ''}${num(row.direction === 'lower' ? -row.improvement : row.improvement)}` : '';

function RecordsView({ view, data }: { view: string; data: RecordsData }) {
  if (!data.bests.length) return <Note>No records yet. Log one on the Achievements page.</Note>;
  if (view === 'bars') {
    const rows = data.bests.map((row) => ({
      label: row.name,
      value: row.first ? Math.abs(row.improvement / row.first) * 100 : 0,
      display: `${num(row.best)}${row.unit ? ` ${row.unit}` : ''}`,
    }));
    return (
      <div>
        <span className="sp-live-kicker">How far each best has come since the first try</span>
        <HBars title="Improvement since first entry" rows={rows} />
      </div>
    );
  }
  if (view === 'table') {
    return (
      <div className="sp-live-table-wrap">
        <table className="sp-live-table">
          <thead>
            <tr><th>Record</th><th>Best</th><th>First</th><th>Latest</th><th>Change</th><th>Tries</th></tr>
          </thead>
          <tbody>
            {data.bests.map((row) => (
              <tr key={row.name}>
                <td title={row.category}>{row.name}</td>
                <td><strong>{num(row.best)}</strong> {row.unit}</td>
                <td>{num(row.first)}</td>
                <td>{num(row.latest)}</td>
                <td>{sinceFirst(row) || '-'}</td>
                <td>{row.entries}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <ul className="sp-live-records">
      {data.bests.map((row) => (
        <li key={row.name}>
          <div className="sp-live-rec-words">
            <strong>{row.name}</strong>
            <span className="sp-live-muted">
              {row.best_on ? `Best on ${shortDate(row.best_on)}` : 'Best'}
              {sinceFirst(row) ? ` · ${sinceFirst(row)} since first` : ''}
            </span>
          </div>
          <Spark values={row.history.map((h) => h.value)} label={`${row.name} over time`} />
          <span className="sp-live-rec-best">
            {num(row.best)}
            {row.unit && <small> {row.unit}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RecordView({ view, data }: { view: string; data: RecordData }) {
  const unit = data.unit ? ` ${data.unit}` : '';
  const lower = data.direction === 'lower';
  const values = data.history.map((row) => row.value);
  const bestSoFar = values.reduce<number[]>((all, v) => [...all, all.length ? (lower ? Math.min(all.at(-1)!, v) : Math.max(all.at(-1)!, v)) : v], []);
  const head = (
    <div className="sp-live-split">
      {data.target ? (
        <Ring share={data.to_target ?? 0} label={`Toward ${num(data.target)}${unit}`} size={96}>
          <strong>{num(data.best)}</strong>
          <span>of {num(data.target)}</span>
        </Ring>
      ) : (
        <strong className="sp-live-big">{num(data.best)}<small>{unit}</small></strong>
      )}
      <Stats>
        <Stat value={`${data.improvement > 0 ? '+' : ''}${num(lower ? -data.improvement : data.improvement)}`} label="since first" hint={data.improvement_pct !== null ? `${data.improvement_pct}%` : undefined} />
        <Stat value={String(data.bests.length)} label={data.bests.length === 1 ? 'best' : 'new bests'} />
        {data.average_gain !== null && <Stat value={`${data.average_gain > 0 ? '+' : ''}${num(data.average_gain)}`} label="a try, on average" />}
      </Stats>
    </div>
  );
  const story = (
    <Insight>
      {data.days_since_best === null
        ? `${plural(data.history.length, 'entry', 'entries')} so far.`
        : data.days_since_best === 0
          ? 'New best today.'
          : `Last new best was ${plural(data.days_since_best, 'day')} ago.`}
      {data.target && data.to_target !== null && data.to_target < 100 ? ` ${data.to_target}% of the way to ${num(data.target)}${unit}.` : ''}
    </Insight>
  );
  if (view === 'bars') {
    const best = values.indexOf(data.best);
    return (
      <div>
        {head}
        <Columns title={`${data.name} entries`} values={values} labels={data.history.map((row) => (row.on ? shortDate(row.on).split(', ')[1] ?? '' : ''))} mark={best} format={(v) => num(v)} />
        {story}
      </div>
    );
  }
  if (view === 'steps') {
    return (
      <div>
        {head}
        <ol className="sp-live-steps">
          {data.bests.map((row, i) => {
            const gain = i ? row.value - data.bests[i - 1]!.value : null;
            return (
              <li key={`${row.on}-${i}`}>
                <span className="sp-live-step-dot" aria-hidden="true" />
                <strong>{num(row.value)}{unit}</strong>
                <span className="sp-live-muted">{row.on ? shortDate(row.on) : 'Undated'}</span>
                {gain !== null && <em className="is-up">{gain > 0 ? '+' : ''}{num(gain)}</em>}
              </li>
            );
          })}
        </ol>
        {story}
      </div>
    );
  }
  const first = data.history[0]?.on;
  const last = data.history.at(-1)?.on;
  return (
    <div>
      {head}
      <LineChart
        title={`${data.name} over time`}
        from={first ? shortDate(first) : 'First'}
        to={last ? shortDate(last) : 'Latest'}
        series={[
          { values, kind: 'area', label: 'Each try' },
          { values: bestSoFar, kind: 'dash', label: 'Best so far' },
          ...(data.target ? [{ values: values.map(() => data.target!), kind: 'dash' as const, label: 'Target', color: colorVar(1) }] : []),
        ]}
      />
      {story}
    </div>
  );
}

// --------------------------------------------------------------------------
// Calendar
// --------------------------------------------------------------------------
const KIND_MARK: Record<CalendarData['items'][number]['kind'], string> = { task: '○', milestone: '◆', deadline: '⚑' };

function CalendarView({ view, data }: { view: string; data: CalendarData }) {
  if (!data.items.length) return <Note>{`Nothing due in the next ${data.days} days.`}</Note>;
  if (view === 'week') {
    const start = new Date(`${data.start}T00:00:00`);
    const days = Array.from({ length: Math.min(7, data.days) }, (_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      return { iso, items: data.items.filter((item) => (i === 0 ? item.date <= iso : item.date === iso)) };
    });
    return (
      <div className="sp-live-week">
        {days.map((day) => (
          <div key={day.iso} className="sp-live-week-day">
            <span className="sp-live-kicker">{shortDate(day.iso).split(',')[0]} {Number(day.iso.slice(8))}</span>
            {day.items.map((item) => (
              <span key={`${item.kind}-${item.id}`} className={`sp-live-week-item is-${item.kind}${item.overdue ? ' is-late' : ''}`} title={item.title}>
                {item.title}
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  }
  const groups = new Map<string, CalendarData['items']>();
  for (const item of data.items) {
    const key = item.overdue ? 'overdue' : item.date;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (
    <div className="sp-live-cal">
      {[...groups.entries()].map(([key, items]) => (
        <div key={key}>
          <span className={`sp-live-kicker${key === 'overdue' ? ' is-late' : ''}`}>
            {key === 'overdue' ? 'Overdue' : `${whenFrom(key)} · ${shortDate(key)}`}
          </span>
          <ul className="sp-live-list">
            {items.map((item) => (
              <li key={`${item.kind}-${item.id}`} className={`is-${item.kind}`}>
                <span>
                  <span className="sp-live-mark" aria-hidden="true">{KIND_MARK[item.kind]}</span>
                  {item.title}
                  {item.goal && <span className="sp-live-muted"> · {item.goal}</span>}
                  {item.kind === 'deadline' && <span className="sp-live-muted"> · goal deadline</span>}
                </span>
                <span className="sp-live-muted">{item.time ?? ''}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {data.total > data.items.length && <p className="sp-live-note">+{data.total - data.items.length} more</p>}
    </div>
  );
}

// --------------------------------------------------------------------------
// Productivity and growth
// --------------------------------------------------------------------------
function ProductivityView({ view, data }: { view: string; data: ProductivityData }) {
  const metric = data.metric;
  const thisWeek = data.weeks.at(-1);
  const values = data.weeks.map((week) => week.value);
  const labels = data.weeks.map((week, i) => (i === data.weeks.length - 1 ? 'This wk' : shortDate(week.start).split(', ')[1] ?? ''));
  const trendWord = data.trend_per_week > 0 ? 'up' : data.trend_per_week < 0 ? 'down' : 'flat';
  const chart =
    view === 'line' ? (
      <LineChart
        title={`${metric} by week`}
        from={labels[0] ?? ''}
        to="This week"
        series={[{ values, kind: 'line', label: 'Each week' }, { values: data.trend_line, kind: 'dash', label: 'Trend' }]}
      />
    ) : view === 'area' ? (
      <LineChart
        title={`${metric} by day, last 4 weeks`}
        from={shortDate(data.days[0]?.date ?? null)}
        to="Today"
        series={[{ values: data.days.map((day) => day.value), kind: 'area', label: 'Each day' }, { values: data.days.map((day) => day.avg7), kind: 'dash', label: '7-day average' }]}
      />
    ) : (
      <Columns title={`${metric} by week`} values={values} labels={labels} overlay={data.trend_line} overlayLabel="Dashed line: trend" />
    );
  return (
    <div className="sp-live-prod">
      <Stats>
        <Stat value={amount(thisWeek?.value ?? 0, metric)} label="this week" change={data.change} />
        <Stat value={amount(data.forecast, metric)} label="forecast next week" />
        <Stat value={`${data.streak}`} label="day streak" />
      </Stats>
      {chart}
      <Insight>
        Trending {trendWord}
        {data.trend_per_week ? ` by ${amount(Math.abs(data.trend_per_week), metric)} a week` : ''}.
        {data.best_week ? ` Best week started ${shortDate(data.best_week.start)}.` : ''}
        {data.steadiness !== null ? ` Steadiness ${data.steadiness}/100.` : ''}
      </Insight>
      <div>
        <span className="sp-live-kicker">Last 4 weeks · {data.consistency}% of days · {amount(data.per_active_day, metric)} a working day</span>
        <div className="sp-live-days" role="img" aria-label={`Worked on ${data.active_days} of the last ${data.days.length} days`}>
          {data.days.map((day) => (
            <span key={day.date} className={day.active ? 'is-on' : ''} title={`${shortDate(day.date)}: ${day.active ? amount(day.value, metric) : 'nothing'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function GrowthView({ view, data }: { view: string; data: GrowthData }) {
  const metric = data.metric;
  const values = data.points.map((point) => point.value);
  const by = data.step === 7 ? 'week' : 'day';
  const labels = data.points.map((point) => shortDate(point.date).split(', ')[1] ?? '');
  const chart =
    view === 'bars' ? (
      <Columns title={`${metric} by ${by}`} values={values} labels={labels} overlay={data.points.map((point) => point.avg)} overlayLabel="Dashed line: rolling average" height={110} />
    ) : view === 'cumulative' ? (
      <LineChart title={`Running total of ${metric}`} from={shortDate(data.start)} to="Today" series={[{ values: data.points.map((point) => point.total), kind: 'area', label: 'Running total' }]} />
    ) : (
      <LineChart
        title={`${metric} by ${by}`}
        from={shortDate(data.start)}
        to="Today"
        series={[
          { values, kind: view === 'line' ? 'line' : 'area', label: `Each ${by}` },
          { values: data.points.map((point) => point.avg), kind: 'dash', label: 'Rolling average' },
        ]}
      />
    );
  return (
    <div className="sp-live-growth">
      <Stats>
        <Stat value={num(data.now.xp)} label="XP" change={data.change.xp} />
        <Stat value={String(data.now.tasks)} label="tasks" change={data.change.tasks} />
        <Stat value={String(data.now.active_days)} label="active days" change={data.change.active_days} />
        {data.skills && data.skills.attempted > 0 && <Stat value={`${data.skills.accuracy}%`} label="accuracy" />}
      </Stats>
      {chart}
      <Insight>
        Compared with the {data.days} days before.
        {data.trend_per_step ? ` Trend: ${data.trend_per_step > 0 ? '+' : ''}${num(data.trend_per_step)} ${metric === 'xp' ? 'XP' : 'tasks'} a ${by}.` : ''}
        {data.peak ? ` Biggest ${by}: ${shortDate(data.peak.date)}.` : ''}
        {data.skills && data.skills.attempted > 0 ? ` ${num(data.skills.attempted)} practice problems answered.` : ''}
      </Insight>
    </div>
  );
}

// --------------------------------------------------------------------------
// Skills
// --------------------------------------------------------------------------
const STATE_LABEL: Record<NodeState, string> = { done: 'Done', doing: 'In progress', next: 'Up next', locked: 'Locked' };

function SkillsView({ view, data }: { view: string; data: SkillsData }) {
  const by = (state: NodeState) => data.nodes.filter((node) => node.state === state);
  const practiced = data.nodes.filter((node) => node.attempted > 0).sort((a, b) => b.attempted - a.attempted);
  const head = (
    <Stats>
      <Stat value={`${data.done}/${data.total}`} label="skills done" />
      <Stat value={String(data.doing)} label="in progress" />
      <Stat value={data.accuracy === null ? '-' : `${data.accuracy}%`} label="accuracy" />
    </Stats>
  );
  if (view === 'list') {
    return (
      <div>
        {head}
        <ul className="sp-live-list sp-live-skill-list">
          {data.nodes.map((node) => (
            <li key={node.id} className={`is-${node.state}`}>
              <span>
                <span className="sp-live-mark" aria-hidden="true">{node.state === 'done' ? '●' : node.state === 'doing' ? '◐' : node.state === 'next' ? '○' : '·'}</span>
                {node.name}
              </span>
              <span className="sp-live-muted">{node.level ? `L${node.level}` : STATE_LABEL[node.state]}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (view === 'accuracy') {
    if (!practiced.length) return <div>{head}<Note>No practice answered in this tree yet.</Note></div>;
    return (
      <div>
        {head}
        <span className="sp-live-kicker">Accuracy by topic</span>
        <HBars
          title="Accuracy by topic"
          max={100}
          rows={practiced.slice(0, 10).map((node) => ({
            label: node.name,
            value: node.accuracy ?? 0,
            display: node.accuracy === null ? '-' : `${node.accuracy}%`,
            color: (node.accuracy ?? 0) >= 85 ? colorVar(1) : (node.accuracy ?? 0) >= 70 ? colorVar(0) : colorVar(3),
          }))}
        />
      </div>
    );
  }
  if (view === 'ring') {
    const share = data.total ? (data.done / data.total) * 100 : 0;
    return (
      <div className="sp-live-split">
        <Ring share={share} label={`${data.title} done`} size={130}>
          <strong>{Math.round(share)}%</strong>
          <span>done</span>
        </Ring>
        <ul className="sp-live-key">
          {(['done', 'doing', 'next', 'locked'] as NodeState[]).map((state, i) => (
            <li key={state} style={{ '--c': colorVar([1, 2, 0, 7][i]!) } as CSSProperties}>
              <span className="sp-chart-swatch" aria-hidden="true" />
              <span className="sp-live-key-name">{STATE_LABEL[state]}</span>
              <span className="sp-live-key-num">{by(state).length}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="sp-live-skills">
      {head}
      <Bar share={data.total ? (data.done / data.total) * 100 : 0} label={`${data.title} skills done`} />
      <div className="sp-live-cols">
        {(['done', 'doing', 'next'] as NodeState[]).map((state) => {
          const nodes = by(state);
          return (
            <div key={state} className={`sp-live-col is-${state}`}>
              <span className="sp-live-kicker">{STATE_LABEL[state]} · {nodes.length}</span>
              <ul className="sp-live-nodes">
                {nodes.slice(0, 5).map((node) => (
                  <li key={node.id}>
                    <span>{node.name}</span>
                    {node.level > 0 && <span className="sp-live-muted">L{node.level}</span>}
                  </li>
                ))}
                {nodes.length > 5 && <li className="sp-live-muted">+{nodes.length - 5} more</li>}
                {nodes.length === 0 && <li className="sp-live-muted">None yet</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Heatmap, rhythm, subject mix
// --------------------------------------------------------------------------
function HeatmapView({ view, metric, data }: { view: string; metric?: Metric; data: HeatmapData }) {
  const head = (
    <Stats>
      <Stat value={`${data.share_active}%`} label="of days" />
      <Stat value={String(data.current_run)} label="day run now" />
      <Stat value={String(data.longest_run)} label="longest run" />
      <Stat value={amount(data.per_active_day, metric)} label="a working day" />
    </Stats>
  );
  const story = (
    <Insight>
      {data.busiest ? `Biggest day: ${shortDate(data.busiest.date)}, ${amount(data.busiest.value, metric)}.` : 'Nothing logged in this stretch yet.'}
      {data.best_weekday !== null ? ` ${WEEKDAYS[data.best_weekday]}s carry the most.` : ''}
    </Insight>
  );
  if (view === 'strip') {
    const weeks: number[] = [];
    data.days.forEach((day, i) => {
      weeks[Math.floor(i / 7)] = (weeks[Math.floor(i / 7)] ?? 0) + day.value;
    });
    const weekday = [0, 0, 0, 0, 0, 0, 0];
    data.days.forEach((day, i) => {
      weekday[i % 7]! += day.value;
    });
    return (
      <div>
        {head}
        <Columns title={`${metric} by week`} values={weeks} labels={weeks.map((_, i) => (i === weeks.length - 1 ? 'Now' : ''))} height={90} />
        <HBars title="By weekday" rows={WEEKDAYS.map((name, i) => ({ label: name, value: weekday[i]!, display: amount(weekday[i]!, metric) }))} />
        {story}
      </div>
    );
  }
  return (
    <div>
      {head}
      <HeatGrid
        rows={7}
        rowLabels={['Mon', '', 'Wed', '', 'Fri', '', 'Sun']}
        title={`${data.weeks} weeks of ${metric}, darker is more`}
        cells={data.days.map((day) => ({ key: day.date, level: day.level, tip: `${shortDate(day.date)}: ${amount(day.value, metric)}` }))}
      />
      <div className="sp-live-heat-key" aria-hidden="true">
        Less {[0, 1, 2, 3, 4].map((level) => <span key={level} className={`is-l${level}`} />)} More
      </div>
      {story}
    </div>
  );
}

/** Quartile shades for a grid of counts, the way the heatmap does it. */
function shades(values: number[]): (value: number) => number {
  const worked = values.filter((v) => v > 0).sort((a, b) => a - b);
  const cut = (share: number) => (worked.length ? worked[Math.floor(share * (worked.length - 1))]! : 0);
  const edges = [cut(0.25), cut(0.5), cut(0.75)];
  return (value) => (value <= 0 ? 0 : 1 + edges.filter((edge) => value > edge).length);
}

function RhythmView({ view, metric, data }: { view: string; metric?: Metric; data: RhythmData }) {
  if (!data.total) return <Note>No finished tasks in this stretch yet.</Note>;
  const parts = data.parts;
  const top = (Object.keys(parts) as Array<keyof typeof parts>).sort((a, b) => parts[b] - parts[a])[0]!;
  const head = (
    <Stats>
      <Stat value={data.peak_day !== null ? WEEKDAYS[data.peak_day] ?? '-' : '-'} label="best day" />
      <Stat value={data.peak_hour !== null ? hourLabel(data.peak_hour) : '-'} label="best hour" />
      <Stat value={`${data.weekend_share}%`} label="on weekends" />
    </Stats>
  );
  const story = (
    <Insight>
      {`${parts[top]}% of it happens in the ${top}.`}
      {data.focus_score >= 50 ? ' Most of the week rides on a few days.' : ' Work is spread fairly evenly across the week.'}
    </Insight>
  );
  if (view === 'hour') {
    return (
      <div>
        {head}
        <Columns title={`${metric} by hour`} values={data.hour} labels={data.hour.map((_, h) => hourLabel(h))} mark={data.peak_hour ?? undefined} height={110} />
        <HBars title="Parts of the day" max={100} rows={(Object.keys(parts) as Array<keyof typeof parts>).map((name) => ({ label: name[0]!.toUpperCase() + name.slice(1), value: parts[name], display: `${parts[name]}%` }))} />
        {story}
      </div>
    );
  }
  if (view === 'grid') {
    const shade = shades(data.grid.flat());
    const cells = Array.from({ length: 24 }, (_, h) => data.grid.map((row, d) => ({ key: `${d}-${h}`, level: shade(row[h]!), tip: `${WEEKDAYS[d]} ${hourLabel(h)}: ${amount(row[h]!, metric)}` }))).flat();
    return (
      <div>
        {head}
        <HeatGrid rows={7} rowLabels={[...WEEKDAYS]} cells={cells} title="Weekday by hour, darker is more" />
        <div className="sp-live-axis"><span>12am</span><span>12pm</span><span>11pm</span></div>
        {story}
      </div>
    );
  }
  return (
    <div>
      {head}
      <Columns title={`${metric} by weekday`} values={data.weekday} labels={[...WEEKDAYS]} mark={data.peak_day ?? undefined} />
      {story}
    </div>
  );
}

function SubjectsView({ view, metric, data }: { view: string; metric?: Metric; data: SubjectsData }) {
  if (!data.rows.length) return <Note>{`No finished work in the last ${data.days} days.`}</Note>;
  const head = (
    <Stats>
      <Stat value={String(data.subjects)} label={data.subjects === 1 ? 'subject' : 'subjects'} />
      <Stat value={data.balance === null ? '-' : `${data.balance}/100`} label="balance" hint="100 is perfectly even, 0 is one subject only" />
      <Stat value={`${Math.round(data.top_share)}%`} label="in the top one" />
    </Stats>
  );
  const story = (
    <Insight>
      {data.new.length ? `New lately: ${data.new.join(', ')}. ` : ''}
      {data.dropped.length ? `Gone quiet: ${data.dropped.join(', ')}.` : ''}
      {!data.new.length && !data.dropped.length ? `Same subjects as the ${data.days} days before.` : ''}
    </Insight>
  );
  if (view === 'bars') {
    return (
      <div>
        {head}
        <HBars
          title="Work by subject"
          rows={data.rows.map((row) => ({
            label: row.name,
            value: row.value,
            display: amount(row.value, metric),
            note: row.change !== null ? <em className={`sp-live-hbar-change ${row.change >= 0 ? 'is-up' : 'is-down'}`}>{row.change > 0 ? '+' : ''}{row.change}%</em> : <em className="sp-live-hbar-change" />,
          }))}
        />
        {story}
      </div>
    );
  }
  return (
    <div>
      {head}
      <Donut
        title="Work by subject"
        hole={view !== 'pie'}
        rows={data.rows.map((row) => ({ label: row.name, value: row.value }))}
        center={<><strong>{num(data.total)}</strong><span>{metric === 'tasks' ? 'tasks' : 'XP'}</span></>}
      />
      {story}
    </div>
  );
}

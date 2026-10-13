/**
 * A live block on a space's page: one of the account's own systems, drawn
 * from its real data and kept up to date while the page is open.
 *
 * The block stores only its settings (./live). Everything it shows is read
 * from /api/spaces/live, again whenever ./liveWatch says the source moved:
 * at once for a change made in this tab, within one poll for a change made
 * anywhere else. The gear opens the settings, where the source and what it
 * looks at can be changed without making a new block; the arrow reads again
 * by hand.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import type { Block } from './blocks';
import {
  AHEAD,
  LIMIT_MAX,
  LIVE_SOURCES,
  SOURCE_INFO,
  WEEKS,
  WINDOWS,
  agoFrom,
  cleanLive,
  defaultLive,
  liveKey,
  shortDate,
  signed,
  whenFrom,
  type CalendarData,
  type GoalData,
  type GrowthData,
  type LiveConfig,
  type LiveData,
  type LiveOptions,
  type LiveSource,
  type NodeState,
  type ProductivityData,
  type RecordsData,
  type SkillsData,
} from './live';
import { latestRevisions, watchLive } from './liveWatch';
import { liveOptions, readLive } from '@/services/live';

/** Read again on the next poll once a reading is this old, whatever the stamps say (a new day, say). */
const STALE_MS = 10 * 60 * 1000;

interface Reading {
  data: LiveData | null;
  /** Which source `data` came from. A view only ever draws its own source's shape. */
  source: LiveSource | null;
  error: string | null;
  loading: boolean;
  at: number | null;
}

/** What one config shows, kept fresh. */
export function useLive(config: LiveConfig): Reading & { refresh: () => void } {
  const key = liveKey(config);
  const [reading, setReading] = useState<Reading>({ data: null, source: null, error: null, loading: true, at: null });
  const revision = useRef<string | null>(null);
  const at = useRef<number>(0);
  const seq = useRef(0);
  const current = useRef(config);
  current.current = config;

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setReading((was) => ({ ...was, loading: true }));
    try {
      const asked = current.current;
      const reply = await readLive(asked);
      if (mine !== seq.current) return;
      if (reply.success) {
        revision.current = reply.revision;
        at.current = Date.now();
        setReading({ data: reply.data, source: asked.source, error: null, loading: false, at: at.current });
      } else {
        setReading((was) => ({ ...was, error: reply.message || "Couldn't load this.", loading: false }));
      }
    } catch {
      if (mine === seq.current) setReading((was) => ({ ...was, error: "Couldn't reach Summit.", loading: false }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [key, load]);

  useEffect(
    () =>
      watchLive((signal) => {
        const source = current.current.source;
        const stamp = signal.revisions?.[source];
        if (signal.changed?.includes(source)) void load();
        else if (stamp && stamp !== revision.current) void load();
        else if (signal.revisions && at.current && Date.now() - at.current > STALE_MS) void load();
      }),
    [load],
  );

  // A stamp newer than this reading, seen before the block mounted.
  useEffect(() => {
    const stamp = latestRevisions()[config.source];
    if (stamp && revision.current && stamp !== revision.current) void load();
  }, [config.source, load]);

  // Settings moved to another source: what was read before is the wrong shape.
  const data = reading.source === config.source ? reading.data : null;
  return { ...reading, data, refresh: () => void load() };
}

export interface LiveBlockProps {
  one: Block;
  disabled: boolean;
  register: (node: HTMLDivElement | null) => void;
  onChange: (change: { text?: string; live?: LiveConfig }) => void;
  onKey: (event: KeyboardEvent<HTMLDivElement>) => void;
}

export function LiveBlock({ one, disabled, register, onChange, onKey }: LiveBlockProps) {
  const config = cleanLive(one.live);
  const info = SOURCE_INFO[config.source];
  const { data, error, loading, at, refresh } = useLive(config);
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  const [flash, setFlash] = useState(false);
  const shown = useRef<number | null>(null);

  // "Updated 12s ago" keeps counting.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // A brief glow when new numbers arrive, so a change is seen as well as made.
  useEffect(() => {
    if (at === null) return undefined;
    if (shown.current !== null && at !== shown.current) {
      setFlash(true);
      const id = setTimeout(() => setFlash(false), 900);
      shown.current = at;
      return () => clearTimeout(id);
    }
    shown.current = at;
    return undefined;
  }, [at]);

  const title = titleOf(config, data);
  return (
    <div
      ref={register}
      className={`sp-live is-${config.source}${flash ? ' is-fresh' : ''}`}
      role="figure"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${info.label}: ${one.text || title}`}
      aria-busy={loading || undefined}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget) onKey(event);
      }}
    >
      <div className="sp-live-head">
        <span className="sp-live-glyph" aria-hidden="true">{info.glyph}</span>
        <input
          className="sp-chart-title sp-live-title"
          value={one.text}
          placeholder={title}
          aria-label="Block title"
          maxLength={120}
          disabled={disabled}
          onChange={(event) => onChange({ text: event.target.value })}
        />
        <span className="sp-live-badge" title="Updates on its own when your data changes">
          <span className="sp-live-dot" aria-hidden="true" />
          <span className="sp-live-badge-word">Live</span>
        </span>
        {!disabled && (
          <button
            type="button"
            className="sp-live-btn"
            aria-label="Block settings"
            title="Settings"
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h7M12 4h2M2 12h2M7 12h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="10.5" cy="4" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="5.5" cy="12" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
        )}
        <button type="button" className="sp-live-btn" aria-label="Refresh" title="Refresh" onClick={refresh}>
          <svg viewBox="0 0 16 16" aria-hidden="true" className={loading ? 'is-spinning' : undefined}><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5V5h-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      {open && !disabled && <LiveSettings config={config} onChange={(live) => onChange({ live })} />}

      <div className="sp-live-body">
        {error && !data ? (
          <p className="sp-live-note">{error}</p>
        ) : !data ? (
          <p className="sp-live-note">Loading…</p>
        ) : (
          <View config={config} data={data} />
        )}
      </div>

      <div className="sp-live-foot">
        <span>{error && data ? `Couldn't refresh. Showing what was there ${agoFrom(at)}.` : at ? `Updated ${agoFrom(at)}` : ''}</span>
        <Go to={HOME[config.source]}>Open {HOME_LABEL[config.source]}</Go>
      </div>
    </div>
  );
}

const HOME: Record<LiveSource, string> = {
  goal: '/goals',
  skills: '/skill-trees',
  productivity: '/analytics',
  records: '/achievements',
  calendar: '/calendar',
  growth: '/analytics/growth',
};
const HOME_LABEL: Record<LiveSource, string> = {
  goal: 'Goals',
  skills: 'Skill trees',
  productivity: 'Analytics',
  records: 'Achievements',
  calendar: 'Calendar',
  growth: 'Growth',
};

/** A link inside the app, or a plain one where there is no router (a test). */
function Go({ to, children }: { to: string; children: ReactNode }) {
  return useInRouterContext() ? <Link className="sp-live-link" to={to}>{children}</Link> : <a className="sp-live-link" href={to}>{children}</a>;
}

/** What the block calls itself when the reader hasn't named it. */
function titleOf(config: LiveConfig, data: LiveData | null): string {
  const label = SOURCE_INFO[config.source].label;
  if (!data) return label;
  if (config.source === 'goal' && !(data as GoalData).empty && 'goal' in data) return (data as GoalData).goal.title;
  if (config.source === 'skills' && 'title' in data) return `${(data as SkillsData).title} skill tree`;
  if (config.source === 'growth') {
    const growth = data as GrowthData;
    return `${growth.name || 'All subjects'}, last ${growth.days} days`;
  }
  if (config.source === 'calendar') return `Next ${(data as CalendarData).days} days`;
  if (config.source === 'records') return config.category ? `${config.category} records` : 'Personal bests';
  return label;
}

// --------------------------------------------------------------------------
// Settings
// --------------------------------------------------------------------------
function LiveSettings({ config, onChange }: { config: LiveConfig; onChange: (next: LiveConfig) => void }) {
  const [options, setOptions] = useState<LiveOptions | null>(null);
  useEffect(() => {
    let live = true;
    liveOptions()
      .then((reply) => {
        if (live && reply.success) setOptions(reply);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const set = (patch: Record<string, unknown>) => onChange(cleanLive({ ...config, ...patch }));
  return (
    <div className="sp-live-settings" role="group" aria-label="Block settings">
      <label className="sp-live-field">
        Shows
        <select value={config.source} onChange={(event) => onChange(defaultLive(event.target.value as LiveSource))}>
          {LIVE_SOURCES.map((source) => (
            <option key={source} value={source}>{SOURCE_INFO[source].label}</option>
          ))}
        </select>
      </label>

      {config.source === 'goal' && (
        <label className="sp-live-field">
          Goal
          <select value={config.goal} onChange={(event) => set({ goal: event.target.value })}>
            <option value="">Whichever is most urgent</option>
            {options?.goals.map((goal) => (
              <option key={goal.id} value={goal.id}>{goal.title}{goal.done ? ' (done)' : ''}</option>
            ))}
          </select>
        </label>
      )}
      {config.source === 'skills' && (
        <label className="sp-live-field">
          Tree
          <select value={config.tree} onChange={(event) => set({ tree: event.target.value })}>
            <option value="">The one you practice most</option>
            {options?.trees.map((tree) => (
              <option key={tree.id} value={tree.id}>{tree.title}</option>
            ))}
          </select>
        </label>
      )}
      {config.source === 'productivity' && (
        <Choice label="Weeks" value={config.weeks} choices={WEEKS} onPick={(weeks) => set({ weeks })} />
      )}
      {config.source === 'records' && (
        <>
          <label className="sp-live-field">
            Category
            <select value={config.category} onChange={(event) => set({ category: event.target.value })}>
              <option value="">All of them</option>
              {options?.categories.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="sp-live-field">
            Show
            <select value={config.limit} onChange={(event) => set({ limit: Number(event.target.value) })}>
              {Array.from({ length: LIMIT_MAX }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {config.source === 'calendar' && (
        <Choice label="Days ahead" value={config.days} choices={AHEAD} onPick={(days) => set({ days })} />
      )}
      {config.source === 'growth' && (
        <>
          <label className="sp-live-field">
            Subject
            <select value={config.subject} onChange={(event) => set({ subject: event.target.value })}>
              <option value="">All subjects</option>
              {options?.subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </select>
          </label>
          <Choice label="Days" value={config.days} choices={WINDOWS} onPick={(days) => set({ days })} />
        </>
      )}
    </div>
  );
}

function Choice({ label, value, choices, onPick }: { label: string; value: number; choices: readonly number[]; onPick: (n: number) => void }) {
  return (
    <div className="sp-live-field">
      {label}
      <div className="sp-chart-kinds" role="radiogroup" aria-label={label}>
        {choices.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} className="sp-chart-kind" onClick={() => onPick(n)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Views
// --------------------------------------------------------------------------
function View({ config, data }: { config: LiveConfig; data: LiveData }) {
  switch (config.source) {
    case 'goal':
      return (data as GoalData).empty ? <p className="sp-live-note">No goal to show yet. Add one on the Goals page.</p> : <GoalView data={data as GoalData} />;
    case 'skills':
      return (data as SkillsData).empty ? <p className="sp-live-note">Pick a skill tree in settings.</p> : <SkillsView data={data as SkillsData} />;
    case 'productivity':
      return <ProductivityView data={data as ProductivityData} />;
    case 'records':
      return <RecordsView data={data as RecordsData} />;
    case 'calendar':
      return <CalendarView data={data as CalendarData} />;
    case 'growth':
      return <GrowthView data={data as GrowthData} />;
  }
}

const num = (value: number): string =>
  Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

function Bar({ share, label }: { share: number; label: string }) {
  const pct = Math.max(0, Math.min(100, share));
  return (
    <div className="sp-live-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

function Stat({ value, label, change }: { value: string; label: string; change?: number | null }) {
  const sign = signed(change);
  return (
    <div className="sp-live-stat">
      <strong>{value}</strong>
      <span>{label}</span>
      {sign && <em className={change! >= 0 ? 'is-up' : 'is-down'}>{sign}</em>}
    </div>
  );
}

function GoalView({ data }: { data: GoalData }) {
  const { goal } = data;
  const due = goal.deadline ? `Due ${shortDate(goal.deadline)} (${whenFrom(goal.deadline).toLowerCase()})` : 'No deadline';
  return (
    <div className="sp-live-goal">
      <div className="sp-live-goal-top">
        <strong className="sp-live-big">{Math.round(goal.progress)}%</strong>
        <div className="sp-live-goal-words">
          <span>{num(goal.current)} of {num(goal.target)} {goal.unit}</span>
          <span className={goal.days_left !== null && goal.days_left < 0 && goal.status !== 'completed' ? 'is-late' : ''}>
            {goal.status === 'completed' ? 'Done' : due}
          </span>
        </div>
        {goal.health?.label && <span className={`sp-live-pill is-${goal.health.state ?? 'none'}`} title={goal.health.reason ?? undefined}>{goal.health.label}</span>}
      </div>
      <Bar share={goal.progress} label={`${goal.title} progress`} />
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
      {data.milestones.length > 0 && (
        <ol className="sp-live-stones" aria-label="Checkpoints">
          {data.milestones.map((stone) => (
            <li key={stone.id} className={`is-${stone.status}`} title={stone.title}>
              <span className="sp-live-stone" aria-hidden="true" />
              <span className="sp-live-sr">{stone.title}: {stone.status === 'done' ? 'done' : 'open'}</span>
            </li>
          ))}
        </ol>
      )}
      <div>
        <span className="sp-live-kicker">Recent work {data.done_this_week ? `· ${data.done_this_week} this week` : ''}</span>
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

const STATE_LABEL: Record<NodeState, string> = { done: 'Done', doing: 'In progress', next: 'Up next', locked: 'Locked' };

function SkillsView({ data }: { data: SkillsData }) {
  const by = (state: NodeState) => data.nodes.filter((node) => node.state === state);
  const practiced = data.nodes.filter((node) => node.attempted > 0).sort((a, b) => b.attempted - a.attempted).slice(0, 6);
  return (
    <div className="sp-live-skills">
      <div className="sp-live-stats">
        <Stat value={`${data.done}/${data.total}`} label="skills done" />
        <Stat value={String(data.doing)} label="in progress" />
        <Stat value={data.accuracy === null ? '–' : `${data.accuracy}%`} label="accuracy" />
      </div>
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
      {practiced.length > 0 && (
        <div>
          <span className="sp-live-kicker">Accuracy by topic</span>
          <ul className="sp-live-acc">
            {practiced.map((node) => (
              <li key={node.id}>
                <span className="sp-live-acc-name">{node.name}</span>
                <Bar share={node.accuracy ?? 0} label={`${node.name} accuracy`} />
                <span className="sp-live-acc-num">{node.accuracy === null ? '–' : `${node.accuracy}%`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Columns({ values, labels, title }: { values: number[]; labels: string[]; title: string }) {
  const top = Math.max(1, ...values);
  return (
    <div className="sp-live-cols-chart" role="img" aria-label={`${title}: ${values.map((v, i) => `${labels[i]} ${v}`).join(', ')}`}>
      {values.map((value, i) => (
        <div key={i} className="sp-live-colbar" style={{ '--h': `${(value / top) * 100}%`, '--c': `var(--sp-chart-${i === values.length - 1 ? 0 : 4})` } as CSSProperties}>
          <span className="sp-live-colbar-num">{value ? num(value) : ''}</span>
          <span className="sp-live-colbar-fill" />
          <span className="sp-live-colbar-label">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function ProductivityView({ data }: { data: ProductivityData }) {
  const thisWeek = data.weeks[data.weeks.length - 1];
  return (
    <div className="sp-live-prod">
      <div className="sp-live-stats">
        <Stat value={num(thisWeek?.xp ?? 0)} label="XP this week" change={data.change} />
        <Stat value={String(thisWeek?.tasks ?? 0)} label="tasks this week" />
        <Stat value={`${data.streak}`} label="day streak" />
      </div>
      <Columns
        title="XP by week"
        values={data.weeks.map((week) => week.xp)}
        labels={data.weeks.map((week, i) => (i === data.weeks.length - 1 ? 'This wk' : shortDate(week.start).split(', ')[1] ?? ''))}
      />
      <div>
        <span className="sp-live-kicker">Last 4 weeks · {data.consistency}% of days</span>
        <div className="sp-live-days" role="img" aria-label={`Worked on ${data.active_days} of the last ${data.days.length} days`}>
          {data.days.map((day) => (
            <span key={day.date} className={day.active ? 'is-on' : ''} title={`${shortDate(day.date)}${day.active ? `: ${day.xp} XP` : ': nothing'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A small line through some values, no axes. */
function Spark({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
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

function RecordsView({ data }: { data: RecordsData }) {
  if (!data.bests.length) return <p className="sp-live-note">No records yet. Log one on the Achievements page.</p>;
  return (
    <ul className="sp-live-records">
      {data.bests.map((row) => (
        <li key={row.name}>
          <div className="sp-live-rec-words">
            <strong>{row.name}</strong>
            <span className="sp-live-muted">
              {row.best_on ? `Best on ${shortDate(row.best_on)}` : 'Best'}
              {row.entries > 1 && row.improvement ? ` · ${row.improvement > 0 ? '+' : ''}${num(row.direction === 'lower' ? -row.improvement : row.improvement)} since first` : ''}
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

const KIND_MARK: Record<CalendarData['items'][number]['kind'], string> = { task: '○', milestone: '◆', deadline: '⚑' };

function CalendarView({ data }: { data: CalendarData }) {
  if (!data.items.length) return <p className="sp-live-note">Nothing due in the next {data.days} days.</p>;
  const groups = new Map<string, CalendarData['items']>();
  for (const item of data.items) {
    const key = item.overdue ? 'overdue' : item.date;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (
    <div className="sp-live-cal">
      {[...groups.entries()].map(([key, items]) => (
        <div key={key} className="sp-live-cal-day">
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

function GrowthView({ data }: { data: GrowthData }) {
  const values = data.points.map((point) => point.xp);
  const top = Math.max(1, ...values);
  const line = values.map((v, i) => `${i ? 'L' : 'M'} ${(i / Math.max(1, values.length - 1)) * 100} ${38 - (v / top) * 34}`).join(' ');
  return (
    <div className="sp-live-growth">
      <div className="sp-live-stats">
        <Stat value={num(data.now.xp)} label="XP" change={data.change.xp} />
        <Stat value={String(data.now.tasks)} label="tasks" change={data.change.tasks} />
        <Stat value={String(data.now.active_days)} label="active days" change={data.change.active_days} />
        {data.skills && data.skills.attempted > 0 && (
          <Stat value={`${data.skills.accuracy}%`} label="accuracy" />
        )}
      </div>
      <svg className="sp-live-area" viewBox="0 0 100 40" preserveAspectRatio="none" role="img"
        aria-label={`XP ${data.step === 7 ? 'by week' : 'by day'} over the last ${data.days} days`}>
        <path className="sp-live-area-fill" d={`${line} L 100 40 L 0 40 Z`} />
        <path className="sp-live-area-line" d={line} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="sp-live-axis">
        <span>{shortDate(data.start)}</span>
        <span>Today</span>
      </div>
      <p className="sp-live-muted sp-live-small">
        Compared with the {data.days} days before.
        {data.skills && data.skills.attempted > 0
          ? ` ${data.skills.attempted} practice problems answered.`
          : ''}
      </p>
    </div>
  );
}

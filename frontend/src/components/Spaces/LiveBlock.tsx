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
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import type { Block } from './blocks';
import {
  AHEAD,
  GOAL_STATUS,
  GROUP_LABEL,
  HEAT_WEEKS,
  LIMIT_MAX,
  LIVE_GROUPS,
  METRICS,
  METRIC_LABEL,
  RHYTHM_DAYS,
  SOURCE_INFO,
  VIEWS,
  VIEW_LABEL,
  WEEKS,
  WINDOWS,
  agoFrom,
  cleanLive,
  defaultLive,
  readKey,
  type CalendarData,
  type GoalData,
  type GrowthData,
  type LiveConfig,
  type LiveData,
  type LiveGroup,
  type LiveOptions,
  type LiveSource,
  type Metric,
  type RecordData,
  type SkillsData,
} from './live';
import { latestRevisions, watchLive } from './liveWatch';
import { View } from './LiveViews';
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
  // The style is how it's drawn, not what's read: switching it reads nothing.
  const key = readKey(config);
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
        <span className="sp-live-badge" title="Updates when your data changes">
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
  goals: '/goals',
  records: '/achievements',
  record: '/achievements',
  calendar: '/calendar',
  productivity: '/analytics',
  growth: '/analytics/growth',
  skills: '/skill-trees',
  heatmap: '/analytics',
  rhythm: '/analytics',
  subjects: '/subjects',
};
const HOME_LABEL: Record<LiveSource, string> = {
  goal: 'Goals',
  goals: 'Goals',
  records: 'Achievements',
  record: 'Achievements',
  calendar: 'Calendar',
  productivity: 'Analytics',
  growth: 'Growth',
  skills: 'Skill trees',
  heatmap: 'Analytics',
  rhythm: 'Analytics',
  subjects: 'Subjects',
};

/** A link inside the app, or a plain one where there is no router (a test). */
function Go({ to, children }: { to: string; children: ReactNode }) {
  return useInRouterContext() ? <Link className="sp-live-link" to={to}>{children}</Link> : <a className="sp-live-link" href={to}>{children}</a>;
}

/** What the block calls itself when the reader hasn't named it. */
function titleOf(config: LiveConfig, data: LiveData | null): string {
  const label = SOURCE_INFO[config.source].label;
  const metric = config.metric ? METRIC_LABEL[config.metric] : '';
  if (!data) return label;
  switch (config.source) {
    case 'goal':
      return 'goal' in data ? (data as GoalData).goal.title : label;
    case 'goals':
      return config.status === 'done' ? 'Finished goals' : config.status === 'all' ? 'All goals' : 'Open goals';
    case 'record':
      return 'name' in data ? `${(data as RecordData).name} over time` : label;
    case 'records':
      return config.category ? `${config.category} records` : 'Personal bests';
    case 'skills':
      return 'title' in data ? `${(data as SkillsData).title} skill tree` : label;
    case 'growth': {
      const growth = data as GrowthData;
      return `${growth.name || 'All subjects'}, last ${growth.days} days`;
    }
    case 'calendar':
      return `Next ${(data as CalendarData).days} days`;
    case 'productivity':
      return `${metric} by week`;
    case 'heatmap':
      return `${metric}, last ${config.weeks} weeks`;
    case 'rhythm':
      return 'When the work gets done';
    case 'subjects':
      return `Subject mix, last ${config.days} days`;
  }
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
  const metrics = METRICS[config.source];
  return (
    <div className="sp-live-settings" role="group" aria-label="Block settings">
      <label className="sp-live-field">
        Shows
        <select value={config.source} onChange={(event) => onChange(defaultLive(event.target.value as LiveSource))}>
          {(Object.keys(LIVE_GROUPS) as LiveGroup[]).map((group) => (
            <optgroup key={group} label={GROUP_LABEL[group]}>
              {LIVE_GROUPS[group].map((source) => (
                <option key={source} value={source}>{SOURCE_INFO[source].label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <Words label="Style" value={config.view} choices={VIEWS[config.source]} name={(view) => VIEW_LABEL[view] ?? view} onPick={(view) => set({ view })} />
      {metrics && config.metric && (
        <Words label="Measure" value={config.metric} choices={metrics} name={(metric) => METRIC_LABEL[metric as Metric]} onPick={(metric) => set({ metric })} />
      )}

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
      {config.source === 'goals' && (
        <Words label="Goals" value={config.status} choices={GOAL_STATUS} name={(status) => ({ active: 'Open', all: 'All', done: 'Finished' })[status] ?? status} onPick={(status) => set({ status })} />
      )}
      {config.source === 'record' && (
        <label className="sp-live-field">
          Record
          <select value={config.name} onChange={(event) => set({ name: event.target.value })}>
            <option value="">The one logged most</option>
            {options?.records.map((name) => (
              <option key={name} value={name}>{name}</option>
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
      {config.source === 'productivity' && <Choice label="Weeks" value={config.weeks} choices={WEEKS} onPick={(weeks) => set({ weeks })} />}
      {config.source === 'heatmap' && <Choice label="Weeks" value={config.weeks} choices={HEAT_WEEKS} onPick={(weeks) => set({ weeks })} />}
      {config.source === 'rhythm' && <Choice label="Days" value={config.days} choices={RHYTHM_DAYS} onPick={(days) => set({ days })} />}
      {config.source === 'subjects' && <Choice label="Days" value={config.days} choices={WINDOWS} onPick={(days) => set({ days })} />}
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
      {config.source === 'calendar' && <Choice label="Days ahead" value={config.days} choices={AHEAD} onPick={(days) => set({ days })} />}
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
  return <Words label={label} value={String(value)} choices={choices.map(String)} name={(n) => n} onPick={(n) => onPick(Number(n))} />;
}

/** A row of buttons, one per choice, the chosen one pressed. */
function Words({ label, value, choices, name, onPick }: { label: string; value: string; choices: readonly string[]; name: (choice: string) => string; onPick: (choice: string) => void }) {
  return (
    <div className="sp-live-field">
      {label}
      <div className="sp-chart-kinds" role="radiogroup" aria-label={label}>
        {choices.map((choice) => (
          <button key={choice} type="button" role="radio" aria-checked={value === choice} className="sp-chart-kind" onClick={() => onPick(choice)}>
            {name(choice)}
          </button>
        ))}
      </div>
    </div>
  );
}

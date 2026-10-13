/**
 * A live block's settings and what each source sends back. No React.
 *
 * A live block stores where it looks (`LiveConfig`), never what it saw: the
 * numbers are read from the server every time the block draws
 * (backend/tracking/live.py), so the page is a window onto the account rather
 * than a copy of it. ./LiveBlock draws one; ./liveWatch says when to read
 * again.
 *
 * The sources and the choices each one offers come from shared/rules.json,
 * which the server cleans every saved block against.
 */
import { RULES } from '@/utils/sharedRules';

const LIVE = RULES.spaces.live;

export type LiveSource =
  | 'goal'
  | 'goals'
  | 'records'
  | 'record'
  | 'calendar'
  | 'productivity'
  | 'growth'
  | 'skills'
  | 'heatmap'
  | 'rhythm'
  | 'subjects';

/** The two sections the slash menu files live blocks under. */
export type LiveGroup = 'analytics' | 'goals';

export type Metric = 'xp' | 'tasks' | 'focus';

export const LIVE_SOURCES: readonly LiveSource[] = LIVE.sources as LiveSource[];
export const LIVE_GROUPS: Record<LiveGroup, readonly LiveSource[]> = LIVE.groups as Record<LiveGroup, LiveSource[]>;
export const VIEWS: Record<LiveSource, readonly string[]> = LIVE.views as Record<LiveSource, string[]>;
export const METRICS: Partial<Record<LiveSource, readonly Metric[]>> = LIVE.metrics as Partial<Record<LiveSource, Metric[]>>;
export const WINDOWS: readonly number[] = LIVE.windows;
export const WEEKS: readonly number[] = LIVE.weeks;
export const AHEAD: readonly number[] = LIVE.ahead;
export const HEAT_WEEKS: readonly number[] = LIVE.heat_weeks;
export const RHYTHM_DAYS: readonly number[] = LIVE.rhythm_days;
export const GOAL_STATUS: readonly string[] = LIVE.goal_status;
export const LIMIT_MAX: number = LIVE.limit_max;
export const POLL_MS: number = LIVE.poll_ms;

/** Settings every source has: how it's drawn, and (for some) what it measures. */
interface Common {
  view: string;
  metric?: Metric;
}

export type LiveConfig = Common &
  (
    | { source: 'goal'; goal: string }
    | { source: 'goals'; status: string }
    | { source: 'records'; category: string; limit: number }
    | { source: 'record'; name: string }
    | { source: 'calendar'; days: number }
    | { source: 'productivity'; weeks: number }
    | { source: 'growth'; subject: string; days: number }
    | { source: 'skills'; tree: string }
    | { source: 'heatmap'; weeks: number }
    | { source: 'rhythm'; days: number }
    | { source: 'subjects'; days: number }
  );

export interface SourceInfo {
  label: string;
  hint: string;
  glyph: string;
  keys: string[];
}

/** How each source is named in the slash menu and on the block. */
export const SOURCE_INFO: Record<LiveSource, SourceInfo> = {
  goal: { label: 'Goal progress', hint: "One goal's progress, pace and next checkpoint.", glyph: '◎', keys: ['goal', 'progress', 'milestone', 'deadline', 'pace'] },
  goals: { label: 'All goals', hint: 'Every goal at once, and which are on pace.', glyph: '☰', keys: ['goals', 'board', 'all', 'overview'] },
  records: { label: 'Records', hint: "Personal bests and how far they've come.", glyph: '🏆', keys: ['records', 'best', 'pr', 'personal'] },
  record: { label: 'Record history', hint: 'One record over time, with every new best.', glyph: '📈', keys: ['record', 'history', 'pr', 'best', 'progression'] },
  calendar: { label: 'Upcoming', hint: 'Tasks, checkpoints and deadlines coming up.', glyph: '📅', keys: ['calendar', 'upcoming', 'schedule', 'due', 'agenda'] },
  productivity: { label: 'Productivity', hint: 'Weekly trend, forecast and consistency.', glyph: '▤', keys: ['productivity', 'weekly', 'consistency', 'streak', 'forecast'] },
  growth: { label: 'Growth', hint: 'A subject over 7, 30 or 90 days.', glyph: '↗', keys: ['growth', 'subject', 'trend', 'progress'] },
  skills: { label: 'Skill tree', hint: "What's done and what's next in a tree.", glyph: '⌥', keys: ['skill', 'tree', 'nodes', 'accuracy'] },
  heatmap: { label: 'Activity heatmap', hint: 'Every day of the last few months, shaded.', glyph: '▦', keys: ['heatmap', 'activity', 'calendar', 'days', 'contributions'] },
  rhythm: { label: 'Weekly rhythm', hint: 'Which days and hours you get work done.', glyph: '◷', keys: ['rhythm', 'time', 'hour', 'weekday', 'when', 'pattern'] },
  subjects: { label: 'Subject mix', hint: 'How your work splits between subjects.', glyph: '◔', keys: ['subjects', 'mix', 'split', 'balance', 'breakdown', 'share'] },
};

export const GROUP_LABEL: Record<LiveGroup, string> = { analytics: 'Analytics', goals: 'Goals & records' };

/** What each style is called in a block's settings. */
export const VIEW_LABEL: Record<string, string> = {
  card: 'Card',
  ring: 'Ring',
  timeline: 'Timeline',
  list: 'List',
  bars: 'Bars',
  rings: 'Rings',
  table: 'Table',
  line: 'Line',
  steps: 'Bests',
  week: 'Week',
  area: 'Area',
  cumulative: 'Running total',
  columns: 'Columns',
  accuracy: 'Accuracy',
  grid: 'Grid',
  strip: 'Strip',
  weekday: 'By day',
  hour: 'By hour',
  donut: 'Donut',
  pie: 'Pie',
};

export const METRIC_LABEL: Record<Metric, string> = { xp: 'XP', tasks: 'Tasks', focus: 'Focus' };

/** What a new block of each source starts as. */
export function defaultLive(source: LiveSource): LiveConfig {
  const view = VIEWS[source]?.[0] ?? 'list';
  const metric = METRICS[source]?.[0];
  const common: Common = metric ? { view, metric } : { view };
  switch (source) {
    case 'goal':
      return { ...common, source, goal: '' };
    case 'goals':
      return { ...common, source, status: GOAL_STATUS[0] ?? 'active' };
    case 'records':
      return { ...common, source, category: '', limit: 5 };
    case 'record':
      return { ...common, source, name: '' };
    case 'calendar':
      return { ...common, source, days: AHEAD[0] ?? 7 };
    case 'productivity':
      return { ...common, source, weeks: WEEKS[1] ?? 8 };
    case 'growth':
      return { ...common, source, subject: '', days: WINDOWS[1] ?? 30 };
    case 'skills':
      return { ...common, source, tree: '' };
    case 'heatmap':
      return { ...common, source, weeks: HEAT_WEEKS[1] ?? 26 };
    case 'rhythm':
      return { ...common, source, days: RHYTHM_DAYS[1] ?? 90 };
    case 'subjects':
      return { ...common, source, days: WINDOWS[1] ?? 30 };
  }
}

const ref = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, LIVE.ref_max) : '';

const pick = (value: unknown, allowed: readonly number[], fallback: number): number =>
  allowed.includes(Number(value)) ? Number(value) : fallback;

const word = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;

/** Settings as stored, made safe: the server's `clean_config`, on this side. */
export function cleanLive(raw: unknown): LiveConfig {
  const one = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const source = (LIVE_SOURCES as readonly unknown[]).includes(one.source) ? (one.source as LiveSource) : LIVE_SOURCES[0]!;
  const base = defaultLive(source);
  const common: Common = { view: word(one.view, VIEWS[source] ?? [], base.view) };
  const metrics = METRICS[source];
  if (metrics) common.metric = word(one.metric, metrics, base.metric!);
  switch (base.source) {
    case 'goal':
      return { ...base, ...common, goal: ref(one.goal) };
    case 'goals':
      return { ...base, ...common, status: word(one.status, GOAL_STATUS, base.status) };
    case 'records': {
      const limit = Math.floor(Number(one.limit));
      return { ...base, ...common, category: ref(one.category), limit: limit >= 1 && limit <= LIMIT_MAX ? limit : base.limit };
    }
    case 'record':
      return { ...base, ...common, name: ref(one.name) };
    case 'calendar':
      return { ...base, ...common, days: pick(one.days, AHEAD, base.days) };
    case 'productivity':
      return { ...base, ...common, weeks: pick(one.weeks, WEEKS, base.weeks) };
    case 'growth':
      return { ...base, ...common, subject: ref(one.subject), days: pick(one.days, WINDOWS, base.days) };
    case 'skills':
      return { ...base, ...common, tree: ref(one.tree) };
    case 'heatmap':
      return { ...base, ...common, weeks: pick(one.weeks, HEAT_WEEKS, base.weeks) };
    case 'rhythm':
      return { ...base, ...common, days: pick(one.days, RHYTHM_DAYS, base.days) };
    case 'subjects':
      return { ...base, ...common, days: pick(one.days, WINDOWS, base.days) };
  }
}

/** The query /api/spaces/live is asked with. */
export const liveQuery = (config: LiveConfig): Record<string, string | number> =>
  Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined)) as Record<string, string | number>;

/** One string per distinct setting, for keying a read. */
export const liveKey = (config: LiveConfig): string =>
  Object.entries(config)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

/** The settings that change what is read, not how it's drawn. A new style needn't read again. */
export const readKey = (config: LiveConfig): string => {
  const { view: _view, ...rest } = config;
  return liveKey(rest as LiveConfig);
};

// --------------------------------------------------------------------------
// What comes back
// --------------------------------------------------------------------------
export interface Empty {
  empty: true;
}

export interface GoalData {
  empty: false;
  goal: {
    id: string;
    title: string;
    measure: string;
    status: string;
    progress: number;
    current: number;
    target: number;
    unit: string;
    deadline: string | null;
    days_left: number | null;
    health: { state: string | null; label: string | null; reason: string | null } | null;
  };
  milestones: Array<{ id: string; title: string; status: string; date: string | null; steps_done: number; steps: number }>;
  next_milestone: GoalData['milestones'][number] | null;
  recent: Array<{ title: string; at: string; xp: number }>;
  done_this_week: number;
  pace: Pace;
}

/** How fast a goal is moving and where that lands it (backend `pace`). */
export interface Pace {
  started: string;
  per_day: number;
  needed_per_day: number | null;
  finish: string | null;
  on_pace: boolean | null;
  margin_days: number | null;
}

export interface GoalsData {
  goals: Array<{
    id: string;
    title: string;
    progress: number;
    done: boolean;
    deadline: string | null;
    days_left: number | null;
    health: string | null;
    health_label: string | null;
    pace: Pace;
  }>;
  total: number;
  done: number;
  on_pace: number;
  off_pace: number;
  average: number;
}

export interface RecordData {
  empty: false;
  name: string;
  names: string[];
  unit: string;
  direction: 'higher' | 'lower';
  history: Array<{ value: number; on: string | null; best: boolean }>;
  bests: Array<{ value: number; on: string | null }>;
  best: number;
  first: number;
  latest: number;
  improvement: number;
  improvement_pct: number | null;
  average_gain: number | null;
  trend_per_entry: number;
  days_since_best: number | null;
  target: number | null;
  to_target: number | null;
}

export interface HeatmapData {
  weeks: number;
  start: string;
  days: Array<{ date: string; value: number; level: number }>;
  total: number;
  active_days: number;
  share_active: number;
  longest_run: number;
  current_run: number;
  busiest: { date: string; value: number } | null;
  per_active_day: number;
  best_weekday: number | null;
}

export interface RhythmData {
  days: number;
  grid: number[][];
  weekday: number[];
  hour: number[];
  total: number;
  peak_day: number | null;
  peak_hour: number | null;
  parts: Record<'morning' | 'afternoon' | 'evening' | 'night', number>;
  weekend_share: number;
  focus_score: number;
}

export interface SubjectsData {
  days: number;
  rows: Array<{ subject: string; name: string; value: number; share: number; before: number | null; change: number | null; other?: boolean }>;
  total: number;
  total_before: number;
  subjects: number;
  balance: number | null;
  top_share: number;
  new: string[];
  dropped: string[];
}

export type NodeState = 'done' | 'doing' | 'next' | 'locked';

export interface SkillsData {
  empty: false;
  tree: string;
  title: string;
  nodes: Array<{
    id: string;
    name: string;
    tier: string;
    level: number;
    mastery: number;
    accuracy: number | null;
    attempted: number;
    last_at: string | null;
    state: NodeState;
    requires: string[];
  }>;
  done: number;
  doing: number;
  total: number;
  attempted: number;
  accuracy: number | null;
}

export interface ProductivityData {
  metric: Metric;
  weeks: Array<{ start: string; end: string; xp: number; tasks: number; focus_minutes: number; active_days: number; value: number }>;
  days: Array<{ date: string; xp: number; active: boolean; value: number; avg7: number }>;
  consistency: number;
  active_days: number;
  streak: number;
  change: number | null;
  trend_per_week: number;
  trend_line: number[];
  forecast: number;
  best_week: { start: string; value: number } | null;
  average: number;
  steadiness: number | null;
  per_active_day: number;
}

export interface RecordsData {
  categories: string[];
  bests: Array<{
    name: string;
    category: string;
    unit: string;
    direction: 'higher' | 'lower';
    best: number;
    best_on: string | null;
    first: number;
    latest: number;
    improvement: number;
    entries: number;
    history: Array<{ value: number; on: string | null }>;
  }>;
  total: number;
  latest: Array<{ name: string; value: number; unit: string; on: string | null }>;
}

export interface CalendarData {
  days: number;
  start: string;
  end: string;
  items: Array<{
    kind: 'task' | 'milestone' | 'deadline';
    id: string;
    title: string;
    date: string;
    time: string | null;
    subject: string | null;
    goal?: string;
    overdue: boolean;
  }>;
  total: number;
  overdue: number;
}

export interface Totals {
  xp: number;
  tasks: number;
  focus_minutes: number;
  active_days: number;
}

export interface GrowthData {
  subject: string;
  /** The subject's name, or '' for every subject. */
  name: string;
  days: number;
  start: string;
  step: number;
  now: Totals;
  before: Totals;
  change: Record<keyof Totals, number | null>;
  metric: Metric;
  points: Array<{ date: string; xp: number; tasks: number; value: number; total: number; avg: number }>;
  trend_per_step: number;
  trend_line: number[];
  peak: { date: string; value: number } | null;
  skills: { attempted: number; accuracy: number | null; attempted_before: number; accuracy_before: number | null } | null;
}

export interface LiveDataBySource {
  goal: GoalData | Empty;
  goals: GoalsData;
  record: RecordData | Empty;
  heatmap: HeatmapData;
  rhythm: RhythmData;
  subjects: SubjectsData;
  skills: SkillsData | Empty;
  productivity: ProductivityData;
  records: RecordsData;
  calendar: CalendarData;
  growth: GrowthData;
}

export type LiveData = LiveDataBySource[LiveSource];

export interface LiveOptions {
  goals: Array<{ id: string; title: string; done: boolean }>;
  trees: Array<{ id: string; title: string }>;
  subjects: Array<{ id: string; name: string; used: number }>;
  categories: string[];
  records: string[];
}

// --------------------------------------------------------------------------
// Words
// --------------------------------------------------------------------------
/** A change in percent, signed: "+12%", "-4%", or "" with nothing to compare. */
export function signed(change: number | null | undefined): string {
  if (change === null || change === undefined || !Number.isFinite(change)) return '';
  return `${change > 0 ? '+' : ''}${change}%`;
}

/** "Today", "Tomorrow", "In 3 days", "2 days ago". */
export function whenFrom(iso: string | null, today: Date = new Date()): string {
  if (!iso) return '';
  const day = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((day.getTime() - base.getTime()) / 86_400_000);
  if (!Number.isFinite(diff)) return '';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
}

/** "Mon, Oct 13" for an ISO date. */
export function shortDate(iso: string | null): string {
  if (!iso) return '';
  const day = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(day.getTime())) return '';
  return day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "just now", "12s ago", "3m ago", "2h ago". */
export function agoFrom(then: number | null, now: number = Date.now()): string {
  if (!then) return '';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** "9am", "12pm", "5pm". */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
}

/** A metric's amount with its unit: "120 XP", "4 tasks", "95 min". */
export function amount(value: number, metric: Metric | undefined): string {
  const n = Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (metric === 'tasks') return `${n} ${value === 1 ? 'task' : 'tasks'}`;
  if (metric === 'focus') return `${n} min`;
  return `${n} XP`;
}

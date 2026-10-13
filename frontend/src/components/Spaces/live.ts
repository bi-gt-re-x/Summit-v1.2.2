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

export type LiveSource = 'goal' | 'skills' | 'productivity' | 'records' | 'calendar' | 'growth';

export const LIVE_SOURCES: readonly LiveSource[] = LIVE.sources as LiveSource[];
export const WINDOWS: readonly number[] = LIVE.windows;
export const WEEKS: readonly number[] = LIVE.weeks;
export const AHEAD: readonly number[] = LIVE.ahead;
export const LIMIT_MAX: number = LIVE.limit_max;
export const POLL_MS: number = LIVE.poll_ms;

export type LiveConfig =
  | { source: 'goal'; goal: string }
  | { source: 'skills'; tree: string }
  | { source: 'productivity'; weeks: number }
  | { source: 'records'; category: string; limit: number }
  | { source: 'calendar'; days: number }
  | { source: 'growth'; subject: string; days: number };

export interface SourceInfo {
  label: string;
  hint: string;
  glyph: string;
  keys: string[];
}

/** How each source is named in the slash menu and on the block. */
export const SOURCE_INFO: Record<LiveSource, SourceInfo> = {
  goal: { label: 'Goal progress', hint: "A goal's progress, deadline and next checkpoint.", glyph: '◎', keys: ['goal', 'progress', 'milestone', 'deadline'] },
  skills: { label: 'Skill tree', hint: "What's done and what's next in a tree.", glyph: '⌥', keys: ['skill', 'tree', 'nodes', 'accuracy'] },
  productivity: { label: 'Productivity', hint: 'Weekly trend and daily consistency.', glyph: '▤', keys: ['productivity', 'weekly', 'consistency', 'streak'] },
  records: { label: 'Records', hint: "Personal bests and how far they've come.", glyph: '🏆', keys: ['records', 'best', 'pr', 'personal'] },
  calendar: { label: 'Calendar', hint: 'Tasks and checkpoints coming up.', glyph: '📅', keys: ['calendar', 'upcoming', 'schedule', 'due'] },
  growth: { label: 'Growth', hint: 'A subject over 7, 30 or 90 days.', glyph: '↗', keys: ['growth', 'subject', 'trend', 'progress'] },
};

/** What a new block of each source starts as. */
export function defaultLive(source: LiveSource): LiveConfig {
  switch (source) {
    case 'goal':
      return { source, goal: '' };
    case 'skills':
      return { source, tree: '' };
    case 'productivity':
      return { source, weeks: WEEKS[1] ?? 8 };
    case 'records':
      return { source, category: '', limit: 5 };
    case 'calendar':
      return { source, days: AHEAD[0] ?? 7 };
    case 'growth':
      return { source, subject: '', days: WINDOWS[1] ?? 30 };
  }
}

const ref = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, LIVE.ref_max) : '';

const pick = (value: unknown, allowed: readonly number[], fallback: number): number =>
  allowed.includes(Number(value)) ? Number(value) : fallback;

/** Settings as stored, made safe: the server's `clean_config`, on this side. */
export function cleanLive(raw: unknown): LiveConfig {
  const one = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const source = (LIVE_SOURCES as readonly unknown[]).includes(one.source) ? (one.source as LiveSource) : LIVE_SOURCES[0]!;
  const base = defaultLive(source);
  switch (base.source) {
    case 'goal':
      return { ...base, goal: ref(one.goal) };
    case 'skills':
      return { ...base, tree: ref(one.tree) };
    case 'productivity':
      return { ...base, weeks: pick(one.weeks, WEEKS, base.weeks) };
    case 'records': {
      const limit = Math.floor(Number(one.limit));
      return { ...base, category: ref(one.category), limit: limit >= 1 && limit <= LIMIT_MAX ? limit : base.limit };
    }
    case 'calendar':
      return { ...base, days: pick(one.days, AHEAD, base.days) };
    case 'growth':
      return { ...base, subject: ref(one.subject), days: pick(one.days, WINDOWS, base.days) };
  }
}

/** The query /api/spaces/live is asked with. */
export const liveQuery = (config: LiveConfig): Record<string, string | number> => ({ ...config });

/** One string per distinct setting, for keying a read. */
export const liveKey = (config: LiveConfig): string =>
  Object.entries(config)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

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
  weeks: Array<{ start: string; end: string; xp: number; tasks: number; focus_minutes: number; active_days: number }>;
  days: Array<{ date: string; xp: number; active: boolean }>;
  consistency: number;
  active_days: number;
  streak: number;
  change: number | null;
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
  points: Array<{ date: string; xp: number; tasks: number }>;
  skills: { attempted: number; accuracy: number | null; attempted_before: number; accuracy_before: number | null } | null;
}

export interface LiveDataBySource {
  goal: GoalData | Empty;
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

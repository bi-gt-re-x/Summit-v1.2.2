/**
 * A panel block's settings, and what each kind is called. No React.
 *
 * A panel block puts one of the app's own panels on a space's page — the
 * plan, the trend chart, the habit cards, the focus timer, the badges — drawn
 * by the component the page it comes from uses (./PanelBlock, ./panelViews),
 * from the account's numbers as they are now. Like a live block (./live) it
 * stores where it looks and how it is set, never what it saw.
 *
 * The kinds and the settings each one takes come from shared/rules.json
 * (`spaces.panels`): `fields` are every setting a kind may take, and a kind's
 * own entry names the ones it uses and may change their choices, limits or
 * default. backend/tracking/panels.py cleans every saved block the same way,
 * and shared/cases/space_panels.json holds both sides to it.
 */
import { RULES } from '@/utils/sharedRules';

const PANELS = RULES.spaces.panels;

export type PanelGroup = 'analytics' | 'suggest' | 'insights' | 'growth' | 'timer' | 'goals';

export type PanelKind = keyof typeof PANELS.kinds;

export type Value = string | number;

export type Field =
  | { type: 'choice'; of: readonly Value[]; default: Value }
  | { type: 'set'; of: readonly string[]; default: readonly string[] }
  | { type: 'count'; min: number; max: number; default: number }
  | { type: 'ref'; default: string };

export type FieldName = keyof typeof PANELS.fields;

/** A panel block as stored: its kind, and every setting that kind takes. */
export interface PanelConfig {
  kind: PanelKind;
  [setting: string]: Value | string[] | undefined;
}

export const PANEL_KINDS: readonly PanelKind[] = Object.keys(PANELS.kinds) as PanelKind[];
export const PANEL_GROUPS: readonly PanelGroup[] = PANELS.groups as PanelGroup[];
const REF_MAX: number = PANELS.ref_max;

interface KindEntry {
  group: string;
  name: string;
  fields: Record<string, Partial<Field>>;
}
const KIND = PANELS.kinds as Record<PanelKind, KindEntry>;
const FIELDS = PANELS.fields as unknown as Record<FieldName, Field>;

/** Which slash-menu section a kind is filed under. */
export const groupOf = (kind: PanelKind): PanelGroup => KIND[kind].group as PanelGroup;

/** The kinds in one section, in rules order. */
export const kindsIn = (group: PanelGroup): PanelKind[] => PANEL_KINDS.filter((kind) => groupOf(kind) === group);

/** The settings a kind takes, each with its own choices and default. */
export function fieldsOf(kind: PanelKind): Array<[FieldName, Field]> {
  return Object.entries(KIND[kind].fields).map(([name, change]) => [
    name as FieldName,
    { ...FIELDS[name as FieldName], ...change } as Field,
  ]);
}

/** One setting of a kind, or undefined when the kind doesn't take it. */
export function fieldOf(kind: PanelKind, name: FieldName): Field | undefined {
  return fieldsOf(kind).find(([own]) => own === name)?.[1];
}

/** A stored value matching a choice: equal, and the same kind of thing. */
const same = (value: unknown, choice: Value): boolean =>
  typeof choice === 'number' ? typeof value === 'number' && value === choice : typeof value === 'string' && value === choice;

function cleanField(field: Field, value: unknown): Value | string[] {
  switch (field.type) {
    case 'choice':
      return field.of.find((choice) => same(value, choice)) ?? field.default;
    case 'set': {
      if (!Array.isArray(value)) return [...field.default];
      const picked = field.of.filter((choice) => value.some((item) => same(item, choice)));
      return picked.length ? picked : [...field.default];
    }
    case 'count':
      return typeof value === 'number' && Number.isInteger(value) && value >= field.min && value <= field.max ? value : field.default;
    case 'ref':
      return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
        ? String(value).trim().slice(0, REF_MAX)
        : field.default;
  }
}

/** What a new block of each kind starts as. */
export function defaultPanel(kind: PanelKind): PanelConfig {
  return cleanPanel({ kind });
}

/**
 * Settings as stored, made safe: the server's `clean_panel`, on this side.
 * An unknown kind becomes the first; every setting the kind takes is filled
 * in, and anything it doesn't take is dropped.
 */
export function cleanPanel(raw: unknown): PanelConfig {
  const one = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const kind = (PANEL_KINDS as readonly unknown[]).includes(one.kind) ? (one.kind as PanelKind) : PANEL_KINDS[0]!;
  const out: PanelConfig = { kind };
  for (const [name, field] of fieldsOf(kind)) out[name] = cleanField(field, one[name]);
  return out;
}

// --------------------------------------------------------------------------
// What a page has to read for its panels
// --------------------------------------------------------------------------
/**
 * Where a kind's numbers come from.
 *
 * - `model`: the Analytics page's own figures (components/Analytics/
 *   useAnalyticsModel), worked out once per time range and subject for the
 *   whole page and shared by every panel set the same way.
 * - `timer`: the one focus clock on the page (hooks/usePomodoro). One, so two
 *   timer panels can't both log the same session.
 * - `self`: the panel reads what it needs on its own, as it does on its own
 *   page (the plan's minutes, the growth periods, the badges).
 */
export type Needs = 'model' | 'timer' | 'self';

const SELF: ReadonlySet<PanelKind> = new Set<PanelKind>([
  'sessions', 'goals-finished', 'badges',
  'growth-line', 'then-now', 'movers', 'score-changes', 'periods', 'milestones',
]);

export const needsOf = (kind: PanelKind): Needs => (groupOf(kind) === 'timer' ? 'timer' : SELF.has(kind) ? 'self' : 'model');

/** The time range a model-backed kind with no range of its own is worked out over. */
export const MODEL_WINDOW = '30d';

/** Which shared model a block reads: its time range and subject, or the defaults. */
export const modelKey = (config: PanelConfig): string =>
  `${typeof config.window === 'string' ? config.window : MODEL_WINDOW}|${typeof config.subject === 'string' ? config.subject : ''}`;

/** The two halves of a model key back. */
export const splitKey = (key: string): { span: string; subject: string } => {
  const at = key.indexOf('|');
  return { span: key.slice(0, at), subject: key.slice(at + 1) };
};

/**
 * What a page's panels need read, from its blocks: the model keys, sorted,
 * as one JSON string (so a page that only moved a block doesn't make the
 * readers start over), and whether a timer panel is on it.
 */
export function pageNeeds(blocks: ReadonlyArray<{ type: string; panel?: unknown }>): { models: string; timer: boolean } {
  const keys = new Set<string>();
  let timer = false;
  for (const one of blocks) {
    if (one.type !== 'panel') continue;
    const config = cleanPanel(one.panel);
    const needs = needsOf(config.kind);
    if (needs === 'model') keys.add(modelKey(config));
    if (needs === 'timer') timer = true;
  }
  return { models: JSON.stringify([...keys].sort()), timer };
}

/** A setting read back with its type: the cleaner has already made it so. */
export const text = (config: PanelConfig, name: FieldName): string => String(config[name] ?? '');
export const whole = (config: PanelConfig, name: FieldName): number => Number(config[name] ?? 0);
export const list = (config: PanelConfig, name: FieldName): string[] =>
  Array.isArray(config[name]) ? (config[name] as string[]) : [];

/** One string per distinct setting, for keying what a block has read. */
export const panelKey = (config: PanelConfig): string =>
  Object.entries(config)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
    .join('&');

// --------------------------------------------------------------------------
// Words
// --------------------------------------------------------------------------
export interface PanelInfo {
  hint: string;
  glyph: string;
  keys: string[];
  /** The page it comes from, for the block's "Open" link. */
  home: string;
}

/** What each kind is called is in the rules (`name`); the rest is here. */
export const panelName = (kind: PanelKind): string => KIND[kind].name;

const ANALYTICS = '/analytics';
const INSIGHTS = '/insights';
const ADVICE = '/recommendations';
const SUBJECTS = '/subjects';
const GROWTH = '/analytics/growth';

export const PANEL_INFO: Record<PanelKind, PanelInfo> = {
  summary: { hint: 'Your score out of 100, the grade and what moved it.', glyph: '★', keys: ['score', 'grade', 'summary', 'report'], home: ANALYTICS },
  tiles: { hint: 'Productivity, consistency, quality and more, with sparklines.', glyph: '▤', keys: ['tiles', 'stats', 'numbers', 'kpi', 'overview'], home: ANALYTICS },
  basics: { hint: 'Tasks done, focus time, XP, streak and completion.', glyph: '#', keys: ['basics', 'totals', 'counts', 'stats'], home: ANALYTICS },
  trajectory: { hint: 'Any measure over time against the period before.', glyph: '⟋', keys: ['trend', 'chart', 'trajectory', 'over time', 'line'], home: ANALYTICS },
  heat: { hint: 'One square a day, shaded by how much you did.', glyph: '▦', keys: ['heatmap', 'consistency', 'calendar', 'days'], home: ANALYTICS },
  'subject-xp': { hint: 'XP by subject, against the period before.', glyph: '◔', keys: ['subjects', 'xp', 'radar', 'split', 'breakdown'], home: SUBJECTS },
  quality: { hint: 'How your rated tasks went.', glyph: '◆', keys: ['quality', 'ratings', 'rated'], home: ANALYTICS },
  'quality-grid': { hint: 'How hard each task was against how well it went.', glyph: '▩', keys: ['quality', 'grid', 'difficulty', 'execution'], home: ANALYTICS },
  targets: { hint: 'Your own targets, and how you stand against them.', glyph: '◎', keys: ['targets', 'baseline', 'aim'], home: ANALYTICS },
  'first-reads': { hint: 'Quick facts from your first tasks and sessions.', glyph: '✎', keys: ['reads', 'early', 'facts'], home: ANALYTICS },
  'goals-finished': { hint: 'Goals you marked done.', glyph: '✔', keys: ['goals', 'finished', 'done', 'completed'], home: '/goals' },
  'told-us': { hint: 'Your About you answers and what they count for.', glyph: '❝', keys: ['about', 'background', 'told'], home: ANALYTICS },
  observations: { hint: 'Patterns that already hold up.', glyph: '◇', keys: ['observations', 'true', 'early', 'findings'], home: INSIGHTS },
  stage: { hint: "What you've unlocked so far, and what's next.", glyph: '⛰', keys: ['stage', 'unlock', 'next', 'ladder', 'progress'], home: ANALYTICS },
  plan: { hint: 'A plan for the next stretch, ranked and timed.', glyph: '➜', keys: ['plan', 'next', 'suggestions', 'ai', 'recommendations'], home: ADVICE },
  diagnosis: { hint: "What your last two weeks say, and why.", glyph: '⚕', keys: ['diagnosis', 'why', 'ai', 'suggestions', 'advice'], home: ADVICE },
  followup: { hint: "Changes you said you'd try, and how they went.", glyph: '↺', keys: ['followup', 'changes', 'adopted', 'trying'], home: ADVICE },
  sessions: { hint: 'Three sessions to book, for any subject.', glyph: '⧗', keys: ['sessions', 'next', 'plan', 'ai', 'suggestions'], home: ADVICE },
  coach: { hint: 'What Summit has learned about you, with a next step each.', glyph: '💬', keys: ['coach', 'knows', 'ai', 'suggestions', 'advice'], home: ADVICE },
  lens: { hint: 'Which goal the plan is built around, and why.', glyph: '⌕', keys: ['lens', 'goal', 'why', 'order', 'ai'], home: ADVICE },
  'xp-pulse': { hint: 'XP this period, and how it compares.', glyph: '⚡', keys: ['xp', 'pulse', 'earned'], home: ADVICE },
  changed: { hint: 'What moved lately, good and bad.', glyph: 'Δ', keys: ['changed', 'changes', 'moved', 'news'], home: INSIGHTS },
  'habit-tiles': { hint: 'How many habits you keep, and how often.', glyph: '▥', keys: ['habits', 'numbers', 'tiles'], home: INSIGHTS },
  'habit-lead': { hint: 'Your habits, summed up in a sentence.', glyph: '¶', keys: ['habits', 'summary', 'sentence'], home: INSIGHTS },
  'habit-patterns': { hint: 'Repeats in when and how you work.', glyph: '⁂', keys: ['habits', 'patterns', 'repeats'], home: INSIGHTS },
  habits: { hint: 'One card per habit, with what it does for you.', glyph: '▣', keys: ['habits', 'cards', 'routines'], home: INSIGHTS },
  'habit-steady': { hint: 'Which habits are holding and which are slipping.', glyph: '≋', keys: ['habits', 'steady', 'stability', 'slipping'], home: INSIGHTS },
  'habit-timeline': { hint: 'When each habit started, and shifts since.', glyph: '⟿', keys: ['habits', 'timeline', 'since'], home: INSIGHTS },
  'say-do': { hint: 'Your mood and your words, checked against your work.', glyph: '⇄', keys: ['say', 'do', 'mood', 'log'], home: INSIGHTS },
  'best-worst': { hint: 'Your highest and lowest rated tasks.', glyph: '⇅', keys: ['best', 'worst', 'rated', 'tasks'], home: INSIGHTS },
  why: { hint: 'Why your last stretch went the way it did.', glyph: '?', keys: ['why', 'findings', 'insights'], home: INSIGHTS },
  how: { hint: 'How you tend to work, from your own numbers.', glyph: '⚙', keys: ['how', 'findings', 'insights'], home: INSIGHTS },
  links: { hint: 'What lines up with your best days.', glyph: '⋈', keys: ['links', 'relationships', 'correlation', 'scatter'], home: INSIGHTS },
  reasons: { hint: 'What you said made tasks go well or badly.', glyph: '✍', keys: ['reasons', 'why', 'struggle'], home: INSIGHTS },
  clock: { hint: 'The hours your work lands in.', glyph: '◷', keys: ['clock', 'hours', 'time', 'when'], home: INSIGHTS },
  week: { hint: 'Which weekdays you get the most done.', glyph: '▧', keys: ['week', 'weekday', 'days'], home: INSIGHTS },
  'early-when': { hint: 'Morning, afternoon, evening or night.', glyph: '☼', keys: ['time', 'day', 'morning', 'evening'], home: INSIGHTS },
  finishes: { hint: 'How your tasks end: done, late or missed.', glyph: '⚑', keys: ['finish', 'done', 'late', 'missed'], home: INSIGHTS },
  'follow-through': { hint: 'Planned vs. done, focus depth and bouncing back.', glyph: '⤳', keys: ['follow', 'planned', 'focus', 'recovery', 'depth'], home: INSIGHTS },
  'skills-chapter': { hint: 'Every subject: level, trend and mastery track.', glyph: '⌥', keys: ['skills', 'subjects', 'mastery', 'level'], home: SUBJECTS },
  'goal-lines': { hint: 'Which subjects have a goal, and what holds each back.', glyph: '⚐', keys: ['goals', 'subjects', 'limiter'], home: SUBJECTS },
  'tree-depth': { hint: 'Your all-time XP in each skill tree.', glyph: '⌬', keys: ['tree', 'depth', 'skill', 'far'], home: SUBJECTS },
  'subject-opens': { hint: 'How many skills each subject has, and how many you practiced.', glyph: '⊞', keys: ['subjects', 'lattice', 'skills', 'opens'], home: SUBJECTS },
  'skill-growth': { hint: 'How your level in each subject moved.', glyph: '↗', keys: ['skill', 'growth', 'level', 'subjects'], home: GROWTH },
  'skill-levels': { hint: 'Each skill tree step, from problems you marked.', glyph: '▲', keys: ['skill', 'levels', 'steps', 'problems'], home: GROWTH },
  'time-progress': { hint: 'Hours in, work out, and whether the level moved.', glyph: '⏱', keys: ['time', 'progress', 'hours'], home: GROWTH },
  'skill-shape': { hint: 'What your strongest subject is made of.', glyph: '⬡', keys: ['skill', 'shape', 'strongest'], home: GROWTH },
  'growth-line': { hint: 'Your scores over time. Pick which lines show.', glyph: '〰', keys: ['growth', 'timeline', 'scores', 'line', 'chart'], home: GROWTH },
  'then-now': { hint: 'Each score now against the period before.', glyph: '⇆', keys: ['then', 'now', 'compare', 'scores'], home: GROWTH },
  movers: { hint: 'The score that rose most and the one that fell most.', glyph: '↕', keys: ['movers', 'best', 'worst', 'scores'], home: GROWTH },
  'score-changes': { hint: 'The numbers behind your score changes.', glyph: '≡', keys: ['changes', 'scores', 'behind'], home: GROWTH },
  periods: { hint: 'Every period at once: week, month, year and more.', glyph: '▭', keys: ['periods', 'growth', 'cards'], home: GROWTH },
  milestones: { hint: 'Days your score hit a new grade.', glyph: '⚑', keys: ['milestones', 'grade', 'score'], home: GROWTH },
  'core-hours': { hint: 'The hours that hold half your finished work.', glyph: '◑', keys: ['core', 'hours', 'when'], home: GROWTH },
  years: { hint: 'How hard and how well, one year at a time.', glyph: '⧉', keys: ['years', 'year', 'history'], home: GROWTH },
  timer: { hint: 'The focus clock: start, pause, skip, reset.', glyph: '⏲', keys: ['timer', 'pomodoro', 'focus', 'clock'], home: '/timer' },
  'timer-task': { hint: 'Pick the task your sessions get logged to.', glyph: '☐', keys: ['timer', 'task', 'working', 'pick'], home: '/timer' },
  'timer-today': { hint: 'Where your focus time went, by task.', glyph: '⧖', keys: ['timer', 'sessions', 'today', 'tasks'], home: '/timer' },
  'timer-recent': { hint: 'Your last few sessions, with their pauses.', glyph: '☰', keys: ['timer', 'sessions', 'recent', 'history'], home: '/timer' },
  'timer-suggest': { hint: 'The session length that works best for you.', glyph: '✦', keys: ['timer', 'suggest', 'length', 'ai'], home: '/timer' },
  'timer-chart': { hint: 'Focus minutes or sessions per day.', glyph: '▥', keys: ['timer', 'chart', 'focus', 'minutes'], home: '/timer' },
  badges: { hint: 'Badges you earned or are closest to.', glyph: '🏅', keys: ['badges', 'achievements', 'earned'], home: '/achievements' },
};

/** What each section of the slash menu is called. */
export const PANEL_GROUP_LABEL: Record<PanelGroup, string> = {
  analytics: 'Analytics',
  suggest: 'Suggestions',
  insights: 'Insights and habits',
  growth: 'Growth and subjects',
  timer: 'Timer',
  goals: 'Goals & records',
};

/** What each setting is called in a block's settings. */
export const FIELD_LABEL: Record<FieldName, string> = {
  window: 'Time range',
  period: 'Time range',
  subject: 'Subject',
  metric: 'Chart',
  grain: 'Group by',
  range: 'Range',
  limit: 'How many',
  budget: 'Minutes',
  days: 'Days',
  show: 'Show',
  style: 'Style',
  category: 'Category',
  which: 'Which',
};

/** How each choice reads. A choice missing here reads as itself. */
export const CHOICE_LABEL: Partial<Record<FieldName, Record<string, string>>> = {
  window: { '7d': '7 days', '30d': '30 days', '90d': '90 days', '1y': '1 year', '2y': '2 years', all: 'All time' },
  period: { '7d': '7 days', '30d': '30 days', '90d': '90 days', '365d': '1 year', '730d': '2 years', all: 'All time' },
  metric: {
    productivity: 'Productivity', consistency: 'Consistency', quality: 'Quality',
    xp: 'Total XP', tasks: 'Total tasks', focus: 'Total focus',
    minutes: 'Minutes', sessions: 'Sessions',
  },
  grain: { daily: 'Day', weekly: 'Week', monthly: 'Month' },
  range: { '30': '30 days', '90': '90 days', '365': '1 year' },
  days: { '1': 'Today', '7': '7 days', '14': '14 days', '30': '30 days' },
  budget: { '15': '15m', '30': '30m', '45': '45m', '60': '1h', '90': '1.5h', '120': '2h' },
  style: { card: 'Full panel', line: 'One line', bars: 'Bars', area: 'Area' },
  category: { all: 'All' },
  which: { earned: 'Earned', next: 'Up next', all: 'All' },
  show: {
    productivity: 'Productivity', consistency: 'Consistency', quality: 'Quality', tasks: 'Tasks', focus: 'Focus',
    xp: 'XP', streak: 'Streak', completion: 'Completion',
    scores: 'Scores', calendar: 'Calendar', planned: 'Planned vs. done', depth: 'Focus depth',
    stability: 'Habit stability', trail: 'Over time', recovery: 'Bouncing back',
    efficiency: 'Efficiency', overall: 'Overall',
    best: 'Biggest rise', worst: 'Biggest drop',
    task: 'Working on', method: 'Method',
    ladder: 'Stages', next: 'Up next', away: 'Time away', note: 'How days count',
  },
};

/** A choice in words. */
export const choiceLabel = (name: FieldName, value: Value): string => CHOICE_LABEL[name]?.[String(value)] ?? String(value);

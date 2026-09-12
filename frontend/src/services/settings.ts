/**
 * Account preferences.
 *
 * Backend: backend/api/settings.py.
 *
 * The keyed preferences travel under `values` as one object, so adding a
 * preference is a line in `Prefs` here and a line in `FIELDS` there — not a
 * new field threaded through a request model, a service function and a page.
 *
 * `save` sends only what it is given and the server writes only what it is
 * sent, which is what lets a page of independent controls be safe: changing
 * the accent cannot write back a stale copy of every other preference.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Accent = 'violet' | 'blue' | 'green' | 'amber' | 'rose' | 'slate';
/**
 * A whole built palette, or '' for plain light and dark.
 *
 * Light and dark are the two neutral grounds you pick your own `Accent` on.
 * These four are the opposite trade: a ground and an accent pair chosen
 * together, which is why the accent picker is switched off while one is on.
 * See THEMES in pages/Settings and the `[data-skin]` blocks in
 * styles/preferences.css, which are what actually paint them.
 */
export type ThemeSkin = '' | 'midnight' | 'sunset' | 'meadow' | 'orchid';
export type Priority = 'low' | 'medium' | 'high';
export type CalendarView = 'day' | 'week' | 'month';
export type AnalyticsWindow = '7d' | '30d' | '90d' | '1y' | '2y' | 'all';

/**
 * The analytics preferences the setup questions write, and the settings page
 * edits afterwards. What each one actually changes is in
 * utils/analyticsPrefs — this file only says what the values are.
 *
 * `AnalyticsHomeTab` is the same seven keys as `ViewKey` in
 * components/Analytics/Header. Written out rather than imported for the reason
 * the four task unions below are: a service reaching into a component is the
 * dependency the wrong way round. The page assigns one to the other, so a key
 * added on one side and not the other fails to compile.
 */
export type AnalyticsHomeTab =
  | 'recommendations'
  | 'overview'
  | 'goals'
  | 'habits'
  | 'insights'
  | 'subjects'
  | 'growth';
export type LogStyle = 'tasks' | 'sessions' | 'both';
export type AnalyticsTone = 'gentle' | 'balanced' | 'harsh';
export type AnalyticsDetail = 'essentials' | 'standard' | 'everything';
/** Where signing in lands, and where `/` sends an account that is already in. */
export type HomePage = 'dashboard' | 'tasks' | 'calendar' | 'goals' | 'analytics' | 'notes';
export type WeekStart = 'monday' | 'sunday';

/* The four below are the tasks page's own controls, named here so a preference
   can hold one. They are written out rather than imported from
   components/Tasks/board: a service that reaches into a component is the
   dependency the wrong way round. They are the same unions, and the tasks page
   assigns one to the other, so a value added on one side and not the other
   fails to compile rather than failing quietly. */
export type TaskStatus = 'open' | 'done' | 'all';
export type TaskSort = 'due' | 'priority' | 'xp' | 'created' | 'title';
export type TaskGroup = 'due' | 'priority' | 'band' | 'subject' | 'status' | 'none';
export type TaskHorizon = 'week' | 'all';

/**
 * How much the app asks after a task is finished.
 *
 * Three levels, and each one changes what analytics is able to say:
 *
 *   none      nothing is asked. Quality is scored from the XP-per-task proxy
 *             rather than from ratings, and the quality panels say so.
 *   ratings   the two star rows — difficulty and execution. The default, and
 *             what the app has always done.
 *   reasons   the two rows plus one more: what made the difference. Adds the
 *             reasons panel, which nothing else on the page can produce.
 */
export type RatingDepth = 'none' | 'ratings' | 'reasons';

/** The preferences kept as key/value. Mirrors FIELDS in the backend. */
export interface Prefs {
  theme_mode: ThemeMode;
  theme_skin: ThemeSkin;
  accent: Accent;
  reduce_motion: boolean;
  show_ambient: boolean;
  nav_collapsed: boolean;
  home_page: HomePage;
  show_stats: boolean;
  show_insights: boolean;
  show_focus: boolean;
  show_quote: boolean;
  default_priority: Priority;
  default_xp: number;
  rating_depth: RatingDepth;
  confirm_delete: boolean;
  task_status: TaskStatus;
  task_sort: TaskSort;
  task_group: TaskGroup;
  task_horizon: TaskHorizon;
  calendar_view: CalendarView;
  week_starts_on: WeekStart;
  focus_goal_hours: number;
  focus_dim: boolean;
  /**
   * Whether the dashboard asks, once a day, about the days since the last
   * visit — work that was done and never tracked. Off removes the prompt
   * entirely; see components/Dashboard/CatchUp.
   */
  catchup_prompt: boolean;
  /**
   * The last day the prompt was put, ISO, or '' for never.
   *
   * State rather than taste — nothing in Settings edits it — and it is what
   * makes the prompt once a day rather than once a page load, as well as what
   * defines the stretch of days it asks about.
   */
  catchup_seen_on: string;
  analytics_window: AnalyticsWindow;
  analytics_setup_done: boolean;
  analytics_home_tab: AnalyticsHomeTab;
  analytics_log_style: LogStyle;
  analytics_tone: AnalyticsTone;
  analytics_detail: AnalyticsDetail;
  analytics_standing: boolean;
  /**
   * The subjects the account said it most wants to work on, by id — at most
   * `SUBJECTS_MAX` of them (utils/analyticsPrefs), in the order picked.
   *
   * The one analytics preference that is not about how the page reads. It is
   * about what the app offers: each id becomes a row under Analytics in the
   * rail, opening that subject's own page. Empty is the honest default and a
   * real state — an account that named none gets the single entry it always
   * had rather than a menu of one.
   *
   * Not guaranteed to name subjects that still exist. A subject can be deleted
   * the day after it is nominated, so every reader joins this against the
   * catalogue and drops what it does not recognise. See backend `_id_list`.
   */
  analytics_subjects: string[];
  /**
   * For a followed subject, the skill tree it opens on.
   *
   * Keyed by subject id, valued by tree id — the sub-part of the subject the
   * reader said they want to go deeper into. Absent is the answer for most
   * subjects and means "the whole thing": without a branch named, the subject
   * page falls back to `treeForSubject`, which is the subject's own root.
   *
   * A separate preference from the follow list rather than encoded into it,
   * because they are two questions — *which* subjects, and *where inside* each
   * — and one list carrying both would make every reader of either parse the
   * other. Neither the keys nor the values are guaranteed to still resolve;
   * every reader joins against the live catalogue and tree registry.
   */
  analytics_subject_depth: Record<string, string>;
  /**
   * What the account is chasing in each followed subject, and where it says it
   * is now. Keyed by subject id.
   *
   * **Not a goal, and it never becomes one.** A goal on the goals page is a
   * commitment with a number, a date and progress read off the record. This is
   * the sentence that says what the work is *for* — "get to Mathcounts
   * Nationals", "read a paper without the glossary" — which most people can
   * write long before any of that exists. Its only readers are the analytics
   * page and the model that writes that page's read-out, which is why it lives
   * in preferences rather than in the goals table.
   */
  analytics_ambitions: Record<string, { aim: string; level: string }>;
  /**
   * The one goal each subject page is connected to. Keyed by subject id,
   * valued by goal id.
   *
   * One per subject because a map holds one value per key: connecting another
   * goal replaces the first. Absent means "not chosen", and the subject page
   * then reads a subject with exactly one active goal as connected to it —
   * the choice is only asked for when there is one to make. The id is not
   * guaranteed to resolve (goals are deleted on their own page), so every
   * reader of this map joins against the live goal list and falls back to the
   * unconnected state when the id no longer names a goal. Storing it is not
   * the same as it being true.
   */
  analytics_subject_goal: Record<string, string>;
  /**
   * The notification switches. One master, one for the on-screen half, and one
   * per channel — the same six as `NotificationChannel` in
   * services/notifications.
   *
   * Every one of them is read by the server's sweep rather than by the panel:
   * a channel that is off is not swept at all, so turning it off stops rows
   * being written instead of hiding rows that were written anyway. Turning it
   * back on therefore starts from what is true then, not from a fortnight of
   * backlog. See backend/tracking/notify.py.
   */
  notifications_enabled: boolean;
  notify_popups: boolean;
  notify_tasks: boolean;
  notify_calendar: boolean;
  notify_analytics: boolean;
  notify_goals: boolean;
  notify_streak: boolean;
  notify_progress: boolean;
}

export interface Settings extends Prefs {
  /** On the user row rather than in user_settings. Historical; see the API. */
  name: string;
  theme: 'light' | 'dark';
  daily_goal: number;
  /** Read-only. */
  username: string;
  email: string;
  created_at: string;
  level: number;
  xp: number;
  avatar: string;
}

/** What a save may carry. Anything left out is left alone. */
export interface SettingsEdit {
  name?: string;
  theme?: 'light' | 'dark';
  daily_goal?: number;
  values?: Partial<Prefs>;
}

/** What the app assumes before the account's own answer has arrived. */
export const DEFAULTS: Prefs = {
  theme_mode: 'system',
  theme_skin: '',
  accent: 'violet',
  reduce_motion: false,
  show_ambient: true,
  nav_collapsed: false,
  home_page: 'dashboard',
  show_stats: true,
  show_insights: true,
  show_focus: true,
  show_quote: true,
  default_priority: 'medium',
  default_xp: 30,
  rating_depth: 'ratings',
  confirm_delete: true,
  task_status: 'open',
  task_sort: 'due',
  task_group: 'due',
  task_horizon: 'week',
  calendar_view: 'week',
  week_starts_on: 'monday',
  focus_goal_hours: 2,
  focus_dim: true,
  catchup_prompt: true,
  /* Empty is a real state: an account with no recorded visit is not one with
     a week of unlogged days, it is one the prompt has never met. The first
     visit records the day and asks nothing. */
  catchup_seen_on: '',
  analytics_window: '1y',
  /* False is the first-run state, and it is what puts the question phase in
     front of the page. An account that already set a baseline is treated as
     having answered — see `firstRun` in pages/Analytics. */
  analytics_setup_done: false,
  analytics_home_tab: 'overview',
  analytics_log_style: 'both',
  analytics_tone: 'balanced',
  analytics_detail: 'standard',
  analytics_standing: true,
  analytics_subjects: [],
  analytics_subject_depth: {},
  analytics_ambitions: {},
  analytics_subject_goal: {},
  /* Every channel on. The bell is quiet when the record is quiet — nothing is
     generated on a schedule (backend/tracking/notify.py) — so the honest
     default is on, and the switches are here for the reader who decides one
     kind of thing is not worth being told about. */
  notifications_enabled: true,
  notify_popups: true,
  notify_tasks: true,
  notify_calendar: true,
  notify_analytics: true,
  notify_goals: true,
  notify_streak: true,
  notify_progress: true,
};

/** What the API gives an account that has never set one. */
export const DEFAULT_DAILY_GOAL = 100;

/** `startOfWeek` takes a day number; the preference is a word. */
export function weekStartDay(prefs: Pick<Prefs, 'week_starts_on'>): 0 | 1 {
  return prefs.week_starts_on === 'sunday' ? 0 : 1;
}

export function getSettings(): Promise<ApiResult<{ settings: Settings }>> {
  return get<{ settings: Settings }>('/api/settings');
}

export function saveSettings(
  edit: SettingsEdit,
): Promise<ApiResult<{ settings: Settings }>> {
  return post<{ settings: Settings }>('/api/settings', { ...edit });
}

/**
 * Removing something, on purpose.
 *
 * One endpoint and a scope rather than six endpoints, because they are one
 * decision — how much to take away — and the server declares the list (RESETS
 * in backend/api/settings.py). `confirm` is the account's own username typed
 * back, and the four scopes that need it are refused without it by the server
 * as well as by the dialog.
 */
export type ResetScope =
  | 'preferences'
  | 'completed'
  | 'tasks'
  | 'progress'
  | 'content'
  | 'account';

export interface ResetResult {
  message: string;
  /** What went, by table. Shown back so the reader can see it happened. */
  removed: Record<string, number>;
  /** The account's settings afterwards. Absent when the account itself went. */
  settings?: Settings;
  /** Set when the session was ended because the account no longer exists. */
  signed_out?: boolean;
}

export function resetData(
  scope: ResetScope,
  confirm?: string,
): Promise<ApiResult<ResetResult>> {
  return post<ResetResult>('/api/settings/reset', { scope, confirm });
}

/** Where the browser should be pointed to download an export. */
export function exportUrl(table: string, format: 'json' | 'csv'): string {
  const query = new URLSearchParams({ table, format });
  return `/api/settings/export?${query.toString()}`;
}

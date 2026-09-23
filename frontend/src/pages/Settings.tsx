/**
 * Settings.
 *
 * ## Declared, not written out
 *
 * The page is a list of sections, each a list of rows, each row a label, an
 * explanation and one control. Writing that as JSX would be nine hundred lines
 * of nearly-identical markup; declaring it means a new preference is an entry
 * in `sections` and the search, the nav, the deep link and the layout all pick
 * it up for free.
 *
 * ## Search is the reason the rows are data
 *
 * A settings page is found by name, not by browsing — nobody remembers which
 * tab "confirm before deleting" lives on. With every row carrying its own
 * words, the search is a filter over that list and the result is the matching
 * rows in place, under their own headings.
 *
 * ## Each control saves itself
 *
 * No Save button. A select writes on change, a text field on blur or Enter,
 * and the status line says which preference was written. The server writes
 * only the fields it is sent, so two controls can never overwrite each other.
 *
 * ## Every switch here does something
 *
 * That is the rule the page is held to, and it is why the list is the length it
 * is rather than longer. A preference exists here only once something reads it:
 * `week_starts_on` arrived with the calendar and the dashboard's week summary
 * both counting from it, `show_ambient` with the background layer that returns
 * nothing when it is off, the four `task_*` keys with the tasks page opening on
 * them. A control that stores a value nothing looks at is worse than no control
 * — it is a promise the app quietly breaks.
 *
 * ## What is not here, and why
 *
 * No integrations, API keys, webhooks, notification schedules, leaderboards or
 * password changes. This app has no OAuth broker, no job runner, no second
 * account to rank against and no change-password endpoint — every one of those
 * would be a control that stores a value nothing reads. They are worth
 * building; they are not worth faking.
 *
 * ## The danger zone
 *
 * The last section is the only one whose controls remove things, and it is a
 * section of its own at the end of its own group for that reason: nothing
 * destructive is ever the next row down from a harmless one.
 *
 * Each of them asks first, in a dialog that says what will go and what will
 * survive — and the four that cannot be undone ask for the account's username
 * to be typed out. That is not theatre. The server refuses those four without
 * it (TYPED in backend/api/settings.py), so the typing is the confirmation
 * rather than a dialog's opinion of one, and a stray POST cannot delete an
 * account by arriving.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorState, Loading, PageHero } from '@/components';
import { GROUPS, SORTS } from '@/components/Tasks';
import { useApi, useAuth, useDocumentTitle, usePageEntrance, useSettings, useTheme } from '@/hooks';
import { settings as service } from '@/services';
import {
  DETAIL_HINT,
  DETAIL_LABEL,
  LOG_STYLE_HINT,
  TONE_HINT,
  TONE_LABEL,
} from '@/utils/analyticsPrefs';
import { VIEWS } from '@/components/Analytics';
import type { NotificationChannel } from '@/services/notifications';
import type {
  Accent,
  Prefs,
  ResetScope,
  Settings as Prefsheet,
  ThemeMode,
  ThemeSkin,
} from '@/services/settings';
import type { Theme } from '@/types';
import '@/styles/settings.css';
import { announceStatsChanged } from '@/utils/statsBus';

const GOAL_MIN = 10;
const GOAL_MAX = 2000;

/** The clock, shown rather than described — it is a format, so an example is
    the whole explanation. */
const CLOCK_EXAMPLE: Record<Prefs['clock_format'], string> = {
  '12h': '6:40 PM',
  '24h': '18:40',
};
const CLOCK_HINT: Record<Prefs['clock_format'], string> = {
  '12h': 'Morning and afternoon, with AM and PM.',
  '24h': 'Hours counted 00 to 23, so there is no AM or PM to read.',
};

/** The pages an account may open on, and what each one is for. */
const HOME_PAGES: { key: Prefs['home_page']; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'goals', label: 'Goals' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'notes', label: 'Notes' },
];

/** The daily focus goal, in hours. Quarter-hour steps, which is the grain the
    backend snaps to — see `_fraction` in backend/api/settings.py. */
const FOCUS_GOALS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12];

/** The list above, plus whatever is actually stored if it is not on it.
 *  The backend accepts any quarter hour, so a value set by hand — or by a
 *  build with a different list — would otherwise leave this select showing
 *  nothing at all, which reads as "no goal" rather than "a goal I cannot draw". */
function goalOptions(current: number): number[] {
  if (FOCUS_GOALS.includes(current)) return FOCUS_GOALS;
  return [...FOCUS_GOALS, current].sort((a, b) => a - b);
}

/** What each of the three levels actually does, said in full under the seg. */
const RATING_DEPTHS: Record<Prefs['rating_depth'], string> = {
  none: 'No questions after a task. Analytics estimates quality from XP per task instead.',
  ratings: 'Rate difficulty and how well it went after each task. Analytics uses these for '
    + 'quality.',
  reasons: 'Both ratings, plus what made the difference. This lets Analytics explain why a '
    + 'period went well or badly.',
};

const RATING_DEPTH_NAMES: Record<Prefs['rating_depth'], string> = {
  none: 'No questions',
  ratings: 'Two questions',
  reasons: 'Three questions',
};

function hoursLabel(hours: number): string {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (!whole) return `${minutes} minutes`;
  if (!minutes) return whole === 1 ? '1 hour' : `${whole} hours`;
  return `${whole}h ${minutes}m`;
}

/**
 * The six kinds of thing the app can tell you about, and what each one covers.
 *
 * Declared rather than written out nine times, because the rows differ only in
 * their words — and the words are the part that matters here. A reader turning
 * one off is entitled to know exactly what they will stop hearing, which is
 * why each hint lists the actual notifications rather than naming a category.
 *
 * `pref` is spelled as `notify_${channel}` rather than as a free string, so
 * the key and the preference cannot drift: `NotificationChannel` is the same
 * six as `CHANNELS` in backend/tracking/notify.py, and a channel added on one
 * side and not the other fails to compile here.
 */
const NOTIFY_CHANNELS: {
  key: NotificationChannel;
  pref: `notify_${NotificationChannel}`;
  label: string;
  hint: string;
}[] = [
  {
    key: 'tasks',
    pref: 'notify_tasks',
    label: 'Overdue and due tasks',
    hint:
      'Work that is past its date, work due today, and work due tomorrow — one of each a day, '
      + 'kept current as you finish things.',
  },
  {
    key: 'calendar',
    pref: 'notify_calendar',
    label: 'Calendar',
    hint:
      'What is on today’s calendar and what time the first block starts, plus the one that is '
      + 'about to begin within the hour.',
  },
  {
    key: 'analytics',
    pref: 'notify_analytics',
    label: 'Analytics',
    hint:
      'Once a week: what you finished, how it compares to the week before, and the hours you '
      + 'focused. Also a gap of four days or more with nothing on it, and the day you beat your '
      + 'own best.',
  },
  {
    key: 'goals',
    pref: 'notify_goals',
    label: 'Goals',
    hint:
      'A goal whose date has passed, one due inside a week, and one whose arithmetic is '
      + 'finished but which is still open.',
  },
  {
    key: 'streak',
    pref: 'notify_streak',
    label: 'Streak',
    hint:
      'A live streak with nothing on the board yet today — the one thing here that is lost by '
      + 'doing nothing — and the days it passes worth marking.',
  },
  {
    key: 'progress',
    pref: 'notify_progress',
    label: 'Levels, badges and records',
    hint:
      'A level reached, a badge earned, a record set. Never the backlog: an account that has '
      + 'been here a year is not told about its first sixty levels.',
  },
];


/**
 * The six themes, in the order the grid draws them.
 *
 * Two bases and four palettes. Light and dark are the neutral grounds you then
 * pick an `Accent` on — they are unchanged by any of this, and an account on
 * one of them sees exactly what it saw before the other four existed. The
 * four skins are the other trade: a ground and an accent pair chosen together,
 * which is why picking one switches the accent row off rather than leaving a
 * control on screen that no longer does anything.
 *
 * No colours here. The swatch is painted from `--skin-*` in
 * styles/preferences.css, which is also where the rules that apply a skin read
 * them from — so a card cannot advertise a colour the theme does not use. All
 * this list carries is which base each one pins, and the words.
 */
const THEMES: { skin: ThemeSkin; base: Theme; label: string; hint: string }[] = [
  { skin: '', base: 'light', label: 'Light', hint: 'The neutral ground. Pick your own accent below.' },
  { skin: '', base: 'dark', label: 'Dark', hint: 'The neutral ground. Pick your own accent below.' },
  { skin: 'midnight', base: 'dark', label: 'Midnight', hint: 'Deep navy, periwinkle and cyan.' },
  { skin: 'sunset', base: 'dark', label: 'Sunset', hint: 'Warm near-black, orange and gold.' },
  { skin: 'meadow', base: 'light', label: 'Meadow', hint: 'Soft green ground, green and amber.' },
  { skin: 'orchid', base: 'light', label: 'Orchid', hint: 'Pale blush, magenta and teal.' },
];

/**
 * One theme card: four bands of the theme's own colours, its name, and whether
 * it is the one running.
 *
 * The bands are `data-skin-preview`, not inline styles — the stylesheet owns
 * the palette and this reads it back. Light and dark have preview blocks of
 * their own there for the same reason, holding the values their sheets already
 * use.
 */
function ThemeCard({
  label,
  hint,
  preview,
  on,
  busy,
  onPick,
}: {
  label: string;
  hint: string;
  preview: string;
  on: boolean;
  busy: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className={`st-theme${on ? ' is-on' : ''}`}
      aria-pressed={on}
      title={hint}
      disabled={busy}
      onClick={onPick}
    >
      <span className="st-theme-bands" data-skin-preview={preview} aria-hidden="true">
        <i className="st-band-ground" />
        <i className="st-band-surface" />
        <i className="st-band-accent" />
        <i className="st-band-accent-2" />
      </span>
      <span className="st-theme-foot">
        <span className="st-theme-name">{label}</span>
        {on && <span className="st-theme-live">Active</span>}
      </span>
    </button>
  );
}

const ACCENTS: { key: Accent; label: string; swatch: string }[] = [
  { key: 'violet', label: 'Violet', swatch: '#6d5ae0' },
  { key: 'blue', label: 'Blue', swatch: '#2f6fd0' },
  { key: 'green', label: 'Green', swatch: '#1f8a54' },
  { key: 'amber', label: 'Amber', swatch: '#b8791f' },
  { key: 'rose', label: 'Rose', swatch: '#c0395f' },
  { key: 'slate', label: 'Slate', swatch: '#4a5568' },
];

/** A row's control, and the words the search matches it on. */
interface Item {
  id: string;
  label: string;
  hint: string;
  control: React.ReactNode;
  /** Set on rows that change or remove data. Drawn apart, at the end. */
  danger?: boolean;
}

interface Section {
  id: string;
  label: string;
  group: string;
  items: Item[];
  /** A line under the heading, for a section that needs one. Two do. */
  note?: string;
}

function joined(iso: string): string {
  if (!iso) return 'Unknown';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return 'Unknown';
  return when.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** A segmented control. Two or three options, all visible. */
function Seg<T extends string>({
  value,
  options,
  onPick,
  busy,
}: {
  value: T;
  options: { key: T; label: string }[];
  onPick: (next: T) => void;
  busy: boolean;
}) {
  return (
    <div className="st-seg" role="group">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className={`st-pick${value === option.key ? ' is-on' : ''}`}
          aria-pressed={value === option.key}
          disabled={busy}
          onClick={() => onPick(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  on,
  onFlip,
  busy,
  label,
}: {
  on: boolean;
  onFlip: () => void;
  busy: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`st-toggle${on ? ' is-on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onFlip}
    >
      <i aria-hidden="true" />
    </button>
  );
}

/**
 * One of the six things the danger zone can do.
 *
 * `loses` and `keeps` are both required, and that is the point of the shape:
 * the six differ from each other mostly in what they leave behind, and a
 * dialog that only says what it destroys leaves the reader to guess whether
 * "reset progress" also means "lose my tasks". It does not, and it says so.
 */
interface Ask {
  scope: ResetScope;
  label: string;
  hint: string;
  /** The dialog's heading, and the word on the button that does it. */
  title: string;
  action: string;
  loses: string;
  keeps: string;
  /** Mirrors TYPED in backend/api/settings.py — the server refuses these
      without the account's username, whatever this dialog decides to ask. */
  typed?: boolean;
}

const ASKS: Ask[] = [
  {
    scope: 'preferences',
    label: 'Reset every preference',
    hint: 'Puts this whole page back to how it arrived.',
    title: 'Reset every preference?',
    action: 'Reset preferences',
    loses: 'Every choice on this page goes back to its default — theme, accent, the pages the app opens on, the tasks view, the focus goal.',
    keeps: 'Your work is untouched: tasks, goals, notes, records and progress all stay exactly as they are. So does your profile picture.',
  },
  {
    scope: 'completed',
    label: 'Clear finished tasks',
    hint: 'Removes the tasks already ticked off. The XP they earned stays.',
    title: 'Clear finished tasks?',
    action: 'Clear them',
    loses: 'Every task marked done, and its place on the calendar.',
    keeps: 'The XP, the level and the streak they earned you — those are banked and are not undone by tidying the list. Open tasks stay.',
  },
  {
    scope: 'tasks',
    label: 'Delete every task',
    hint: 'The whole list, open and finished alike.',
    title: 'Delete every task?',
    action: 'Delete all tasks',
    loses: 'Every task this account has, whether it is open or done, and every calendar block made from one.',
    keeps: 'Goals, notes, records, and your level and XP. Analytics will still know what you did; it will no longer be able to name it.',
    typed: true,
  },
  {
    scope: 'progress',
    label: 'Reset level and XP',
    hint: 'Back to level 1 with nothing behind it. The work itself stays.',
    title: 'Reset your progress?',
    action: 'Reset progress',
    loses: 'Your level, XP, streaks, the XP ledger behind them, the analytics readings taken from it, and any achievements earned.',
    keeps: 'Every task, goal, note and record. The work is still there — this only forgets what it added up to.',
    typed: true,
  },
  {
    scope: 'content',
    label: 'Erase everything you have made',
    hint: 'Tasks, goals, notes, records, calendar and focus history. The account stays.',
    title: 'Erase everything you have made?',
    action: 'Erase it all',
    loses: 'Tasks, goals, notes, records, calendar entries, focus history, subjects and your whole progression.',
    keeps: 'The account itself — you stay signed in, and every preference on this page survives. It is the app on its first day, with your settings.',
    typed: true,
  },
  {
    scope: 'account',
    label: 'Delete this account',
    hint: 'The account and everything in it, permanently. You will be signed out.',
    title: 'Delete this account?',
    action: 'Delete my account',
    loses: 'Everything above, the preferences, and the account itself. Your username is released and nothing is recoverable.',
    keeps: 'Nothing. Export your data first if any of it matters — the two buttons for that are one section up.',
    typed: true,
  },
];

/**
 * The dialog the danger zone asks through.
 *
 * Modal on purpose, and it is the only modal on this page: everything else
 * here writes on change and can be changed straight back, and this is the one
 * place where "are you sure" is a real question rather than a speed bump.
 *
 * The typed confirmation is the account's own username, matched
 * case-insensitively — asking someone to reproduce their own capitalisation
 * under a red button is a test of typing, not of intent.
 */
function Confirm({
  ask,
  username,
  busy,
  failure,
  onClose,
  onGo,
}: {
  ask: Ask;
  username: string;
  busy: boolean;
  failure: string | null;
  onClose: () => void;
  onGo: (typed: string) => void;
}) {
  const [typed, setTyped] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const go = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // The field when there is one, the button when there is not — either way
    // the keyboard lands somewhere useful rather than behind the dialog.
    (ask.typed ? field.current : go.current)?.focus();
  }, [ask.typed]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);

  const ready = !ask.typed || typed.trim().toLowerCase() === username.toLowerCase();

  return (
    <div className="st-ask" role="presentation" onMouseDown={onClose}>
      <div
        className="st-ask-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="st-ask-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="st-ask-title">{ask.title}</h2>

        <p className="st-ask-line">
          <b>What goes.</b> {ask.loses}
        </p>
        <p className="st-ask-line is-kept">
          <b>What stays.</b> {ask.keeps}
        </p>

        {ask.typed && (
          <label className="st-ask-type">
            <span>
              Type <b>{username}</b> to confirm.
            </span>
            <input
              ref={field}
              className="st-input"
              value={typed}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && ready && !busy) onGo(typed);
              }}
            />
          </label>
        )}

        {failure && <p className="st-ask-bad">{failure}</p>}

        <div className="st-ask-row">
          <button type="button" className="st-btn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            ref={go}
            type="button"
            className="st-btn is-danger"
            disabled={busy || !ready}
            onClick={() => onGo(typed)}
          >
            {busy ? 'Working…' : ask.action}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  useDocumentTitle('Settings');

  const { section: routeSection } = useParams();
  const navigate = useNavigate();
  const { prefs, update, refresh } = useSettings();
  const { theme, setTheme } = useTheme();
  // One `useAuth` for both. `username` came from `useUserData` and cost the
  // account's whole task list to read a string — see hooks/useUserData.
  const { username, signOut } = useAuth();

  const call = useCallback(
    () =>
      username
        ? service.getSettings()
        : Promise.resolve({ success: false as const, message: 'Sign in to change your settings.' }),
    [username],
  );
  const { data, error, loading, reload, mutate } = useApi(call, [username]);
  const sheet: Prefsheet | null = data?.settings ?? null;

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  /** The destructive action being asked about, or null. */
  const [ask, setAsk] = useState<Ask | null>(null);
  const [asking, setAsking] = useState(false);
  /** Kept apart from `failure`: one belongs in the dialog, one to the page. */
  const [askFailure, setAskFailure] = useState<string | null>(null);

  useEffect(() => {
    if (sheet) setName(sheet.name);
  }, [sheet]);

  /** The line beside the heading. Takes the whole sentence, not a noun: the
      danger zone reports what it did, and "Every task removed. saved" is not
      something anybody meant to write. */
  const flash = useCallback((message: string) => {
    setSaved(message);
    window.setTimeout(() => setSaved(null), 2600);
  }, []);

  /** The account-row half — name, theme, daily goal. */
  const saveSheet = useCallback(
    async (edit: Parameters<typeof service.saveSettings>[0], label: string) => {
      if (!username || busy) return;
      setBusy(true);
      setFailure(null);
      const result = await service.saveSettings(edit);
      setBusy(false);
      if (!result.success) {
        setFailure(result.message);
        if (sheet) setName(sheet.name);
        return;
      }
      mutate((current) => ({ ...current, settings: result.settings }));
      // The name, the theme and the daily goal live on the user row rather
      // than in the keyed half, so the provider's copy — which the dashboard
      // reads the goal from — does not hear about this save on its own.
      void refresh();
      flash(`${label} saved`);
    },
    [busy, flash, mutate, refresh, sheet, username],
  );

  /** The keyed half. Goes through the provider so every page sees it at once. */
  const savePref = useCallback(
    async (values: Partial<Prefs>, label: string) => {
      if (busy) return;
      setBusy(true);
      setFailure(null);
      const message = await update(values);
      setBusy(false);
      if (message) {
        setFailure(message);
        return;
      }
      flash(`${label} saved`);
    },
    [busy, flash, update],
  );

  /**
   * Running one of the six. See ASKS above for what each of them means.
   *
   * Everything the app is holding has to be told, and each in a different way:
   * the settings sheet on this page is re-read, the preferences the whole app
   * shares are re-read through the provider (a preferences reset changes them
   * all, and every page is reading them), and the rail is sent the same event a
   * completed task sends, because it carries the level and never re-reads on
   * its own — after a progress reset it would otherwise go on showing Level 12
   * over an account back at 1.
   *
   * Deleting the account is the one that does not come back here at all: the
   * server has already cleared the session, so the only honest next step is to
   * drop the local copy of who is signed in and leave for the landing page.
   */
  const runAsk = useCallback(
    async (scope: ResetScope, typed: string) => {
      if (!username || asking) return;
      setAsking(true);
      setAskFailure(null);
      const result = await service.resetData(scope, typed);
      if (!result.success) {
        setAsking(false);
        setAskFailure(result.message);
        return;
      }
      if (scope === 'account') {
        await signOut();
        navigate('/home', { replace: true });
        return;
      }
      setAsking(false);
      setAsk(null);
      await refresh();
      reload();
      announceStatsChanged();
      flash(result.message);
    },
    [asking, flash, navigate, refresh, reload, signOut, username],
  );

  /* Light and dark are stored on the account and drive the cookie; 'system'
     is a preference about *how* to choose, so it is kept alongside and the
     resolved colour is still written so a server-rendered page agrees. */
  const pickThemeMode = useCallback(
    (mode: ThemeMode) => {
      const resolved =
        mode === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : mode;
      setTheme(resolved);
      void saveSheet({ theme: resolved }, 'Theme');
      // Matching the device is a statement about light and dark, so it clears
      // any skin: a palette pins the base it was drawn against, and the two
      // preferences would otherwise be giving the theme opposite instructions.
      void savePref({ theme_mode: mode, theme_skin: '' }, 'Theme');
    },
    [savePref, saveSheet, setTheme],
  );

  /**
   * Pick one of the six.
   *
   * Three values move together and all three are written in one save: the
   * skin, the base it pins, and `theme_mode`, which is set to that base so the
   * device-matching toggle stops overriding it a moment later. Light and dark
   * are the same call with an empty skin, which is what makes them the two
   * cards that leave the accent row live.
   */
  const pickTheme = useCallback(
    (skin: ThemeSkin, base: Theme) => {
      setTheme(base);
      void saveSheet({ theme: base }, 'Theme');
      void savePref({ theme_skin: skin, theme_mode: base }, 'Theme');
    },
    [savePref, saveSheet, setTheme],
  );

  /** Whether a built palette is running, and which — the accent row's answer. */
  const skinned = Boolean(prefs.theme_skin);
  const skinLabel =
    THEMES.find((entry) => entry.skin && entry.skin === prefs.theme_skin)?.label ?? '';

  const sections: Section[] = useMemo(() => {
    if (!sheet) return [];
    const commitName = () => {
      const next = name.trim();
      if (next === sheet.name) return;
      void saveSheet({ name: next }, 'Display name');
    };

    return [
      {
        id: 'profile',
        label: 'Profile',
        group: 'Account',
        items: [
          {
            id: 'name',
            label: 'Display name',
            hint: 'What the dashboard greets you by.',
            control: (
              <input
                className="st-input"
                value={name}
                maxLength={60}
                placeholder={sheet.username}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                onBlur={commitName}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') setName(sheet.name);
                }}
              />
            ),
          },
          {
            id: 'avatar',
            label: 'Profile picture',
            hint: 'Chosen from the menu under your avatar, top right.',
            control: <img className="st-avatar" src={sheet.avatar} alt="" />,
          },
          {
            id: 'username',
            label: 'Username',
            hint: 'Fixed. Everything you have made is filed under it.',
            control: <span className="st-fixed">{sheet.username}</span>,
          },
          {
            id: 'email',
            label: 'E-mail',
            hint: 'Changing this means verifying the new address again.',
            control: <span className="st-fixed">{sheet.email || 'None on file'}</span>,
          },
          {
            id: 'since',
            label: 'Member since',
            hint: 'The day this account was made.',
            control: <span className="st-fixed">{joined(sheet.created_at)}</span>,
          },
        ],
      },
      {
        id: 'appearance',
        label: 'Appearance',
        group: 'Personalization',
        items: [
          {
            id: 'theme',
            label: 'Theme',
            hint: 'Applies everywhere, immediately.',
            control: (
              <div className="st-themes" role="group" aria-label="Theme">
                {THEMES.map((entry) => (
                  <ThemeCard
                    key={entry.skin || entry.base}
                    label={entry.label}
                    hint={entry.hint}
                    /* Light and dark are previewed by their base, the four
                       skins by their own name. */
                    preview={entry.skin || entry.base}
                    /* A skin is on when it is the stored one. Light and dark
                       are on when there is no skin and the resolved colour
                       matches — `theme_mode` is not enough on its own, because
                       'system' resolves to one of them and the card that is
                       actually painting the screen is the one to mark. */
                    on={
                      entry.skin
                        ? prefs.theme_skin === entry.skin
                        : !prefs.theme_skin && theme === entry.base
                    }
                    busy={busy}
                    onPick={() => pickTheme(entry.skin, entry.base)}
                  />
                ))}
              </div>
            ),
          },
          {
            id: 'theme-system',
            label: 'Match my device',
            hint: 'Follows your system between light and dark. Turning it on clears a palette.',
            control: (
              <Toggle
                on={prefs.theme_mode === 'system' && !prefs.theme_skin}
                busy={busy}
                label="Match my device"
                onFlip={() =>
                  pickThemeMode(
                    prefs.theme_mode === 'system' && !prefs.theme_skin ? theme : 'system',
                  )
                }
              />
            ),
          },
          {
            id: 'accent',
            label: 'Accent colour',
            hint: skinned
              ? `${skinLabel} brings its own colours. Switch to Light or Dark to choose one.`
              : 'The colour Summit uses for progress, links and highlights.',
            control: (
              /* Left on screen and switched off rather than removed. The row
                 disappearing when a palette is picked would read as the app
                 having lost the setting, and the reader would have no way to
                 find out that the palette is what took it — which is the one
                 thing the hint above now says. */
              <div
                className={`st-swatches${skinned ? ' is-locked' : ''}`}
                role="group"
                aria-label="Accent colour"
              >
                {ACCENTS.map((accent) => (
                  <button
                    key={accent.key}
                    type="button"
                    className={`st-swatch${!skinned && prefs.accent === accent.key ? ' is-on' : ''}`}
                    style={{ '--swatch': accent.swatch } as React.CSSProperties}
                    aria-pressed={!skinned && prefs.accent === accent.key}
                    aria-label={accent.label}
                    title={skinned ? `${skinLabel} sets its own accent` : accent.label}
                    disabled={busy || skinned}
                    onClick={() => void savePref({ accent: accent.key }, 'Accent')}
                  />
                ))}
              </div>
            ),
          },
          {
            id: 'motion',
            label: 'Reduce animations',
            hint: 'Turns off page transitions and bar animations across the app.',
            control: (
              <Toggle
                on={prefs.reduce_motion}
                busy={busy}
                label="Reduce animations"
                onFlip={() => void savePref({ reduce_motion: !prefs.reduce_motion }, 'Motion')}
              />
            ),
          },
          {
            id: 'ambient',
            label: 'Animated background',
            hint: 'The grid, the drifting particles and the slow gradient behind every page.',
            control: (
              <Toggle
                on={prefs.show_ambient}
                busy={busy}
                label="Animated background"
                onFlip={() => void savePref({ show_ambient: !prefs.show_ambient }, 'Background')}
              />
            ),
          },
          {
            id: 'rail',
            label: 'Collapsed navigation',
            hint: 'Keeps the rail down the left as a strip of icons. The button on it does the same thing.',
            control: (
              <Toggle
                on={prefs.nav_collapsed}
                busy={busy}
                label="Collapsed navigation"
                onFlip={() => void savePref({ nav_collapsed: !prefs.nav_collapsed }, 'Navigation')}
              />
            ),
          },
        ],
      },
      {
        id: 'general',
        label: 'Startup',
        group: 'Account',
        items: [
          {
            id: 'home',
            label: 'Open on',
            hint: 'Where signing in lands, and what the app opens on next time.',
            control: (
              <select
                className="st-input"
                value={prefs.home_page}
                disabled={busy}
                onChange={(event) =>
                  void savePref(
                    { home_page: event.target.value as Prefs['home_page'] },
                    'Start page',
                  )
                }
              >
                {HOME_PAGES.map((page) => (
                  <option key={page.key} value={page.key}>
                    {page.label}
                  </option>
                ))}
              </select>
            ),
          },
        ],
      },
      {
        id: 'dashboard',
        label: 'Dashboard',
        group: 'Personalization',
        items: [
          {
            id: 'goal',
            label: 'Daily XP goal',
            hint: `The XP you are aiming at each day. Today's total is shown against it on the dashboard. ${GOAL_MIN}–${GOAL_MAX}.`,
            control: (
              <input
                className="st-input is-num"
                type="number"
                min={GOAL_MIN}
                max={GOAL_MAX}
                step={10}
                defaultValue={sheet.daily_goal}
                disabled={busy}
                onBlur={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next) || next === sheet.daily_goal) return;
                  void saveSheet({ daily_goal: next }, 'Daily goal');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
            ),
          },
          {
            id: 'stats',
            label: 'Show the statistics row',
            hint: 'The four figures across the top of the dashboard.',
            control: (
              <Toggle
                on={prefs.show_stats}
                busy={busy}
                label="Show the statistics row"
                onFlip={() => void savePref({ show_stats: !prefs.show_stats }, 'Dashboard')}
              />
            ),
          },
          {
            id: 'insights',
            label: 'Show the insights panel',
            hint: 'The readings under your task list.',
            control: (
              <Toggle
                on={prefs.show_insights}
                busy={busy}
                label="Show the insights panel"
                onFlip={() => void savePref({ show_insights: !prefs.show_insights }, 'Dashboard')}
              />
            ),
          },
          {
            id: 'focus-panel',
            label: 'Show the focus panel',
            hint: 'The timer beside your tasks. Off, the list takes the full width.',
            control: (
              <Toggle
                on={prefs.show_focus}
                busy={busy}
                label="Show the focus panel"
                onFlip={() => void savePref({ show_focus: !prefs.show_focus }, 'Dashboard')}
              />
            ),
          },
          {
            id: 'quote',
            label: 'Show the daily quote',
            hint: 'The line at the foot of the dashboard.',
            control: (
              <Toggle
                on={prefs.show_quote}
                busy={busy}
                label="Show the daily quote"
                onFlip={() => void savePref({ show_quote: !prefs.show_quote }, 'Dashboard')}
              />
            ),
          },
        ],
      },
      {
        id: 'tasks',
        label: 'Tasks',
        group: 'Productivity',
        items: [
          {
            id: 'priority',
            label: 'Default priority',
            hint: 'Where Quick Add opens, and what a new task is filed as until its XP says otherwise.',
            control: (
              <Seg
                value={prefs.default_priority}
                busy={busy}
                onPick={(next) => void savePref({ default_priority: next }, 'Default priority')}
                options={[
                  { key: 'low', label: 'Low' },
                  { key: 'medium', label: 'Medium' },
                  { key: 'high', label: 'High' },
                ]}
              />
            ),
          },
          {
            id: 'xp',
            label: 'Default XP',
            hint: 'What a new task is worth before you change it — Quick Add, the composer and both dialogs.',
            control: (
              <input
                className="st-input is-num"
                type="number"
                min={5}
                max={500}
                step={5}
                defaultValue={prefs.default_xp}
                disabled={busy}
                onBlur={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next) || next === prefs.default_xp) return;
                  void savePref({ default_xp: next }, 'Default XP');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
            ),
          },
          {
            id: 'rating',
            label: 'Ask how it went',
            hint:
              'What the prompt after a finished task asks — and, because it is the only thing on '
              + 'Analytics the app cannot measure for itself, how much Quality there has to go on.',
            control: (
              <Seg
                value={prefs.rating_depth}
                busy={busy}
                onPick={(next) => void savePref({ rating_depth: next }, 'Questions')}
                options={[
                  { key: 'none', label: 'Nothing' },
                  { key: 'ratings', label: 'Ratings' },
                  { key: 'reasons', label: '+ Reasons' },
                ]}
              />
            ),
          },
          {
            id: 'rating-what',
            label: 'What each level asks',
            hint: RATING_DEPTHS[prefs.rating_depth],
            control: <span className="st-fixed">{RATING_DEPTH_NAMES[prefs.rating_depth]}</span>,
          },
          {
            id: 'task-status',
            label: 'Tasks page opens on',
            hint: 'Which tasks are on the page when you arrive. The controls there still change it for a visit.',
            control: (
              <Seg
                value={prefs.task_status}
                busy={busy}
                onPick={(next) => void savePref({ task_status: next }, 'Opening view')}
                options={[
                  { key: 'open', label: 'Open' },
                  { key: 'done', label: 'Done' },
                  { key: 'all', label: 'All' },
                ]}
              />
            ),
          },
          {
            id: 'task-horizon',
            label: 'How far ahead it reaches',
            hint: 'A week keeps the list to what you can act on. Everything is the whole backlog.',
            control: (
              <Seg
                value={prefs.task_horizon}
                busy={busy}
                onPick={(next) => void savePref({ task_horizon: next }, 'Opening view')}
                options={[
                  { key: 'week', label: 'This week' },
                  { key: 'all', label: 'Everything' },
                ]}
              />
            ),
          },
          {
            id: 'task-sort',
            label: 'Default order',
            hint: 'How the list inside each heading is sorted.',
            control: (
              <select
                className="st-input"
                value={prefs.task_sort}
                disabled={busy}
                onChange={(event) =>
                  void savePref(
                    { task_sort: event.target.value as Prefs['task_sort'] },
                    'Default order',
                  )
                }
              >
                {SORTS.map((sort) => (
                  <option key={sort.key} value={sort.key}>
                    {sort.label}
                  </option>
                ))}
              </select>
            ),
          },
          {
            id: 'task-group',
            label: 'Default headings',
            hint: 'What the list is cut into. No headings is one flat list.',
            control: (
              <select
                className="st-input"
                value={prefs.task_group}
                disabled={busy}
                onChange={(event) =>
                  void savePref(
                    { task_group: event.target.value as Prefs['task_group'] },
                    'Default headings',
                  )
                }
              >
                {GROUPS.map((group) => (
                  <option key={group.key} value={group.key}>
                    {group.label}
                  </option>
                ))}
              </select>
            ),
          },
          {
            id: 'confirm',
            label: 'Confirm before deleting',
            hint: 'Ask first when removing a task. Off means it goes immediately.',
            control: (
              <Toggle
                on={prefs.confirm_delete}
                busy={busy}
                label="Confirm before deleting"
                onFlip={() =>
                  void savePref({ confirm_delete: !prefs.confirm_delete }, 'Confirmation')
                }
              />
            ),
            danger: true,
          },
        ],
      },
      {
        id: 'calendar',
        label: 'Calendar',
        group: 'Productivity',
        items: [
          {
            id: 'view',
            label: 'Default view',
            hint: 'Which one opens when you go to the calendar.',
            control: (
              <Seg
                value={prefs.calendar_view}
                busy={busy}
                onPick={(next) => void savePref({ calendar_view: next }, 'Calendar view')}
                options={[
                  { key: 'day', label: 'Day' },
                  { key: 'week', label: 'Week' },
                  { key: 'month', label: 'Month' },
                ]}
              />
            ),
          },
          {
            id: 'week-start',
            label: 'Weeks start on',
            hint: 'The calendar grid, the month, and the week your dashboard counts.',
            control: (
              <Seg
                value={prefs.week_starts_on}
                busy={busy}
                onPick={(next) => void savePref({ week_starts_on: next }, 'Week start')}
                options={[
                  { key: 'monday', label: 'Monday' },
                  { key: 'sunday', label: 'Sunday' },
                ]}
              />
            ),
          },
          {
            id: 'clock',
            label: 'Clock',
            hint: 'Every time in the app — the calendar grid, due times, blocks and the dashboard.',
            control: (
              <Seg
                value={prefs.clock_format}
                busy={busy}
                onPick={(next) => void savePref({ clock_format: next }, 'Clock')}
                options={[
                  { key: '12h', label: '12-hour' },
                  { key: '24h', label: '24-hour' },
                ]}
              />
            ),
          },
          {
            id: 'clock-what',
            label: 'How a time is written',
            hint: CLOCK_HINT[prefs.clock_format],
            control: <span className="st-fixed">{CLOCK_EXAMPLE[prefs.clock_format]}</span>,
          },
        ],
      },
      {
        id: 'records',
        label: 'Records',
        group: 'Productivity',
        items: [
          {
            id: 'records-sort',
            label: 'History opens ordered by',
            hint: 'The list under your personal bests. The toolbar there still changes it for a visit.',
            control: (
              <Seg
                value={prefs.records_sort}
                busy={busy}
                onPick={(next) => void savePref({ records_sort: next }, 'Records order')}
                options={[
                  { key: 'newest', label: 'Newest' },
                  { key: 'oldest', label: 'Oldest' },
                  { key: 'improvement', label: 'Improvement' },
                ]}
              />
            ),
          },
          {
            id: 'records-sort-what',
            label: 'What “improvement” orders by',
            hint: 'How far a record has come rather than how large it is — a score that went 18 to 25 above one logged once at 400.',
            control: <span className="st-fixed">Distance travelled</span>,
          },
        ],
      },
      {
        id: 'focus',
        label: 'Focus',
        group: 'Productivity',
        items: [
          {
            id: 'focus-goal',
            label: 'Daily focus goal',
            hint: 'What the focus ring fills against. A day you have given its own goal keeps it.',
            control: (
              <select
                className="st-input"
                value={String(prefs.focus_goal_hours)}
                disabled={busy}
                onChange={(event) =>
                  void savePref(
                    { focus_goal_hours: Number(event.target.value) },
                    'Focus goal',
                  )
                }
              >
                {goalOptions(prefs.focus_goal_hours).map((hours) => (
                  <option key={hours} value={hours}>
                    {hoursLabel(hours)}
                  </option>
                ))}
              </select>
            ),
          },
          {
            id: 'focus-dim',
            label: 'Clear the page while focusing',
            hint: 'A running session folds the greeting, the figures and the quote away and leaves the work.',
            control: (
              <Toggle
                on={prefs.focus_dim}
                busy={busy}
                label="Clear the page while focusing"
                onFlip={() => void savePref({ focus_dim: !prefs.focus_dim }, 'Focus mode')}
              />
            ),
          },
          {
            id: 'catchup',
            label: 'Ask about untracked days',
            hint:
              'Once a day, on the first load of the dashboard: the days since you were last '
              + 'here that have no focus time on them, and two boxes to say how long you '
              + 'worked. What you enter counts exactly as tracked time does — consistency, '
              + 'the focus score, the growth chart, every "days you worked" figure. Days you '
              + 'did track are never asked about, and a day you leave blank is left alone.',
            control: (
              <Toggle
                on={prefs.catchup_prompt}
                busy={busy}
                label="Ask about untracked days"
                onFlip={() =>
                  void savePref({ catchup_prompt: !prefs.catchup_prompt }, 'Catch-up prompt')
                }
              />
            ),
          },
        ],
      },
      {
        id: 'notifications',
        label: 'Notifications',
        group: 'Notifications',
        /* Nine switches, and every one of them is read by the server rather
           than by the panel. A channel that is off is not swept at all — see
           CHANNELS in backend/tracking/notify.py — so turning one off stops
           the rows being written instead of writing them and hiding them, and
           turning it back on starts from what is true then rather than
           replaying a fortnight of backlog. */
        note:
          'Nothing here is sent on a schedule. The app looks at your own record when you open '
          + 'it and says what is true — so a quiet week is a quiet bell, and a notification you '
          + 'delete stays deleted until the situation behind it is genuinely new.',
        items: [
          {
            id: 'notify-master',
            label: 'Notifications',
            hint:
              'The master switch. Off stops everything below it: nothing new is written, '
              + 'nothing pops up, and the bell reads empty. Anything already in it is kept and '
              + 'comes back the moment you turn this on again.',
            control: (
              <Toggle
                on={prefs.notifications_enabled}
                busy={busy}
                label="Notifications"
                onFlip={() =>
                  void savePref(
                    { notifications_enabled: !prefs.notifications_enabled },
                    'Notifications',
                  )
                }
              />
            ),
          },
          {
            id: 'notify-popups',
            label: 'Show them on screen',
            hint:
              'A new notification slides in at the corner of the page for a few seconds. Off '
              + 'takes away the interruption and leaves the bell doing its job — everything '
              + 'still arrives, you just go and look at it.',
            control: (
              <Toggle
                on={prefs.notify_popups}
                busy={busy || !prefs.notifications_enabled}
                label="Show them on screen"
                onFlip={() =>
                  void savePref({ notify_popups: !prefs.notify_popups }, 'Pop-ups')
                }
              />
            ),
          },
          ...NOTIFY_CHANNELS.map((channel) => ({
            id: `notify-${channel.key}`,
            label: channel.label,
            hint: channel.hint,
            control: (
              <Toggle
                on={prefs[channel.pref]}
                busy={busy || !prefs.notifications_enabled}
                label={channel.label}
                onFlip={() =>
                  void savePref(
                    { [channel.pref]: !prefs[channel.pref] } as Partial<Prefs>,
                    channel.label,
                  )
                }
              />
            ),
          })),
        ],
      },
      {
        id: 'analytics',
        label: 'Analytics',
        group: 'Data',
        /* The answers to the setup questions a new account is asked, plus the
           two the wizard never puts (the period, and whether to be ranked
           against strangers). Everything here is read by something on the
           page — see utils/analyticsPrefs, which is where a stored word is
           turned into a decision, and the header of
           components/Analytics/Setup for why the questions exist at all. */
        note:
          'These are the answers you gave when you first opened Analytics. Every one of them '
          + 'changes what that page draws or how it says it — none of them changes a figure.',
        items: [
          {
            id: 'window',
            label: 'Default period',
            hint: 'The range Analytics opens on. You can still change it there.',
            control: (
              <select
                className="st-input"
                value={prefs.analytics_window}
                disabled={busy}
                onChange={(event) =>
                  void savePref(
                    { analytics_window: event.target.value as Prefs['analytics_window'] },
                    'Analytics period',
                  )
                }
              >
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="90d">90 days</option>
                <option value="1y">1 year</option>
                <option value="2y">2 years</option>
                <option value="all">All time</option>
              </select>
            ),
          },
          {
            id: 'analytics-home',
            label: 'Analytics opens on',
            hint:
              'Which of the seven tabs you land on. Recommendations is the one that ends in a '
              + 'button; Overview is the long view.',
            control: (
              <select
                className="st-input"
                value={prefs.analytics_home_tab}
                disabled={busy}
                onChange={(event) =>
                  void savePref(
                    { analytics_home_tab: event.target.value as Prefs['analytics_home_tab'] },
                    'Opening tab',
                  )
                }
              >
                {/* The same seven the page's own tab bar draws, from the same
                    list — a select here that had drifted from VIEWS would offer
                    a tab that no longer exists. */}
                {VIEWS.map((view) => (
                  <option key={view.key} value={view.key}>
                    {view.label}
                  </option>
                ))}
              </select>
            ),
          },
          {
            id: 'analytics-log',
            label: 'What you mostly record',
            hint: LOG_STYLE_HINT[prefs.analytics_log_style],
            control: (
              <Seg
                value={prefs.analytics_log_style}
                busy={busy}
                onPick={(next) => void savePref({ analytics_log_style: next }, 'What you record')}
                options={[
                  { key: 'tasks', label: 'Tasks' },
                  { key: 'sessions', label: 'Sessions' },
                  { key: 'both', label: 'Both' },
                ]}
              />
            ),
          },
          {
            id: 'analytics-tone',
            label: 'How blunt Analytics is',
            hint:
              'It never changes a figure — the score is the mean of the same five measures at '
              + 'every setting. It changes where a shortfall starts being called one, and how '
              + 'many problems are put in front of you at once.',
            control: (
              <Seg
                value={prefs.analytics_tone}
                busy={busy}
                onPick={(next) => void savePref({ analytics_tone: next }, 'Tone')}
                options={[
                  { key: 'gentle', label: TONE_LABEL.gentle },
                  { key: 'balanced', label: TONE_LABEL.balanced },
                  { key: 'harsh', label: TONE_LABEL.harsh },
                ]}
              />
            ),
          },
          {
            id: 'analytics-tone-what',
            label: 'What that setting does',
            hint: TONE_HINT[prefs.analytics_tone],
            control: <span className="st-fixed">{TONE_LABEL[prefs.analytics_tone]}</span>,
          },
          {
            id: 'analytics-detail',
            label: 'How much of the page is drawn',
            hint: DETAIL_HINT[prefs.analytics_detail],
            control: (
              <Seg
                value={prefs.analytics_detail}
                busy={busy}
                onPick={(next) => void savePref({ analytics_detail: next }, 'Detail')}
                options={[
                  { key: 'essentials', label: DETAIL_LABEL.essentials },
                  { key: 'standard', label: DETAIL_LABEL.standard },
                  { key: 'everything', label: DETAIL_LABEL.everything },
                ]}
              />
            ),
          },
          {
            id: 'analytics-standing',
            label: 'Rank me against other accounts',
            hint:
              'The percentile panel on the Overview. Off removes it; nothing else on the page '
              + 'reads anybody else\'s record.',
            control: (
              <Toggle
                on={prefs.analytics_standing}
                busy={busy}
                label="Rank me against other accounts"
                onFlip={() =>
                  void savePref({ analytics_standing: !prefs.analytics_standing }, 'Standing')
                }
              />
            ),
          },
          {
            id: 'analytics-setup',
            label: 'Answer the setup questions again',
            hint:
              'The same seven questions, opened on the answers you already gave. Nothing is '
              + 'cleared by going back to them.',
            /* A link rather than a switch, because there is no preference to
               write: the questions are a screen on the analytics page and this
               is the way to it. The page reads `?setup` and opens on the
               wizard — see `askedSetup` in pages/Analytics. */
            control: (
              <Link className="st-btn" to="/analytics?setup=1">
                Open the questions
              </Link>
            ),
          },
        ],
      },
      {
        id: 'data',
        label: 'Data & export',
        group: 'Data',
        items: [
          {
            id: 'export-json',
            label: 'Export everything',
            /* It said "Tasks, goals, records, notes and focus days", which was
               five of the seventeen tables the account owns — the calendar,
               the XP ledger, the goal checkpoints, the subjects and the badges
               were all things this app would delete and could not give back.
               The endpoint sends every one of them now, so the word in the
               label is true and the hint says what it means. */
            hint: 'Every table this account owns — tasks, the calendar, goals and their '
              + 'checkpoints, notes, records, subjects, badges and the XP ledger — as one '
              + 'JSON file.',
            control: (
              <a
                className="st-btn"
                href={service.exportUrl('all', 'json')}
                download
              >
                Download JSON
              </a>
            ),
          },
          {
            id: 'export-csv',
            label: 'Export a table',
            hint: 'One table at a time, as CSV — a spreadsheet cannot hold five shapes at once.',
            control: (
              <div className="st-links">
                {['tasks', 'goals', 'records'].map((table) => (
                  <a
                    key={table}
                    className="st-btn is-small"
                    href={service.exportUrl(table, 'csv')}
                    download
                  >
                    {table}
                  </a>
                ))}
              </div>
            ),
          },
          {
            // This said "On the machine running Summit. Nothing is uploaded
            // anywhere." / "This device", which was true of a laptop and is a
            // false statement on a hosted install — everything here is in the
            // server's database, which is a different promise and a weaker
            // one. It is the same claim the privacy policy used to make; both
            // were written when the only machine was the author's.
            id: 'storage',
            label: 'Where your data lives',
            hint:
              'In the database on the server running Summit — not in this browser. ' +
              'It is not sold, and it is not shared with anyone; the Privacy Policy ' +
              'says what is kept and what leaves.',
            control: <span className="st-fixed">This server</span>,
          },
        ],
      },
      {
        id: 'about',
        label: 'About',
        group: 'System',
        items: [
          {
            id: 'version',
            label: 'Version',
            hint: 'The build you are running.',
            control: <span className="st-fixed">Summit 1.2.0</span>,
          },
          {
            id: 'level',
            label: 'Level and XP',
            hint: 'Counted from everything you have finished.',
            control: (
              <span className="st-fixed">
                Level {sheet.level} · {sheet.xp.toLocaleString()} XP
              </span>
            ),
          },
          {
            id: 'legal',
            label: 'Terms and privacy',
            hint: 'What the app does with what it holds.',
            /* The routes are the long spellings. /terms, /privacy and /about
               are not routed at all, so all three of these used to fall through
               to the catch-all and land on the home page. See App.tsx. */
            control: (
              <div className="st-links">
                <Link className="st-btn is-small" to="/terms-of-service">Terms</Link>
                <Link className="st-btn is-small" to="/privacy-policy">Privacy</Link>
                <Link className="st-btn is-small" to="/about-us">About</Link>
              </div>
            ),
          },
        ],
      },
      {
        id: 'danger',
        label: 'Reset and delete',
        group: 'Danger zone',
        note:
          'Each of these asks first and says what it takes. None of them can be '
          + 'undone, and there is no backup — take an export from Data first if '
          + 'any of it matters.',
        items: ASKS.map((entry) => ({
          id: entry.scope,
          label: entry.label,
          hint: entry.hint,
          danger: true,
          control: (
            <button
              type="button"
              className="st-btn is-danger"
              disabled={busy}
              onClick={() => {
                setAskFailure(null);
                setAsk(entry);
              }}
            >
              {entry.action}
            </button>
          ),
        })),
      },
    ];
  }, [busy, name, pickTheme, pickThemeMode, prefs, savePref, saveSheet, sheet, skinLabel, skinned, theme]);

  const current = useMemo(
    () => sections.find((entry) => entry.id === routeSection) ?? sections[0] ?? null,
    [routeSection, sections],
  );

  /* With a search running the nav stops being the thing that chooses what is
     shown: every section is drawn, filtered to its matching rows, and the ones
     with nothing left drop out. */
  const term = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!term) return null;
    return sections
      .map((entry) => ({
        ...entry,
        items: entry.items.filter((item) =>
          `${item.label} ${item.hint} ${entry.label}`.toLowerCase().includes(term),
        ),
      }))
      .filter((entry) => entry.items.length > 0);
  }, [sections, term]);

  const groups = useMemo(() => {
    const out: { group: string; entries: Section[] }[] = [];
    sections.forEach((entry) => {
      const found = out.find((row) => row.group === entry.group);
      if (found) found.entries.push(entry);
      else out.push({ group: entry.group, entries: [entry] });
    });
    return out;
  }, [sections]);

  /* The arrival cascade. Bound to the read rather than to mount, so it
     starts when there is something to animate — see hooks/usePageEntrance. */
  const entering = usePageEntrance(!loading);

  if (loading) return <Loading label="Reading your settings" />;
  if (error && !sheet) return <ErrorState message={error} onRetry={reload} />;
  if (!sheet) return <ErrorState message="No settings to show." onRetry={reload} />;

  const shown = results ?? (current ? [current] : []);

  return (
    <div className="st-page">
      <div className={`st-shell page-shell${entering ? ' pg-enter' : ''}`}>
        {/* Slate, like Notes: the two pages that change things rather than
            report them. */}
        <PageHero variant="settings" tone="slate">
          <header className="st-head">
            <div>
              <h1>Settings</h1>
              <p className="st-quiet">What this account has chosen.</p>
            </div>
            <span className={`st-status${saved || failure ? ' is-on' : ''}`} role="status">
              {failure ? <em className="st-bad">{failure}</em> : (saved ?? '')}
            </span>
          </header>
        </PageHero>

        <div className="st-body">
          <nav className="st-nav" aria-label="Settings sections">
            <input
              className="st-search"
              type="search"
              placeholder="Search settings…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search settings"
            />
            {groups.map((row) => (
              <div className="st-nav-group" key={row.group}>
                <h2>{row.group}</h2>
                {row.entries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`st-nav-link${
                      !term && current?.id === entry.id ? ' is-on' : ''
                    }`}
                    onClick={() => {
                      setQuery('');
                      navigate(`/settings/${entry.id}`);
                    }}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="st-content">
            {term && shown.length === 0 && (
              <p className="st-empty">Nothing here matches “{query.trim()}”.</p>
            )}

            {shown.map((entry) => {
              const plain = entry.items.filter((item) => !item.danger);
              const risky = entry.items.filter((item) => item.danger);
              return (
                <section className="st-card" key={entry.id}>
                  <h2>{entry.label}</h2>
                  {entry.note && <p className="st-note">{entry.note}</p>}
                  {plain.map((item) => (
                    <div className="st-row" key={item.id}>
                      <div className="st-row-text">
                        <span className="st-label">{item.label}</span>
                        <span className="st-quiet">{item.hint}</span>
                      </div>
                      <div className="st-row-control">{item.control}</div>
                    </div>
                  ))}
                  {risky.length > 0 && (
                    <div className="st-risky">
                      {risky.map((item) => (
                        <div className="st-row" key={item.id}>
                          <div className="st-row-text">
                            <span className="st-label">{item.label}</span>
                            <span className="st-quiet">{item.hint}</span>
                          </div>
                          <div className="st-row-control">{item.control}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>

      {/* Over the page rather than in the row, because the six differ in what
          they leave behind and a row has one line to say it in. */}
      {ask && sheet && (
        <Confirm
          ask={ask}
          username={sheet.username}
          busy={asking}
          failure={askFailure}
          onClose={() => {
            if (asking) return;
            setAsk(null);
            setAskFailure(null);
          }}
          onGo={(typed) => void runAsk(ask.scope, typed)}
        />
      )}
    </div>
  );
}

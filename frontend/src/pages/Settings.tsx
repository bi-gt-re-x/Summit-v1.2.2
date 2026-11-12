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
 * That is the rule the page is held to. When Summit became an AMC prep site
 * the productivity sections went with the pages that read them — start page,
 * tasks, calendar, streaks, notifications, analytics, the guided tour — and
 * what is left is the account, how the app looks, the export, and the danger
 * zone. A control that stores a value nothing looks at is worse than no
 * control: it is a promise the app quietly breaks.
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
 * survive — and the ones that cannot be undone ask for the account's username
 * to be typed out. That is not theatre. The server refuses those without
 * it (TYPED in backend/api/settings.py), so the typing is the confirmation
 * rather than a dialog's opinion of one, and a stray POST cannot delete an
 * account by arriving.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ErrorState, Loading } from '@/components';
import { useApi, useAuth, useDocumentTitle, usePageEntrance, useSettings, useTheme } from '@/hooks';
import { settings as service } from '@/services';
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
import { settingsExit } from '@/utils/settingsExit';
import { THEMES, ThemeCard } from '@/components/Settings/ThemePicker';

const ACCENTS: { key: Accent; label: string; swatch: string }[] = [
  { key: 'violet', label: 'Violet', swatch: '#6d5ae0' },
  { key: 'blue', label: 'Blue', swatch: '#2f6fd0' },
  { key: 'green', label: 'Green', swatch: '#1f8a54' },
  { key: 'amber', label: 'Amber', swatch: '#b8791f' },
  { key: 'rose', label: 'Rose', swatch: '#c0395f' },
  { key: 'slate', label: 'Slate', swatch: '#4a5568' },
  { key: 'graphite', label: 'Graphite', swatch: '#2C302E' },
];

/** A row's control, and the words the search matches it on. */
interface Item {
  id: string;
  label: string;
  hint: string;
  control: React.ReactNode;
  /** Set on rows that change or remove data. Drawn apart, at the end. */
  danger?: boolean;
  /** The control takes the row's full width, under the label. */
  wide?: boolean;
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
 * One of the things the danger zone can do. `loses` and `keeps` are both
 * required: a dialog that only says what it destroys leaves the reader to
 * guess what survives.
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
    hint: 'Puts this page back to its defaults.',
    title: 'Reset every preference?',
    action: 'Reset preferences',
    loses: 'Every setting on this page goes back to its default: theme, color, motion and navigation.',
    keeps: "Your answers, review log, mock scores, study plan and profile picture don't change.",
  },
  {
    scope: 'amc',
    label: 'Reset your AMC progress',
    hint: 'Every answer, the review log, mock scores and the study plan.',
    title: 'Reset your AMC progress?',
    action: 'Reset progress',
    loses: 'Every answer you have given, your review log, every mock and logged score, and your study plan.',
    keeps: 'Your account, profile and preferences. The problems are all still there to do again.',
    typed: true,
  },
  {
    scope: 'account',
    label: 'Delete this account',
    hint: "Your account and everything in it, for good. You'll be signed out.",
    title: 'Delete this account?',
    action: 'Delete my account',
    loses: 'Everything above, your settings and the account itself. Your username frees up and nothing can come back.',
    keeps: 'Nothing. Export your data first if any of it matters. The export button is one section up.',
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
   * Running one of the danger zone's actions. See ASKS above.
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
            hint: "Can't be changed. Everything you've made is saved under it.",
            control: <span className="st-fixed">{sheet.username}</span>,
          },
          {
            id: 'email',
            label: 'Email',
            hint: 'Changing this means verifying the new address again.',
            control: <span className="st-fixed">{sheet.email || 'None on file'}</span>,
          },
          {
            id: 'since',
            label: 'Member since',
            hint: 'When you joined.',
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
            label: 'Accent color',
            hint: skinned
              ? `${skinLabel} brings its own colors. Switch to Light or Dark to choose one.`
              : 'The color Summit uses for progress, links and highlights.',
            control: (
              /* Left on screen and switched off rather than removed. The row
                 disappearing when a palette is picked would read as the app
                 having lost the setting, and the reader would have no way to
                 find out that the palette is what took it — which is the one
                 thing the hint above now says. */
              <div
                className={`st-swatches${skinned ? ' is-locked' : ''}`}
                role="group"
                aria-label="Accent color"
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
            hint: 'The grid, the floating dots and the slow color shift behind every page.',
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
            hint: 'Shrinks the left sidebar to icons. The button on it does the same thing.',
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
        id: 'data',
        label: 'Data & export',
        group: 'Data',
        items: [
          {
            id: 'export-json',
            label: 'Export everything',
            /* Every table the account owns (ACCOUNT_TABLES in backend/api/settings.py). */
            hint: 'All your data in one JSON file: every answer, your review log, mock scores, '
              + 'your study plan and your settings.',
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
            // This said "On the machine running Summit. Nothing is uploaded
            // anywhere." / "This device", which was true of a laptop and is a
            // false statement on a hosted install — everything here is in the
            // server's database, which is a different promise and a weaker
            // one. It is the same claim the privacy policy used to make; both
            // were written when the only machine was the author's.
            id: 'storage',
            label: 'Where your data lives',
            hint:
              "It's stored on the server running Summit. It's never sold or shared. The Privacy Policy "
        + "has the details.",
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
            hint: "The build you're running.",
            control: <span className="st-fixed">Summit 1.2.0</span>,
          },
          {
            id: 'legal',
            label: 'Terms and privacy',
            hint: 'How your data is used.',
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
          "Each one asks first and tells you what it removes. None can be undone and there's no "
          + 'backup, so export your data first.',
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
  }, [
    busy,
    name,
    pickTheme,
    pickThemeMode,
    prefs,
    savePref,
    saveSheet,
    sheet,
    skinLabel,
    skinned,
    theme,
  ]);

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

  if (loading) return <Loading label="Loading your settings" />;
  if (error && !sheet) return <ErrorState message={error} onRetry={reload} />;
  if (!sheet) return <ErrorState message="Couldn't load your settings. Try refreshing." onRetry={reload} />;

  const shown = results ?? (current ? [current] : []);

  return (
    <div className="st-page">
      <div className={`st-shell page-shell${entering ? ' pg-enter' : ''}`}>
        {/* The whole window, with no rail or top bar (App.tsx, `no-chrome`):
            the arrow in the corner is the way out, back to the page the reader
            came from. */}
        <header className="st-head">
          <Link className="st-exit" to={settingsExit()} aria-label="Leave settings" title="Back">
            <ArrowLeft aria-hidden="true" />
          </Link>
          <div className="st-head-text">
            <h1>Settings</h1>
            <p className="st-quiet">Your preferences</p>
          </div>
          <span className={`st-status${saved || failure ? ' is-on' : ''}`} role="status">
            {failure ? <em className="st-bad">{failure}</em> : (saved ?? '')}
          </span>
        </header>

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
              <p className="st-empty">Nothing here matches "{query.trim()}".</p>
            )}

            {shown.map((entry) => {
              const plain = entry.items.filter((item) => !item.danger);
              const risky = entry.items.filter((item) => item.danger);
              return (
                <section className="st-card" key={entry.id}>
                  <h2>{entry.label}</h2>
                  {entry.note && <p className="st-note">{entry.note}</p>}
                  {plain.map((item) => (
                    <div className={`st-row${item.wide ? ' is-wide' : ''}`} key={item.id}>
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

      {/* Over the page rather than in the row, because each differs in what
          it leaves behind and a row has one line to say it in. */}
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

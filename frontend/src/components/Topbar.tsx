/**
 * The bar across the top of every app page — search, alerts, and the account.
 *
 * The rail turned ninety degrees a while ago and took the top bar with it,
 * which left `--topnav-h` declared and set to zero. This gives it a value
 * again, and that is the whole of the layout change: a dozen stylesheets size
 * themselves with `calc(100vh - var(--topnav-h))`, so the pinned pages gave the
 * bar its height back without one of them being edited. See styles/rail.css,
 * where the variable and the reason it survived are written down.
 *
 * **Everything in it does something.** A chrome bar is the easiest place in an
 * app to put three shapes that look like features, and the badge is the worst
 * offender — a red 3 that is always 3 trains people to ignore every badge you
 * will ever show them. So:
 *
 *   **Search** looks in two places: the account's own tasks, and the
 *   containers this app is made of — every page, tab and settings section
 *   (utils/siteIndex). It takes you to the closest match as you type and the
 *   arrows walk the rest, so nobody has to know which screen a control is on
 *   to reach it. The panel is components/Search/Panel.tsx.
 *   **Notifications** are read from the record — late work, today's calendar,
 *   a goal's date coming up, how the week went, a streak that will break
 *   tonight. Nothing is generated on a schedule, so an account in good order
 *   gets no badge at all, which is what makes the badge worth looking at on
 *   the day it appears.
 *
 *   That list used to be counted right here, on every render, from three
 *   numbers `/api/alerts` returned — and a count cannot be deleted. There was
 *   nothing to delete; the next render brought it back, so the bell told you
 *   the same three things until you fixed them. They are rows now
 *   (data/sql/notifications.sql), each one can be thrown away for good, and
 *   the panel is components/Notifications/Panel.tsx.
 *   **Dark mode** is a switch, not a two-option dropdown — it stood in the
 *   rail's foot until the foot became the rank and the XP bar, and it belongs
 *   with the rest of the app's controls anyway.
 *   **The account menu** is now the only one: who is signed in, the level, the
 *   fifty pictures, and the way out. It inherited the avatar picker from the
 *   rail, whose account plate is gone — a picker with no way to open it is a
 *   deleted feature with extra steps.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { NotificationPanel } from './Notifications';
import { SearchPanel } from './Search';
import { useAuth, useNotifications, useSettings, useStats, useTheme } from '@/hooks';
import { AVATARS, avatarPath } from '@/services/avatars';
import { auth } from '@/services';
import { format } from '@/utils';
import type { Theme } from '@/types';
import '@/styles/topbar.css';

const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// --------------------------------------------------------------------------
// The bar
// --------------------------------------------------------------------------
export function Topbar() {
  const { username, avatar, signOut, refresh } = useAuth();
  /* The name the account calls itself, which is the one the dashboard greets
     it by. The bar used to show `username` while the greeting under it showed
     `displayName`, so an account named "temu" with the username "Alpha" read
     as two people on one screen. One name on the surface; the username is in
     the menu below, which is where "which account am I in" belongs. */
  const { displayName, update } = useSettings();
  const { theme, setTheme } = useTheme();

  /**
   * Light and dark, from the bar rather than from Settings — and recorded the
   * same way Settings records it.
   *
   * This called `setTheme` alone, which applies the colour and writes the
   * cookie and the account's `theme` but says nothing about *why*. Two
   * preferences then talked over it on the next load:
   *
   * - `theme_mode` defaults to `'system'`, and SettingsProvider follows the
   *   device whenever it is. So the toggle worked, persisted, and was
   *   overwritten by the device's own setting the next time the page opened —
   *   the theme appearing not to save at all, on a default account.
   * - A skin pins the base it was drawn against, and re-pins it now, so under
   *   Midnight or Sunset the toggle went back the moment it was pressed.
   *
   * Both are the reader's earlier instructions still being obeyed, so the fix
   * is to update them rather than to stop them running: pressing this is a
   * statement about light and dark, which is what `theme_mode` records and
   * what clearing the skin means. It is the pair pages/Settings already
   * writes for its own light and dark cards — see `pickMode` there — so the
   * two controls now leave the account in the same state rather than in two
   * states that disagree on the next load.
   */
  const chooseTheme = useCallback(
    (next: Theme) => {
      setTheme(next);
      void update({ theme_mode: next, theme_skin: '' });
    },
    [setTheme, update],
  );
  // Shared with the rail, which shows the same level under the avatar. Six
  // integers, read once for the session — this used to be the account's whole
  // task list, twice, because the bar and the rail each asked for it.
  const { stats } = useStats();

  const level = stats ? format.levelForTotalXp(stats.xp) : null;

  const [open, setOpen] = useState<'search' | 'alerts' | 'account' | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // A click anywhere else closes whatever is open. One listener for all three
  // panels, because only one is ever open at a time.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /*
   * The bell's list.
   *
   * Not worked out here any more. These are rows the server wrote
   * (context/NotificationsProvider reads and polls them), which is what lets a
   * notification be deleted and stay deleted — the three counts this bar used
   * to derive could not be, because there was nothing to delete.
   *
   * The badge counts the list rather than the unread part of it: it is "you
   * have N notifications", and it goes back to nothing by them being dealt
   * with rather than by being glanced at. `unread` still has a job — it is
   * what marks the new rows inside the panel — and opening the bell is what
   * settles it.
   */
  const { items, markRead } = useNotifications();
  const waiting = items.length;

  const toggle = useCallback(
    (panel: 'search' | 'alerts' | 'account') =>
      setOpen((current) => (current === panel ? null : panel)),
    [],
  );

  /* Opening the bell is what marks its contents read, which is why this one
     is not just `toggle('alerts')`. Reading is not deleting: the list is
     exactly as long afterwards, the badge is simply no longer counting it.

     `open` is read rather than updated with a function, because `markRead`
     sets state in the provider above and a state updater is not the place to
     do that — React runs it while rendering, and updating another component
     from there is the warning it is right to give. */
  const openAlerts = useCallback(() => {
    if (open === 'alerts') {
      setOpen(null);
      return;
    }
    setOpen('alerts');
    markRead();
  }, [open, markRead]);

  const chooseAvatar = useCallback(
    async (name: string) => {
      const result = await auth.setAvatar(name);
      // Re-ask rather than assuming: the server is what decides which picture
      // an account has, and it rejects a name that is not one of the fifty.
      if (result.success) await refresh();
    },
    [refresh],
  );

  /** Which of the fifty is currently the account's, by filename. */
  const currentAvatar = avatar.split('/').pop()?.replace('.svg', '') ?? '';

  return (
    <header className="topbar" ref={barRef}>
      <div className="topbar-actions">
        {/* ---- Search ---- */}
        <div className="topbar-slot">
          <button
            type="button"
            className={`topbar-btn${open === 'search' ? ' is-on' : ''}`}
            aria-label="Search tasks and pages"
            aria-expanded={open === 'search'}
            onClick={() => toggle('search')}
          >
            <svg {...stroke}>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </button>

          {/* Mounted only while open, and that is load-bearing rather than
              tidy: the panel navigates as the reader types, so a copy kept
              alive behind a `display: none` would be a copy still steering the
              router. Its query resets with it, which is also the right
              behaviour — a search is a question, not a setting. */}
          {open === 'search' && (
            <div className="topbar-panel topbar-search">
              <SearchPanel onClose={() => setOpen(null)} />
            </div>
          )}
        </div>

        {/* ---- Notifications ---- */}
        <div className="topbar-slot">
          <button
            type="button"
            className={`topbar-btn${open === 'alerts' ? ' is-on' : ''}`}
            aria-label={
              waiting === 0
                ? 'Notifications: nothing waiting'
                : `Notifications: ${waiting} waiting`
            }
            aria-expanded={open === 'alerts'}
            onClick={() => openAlerts()}
          >
            <svg {...stroke}>
              <path d="M18 8a6 6 0 1 0-12 0c0 6-3 7-3 7h18s-3-1-3-7" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
            {/* How many are in the bell, in a red circle at its corner. No
                badge at zero: a count that is always showing is furniture, and
                an account in good order genuinely has none.

                It counts the list rather than the unread part of it, so it
                goes away by the notifications being dealt with — read, or
                deleted — rather than by being glanced at. A badge that clears
                itself on a glance is a badge that stops meaning anything.

                Past 99 it says 99+. Three digits do not fit in a circle, and
                nobody with that many is counting. */}
            {waiting > 0 && (
              <span className="topbar-badge">{waiting > 99 ? '99+' : waiting}</span>
            )}
          </button>

          {open === 'alerts' && (
            <div className="topbar-panel topbar-alerts">
              <NotificationPanel onClose={() => setOpen(null)} />
            </div>
          )}
        </div>

        {/* ---- Dark mode ---- */}
        {/* The only control here that opens nothing, so it is the only one that
            does not sit in a `topbar-slot` — there is no panel to anchor. The
            icon shows the theme you would be switching to, which is the one
            question a reader has when they look at it. */}
        <button
          type="button"
          className={`topbar-btn topbar-theme${theme === 'dark' ? ' is-dark' : ''}`}
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label="Dark mode"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => chooseTheme((theme === 'dark' ? 'light' : 'dark') as Theme)}
        >
          {theme === 'dark' ? (
            <svg {...stroke}>
              <circle cx="12" cy="12" r="4.2" />
              <path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
            </svg>
          ) : (
            <svg {...stroke}>
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
          )}
        </button>

        {/* ---- Account ---- */}
        <div className="topbar-slot">
          <button
            type="button"
            className={`topbar-account${open === 'account' ? ' is-on' : ''}`}
            aria-haspopup="menu"
            aria-expanded={open === 'account'}
            onClick={() => toggle('account')}
          >
            <img className="topbar-avatar" src={avatar} alt="" width={34} height={34} />
            <span className="topbar-name">{displayName || username}</span>
            <svg className="topbar-caret" {...stroke} strokeWidth={2.2}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {open === 'account' && (
            <div className="topbar-panel topbar-account-menu" role="menu">
              <div className="topbar-account-head">
                <strong>{displayName || username}</strong>
                {/* The username, where it is an answer rather than a label:
                    the menu is where somebody checks which account they are
                    signed in to. Only shown when it differs from the name
                    above it, so an account that never set one does not read
                    its own username twice. */}
                {displayName && displayName !== username && <span>@{username}</span>}
                {level && (
                  <span>
                    Level {level.level} · {format.number(stats?.xp ?? 0)} XP
                  </span>
                )}
              </div>
              {/* All fifty in one scrolling line, as they were in the rail.
                  A wrapping grid would be ten rows deep and turn a menu into a
                  page; the row is the shape that fits a menu. */}
              <div
                className="topbar-avatar-row"
                role="radiogroup"
                aria-label="Profile picture"
              >
                {AVATARS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    className={`topbar-avatar-option${
                      name === currentAvatar ? ' is-current' : ''
                    }`}
                    aria-checked={name === currentAvatar}
                    title={name}
                    aria-label={name}
                    onClick={() => void chooseAvatar(name)}
                  >
                    <img src={avatarPath(name)} alt="" width={34} height={34} loading="lazy" />
                  </button>
                ))}
              </div>

              <Link to="/dashboard" onClick={() => setOpen(null)}>
                Dashboard
              </Link>
              <Link to="/notes" onClick={() => setOpen(null)}>
                Notes
              </Link>
              <Link to="/settings" onClick={() => setOpen(null)}>
                Settings
              </Link>
              <button type="button" className="topbar-signout" onClick={() => void signOut()}>
                Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * The account's preferences, read once and shared.
 *
 * ## Why a provider and not a hook per page
 *
 * These are read in far more places than they are written — the composer wants
 * the default XP, `/calendar` wants the view to redirect to, analytics wants
 * the window to open on. A hook fetching per page would be one request each
 * and, worse, a visible flash of the built-in default before the account's own
 * answer landed.
 *
 * ## The two that are applied to the document
 *
 * `accent` and `reduce_motion` are not read by a component at all: they are
 * written to <html> as attributes, and the stylesheets do the rest. That keeps
 * them out of every component that would otherwise have to thread a class
 * down, and it means they apply to the pages still dressed by the older
 * stylesheets too. See styles/preferences.css.
 *
 * Signed out, the defaults stand and nothing is fetched. Nothing here is worth
 * showing a spinner for — a page renders with the defaults and corrects itself
 * a moment later, which is why `ready` exists for the one caller that needs to
 * wait (the calendar redirect, which cannot un-navigate).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { SettingsContext } from './contexts';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { settings as service } from '@/services';
import { DEFAULT_DAILY_GOAL, DEFAULTS, type Prefs, type ThemeSkin } from '@/services/settings';
import { rememberLook, rememberedLook } from '@/utils/themeLook';
import type { Theme } from '@/types';

/**
 * Which of light and dark each skin is drawn against.
 *
 * The list the settings page shows is the same one, with names and swatches on
 * it — see THEMES in pages/Settings. This is only the half the provider needs,
 * kept here so applying a skin does not mean importing a page into a context.
 */
const SKIN_BASE: Record<ThemeSkin, Theme | null> = {
  '': null,
  midnight: 'dark',
  sunset: 'dark',
  meadow: 'light',
  orchid: 'light',
};

/** Pull just the keyed preferences out of the wider settings object. */
function prefsOf(all: Record<string, unknown>): Prefs {
  const out = { ...DEFAULTS };
  (Object.keys(DEFAULTS) as (keyof Prefs)[]).forEach((key) => {
    if (all[key] !== undefined && all[key] !== null) {
      (out as Record<string, unknown>)[key] = all[key];
    }
  });
  return out;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { username, status } = useAuth();
  const { setTheme } = useTheme();
  /* Seeded from what this browser last saw, not from the built-in defaults.
 
     The inline script in index.html has already put `data-accent` and
     `data-skin` on <html> from the same memory, so the first paint is right.
     Starting this state at DEFAULTS would then undo that within a frame: the
     effects below would read violet and no skin, strip both attributes, and
     the page would flash to plain and back again when the account's real
     preferences landed — a worse flash than the one the inline script exists
     to remove, because now it happens twice.
 
     So the two agree on the way in. The server's answer overwrites both a
     moment later, and that is the copy that decides. */
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...DEFAULTS, ...rememberedLook() }));
  /* The same default the API applies to an account that has never set one. */
  const [dailyGoal, setDailyGoal] = useState(DEFAULT_DAILY_GOAL);
  const [displayName, setDisplayName] = useState('');
  /**
   * Who the values on screen belong to: a username, or null for signed out.
   *
   * `ready` is derived from it rather than being a flag of its own, and that
   * is the fix for a race that made the whole idea of "opens on" unreliable. A
   * boolean set to true when the signed-out pass finished stayed true through
   * the sign-in that followed — so for the moment between the account arriving
   * and its settings landing, the app was confidently reporting the built-in
   * defaults as the account's answer. FrontDoor reads `ready` and then
   * redirects, and a redirect cannot be taken back: somebody who had chosen to
   * open on Tasks was sent to the dashboard, every time, by a page that
   * believed it had waited.
   *
   * Comparing names rather than counting requests means the answer is only
   * ever "yes" about the account actually signed in.
   */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const ready = loadedFor === (username ?? null);

  const refresh = useCallback(async () => {
    if (!username) {
      setPrefs(DEFAULTS);
      setDailyGoal(DEFAULT_DAILY_GOAL);
      setDisplayName('');
      // Signed out is a finished answer, not a pending one.
      setLoadedFor(null);
      return;
    }
    const result = await service.getSettings();
    if (result.success) {
      setPrefs(prefsOf(result.settings as unknown as Record<string, unknown>));
      setDailyGoal(Number(result.settings.daily_goal) || DEFAULT_DAILY_GOAL);
      setDisplayName(String(result.settings.name || '').trim());
    }
    // Marked loaded even when the read failed. The defaults are then the best
    // answer there is, and leaving `ready` false forever would hang every
    // caller that waits on it behind a spinner with nothing coming.
    setLoadedFor(username);
  }, [username]);

  useEffect(() => {
    if (status === 'loading') return;
    void refresh();
  }, [refresh, status]);

  /* Applied to the document rather than passed to components. `data-accent`
     repaints every page's accent token; `data-motion` is what the global
     reduce-motion rule keys off. Both are removed at their default so the
     attribute selector only exists when it is doing something. */
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.accent && prefs.accent !== 'violet') root.setAttribute('data-accent', prefs.accent);
    else root.removeAttribute('data-accent');
  }, [prefs.accent]);

  /* The skin, and the base it is built against.
 
     Two writes from one preference, and the second is the important one.
     Every stylesheet in the app keys off `data-theme`, so a skin does not
     replace the theme — it pins it: Midnight and Sunset are dark palettes and
     Meadow and Orchid are light ones, and a skin drawn against the wrong base
     is its accent pair over the other one's surfaces. So the base is applied
     here rather than left to whatever the reader's theme_mode happened to say.

     `setTheme` rather than a bare attribute write, because it is the one place
     that keeps the three copies of the answer in step — the attribute, the
     cookie and the account. See context/ThemeContext. */
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme_skin) root.setAttribute('data-skin', prefs.theme_skin);
    else root.removeAttribute('data-skin');
  }, [prefs.theme_skin]);

  useEffect(() => {
    const base = SKIN_BASE[prefs.theme_skin];
    if (base) setTheme(base);
  }, [prefs.theme_skin, setTheme]);

  /* Remember the look for the next load — see utils/themeLook.
 
     **Only for a signed-in account whose settings have actually arrived**, and
     both halves of that matter:
 
     - Not while `ready` is false, or the seeded-then-corrected value would be
       written back before the server had been heard from, which is a cache
       writing its own guess down as fact.
     - Not on the signed-out pass. `refresh` resets to DEFAULTS when there is
       no account, and persisting that would wipe the memory every time
       somebody signed out or their session lapsed — so they would sign back in
       to the flash this exists to remove. The account keeps the durable copy
       either way; this is only about what the next paint looks like.
 
     Nothing clears the memory. It is overwritten by the next account to sign
     in on this browser, and a stale one costs a single corrected frame. */
  useEffect(() => {
    if (!username || !ready) return;
    rememberLook({ accent: prefs.accent, skin: prefs.theme_skin });
  }, [prefs.accent, prefs.theme_skin, ready, username]);

  useEffect(() => {
    const root = document.documentElement;
    if (prefs.reduce_motion) root.setAttribute('data-motion', 'reduced');
    else root.removeAttribute('data-motion');
  }, [prefs.reduce_motion]);

  /* 'system' is a preference about how to choose the theme, not a colour, so
     it is kept here and resolved against the device — now and whenever the
     device changes its mind. Light and dark are left alone: those are the
     reader having chosen, and following the OS over them would ignore it.

     ThemeProvider is above this one in the tree, so its setter is available
     and the account's stored colour still goes through the one place that
     writes it. */
  useEffect(() => {
    // A skin owns the base it is drawn against, so following the device over
    // it would put a dark palette's accents on light surfaces the moment the
    // sun came up.
    if (prefs.theme_mode !== 'system' || prefs.theme_skin) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = () => setTheme(media.matches ? 'dark' : 'light');
    follow();
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, [prefs.theme_mode, setTheme]);

  const update = useCallback(
    async (values: Partial<Prefs>): Promise<string | null> => {
      // Applied before the request so the control the reader just clicked
      // responds immediately; rolled back only if the server refuses.
      const previous = prefs;
      setPrefs((current) => ({ ...current, ...values }));
      if (!username) return null;
      const result = await service.saveSettings({ values });
      if (!result.success) {
        setPrefs(previous);
        return result.message;
      }
      setPrefs(prefsOf(result.settings as unknown as Record<string, unknown>));
      return null;
    },
    [prefs, username],
  );

  const value = useMemo(
    () => ({ prefs, dailyGoal, displayName, ready, update, refresh }),
    [prefs, dailyGoal, displayName, ready, update, refresh],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

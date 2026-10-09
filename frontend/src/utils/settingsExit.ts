/**
 * Where Settings' back arrow goes: the last signed-in page that was not
 * Settings. App.tsx records it on every navigation; pages/Settings reads it.
 *
 * In session storage so a reload on /settings still knows the way out, and
 * guarded because that storage can throw (a private window, blocked storage).
 */
const KEY = 'summit:settings-exit';
const FALLBACK = '/dashboard';

export function rememberExit(path: string): void {
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* Nothing to keep it in: the arrow falls back to the dashboard. */
  }
}

export function settingsExit(): string {
  try {
    const path = sessionStorage.getItem(KEY);
    return path && path.startsWith('/') && !path.startsWith('/settings') ? path : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

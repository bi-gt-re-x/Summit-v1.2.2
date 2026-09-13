/**
 * The look this browser was last on, remembered across a refresh.
 *
 * ## What was wrong
 *
 * Light and dark already survive a reload: the backend sets a `theme` cookie
 * and the inline script in index.html reads it in the <head>, so the attribute
 * is right before the first byte of CSS is applied. The other two halves of
 * the look had nothing of the sort.
 *
 * `accent` and `theme_skin` live in the account's preferences, and preferences
 * arrive over the network — after the auth check, which is itself a round
 * trip. So every single load painted the built-in violet on the built-in
 * ground for a few hundred milliseconds and then snapped to the reader's
 * actual theme. On Midnight or Sunset that is not a subtle flash: it is the
 * whole page changing colour after it has already been read.
 *
 * ## Why localStorage and not a cookie
 *
 * The theme cookie exists because the *backend* renders a handful of pages and
 * has to know which colour to send. Nothing on the server renders a skin, so
 * there is nothing to tell it — and a cookie would then be sending two more
 * fields up on every request, including every image and every poll, to answer
 * a question only this browser asks.
 *
 * It is read synchronously in the document head, which rules out anything
 * asynchronous, and it has to survive the tab closing, which rules out
 * sessionStorage.
 *
 * ## It is a cache, not the record
 *
 * The account's own preferences remain the durable copy and the one that
 * follows the reader to another device; this only decides what is on screen
 * for the moment before they arrive, and is overwritten by them when they do.
 * A reader who changed theme on their phone sees the old one here for an
 * instant and then the new one, which is the same trade the theme cookie has
 * always made.
 *
 * Every access is wrapped: Safari's private mode throws on `localStorage`
 * rather than returning null, and a look that cannot be remembered is a flash,
 * not a broken page.
 */
import type { Accent, ThemeSkin } from '@/services/settings';

/**
 * The key, which is written down in two places and must match.
 *
 * The other is the inline script in frontend/index.html, which cannot import
 * from here — it runs in the head, before any module is fetched, which is the
 * entire point of it. `themeLook.test.ts` reads that file and fails if the two
 * have drifted, so this is a duplication that cannot rot silently.
 */
export const LOOK_KEY = 'summit:look';

export interface Look {
  accent: Accent;
  skin: ThemeSkin;
}

/**
 * What this browser last saw, or an empty object.
 *
 * Deliberately loose about what comes back. The values are handed straight to
 * `setAttribute`, and the stylesheet has a block only for the names it knows —
 * an unrecognised one selects nothing and the page renders as plain light or
 * dark, which is exactly the right failure. Validating here would mean a third
 * copy of the list of skins.
 */
export function rememberedLook(): Partial<Look> {
  try {
    const raw = window.localStorage.getItem(LOOK_KEY);
    if (!raw) return {};
    const found: unknown = JSON.parse(raw);
    if (!found || typeof found !== 'object') return {};
    const { accent, skin } = found as Partial<Look>;
    return {
      ...(typeof accent === 'string' ? { accent } : {}),
      ...(typeof skin === 'string' ? { skin } : {}),
    };
  } catch {
    return {};
  }
}

/** Remember this look for the next load. Never throws. */
export function rememberLook(look: Look): void {
  try {
    window.localStorage.setItem(LOOK_KEY, JSON.stringify(look));
  } catch {
    /* Private mode, or storage full. The next load flashes; nothing breaks. */
  }
}

/**
 * Forget it. Called on an explicit sign-out and nowhere else.
 *
 * The inline script cannot know whether anybody is signed in — it runs before
 * the auth check and reads only what is written down — so without this a
 * visitor who had once used the app would get a stranger's palette washed over
 * the landing page for a moment on every visit.
 *
 * Explicit sign-out only. A lapsed session must not clear it: that reader is
 * about to sign back in, and wiping their look on the way out means the first
 * thing they see afterwards is the flash all of this exists to remove.
 */
export function forgetLook(): void {
  try {
    window.localStorage.removeItem(LOOK_KEY);
  } catch {
    /* Nothing was stored, so there is nothing to lose. */
  }
}

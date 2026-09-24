/**
 * Running the hidden chain's legacy scripts inside the single-page app.
 *
 * Three of the chain's four stages are still plain `<script>` files in
 * frontend/secret/, served by the backend at `/static/secret/...` (the mount
 * is in backend/routes/assets.py). They were written for the server-rendered
 * pages, and when React took those pages over nothing was left to load them —
 * the markup they need survived the ports intact, and so did every keyframe
 * they drive, but the scripts themselves had simply stopped running. This is
 * what loads them again.
 *
 * ## Why load them rather than port them
 *
 * The dashboard's stage had to be ported: its trigger is a mark React renders
 * and its reveal swaps text React owns, so neither end of it could be left to
 * a script reaching into the DOM (see hooks/useQuoteEgg.ts). None of that is
 * true of these three. Each binds to markup React renders and drives
 * animations React never touches, so a port would be a transcription — the
 * same logic in a different syntax, with a fresh chance to get the timing
 * wrong. Left as they are, they are the files that have always worked.
 *
 * ## One execution per mount, and exactly one
 *
 * Each script is an IIFE that binds its listeners once, on load, to whatever
 * is on the page at the time. In an SPA those elements are created and
 * destroyed with the route, so the script has to run again on the way back in
 * — a tag loaded once and left alone would be holding listeners on elements
 * that no longer exist. Hence a *new* element each mount rather than the old
 * one re-inserted: a script element that has run will not run again however it
 * is moved about, but an identical `src` on a fresh element does, from cache
 * and without a second request.
 *
 * The other half of that sentence is "and exactly one", which is what the
 * registry below is for. StrictMode deliberately mounts, tears down and
 * mounts again in development (see the note in src/main.tsx). Removing a
 * script tag does not remove the listeners it added, so the naive version
 * binds twice and every click counts double — a secret that opens on the
 * fifth click in development and the tenth in production, which is the worst
 * possible way for it to be wrong. Teardown is therefore deferred by a tick
 * and cancelled if the same scripts are asked for again before it runs.
 * StrictMode's second mount lands inside that tick; a real navigation does
 * not.
 */
import { useEffect } from 'react';

/** Where backend/routes/assets.py mounts frontend/secret/. */
const SECRET = '/static/secret';

interface Loaded {
  els: Element[];
  /** A teardown waiting to happen, and cancellable while it waits. */
  pending: number | null;
}

/** What is on the page right now, keyed by the list that asked for it. */
const loaded = new Map<string, Loaded>();

function append(names: string[]): Element[] {
  return names.map((name) => {
    let el: HTMLLinkElement | HTMLScriptElement;
    if (name.endsWith('.css')) {
      el = document.createElement('link');
      el.rel = 'stylesheet';
      el.href = `${SECRET}/${name}`;
    } else {
      el = document.createElement('script');
      /* Not `defer` or `async`: both are ignored on a dynamically inserted
         script anyway, and what matters here is that the document is already
         built. Every one of these scripts falls straight through its
         `readyState === 'loading'` check to `init()` for that reason. */
      el.src = `${SECRET}/${name}`;
    }
    document.head.appendChild(el);
    return el;
  });
}

/**
 * Load `names` (e.g. `['void.js', 'void.css']`) for as long as this component
 * is mounted. An empty list loads nothing, so a caller can switch them on and
 * off with a condition. The list is joined into the dependency, so it can be
 * written inline without re-running on every render.
 */
export function useSecretScripts(names: readonly string[]): void {
  const key = names.join(',');

  useEffect(() => {
    if (!key) return;

    const already = loaded.get(key);
    if (already) {
      // Its teardown is still pending: cancel it and keep what is on the page.
      if (already.pending !== null) {
        window.clearTimeout(already.pending);
        already.pending = null;
      }
    } else {
      loaded.set(key, { els: append(key.split(',')), pending: null });
    }

    return () => {
      const entry = loaded.get(key);
      if (!entry || entry.pending !== null) return;
      entry.pending = window.setTimeout(() => {
        entry.els.forEach((el) => el.remove());
        loaded.delete(key);
      }, 0);
    };
  }, [key]);
}

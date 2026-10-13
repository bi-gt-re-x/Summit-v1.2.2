/**
 * "This data moved" for the live blocks on a space's page.
 *
 * The server names the live sources a request changed in `X-Summit-Live`
 * (backend/middleware/writes.py), and services/api.ts hands them here. A live
 * block listens for its own source and reads again, so finishing a task on
 * one page moves the blocks that show it without anybody remembering to say
 * so. Other tabs and devices find out by polling (components/Spaces/liveWatch).
 */

export const LIVE_CHANGED = 'summit:live-changed';

export interface LiveChange {
  sources: string[];
}

/** Say that these sources changed. A no-op for an empty list. */
export function announceLiveChanged(sources: string[]): void {
  if (typeof window === 'undefined' || sources.length === 0) return;
  window.dispatchEvent(new CustomEvent<LiveChange>(LIVE_CHANGED, { detail: { sources } }));
}

/** Listen for changes. Returns the unsubscribe. */
export function onLiveChanged(handler: (sources: string[]) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (event: Event) => handler((event as CustomEvent<LiveChange>).detail?.sources ?? []);
  window.addEventListener(LIVE_CHANGED, listener);
  return () => window.removeEventListener(LIVE_CHANGED, listener);
}

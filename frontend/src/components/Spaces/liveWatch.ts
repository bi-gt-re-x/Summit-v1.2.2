/**
 * When a live block should read again. No React.
 *
 * Two signals, for two kinds of change:
 *
 *   - **This tab changed something.** The server names the live sources a
 *     request moved (`X-Summit-Live`, read in services/api.ts) and
 *     utils/liveBus announces them. Blocks on those sources read at once.
 *   - **Something else did.** Another tab, another device, a phone. One poll
 *     per tab asks /api/spaces/live/revisions every POLL_MS while the page is
 *     visible and anything is watching, and again the moment the tab comes
 *     back into view. Each block compares the stamp for its source with the
 *     one it last read and reads again only when they differ, so a quiet page
 *     costs one tiny request per poll and nothing more.
 *
 * Nothing polls while no live block is on screen.
 */
import { get } from '@/services/api';
import { onLiveChanged } from '@/utils/liveBus';
import { LIVE_SOURCES, POLL_MS, type LiveSource } from './live';

export type Revisions = Partial<Record<LiveSource, string>>;

export interface LiveSignal {
  /** Sources this tab just changed: read now, whatever the stamp says. */
  changed?: LiveSource[];
  /** The latest stamps: read if yours differs. */
  revisions?: Revisions;
}

type Listener = (signal: LiveSignal) => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;
let unhook: Array<() => void> = [];
let inFlight = false;
let latest: Revisions = {};

const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

function tell(signal: LiveSignal) {
  for (const listener of [...listeners]) listener(signal);
}

/** Ask the server for the stamps now, and tell every block. */
export async function checkNow(): Promise<void> {
  if (inFlight || !listeners.size || !visible()) return;
  inFlight = true;
  try {
    const reply = await get<{ revisions: Revisions }>('/api/spaces/live/revisions');
    if (reply.success) {
      latest = reply.revisions;
      tell({ revisions: latest });
    }
  } catch {
    // Offline for a moment. The next poll tries again.
  } finally {
    inFlight = false;
  }
}

function start() {
  if (timer !== null || typeof window === 'undefined') return;
  timer = setInterval(() => void checkNow(), POLL_MS);
  const onShow = () => {
    if (visible()) void checkNow();
  };
  document.addEventListener('visibilitychange', onShow);
  window.addEventListener('focus', onShow);
  const off = onLiveChanged((sources) => {
    const changed = sources.filter((source): source is LiveSource => (LIVE_SOURCES as readonly string[]).includes(source));
    if (changed.length) tell({ changed });
  });
  unhook = [() => document.removeEventListener('visibilitychange', onShow), () => window.removeEventListener('focus', onShow), off];
}

function stop() {
  if (timer !== null) clearInterval(timer);
  timer = null;
  for (const undo of unhook) undo();
  unhook = [];
}

/** Hear when to read again. Returns the unsubscribe. */
export function watchLive(listener: Listener): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) stop();
  };
}

/** The last stamps seen, for a block that mounts between polls. */
export const latestRevisions = (): Revisions => latest;

/** For tests: forget everything. */
export function resetLiveWatch(): void {
  listeners.clear();
  stop();
  inFlight = false;
  latest = {};
}

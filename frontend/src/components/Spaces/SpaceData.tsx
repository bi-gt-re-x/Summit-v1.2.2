/**
 * What a space's panels read, read once for the whole page.
 *
 * A panel block (./PanelBlock) draws a panel from Analytics or the Timer with
 * that page's own component, and those components are fed by two hooks that
 * are each written to run once per page: the Analytics page's calls and its
 * model (components/Analytics/useAnalyticsData, useAnalyticsModel), and the
 * focus clock (hooks/usePomodoro). Calling them inside every block would be
 * eight requests per panel, a model worked out per panel, and two clocks that
 * would each log the same session. So they run here, above the editor, and
 * the blocks read what they produced.
 *
 * - **One set of reads**, made only when a panel needs the model, and read
 *   again when ./liveWatch says the account moved (this tab at once, others
 *   within a poll), the same signal live blocks follow.
 * - **One model per time range and subject.** Two panels set to 90 days of
 *   Mathematics share one; a third on 30 days gets its own. `pageNeeds` in
 *   ./panels says which are wanted, and each is worked out by a `ModelHost`
 *   that renders nothing and hands its result to the store.
 * - **One clock**, only when a timer panel is on the page.
 *
 * The store is a plain object with listeners, read with
 * `useSyncExternalStore`, so a panel redraws when its own model or the clock
 * changes and not when the page's text does.
 */
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useAnalyticsData, type AnalyticsData } from '@/components/Analytics/useAnalyticsData';
import { useAnalyticsModel, type AnalyticsModel } from '@/components/Analytics/useAnalyticsModel';
import type { WindowKey } from '@/components/Analytics/data';
import { useAuth, useSettings, useSubjectIndex, useSubjectsReady } from '@/hooks';
import { useFocusSession, type UseFocusSession } from '@/hooks/useFocusSession';
import { usePomodoro, type UsePomodoro } from '@/hooks/usePomodoro';
import type { SubjectIndex } from '@/hooks/useSubjects';
import { modelKey, pageNeeds, splitKey, type PanelConfig } from './panels';
import { watchLive } from './liveWatch';
import type { LiveSource } from './live';

export interface Shared {
  data: AnalyticsData;
  subjects: SubjectIndex;
  /** True until every call the model needs has answered once. */
  waiting: boolean;
}

export interface Clock {
  session: UseFocusSession;
  pomodoro: UsePomodoro;
}

class Store {
  shared: Shared | null = null;
  models = new Map<string, AnalyticsModel>();
  clock: Clock | null = null;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  tell() {
    for (const listener of [...this.listeners]) listener();
  }
}

const StoreContext = createContext<Store | null>(null);

/** The sources whose changes move what the Analytics panels show. */
const WATCHED: readonly LiveSource[] = ['productivity', 'goals', 'skills', 'records', 'calendar'];

/** How long to wait for a burst of changes to settle before reading again. */
const SETTLE_MS = 400;

export function SpaceData({ blocks, children }: { blocks: ReadonlyArray<{ type: string; panel?: unknown }>; children: ReactNode }) {
  const store = useRef<Store | null>(null);
  if (!store.current) store.current = new Store();
  const { models, timer } = pageNeeds(blocks);
  return (
    <StoreContext.Provider value={store.current}>
      {models !== '[]' && <AnalyticsHost keys={models} store={store.current} />}
      {timer && <ClockHost store={store.current} />}
      {children}
    </StoreContext.Provider>
  );
}

const AnalyticsHost = memo(function AnalyticsHost({ keys, store }: { keys: string; store: Store }) {
  const data = useAnalyticsData();
  const { username, refresh } = data;
  const subjects = useSubjectIndex(username);
  const subjectsReady = useSubjectsReady(username);
  const { ready } = useSettings();
  const waiting =
    [data.tasks, data.series, data.ratings, data.goals, data.baseline, data.adopted, data.gradedLog, data.scoreLog, data.said, data.mood]
      .some((call) => call.loading) || !ready || !subjectsReady;

  const shared = useMemo<Shared>(() => ({ data, subjects, waiting }), [data, subjects, waiting]);
  useLayoutEffect(() => {
    store.shared = shared;
    store.tell();
  }, [shared, store]);
  useEffect(
    () => () => {
      store.shared = null;
      store.tell();
    },
    [store],
  );

  /* Read again when the account moves, the way live blocks do. A change in
     this tab says which sources it moved; another tab's shows up as a new
     stamp on the next poll. Several of each in a burst are one read. */
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let seen: Record<string, string> | null = null;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => latest.current(), SETTLE_MS);
    };
    const stop = watchLive((signal) => {
      if (signal.changed?.some((source) => WATCHED.includes(source))) soon();
      if (signal.revisions) {
        const now = Object.fromEntries(WATCHED.map((source) => [source, signal.revisions?.[source] ?? '']));
        if (seen && WATCHED.some((source) => now[source] !== seen![source])) soon();
        seen = now;
      }
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, []);

  const wanted = useMemo(() => JSON.parse(keys) as string[], [keys]);
  return (
    <>
      {wanted.map((key) => (
        <ModelHost key={key} id={key} shared={shared} store={store} />
      ))}
    </>
  );
});

const ModelHost = memo(function ModelHost({ id, shared, store }: { id: string; shared: Shared; store: Store }) {
  const { span, subject } = splitKey(id);
  const pinned = useMemo(() => ({ span: span as WindowKey, subject }), [span, subject]);
  const model = useAnalyticsModel(shared.data, shared.subjects, shared.waiting, pinned);
  useLayoutEffect(() => {
    store.models.set(id, model);
    store.tell();
  });
  useEffect(
    () => () => {
      store.models.delete(id);
      store.tell();
    },
    [id, store],
  );
  return null;
});

const ClockHost = memo(function ClockHost({ store }: { store: Store }) {
  const { username } = useAuth();
  const session = useFocusSession(username);
  const pomodoro = usePomodoro(username, session);
  useLayoutEffect(() => {
    store.clock = { session, pomodoro };
    store.tell();
  });
  useEffect(
    () => () => {
      store.clock = null;
      store.tell();
    },
    [store],
  );
  return null;
});

function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('A panel block has to sit inside <SpaceData>.');
  return store;
}

/** The page's reads, or null until they exist. */
export function useShared(): Shared | null {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => store.shared);
}

/** The model a block's settings ask for, or null while it's being worked out. */
export function usePanelModel(config: PanelConfig): AnalyticsModel | null {
  const store = useStore();
  const key = modelKey(config);
  return useSyncExternalStore(store.subscribe, () => store.models.get(key) ?? null);
}

/** The page's focus clock, or null until it's running. */
export function useClock(): Clock | null {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => store.clock);
}

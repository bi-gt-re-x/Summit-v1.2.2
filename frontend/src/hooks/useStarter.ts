/**
 * The getting-started stage for the signed-in account, and what a reader can
 * do about it. The rule itself is utils/starter.
 */
import { useCallback, useMemo } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { useStats } from '@/hooks/useStats';
import {
  FEATURES,
  isLocked as lockedFor,
  opensAfter as waitFor,
  isNewAccount,
  newlyOpened,
  nextUnlock,
  stageOf,
  type Feature,
  type FeatureId,
  type Stage,
} from '@/utils/starter';

export interface Starter {
  /** False until the account's settings and stats have arrived. Nothing should lock before then. */
  ready: boolean;
  stage: Stage;
  /** Made since getting started existed, so it gets the tour and page guides. */
  fresh: boolean;
  /** Days with at least one finished task. */
  taskDays: number;
  isLocked: (id: FeatureId) => boolean;
  /** Days of tasks a page waits for, with any head start taken off. */
  opensAfter: (id: FeatureId) => number;
  /** The next page to open and how many more days of tasks it takes, or null. */
  next: { feature: Feature; days: number } | null;
  /** Pages the task days have opened that Mango hasn't announced yet. */
  unannounced: Feature[];
  /** Open features past their note, for good. Also how an unlock is marked announced. */
  open: (...ids: FeatureId[]) => Promise<string | null>;
  /** Open everything. */
  unlockAll: () => Promise<string | null>;
  /** Back to how a new account starts. Only means something for a new account. */
  restart: () => Promise<string | null>;
}

export function useStarter(): Starter {
  const { prefs, createdAt, ready: settingsReady, update } = useSettings();
  const { stats } = useStats();
  const taskDays = stats?.task_days ?? 0;
  const headStart = stats?.head_start ?? 0;
  const opened = prefs.features_open;
  const ready = settingsReady && stats !== null;

  const input = useMemo(() => ({ createdAt, taskDays, headStart, prefs: { features_open: opened } }), [createdAt, taskDays, opened]);
  const stage: Stage = ready ? stageOf(input) : 'open';

  const isLocked = useCallback((id: FeatureId) => ready && lockedFor(input, id), [ready, input]);

  const open = useCallback(
    (...ids: FeatureId[]) => {
      const add = ids.filter((id) => !opened.includes(id));
      return add.length ? update({ features_open: [...opened, ...add] }) : Promise.resolve(null);
    },
    [opened, update],
  );
  const unlockAll = useCallback(
    () => update({ starter_done: true, features_open: FEATURES.map((feature) => feature.id) }),
    [update],
  );
  const restart = useCallback(
    () => update({ starter_done: false, features_open: [], welcome_seen: false, tours_seen: [] }),
    [update],
  );

  return useMemo(
    () => ({
      ready,
      stage,
      fresh: isNewAccount(createdAt),
      taskDays,
      isLocked,
      opensAfter: (id: FeatureId) => waitFor(id, headStart),
      next: ready ? nextUnlock(input) : null,
      unannounced: ready ? newlyOpened(input) : [],
      open,
      unlockAll,
      restart,
    }),
    [ready, stage, createdAt, taskDays, headStart, isLocked, input, open, unlockAll, restart],
  );
}

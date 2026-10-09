/**
 * The getting-started stage for the signed-in account, and the three things a
 * reader can do about it. The rule itself is utils/starter.
 */
import { useCallback, useMemo } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { useStats } from '@/hooks/useStats';
import {
  FEATURES,
  isLocked as lockedIn,
  stageOf,
  starterDaysLeft,
  type FeatureId,
  type Stage,
} from '@/utils/starter';

export interface Starter {
  /** False until the account's settings have arrived. Nothing should lock before then. */
  ready: boolean;
  stage: Stage;
  /** Whole days left of the starter stage. Only meaningful while it lasts. */
  daysLeft: number;
  isLocked: (id: FeatureId) => boolean;
  /** Open one feature past its note, for good. */
  open: (id: FeatureId) => Promise<string | null>;
  /** End the starter days now: every page is listed, the advanced ones locked. */
  endStarter: () => Promise<string | null>;
  /** Open everything. */
  unlockAll: () => Promise<string | null>;
  /** Back to how a new account starts. Only means something for a young account. */
  restart: () => Promise<string | null>;
}

export function useStarter(): Starter {
  const { prefs, createdAt, ready, update } = useSettings();
  const { stats } = useStats();
  const level = stats?.level ?? 0;
  const opened = prefs.features_open;

  const stage: Stage = ready ? stageOf({ createdAt, level, prefs }) : 'open';

  const isLocked = useCallback((id: FeatureId) => lockedIn(stage, id, opened), [stage, opened]);

  const open = useCallback(
    (id: FeatureId) => (opened.includes(id) ? Promise.resolve(null) : update({ features_open: [...opened, id] })),
    [opened, update],
  );
  const endStarter = useCallback(() => update({ starter_done: true }), [update]);
  const unlockAll = useCallback(
    () => update({ starter_done: true, features_open: FEATURES.map((feature) => feature.id) }),
    [update],
  );
  const restart = useCallback(
    () => update({ starter_done: false, features_open: [], welcome_seen: false }),
    [update],
  );

  return useMemo(
    () => ({
      ready,
      stage,
      daysLeft: starterDaysLeft(createdAt),
      isLocked,
      open,
      endStarter,
      unlockAll,
      restart,
    }),
    [ready, stage, createdAt, isLocked, open, endStarter, unlockAll, restart],
  );
}

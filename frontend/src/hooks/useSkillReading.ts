/**
 * Where the account stands on every skill-tree node, from the server.
 *
 * One request for the whole account (services/skillProgress), kept in a
 * module cache per account so the tree, the Subjects tab and a subject page
 * opened one after another read it once. Refetched whenever tasks change
 * (STATS_CHANGED in utils/statsBus), because a finished task is exactly what
 * moves a tile, and replaced outright by the reading every write answers with.
 */
import { useCallback, useEffect, useState } from 'react';
import * as skillProgress from '@/services/skillProgress';
import type { SkillReading } from '@/services/skillProgress';
import { STATS_CHANGED } from '@/utils/statsBus';

const cache = new Map<string, SkillReading>();
const listeners = new Set<() => void>();

function store(username: string, next: SkillReading) {
  cache.set(username, next);
  listeners.forEach((listener) => listener());
}

/** For tests: forget every account's reading. */
export function clearSkillReadingCache(): void {
  cache.clear();
}

export interface UseSkillReading {
  /** Null until the first answer arrives (or when signed out). */
  reading: SkillReading | null;
  loading: boolean;
  error: string | null;
  /** Swap in the reading a write answered with. */
  replace: (next: SkillReading) => void;
  reload: () => Promise<void>;
}

export function useSkillReading(username: string | null): UseSkillReading {
  const [reading, setReading] = useState<SkillReading | null>(
    username ? cache.get(username) ?? null : null,
  );
  const [loading, setLoading] = useState(Boolean(username && !cache.has(username)));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!username) return;
    try {
      const result = await skillProgress.reading();
      if (result.success) {
        store(username, readingOf(result));
        setError(null);
      } else {
        setError(result.message ?? "Couldn't load your skill tree.");
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    if (!username) {
      setReading(null);
      setLoading(false);
      return;
    }
    setReading(cache.get(username) ?? null);
    setLoading(!cache.has(username));
    const sync = () => setReading(cache.get(username) ?? null);
    listeners.add(sync);
    void reload();
    const onChange = () => void reload();
    window.addEventListener(STATS_CHANGED, onChange);
    return () => {
      listeners.delete(sync);
      window.removeEventListener(STATS_CHANGED, onChange);
    };
  }, [username, reload]);

  const replace = useCallback(
    (next: SkillReading) => {
      if (username) store(username, next);
    },
    [username],
  );

  return { reading, loading, error, replace, reload };
}

/** The reading's own fields out of a write's reply, which carries more. */
export function readingOf(reply: SkillReading): SkillReading {
  return {
    status: reply.status,
    nodes: reply.nodes,
    unfiled: reply.unfiled,
    goals: reply.goals,
    checkable: reply.checkable,
    targets: reply.targets,
  };
}

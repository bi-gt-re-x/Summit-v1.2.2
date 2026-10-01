/**
 * The reader's per-skill attempts, held for a page and written through.
 *
 * Two pages read these — the skill tree, which writes them, and the Growth
 * tab, which reads them over a period — and both want the whole list, because
 * a level is a reading of every row up to a date. One request on arrival, then
 * the list is kept in step with what this page itself adds and removes, so a
 * mark changes the level on screen without a second round trip.
 *
 * A write waits for the server rather than assuming it. A level is a claim
 * about the reader built from these rows, and drawing a level from a row that
 * was then refused would be the one wrong thing this could do.
 */
import { useCallback, useEffect, useState } from 'react';
import { skillAttempts } from '@/services';
import type { Attempt, NewAttempt } from '@/services/skillAttempts';

export interface UseSkillAttempts {
  attempts: Attempt[];
  /** True until the first answer. */
  loading: boolean;
  /** The last failure, in the server's words, or null. */
  error: string | null;
  /** Store one; resolves to the stored row, or null when it was refused. */
  add: (attempt: NewAttempt) => Promise<Attempt | null>;
  /** Take one back; resolves to whether it went. */
  remove: (id: string) => Promise<boolean>;
}

export function useSkillAttempts(username: string | null): UseSkillAttempts {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setAttempts([]);
    if (!username) {
      setLoading(false);
      return;
    }
    setLoading(true);
    skillAttempts
      .list()
      .then((result) => {
        if (!live) return;
        if (result.success) {
          setAttempts(result.attempts);
          setError(null);
        } else {
          setError(result.message ?? 'Could not load your practice.');
        }
      })
      .catch(() => live && setError('Could not reach the server.'))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [username]);

  const add = useCallback(async (attempt: NewAttempt) => {
    try {
      const result = await skillAttempts.add(attempt);
      if (!result.success) {
        setError(result.message ?? 'That was not saved.');
        return null;
      }
      setError(null);
      setAttempts((was) => [...was, result.attempt]);
      return result.attempt;
    } catch {
      setError('Could not reach the server.');
      return null;
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      const result = await skillAttempts.remove(id);
      if (!result.success) {
        setError(result.message ?? 'That was not removed.');
        return false;
      }
      setError(null);
      setAttempts((was) => was.filter((row) => row.id !== id));
      return true;
    } catch {
      setError('Could not reach the server.');
      return false;
    }
  }, []);

  return { attempts, loading, error, add, remove };
}

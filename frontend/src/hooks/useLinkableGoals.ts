/**
 * The goals a task can be filed against, for the forms that create tasks.
 *
 * The tasks page and the dashboard already hold the account's goals — both
 * render something else that needs them — so they pass their own list to
 * `GoalField` and never come here. The calendar does not: its views are about
 * a grid of time and have never had a reason to know what the account is
 * aiming at. This is that reason, and it is small enough not to be one on its
 * own, which is why it is cached rather than lifted into the calendar's data
 * hook: the dialog wants the list, the grid does not, and a fetch on every
 * opened dialog to answer a question whose answer changes when a goal is
 * created is the wrong trade.
 *
 * Cached the same way `useSubjects` caches the catalogue, for the same reasons
 * and with the same account-keyed cache: one browser can sign out and back in
 * as somebody else, and an unkeyed cache would offer the second account the
 * first's goals to file work against.
 */
import { useEffect, useState } from 'react';
import { linkableGoals } from '@/components/Tasks/GoalField';
import { goals as goalService } from '@/services';
import type { Goal } from '@/types';

const cache = new Map<string, Goal[]>();
const inFlight = new Map<string, Promise<Goal[]>>();

/**
 * Drop what is cached, so the next dialog asks again.
 *
 * Creating a goal is the event that makes this wrong, and it happens on a
 * different page — so rather than a subscription, the goals page clears the
 * cache on its way out of a create. A stale list here offers a goal that was
 * just renamed, or misses one that was just made; neither corrupts anything,
 * and both are fixed by the next read.
 */
export function forgetLinkableGoals(): void {
  cache.clear();
  inFlight.clear();
}

async function load(key: string): Promise<Goal[]> {
  const held = inFlight.get(key);
  if (held) return held;

  const request = goalService
    .getGoals()
    .then((result) => {
      const rows = result.success ? linkableGoals(result.goals ?? []) : [];
      cache.set(key, rows);
      return rows;
    })
    .catch(() => {
      // A failed read means the field offers nothing, which hides it — see
      // `GoalField`. The task is still created and the matcher still reads its
      // name, so the reader loses the shortcut and not the link.
      cache.set(key, []);
      return [];
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}

/** The account's outcome goals, or [] while they are on their way. */
export function useLinkableGoals(username: string | null): Goal[] {
  const key = username ?? '';
  const [goals, setGoals] = useState<Goal[]>(() => cache.get(key) ?? []);

  useEffect(() => {
    if (!username) {
      setGoals([]);
      return;
    }
    const held = cache.get(key);
    if (held) {
      setGoals(held);
      return;
    }
    let live = true;
    void load(key).then((rows) => {
      if (live) setGoals(rows);
    });
    return () => {
      live = false;
    };
  }, [key, username]);

  return goals;
}

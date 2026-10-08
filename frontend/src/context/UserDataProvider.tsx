/**
 * The account's task list — read once, and only when something wants it.
 *
 * ## What this used to be, and what was still wrong with it
 *
 * `useUserData` used to be a hook that fetched. Every caller of it therefore
 * had its own copy of the state and its own request, and the callers are not
 * rare: the dashboard, the top bar and the rail all mount together on the
 * first paint, so arriving at `/dashboard` asked the server for the same
 * `/api/get_user_data` response three times. Moving the state up here fixed
 * that, and everything below about `mutate` and `reload` still holds.
 *
 * What it did not fix is what that one remaining request *costs*.
 * `/api/get_user_data` returns the stats block plus every task the account has
 * ever created: for the largest account in this database, 2.9 MB of JSON. And
 * because this provider sits above the whole app and fetched on mount, every
 * page paid it — including the pages that never read a task.
 *
 * ## Two changes
 *
 * **The six numbers left.** They live in `StatsProvider` above this one, fed
 * by `/api/stats`, because the rail and the top bar want a level and an XP
 * total and nothing else. `data.stats` below is that state, read back out of
 * context — not a second copy. See the note in StatsProvider for why there
 * must only ever be one.
 *
 * **The task read is demand-gated.** It does not happen until something has
 * actually asked for it by calling `useUserData`, and the callers that do are
 * the ones whose subject is the task list: dashboard, tasks, calendar, goals,
 * records and analytics. Settings, achievements, notes and the skill trees do
 * not, and neither do the rail and the top bar — so a session that stays on
 * those pages never reads the list at all.
 *
 * The gate latches on: once anything has asked, the read stays live for the
 * session. Otherwise navigating dashboard → analytics → dashboard would drop
 * the demand to zero and re-fetch megabytes on the way back, which is worse
 * than the problem being solved.
 *
 * One read, kept — until the tasks change. The server marks every response
 * from a request that wrote them, and the list is then read again the next
 * time a page that shows tasks mounts. See `stale` below.
 *
 * ## What callers see
 *
 * The same object as before, `useApi`'s, so no call site changed:
 *
 *   * **`mutate` moves the whole app.** It used to write to one caller's
 *     private copy, so completing a task on the dashboard left the top bar
 *     showing the XP from before. It splits the update now — the stats half
 *     goes to `StatsProvider`, the tasks half stays here — which keeps that
 *     guarantee across the split rather than quietly giving it up.
 *   * **`reload` is one request.** The Refresh button used to re-ask per
 *     mounted caller. It re-reads both halves, because a reader pressing it
 *     means the whole screen.
 *
 * Signed out nothing is fetched: the call resolves to the same
 * `success: false` envelope it always did, which surfaces as `error` and lets
 * a page say "sign in" rather than spin.
 *
 * The streak decay that used to ride on this read has moved to `/api/stats`
 * with the numbers. It has to happen in exactly one place, and that place is
 * now the read every page makes rather than the one most pages skip.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { UserDataContext } from './contexts';
import { useApi } from '@/hooks/useApi';
import { useStats } from '@/hooks/useStats';
import { tasks } from '@/services';
import type { UserData } from '@/services/tasks';
import { TASKS_WRITTEN } from '@/utils/statsBus';

export function UserDataProvider({ children }: { children: ReactNode }) {
  const { stats, username, mutate: writeStats, reload: reloadStats } = useStats();

  /*
   * Whether anything has asked for the task list yet.
   *
   * One-way: `useUserData` flips it and nothing flips it back. See the note
   * above on why the gate latches rather than tracking a live count.
   */
  const [wanted, setWanted] = useState(false);
  const wantedRef = useRef(false);
  /*
   * Whether the server's task list has changed since this one was read.
   *
   * Set by any write to the tasks — every response from a request that wrote
   * them is marked (backend/middleware/writes.py) and services/api announces
   * it — so no page has to remember to refresh this list after a change. The
   * page that made the change has usually written it onto the list already
   * (`mutate`), so nothing is re-read under it; the list is read again when
   * the next page that shows tasks mounts, which is exactly the moment a
   * stale list used to be shown ("Plan my next session" booked a task, and
   * Tasks and the calendar went on without it until a reload).
   */
  const stale = useRef(false);
  useEffect(() => {
    const mark = () => {
      stale.current = true;
    };
    window.addEventListener(TASKS_WRITTEN, mark);
    return () => window.removeEventListener(TASKS_WRITTEN, mark);
  }, []);

  const call = useCallback(
    () =>
      username
        ? tasks.getUserData()
        : Promise.resolve({
            success: false as const,
            message: 'Sign in to see your dashboard.',
          }),
    [username],
  );

  const {
    data,
    error,
    loading,
    refreshing,
    reload: reloadTasks,
    mutate: mutateTasks,
  } = useApi(call, [username], { enabled: wanted });

  const reloadTasksRef = useRef(reloadTasks);
  reloadTasksRef.current = reloadTasks;

  /* A page that shows tasks has mounted: read the list the first time, and
     again whenever the tasks have changed since it was read. */
  const want = useCallback(() => {
    if (!wantedRef.current) {
      wantedRef.current = true;
      // The first read is about to happen and will be current.
      stale.current = false;
      setWanted(true);
      return;
    }
    if (stale.current) {
      stale.current = false;
      reloadTasksRef.current();
    }
  }, []);

  /*
   * The gate is demand only, deliberately — not `wanted && username`.
   *
   * Signed out, `call` above resolves to the same `success: false` envelope it
   * always did without touching the network, and that surfaces as `error` so a
   * page can say "sign in" instead of spinning. Gating on the username too
   * would leave `error` null and the page waiting for an answer that is never
   * coming.
   */

  /*
   * The shape every call site already destructures: `{ stats, tasks }`.
   *
   * The stats half comes from context and the tasks half from the read above,
   * which is the whole of the split. `/api/get_user_data` still answers with a
   * stats block of its own and it is deliberately dropped here — six integers
   * are not worth a second source of truth, and `StatsProvider` is the one.
   */
  const composed: UserData | null = useMemo(
    () => (data ? { stats: stats ?? data.stats, tasks: data.tasks } : null),
    [data, stats],
  );

  /**
   * Apply a change to both halves at once.
   *
   * Callers hand in an update over the whole `{ stats, tasks }` object, the
   * way they always have. It is run once and its two halves are routed to the
   * two states, so a completion that awards XP and marks a task done still
   * lands as one change from the caller's point of view.
   */
  const mutate = useCallback(
    (update: (current: UserData) => UserData) => {
      // Nothing to change before the first read — the same rule `useApi.mutate`
      // has always had, for the same reason: a write that lands before the read
      // is a write whose answer the read carries.
      if (!composed) return;

      // Run over the rendered value rather than inside a state updater. The
      // update has to be applied once and its halves sent to two states, and a
      // React updater must be pure — writing to a second state from inside one
      // would run twice under StrictMode and award the XP twice.
      //
      // The cost is that two `mutate` calls in the same tick would both read
      // the same starting point. Every call site is one call in one handler,
      // applying one server response, so that case does not arise; if it ever
      // does, this is the line that has to change.
      const next = update(composed);
      writeStats(() => next.stats);
      mutateTasks((current) => ({ ...current, tasks: next.tasks }));
    },
    [composed, mutateTasks, writeStats],
  );

  const reload = useCallback(() => {
    reloadStats();
    reloadTasks();
  }, [reloadStats, reloadTasks]);

  // Spread into a memo rather than passed straight through: `useApi` returns a
  // fresh object every render, and this provider sits above the entire app, so
  // an unmemoised value would re-render every consumer on every render of
  // anything above it.
  const value = useMemo(
    () => ({
      data: composed,
      error,
      loading,
      refreshing,
      reload,
      mutate,
      username,
      want,
    }),
    [composed, error, loading, refreshing, reload, mutate, username, want],
  );

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
}

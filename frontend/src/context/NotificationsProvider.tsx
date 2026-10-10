/**
 * The bell's list, read once for the whole app and kept up to date.
 *
 * ## Asking is what makes them
 *
 * There is no job runner behind this app, so nothing writes a notification
 * except the request that asks for the list — the server sweeps the account's
 * record and writes down what is true, then answers. See
 * backend/tracking/notify.py. That is why this polls at all: the interval is
 * not "check for messages somebody sent", it is "look at the record again".
 *
 * It also asks whenever a completion moves the numbers, on the same
 * `summit:stats-changed` event the rail and the top bar listen to
 * (components/Rail.tsx). Finishing a task is exactly what clears a "due today"
 * or a streak warning, and waiting a minute to notice is what makes an app
 * feel like it is not paying attention.
 *
 * A reload is cheap on the second call and after: the sweep inserts on a
 * fingerprint, so finding the same situation writes nothing.
 *
 * ## Three states, not one
 *
 * A notification is *unread* until the bell is opened on it, *shown* once it
 * has actually been on screen, and *deleted* when the reader throws it away.
 * They are genuinely different: the badge counts the first, the pop-ups are
 * driven by the second, and only the third is permanent.
 *
 * The shown stamp is written by the client because the client is the only one
 * that knows whether the pop-up was drawn. It is sent as soon as the pop-up
 * mounts rather than when it closes — a reader who navigates away mid-toast
 * has still seen it, and the alternative is a notification that greets them
 * again on every page.
 *
 * ## Deleting is a real delete
 *
 * `remove` and `clear` go to the server, and the row that comes back is gone
 * for good — the situation behind it cannot raise it again. So the list is
 * pruned locally first and reconciled on the next poll: the server is about to
 * agree, and the one thing worse than a slow delete is a notification that
 * flickers back for a frame.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { NotificationsContext } from './contexts';
import { STATS_CHANGED } from '@/components/Rail';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { notifications as service } from '@/services';
import { isoDate } from '@/utils/dates';
import type { Notification } from '@/services/notifications';

/**
 * How often the record is looked at again.
 *
 * A minute, which is the grain of the only notification that is time-of-day
 * sensitive — the calendar block starting within the hour. Everything else
 * moves on the scale of a day, and every poll after the first writes nothing.
 */
const POLL_MS = 60_000;

/** The reader's local 'HH:MM'. What the server needs to say "starts at". */
function clock(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes(),
  ).padStart(2, '0')}`;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { username } = useAuth();
  /* Read so that flipping a switch in Settings takes effect at once rather
     than at the next poll: the server decides what is swept and what comes
     back from these, so the answer is different the moment they change. */
  const { prefs } = useSettings();

  const [items, setItems] = useState<Notification[]>([]);
  const [wantsPopups, setWantsPopups] = useState(false);
  const [loading, setLoading] = useState(false);
  /**
   * The ids currently on screen as pop-ups.
   *
   * Screen state, and it has to be its own list rather than a filter on
   * `shown_at`: the stamp is written the moment the pop-up is drawn, so a
   * derived list would take it off screen in the very next render — a toast
   * that appears and vanishes inside one frame, which is what it did.
   */
  const [onScreen, setOnScreen] = useState<string[]>([]);

  /* Which answer is the current one. Replies can arrive out of order — a poll
     and a reload triggered by a completion overlap constantly — and the one
     that matters is the newest, not the last to land. */
  const ticket = useRef(0);

  const read = useCallback(() => {
    if (!username) {
      setItems([]);
      setWantsPopups(false);
      return;
    }
    const mine = ++ticket.current;
    setLoading(true);
    void service.list(isoDate(), clock()).then((result) => {
      if (mine !== ticket.current) return;
      setLoading(false);
      if (!result.success) return;
      setItems(result.notifications);
      setWantsPopups(result.popups);
    });
  }, [username]);

  useEffect(() => {
    read();
    if (!username) return;
    const timer = window.setInterval(read, POLL_MS);
    window.addEventListener(STATS_CHANGED, read);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(STATS_CHANGED, read);
    };
  }, [read, username]);

  /* Every notification switch, as one string. The effect above cannot depend
     on `prefs` itself — it is a fresh object on every settings read — and
     these eight booleans are the whole of what the server's answer depends
     on. */
  const switches = [
    prefs.notifications_enabled,
    prefs.notify_popups,
    prefs.notify_tasks,
    prefs.notify_calendar,
    prefs.notify_analytics,
    prefs.notify_goals,
    prefs.notify_streak,
    prefs.notify_progress,
  ].join();

  useEffect(() => {
    read();
  }, [read, switches]);

  /*
   * Raise the ones that have never been on screen, and stamp them.
   *
   * The stamp goes up whether or not a pop-up is drawn. An account with the
   * on-screen half turned off has still had its chance to be told, and
   * stamping anyway is what stops turning the switch back on from replaying
   * every notification of the last two weeks at once.
   *
   * `stamped` is a ref rather than state because it guards an effect that
   * depends on the thing it would set: two polls landing while the first mark
   * is still in flight must not both raise the same pop-up, and under
   * StrictMode the effect runs twice on mount by design.
   */
  const stamped = useRef<Set<string>>(new Set());
  useEffect(() => {
    const fresh = items.filter(
      (item) => !item.shown_at && !stamped.current.has(item.id),
    );
    if (!fresh.length) return;

    const ids = fresh.map((item) => item.id);
    ids.forEach((id) => stamped.current.add(id));
    if (wantsPopups) setOnScreen((current) => [...current, ...ids]);

    const at = new Date().toISOString();
    void service.mark(ids).then(() => {
      setItems((current) =>
        current.map((item) =>
          ids.includes(item.id) ? { ...item, shown_at: at } : item,
        ),
      );
    });
  }, [items, wantsPopups]);

  /**
   * What to draw: the notifications whose ids are on screen, in the order the
   * list has them. Derived from `items` rather than kept as its own copy of
   * the rows, so deleting a notification takes its pop-up with it.
   */
  const popups = useMemo(
    () => (wantsPopups ? items.filter((item) => onScreen.includes(item.id)) : []),
    [items, wantsPopups, onScreen],
  );

  const unread = useMemo(
    () => items.filter((item) => !item.read_at).length,
    [items],
  );

  const markRead = useCallback(() => {
    const unstamped = items.filter((item) => !item.read_at).map((item) => item.id);
    if (!unstamped.length) return;
    const at = new Date().toISOString();
    setItems((current) =>
      current.map((item) => (item.read_at ? item : { ...item, read_at: at })),
    );
    void service.mark([], true);
  }, [items]);

  const dismissPopup = useCallback((id: string) => {
    setOnScreen((current) => current.filter((other) => other !== id));
  }, []);

  const remove = useCallback(async (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    await service.remove(id);
  }, []);

  const clear = useCallback(async () => {
    setItems([]);
    await service.clear();
  }, []);

  const value = useMemo(
    () => ({
      items,
      unread,
      popups,
      loading,
      reload: read,
      markRead,
      dismissPopup,
      remove,
      clear,
    }),
    [items, unread, popups, loading, read, markRead, dismissPopup, remove, clear],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

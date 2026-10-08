/**
 * The bell's list: what the app has to say, and the two ways to be rid of it.
 *
 * Backend: backend/api/notifications.py, and backend/tracking/notify.py for
 * the rules that decide a notification exists at all.
 *
 * ## Reading is what writes them
 *
 * There is no job runner behind this app, so `list` is not a passive read: the
 * server sweeps the account's record and writes down what is true before it
 * answers. That is why the reader's own day and clock go up with the request —
 * stored stamps carry no timezone, so the server cannot work out what "today"
 * or "in the next hour" means without being told.
 *
 * Polling from several tabs is safe. The sweep inserts on a fingerprint that
 * names the situation rather than the moment, so two tabs asking together
 * produce one notification.
 *
 * ## Deleting sticks
 *
 * `remove` and `clear` are not "hide until the next poll". The server keeps a
 * tombstone under the deleted fingerprint, so the situation that produced the
 * notification cannot produce it a second time — the bell goes quiet and stays
 * quiet until something genuinely new turns up. That is the whole point of the
 * ✕ and the Clear all button, and it is the one thing a derived bell could
 * never do.
 */
import { del, post } from './api';
import type { ApiResult } from '@/types';

/**
 * Which switch in Settings governs a notification.
 *
 * The same six as `CHANNELS` in backend/tracking/notify.py. Written out rather
 * than derived, so a channel added on one side and not the other fails to
 * compile here the moment anything switches on it.
 */
export type NotificationChannel =
  | 'tasks'
  | 'calendar'
  | 'analytics'
  | 'goals'
  | 'streak'
  | 'progress';

/** How it is painted. Four, because three of them are not problems. */
export type NotificationTone = 'urgent' | 'warn' | 'info' | 'good';

export interface Notification {
  id: string;
  /** The situation it describes, not the moment. See the backend module. */
  fingerprint: string;
  channel: NotificationChannel;
  tone: NotificationTone;
  title: string;
  body: string;
  /** An in-app path. Every notification goes somewhere it can be acted on. */
  link: string;
  created_at: string;
  /**
   * When it appeared on screen, or absent if it never has.
   *
   * This is what makes a toast appear once rather than on every page load, and
   * it is stamped by the client because the client is the only one that knows
   * whether it actually drew the thing.
   */
  shown_at?: string;
  /** When the bell was last opened on it. Absent means it is still new. */
  read_at?: string;
}

export interface NotificationList {
  notifications: Notification[];
  /** Whether the account still wants the on-screen half of this. */
  popups: boolean;
  /** The master switch. False means the server swept nothing. */
  enabled: boolean;
}

/**
 * @param day The reader's local ISO day.
 * @param at  The reader's local 'HH:MM'. Without it the server cannot say
 *            what is starting in the next hour, so the calendar's soonest
 *            block is simply not raised.
 */
export function list(day: string, at: string): Promise<ApiResult<NotificationList>> {
  // A POST, because asking is also the sweep: it files whatever has become
  // true since the last one (backend/api/notifications.py). No GET writes.
  return post<NotificationList>('/api/notifications', {}, { day, at });
}

/** Stamp the ones that have been on screen, and optionally the lot as read. */
export function mark(
  shown: string[],
  read = false,
): Promise<ApiResult<{ shown: number; read: number }>> {
  return post<{ shown: number; read: number }>('/api/notifications/mark', {
    shown,
    read,
  });
}

export function remove(id: string): Promise<ApiResult<{ removed: number }>> {
  return del<{ removed: number }>(`/api/notifications/${encodeURIComponent(id)}`);
}

export function clear(): Promise<ApiResult<{ removed: number }>> {
  return del<{ removed: number }>('/api/notifications');
}

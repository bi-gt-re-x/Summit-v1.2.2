/**
 * Focus time — how long the user actually sat down and worked.
 *
 * The timer itself runs client-side; what the server keeps is each day's
 * total, so the calendar's Weekly Focus Time panel, the growth chart and
 * focus-type goals all read one number that survives a cleared browser.
 *
 * `syncDay` never lowers a day's recorded total — the backend takes the larger
 * of what it has and what it is sent. That is deliberate: an old tab whose
 * localStorage was cleared would otherwise report a smaller number and erase
 * real work. So calling it too often is harmless, and calling it with a stale
 * value is harmless too.
 *
 * Also here: the one-line note attached to a calendar day, which the Week, Day
 * and Month views all show — an edit in one view lands everywhere; and the
 * sittings, one row per focus sitting with the task it was for, which
 * hooks/useIntervals keeps in step with the browser's own copy.
 *
 * Backend: backend/api/focus.py, backend/api/calendar.py.
 */
import { get, post } from './api';
import {
  MAX_FOCUS_SECONDS,
  MAX_GOAL_HOURS,
  MAX_LOG_MINUTES,
  MIN_GOAL_HOURS,
} from './constants';
import type { ApiResult, DayFocusNotes, FocusDay, FocusHistory } from '@/types';
import type { Interval } from '@/components/Timer/intervals';

/**
 * Mirror one day's focus total to the server.
 *
 * Values are clamped here as well as on the backend, so an obviously wrong
 * number is corrected before it makes a round trip rather than after.
 */
export function syncDay(
  date: string,
  focusedSeconds: number,
  goalHours: number,
): Promise<ApiResult<{ focus: FocusDay }>> {
  return post<{ focus: FocusDay }>('/api/focus_sync', {
    date,
    focused_seconds: Math.max(0, Math.min(MAX_FOCUS_SECONDS, focusedSeconds)),
    goal_hours: Math.max(MIN_GOAL_HOURS, Math.min(MAX_GOAL_HOURS, goalHours)),
  });
}

/**
 * Add work that was done and never tracked to one past day.
 *
 * The other write is `syncDay`, which is the timer mirroring itself and takes
 * the larger of the two values. This one **adds**, because it is a person
 * saying what they did rather than a client saying what it holds — a day with
 * twenty tracked minutes and two typed hours is two hours twenty. See
 * `log_day` in backend/tracking/focus.py.
 *
 * `goalHours` is only used on a day that has no record yet; a day that already
 * had a goal keeps it.
 */
export function logDay(
  date: string,
  minutes: number,
  goalHours: number,
): Promise<ApiResult<{ focus: FocusDay }>> {
  return post<{ focus: FocusDay }>('/api/focus_log', {
    date,
    minutes: Math.max(0, Math.min(MAX_LOG_MINUTES, minutes)),
    goal_hours: Math.max(MIN_GOAL_HOURS, Math.min(MAX_GOAL_HOURS, goalHours)),
  });
}

/**
 * Tracked focus for a date range, keyed by ISO date.
 *
 * Days with no record are simply absent — nothing was tracked and nothing was
 * planned — so read them with a fallback rather than expecting a full range.
 */
export function history(
  start?: string,
  end?: string,
): Promise<ApiResult<{ days: FocusHistory }>> {
  return get<{ days: FocusHistory }>('/api/focus_history', {
    start,
    end,
  });
}

// --------------------------------------------------------------------------
// The per-day focus note
// --------------------------------------------------------------------------
export function dayNotes(
): Promise<ApiResult<{ day_focus: DayFocusNotes }>> {
  return get<{ day_focus: DayFocusNotes }>('/api/day_focus');
}

/** Upsert one day's note. Empty text deletes it. Truncated to 200 chars. */
export function setDayNote(
  date: string,
  text: string,
): Promise<ApiResult<{ date: string; text: string }>> {
  return post<{ date: string; text: string }>('/api/day_focus', {
    date,
    text: text.trim().slice(0, 200),
  });
}

// --------------------------------------------------------------------------
// The sittings
// --------------------------------------------------------------------------
/** The account's newest sittings, oldest first, in the browser's own shape. */
export function sittings(): Promise<ApiResult<{ sittings: Interval[] }>> {
  return get<{ sittings: Interval[] }>('/api/focus/sittings');
}

/**
 * Send sittings the server may not have.
 *
 * Safe to repeat: rows are keyed by the id the browser gave them, so a retry
 * adds nothing twice. A row the server holds is left alone except for its
 * answer (`done`/`met`), which can arrive later than the row.
 */
export function saveSittings(rows: Interval[]): Promise<ApiResult<{ added: number }>> {
  return post<{ added: number }>('/api/focus/sittings', { sittings: rows });
}

/** What came of one sitting's intention. */
export function amendSitting(
  id: string,
  answer: { done?: number; met?: boolean },
): Promise<ApiResult<{ id: string }>> {
  return post<{ id: string }>('/api/focus/sittings/amend', { id, ...answer });
}

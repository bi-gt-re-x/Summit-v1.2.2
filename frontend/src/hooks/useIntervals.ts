/**
 * The interval log: where finished focus phases are kept.
 *
 * One row per focus phase, appended as it ends. What a row means and what can
 * be read off a pile of them is in components/Timer/intervals.ts; this is only
 * the storage, and it is the same shape hooks/usePomodoro already uses for the
 * cycle — `localStorage`, keyed per account, every access wrapped because a
 * private window throws on the way in as well as on the way out.
 *
 * ## Per browser, and said so out loud
 *
 * There is no endpoint for this. The server keeps day totals (services/focus.ts)
 * and knows nothing about where one sitting ended and the next began, so an
 * account that works on a laptop and a phone has two partial records of its own
 * shape and one complete record of its hours. That is a real limitation: it is
 * why the page labels what it reads off this as a local reading, and why losing
 * the log loses no work.
 *
 * ## Why it is capped
 *
 * `MAX_KEPT` rows, oldest dropped. A recommendation that averaged over a year
 * would be slowest to move exactly when it most needs to — somebody whose
 * concentration has grown since March wants the last month to count for more
 * than March does, and the cheapest honest way to say that is to stop
 * remembering March.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Interval } from '@/components/Timer/intervals';

/** Rows kept per account. About two months of ordinary use. */
const MAX_KEPT = 120;

function key(user: string): string {
  return `pomodoro:intervals:${user}`;
}

function load(user: string): Interval[] {
  try {
    const raw = window.localStorage.getItem(key(user));
    if (!raw) return [];
    const saved = JSON.parse(raw) as unknown;
    if (!Array.isArray(saved)) return [];
    // Filtered rather than trusted: rows written by an older build may be a
    // different shape, and one bad row must not take the log with it.
    return saved.filter(isInterval).slice(-MAX_KEPT);
  } catch {
    return [];
  }
}

function isInterval(row: unknown): row is Interval {
  if (!row || typeof row !== 'object') return false;
  const it = row as Partial<Interval>;
  return typeof it.day === 'string'
    && typeof it.styleId === 'string'
    && typeof it.planned === 'number'
    && typeof it.minutes === 'number'
    && typeof it.pauses === 'number'
    && typeof it.finished === 'boolean';
}

export interface UseIntervals {
  /** Oldest first. */
  intervals: Interval[];
  /** Append one finished interval. */
  record: (interval: Interval) => void;
}

export function useIntervals(username: string | null): UseIntervals {
  const user = username || 'Default';
  const [intervals, setIntervals] = useState<Interval[]>(() => load(user));
  const latest = useRef(intervals);
  latest.current = intervals;

  // Re-read when the account changes, or this shows the last one's sittings.
  useEffect(() => {
    const read = load(user);
    latest.current = read;
    setIntervals(read);
  }, [user]);

  const record = useCallback((interval: Interval) => {
    const next = [...latest.current, interval].slice(-MAX_KEPT);
    latest.current = next;
    setIntervals(next);
    try {
      window.localStorage.setItem(key(user), JSON.stringify(next));
    } catch {
      // The log is a convenience: the hours are banked by the focus session,
      // and this visit's readings still work from state.
    }
  }, [user]);

  return { intervals, record };
}

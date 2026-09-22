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
  const required = typeof it.day === 'string'
    && typeof it.styleId === 'string'
    && typeof it.planned === 'number'
    && typeof it.minutes === 'number'
    && typeof it.pauses === 'number'
    && typeof it.finished === 'boolean';
  // The optional fields are checked when they are there rather than waved
  // through: a `target` that came back as a string would reach the arithmetic
  // and print NaN on the page, which is a worse outcome than losing one row
  // that only a hand-edited store could produce.
  const optional = maybe(it.at, 'number')
    && maybe(it.intent, 'string')
    && maybe(it.target, 'number')
    && maybe(it.done, 'number')
    && maybe(it.met, 'boolean');
  return required && optional;
}

function maybe(value: unknown, type: 'number' | 'string' | 'boolean'): boolean {
  return value === undefined || typeof value === type;
}

export interface UseIntervals {
  /** Oldest first. */
  intervals: Interval[];
  /** Append one finished interval. */
  record: (interval: Interval) => void;
  /**
   * Fill in what came of the newest row's intention.
   *
   * Separate from `record` because the two happen at different moments: the
   * row is written the instant the clock runs out, and the result can only be
   * given afterwards by somebody who was there. A row is only ever amended
   * once, by the strip that asked — see `unanswered` in
   * components/Timer/intervals.ts, which is what stops the question coming
   * back.
   */
  amend: (patch: Pick<Interval, 'done' | 'met'>) => void;
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

  const write = useCallback((next: Interval[]) => {
    latest.current = next;
    setIntervals(next);
    try {
      window.localStorage.setItem(key(user), JSON.stringify(next));
    } catch {
      // The log is a convenience: the hours are banked by the focus session,
      // and this visit's readings still work from state.
    }
  }, [user]);

  const record = useCallback((interval: Interval) => {
    write([...latest.current, interval].slice(-MAX_KEPT));
  }, [write]);

  const amend = useCallback((patch: Pick<Interval, 'done' | 'met'>) => {
    const rows = latest.current;
    const last = rows[rows.length - 1];
    if (!last) return;
    write([...rows.slice(0, -1), { ...last, ...patch }]);
  }, [write]);

  return { intervals, record, amend };
}

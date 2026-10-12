/**
 * The interval log: where finished focus phases are kept.
 *
 * One row per focus phase, appended as it ends. What a row means and what can
 * be read off a pile of them is in components/Timer/intervals.ts; this is only
 * the storage.
 *
 * ## The account's record, with the browser's copy in front of it
 *
 * The rows live on the server (`/api/focus/sittings`, backend/api/focus.py),
 * so a second device or a cleared cache sees the same sittings, the same
 * per-task totals and the same recommendation. The browser keeps a copy in
 * localStorage, keyed per account, and draws from it first: the page should
 * not wait on a round trip to show the sitting that just ended, and a timer
 * run with no connection still has to write its row somewhere.
 *
 * The two are kept in step on every load, and the rule is a union, never a
 * replace. Every row carries an id made where it was written (`newId`), so the
 * merge is by id: rows only the browser holds are sent up, rows only the
 * server holds are added to the copy, and sending a row twice adds nothing.
 * That is what lets a row recorded offline reach the server on the next visit
 * without anything remembering it was pending, and what moves an old
 * browser-only log up the first time this runs.
 *
 * Rows written before ids existed are given one on load, made from the row
 * itself (`legacyId`) rather than at random. Two tabs opening the same old log
 * at once must agree on what each row is called, or the merge would see two
 * rows where there is one.
 *
 * Every server call is allowed to fail. The copy is what the page reads, so a
 * failed call costs nothing until the next load tries again.
 *
 * ## Why it is capped
 *
 * `MAX_KEPT` rows in the copy, oldest dropped, and the server hands back the
 * same number. A recommendation that averaged over a year would be slowest to
 * move exactly when it most needs to — somebody whose concentration has grown
 * since March wants the last month to count for more than March does, and the
 * cheapest honest way to say that is to stop reading March. The server keeps
 * every row; only the reading is capped.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Interval } from '@/components/Timer/intervals';
import { focus as focusService } from '@/services';

/** Rows kept per account. About two months of ordinary use. */
const MAX_KEPT = 120;

function key(user: string): string {
  return `pomodoro:intervals:${user}`;
}

/** An id for a new row: the time, and enough randomness that two tabs cannot meet. */
export function newId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${random}`;
}

/**
 * An id for a row written before ids existed, made from the row itself.
 *
 * Deterministic, so every tab names the same old row the same way. Two old
 * rows identical in every one of these fields are the same sitting as far as
 * anything here can tell, and are merged.
 */
function legacyId(row: Interval): string {
  return ['l', row.day, row.at ?? 'x', row.styleId, row.minutes, row.pauses].join('-')
    .replace(/[^A-Za-z0-9_.:-]/g, '');
}

function withId(row: Interval): Interval {
  return row.id ? row : { ...row, id: legacyId(row) };
}

/** Oldest first. A row with no end time is from before one was kept, so it goes first. */
function byTime(a: Interval, b: Interval): number {
  return (a.at ?? 0) - (b.at ?? 0);
}

function load(user: string): Interval[] {
  try {
    const raw = window.localStorage.getItem(key(user));
    if (!raw) return [];
    const saved = JSON.parse(raw) as unknown;
    if (!Array.isArray(saved)) return [];
    // Filtered rather than trusted: rows written by an older build may be a
    // different shape, and one bad row must not take the log with it.
    return saved.filter(isInterval).map(withId).slice(-MAX_KEPT);
  } catch {
    return [];
  }
}

function store(user: string, rows: Interval[]): void {
  try {
    window.localStorage.setItem(key(user), JSON.stringify(rows));
  } catch {
    // The copy is a convenience: the server has the rows, and this visit's
    // readings still work from state.
  }
}

export function isInterval(row: unknown): row is Interval {
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
  const optional = maybe(it.id, 'string')
    && maybe(it.at, 'number')
    && maybe(it.intent, 'string')
    && maybe(it.target, 'number')
    && maybe(it.done, 'number')
    && maybe(it.met, 'boolean')
    && maybe(it.readiness, 'string')
    && maybe(it.kind, 'string')
    && maybe(it.taskId, 'string')
    && maybe(it.taskTitle, 'string')
    && (it.breaks === undefined
      || (Array.isArray(it.breaks) && it.breaks.every((at) => typeof at === 'number')));
  return required && optional;
}

function maybe(value: unknown, type: 'number' | 'string' | 'boolean'): boolean {
  return value === undefined || typeof value === type;
}

/** Whether `local` holds an answer the server's copy of the same row lacks. */
function answeredHere(local: Interval, held: Interval): boolean {
  return (local.done !== undefined && held.done === undefined)
    || (local.met !== undefined && held.met === undefined);
}

/**
 * The browser's rows and the server's, as one log.
 *
 * Returns the merged rows and the ones the server needs to be sent: rows it
 * does not have, and rows whose answer was given here and has not reached it.
 */
export function merge(local: Interval[], server: Interval[]): { rows: Interval[]; send: Interval[] } {
  const held = new Map(server.map((row) => [row.id, row]));
  const send = local.filter((row) => {
    const there = held.get(row.id);
    return !there || answeredHere(row, there);
  });
  const byId = new Map<string | undefined, Interval>();
  for (const row of server) byId.set(row.id, row);
  // The browser's copy of a row wins over the server's only for the answer:
  // everything else about a sitting is fixed the moment it ends.
  for (const row of local) {
    const there = byId.get(row.id);
    byId.set(row.id, there ? { ...there, ...pick(row) } : row);
  }
  return { rows: [...byId.values()].sort(byTime).slice(-MAX_KEPT), send };
}

function pick(row: Interval): Partial<Interval> {
  return {
    ...(row.done !== undefined ? { done: row.done } : {}),
    ...(row.met !== undefined ? { met: row.met } : {}),
  };
}

export interface UseIntervals {
  /** Oldest first. */
  intervals: Interval[];
  /** Append one finished interval. Given an id here if it has none. */
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

  const write = useCallback((next: Interval[]) => {
    latest.current = next;
    setIntervals(next);
    store(user, next);
  }, [user]);

  // Re-read when the account changes, then bring the copy and the server into
  // step. Only for a signed-in account: 'Default' has no server record.
  useEffect(() => {
    const read = load(user);
    latest.current = read;
    setIntervals(read);
    if (!username) return undefined;

    let live = true;
    void (async () => {
      try {
        const result = await focusService.sittings();
        if (!live || !result.success) return;
        const server = result.sittings.filter(isInterval).map(withId);
        // Against the copy as it is now, not as it was read above: a sitting
        // may have ended while the request was out.
        const { rows, send } = merge(latest.current, server);
        write(rows);
        if (send.length) await focusService.saveSittings(send);
      } catch {
        // Offline, or signed out mid-request. The copy stands; the next load
        // tries again, and nothing it holds is lost by waiting.
      }
    })();
    return () => { live = false; };
  }, [user, username, write]);

  const record = useCallback((interval: Interval) => {
    const row = interval.id ? interval : { ...interval, id: newId() };
    write([...latest.current, row].slice(-MAX_KEPT));
    if (username) void focusService.saveSittings([row]).catch(() => {});
  }, [username, write]);

  const amend = useCallback((patch: Pick<Interval, 'done' | 'met'>) => {
    const rows = latest.current;
    const last = rows[rows.length - 1];
    if (!last) return;
    write([...rows.slice(0, -1), { ...last, ...patch }]);
    if (username && last.id) void focusService.amendSitting(last.id, patch).catch(() => {});
  }, [username, write]);

  return { intervals, record, amend };
}

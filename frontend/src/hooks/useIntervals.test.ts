/**
 * The interval log, kept in step with the server.
 *
 * The merge is a union by id and never a replace: rows only the browser holds
 * go up, rows only the server holds come down, and a row sent twice is one
 * row. Old rows with no id are named from their own contents so two tabs agree
 * on them. And every server call may fail without the copy losing anything.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interval } from '@/components/Timer/intervals';

const sittings = vi.fn();
const saveSittings = vi.fn();
const amendSitting = vi.fn();

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    focus: {
      ...(real.focus as object),
      sittings: () => sittings(),
      saveSittings: (rows: Interval[]) => saveSittings(rows),
      amendSitting: (id: string, answer: object) => amendSitting(id, answer),
    },
  };
});

import { merge, useIntervals } from './useIntervals';

function row(over: Partial<Interval> = {}): Interval {
  return {
    id: 'a', day: '2026-10-12', styleId: 'classic', planned: 25, minutes: 25,
    pauses: 0, finished: true, at: 1000, ...over,
  };
}

const KEY = 'pomodoro:intervals:myles';
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? '[]') as Interval[];

beforeEach(() => {
  localStorage.clear();
  sittings.mockResolvedValue({ success: true, sittings: [] });
  saveSittings.mockResolvedValue({ success: true, added: 0 });
  amendSitting.mockResolvedValue({ success: true });
});

describe('merge', () => {
  it('keeps both sides and sends up only what the server lacks', () => {
    const { rows, send } = merge([row({ id: 'a', at: 1 }), row({ id: 'b', at: 3 })], [row({ id: 'c', at: 2 }), row({ id: 'a', at: 1 })]);
    expect(rows.map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(send.map((r) => r.id)).toEqual(['b']);
  });

  it('sends a row again when its answer was given here', () => {
    const { rows, send } = merge([row({ intent: 'x', done: 4 })], [row({ intent: 'x' })]);
    expect(send).toHaveLength(1);
    expect(rows[0]!.done).toBe(4);
  });

  it('does not let the browser rewrite anything but the answer', () => {
    const { rows } = merge([row({ minutes: 3 })], [row({ minutes: 25 })]);
    expect(rows[0]!.minutes).toBe(25);
  });
});

describe('useIntervals', () => {
  it('moves an old browser-only log up, naming each row the same way every time', async () => {
    localStorage.setItem(KEY, JSON.stringify([{ ...row(), id: undefined }]));
    renderHook(() => useIntervals('myles'));
    await waitFor(() => expect(saveSittings).toHaveBeenCalledTimes(1));
    const sent = saveSittings.mock.calls[0]![0] as Interval[];
    expect(sent[0]!.id).toBe('l-2026-10-12-1000-classic-25-0');
  });

  it("adds the server's rows to the copy, so a second device sees them", async () => {
    sittings.mockResolvedValue({ success: true, sittings: [row({ id: 'elsewhere', taskTitle: 'Revise integrals' })] });
    const { result } = renderHook(() => useIntervals('myles'));
    await waitFor(() => expect(result.current.intervals).toHaveLength(1));
    expect(stored()[0]!.taskTitle).toBe('Revise integrals');
    expect(saveSittings).not.toHaveBeenCalled();
  });

  it('records a row with an id and sends it straight up', async () => {
    const { result } = renderHook(() => useIntervals('myles'));
    await waitFor(() => expect(sittings).toHaveBeenCalled());
    act(() => result.current.record({ ...row(), id: undefined }));
    expect(result.current.intervals[0]!.id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    expect(saveSittings).toHaveBeenCalledWith([result.current.intervals[0]]);
  });

  it('keeps the copy when the server cannot be reached', async () => {
    localStorage.setItem(KEY, JSON.stringify([row()]));
    sittings.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useIntervals('myles'));
    await waitFor(() => expect(sittings).toHaveBeenCalled());
    expect(result.current.intervals).toHaveLength(1);
    // And a row recorded while offline is still written down here.
    saveSittings.mockRejectedValue(new Error('offline'));
    act(() => result.current.record(row({ id: 'b', at: 2000 })));
    expect(stored()).toHaveLength(2);
  });

  it('sends an answer to the row it belongs to', async () => {
    localStorage.setItem(KEY, JSON.stringify([row({ id: 's-9', intent: 'x', target: 5 })]));
    const { result } = renderHook(() => useIntervals('myles'));
    await waitFor(() => expect(sittings).toHaveBeenCalled());
    act(() => result.current.amend({ done: 5 }));
    expect(amendSitting).toHaveBeenCalledWith('s-9', { done: 5 });
  });
});

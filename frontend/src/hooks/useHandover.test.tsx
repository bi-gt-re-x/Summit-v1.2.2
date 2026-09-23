/**
 * The lag that lets a view leave.
 *
 * Three claims, and the third is the one that would otherwise be found by a
 * reader rather than by a test: a swap reversed before it lands leaves no
 * trace. Somebody who pauses a sitting and starts again inside the fade is
 * doing exactly that, and the wrong implementation — a queue, or state set on
 * the way out — puts them through an unmount and a fresh entrance for a screen
 * that never actually left.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHandover } from '@/hooks/useHandover';

const MS = 260;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('handing the screen over', () => {
  it('keeps the old side up for the length of its exit', () => {
    const { result, rerender } = renderHook(
      ({ on }) => useHandover(on, MS),
      { initialProps: { on: false } },
    );
    expect(result.current).toEqual({ shown: false, leaving: false });

    rerender({ on: true });
    // Still the old side, and it now knows it is going.
    expect(result.current).toEqual({ shown: false, leaving: true });

    act(() => void vi.advanceTimersByTime(MS));
    expect(result.current).toEqual({ shown: true, leaving: false });
  });

  it('does the same thing on the way back', () => {
    const { result, rerender } = renderHook(
      ({ on }) => useHandover(on, MS),
      { initialProps: { on: true } },
    );

    rerender({ on: false });
    expect(result.current).toEqual({ shown: true, leaving: true });

    act(() => void vi.advanceTimersByTime(MS));
    expect(result.current).toEqual({ shown: false, leaving: false });
  });

  it('forgets a swap that is reversed before it lands', () => {
    const { result, rerender } = renderHook(
      ({ on }) => useHandover(on, MS),
      { initialProps: { on: true } },
    );

    rerender({ on: false });
    act(() => void vi.advanceTimersByTime(MS / 2));
    expect(result.current.leaving).toBe(true);

    rerender({ on: true });
    // Back where it started, with nothing pending: the side that was leaving
    // simply stopped leaving.
    expect(result.current).toEqual({ shown: true, leaving: false });

    act(() => void vi.advanceTimersByTime(MS * 4));
    expect(result.current).toEqual({ shown: true, leaving: false });
  });
});

describe('with no time to spend', () => {
  it('passes straight through', () => {
    const { result, rerender } = renderHook(
      ({ on }) => useHandover(on, 0),
      { initialProps: { on: false } },
    );

    rerender({ on: true });
    // No pending timer to advance: `leaving` is never observed, which is what
    // a reader who has asked for less motion should get.
    expect(result.current).toEqual({ shown: true, leaving: false });

    rerender({ on: false });
    expect(result.current).toEqual({ shown: false, leaving: false });
  });
});

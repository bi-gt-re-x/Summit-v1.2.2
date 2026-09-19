/**
 * Step thirteen of the goal matcher work: many changes, one refresh.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_WAIT_MS,
  QUIET_MS,
  STATS_CHANGED,
  TASKS_WRITTEN,
  announceStatsChanged,
  flushStatsChanged,
} from './statsBus';

const refreshed = vi.fn();
const dropped = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  refreshed.mockReset();
  dropped.mockReset();
  window.addEventListener(STATS_CHANGED, refreshed);
  window.addEventListener(TASKS_WRITTEN, dropped);
});

afterEach(() => {
  flushStatsChanged();
  window.removeEventListener(STATS_CHANGED, refreshed);
  window.removeEventListener(TASKS_WRITTEN, dropped);
  vi.useRealTimers();
});

describe('announceStatsChanged', () => {
  it('turns sixty changes in a row into one refresh', () => {
    for (let at = 0; at < 60; at += 1) {
      announceStatsChanged();
      vi.advanceTimersByTime(5);
    }
    expect(refreshed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(QUIET_MS);
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('drops cached copies at once, every time, so nothing reads the old record', () => {
    announceStatsChanged();
    announceStatsChanged();
    expect(dropped).toHaveBeenCalledTimes(2);
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('refreshes a single change after a short quiet', () => {
    announceStatsChanged();
    vi.advanceTimersByTime(QUIET_MS - 1);
    expect(refreshed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('still refreshes during a steady stream, no later than the cap after the first', () => {
    for (let elapsed = 0; elapsed < MAX_WAIT_MS * 2; elapsed += QUIET_MS / 2) {
      announceStatsChanged();
      vi.advanceTimersByTime(QUIET_MS / 2);
    }
    expect(refreshed.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(refreshed.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('separate bursts are separate refreshes', () => {
    announceStatsChanged();
    vi.advanceTimersByTime(QUIET_MS);
    announceStatsChanged();
    vi.advanceTimersByTime(QUIET_MS);
    expect(refreshed).toHaveBeenCalledTimes(2);
  });

  it('can be delivered early, and then is not delivered twice', () => {
    announceStatsChanged();
    flushStatsChanged();
    expect(refreshed).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(QUIET_MS * 2);
    expect(refreshed).toHaveBeenCalledTimes(1);
  });
});

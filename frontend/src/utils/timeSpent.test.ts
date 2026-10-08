/**
 * How long a task took — utils/timeSpent. `completion_seconds` is how long a
 * task sat on the list, not time spent; these pin what is read instead.
 * Mirrors tests/test_time_spent.py.
 */
import { describe, expect, it } from 'vitest';
import { blockSeconds, secondsSpent } from './timeSpent';

const PLACED = { show_on_calendar: true, created_at: '2026-10-06T09:00:00', due_date: '2026-10-06T10:30:00' };

describe('time spent', () => {
  it('is the calendar block when a task has one', () => {
    expect(secondsSpent({ ...PLACED, completion_seconds: 400_000 })).toBe(90 * 60);
  });

  it('is a short gap from writing to finishing', () => {
    expect(secondsSpent({ completion_seconds: 1_200 })).toBe(1_200);
  });

  it('is never a lead time', () => {
    expect(secondsSpent({ completion_seconds: 4 * 86_400 })).toBeNull();
    expect(secondsSpent({ completion_seconds: 7 * 3600 })).toBeNull();
  });

  it('falls back when a block is really a deadline', () => {
    const deadline = { show_on_calendar: 1, created_at: '2026-10-01T09:00:00', due_date: '2026-10-06T09:00:00' };
    expect(blockSeconds(deadline)).toBeNull();
    expect(secondsSpent({ ...deadline, completion_seconds: 1_800 })).toBe(1_800);
  });

  it('ignores the dates of a task not on the calendar', () => {
    expect(blockSeconds({ ...PLACED, show_on_calendar: false })).toBeNull();
  });

  it('is null when nothing was recorded', () => {
    expect(secondsSpent({})).toBeNull();
    expect(secondsSpent({ completion_seconds: 'n/a' })).toBeNull();
  });
});

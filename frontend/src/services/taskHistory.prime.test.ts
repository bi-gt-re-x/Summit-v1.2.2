/**
 * A task read started before the page knows who is signed in.
 *
 * The analytics page begins its requests as soon as its code loads (see
 * components/Analytics/earlyReads), before it has a username — so the first
 * `taskHistory(username)` has to adopt that read rather than start another,
 * or the early start buys nothing and the largest response in the app is
 * downloaded twice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const analyticsTasks = vi.fn();
vi.mock('./analytics', () => ({ analyticsTasks: () => analyticsTasks() }));

const { invalidate, primeTaskHistory, taskHistory } = await import('./taskHistory');

beforeEach(() => {
  invalidate();
  analyticsTasks.mockReset();
  analyticsTasks.mockResolvedValue({ success: true, tasks: [], goal_links: {} });
});

describe('priming the task read', () => {
  it('is adopted by the first caller, not fetched again', async () => {
    primeTaskHistory();
    const first = taskHistory('ada');
    await first;
    expect(analyticsTasks).toHaveBeenCalledTimes(1);
    expect(taskHistory('ada')).toBe(first);
  });

  it('does nothing when a read is already held', () => {
    void taskHistory('ada');
    primeTaskHistory();
    expect(analyticsTasks).toHaveBeenCalledTimes(1);
  });

  it('drops a failed early read so the next caller asks again', async () => {
    analyticsTasks.mockResolvedValueOnce({ success: false, message: 'nope' });
    primeTaskHistory();
    await taskHistory('ada');
    await taskHistory('ada');
    expect(analyticsTasks).toHaveBeenCalledTimes(2);
  });
});

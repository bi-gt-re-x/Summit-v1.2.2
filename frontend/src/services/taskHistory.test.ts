/**
 * The shared task-history request.
 *
 * This is a cache, which means every interesting case is a case where it
 * returns something it did not just fetch. Four of them:
 *
 *   two callers at once     one request, not two — the case that matters most,
 *                           because the analytics page and a subject page mount
 *                           closely enough that the first fetch is still in the
 *                           air when the second asks
 *   a second account        never the first one's tasks
 *   after a write           the record as it is now, not as it was
 *   after a failure         a fresh attempt, not the same rejection for ever
 *
 * The last one is the one worth writing down. Holding a rejected promise would
 * mean a single dropped connection leaves every analytics page in the session
 * broken until the reader happens to finish a task — a worse failure than the
 * one it came from, and one that looks like the app being broken rather than
 * the network being briefly bad.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const analyticsTasks = vi.fn();
vi.mock('./analytics', () => ({ analyticsTasks: () => analyticsTasks() }));

const { invalidate, taskHistory } = await import('./taskHistory');

const answer = (id: string) => ({ success: true as const, tasks: [{ id }] });

/** What came back, as the ids, so a test can say which fetch it got. */
function ids(result: unknown): string[] {
  return ((result as { tasks?: { id: string }[] }).tasks ?? []).map((task) => task.id);
}

beforeEach(() => {
  invalidate();
  analyticsTasks.mockReset();
});

describe('one request, however many callers', () => {
  it('does not fetch twice for the same account', async () => {
    analyticsTasks.mockResolvedValue(answer('once'));

    await taskHistory('alpha');
    await taskHistory('alpha');

    expect(analyticsTasks).toHaveBeenCalledTimes(1);
  });

  it('joins a fetch already in the air rather than starting another', async () => {
    // The real case: two pages mounting in sequence. Both must land on the
    // same request, which means the second caller has to be handed the
    // promise rather than the answer.
    let settle: (value: unknown) => void = () => {};
    analyticsTasks.mockReturnValue(new Promise((resolve) => { settle = resolve; }));

    const first = taskHistory('alpha');
    const second = taskHistory('alpha');
    settle(answer('shared'));

    expect(analyticsTasks).toHaveBeenCalledTimes(1);
    expect(ids(await first)).toEqual(['shared']);
    expect(ids(await second)).toEqual(['shared']);
  });
});

describe('what it will not serve', () => {
  it('never hands one account another account tasks', async () => {
    analyticsTasks.mockResolvedValueOnce(answer('alpha-task'));
    analyticsTasks.mockResolvedValueOnce(answer('beta-task'));

    expect(ids(await taskHistory('alpha'))).toEqual(['alpha-task']);
    expect(ids(await taskHistory('beta'))).toEqual(['beta-task']);
    expect(analyticsTasks).toHaveBeenCalledTimes(2);
  });

  it('forgets on a write, so the next read is current', async () => {
    analyticsTasks.mockResolvedValueOnce(answer('before'));
    analyticsTasks.mockResolvedValueOnce(answer('after'));

    expect(ids(await taskHistory('alpha'))).toEqual(['before']);
    invalidate();
    expect(ids(await taskHistory('alpha'))).toEqual(['after']);
  });

  it('forgets when the app says the numbers moved', async () => {
    // The only thing that invalidates in the running app, and the reason
    // there is no timer: `summit:stats-changed` is fired by every writer.
    analyticsTasks.mockResolvedValueOnce(answer('before'));
    analyticsTasks.mockResolvedValueOnce(answer('after'));

    await taskHistory('alpha');
    window.dispatchEvent(new Event('summit:stats-changed'));

    expect(ids(await taskHistory('alpha'))).toEqual(['after']);
  });

  it('forgets at once on a write, before the batched refresh is sent', async () => {
    // utils/statsBus holds "the numbers moved" back to one per burst. The
    // cache must not wait with it: a page opened in that gap would read the
    // record from before the write.
    const { announceStatsChanged, flushStatsChanged } = await import('@/utils/statsBus');
    analyticsTasks.mockResolvedValueOnce(answer('before'));
    analyticsTasks.mockResolvedValueOnce(answer('after'));

    await taskHistory('alpha');
    announceStatsChanged();

    expect(ids(await taskHistory('alpha'))).toEqual(['after']);
    flushStatsChanged();
  });
});

describe('when the fetch fails', () => {
  it('does not hold the failure', async () => {
    analyticsTasks.mockResolvedValueOnce({ success: false, message: 'Network request failed' });
    analyticsTasks.mockResolvedValueOnce(answer('recovered'));

    const failed = await taskHistory('alpha');
    expect((failed as { success: boolean }).success).toBe(false);

    // Without this, one bad moment breaks every analytics page in the session.
    expect(ids(await taskHistory('alpha'))).toEqual(['recovered']);
    expect(analyticsTasks).toHaveBeenCalledTimes(2);
  });
});

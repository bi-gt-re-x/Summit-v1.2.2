/**
 * A read with a time limit gives up and says so; one without waits as before.
 *
 * The dashboard is drawn from one read, `/api/get_user_data`. With no limit, a
 * server that took the connection and never answered left the page on
 * "Loading your dashboard" for good, with no error and nothing to press.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TIMED_OUT, get } from './api';

/** A fetch that never answers until its signal is aborted. */
function hang() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      }),
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a read with a time limit', () => {
  it('throws a plain message once the limit passes', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hang());
    const read = get('/api/get_user_data', undefined, { timeoutMs: 1000 });
    const settled = expect(read).rejects.toThrow(TIMED_OUT);
    await vi.advanceTimersByTimeAsync(1000);
    await settled;
  });

  it('answers normally when the server is in time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true, n: 1 }))),
    );
    await expect(get('/api/get_user_data', undefined, { timeoutMs: 1000 })).resolves.toEqual({
      success: true,
      n: 1,
    });
  });

  it('sends no abort signal when no limit is asked for', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    vi.stubGlobal('fetch', fetch);
    await get('/api/tasks');
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeUndefined();
  });
});

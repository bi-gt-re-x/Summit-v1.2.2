/**
 * The four promises `useApi` makes, tested as failures rather than as features.
 *
 * Its header lists what hand-written versions get wrong. Each one is a bug
 * that only shows up under a race or an unmount, so each is set up here with a
 * deferred promise the test resolves by hand — real timing, no fake clock, and
 * the out-of-order case is genuinely out of order rather than simulated.
 */
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useApi } from './useApi';
import { ApiError } from '@/types';
import type { ApiResult } from '@/types';

/** A promise the test resolves when it wants to, so responses can cross. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ok = <T,>(payload: T) => ({ success: true as const, ...payload });
const fail = (message: string) => ({ success: false as const, message });

describe('the first read', () => {
  it('is loading with nothing to show, then has data', async () => {
    const call = vi.fn(async () => ok({ value: 1 }));
    const { result } = renderHook(() => useApi(call));

    expect(result.current).toMatchObject({ loading: true, data: null, error: null });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toMatchObject({ value: 1 });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('turns a success:false envelope into `error`, not into data', async () => {
    // One error channel for the component, whichever half of the API failed.
    const { result } = renderHook(() => useApi(async () => fail('Sign in first.')));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Sign in first.');
    expect(result.current.data).toBeNull();
  });

  it('reports a thrown ApiError by its message', async () => {
    const { result } = renderHook(() =>
      useApi(async () => {
        throw new ApiError('The server is unreachable.', 0);
      }),
    );

    await waitFor(() => expect(result.current.error).toBe('The server is unreachable.'));
  });

  it('does not leak a non-Error rejection into the UI', async () => {
    const { result } = renderHook(() =>
      useApi(async () => {
        throw 'a string nobody should be shown'; // eslint-disable-line no-throw-literal
      }),
    );

    await waitFor(() => expect(result.current.error).toBe('Something went wrong.'));
  });
});

describe('a late response cannot overwrite a newer one', () => {
  it('drops the first answer when a second request has already been made', async () => {
    // The bug: change the date quickly and request 1 lands after request 2, so
    // the page shows the data for the date you left.
    const first = deferred<ApiResult<{ value: string }>>();
    const second = deferred<ApiResult<{ value: string }>>();
    const calls = [first.promise, second.promise];
    let index = 0;

    const { result, rerender } = renderHook(
      ({ key }: { key: number }) => useApi(() => calls[index++]!, [key]),
      { initialProps: { key: 1 } },
    );

    rerender({ key: 2 }); // a second request is now in flight

    // The stale one lands first, carrying the answer to the question nobody
    // is asking any more.
    await act(async () => {
      first.resolve(ok({ value: 'stale' }));
      await first.promise;
    });
    expect(result.current.data).toBeNull();

    await act(async () => {
      second.resolve(ok({ value: 'current' }));
      await second.promise;
    });
    expect(result.current.data).toMatchObject({ value: 'current' });
  });

  it('drops a stale rejection too, so a dead request cannot clear a live one', async () => {
    const first = deferred<ApiResult<{ value: string }>>();
    const second = deferred<ApiResult<{ value: string }>>();
    const calls = [first.promise, second.promise];
    let index = 0;

    const { result, rerender } = renderHook(
      ({ key }: { key: number }) => useApi(() => calls[index++]!, [key]),
      { initialProps: { key: 1 } },
    );
    rerender({ key: 2 });

    await act(async () => {
      second.resolve(ok({ value: 'current' }));
      await second.promise;
    });
    await act(async () => {
      first.reject(new ApiError('timed out'));
      await first.promise.catch(() => {});
    });

    expect(result.current.data).toMatchObject({ value: 'current' });
    expect(result.current.error).toBeNull();
  });
});

describe('unmounting mid-flight', () => {
  /*
   * The hook's `mounted` ref is deliberately NOT asserted here, and that is
   * worth saying out loud rather than leaving as a hole in the file.
   *
   * React 19 makes `setState` on an unmounted tree a silent no-op — the
   * warning it used to log was removed in 18 — so flipping the guard off
   * changes nothing an outside observer can see. A test claiming to cover it
   * would pass against both the guarded and the unguarded version, which is
   * worse than no test: it reads as protection and provides none. The guard
   * stays in the source as cheap insurance against a future runtime that is
   * less forgiving; what is testable is that a late answer, and a late
   * failure, are inert.
   */
  it('does not throw when the answer arrives after the component is gone', async () => {
    const late = deferred<ApiResult<{ value: number }>>();
    const { unmount } = renderHook(() => useApi(() => late.promise));
    unmount();

    await expect(
      act(async () => {
        late.resolve(ok({ value: 1 }));
        await late.promise;
      }),
    ).resolves.not.toThrow();
  });

  it('swallows a rejection that arrives after the component is gone', async () => {
    // An uncaught one here fails the run as an unhandled rejection, so this
    // is a real assertion even though it looks like an empty one.
    const late = deferred<ApiResult<{ value: number }>>();
    const { unmount } = renderHook(() => useApi(() => late.promise));
    unmount();

    await act(async () => {
      late.reject(new ApiError('too late'));
      await late.promise.catch(() => {});
    });
  });
});

describe('a re-read never blanks the page', () => {
  it('goes refreshing, not loading, when data is already on screen', async () => {
    const second = deferred<ApiResult<{ value: string }>>();
    let call = 0;
    const { result } = renderHook(() =>
      useApi(() => (call++ === 0 ? Promise.resolve(ok({ value: 'first' })) : second.promise)),
    );

    await waitFor(() => expect(result.current.data).toMatchObject({ value: 'first' }));

    act(() => result.current.reload());

    // The distinction the hook exists for: `loading` means "nothing to show",
    // so a page guarding on it does not throw itself away and come back as a
    // spinner every time something is re-read.
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(true);
    expect(result.current.data).toMatchObject({ value: 'first' });

    await act(async () => {
      second.resolve(ok({ value: 'second' }));
      await second.promise;
    });
    expect(result.current).toMatchObject({ refreshing: false, loading: false });
    expect(result.current.data).toMatchObject({ value: 'second' });
  });

  it('keeps the last good answer when a re-read fails', async () => {
    let call = 0;
    const { result } = renderHook(() =>
      useApi(async () => (call++ === 0 ? ok({ value: 'good' }) : fail('Server error.'))),
    );

    await waitFor(() => expect(result.current.data).toMatchObject({ value: 'good' }));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBe('Server error.'));

    // Losing the whole page because the second fetch timed out is worse than
    // showing what was there with the message beside it.
    expect(result.current.data).toMatchObject({ value: 'good' });
  });

  it('clears a previous error when a re-read succeeds', async () => {
    let call = 0;
    const { result } = renderHook(() =>
      useApi(async () => (call++ === 0 ? fail('Offline.') : ok({ value: 'back' }))),
    );

    await waitFor(() => expect(result.current.error).toBe('Offline.'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toMatchObject({ value: 'back' }));
    expect(result.current.error).toBeNull();
  });
});

describe('deps', () => {
  it('re-reads when they change and not when they do not', async () => {
    const call = vi.fn(async () => ok({ value: 1 }));
    const { rerender } = renderHook(({ id }: { id: string }) => useApi(call, [id]), {
      initialProps: { id: 'a' },
    });

    await waitFor(() => expect(call).toHaveBeenCalledTimes(1));

    rerender({ id: 'a' });
    expect(call).toHaveBeenCalledTimes(1);

    rerender({ id: 'b' });
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
  });

  it('does not re-read merely because the caller passed a new arrow', async () => {
    // Call sites pass an inline arrow far more often than a useCallback, which
    // is why `call` is deliberately not a dependency.
    const spy = vi.fn(async () => ok({ value: 1 }));
    const { rerender } = renderHook(() => useApi(() => spy(), []));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('mutate', () => {
  it('changes what is on screen without asking the server', async () => {
    const call = vi.fn(async () => ok({ count: 1 }));
    const { result } = renderHook(() => useApi(call));

    await waitFor(() => expect(result.current.data).toMatchObject({ count: 1 }));
    act(() => result.current.mutate((current) => ({ ...current, count: 2 })));

    expect(result.current.data).toMatchObject({ count: 2 });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('is ignored before the first read lands', async () => {
    // A write whose answer the read is about to carry. Applying it to `null`
    // would mean the update function receives one.
    const pending = deferred<ApiResult<{ count: number }>>();
    const { result } = renderHook(() => useApi(() => pending.promise));

    const update = vi.fn((current: { count: number }) => current);
    act(() => result.current.mutate(update));

    expect(update).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();

    await act(async () => {
      pending.resolve(ok({ count: 5 }));
      await pending.promise;
    });
    expect(result.current.data).toMatchObject({ count: 5 });
  });

  it('keeps a stable identity, so a memoized child is not re-rendered by it', async () => {
    const { result, rerender } = renderHook(() => useApi(async () => ok({ value: 1 })));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    const before = result.current.mutate;
    rerender();
    expect(result.current.mutate).toBe(before);
  });
});

describe('in a component', () => {
  it('shows a spinner, then the data, and never both', async () => {
    function Panel() {
      const { data, loading, error } = useApi(async () => ok({ title: 'Weekly report' }));
      if (loading) return <p>Loading…</p>;
      if (error) return <p role="alert">{error}</p>;
      return <h1>{(data as { title: string }).title}</h1>;
    }

    render(<Panel />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();

    expect(await screen.findByRole('heading')).toHaveTextContent('Weekly report');
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });
});

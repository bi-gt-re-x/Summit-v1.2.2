/**
 * One read of the account, shared by everyone who wants it — and only if
 * somebody does.
 *
 * The change this provider made is a performance one, so the tests are counts:
 * three consumers must produce one request, not three. That is not something a
 * rendered screen shows, so it is asserted directly on the service call — and
 * it is the whole reason the provider exists, so it is the first thing here.
 *
 * The second reason is correctness, and it has a visible symptom: completing a
 * task on the dashboard used to leave the top bar showing the XP from before,
 * because each caller held its own copy. Two consumers rendered side by side,
 * one calling `mutate`, is that bug written down. It matters more since the
 * stats moved into `StatsProvider`: the two halves now live in two states, and
 * the point of the split is that nobody can tell.
 *
 * The third is the demand gate. The task list is megabytes and most pages
 * never read one, so a provider that fetched on mount was charging every page
 * for the few that need it. "No consumer, no request" is asserted the same way
 * the others are — on the call count.
 */
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AuthContext } from './contexts';
import { StatsProvider } from './StatsProvider';
import { UserDataProvider } from './UserDataProvider';
import { useUserData } from '@/hooks/useUserData';
import { stats, task } from '@/test/factories';
import type { AuthValue } from './contexts';
import type { UserData } from '@/services/tasks';

// Mocked at the module boundary the provider actually imports, so the test
// exercises the real `useApi` underneath rather than a stand-in for it.
vi.mock('@/services', () => ({
  tasks: { getUserData: vi.fn(), getStats: vi.fn() },
}));

const { tasks: taskService } = await import('@/services');
const getUserData = vi.mocked(taskService.getUserData);
const getStats = vi.mocked(taskService.getStats);

const DATA: UserData = { stats: stats({ xp: 640 }), tasks: [task({ title: 'Revise' })] };

function auth(username: string | null): AuthValue {
  return {
    status: username ? 'signed-in' : 'signed-out',
    username,
    profileComplete: true,
    emailVerified: true,
    avatar: '/static/images/avatars/star.svg',
    signIn: async () => null,
    signOut: async () => {},
    refresh: async () => {},
  };
}

function wrapper(username: string | null = 'myles') {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthContext.Provider value={auth(username)}>
        <StatsProvider>
          <UserDataProvider>{children}</UserDataProvider>
        </StatsProvider>
      </AuthContext.Provider>
    );
  };
}

beforeEach(() => {
  getUserData.mockResolvedValue({ success: true, ...DATA });
  getStats.mockResolvedValue({ success: true, stats: DATA.stats });
});

describe('useUserData', () => {
  it('refuses to be read outside the provider', async () => {
    // Without this the failure is a null dereference several frames deep,
    // which is a much worse thing to debug than the message.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useUserData())).toThrow(
      /must be used inside <UserDataProvider>/,
    );
    errors.mockRestore();
  });

  it('hands back the account once it has landed', async () => {
    const { result } = renderHook(() => useUserData(), { wrapper: wrapper() });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toMatchObject(DATA);
    expect(result.current.username).toBe('myles');
  });
});

describe('one read for the whole app', () => {
  it('asks the server once however many consumers mount', async () => {
    // The bug: the dashboard, the top bar and the rail mount together, so
    // arriving at /dashboard asked for the app's largest response three times.
    function Consumer({ label }: { label: string }) {
      const { data } = useUserData();
      return <span>{`${label}:${data?.stats.xp ?? '…'}`}</span>;
    }

    render(
      <AuthContext.Provider value={auth('myles')}>
        <StatsProvider>
          <UserDataProvider>
          <Consumer label="dashboard" />
          <Consumer label="topbar" />
          <Consumer label="rail" />
        </UserDataProvider>
        </StatsProvider>
      </AuthContext.Provider>,
    );

    await screen.findByText('dashboard:640');
    expect(screen.getByText('topbar:640')).toBeInTheDocument();
    expect(screen.getByText('rail:640')).toBeInTheDocument();
    expect(getUserData).toHaveBeenCalledTimes(1);
  });

  it('re-reads once when the Refresh button asks, not once per consumer', async () => {
    const seen: Array<ReturnType<typeof useUserData>> = [];
    function Consumer() {
      const value = useUserData();
      seen.push(value);
      return null;
    }

    render(
      <AuthContext.Provider value={auth('myles')}>
        <StatsProvider>
          <UserDataProvider>
          <Consumer />
          <Consumer />
          <Consumer />
        </UserDataProvider>
        </StatsProvider>
      </AuthContext.Provider>,
    );

    await waitFor(() => expect(getUserData).toHaveBeenCalledTimes(1));
    await act(async () => {
      seen[seen.length - 1]!.reload();
    });
    expect(getUserData).toHaveBeenCalledTimes(2);
  });

  it('re-reads when the account changes', async () => {
    const { rerender } = render(
      <AuthContext.Provider value={auth('myles')}>
        <StatsProvider>
          <UserDataProvider>
          <Reader />
        </UserDataProvider>
        </StatsProvider>
      </AuthContext.Provider>,
    );
    await waitFor(() => expect(getUserData).toHaveBeenCalledTimes(1));

    rerender(
      <AuthContext.Provider value={auth('someone-else')}>
        <StatsProvider>
          <UserDataProvider>
          <Reader />
        </UserDataProvider>
        </StatsProvider>
      </AuthContext.Provider>,
    );
    await waitFor(() => expect(getUserData).toHaveBeenCalledTimes(2));
  });
});

function Reader() {
  useUserData();
  return null;
}

describe('mutate moves the whole app', () => {
  it('updates every consumer at once, with no second request', async () => {
    // What it looked like before: completing a task on the dashboard left the
    // top bar showing the XP from before until something re-fetched.
    function Dashboard() {
      const { data, mutate } = useUserData();
      return (
        <button
          onClick={() =>
            mutate((current) => ({
              ...current,
              stats: { ...current.stats, xp: current.stats.xp + 40 },
            }))
          }
        >
          {`complete (${data?.stats.xp ?? '…'})`}
        </button>
      );
    }
    function Topbar() {
      const { data } = useUserData();
      return <output>{data?.stats.xp ?? '…'}</output>;
    }

    render(
      <AuthContext.Provider value={auth('myles')}>
        <StatsProvider>
          <UserDataProvider>
          <Dashboard />
          <Topbar />
        </UserDataProvider>
        </StatsProvider>
      </AuthContext.Provider>,
    );

    await screen.findByText('complete (640)');
    expect(screen.getByRole('status')).toHaveTextContent('640');

    act(() => screen.getByRole('button').click());

    expect(screen.getByRole('button')).toHaveTextContent('complete (680)');
    expect(screen.getByRole('status')).toHaveTextContent('680');
    expect(getUserData).toHaveBeenCalledTimes(1);
  });
});

describe('the demand gate', () => {
  it('reads nothing until something asks for the task list', async () => {
    // The rail and the top bar mount on every page and want six integers.
    // Before the gate, mounting them fetched the account's entire task history
    // — for the largest account in this database, 2.9 MB of JSON per page.
    render(
      <AuthContext.Provider value={auth('myles')}>
        <StatsProvider>
          <UserDataProvider>
            <span>a page that shows no tasks</span>
          </UserDataProvider>
        </StatsProvider>
      </AuthContext.Provider>,
    );

    await waitFor(() => expect(getStats).toHaveBeenCalledTimes(1));
    expect(getUserData).not.toHaveBeenCalled();
  });

  it('reads once a consumer mounts, and stays read when it leaves', async () => {
    // The latch. Without it, navigating dashboard → analytics → dashboard
    // would drop the demand to zero and re-fetch megabytes coming back, which
    // is worse than the problem the gate solves.
    function Screen({ tasks: wantsTasks }: { tasks: boolean }) {
      return (
        <AuthContext.Provider value={auth('myles')}>
          <StatsProvider>
            <UserDataProvider>{wantsTasks ? <Reader /> : <span>no tasks here</span>}</UserDataProvider>
          </StatsProvider>
        </AuthContext.Provider>
      );
    }

    const { rerender } = render(<Screen tasks={false} />);
    await waitFor(() => expect(getStats).toHaveBeenCalledTimes(1));
    expect(getUserData).not.toHaveBeenCalled();

    rerender(<Screen tasks />);
    await waitFor(() => expect(getUserData).toHaveBeenCalledTimes(1));

    // The consumer leaves; nothing re-reads, and nothing is thrown away.
    rerender(<Screen tasks={false} />);
    rerender(<Screen tasks />);
    expect(getUserData).toHaveBeenCalledTimes(1);
  });
});

describe('signed out', () => {
  it('fetches nothing and says why', async () => {
    const { result } = renderHook(() => useUserData(), { wrapper: wrapper(null) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getUserData).not.toHaveBeenCalled();
    // The same success:false envelope the endpoint would have returned, so a
    // page says "sign in" rather than spinning forever.
    expect(result.current.error).toBe('Sign in to see your dashboard.');
    expect(result.current.data).toBeNull();
    expect(result.current.username).toBeNull();
  });
});

describe('the stats live in StatsProvider', () => {
  it('reads them from there rather than from its own response', async () => {
    // `/api/get_user_data` still answers with a stats block. It is dropped:
    // six integers are not worth a second source of truth, and two copies is
    // exactly the bug that put the old XP in the top bar.
    getStats.mockResolvedValue({ success: true, stats: stats({ xp: 999 }) });

    const { result } = renderHook(() => useUserData(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    // 999 from /api/stats, not the 640 that came back attached to the tasks.
    expect(result.current.data!.stats.xp).toBe(999);
    expect(result.current.data!.tasks).toHaveLength(1);
  });
});

describe('the context value', () => {
  it('is stable while nothing about it has changed', async () => {
    // The provider sits above the entire app. `useApi` returns a fresh object
    // every render, so an unmemoised value would re-render every consumer on
    // every render of anything above this.
    const seen: Array<ReturnType<typeof useUserData>> = [];
    function Consumer() {
      seen.push(useUserData());
      return null;
    }

    const { rerender } = render(
      <AuthContext.Provider value={auth('myles')}>
        <StatsProvider>
          <UserDataProvider>
          <Consumer />
        </UserDataProvider>
        </StatsProvider>
      </AuthContext.Provider>,
    );
    await waitFor(() => expect(seen[seen.length - 1]!.data).not.toBeNull());

    const settled = seen[seen.length - 1]!;
    rerender(
      <AuthContext.Provider value={auth('myles')}>
        <StatsProvider>
          <UserDataProvider>
          <Consumer />
        </UserDataProvider>
        </StatsProvider>
      </AuthContext.Provider>,
    );
    expect(seen[seen.length - 1]).toBe(settled);
  });

  it('keeps the shape every call site already destructures', async () => {
    const { result } = renderHook(() => useUserData(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(Object.keys(result.current).sort()).toEqual([
      'data',
      'error',
      'loading',
      'mutate',
      'refreshing',
      'reload',
      'username',
      'want',
    ]);
  });
});

describe('a change to the tasks anywhere', () => {
  /** A page that shows tasks, which can be left and come back to. */
  function Page() {
    const { data } = useUserData();
    return <span>{`tasks:${data?.tasks.length ?? '…'}`}</span>;
  }

  function App({ showing }: { showing: boolean }) {
    return (
      <AuthContext.Provider value={auth('myles')}>
        <StatsProvider>
          <UserDataProvider>{showing ? <Page /> : <span>elsewhere</span>}</UserDataProvider>
        </StatsProvider>
      </AuthContext.Provider>
    );
  }

  it('is read again when the next page that shows tasks opens', async () => {
    getUserData.mockClear();
    const view = render(<App showing />);
    await screen.findByText('tasks:1');
    expect(getUserData).toHaveBeenCalledTimes(1);

    // Off to another page, where something books a task: the server marks
    // the response and services/api announces it.
    view.rerender(<App showing={false} />);
    getUserData.mockResolvedValue({ success: true, ...DATA, tasks: [...DATA.tasks, task({ title: 'Booked' })] });
    act(() => {
      window.dispatchEvent(new Event('summit:tasks-written'));
    });

    view.rerender(<App showing />);
    await screen.findByText('tasks:2');
    expect(getUserData).toHaveBeenCalledTimes(2);
  });

  it('is not read again when nothing changed', async () => {
    getUserData.mockClear();
    const view = render(<App showing />);
    await screen.findByText('tasks:1');
    view.rerender(<App showing={false} />);
    view.rerender(<App showing />);
    await screen.findByText('tasks:1');
    expect(getUserData).toHaveBeenCalledTimes(1);
  });
});

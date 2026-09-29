/**
 * Rendering a component with the app's providers around it.
 *
 * Real context objects filled with plain values, rather than mocked hooks.
 * Mocking `useAuth` and friends would mean the test passes when the component
 * reads a context that is no longer there — the exact failure the providers
 * throw on. Filling the real ones keeps that check alive and keeps the shape
 * of `AuthValue` honest: change a field and this stops compiling, which is
 * where a type wants to be caught.
 *
 * The router is a MemoryRouter, so a test can start on any path and `NavLink`
 * resolves its active state the same way it does in the app.
 */
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import {
  AuthContext,
  NotificationsContext,
  SettingsContext,
  StatsContext,
  ThemeContext,
  UserDataContext,
} from '@/context/contexts';
import { DEFAULTS, DEFAULT_DAILY_GOAL } from '@/services/settings';
import { stats } from './factories';
import type {
  AuthValue,
  NotificationsValue,
  SettingsValue,
  StatsValue,
  ThemeValue,
  UserDataValue,
} from '@/context/contexts';
import type { Prefs } from '@/services/settings';
import type { UserData } from '@/services/tasks';

/**
 * `prefs` is loosened to a partial: there are thirty-one preferences and a
 * test that cares about one of them should not have to restate the other
 * thirty. Everything else stays `Partial<…>` of the real context value,
 * so a field renamed in `contexts.ts` still breaks this file.
 */
export interface Options {
  /** Where the router starts. */
  route?: string;
  auth?: Partial<AuthValue>;
  settings?: Partial<Omit<SettingsValue, 'prefs'>> & { prefs?: Partial<Prefs> };
  userData?: Partial<UserDataValue>;
  stats?: Partial<StatsValue>;
  /** Light or dark, for the handful of components that read it. */
  theme?: Partial<ThemeValue>;
  /** The bell. Empty unless a test puts something in it. */
  notifications?: Partial<NotificationsValue>;
}

export function authValue(overrides: Partial<AuthValue> = {}): AuthValue {
  return {
    status: 'signed-in',
    username: 'myles',
    profileComplete: true,
    emailVerified: true,
    avatar: '/static/images/avatars/star.svg',
    signIn: vi.fn(async () => null),
    signOut: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    ...overrides,
  };
}

export function settingsValue(overrides: Options['settings'] = {}): SettingsValue {
  // `prefs` is pulled out and merged over the defaults rather than spread with
  // the rest, so passing one preference leaves the other thirty at theirs.
  const { prefs, ...rest } = overrides;
  return {
    dailyGoal: DEFAULT_DAILY_GOAL,
    displayName: 'Myles',
    ready: true,
    update: vi.fn(async () => null),
    refresh: vi.fn(async () => {}),
    ...rest,
    prefs: { ...DEFAULTS, ...prefs },
  };
}

export function userDataValue(overrides: Partial<UserDataValue> = {}): UserDataValue {
  const data: UserData = { stats: stats(), tasks: [] };
  return {
    data,
    error: null,
    loading: false,
    refreshing: false,
    reload: vi.fn(),
    mutate: vi.fn(),
    username: 'myles',
    // The real provider does not fetch until this is called. A test renders
    // with the data already in place, so it is a spy — but it is here rather
    // than optional so that a component which stops calling `useUserData`
    // cannot go unnoticed.
    want: vi.fn(),
    ...overrides,
  };
}

export function statsValue(overrides: Partial<StatsValue> = {}): StatsValue {
  return {
    stats: stats(),
    error: null,
    loading: false,
    refreshing: false,
    reload: vi.fn(),
    mutate: vi.fn(),
    username: 'myles',
    ...overrides,
  };
}

export function themeValue(overrides: Partial<ThemeValue> = {}): ThemeValue {
  return {
    theme: 'light',
    setTheme: vi.fn(),
    toggle: vi.fn(),
    ...overrides,
  };
}

export function notificationsValue(
  overrides: Partial<NotificationsValue> = {},
): NotificationsValue {
  return {
    items: [],
    unread: 0,
    popups: [],
    loading: false,
    reload: vi.fn(),
    markRead: vi.fn(),
    dismissPopup: vi.fn(),
    remove: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    ...overrides,
  };
}

export function renderWithProviders(ui: ReactElement, options: Options = {}) {
  const {
    route = '/dashboard',
    auth,
    settings,
    userData,
    stats: statsOverrides,
    theme,
    notifications,
  } = options;

  function Providers({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <ThemeContext.Provider value={themeValue(theme)}>
          <AuthContext.Provider value={authValue(auth)}>
            <SettingsContext.Provider value={settingsValue(settings)}>
              <NotificationsContext.Provider value={notificationsValue(notifications)}>
                <StatsContext.Provider value={statsValue(statsOverrides)}>
                  <UserDataContext.Provider value={userDataValue(userData)}>
                    {children}
                  </UserDataContext.Provider>
                </StatsContext.Provider>
              </NotificationsContext.Provider>
            </SettingsContext.Provider>
          </AuthContext.Provider>
        </ThemeContext.Provider>
      </MemoryRouter>
    );
  }

  return render(ui, { wrapper: Providers });
}

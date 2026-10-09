/**
 * The device's light or dark is followed only when the account says
 * 'system' — and only once the account has said anything at all.
 *
 * `prefs` starts as the built-in defaults, whose `theme_mode` is 'system', and
 * following the device *saves* the theme. So for the moment before the
 * account's settings landed, every load followed the device and wrote that
 * back: an account that had picked dark, on a computer set to light, came
 * back light on each reload.
 */
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsProvider } from './SettingsProvider';
import { AuthContext, ThemeContext } from './contexts';
import { authValue } from '@/test/render';
import { setMatchMedia } from '@/test/media';
import { settings as service } from '@/services';

const DARK = '(prefers-color-scheme: dark)';

function mount(auth: Parameters<typeof authValue>[0], setTheme = vi.fn()) {
  const wrap = ({ children }: { children: ReactNode }) => (
    <ThemeContext.Provider value={{ theme: 'dark', setTheme, toggle: vi.fn() }}>
      <AuthContext.Provider value={authValue(auth)}>{children}</AuthContext.Provider>
    </ThemeContext.Provider>
  );
  render(<SettingsProvider>{null}</SettingsProvider>, { wrapper: wrap });
  return setTheme;
}

/** The account's settings, answered when `answer()` is called. */
function slowSettings(values: Record<string, unknown>) {
  let answer = () => {};
  vi.spyOn(service, 'getSettings').mockImplementation(
    () =>
      new Promise((resolve) => {
        answer = () => resolve({ success: true, settings: { name: '', daily_goal: 100, ...values } } as never);
      }),
  );
  return () => answer();
}

beforeEach(() => {
  setMatchMedia({ [DARK]: false }); // the computer is set to light
  document.cookie = 'theme=; max-age=0';
});

afterEach(() => {
  vi.restoreAllMocks();
  document.cookie = 'theme=; max-age=0';
});

describe('following the device', () => {
  it('does not touch an account that chose dark, before or after its settings land', async () => {
    const answer = slowSettings({ theme_mode: 'dark', theme_skin: '' });
    const setTheme = mount({ status: 'signed-in', username: 'myles' });
    expect(setTheme).not.toHaveBeenCalled();
    answer();
    await waitFor(() => expect(service.getSettings).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(setTheme).not.toHaveBeenCalled();
  });

  it('waits for the session check too', () => {
    slowSettings({ theme_mode: 'dark' });
    const setTheme = mount({ status: 'loading', username: null });
    expect(setTheme).not.toHaveBeenCalled();
  });

  it("follows it once the account's answer is 'system'", async () => {
    const answer = slowSettings({ theme_mode: 'system', theme_skin: '' });
    const setTheme = mount({ status: 'signed-in', username: 'myles' });
    answer();
    await waitFor(() => expect(setTheme).toHaveBeenCalledWith('light'));
  });

  it("leaves a visitor's own pick alone", () => {
    document.cookie = 'theme=dark';
    const setTheme = mount({ status: 'signed-out', username: null });
    expect(setTheme).not.toHaveBeenCalled();
  });

  it('follows it for a visitor who has not picked', () => {
    const setTheme = mount({ status: 'signed-out', username: null });
    expect(setTheme).toHaveBeenCalledWith('light');
  });
});

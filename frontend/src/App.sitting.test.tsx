/**
 * While a focus sitting is on screen, nothing behind it can be used.
 *
 * The sidebar is hidden (and its width given back), and the rest of the shell
 * — the top bar, the banner, the tour — is inert, so it cannot be clicked,
 * tabbed to or read out. Pausing gives all of it back. Rendered through the
 * whole app rather than the Timer page alone, because the shell is the thing
 * under test.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stats, task } from '@/test/factories';

vi.mock('@/hooks/useSubjects', () => ({
  useSubjectIndex: () => new Map(),
  useSubjects: () => [],
  subjectOf: () => null,
}));

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    focus: {
      ...(real.focus as object),
      history: () => Promise.resolve({ success: true, days: {} }),
      syncDay: () => Promise.resolve({ success: true }),
      sittings: () => Promise.resolve({ success: true, sittings: [] }),
      saveSittings: () => Promise.resolve({ success: true, added: 0 }),
    },
    goals: { ...(real.goals as object), getGoals: () => Promise.resolve({ success: true, goals: [] }) },
    quote: { ...(real.quote as object), daily: () => Promise.resolve({ success: true, quote: 'Go.', author: 'A' }) },
  };
});

import App from './App';

afterEach(() => {
  document.body.className = '';
  localStorage.clear();
});

function show() {
  localStorage.setItem('pomodoro:setup:myles', '1');
  return renderWithProviders(<App />, {
    route: '/timer',
    userData: { data: { stats: stats(), tasks: [task({ title: 'Prove the lemma' })] }, username: 'myles' },
  });
}

/* The whole app, with the Timer page loaded lazily: under the full suite's
   load the first paint can take longer than testing-library's one second. */
describe('the shell during a focus sitting', { timeout: 20000 }, () => {
  it('hides the sidebar and makes everything behind the sitting inert', async () => {
    const { container } = show();
    await userEvent.click(await screen.findByRole('button', { name: /^start focus$/i }, { timeout: 8000 }));
    await screen.findByRole('button', { name: /^pause$/i }, { timeout: 8000 });

    expect(document.body).toHaveClass('is-sitting');
    const chrome = container.querySelectorAll('.app-chrome');
    expect(chrome.length).toBeGreaterThan(0);
    chrome.forEach((wrapper) => expect(wrapper).toHaveAttribute('inert'));
    // The session itself is not inside any of them.
    const pause = screen.getByRole('button', { name: /^pause$/i });
    chrome.forEach((wrapper) => expect(wrapper.contains(pause)).toBe(false));
  });

  it('gives it all back on pause', async () => {
    const { container } = show();
    await userEvent.click(await screen.findByRole('button', { name: /^start focus$/i }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('button', { name: /^pause$/i }, { timeout: 8000 }));

    await waitFor(() => expect(document.body).not.toHaveClass('is-sitting'));
    container.querySelectorAll('.app-chrome').forEach((wrapper) => expect(wrapper).not.toHaveAttribute('inert'));
  });
});

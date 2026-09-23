/**
 * The tab counts down with the ring — on the real page.
 *
 * The companion to Dashboard.tabTimer.test.tsx, and here for the same reason:
 * the title reads three fields off a hook declared just above it, and a
 * refactor that moved the declaration or dropped an argument would leave the
 * page rendering perfectly and the tab frozen on "Timer". Nothing else in the
 * suite looks at `document.title`.
 *
 * The difference worth pinning is what this page counts. The dashboard's
 * session runs *up* through the day; a pomodoro phase runs *down*, and it
 * names the phase — a break and an interval are not the same news at a glance
 * from another tab.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stats } from '@/test/factories';

vi.mock('@/hooks/useSubjects', () => ({
  useSubjectIndex: () => new Map(),
  useSubjects: () => [],
  subjectOf: () => null,
}));

/* The two reads this page fires on mount. Stubbed not because the test needs
   what they return — the Progress panel is not what is being asserted — but
   because jsdom cannot resolve a relative URL, so each one lands as an
   unhandled rejection after the test has passed. A test that leaves six of
   those behind is a test that makes the suite's error count useless for
   finding a real one. */
vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    focus: {
      ...(real.focus as object),
      history: () => Promise.resolve({ success: true, days: {} }),
      syncDay: () => Promise.resolve({ success: true }),
    },
    goals: { ...(real.goals as object), getGoals: () => Promise.resolve({ success: true, goals: [] }) },
  };
});

import Timer from './Timer';

function show() {
  return renderWithProviders(<Timer />, {
    route: '/timer',
    userData: { data: { stats: stats(), tasks: [] }, username: 'myles' },
  });
}

beforeEach(() => {
  localStorage.clear();
  // Past the three-question wizard, which is the whole page until it is
  // answered — see `setupDone` in pages/Timer.tsx.
  localStorage.setItem('pomodoro:setup:myles', '1');
  document.title = 'Summit';
});

describe('the focus tab while a phase runs', () => {
  it('names the page while the timer is paused', async () => {
    show();
    await screen.findByRole('button', { name: /^start focus$/i });
    expect(document.title).toBe('Timer · Summit');
  });

  it('counts the phase down in the tab, and says which phase', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: /^start focus$/i }));

    // The clock leads: a narrow tab keeps the front of the title and drops the
    // rest, so "Timer · 24:59" would still read as "Timer…".
    await waitFor(() => {
      expect(document.title).toMatch(/^\d{1,2}:\d{2}(:\d{2})? · Focus · Summit$/);
    });
  });

  it('gives the page its name back when the timer is paused', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: /^start focus$/i }));
    await waitFor(() => expect(document.title).toContain('· Focus ·'));

    await userEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    await waitFor(() => expect(document.title).toBe('Timer · Summit'));
  });
});

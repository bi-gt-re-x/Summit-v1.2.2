/**
 * The tab counts while a session runs — on the real page, not on the hook.
 *
 * hooks/useDocumentTitle.test.tsx pins the formatting and the restore. This is
 * the other half and the half that would actually break: the wiring. The title
 * reads `session.running` and `session.focused` off a hook declared two lines
 * above it, and nothing about a title is visible in the app's own tests — a
 * refactor that moved either declaration, or dropped the second argument, would
 * leave the page rendering perfectly and the tab silently frozen on
 * "Dashboard".
 *
 * The clock is timestamp-based (hooks/useFocusSession), so the assertions here
 * are on the *shape* of what the tab says rather than on a particular second.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stats } from '@/test/factories';

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    tasks: {
      completeTask: () => Promise.resolve({ success: true }),
      rateTask: () => Promise.resolve({ success: true }),
      updateTask: () => Promise.resolve({ success: true }),
      createTask: () => Promise.resolve({ success: true }),
    },
    /* `history` as well as `syncDay`: the page reads it for the usual-hours
       figure on the Focus card, and hooks/useCatchUp reads it again. */
    focus: {
      ...(real.focus as object),
      history: () => Promise.resolve({ success: true, days: {} }),
      syncDay: () => Promise.resolve({ success: true }),
    },
    /* Stubbed so it does not land as an unhandled rejection once the test has
       passed: jsdom cannot resolve a relative URL, and a test that leaves
       those behind makes the suite's error count useless for finding a real
       one. Nothing here asserts on goals. */
    goals: { ...(real.goals as object), getGoals: () => Promise.resolve({ success: true, goals: [] }) },
  };
});

vi.mock('@/hooks/useSubjects', () => ({
  useSubjectIndex: () => new Map(),
  useSubjects: () => [],
  subjectOf: () => null,
}));

import Dashboard from './Dashboard';

function show() {
  return renderWithProviders(<Dashboard />, {
    route: '/dashboard',
    userData: { data: { stats: stats(), tasks: [] }, username: 'myles' },
  });
}

beforeEach(() => {
  localStorage.clear();
  document.title = 'Summit';
});

describe('the dashboard tab while a session runs', () => {
  it('names the page when nothing is running', async () => {
    show();
    await screen.findByRole('button', { name: /start focus/i });
    expect(document.title).toBe('Dashboard · Summit');
  });

  it('leads with a clock once the session starts', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: /start focus/i }));

    // "00:00 · Focus · Summit" on the first tick. The clock leads, because a
    // narrow tab keeps the front of the title and throws the rest away.
    await waitFor(() => {
      expect(document.title).toMatch(/^\d{1,2}:\d{2}(:\d{2})? · Focus · Summit$/);
    });
  });

  it('gives the page its name back when the session stops', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: /start focus/i }));
    await waitFor(() => expect(document.title).toContain('· Focus ·'));

    /* Pausing the pomodoro is what stops the session now.
       The panel used to run an open-ended stopwatch, and stopping it asked
       first — an accidental click should not end a session. A paused interval
       is not an ended one and resumes where it was, so there is nothing left to
       confirm and nothing to scope this click against. */
    await userEvent.click(screen.getByRole('button', { name: /pause focus/i }));

    await waitFor(() => expect(document.title).toBe('Dashboard · Summit'));
  });
});

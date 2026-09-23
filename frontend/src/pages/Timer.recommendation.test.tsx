/**
 * The recommendation, on the real page.
 *
 * The arithmetic has its own tests — components/Timer/intervals.test.ts pins
 * what may be concluded from a log and when it must refuse. What this file is
 * for is the join: the page reads the log through hooks/usePomodoro, and the
 * failure it exists to catch is advice that silently stops arriving because
 * the wiring came apart rather than because there was nothing to say.
 *
 * "Waiting for six sittings" is a *correct* answer here, on a new account, so
 * a test that only checked "a suggestion appears" would pass on a page whose
 * advice had quietly stopped being computed. Each case below therefore pins
 * the sentence as well as its presence.
 */
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stats, task } from '@/test/factories';
import type { Interval } from '@/components/Timer/intervals';

vi.mock('@/hooks/useSubjects', () => ({
  useSubjectIndex: () => new Map(),
  useSubjects: () => [],
  subjectOf: () => null,
}));

/* The page's three reads, stubbed for the same reason as in
   Timer.tabTimer.test.tsx: jsdom cannot resolve a relative URL, so each one
   lands as an unhandled rejection after the test has passed. `history` answers
   both windows — the Progress panel's and the pace baseline's. */
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
    growth: { ...(real.growth as object), ratings: () => Promise.resolve({ success: true }) },
  };
});

import Timer from './Timer';

function sitting(over: Partial<Interval> = {}): Interval {
  return {
    day: '2026-09-20',
    styleId: 'classic',
    planned: 25,
    minutes: 25,
    pauses: 0,
    finished: true,
    ...over,
  };
}

/** Put a log in the browser before the page reads it. See hooks/useIntervals. */
function logged(intervals: Interval[]) {
  localStorage.setItem('pomodoro:intervals:myles', JSON.stringify(intervals));
}

function show(tasks = [task()]) {
  return renderWithProviders(<Timer />, {
    route: '/timer',
    userData: { data: { stats: stats(), tasks }, username: 'myles' },
  });
}

beforeEach(() => {
  localStorage.clear();
  // Past the wizard, which is the whole page until it is answered.
  localStorage.setItem('pomodoro:setup:myles', '1');
});

describe('the recommendation', () => {
  it('says what it is waiting for on an account with no sittings', async () => {
    show();
    expect(await screen.findByText(/recommended lengths start after/i)).toBeInTheDocument();
    // Named rather than "keep going": the count is the thing that moves it.
    expect(screen.getByText(/6 to go/i)).toBeInTheDocument();
  });

  it('counts down as sittings are recorded', async () => {
    logged([sitting(), sitting()]);
    show();
    expect(await screen.findByText(/4 to go/i)).toBeInTheDocument();
  });

  it('names the length that ran best, and how much it rests on', async () => {
    logged([
      ...Array.from({ length: 4 }, () => sitting({
        planned: 25, minutes: 11, pauses: 3, finished: false,
      })),
      ...Array.from({ length: 4 }, () => sitting({
        styleId: 'deep-work', planned: 50, minutes: 50,
      })),
    ]);
    show();

    expect(await screen.findByText(/recommended focus · 50 min/i)).toBeInTheDocument();
    expect(screen.getByText(/over 8 recorded/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use deep work/i })).toBeInTheDocument();
  });

  it('offers no button for the style already in use', async () => {
    logged([
      ...Array.from({ length: 4 }, () => sitting({ planned: 25, minutes: 25 })),
      ...Array.from({ length: 4 }, () => sitting({
        styleId: 'gentle', planned: 10, minutes: 3, pauses: 4, finished: false,
      })),
    ]);
    show();

    // Classic is both the recommendation and the default style.
    expect(await screen.findByText(/already your pick/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^use /i })).not.toBeInTheDocument();
  });
});

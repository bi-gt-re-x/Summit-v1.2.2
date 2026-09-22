/**
 * The recommendation and the three readings, on the real page.
 *
 * The arithmetic has its own tests — components/Timer/intervals.test.ts pins
 * what may be concluded from a log and when it must refuse. What this file is
 * for is the join: the page reads the log through hooks/usePomodoro, and the
 * failure it exists to catch is a reading that silently turns into a dash
 * because the wiring came apart rather than because there was nothing to say.
 *
 * That distinction is the point of the dash assertions below. A dash is a
 * *correct* answer here — on a new account, on a day that has barely started,
 * on work nobody has rated — so a test that only checked "a number appears"
 * would pass on a page whose figures had all quietly stopped arriving. Each one
 * therefore pins the dash **and** the sentence under it that says which of the
 * two is happening.
 */
import { screen, waitFor, within } from '@testing-library/react';
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

/**
 * The readings block, scoped.
 *
 * "Focus" is the ring's phase, the hero's badge and one of the three readings,
 * so an unscoped query for it is ambiguous on purpose — it is the same word
 * doing three jobs. The block's own name is what separates them, which is why
 * it has one.
 */
async function readings() {
  return within(await screen.findByLabelText('This session'));
}

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

describe('the three readings', () => {
  it('shows the last sitting when none is running', async () => {
    logged([sitting({ minutes: 25, pauses: 1 })]);
    show();

    const hud = await readings();
    expect(hud.getByText('Focus')).toBeInTheDocument();
    expect(hud.getByText('85%')).toBeInTheDocument();
    expect(hud.getByText(/last sitting · 25m/i)).toBeInTheDocument();
  });

  it('marks a sitting that was cut short as one', async () => {
    logged([sitting({ minutes: 9, finished: false })]);
    show();
    expect((await readings()).getByText(/last sitting · 9m, cut short/i)).toBeInTheDocument();
  });

  it('dashes focus, and says why, before anything has been recorded', async () => {
    show();
    const hud = await readings();
    expect(hud.getByText(/no sitting recorded yet/i)).toBeInTheDocument();
  });

  it('dashes pace rather than calling a new account slow', async () => {
    show();
    const hud = await readings();
    // No baseline to compare against: a zero here would read as "no different
    // from usual", which is a claim about work nobody has done.
    expect(hud.getByText('Pace')).toBeInTheDocument();
    expect(hud.getByText(/needs 15 min today and a month behind it/i)).toBeInTheDocument();
  });

  it('dashes difficulty when nothing finished today was rated', async () => {
    show([task({ status: 'done', completed_at: '2026-09-20T10:00:00' })]);
    const hud = await readings();
    expect(hud.getByText('Difficulty')).toBeInTheDocument();
    expect(hud.getByText(/nothing rated today/i)).toBeInTheDocument();
  });

  it("reads difficulty off today's ratings, and counts them", async () => {
    const at = new Date();
    const p = (n: number) => (n < 10 ? `0${n}` : String(n));
    const today = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`;
    show([
      task({ status: 'done', completed_at: `${today}T09:00:00`, difficulty: 4 }),
      task({ status: 'done', completed_at: `${today}T10:00:00`, difficulty: 3 }),
      // Finished and never rated: left out of the average rather than counted
      // as easy. See `difficulty` in types/models.ts.
      task({ status: 'done', completed_at: `${today}T11:00:00` }),
    ]);

    await waitFor(() => expect(screen.getByText('3.5 / 5')).toBeInTheDocument());
    expect(screen.getByText(/your rating of 2 finished today/i)).toBeInTheDocument();
  });
});

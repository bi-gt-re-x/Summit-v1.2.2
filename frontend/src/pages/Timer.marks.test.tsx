/**
 * Readiness, and the marks it eventually says something about.
 *
 * The arithmetic is pinned in components/Timer/intervals.test.ts. What is
 * pinned here is the pair of promises the page makes around it.
 *
 * **Readiness can be taken back.** An answer given by mis-clicking carries the
 * same weight in the comparison as a considered one, and there is no other way
 * to remove it.
 *
 * **The panel has three things to say and says the boring one.** Not enough
 * answers, enough answers and no difference, and a difference. A page that
 * only ever spoke up for the third would be a page that can only agree with
 * the idea that readiness matters — so the middle sentence is tested as
 * carefully as the one anybody would remember to write.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stats, task } from '@/test/factories';
import type { Interval, Readiness } from '@/components/Timer/intervals';

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
    },
    goals: { ...(real.goals as object), getGoals: () => Promise.resolve({ success: true, goals: [] }) },
    growth: { ...(real.growth as object), ratings: () => Promise.resolve({ success: true }) },
  };
});

import Timer from './Timer';

function sitting(over: Partial<Interval> = {}): Interval {
  return {
    day: '2026-09-21',
    styleId: 'classic',
    planned: 25,
    minutes: 25,
    pauses: 0,
    finished: true,
    ...over,
  };
}

/** `count` sittings at one readiness, all running the same way. */
function at(count: number, readiness: Readiness, over: Partial<Interval> = {}): Interval[] {
  return Array.from({ length: count }, () => sitting({ readiness, ...over }));
}

function logged(rows: Interval[]) {
  localStorage.setItem('pomodoro:intervals:myles', JSON.stringify(rows));
}

function show() {
  return renderWithProviders(<Timer />, {
    route: '/timer',
    userData: { data: { stats: stats(), tasks: [task()] }, username: 'myles' },
  });
}

async function panel() {
  return within(await screen.findByRole('region', { name: /your best sittings/i }));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('pomodoro:setup:myles', '1');
});

describe('the readiness question', () => {
  it('is unanswered until it is answered', async () => {
    show();
    const low = await screen.findByRole('button', { name: /low/i });
    expect(low).toHaveAttribute('aria-pressed', 'false');
  });

  it('holds the answer', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: /high/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /high/i })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('can be taken back by pressing it again', async () => {
    show();
    const high = await screen.findByRole('button', { name: /high/i });
    await userEvent.click(high);
    await waitFor(() => expect(high).toHaveAttribute('aria-pressed', 'true'));

    await userEvent.click(high);
    await waitFor(() => expect(high).toHaveAttribute('aria-pressed', 'false'));
  });

  it('survives a reload, because it is an answer about the day', async () => {
    const first = show();
    await userEvent.click(await screen.findByRole('button', { name: /high/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /high/i })).toHaveAttribute('aria-pressed', 'true'));
    first.unmount();

    show();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /high/i })).toHaveAttribute('aria-pressed', 'true'));
  });
});

describe('the marks', () => {
  it('dashes every mark on an account with no sittings', async () => {
    show();
    const marks = await panel();
    expect(marks.getByText(/longest unbroken sitting/i)).toBeInTheDocument();
    expect(marks.getAllByText('—')).toHaveLength(3);
  });

  it('reports the longest sitting that ran clean through', async () => {
    logged([
      sitting({ styleId: 'deep-work', planned: 50, minutes: 50 }),
      // Longer, but paused: not a record of sitting still.
      sitting({ styleId: 'ultradian', planned: 90, minutes: 90, pauses: 2 }),
    ]);
    show();

    const marks = await panel();
    await waitFor(() => expect(marks.getByText('50m')).toBeInTheDocument());
    expect(marks.getByText(/deep work, start to finish, no pauses/i)).toBeInTheDocument();
  });

  it('counts a run of sittings seen through', async () => {
    logged([sitting(), sitting(), sitting({ finished: false }), sitting(), sitting()]);
    show();

    const marks = await panel();
    await waitFor(() => expect(marks.getByText(/none abandoned/i)).toBeInTheDocument());
    expect(marks.getByText('2')).toBeInTheDocument();
  });

  it('says how much readiness has been logged before it says anything else', async () => {
    logged([sitting({ readiness: 'high' }), sitting()]);
    show();

    const marks = await panel();
    await waitFor(() =>
      expect(marks.getByText(/readiness is logged on 1 sitting/i)).toBeInTheDocument());
  });

  it('states a difference, with the numbers behind it', async () => {
    logged([
      ...at(4, 'high'),
      ...at(4, 'low', { minutes: 8, pauses: 4, finished: false }),
    ]);
    show();

    const marks = await panel();
    await waitFor(() =>
      expect(marks.getByText(/sittings you start on high readiness run cleaner/i)).toBeInTheDocument());
    expect(marks.getByText(/over 8 sittings/i)).toBeInTheDocument();
  });

  it('says so when readiness has made no difference', async () => {
    logged([...at(4, 'high'), ...at(4, 'low')]);
    show();

    const marks = await panel();
    await waitFor(() =>
      expect(marks.getByText(/made no real difference/i)).toBeInTheDocument());
  });

  it('never claims the work itself was better, only that it ran cleaner', async () => {
    // The score behind this is interruptions and completion. The wording has
    // to stay inside what that can support.
    logged([...at(4, 'high'), ...at(4, 'low', { minutes: 8, pauses: 4, finished: false })]);
    show();

    const marks = await panel();
    await waitFor(() => expect(marks.getByText(/run cleaner/i)).toBeInTheDocument());
    expect(marks.queryByText(/better work|higher quality|smarter/i)).not.toBeInTheDocument();
  });
});

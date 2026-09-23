/**
 * The page while a focus phase runs.
 *
 * Pressing Start Focus does not open a panel, it changes what the page *is* —
 * see components/Timer/FocusView.tsx — and that is the kind of thing a type
 * checker has no opinion about and a refactor quietly undoes. So the fence is
 * here: what has to be gone while somebody is working, what has to still be
 * there, and the two ways back.
 *
 * The removals are asserted by name rather than by counting panels. "The
 * method pickers are not on screen" is the promise; "there are two sections"
 * is a restatement of the markup that would pass just as happily with the
 * wrong two.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stats, task } from '@/test/factories';
import type { Task } from '@/types';

vi.mock('@/hooks/useSubjects', () => ({
  useSubjectIndex: () => new Map(),
  useSubjects: () => [],
  subjectOf: () => null,
}));

const completeTask = vi.fn((..._args: unknown[]) => Promise.resolve({ success: true }));

/* The page's reads, stubbed for the same reason as in the other Timer tests:
   jsdom cannot resolve a relative URL, so each one lands as an unhandled
   rejection after the test has passed. The quote is stubbed too — the sitting
   asks for one on mount, and it is the only page that does. */
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
    quote: {
      ...(real.quote as object),
      daily: () => Promise.resolve({ success: true, quote: 'Keep going.', author: 'Nobody' }),
    },
    tasks: { ...(real.tasks as object), completeTask: (...args: unknown[]) => completeTask(...args) },
  };
});

import Timer from './Timer';

function show(tasks: Task[] = [task({ title: 'Prove the lemma' })]) {
  return renderWithProviders(<Timer />, {
    route: '/timer',
    userData: { data: { stats: stats(), tasks }, username: 'myles' },
  });
}

/** Press the one button that starts everything, and wait for the swap. */
async function start() {
  await userEvent.click(await screen.findByRole('button', { name: /^start focus$/i }));
  await screen.findByRole('button', { name: /^pause$/i });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('pomodoro:setup:myles', '1');
  completeTask.mockClear();
});

describe('starting a sitting', () => {
  it('takes the rest of the page away', async () => {
    show();
    expect(await screen.findByText(/pick your focus/i)).toBeInTheDocument();

    await start();

    // The four panels a reader would otherwise be asked to make a decision in.
    expect(screen.queryByText(/pick your focus/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/before you start/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /upcoming tasks/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/intensity/i)).not.toBeInTheDocument();
  });

  it('leaves one control, and it is not Start', async () => {
    show();
    await start();

    expect(screen.queryByRole('button', { name: /^start focus$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reset$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /set up again/i })).not.toBeInTheDocument();
  });

  it('keeps the clock, the tasks and a line worth reading', async () => {
    show();
    await start();

    // The clock by its figures: "Focus" is the ring's phase *and* the second
    // bar's label, and an unscoped query for it would match either.
    expect(screen.getByText(/^\d{1,2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /up next/i })).toBeInTheDocument();
    expect(screen.getByText('Prove the lemma')).toBeInTheDocument();
    expect(await screen.findByText(/keep going\./i)).toBeInTheDocument();
  });
});

describe('the two bars', () => {
  it('counts today against the account\'s own goals, not the sitting', async () => {
    const at = new Date();
    const p = (n: number) => (n < 10 ? `0${n}` : String(n));
    const today = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`;
    show([
      task({ title: 'Prove the lemma' }),
      task({ status: 'done', completed_at: `${today}T09:00:00` }),
      task({ status: 'done', completed_at: `${today}T10:00:00` }),
      // Yesterday's, which is not today's and must not be counted as it.
      task({ status: 'done', completed_at: '2026-01-02T10:00:00' }),
    ]);
    await start();

    const today_ = screen.getByLabelText(/^today$/i);
    expect(today_).toHaveTextContent(/2 of \d+/);
  });
});

describe('finishing a task from the sitting', () => {
  it('goes through the same call the rest of the app uses', async () => {
    show([task({ id: 't-9', title: 'Prove the lemma' })]);
    await start();

    await userEvent.click(screen.getByRole('button', { name: /prove the lemma/i }));

    expect(completeTask).toHaveBeenCalledWith('t-9');
  });

  it('takes the row away on the click rather than a round trip later', async () => {
    show([task({ id: 't-9', title: 'Prove the lemma' })]);
    await start();

    await userEvent.click(screen.getByRole('button', { name: /prove the lemma/i }));

    await waitFor(() =>
      expect(screen.queryByText('Prove the lemma')).not.toBeInTheDocument());
    expect(screen.getByText(/nothing left on the list/i)).toBeInTheDocument();
  });

  it('puts the row back when the call fails', async () => {
    completeTask.mockResolvedValueOnce({ success: false });
    show([task({ id: 't-9', title: 'Prove the lemma' })]);
    await start();

    await userEvent.click(screen.getByRole('button', { name: /prove the lemma/i }));

    // The list is the truth and the optimistic row was a guess.
    await waitFor(() => expect(screen.getByText('Prove the lemma')).toBeInTheDocument());
  });
});

describe('the two ways back', () => {
  it('gives the page back when the sitting is paused', async () => {
    show();
    await start();

    await userEvent.click(screen.getByRole('button', { name: /^pause$/i }));

    expect(await screen.findByText(/pick your focus/i)).toBeInTheDocument();
  });

  it('gives the page back on Escape, by pausing', async () => {
    show();
    await start();

    await userEvent.keyboard('{Escape}');

    expect(await screen.findByText(/pick your focus/i)).toBeInTheDocument();
    // Escape is the same act as the button, not a way to hide a running clock:
    // a sitting that kept counting behind the full page would be recording
    // minutes nobody was sitting for.
    expect(await screen.findByRole('button', { name: /^start focus$/i })).toBeInTheDocument();
  });
});

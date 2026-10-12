/**
 * A sitting is for something.
 *
 * The task picker is the reason the page exists, so this pins the loop end to
 * end: a pick is shown, can be taken back, survives into the sitting, is
 * stamped on the row the sitting writes, and comes back out as "25m on
 * Revise integrals" in today's sittings. Plus the two ways a pick changes on
 * its own — arriving with `?task=`, and letting go of a task once it is
 * finished — since nobody presses anything for either and a regression in
 * them would go unnoticed.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stats, task } from '@/test/factories';
import { pomodoroKey } from '@/utils/pomodoroChoice';
import type { Interval } from '@/components/Timer/intervals';
import type { Task } from '@/types';

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
    quote: {
      ...(real.quote as object),
      daily: () => Promise.resolve({ success: true, quote: 'Keep going.', author: 'Nobody' }),
    },
  };
});

import Timer from './Timer';

const integrals = task({ id: 't-int', title: 'Revise integrals', due_date: '2026-01-01' });
const essay = task({ id: 't-essay', title: 'Draft the essay', due_date: '2026-01-02' });

function today(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Where the router is, so a test can see `?task=` leave the address bar. */
function Where() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

function show(tasks: Task[] = [integrals, essay], route = '/timer') {
  return renderWithProviders(<><Timer /><Where /></>, {
    route,
    userData: { data: { stats: stats(), tasks }, username: 'myles' },
  });
}

async function picker() {
  return within(await screen.findByRole('region', { name: /what are you working on/i }));
}

/** The hero's "Working On" card, by its label. */
function workingOn() {
  return screen.getByText(/^working on$/i).closest('.pom-side-card') as HTMLElement;
}

function row(over: Partial<Interval> = {}): Interval {
  return {
    day: today(),
    styleId: 'classic',
    planned: 25,
    minutes: 25,
    pauses: 0,
    finished: true,
    at: Date.now() - 3 * 3600_000,
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('pomodoro:setup:myles', '1');
});

describe('picking a task', () => {
  it('marks the pick and names it beside the clock', async () => {
    show();
    const list = await picker();
    expect(within(workingOn()).getByText('No task')).toBeInTheDocument();

    await userEvent.click(list.getByRole('button', { name: /revise integrals/i }));

    expect(list.getByRole('button', { name: /revise integrals/i })).toHaveAttribute('aria-pressed', 'true');
    expect(within(workingOn()).getByText('Revise integrals')).toBeInTheDocument();
  });

  it('can be taken back by pressing it again', async () => {
    show();
    const list = await picker();
    await userEvent.click(list.getByRole('button', { name: /revise integrals/i }));
    await userEvent.click(list.getByRole('button', { name: /revise integrals/i }));

    expect(list.getByRole('button', { name: /revise integrals/i })).toHaveAttribute('aria-pressed', 'false');
    expect(within(workingOn()).getByText('No task')).toBeInTheDocument();
  });

  it('goes into the sitting with it', async () => {
    show();
    await userEvent.click((await picker()).getByRole('button', { name: /draft the essay/i }));
    await userEvent.click(screen.getByRole('button', { name: /^start focus$/i }));

    await screen.findByRole('button', { name: /^pause$/i });
    expect(screen.getByText(/working on/i)).toHaveTextContent('Working on Draft the essay');
  });
});

describe('what a sitting on a task leaves behind', () => {
  it('stamps the task on the row and shows where the time went', async () => {
    // A focus phase that ran out a moment ago, with a task picked: the page
    // catches up on mount and writes the row, exactly as if the clock had
    // reached zero with the tab open.
    localStorage.setItem(pomodoroKey('myles'), JSON.stringify({
      styleId: 'classic', levelId: 4, phase: 'focus', done: 0,
      endsAt: Date.now() - 1000, leftMs: 0, dayIso: today(), doneToday: 0,
      pauses: 0, intent: '', target: null, readiness: null, breaks: [], kind: null,
      task: { id: 't-int', title: 'Revise integrals' },
    }));
    show();

    const sittings = await screen.findByRole('region', { name: /today's sittings/i });
    await waitFor(() => expect(sittings).toHaveTextContent(/Revise integrals1 sitting25m/));

    const stored = JSON.parse(localStorage.getItem('pomodoro:intervals:myles') ?? '[]') as Interval[];
    expect(stored.at(-1)).toMatchObject({ taskId: 't-int', taskTitle: 'Revise integrals' });
    // And the strip at the top says it in a sentence.
    expect(screen.getByRole('region', { name: /your last sitting/i })).toHaveTextContent(/25 min on\s*Revise integrals/);
  });

  it("groups today's sittings by task, most time first, untagged last", async () => {
    localStorage.setItem('pomodoro:intervals:myles', JSON.stringify([
      row({ minutes: 25 }),
      row({ taskId: 't-essay', taskTitle: 'Draft the essay', minutes: 25 }),
      row({ taskId: 't-int', taskTitle: 'Revise integrals', minutes: 50, planned: 50, styleId: 'extended' }),
      row({ taskId: 't-essay', taskTitle: 'Draft the essay', minutes: 40, planned: 50, finished: false }),
      row({ day: '2020-01-01', taskId: 't-int', taskTitle: 'Revise integrals', minutes: 90 }),
    ]));
    show();

    const sittings = await screen.findByRole('region', { name: /today's sittings/i });
    const items = within(sittings).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      'Draft the essay2 sittings1h 5m',
      'Revise integrals1 sitting50m',
      'No task picked1 sitting25m',
    ]);
    expect(sittings).toHaveTextContent('2h 20m across 4 sittings');
  });

  it('says so when there are none yet today', async () => {
    show();
    expect(await screen.findByText(/no sittings yet today/i)).toBeInTheDocument();
  });
});

describe('picks that change by themselves', () => {
  it('picks the task named in ?task= and clears the address bar', async () => {
    show([integrals, essay], '/timer?task=t-essay');

    const list = await picker();
    await waitFor(() => expect(list.getByRole('button', { name: /draft the essay/i }))
      .toHaveAttribute('aria-pressed', 'true'));
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(''));
  });

  it('ignores ?task= for a task that is already finished', async () => {
    show([integrals, { ...essay, status: 'done' }], '/timer?task=t-essay');
    await picker();
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(''));
    expect(within(workingOn()).getByText('No task')).toBeInTheDocument();
  });

  it('lets go of a pick once its task is finished', async () => {
    localStorage.setItem(pomodoroKey('myles'), JSON.stringify({
      styleId: 'classic', levelId: 4, phase: 'focus', done: 0, endsAt: null,
      leftMs: 25 * 60_000, dayIso: today(), doneToday: 0, pauses: 0, intent: '',
      target: null, readiness: null, breaks: [], kind: null,
      task: { id: 't-int', title: 'Revise integrals' },
    }));
    show([{ ...integrals, status: 'done' }, essay]);

    await picker();
    await waitFor(() => expect(within(workingOn()).getByText('No task')).toBeInTheDocument());
  });
});

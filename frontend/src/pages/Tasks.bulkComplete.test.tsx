/**
 * The bulk bar's Complete, from the page's side.
 *
 * It used to complete the picked rows one request at a time — one `mutate`,
 * one re-render of the list and one rail refresh per task. It is one request
 * now, and one state update when it lands.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stats, task } from '@/test/factories';
import { STATS_CHANGED } from '@/components/Rail';
import type { Task } from '@/types';

const completeTask = vi.fn();
const completeTasks = vi.fn();

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    goals: { getGoals: () => Promise.resolve({ success: true, goals: [] }) },
    tasks: {
      completeTask: (...args: unknown[]) => completeTask(...args),
      completeTasks: (...args: unknown[]) => completeTasks(...args),
      rateTask: () => Promise.resolve({ success: true }),
      updateTask: () => Promise.resolve({ success: true }),
      deleteTask: () => Promise.resolve({ success: true }),
      createTask: () => Promise.resolve({ success: true }),
    },
  };
});

vi.mock('@/hooks/useSubjects', () => ({ useSubjects: () => [] }));

import Tasks from './Tasks';

function show(tasks: Task[]) {
  return renderWithProviders(<Tasks />, {
    route: '/tasks',
    settings: { prefs: { rating_depth: 'none' } },
    userData: { data: { stats: stats(), tasks }, username: 'myles' },
  });
}

async function pick(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(await screen.findByRole('button', { name: `More for ${title}` }));
  await user.click(screen.getByRole('checkbox', { name: 'Select' }));
}

beforeEach(() => {
  completeTasks.mockImplementation((ids: string[]) =>
    Promise.resolve({
      success: true,
      completed: ids.map((id) => ({ task_id: id, xp_earned: 10, completed_at: '2026-09-19T12:00:00' })),
      already_done: [], not_found: [], failed: [],
      xp_earned: 10 * ids.length, new_xp: 0, new_level: 2, new_tasks_completed: ids.length,
      xp_required: 100, current_streak: 1, best_streak: 1,
    }),
  );
});

describe('completing the picked rows', () => {
  it('is one request for all of them, and the rail hears about it once', async () => {
    const user = userEvent.setup();
    const titles = ['One', 'Two', 'Three', 'Four', 'Five'];
    show(titles.map((title, at) => task({ id: `t${at}`, title })));
    const heard = vi.fn();
    window.addEventListener(STATS_CHANGED, heard);

    for (const title of titles) await pick(user, title);
    const bar = screen.getByRole('status');
    expect(within(bar).getByText('5 selected')).toBeInTheDocument();
    await user.click(within(bar).getByRole('button', { name: 'Complete' }));

    await waitFor(() => expect(completeTasks).toHaveBeenCalledTimes(1));
    expect(completeTasks.mock.calls[0]![0]).toEqual(['t0', 't1', 't2', 't3', 't4']);
    expect(completeTask).not.toHaveBeenCalled();
    await waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
    window.removeEventListener(STATS_CHANGED, heard);
  });

  it('says how many did not save when the server could not write some', async () => {
    const user = userEvent.setup();
    completeTasks.mockResolvedValueOnce({
      success: true,
      completed: [{ task_id: 'a', xp_earned: 10, completed_at: '2026-09-19T12:00:00' }],
      already_done: [], not_found: [], failed: ['b', 'c'],
      xp_earned: 10, new_xp: 0, new_level: 2, new_tasks_completed: 1,
      xp_required: 100, current_streak: 1, best_streak: 1,
    });
    show(['A', 'B', 'C'].map((title) => task({ id: title.toLowerCase(), title })));

    for (const title of ['A', 'B', 'C']) await pick(user, title);
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'Complete' }));

    expect(await screen.findByText('2 tasks did not save. Try again.')).toBeInTheDocument();
  });
});

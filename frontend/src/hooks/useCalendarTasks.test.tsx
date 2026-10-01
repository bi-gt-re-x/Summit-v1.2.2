/**
 * Finishing a task from the calendar asks the same question as finishing it
 * anywhere else.
 *
 * For a long time it did not. The dashboard and the tasks page both raised the
 * rating prompt after a completion; the three calendar views did not, so the
 * same task, ticked off a grid block instead of a list row, went into the
 * record with no difficulty and no execution against it. That is not a missing
 * nicety — the whole Quality tab is built out of those two numbers, and an
 * account that lives in the calendar was quietly the account analytics could
 * say the least about.
 *
 * Two things are checked here and they are the two that made it a bug: the
 * question is asked, and `rating_depth: 'none'` still silences it. One
 * preference, four places a task can be finished, and it has to mean the same
 * thing in all of them.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCalendarTasks } from './useCalendarTasks';
import { SettingsContext, UserDataContext } from '@/context/contexts';
import { settingsValue, userDataValue } from '@/test/render';
import { task } from '@/test/factories';
import type { ReactNode } from 'react';
import type { Prefs } from '@/services/settings';

vi.mock('@/services', () => ({
  tasks: { completeTask: vi.fn(), rateTask: vi.fn() },
}));

const { tasks: taskService } = await import('@/services');
const completeTask = vi.mocked(taskService.completeTask);
const rateTask = vi.mocked(taskService.rateTask);

/** A task the calendar can see: placed on a day, so it is not a plain to-do. */
const PLACED = task({
  id: 'task-on-the-grid',
  title: 'Read two chapters',
  show_on_calendar: true,
  due_date: '2026-08-28T10:00:00',
});

const DONE = {
  success: true as const,
  message: 'Task completed',
  xp_earned: 20,
  new_xp: 40,
  new_level: 2,
  new_tasks_completed: 5,
  xp_required: 200,
  current_streak: 2,
  best_streak: 4,
  last_task_date: null,
  streak_grace_day: null,
  task_id: 'task-on-the-grid',
  completion_status: 'done' as const,
};

function wrap(prefs: Partial<Prefs> = {}) {
  const mutate = vi.fn();
  const value = userDataValue({
    data: { stats: userDataValue().data!.stats, tasks: [PLACED] },
    mutate,
  });
  function Providers({ children }: { children: ReactNode }) {
    return (
      <SettingsContext.Provider value={settingsValue({ prefs })}>
        <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>
      </SettingsContext.Provider>
    );
  }
  return { Providers, mutate };
}

describe('finishing a task from the calendar', () => {
  it('asks how it went, and names the task it is asking about', async () => {
    completeTask.mockResolvedValue(DONE);
    const { Providers } = wrap();
    const { result } = renderHook(() => useCalendarTasks(), { wrapper: Providers });

    act(() => result.current.complete('task-on-the-grid'));
    await waitFor(() => expect(result.current.rating).not.toBeNull());
    expect(result.current.rating).toEqual({
      id: 'task-on-the-grid',
      name: 'Read two chapters',
    });
  });

  it('says nothing when the account has turned the questions off', async () => {
    completeTask.mockResolvedValue(DONE);
    const { Providers } = wrap({ rating_depth: 'none' });
    const { result } = renderHook(() => useCalendarTasks(), { wrapper: Providers });

    act(() => result.current.complete('task-on-the-grid'));
    await waitFor(() => expect(completeTask).toHaveBeenCalled());
    expect(result.current.rating).toBeNull();
  });

  it('sends only what was answered and writes it onto the list on screen', async () => {
    completeTask.mockResolvedValue(DONE);
    rateTask.mockResolvedValue({ success: true, task_id: 'task-on-the-grid', execution: 4 });
    const { Providers, mutate } = wrap();
    const { result } = renderHook(() => useCalendarTasks(), { wrapper: Providers });

    act(() => result.current.complete('task-on-the-grid'));
    await waitFor(() => expect(result.current.rating).not.toBeNull());

    act(() => result.current.saveRating({ execution: 4 }));
    // Closed on the way out, not on the way back: the task is done and its XP
    // is banked, so the dialog owes the reader nothing further.
    expect(result.current.rating).toBeNull();
    await waitFor(() => expect(rateTask).toHaveBeenCalledWith('task-on-the-grid', { execution: 4 }));

    const patch = mutate.mock.calls.at(-1)![0] as (
      current: { tasks: typeof PLACED[] },
    ) => { tasks: typeof PLACED[] };
    expect(patch({ tasks: [PLACED] }).tasks[0]).toMatchObject({ execution: 4 });
  });

  it('lets the prompt be dismissed without an answer', async () => {
    completeTask.mockResolvedValue(DONE);
    const { Providers } = wrap();
    const { result } = renderHook(() => useCalendarTasks(), { wrapper: Providers });

    act(() => result.current.complete('task-on-the-grid'));
    await waitFor(() => expect(result.current.rating).not.toBeNull());

    act(() => result.current.closeRating());
    expect(result.current.rating).toBeNull();
    expect(rateTask).not.toHaveBeenCalled();
  });
});

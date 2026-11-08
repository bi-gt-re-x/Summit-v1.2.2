/**
 * Goals page writes show on the click, before the server answers
 * (2026-11-08), and the page re-reads the moment work is finished anywhere.
 *
 * Every service call here returns a promise that never settles, so anything
 * the test sees changed was drawn by the page itself, not read back.
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stats } from '@/test/factories';
import { STATS_CHANGED } from '@/utils/statsBus';
import type { Goal, Milestone } from '@/types';

const stone = (id: string, status: string, position: number): Milestone =>
  ({
    id, goal_id: 'g-1', user_id: 'myles', title: `Stage ${id}`, note: '', position, status,
    steps: [], created_at: '2026-09-01T09:00:00',
    ...(status === 'done' ? { completed_at: `2026-10-0${position + 1}T10:00:00` } : {}),
  }) as unknown as Milestone;

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g-1', user_id: 'myles', title: 'Reach USACO Gold', status: 'active', category: 'coding',
    measure: 'milestones', goal_type: 'xp', subject_ids: '', priority: 5, start_date: '2026-09-01',
    created_at: '2026-09-01T09:00:00', deadline: '', why: '', unit: '', current_value: 0, target_number: 0,
    progress: 50,
    milestones: [stone('a', 'done', 0), stone('b', 'active', 1)],
    ...over,
  } as unknown as Goal;
}

let served: Goal[] = [];
const getGoals = vi.fn();
const never = (..._args: unknown[]) => new Promise(() => {});
const deleteGoal = vi.fn(never);
const addMilestone = vi.fn(never);
const updateGoal = vi.fn(never);

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    goals: {
      ...(real.goals as object),
      getGoals: (...args: unknown[]) => getGoals(...args),
      deleteGoal: (...args: unknown[]) => deleteGoal(...args),
      addMilestone: (...args: unknown[]) => addMilestone(...args),
      updateGoal: (...args: unknown[]) => updateGoal(...args),
    },
  };
});

vi.mock('@/hooks/useSubjects', () => ({
  useSubjectIndex: () => new Map(),
  useSubjects: () => [],
  subjectOf: () => null,
}));

import Goals from './Goals';

const show = () =>
  renderWithProviders(<Goals />, { userData: { data: { stats: stats(), tasks: [] } } });

const card = async (title = 'Reach USACO Gold') =>
  (await screen.findByRole('heading', { name: title })).closest('article')!;
const figure = (article: HTMLElement) => article.querySelector('.ag-progress strong')!.textContent;

beforeEach(() => {
  served = [goal()];
  getGoals.mockReset();
  getGoals.mockImplementation(() => Promise.resolve({ success: true, goals: served }));
  deleteGoal.mockClear();
  addMilestone.mockClear();
  updateGoal.mockClear();
});

describe('writes on the Goals page', () => {
  it('takes a deleted goal off the page before the server answers', async () => {
    const user = userEvent.setup();
    show();
    const article = await card();
    await user.click(within(article).getByRole('button', { name: 'Actions for Reach USACO Gold' }));
    await user.click(within(article).getByRole('menuitem', { name: /delete/i }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteGoal).toHaveBeenCalledWith('g-1');
    expect(screen.queryByRole('heading', { name: 'Reach USACO Gold' })).not.toBeInTheDocument();
  });

  it("puts a finished goal back under 100% when what's left is added", async () => {
    served = [goal({
      status: 'completed', needs_verify: true, progress: 100,
      milestones: [stone('a', 'done', 0), stone('b', 'done', 1)],
    })];
    const user = userEvent.setup();
    show();
    const article = await card();
    await user.click(within(article).getByRole('button', { name: /not yet/i }));
    await user.type(within(article).getByLabelText("What's left, as a checkpoint"), 'Mock exam');
    await user.click(within(article).getByRole('button', { name: 'Add checkpoint' }));

    expect(addMilestone).toHaveBeenCalledWith('g-1', { title: 'Mock exam' });
    await waitFor(() => expect(figure(article)).not.toBe('100%'));
    expect(within(article).queryByRole('group', { name: /you reached it/i })).not.toBeInTheDocument();
  });

  it('puts a number goal back under 100% when its target goes up', async () => {
    served = [goal({
      measure: 'number', milestones: [], current_value: 100, target_number: 100,
      status: 'completed', needs_verify: true, progress: 100,
    })];
    const user = userEvent.setup();
    show();
    const article = await card();
    await user.click(within(article).getByRole('button', { name: /not yet/i }));
    await user.type(within(article).getByLabelText('New target'), '200');
    await user.click(within(article).getByRole('button', { name: 'Raise the target' }));

    expect(updateGoal).toHaveBeenCalledWith('g-1', { target_number: 200 });
    await waitFor(() => expect(figure(article)).toBe('50%'));
  });

  it('re-reads the moment work is finished anywhere in the app', async () => {
    show();
    await card();
    const before = getGoals.mock.calls.length;
    act(() => {
      window.dispatchEvent(new Event(STATS_CHANGED));
    });
    await waitFor(() => expect(getGoals.mock.calls.length).toBeGreaterThan(before));
  });
});

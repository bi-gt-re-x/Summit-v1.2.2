/**
 * Every step moves the goal on the spot, and finishing one is asked, then
 * celebrated, then recorded.
 *
 * The server is held back in these tests on purpose: a step write that never
 * answers is the case that proves the page did not wait for it. Then the
 * question, both answers, and the celebration picking up the figures the
 * server recorded for Analytics.
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stats } from '@/test/factories';
import type { Goal, Milestone } from '@/types';

const step = (id: string, done: boolean) =>
  ({ id, title: `Step ${id}`, done, placeholder: false, task_id: null, due: null });

const stone = (id: string, status: string, steps: unknown[], position: number): Milestone =>
  ({
    id, goal_id: 'g-1', user_id: 'myles', title: `Stage ${id}`, note: '', position, status, steps,
    created_at: '2026-09-01T09:00:00',
    ...(status === 'done' ? { completed_at: `2026-10-0${position + 1}T10:00:00` } : {}),
  }) as unknown as Milestone;

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g-1', user_id: 'myles', title: 'Reach USACO Gold', status: 'active', category: 'coding',
    measure: 'milestones', goal_type: 'xp', subject_ids: '', priority: 5, start_date: '2026-09-01',
    created_at: '2026-09-01T09:00:00', deadline: '', why: '', unit: '', current_value: 0, target_number: 0,
    progress: 75,
    milestones: [
      stone('a', 'done', [step('a1', true)], 0),
      stone('b', 'active', [step('b1', true), step('b2', true), step('b3', false), step('b4', false)], 1),
    ],
    ...over,
  } as unknown as Goal;
}

let served: Goal[] = [];
const updateMilestone = vi.fn();
const verifyGoal = vi.fn();

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    goals: {
      ...(real.goals as object),
      getGoals: () => Promise.resolve({ success: true, goals: served }),
      updateMilestone: (...args: unknown[]) => updateMilestone(...args),
      verifyGoal: (...args: unknown[]) => verifyGoal(...args),
    },
  };
});

vi.mock('@/hooks/useSubjects', () => ({
  useSubjectIndex: () => new Map(),
  useSubjects: () => [],
  subjectOf: () => null,
}));

import Goals from './Goals';

function show() {
  return renderWithProviders(<Goals />, { userData: { data: { stats: stats(), tasks: [] } } });
}

const card = async () => (await screen.findByRole('heading', { name: 'Reach USACO Gold' })).closest('article')!;
const figure = (article: HTMLElement) => article.querySelector('.ag-progress strong')!.textContent;

beforeEach(() => {
  served = [goal()];
  updateMilestone.mockReset();
  verifyGoal.mockReset();
});

describe('a ticked step', () => {
  it('moves the goal before the server has answered', async () => {
    updateMilestone.mockReturnValue(new Promise(() => {}));
    show();
    const article = await card();
    expect(figure(article)).toBe('75%');

    await userEvent.click(within(article).getByRole('button', { name: 'Finish Step b3' }));

    // (1 + 3/4) / 2 checkpoints, while the save is still out.
    await waitFor(() => expect(figure(article)).toBe('88%'), { timeout: 2000 });
    expect(within(article).getByRole('button', { name: 'Undo Step b3' })).toBeInTheDocument();
    expect(updateMilestone).toHaveBeenCalledWith('b', expect.objectContaining({ steps: expect.any(Array) }));
  });

  it("moves the checkpoint's own bar on the route", async () => {
    updateMilestone.mockReturnValue(new Promise(() => {}));
    show();
    const article = await card();
    const bar = () => article.querySelectorAll<HTMLElement>('.ag-road-bar i')[1]!.style.width;
    expect(bar()).toBe('50%');
    await userEvent.click(within(article).getByRole('button', { name: 'Finish Step b3' }));
    expect(bar()).toBe('75%');
  });
});

describe('reaching the goal', () => {
  it('asks the moment the last checkpoint closes, without a round trip', async () => {
    served = [goal({
      milestones: [
        stone('a', 'done', [step('a1', true)], 0),
        stone('b', 'active', [step('b1', true), step('b2', true)], 1),
      ],
    })];
    updateMilestone.mockReturnValue(new Promise(() => {}));
    show();
    const article = await card();
    await userEvent.click(within(article).getByRole('button', { name: 'Mark checkpoint reached' }));
    expect(await within(article).findByRole('group', { name: /you reached it/i })).toBeInTheDocument();
  });

  it('celebrates on yes, then shows what it took once the server has recorded it', async () => {
    served = [goal({ status: 'completed', needs_verify: true, progress: 100 })];
    let answer: (value: unknown) => void = () => {};
    verifyGoal.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    show();
    const article = await card();
    await userEvent.click(within(article).getByRole('button', { name: /yes, it's done/i }));

    const dialog = await screen.findByRole('dialog', { name: 'Reach USACO Gold' });
    expect(dialog).toHaveTextContent(/goal complete/i);
    expect(dialog).toHaveTextContent(/saving it to your record/i);
    expect(verifyGoal).toHaveBeenCalledWith('g-1', true);

    served = [goal({ status: 'completed', needs_verify: false, verified_at: '2026-10-12T10:00:00', progress: 100 })];
    await act(async () => {
      answer({ success: true, goal: served[0], record: {
        title: 'Reach USACO Gold', measure: 'milestones', category: 'coding', progress: 100,
        days: 41, checkpoints: 2, steps: 5, tasks: 3,
      } });
    });
    await waitFor(() => expect(dialog).toHaveTextContent('41days'));
    expect(within(dialog).getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/analytics#goals-finished');
    // And the goal has left the active list.
    expect(screen.queryByRole('group', { name: /you reached it/i })).not.toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reopens the last checkpoint on not yet', async () => {
    served = [goal({
      status: 'completed', needs_verify: true, progress: 100,
      milestones: [stone('a', 'done', [step('a1', true)], 0), stone('b', 'done', [step('b1', true)], 1)],
    })];
    verifyGoal.mockReturnValue(new Promise(() => {}));
    show();
    const article = await card();
    await userEvent.click(within(article).getByRole('button', { name: /not yet/i }));
    expect(verifyGoal).toHaveBeenCalledWith('g-1', false);
    expect(within(article).queryByRole('group', { name: /you reached it/i })).not.toBeInTheDocument();
    await waitFor(() => expect(figure(article)).not.toBe('100%'), { timeout: 2000 });
  });
});

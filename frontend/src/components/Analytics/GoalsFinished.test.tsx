/**
 * Finished goals reach Analytics: what each took, and nothing until there is one.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';

const finishedGoals = vi.fn();
vi.mock('@/services/goals', () => ({ finishedGoals: () => finishedGoals() }));

import { GoalsFinished } from './GoalsFinished';

const row = (over: Record<string, unknown> = {}) => ({
  goal_id: 'g-1', at: '2026-10-12T10:00:00', title: 'Reach USACO Gold', measure: 'milestones',
  category: 'coding', progress: 100, days: 41, checkpoints: 2, steps: 5, tasks: 3, ...over,
});

describe('goals finished, in Analytics', () => {
  it('lists each goal with what it took', async () => {
    finishedGoals.mockResolvedValue({ success: true, goals: [row(), row({ goal_id: 'g-2', title: 'Read 12 books', days: 19, checkpoints: 0, steps: 0, tasks: 0 })] });
    renderWithProviders(<GoalsFinished />, { route: '/analytics' });
    expect(await screen.findByText('Reach USACO Gold')).toBeInTheDocument();
    expect(screen.getByText('41 days · 2 checkpoints · 5 steps · 3 tasks')).toBeInTheDocument();
    expect(screen.getByText('19 days')).toBeInTheDocument();
    // The typical time is the mean of the two.
    expect(screen.getByText('30 days')).toBeInTheDocument();
  });

  it('draws nothing until a goal has been confirmed', async () => {
    finishedGoals.mockResolvedValue({ success: true, goals: [] });
    const { container } = renderWithProviders(<GoalsFinished />, { route: '/analytics' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });
});

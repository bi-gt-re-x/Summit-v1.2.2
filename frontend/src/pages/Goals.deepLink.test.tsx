/**
 * `?goal=<id>`, which is how a link from somewhere else reaches one goal.
 *
 * The task board has had `?task=` for as long as the top bar has had a search,
 * and notes can now link to either — so a goals page that could only be opened
 * at the top was a page half the links in a note could not actually reach.
 *
 * The parameter is an instruction rather than a description of the view, which
 * is the part worth a test: it has to be spent. Left in the address, closing
 * the panel would reopen it, and the reader would be unable to get out of a
 * goal they had finished reading.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stats } from '@/test/factories';
import type { Goal } from '@/types';

function day(offset: number): string {
  const at = new Date();
  at.setDate(at.getDate() + offset);
  return at.toISOString().slice(0, 10);
}

function goal(id: string, title: string): Goal {
  return {
    id,
    title,
    status: 'active',
    category: 'coding',
    measure: 'number',
    unit: 'points',
    target_number: 100,
    current_value: 40,
    subject_ids: '',
    priority: 5,
    start_date: day(-30),
    created_at: `${day(-30)}T09:00:00`,
    deadline: day(30),
    milestones: [],
  } as unknown as Goal;
}

const GOALS: Goal[] = [goal('g9', 'Finish Calculus I'), goal('g10', 'Ship the parser')];

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    goals: {
      ...(real.goals as object),
      getGoals: () => Promise.resolve({ success: true, goals: GOALS }),
    },
  };
});

vi.mock('@/hooks/useSubjects', () => ({
  useSubjectIndex: () => new Map(),
  useSubjects: () => [],
  subjectOf: () => null,
}));

import Goals from './Goals';

const open = (route: string) =>
  renderWithProviders(<Goals />, { route, userData: { data: { stats: stats(), tasks: [] } } });

describe('opening a goal from a link', () => {
  it('opens the goal the address names', async () => {
    open('/goals?goal=g9');
    await waitFor(() =>
      expect(screen.getAllByText('Finish Calculus I').length).toBeGreaterThan(0),
    );
    // The panel, not merely the card in the list behind it.
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(within(screen.getByRole('dialog')).getByText('Finish Calculus I')).toBeInTheDocument();
  });

  it('spends the parameter, so closing the panel is final', async () => {
    open('/goals?goal=g9');
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await waitFor(() => expect(window.location.search).not.toContain('goal=g9'));
  });

  it('opens nothing at all for a goal this account does not have', async () => {
    open('/goals?goal=not-mine');
    await waitFor(() =>
      expect(screen.getAllByText('Ship the parser').length).toBeGreaterThan(0),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens nothing when there is no parameter', async () => {
    open('/goals');
    await waitFor(() =>
      expect(screen.getAllByText('Ship the parser').length).toBeGreaterThan(0),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

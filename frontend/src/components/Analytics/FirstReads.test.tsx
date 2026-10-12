/**
 * The panel: reads with their samples once there are any, and before that a
 * countdown that says exactly what to do.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import type { Task } from '@/types';

const sittings = vi.fn();
vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return { ...real, focus: { ...(real.focus as object), sittings: () => sittings() } };
});

import { FirstReads } from './FirstReads';

const at = (hour: number) => new Date(2026, 9, 12, hour).getTime();

describe('what your work says so far', () => {
  it('counts down before there is anything to read', async () => {
    sittings.mockResolvedValue({ success: true, sittings: [] });
    renderWithProviders(<FirstReads tasks={[{ status: 'done' } as Task]} goals={[]} />, { route: '/analytics' });
    expect(await screen.findByText(/Finish 2 more tasks or focus sittings/)).toBeInTheDocument();
  });

  it('shows the reads, each with what it rests on', async () => {
    sittings.mockResolvedValue({ success: true, sittings: [9, 10, 11].map((hour) => ({
      id: `s${hour}`, day: '2026-10-12', styleId: 'classic', planned: 25, minutes: 25, pauses: 0, finished: true, at: at(hour),
    })) });
    renderWithProviders(<FirstReads tasks={[]} goals={[]} />, { route: '/analytics' });
    expect(await screen.findByText('All 3 of your focus sittings ran start to finish without a pause.')).toBeInTheDocument();
    expect(screen.getAllByText('from 3 sittings').length).toBeGreaterThan(0);
  });

  it('still reads the tasks when the sittings cannot be fetched', async () => {
    sittings.mockRejectedValue(new Error('offline'));
    const done = (days: number) => ({
      status: 'done', created_at: '2026-10-01T09:00:00', completed_at: `2026-10-0${1 + days}T10:00:00`, met_deadline: true,
    }) as Task;
    renderWithProviders(<FirstReads tasks={[done(1), done(1), done(2)]} goals={[]} />, { route: '/analytics' });
    expect(await screen.findByText(/beaten every due date so far, all 3/)).toBeInTheDocument();
  });
});

/**
 * Mango saying a page just opened (Unlocked.tsx).
 */
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Unlocked } from './Unlocked';
import { renderWithProviders } from '@/test/render';
import { stats } from '@/test/factories';

const NOW = new Date('2026-12-01T12:00:00');
const lastWeek = new Date(NOW.getTime() - 7 * 24 * 3600_000).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const show = (taskDays: number, prefs = {}, createdAt = lastWeek) => {
  const update = vi.fn(async () => null);
  renderWithProviders(<Unlocked />, {
    settings: { createdAt, prefs, update },
    stats: { stats: stats({ task_days: taskDays }) },
  });
  return update;
};

describe('the unlock card', () => {
  it('says nothing on day one', () => {
    show(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says when a page opens, and marks it said', () => {
    const update = show(2);
    expect(screen.getByRole('heading', { name: 'Tasks is open!' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(update).toHaveBeenCalledWith({ features_open: ['tasks'] });
  });

  it('names every page that opened at once', () => {
    show(3);
    expect(screen.getByRole('heading', { name: 'Tasks and Goals are open!' })).toBeInTheDocument();
  });

  it('stays quiet once it has been said', () => {
    show(2, { features_open: ['tasks'] });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('never speaks to an account made before getting started', () => {
    show(30, {}, '2026-01-01T09:00:00');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

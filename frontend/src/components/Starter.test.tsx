/**
 * Getting started on screen: the rail's short list for a new account, the
 * padlocks after it, and the note in front of a locked page.
 * The rule itself is tested in utils/starter.test.ts.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Rail } from './Rail';
import { FeatureGate } from './FeatureGate';
import { renderWithProviders } from '@/test/render';
import { setMatchMedia } from '@/test/media';
import { stats } from '@/test/factories';

vi.mock('@/services/subjects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/subjects')>()),
  list: vi.fn(async () => ({ success: true as const, subjects: [] })),
}));

/* A clock well after the starter shipped, so "a week ago" is still an
   account it applies to (STARTER_SINCE in utils/starter). Only Date is faked. */
const NOW = new Date('2026-12-01T12:00:00');
/** An account made an hour ago, at level 1. */
const justJoined = new Date(NOW.getTime() - 3600_000).toISOString();
/** An account made a week ago, still level 1. */
const lastWeek = new Date(NOW.getTime() - 7 * 24 * 3600_000).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  setMatchMedia({ '(max-width: 640px)': false });
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

const rail = (createdAt: string, prefs = {}) => {
  renderWithProviders(<Rail />, {
    settings: { createdAt, prefs },
    stats: { stats: stats({ level: 1 }) },
  });
  return screen.getByRole('navigation', { name: 'Main' });
};

describe('the rail for a new account', () => {
  it('lists the three starter pages and a row for the rest', () => {
    const nav = rail(justJoined);
    for (const label of ['Dashboard', 'Calendar', 'Timer']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
    for (const label of ['Analytics', 'Tasks', 'Goals', 'Skill Tree', 'Notes', 'Achievements']) {
      expect(within(nav).queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
    expect(within(nav).getByRole('button', { name: /More tools/ })).toBeInTheDocument();
  });

  it('unfolds the rest, padlocked, from that row', () => {
    const nav = rail(justJoined);
    fireEvent.click(within(nav).getByRole('button', { name: /More tools/ }));
    const goals = within(nav).getByRole('link', { name: 'Goals' });
    expect(goals).toHaveClass('is-locked');
    expect(goals).toHaveAttribute('href', '/goals');
  });

  it('keeps a page it has opened in the list', () => {
    const nav = rail(justJoined, { features_open: ['goals'] });
    expect(within(nav).getByRole('link', { name: 'Goals' })).not.toHaveClass('is-locked');
  });
});

describe('the rail after the starter days', () => {
  it('lists everything, with the unopened pages padlocked', () => {
    const nav = rail(lastWeek, { features_open: ['notes'] });
    expect(within(nav).getByRole('link', { name: 'Goals' })).toHaveClass('is-locked');
    expect(within(nav).getByRole('link', { name: 'Notes' })).not.toHaveClass('is-locked');
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveClass('is-locked');
    expect(within(nav).queryByRole('button', { name: /More tools/ })).not.toBeInTheDocument();
  });
});

describe('the note in front of a locked page', () => {
  const gate = (route: string, createdAt: string, prefs = {}, update = vi.fn(async () => null)) => {
    renderWithProviders(
      <Routes>
        <Route element={<FeatureGate />}>
          <Route path="/goals" element={<p>The goals page</p>} />
          <Route path="/dashboard" element={<p>The dashboard</p>} />
        </Route>
      </Routes>,
      { route, settings: { createdAt, prefs, update }, stats: { stats: stats({ level: 1 }) } },
    );
    return update;
  };

  it('stands in front of a locked page, and opens it for good', () => {
    const update = gate('/goals', justJoined);
    expect(screen.getByRole('heading', { name: 'Goals' })).toBeInTheDocument();
    expect(screen.queryByText('The goals page')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Goals' }));
    expect(update).toHaveBeenCalledWith({ features_open: ['goals'] });
  });

  it('steps aside for a starter page', () => {
    gate('/dashboard', justJoined);
    expect(screen.getByText('The dashboard')).toBeInTheDocument();
  });

  it('steps aside for a page already opened', () => {
    gate('/goals', justJoined, { features_open: ['goals'] });
    expect(screen.getByText('The goals page')).toBeInTheDocument();
  });

  it('never stands in front of an account made before it existed', () => {
    gate('/goals', '2026-01-01T09:00:00');
    expect(screen.getByText('The goals page')).toBeInTheDocument();
  });
});

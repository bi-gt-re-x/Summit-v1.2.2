/**
 * The rail: the AMC site's seven destinations in two folding sections, the
 * count of reviews due on Review, how much of the bank is solved in the foot,
 * and four tabs plus More on a phone.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Rail } from './Rail';
import { forgetAmcSummary } from '@/hooks/useAmcSummary';
import { amc, type Dashboard } from '@/services/amc';
import { renderWithProviders } from '@/test/render';
import { setMatchMedia } from '@/test/media';

function summary(overrides: Partial<Dashboard['stats']> = {}): Dashboard {
  return {
    stats: {
      solved: 12, attempted: 15, total: 60, accuracy: 0.8, streak: 3, due: 4, in_review: 5,
      mastered: 1, minutes: 30, mocks: 1, ...overrides,
    },
    target: 'AMC 10',
    goal: 105,
    projected: { 'AMC 10': 96, 'AMC 12': 80, AIME: 4 },
    projection_min: 5,
    categories: [],
    weakest: [],
    next_problem: null,
    recent: [],
    plan: null,
    last_mock: null,
  };
}

beforeEach(() => {
  forgetAmcSummary();
  localStorage.clear();
  setMatchMedia({ '(max-width: 640px)': false });
  vi.spyOn(amc, 'dashboard').mockResolvedValue({ success: true, ...summary() });
});

afterEach(() => {
  vi.restoreAllMocks();
  forgetAmcSummary();
});

const nav = () => screen.getByRole('navigation', { name: 'Main' });

describe('the rail', () => {
  it('lists the AMC destinations under Prep and Practice', () => {
    renderWithProviders(<Rail />);
    const prep = within(screen.getByRole('region', { name: 'Prep' }));
    const practice = within(screen.getByRole('region', { name: 'Practice' }));
    expect(prep.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('href', '/dashboard');
    expect(prep.getByRole('link', { name: /Review/ })).toHaveAttribute('href', '/review');
    expect(prep.getByRole('link', { name: /Study Plan/ })).toHaveAttribute('href', '/study-plan');
    const practiceLinks: [string, string][] = [['Problems', '/problems'], ['Topics', '/topics'],
      ['Past Contests', '/contests'], ['Search', '/search']];
    for (const [name, href] of practiceLinks) {
      expect(practice.getByRole('link', { name: new RegExp(name) })).toHaveAttribute('href', href);
    }
  });

  it('shows how many reviews are due, and the solved count in the foot', async () => {
    renderWithProviders(<Rail />);
    expect(await within(nav()).findByText('4')).toHaveClass('rail-due');
    expect(screen.getByText('12 of 60 solved')).toBeInTheDocument();
    expect(screen.getByText('AMC 10 ≈ 96')).toBeInTheDocument();
  });

  it('shows no badge when nothing is due', async () => {
    vi.spyOn(amc, 'dashboard').mockResolvedValue({ success: true, ...summary({ due: 0 }) });
    renderWithProviders(<Rail />);
    await screen.findByText('12 of 60 solved');
    expect(nav().querySelector('.rail-due')).toBeNull();
  });

  it('lights the section for a detail page under it', () => {
    renderWithProviders(<Rail />, { route: '/problems/step-10-01' });
    expect(screen.getByRole('link', { name: /Problems/ })).toHaveClass('active');
  });

  it('folds a section under its heading', () => {
    renderWithProviders(<Rail />);
    fireEvent.click(screen.getByRole('button', { name: 'Practice' }));
    expect(screen.queryByRole('link', { name: /Topics/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Dashboard/ })).toBeInTheDocument();
  });

  it('shows four tabs and More on a phone', () => {
    setMatchMedia({ '(max-width: 640px)': true });
    renderWithProviders(<Rail />);
    const links = within(nav()).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toEqual(expect.arrayContaining(['/dashboard', '/review', '/problems', '/contests']));
    expect(links).not.toContain('/topics');
    fireEvent.click(screen.getByRole('button', { name: /More/ }));
    const sheet = within(screen.getByRole('menu'));
    expect(sheet.getByRole('menuitem', { name: /Topics/ })).toHaveAttribute('href', '/topics');
    expect(sheet.getByRole('menuitem', { name: /Settings/ })).toHaveAttribute('href', '/settings');
  });
});

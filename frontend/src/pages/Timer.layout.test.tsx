/**
 * Four panels, and only four.
 *
 * The page was eleven panels: a clock buried under optional questions, the
 * goals the minutes fed, the best sittings, a progress block, a catalog of
 * methods, a chart and a task list, most of it restating the Dashboard,
 * Analytics and Goals. This file is the fence around the cut. It asserts the
 * four that stay — the clock, the task picker, the method and today's
 * sittings — that the clock's panel holds the clock and nothing else, and
 * that each panel that went is still gone.
 *
 * None of that is visible to a type checker, and all of it comes back the
 * moment somebody adds "just one more thing" to the page.
 */
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stats, task } from '@/test/factories';
import type { Goal } from '@/types';

vi.mock('@/hooks/useSubjects', () => ({
  useSubjectIndex: () => new Map(),
  useSubjects: () => [],
  subjectOf: () => null,
}));

const goal = {
  id: 'g-1',
  title: 'Qualify for AIME',
  status: 'active',
  measure: 'focus',
  progress: 42,
  target_focus: 600,
  current_focus: 200,
  subject_ids: '',
  why: '',
  milestones: [],
  unit: '',
} as unknown as Goal;

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    focus: {
      ...(real.focus as object),
      history: () => Promise.resolve({ success: true, days: {} }),
      syncDay: () => Promise.resolve({ success: true }),
    },
    goals: { ...(real.goals as object), getGoals: () => Promise.resolve({ success: true, goals: [goal] }) },
    growth: { ...(real.growth as object), ratings: () => Promise.resolve({ success: true }) },
  };
});

import Timer from './Timer';

function show() {
  return renderWithProviders(<Timer />, {
    route: '/timer',
    userData: { data: { stats: stats(), tasks: [task({ title: 'Revise integrals' })] }, username: 'myles' },
  });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('pomodoro:setup:myles', '1');
});

describe('what the page is made of', () => {
  it('gives the method its own panel', async () => {
    show();
    const panel = (await screen.findByRole('heading', { name: /pick your focus/i })).closest('section');
    expect(panel).not.toBeNull();
    expect(within(panel!).getByLabelText('Intensity')).toBeInTheDocument();
    expect(within(panel!).getByLabelText('Pomodoro style')).toBeInTheDocument();
  });

  it('gives the task picker its own panel', async () => {
    show();
    const panel = await screen.findByRole('region', { name: /what are you working on/i });
    expect(within(panel).getByRole('button', { name: /revise integrals/i })).toBeInTheDocument();
  });

  it("gives today's sittings their own panel", async () => {
    show();
    expect(await screen.findByRole('region', { name: /today's sessions/i })).toBeInTheDocument();
  });

  it('keeps the method and the task list out of the timer panel', async () => {
    show();
    // The panel holding the primary button is the clock's own.
    const hero = (await screen.findByRole('button', { name: /^start focus$/i })).closest('section');
    expect(hero).not.toBeNull();
    const inside = within(hero!);
    expect(inside.queryByLabelText('Intensity')).not.toBeInTheDocument();
    expect(inside.queryByRole('button', { name: /revise integrals/i })).not.toBeInTheDocument();
  });

  it('offers one way to start, not two', async () => {
    show();
    await screen.findByRole('button', { name: /^start focus$/i });
    expect(screen.queryByRole('button', { name: /^start$/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /start focus/i })).toHaveLength(1);
    // Reset and set-up-again stay: neither is a second way to do the first.
    expect(screen.getByRole('button', { name: /^reset$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set up again/i })).toBeInTheDocument();
  });
});

describe('what the page is no longer made of', () => {
  it('asks nothing before a session', async () => {
    show();
    await screen.findByRole('button', { name: /^start focus$/i });
    expect(screen.queryByRole('heading', { name: /before you start/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/how ready are you/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/what kind of work/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/what does success look like/i)).not.toBeInTheDocument();
  });

  it("does not restate the goals page's goals", async () => {
    show();
    await screen.findByRole('button', { name: /^start focus$/i });
    expect(screen.queryByRole('region', { name: /today's climb/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Qualify for AIME')).not.toBeInTheDocument();
  });

  it("does not restate the dashboard's and analytics' figures", async () => {
    show();
    await screen.findByRole('button', { name: /^start focus$/i });
    expect(screen.queryByRole('heading', { name: /your progress/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /focus analytics/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/current streak/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/next level/i)).not.toBeInTheDocument();
  });

  it('drops the method catalog and the records', async () => {
    show();
    await screen.findByRole('button', { name: /^start focus$/i });
    expect(screen.queryByRole('heading', { name: /ten ways/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /your best sittings/i })).not.toBeInTheDocument();
  });
});

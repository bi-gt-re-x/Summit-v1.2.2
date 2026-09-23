/**
 * One panel, one job.
 *
 * The hero used to hold the clock, both method selects, the length
 * recommendation, three optional questions and the primary button — with a
 * second start button a hundred pixels from the first. Six unrelated decisions
 * in the panel whose job is to show a timer.
 *
 * This file is the fence around the fix. It asserts that each of those things
 * is in its own panel, that the timer panel holds the timer and nothing else,
 * and that there is exactly one control for starting. None of that is visible
 * to a type checker, and all of it comes back the moment somebody adds "just
 * one more thing" to the hero.
 *
 * It also pins the three panels that were taken off the page. Growth ratings
 * and active goals are the Analytics and Goals pages' own subjects and were
 * being restated here; the level banner advertised the page it was printed on.
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
    userData: { data: { stats: stats(), tasks: [task()] }, username: 'myles' },
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

  it('gives the optional questions their own panel', async () => {
    show();
    const panel = (await screen.findByRole('heading', { name: /before you start/i })).closest('section');
    expect(panel).not.toBeNull();
    const before = within(panel!);
    expect(before.getByText(/how ready are you/i)).toBeInTheDocument();
    expect(before.getByText(/what kind of work/i)).toBeInTheDocument();
    expect(before.getByLabelText(/what does success look like/i)).toBeInTheDocument();
  });

  it('keeps the method and the questions out of the timer panel', async () => {
    show();
    // The panel holding the primary button is the clock's own.
    const hero = (await screen.findByRole('button', { name: /^start focus$/i })).closest('section');
    expect(hero).not.toBeNull();
    const inside = within(hero!);
    expect(inside.queryByLabelText('Intensity')).not.toBeInTheDocument();
    expect(inside.queryByText(/how ready are you/i)).not.toBeInTheDocument();
    expect(inside.queryByLabelText(/what does success look like/i)).not.toBeInTheDocument();
  });

  it('offers one way to start, not two', async () => {
    show();
    // There used to be a round play button in the control row directly under
    // the button that says "Start Focus". Same action, same panel, two
    // primaries for one decision.
    await screen.findByRole('button', { name: /^start focus$/i });
    expect(screen.queryByRole('button', { name: /^start$/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /start focus/i })).toHaveLength(1);
    // Reset and set-up-again stay: neither is a second way to do the first.
    expect(screen.getByRole('button', { name: /^reset$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set up again/i })).toBeInTheDocument();
  });
});

describe('what the page is no longer made of', () => {
  it('does not restate the analytics page\'s growth ratings', async () => {
    show();
    await screen.findByRole('button', { name: /^start focus$/i });
    expect(screen.queryByRole('heading', { name: /growth ratings/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/overall score/i)).not.toBeInTheDocument();
  });

  it('does not restate the goals page\'s goal list', async () => {
    show();
    await screen.findByRole('button', { name: /^start focus$/i });
    expect(screen.queryByRole('heading', { name: /^active goals$/i })).not.toBeInTheDocument();
    // The climb still names goals, which is a different claim: it says what
    // this page's minutes are counted toward, not what the account is aiming
    // at in general.
    expect(await screen.findByRole('region', { name: /today's climb/i })).toBeInTheDocument();
  });

  it('does not advertise the page it is printed on', async () => {
    show();
    await screen.findByRole('button', { name: /^start focus$/i });
    expect(screen.queryByText(/level up your focus/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /view rewards/i })).not.toBeInTheDocument();
  });

  it('keeps the tasks and the standing that were beside them', async () => {
    show();
    expect(await screen.findByRole('heading', { name: /upcoming tasks/i })).toBeInTheDocument();
    // The level figure itself is a real fact and stays, as one of the three
    // cards beside the clock.
    expect(screen.getByText(/next level/i)).toBeInTheDocument();
  });
});

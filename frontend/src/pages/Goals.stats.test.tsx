/**
 * The Stats tab, and the answer it now opens with.
 *
 * The tab is seven analytics components stacked — where you stand, the
 * trajectory, insights, health, growth areas, the table — and every one of
 * them is a different cut of the same set of goals. None of them is wrong.
 * What was missing is the sentence they are all cuts *of*: a reader arriving
 * had to assemble the headline out of six panels, which is the shape a page
 * takes when it is built from the components that exist rather than from the
 * question somebody came to ask.
 *
 * So the tests here are about the top of the tab saying one thing, and saying
 * the same thing the panels underneath it say. A verdict that can disagree
 * with the list below it is worse than no verdict, because the reader now has
 * two answers and no way to choose.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { stats } from '@/test/factories';
import type { Goal, Task } from '@/types';

function day(offset: number): string {
  const at = new Date();
  at.setDate(at.getDate() + offset);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

function goal(id: string, over: Partial<Goal> = {}): Goal {
  return {
    id,
    title: `Goal ${id}`,
    status: 'active',
    category: 'coding',
    measure: 'number',
    unit: 'points',
    target_number: 100,
    current_value: 90,
    subject_ids: 'algorithms',
    priority: 5,
    start_date: day(-30),
    created_at: `${day(-30)}T09:00:00`,
    deadline: day(30),
    milestones: [],
    ...over,
  } as unknown as Goal;
}

/* Two ahead of pace and worked on, one badly behind with nothing against it.
   Both halves matter: health is a blend and no single signal decides it. */
const GOALS: Goal[] = [
  goal('fine-1', { title: 'Ship the parser' }),
  goal('fine-2', { title: 'Read 24 books' }),
  goal('sunk', {
    title: 'Learn to sight-read',
    current_value: 3,
    start_date: day(-50),
    deadline: day(6),
  }),
];

const worked: Task[] = ['fine-1', 'fine-2'].flatMap((id) =>
  Array.from({ length: 10 }, (_, at) =>
    ({
      id: `t-${id}-${at}`,
      user_id: 'user-1',
      title: 'Practice set',
      description: '',
      priority: 'low',
      status: 'done',
      xp_value: 20,
      goal_id: id,
      created_at: `${day(-at - 1)}T09:00:00`,
      completed_at: `${day(-at)}T10:00:00`,
    }) as unknown as Task,
  ),
);

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

async function openStats() {
  const user = userEvent.setup();
  renderWithProviders(<Goals />, { userData: { data: { stats: stats(), tasks: worked } } });
  await user.click(await screen.findByRole('tab', { name: 'Stats' }));
  return user;
}

describe('the answer at the top of Stats', () => {
  it('opens with one verdict and the counts behind it', async () => {
    await openStats();

    const band = screen.getByRole('heading', { name: 'How this is going' }).closest('section')!;
    expect(within(band).getByText(/progressing/)).toHaveTextContent('2 progressing · 1 needs attention');
  });

  /* The whole point of a headline: it has to be the same reading as the list
     four sections below it, or the reader has two answers and no way to pick. */
  it('agrees with the per-goal breakdown underneath it', async () => {
    await openStats();

    const rows = screen.getByRole('heading', { name: 'Goal Health' })
      .closest('section')!
      .querySelectorAll('.gx-health-row');

    const needing = [...rows].filter(
      (row) => row.classList.contains('is-behind'),
    );
    expect(needing).toHaveLength(1);
    /* Scoped to the verdict: the header's attention pill says the same thing,
       which is the agreement being tested rather than an ambiguity to dodge. */
    const band = screen.getByRole('heading', { name: 'How this is going' }).closest('section')!;
    expect(within(band).getByText(/needs attention/)).toHaveTextContent('1 needs attention');
  });

  /* Zeroes are not reassurance, they are a number to parse before you can be
     reassured. The ring below draws every state either way. */
  it('leaves out the counts that are nothing', async () => {
    await openStats();
    const band = screen.getByRole('heading', { name: 'How this is going' }).closest('section')!;

    expect(within(band).queryByText(/0 not started/)).not.toBeInTheDocument();
  });

  it('comes before the analysis of it, not after', async () => {
    await openStats();
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((one) => one.textContent);

    expect(headings[0]).toBe('How this is going');
    expect(headings).toContain('Where you stand');
  });
});

describe('the per-goal diagnosis', () => {
  /* One sentence: the rule that put the goal where it is. */
  it('names the rule that put a goal behind', async () => {
    await openStats();

    const row = [...document.querySelectorAll('.gx-health-row')].find((one) =>
      one.textContent?.includes('Learn to sight-read'),
    )!;

    expect(row).toHaveTextContent(/points behind where the calendar says|Nothing done toward this|Its date passed/);
  });

  it('prints the state the sentence explains', async () => {
    await openStats();

    const row = [...document.querySelectorAll('.gx-health-row')].find((one) =>
      one.textContent?.includes('Learn to sight-read'),
    )!;

    expect(within(row as HTMLElement).getByText('Behind')).toBeInTheDocument();
  });

  it('still opens the goal from the row', async () => {
    const user = await openStats();
    const row = [...document.querySelectorAll('.gx-health-row')].find((one) =>
      one.textContent?.includes('Ship the parser'),
    )!;

    await user.click(within(row as HTMLElement).getByRole('button'));
    expect(await screen.findByRole('button', { name: /Close/i })).toBeInTheDocument();
  });
});

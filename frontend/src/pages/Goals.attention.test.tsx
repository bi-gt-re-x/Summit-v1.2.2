/**
 * The header's attention count, and the filter behind it.
 *
 * The count was prose for as long as it existed — "2 need attention", sitting
 * in a greeting, with no way to act on it. The reader's next move was to scan
 * ten cards for two amber chips, which is the work the sentence had just
 * finished doing for them.
 *
 * So it is a button, and making it one raises a property nothing was enforcing
 * before: the number on it and the set behind it have to be the same thing. A
 * count of three that produces two cards is worse than no count, because the
 * reader has no way to tell which of the two numbers is the lie.
 * ./../components/Goals/GoalsState.test covers which goals are counted; this
 * covers what the page does when the count is pressed.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { goalHealth as reading, stats } from '@/test/factories';
import type { Goal, Task } from '@/types';

/** `n` days from today as `YYYY-MM-DD`, from local parts rather than `toISOString`. */
function day(offset: number): string {
  const at = new Date();
  at.setDate(at.getDate() + offset);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g-1',
    title: 'Reach USACO Gold',
    status: 'active',
    category: 'coding',
    measure: 'number',
    unit: 'points',
    target_number: 100,
    current_value: 90,
    subject_ids: 'algorithms',
    start_date: day(-30),
    created_at: `${day(-30)}T09:00:00`,
    deadline: day(30),
    milestones: [],
    ...over,
  } as unknown as Goal;
}

/* Past its date and not finished — behind by that rule alone. */
const behind = (id: string, title: string) =>
  goal({ id, title, deadline: day(-4), health: reading('behind', 'Its date passed 4 days ago and it is 90% done.') });

/* Ahead of pace and worked on today. */
const fine = (id: string, title: string) => goal({ id, title, health: reading('on-track') });

const worked = (...ids: string[]): Task[] =>
  ids.map(
    (id, at) =>
      ({
        id: `t-${at}`,
        user_id: 'user-1',
        title: 'Practice set',
        description: '',
        priority: 'low',
        status: 'done',
        xp_value: 20,
        goal_id: id,
        created_at: `${day(-1)}T09:00:00`,
        completed_at: `${day(0)}T10:00:00`,
      }) as unknown as Task,
  );

const GOALS: Goal[] = [
  behind('g-late', 'Reach USACO Gold'),
  behind('g-slip', 'Qualify for AIME'),
  fine('g-ok', 'Ship Summit v2'),
  fine('g-good', 'Read 24 books'),
];

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

function show() {
  return renderWithProviders(<Goals />, {
    userData: { data: { stats: stats(), tasks: worked('g-ok', 'g-good') } },
  });
}

describe('the attention filter', () => {
  it('counts the goals that are behind, not every goal', async () => {
    show();
    expect(
      await screen.findByRole('button', { name: /2 need attention/ }),
    ).toBeInTheDocument();
    // And the count above it is the whole set, so the two lines cannot be read
    // as the same number.
    expect(screen.getByText(/in motion/)).toHaveTextContent('4 goals in motion');
  });

  it('filters the cards to exactly the goals it counted', async () => {
    const user = userEvent.setup();
    show();

    await waitFor(() => expect(screen.getByText('Reach USACO Gold')).toBeInTheDocument());
    expect(screen.getByText('Ship Summit v2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /2 need attention/ }));

    // The two that are late, and neither of the two that are not.
    expect(screen.getByText('Reach USACO Gold')).toBeInTheDocument();
    expect(screen.getByText('Qualify for AIME')).toBeInTheDocument();
    expect(screen.queryByText('Ship Summit v2')).not.toBeInTheDocument();
    expect(screen.queryByText('Read 24 books')).not.toBeInTheDocument();
  });

  it('says the list is filtered, where the list is', async () => {
    const user = userEvent.setup();
    show();

    await user.click(await screen.findByRole('button', { name: /2 need attention/ }));

    /* The header pill is above the tab strip and scrolls away; a reader three
       cards down has to be able to see that rows are missing and get back. */
    const bar = screen.getByRole('status');
    expect(bar).toHaveTextContent(/2 goals need attention/);
    await user.click(within(bar).getByRole('button', { name: /Show all 4/ }));

    expect(screen.getByText('Ship Summit v2')).toBeInTheDocument();
  });

  it('gives each filtered card the reason it is there', async () => {
    const user = userEvent.setup();
    show();

    // Nothing printed while the reader is choosing their own goals: the chip
    // carries the reason as a tooltip and the card stays about the goal.
    await waitFor(() => expect(screen.getByText('Reach USACO Gold')).toBeInTheDocument());
    expect(screen.queryByText(/date passed/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /2 need attention/ }));

    // The page chose these two, so it owes the reader the because.
    expect(screen.getAllByText(/date passed 4 days ago/)).toHaveLength(2);
  });

  it('turns itself off again', async () => {
    const user = userEvent.setup();
    show();

    const button = await screen.findByRole('button', { name: /2 need attention/ });
    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');

    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Ship Summit v2')).toBeInTheDocument();
  });
});

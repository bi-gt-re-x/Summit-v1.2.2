/**
 * Goals past the cap of ten, and where they go.
 *
 * Ten cards is not a rendering budget. It is a statement about how many
 * things can actually be pursued at once, and the eleventh goal is never the
 * one being worked on.
 *
 * They used to sit in an "Also tracking" list under the cards. Since
 * 2026-11-08 the first tab opens with a table of *every* goal, so the
 * overflow lives there with the rest: each row says what it is, how far in,
 * and whether it is in trouble, in the same columns as everything else. Under
 * the cards, one quiet line says how many more there are and where.
 */
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { goalHealth as reading, stats } from '@/test/factories';
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

/* Twelve goals: ten make the ladder, two fall into the band, and which two is
   decided by the page's own ordering rather than by the order of this array.
   `outcomes` sorts overdue first, then by priority, then by deadline — so the
   ladder goals take priority 9 and the two meant for the band take 1, and
   neither of those two is overdue. An overdue goal sorts to the *top*, which
   is the first version of this fixture and why it never reached the band.

   The two are given opposite health so the dot has something to tell apart:
   `sinking` is far behind its pace with nothing recorded lately, and `fine` is
   ahead of pace and worked on today. Both need to be real states rather than
   flags — health is a blend and no single signal decides it. */
const ladder = Array.from({ length: 10 }, (_, at) => goal(`top-${at}`, { priority: 9 }));

const sinking = goal('over-late', {
  title: 'Ship the parser',
  priority: 1,
  current_value: 5,
  start_date: day(-50),
  deadline: day(10),
  health: reading('behind', '84 points behind where the calendar says it should be, with 10 days left.'),
});

const fine = goal('over-fine', {
  title: 'Read 24 books',
  priority: 1,
  current_value: 62,
  health: reading('on-track', '62% done, and worked on 1 time in the last two weeks.'),
});

const GOALS: Goal[] = [...ladder, sinking, fine];

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

/** Work today against everything but the overdue one, so health is decided. */
const worked: Task[] = GOALS.filter((one) => one.id !== sinking.id).map((one, at) => ({
  id: `t-${at}`,
  user_id: 'user-1',
  title: 'Practice set',
  description: '',
  priority: 'low',
  status: 'done',
  xp_value: 20,
  goal_id: one.id,
  created_at: `${day(-1)}T09:00:00`,
  completed_at: `${day(0)}T10:00:00`,
}) as unknown as Task);

const show = () =>
  renderWithProviders(<Goals />, { userData: { data: { stats: stats(), tasks: worked } } });

/** The all-goals table at the top of the first tab. */
async function table() {
  const heading = await screen.findByRole('heading', { name: 'All goals at a glance' });
  return heading.closest('section')!;
}

describe('the goals that did not make the ladder', () => {
  it('are all in the table at the top, with the ten above the cap', async () => {
    show();
    const rows = within(await table()).getAllByRole('row').slice(1);

    expect(rows).toHaveLength(12);
    expect(within(await table()).getByText('Ship the parser')).toBeInTheDocument();
    expect(within(await table()).getByText('Read 24 books')).toBeInTheDocument();
  });

  /* The same reading as the chip on a card, so a goal cannot read as failing
     in the table and fine on its own card. */
  it('says which of them is in trouble, and which is not', async () => {
    show();
    const rows = within(await table()).getAllByRole('row');
    const sinkingRow = rows.find((row) => row.textContent?.includes('Ship the parser'))!;
    const fineRow = rows.find((row) => row.textContent?.includes('Read 24 books'))!;

    expect(within(sinkingRow).getByText('Behind')).toBeInTheDocument();
    expect(within(fineRow).getByText('On track')).toBeInTheDocument();
  });

  it('says under the cards how many more there are, and where', async () => {
    show();
    expect(await screen.findByText(/2 more goals are in the table at the top/)).toBeInTheDocument();
  });

  /* The cap is ten: the eleventh and twelfth are rows, not cards. */
  it('leaves the ten on the ladder as cards', async () => {
    show();
    await table();

    expect(document.querySelectorAll('.ag-list .ag-card')).toHaveLength(10);
    expect(screen.getAllByRole('button', { name: /^details$/i })).toHaveLength(10);
  });
});

/**
 * The band under the ladder, and why it is a list rather than more cards.
 *
 * Ten cards is not a rendering budget — it is a statement about how many
 * things can actually be pursued at once. Past that, a goals page stops being
 * a plan and becomes a list of things to feel bad about, and the eleventh goal
 * is never the one being worked on.
 *
 * So the overflow is deliberately quieter, and the tests here are mostly about
 * it staying that way: rows, not a second card system underneath the first,
 * because cards below cards would put the goals that did not make the ladder
 * straight back into competition with the ones that did.
 *
 * What each row has to carry is the three things that decide whether it is
 * worth going to look — what it is, how far in, and whether it is in trouble.
 * The third was missing. Every row drew a bullet painted `var(--tone,
 * var(--gx-faint))` over a list where nothing set `--tone`, so fourteen goals
 * got fourteen identical grey dots and the one quietly failing looked exactly
 * like the one that is simply long.
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
  health: reading('on-track', '62% done, and worked on 1 time in the last fortnight.'),
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

/** The band itself, found by its heading rather than by position. */
async function band() {
  const heading = await screen.findByRole('heading', { name: /Also carrying/ });
  return heading.closest('section')!;
}

describe('the goals that did not make the ladder', () => {
  it('says how many there are in the heading', async () => {
    show();
    expect(await screen.findByRole('heading', { name: 'Also carrying · 2 goals' })).toBeInTheDocument();
  });

  it('holds exactly the goals past the cap', async () => {
    show();
    const rows = within(await band()).getAllByRole('listitem');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Ship the parser');
    expect(rows[1]).toHaveTextContent('Read 24 books');
  });

  it('gives each row how far in it is', async () => {
    show();
    expect(within(await band()).getByText('62%')).toBeInTheDocument();
  });

  /* The addition. Same four states as the chip on a card, so a goal cannot
     read as failing in the band and fine on its own card. */
  it('says which of them is in trouble, and which is not', async () => {
    show();
    const rows = within(await band()).getAllByRole('listitem');

    expect(within(rows[0]!).getByText('Behind')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('On Track')).toBeInTheDocument();
  });

  /* Not a second card system. A row is one button; a card carries a chart, a
     checklist and a kebab, and putting those under the ladder would undo the
     point of having a cap at all. */
  it('draws rows rather than cards', async () => {
    show();
    const shelf = await band();

    expect(within(shelf).queryByRole('button', { name: /View Details/i })).not.toBeInTheDocument();
    expect(within(shelf).queryByRole('heading', { name: 'Current checkpoint' })).not.toBeInTheDocument();
    // One control per row, and it opens the goal.
    expect(within(shelf).getAllByRole('button')).toHaveLength(2);
  });

  /* The cap is ten, so the band exists here because of the eleventh and
     twelfth goals — and the ten above it are still drawn as cards. */
  it('leaves the ten on the ladder as cards', async () => {
    show();
    await screen.findByRole('heading', { name: /Also carrying/ });

    expect(screen.getAllByRole('button', { name: /View Details/i })).toHaveLength(10);
  });
});

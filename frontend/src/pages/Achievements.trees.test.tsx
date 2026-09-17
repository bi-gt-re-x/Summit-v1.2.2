/**
 * The skill trees, in their own section.
 *
 * The wall is one list with a category filter on it, which is the right shape
 * for six of the seven headings. Mastery is the exception: thirty-one badges
 * across six ladders, and the only heading whose badges are counted off how far
 * into a *subject* the work went rather than off anything done in this app.
 *
 * What is pinned here is the part of that a type cannot hold — that the section
 * groups the badges by ladder rather than piling them, that it names the next
 * rung on each, that a finished ladder says so instead of drawing an empty bar,
 * and that the section is not quietly a second copy of the wall.
 *
 * The last one is the one most likely to rot: this section reads `badges` and
 * the wall reads `shown`, and the difference is deliberate — a reader searching
 * "streak" should not watch the tree section empty out beside the wall that is
 * actually answering them.
 */
import { screen, within } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import type { Badge } from '@/services/achievements';

/** One badge, in the shape the server sends. */
function badge(over: Partial<Badge> & Pick<Badge, 'id' | 'name'>): Badge {
  return {
    description: 'Do the thing.',
    metric: 'trees',
    unit: 'trees',
    threshold: 10,
    value: 4,
    earned: false,
    earned_at: null,
    tier: 2,
    tier_label: 'Steady',
    category: 'Mastery',
    xp_reward: 50,
    hidden: false,
    title: null,
    ...over,
  } as Badge;
}

/* Two ladders, in the order the server sends them — thresholds climbing inside
   each, which is what lets the section call the first unearned one "next". */
const TREES = [
  badge({ id: 'trees-1', name: 'First Lattice', threshold: 1, value: 1, earned: true }),
  badge({ id: 'trees-3', name: 'Three Fronts', threshold: 3, value: 3, earned: true }),
  badge({ id: 'trees-8', name: 'Broad Front', threshold: 8, value: 4 }),
  badge({ id: 'trees-15', name: 'Wide Curriculum', threshold: 15, value: 4 }),
];

/* A ladder with every rung earned, which is the branch that draws a sentence
   instead of a bar. */
const DONE = [
  badge({
    id: 'tree-25', name: 'Foot in the Door', metric: 'tree_best', unit: '% of a tree',
    threshold: 25, value: 25, earned: true,
  }),
  badge({
    id: 'tree-50', name: 'Halfway Up', metric: 'tree_best', unit: '% of a tree',
    threshold: 50, value: 50, earned: true,
  }),
];

/** One badge under another heading, to prove the section is not the wall. */
const ELSEWHERE = badge({
  id: 'streak-7', name: 'Week Warrior', metric: 'streak', unit: 'days',
  category: 'Consistency', threshold: 7, value: 7, earned: true,
});

let payload: Badge[] = [];

vi.mock('@/services', async (original) => {
  const real = await original<Record<string, unknown>>();
  return {
    ...real,
    achievements: {
      getAchievements: async () => ({
        success: true,
        achievements: payload,
        earned: payload.filter((row) => row.earned).length,
        total: payload.length,
        figures: {},
        categories: [
          { name: 'Mastery', earned: 3, total: 6 },
          { name: 'Analytics', earned: 0, total: 23 },
        ],
        achievement_xp: 150,
        total_xp: 500,
        streak: 4,
        level: 9,
        xp_to_next: 200,
        title: null,
      }),
    },
  };
});

const Achievements = (await import('./Achievements')).default;

async function show(badges: Badge[]) {
  payload = badges;
  renderWithProviders(<Achievements />, {
    route: '/achievements',
    auth: { username: 'alpha' },
  });
  await act(async () => { await new Promise((r) => { setTimeout(r, 40); }); });
}

/** The section, so an assertion cannot pass on a match out in the wall. */
const section = () => screen.getByText('Skill Trees').closest('section')!;

/* The ladder summaries alone.
   A badge that is next on its ladder is named twice inside the section — once
   as the ladder's answer and once as its own tile in the grid below — which is
   the design and not a duplicate. Assertions about the *ladder* therefore scope
   to the ladder list, or they match the tile and pass for the wrong reason. */
const ladders = () => within(section().querySelector('.ac-ladders') as HTMLElement);

describe('the skill tree section', () => {
  it('draws its own heading with the count under it', async () => {
    await show([...TREES, ELSEWHERE]);

    const box = within(section());
    // Two of the four tree badges are earned. The one filed under Consistency
    // is not counted here, whatever the wall below does with it.
    expect(box.getByText('2 / 4 earned')).toBeInTheDocument();
  });

  it('names the next rung on a ladder, with the figure behind it', async () => {
    await show(TREES);

    // The first unearned rung, not the last earned one and not the hardest.
    expect(ladders().getByText('Broad Front')).toBeInTheDocument();
    expect(ladders().getByText('4 / 8 trees')).toBeInTheDocument();
    // "Wide Curriculum" is on the same ladder and is not next, so it appears
    // as a tile below but never as the ladder's answer.
    expect(ladders().queryByText('Wide Curriculum')).not.toBeInTheDocument();
  });

  it('says so when every rung on a ladder is earned', async () => {
    // The branch that would otherwise draw a bar at 0% under a finished
    // ladder, which reads as nothing done rather than as everything.
    await show(DONE);

    expect(ladders().getByText(/Every rung on this one is yours/i)).toBeInTheDocument();
  });

  it('splits the badges into one row per ladder', async () => {
    await show([...TREES, ...DONE]);

    // Two metrics in, two ladders out — the grouping the wall cannot do
    // without becoming six walls.
    expect(section().querySelectorAll('.ac-ladder')).toHaveLength(2);
  });

  it('gives the reader the way out to the trees themselves', async () => {
    // The only link on the page, and the reason this heading gets a section:
    // these badges are about a curriculum, so the curriculum should be one
    // click away.
    await show(TREES);

    expect(within(section()).getByRole('link', { name: /Open the skill trees/i }))
      .toHaveAttribute('href', '/skill-trees');
  });

  it('draws nothing at all when no tree badge came back', async () => {
    await show([ELSEWHERE]);
    expect(screen.queryByText('Skill Trees')).not.toBeInTheDocument();
  });

  it('keeps its badges while the wall below is filtered to something else', async () => {
    // The section reads the whole set and the wall reads the filtered one.
    // Searching for a streak badge narrows the wall and must not empty this.
    await show([...TREES, ELSEWHERE]);

    const search = screen.getByLabelText(/Search achievements/i);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
      )!.set!;
      setter.call(search, 'Week Warrior');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(ladders().getByText('Broad Front')).toBeInTheDocument();
  });
});

/**
 * Tree standing, and the agreement with the server.
 *
 * The same arithmetic runs in backend/api/achievements.py to award the Mastery
 * badges. The worked examples below are the ones pinned in
 * tests/test_skill_tree_badges.py, deliberately — the page and the badge must
 * not come to different conclusions about the same account, and a shared
 * example is what makes a drift in either one fail somewhere.
 */
import { describe, expect, it } from 'vitest';
import { treeStanding } from './standing';
import { SUBJECT_TREES } from './subjectTrees';

const worthOf = (id: string) => {
  const tree = SUBJECT_TREES.find((entry) => entry.id === id)!;
  return tree.nodes.reduce((sum, node) => sum + (node.navTo ? 0 : node.xp ?? 0), 0);
};

describe('treeStanding', () => {
  it('counts the account\'s own XP against what the lattice is worth', () => {
    const worth = worthOf('machine-learning');
    const [tree] = treeStanding([{ key: 'machine_learning', xp: worth / 2 }]);
    expect(tree).toMatchObject({ id: 'machine-learning', percent: 50 });
    expect(tree!.worth).toBe(worth);
  });

  it('caps at a whole tree', () => {
    // A subject can be worked far past what its lattice covers. Uncapped the
    // bar would run off the end of the panel.
    const worth = worthOf('mathematics');
    const [tree] = treeStanding([{ key: 'mathematics', xp: worth * 4 }]);
    expect(tree!.percent).toBe(100);
  });

  it('counts subjects that share a tree as one climb', () => {
    // Five languages open Foreign Languages. This is the whole difference
    // between the panel and the subject breakdown above it.
    const standing = treeStanding([
      { key: 'spanish', xp: 500 },
      { key: 'french', xp: 500 },
      { key: 'japanese', xp: 500 },
    ]);
    expect(standing).toHaveLength(1);
    expect(standing[0]!.id).toBe('foreign-language');
    expect(standing[0]!.xp).toBe(1500);
    expect(standing[0]!.subjects).toHaveLength(3);
  });

  it('drops a subject it cannot route rather than guessing', () => {
    // `treeForSubject` falls back to the subject's group, which is right for a
    // rail that must place everything and wrong here — it would show progress
    // in a lattice the reader has never opened.
    expect(treeStanding([{ key: 'not_a_subject', xp: 9_999 }])).toEqual([]);
  });

  it('ignores a subject with no XP behind it', () => {
    expect(treeStanding([{ key: 'mathematics', xp: 0 }])).toEqual([]);
  });

  it('sorts deepest first, and breaks a tie on XP', () => {
    const standing = treeStanding([
      { key: 'machine_learning', xp: worthOf('machine-learning') * 0.2 },
      { key: 'mathematics', xp: worthOf('mathematics') * 0.8 },
      { key: 'music', xp: worthOf('music') * 0.5 },
    ]);
    expect(standing.map((tree) => tree.id)).toEqual([
      'mathematics', 'music', 'machine-learning',
    ]);
  });

  it('never reports a tree it does not know what is worth', () => {
    for (const tree of treeStanding([{ key: 'programming', xp: 100 }])) {
      expect(tree.worth).toBeGreaterThan(0);
      expect(tree.title).toBeTruthy();
    }
  });
});

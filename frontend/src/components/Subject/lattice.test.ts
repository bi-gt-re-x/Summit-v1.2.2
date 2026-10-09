/**
 * What there is to learn in a subject, and how much of it you have touched.
 *
 * The thing worth guarding here is the boundary the module exists for: the
 * tree is authored and its node states are illustrative, so the only figure
 * that describes the reader is the count of nodes they have practiced. A
 * regression that quietly started reading the seed's states as progress would
 * look completely reasonable on screen — a filled bar, a plausible percentage
 * — and would be the page reporting a designer's guess as somebody's record.
 */
import { describe, expect, it } from 'vitest';
import { latticeFor } from './lattice';
import { SUBJECT_TREES, subjectTreeById } from '@/skills/subjectTrees';
import { treeForSubject } from '@/skills/subjectMap';

/** A tree that actually forks, so the branch assertions have something to read. */
const FORKED = SUBJECT_TREES.find((tree) =>
  SUBJECT_TREES.some((other) => other.parent === tree.id),
)!;

describe('the lattice behind a subject', () => {
  it('routes a subject to its own tree', () => {
    const lattice = latticeFor('mathematics', 'Math and science', undefined, {});
    expect(lattice).not.toBeNull();
    expect(lattice!.id).toBe(treeForSubject('mathematics', 'Math and science').tree);
    expect(lattice!.chosen).toBe(false);
  });

  it('routes a subject it has never heard of by its group', () => {
    // A catalogue row added since the map was last edited belongs near its
    // group's root, and lands there rather than vanishing.
    const lattice = latticeFor('a_subject_invented_today', 'Computing', undefined, {});
    expect(lattice).not.toBeNull();
    expect(lattice!.nodes).toBeGreaterThan(0);
  });

  it('opens on the branch the reader chose', () => {
    const child = SUBJECT_TREES.find((tree) => tree.parent)!;
    const lattice = latticeFor('mathematics', undefined, child.id, {});
    expect(lattice!.id).toBe(child.id);
    expect(lattice!.chosen).toBe(true);
  });

  it('falls back to the whole subject when the chosen branch is gone', () => {
    // A stored branch can outlive the tree it named. Falling back to the root
    // is the same degradation the rail makes for a deleted subject.
    const lattice = latticeFor('mathematics', undefined, 'a-tree-that-never-was', {});
    expect(lattice).not.toBeNull();
    expect(lattice!.chosen).toBe(false);
  });
});

describe('the breadcrumb', () => {
  it('ends at the tree itself rather than printing it twice', () => {
    // `parentChain` already includes the current tree — it unshifts before
    // walking up — so appending it again put the leaf on the trail twice.
    const child = SUBJECT_TREES.find((tree) => tree.parent)!;
    const lattice = latticeFor('mathematics', undefined, child.id, {})!;

    expect(lattice.path[lattice.path.length - 1]!.id).toBe(child.id);
    expect(lattice.path.filter((step) => step.id === child.id)).toHaveLength(1);
    // And it starts at a root — something with no parent above it.
    expect(subjectTreeById(lattice.path[0]!.id)!.parent).toBeUndefined();
  });

  it('is a single step for a tree that is already a root', () => {
    const root = SUBJECT_TREES.find((tree) => !tree.parent)!;
    const lattice = latticeFor('mathematics', undefined, root.id, {})!;
    expect(lattice.path).toHaveLength(1);
    expect(lattice.path[0]!.id).toBe(root.id);
  });
});

describe('what is the curriculum and what is the reader', () => {
  it('counts nothing as practiced on an untouched store', () => {
    // The seed marks nodes done. None of that is this reader, and a lattice
    // that read those states would open on a page claiming work nobody did.
    const lattice = latticeFor('mathematics', undefined, undefined, {})!;

    expect(lattice.nodes).toBeGreaterThan(0);
    expect(lattice.practiced).toBe(0);
  });

  it('counts only the nodes this account actually practiced', () => {
    const target = subjectTreeById(treeForSubject('mathematics', undefined).tree)!;
    const [first, second] = target.nodes;

    const lattice = latticeFor('mathematics', undefined, undefined, {
      [first!.id]: 40,
      [second!.id]: 5,
      // A node on some other tree, and a zero — neither is practice here.
      'not-on-this-tree': 90,
    })!;

    expect(lattice.practiced).toBe(2);
    expect(lattice.practiced).toBeLessThanOrEqual(lattice.nodes);
  });

  it('does not treat a zero in the store as practice', () => {
    const target = subjectTreeById(treeForSubject('mathematics', undefined).tree)!;
    const lattice = latticeFor('mathematics', undefined, undefined, {
      [target.nodes[0]!.id]: 0,
    })!;
    expect(lattice.practiced).toBe(0);
  });
});

describe('branches', () => {
  it('names the trees a subject forks into, with their sizes', () => {
    const lattice = latticeFor('mathematics', undefined, FORKED.id, {})!;
    expect(lattice.branches.length).toBeGreaterThan(0);
    for (const branch of lattice.branches) {
      expect(branch.title).toBeTruthy();
      expect(branch.nodes).toBeGreaterThan(0);
    }
  });

  it('reports none for a tree that does not fork', () => {
    const leaf = SUBJECT_TREES.find(
      (tree) => !SUBJECT_TREES.some((other) => other.parent === tree.id),
    )!;
    const lattice = latticeFor('mathematics', undefined, leaf.id, {})!;
    expect(lattice.branches).toEqual([]);
  });
});

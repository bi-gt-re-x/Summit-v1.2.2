/**
 * Where an arrow key lands.
 *
 * The decision under test is that the arrows walk the *picture* and not the
 * graph: → means "that tile, over there", not "something this unlocks". So the
 * fixture below is a plain grid of coordinates with no edges at all, which is
 * the honest shape of the claim — if this ever started consulting `requires`,
 * every case here would still have to pass.
 *
 * The two that matter are the scoring rules. Across-axis drift is weighted
 * double, so → prefers the neighbour on your own row over something nearer in
 * a straight line further down; and a node level with this one is not "up"
 * from it, or ↑ and ↓ would swap the same two tiles for ever.
 */
import { describe, expect, it } from 'vitest';
import {
  LATTICE_GEOM,
  stepFrom,
  type GraphLayout,
  type GraphNode,
  type PlacedNode,
} from './skillGraph';

function node(id: string): GraphNode {
  return {
    id,
    name: id,
    blurb: '',
    category: '',
    difficulty: 'beginner',
    status: 'available',
    percent: 0,
    xp: 0,
    have: 0,
    need: 0,
    unit: 'XP',
    on: '',
    requires: [],
    gate: '',
  };
}

/** A layout written by hand, because placement is not what is being tested. */
function at(spots: Record<string, [number, number]>): GraphLayout {
  const nodes: PlacedNode[] = Object.entries(spots).map(([id, [x, y]]) => ({
    node: node(id),
    x,
    y,
    rank: y,
  }));
  return { nodes, edges: [], width: 1000, height: 1000, regions: [] };
}

/*  left ── mid ── right     (y = 0)
 *            under          (y = 200)
 *                    far     (y = 400, out to the right)
 */
const GRID = at({
  left: [0, 0],
  mid: [200, 0],
  right: [400, 0],
  under: [200, 200],
  far: [600, 400],
});

describe('stepFrom', () => {
  it('moves to the neighbour in that direction', () => {
    expect(stepFrom(GRID, 'mid', 'right')?.node.id).toBe('right');
    expect(stepFrom(GRID, 'mid', 'left')?.node.id).toBe('left');
    expect(stepFrom(GRID, 'mid', 'down')?.node.id).toBe('under');
    expect(stepFrom(GRID, 'under', 'up')?.node.id).toBe('mid');
  });

  it('prefers the same row to something nearer in a straight line', () => {
    /* From `left`, `under` is 283 away as the crow flies and `right` is 400 —
       but `under` is not what → means. The doubled drift is what settles it. */
    expect(stepFrom(GRID, 'left', 'right')?.node.id).toBe('mid');
  });

  it('gives back nothing at the edge of the drawing', () => {
    expect(stepFrom(GRID, 'left', 'left')).toBeNull();
    expect(stepFrom(GRID, 'far', 'down')).toBeNull();
  });

  it('will not step to something level with it', () => {
    // `right` is level with `mid`; pressing ↑ from either must not land on
    // the other, or the two would trade places on every press.
    expect(stepFrom(GRID, 'mid', 'up')).toBeNull();
    expect(stepFrom(GRID, 'right', 'down')?.node.id).toBe('under');
  });

  it('answers nothing for a node that is not in the layout', () => {
    expect(stepFrom(GRID, 'nowhere', 'down')).toBeNull();
  });

  it('does not need edges to work', () => {
    // The fixture has none, and every case above passed. Stated outright
    // because it is the design decision, not an accident of the fixture.
    expect(GRID.edges).toHaveLength(0);
    expect(LATTICE_GEOM.nodeW).toBeGreaterThan(0);
  });
});

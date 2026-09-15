/**
 * The pieces a layout comes back in, and the box each one landed in.
 *
 * The packer has always split a graph into connected pieces — that is how a
 * canvas 15,452px wide became one the shape of a screen — and it used to throw
 * the split away on the way out. Handing it back is what lets the canvas say
 * *these are separate branches* over the space it had already put there.
 *
 * Two claims worth pinning, because both are silent when they break:
 *
 *   - the pieces are the *actual* connected components, undirected — a shared
 *     prerequisite joins two branches whichever way the edge points;
 *   - each box holds every node in its piece and nothing from any other. A box
 *     measured from the pre-shelved coordinates rather than the placed ones
 *     would look right on a graph with one piece and be drawn in the wrong
 *     place on every graph with two, which is exactly the case it exists for.
 */
import { describe, expect, it } from 'vitest';
import {
  LATTICE_GEOM,
  layoutGraph,
  type GraphNode,
  type SkillGraph,
} from './skillGraph';

function node(id: string, requires: string[] = []): GraphNode {
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
    requires,
    gate: '',
  };
}

function graph(nodes: GraphNode[]): SkillGraph {
  return { id: 'tree', name: 'Tree', nodes };
}

describe('the layout regions', () => {
  it('is one region for a graph that is all one drawing', () => {
    const layout = layoutGraph(
      graph([node('a'), node('b', ['a']), node('c', ['a'])]),
      LATTICE_GEOM,
    );
    expect(layout.regions).toHaveLength(1);
    expect(layout.regions[0]!.ids.sort()).toEqual(['a', 'b', 'c']);
  });

  it('splits what never joins', () => {
    const layout = layoutGraph(
      graph([node('a'), node('b', ['a']), node('x'), node('y', ['x'])]),
      LATTICE_GEOM,
    );
    expect(layout.regions).toHaveLength(2);
    expect(layout.regions.map((one) => one.ids.sort())).toEqual([['a', 'b'], ['x', 'y']]);
  });

  it('joins two branches that share a prerequisite', () => {
    // Undirected: `a` is under both, so all three are one drawing however far
    // apart the packer would otherwise have put them.
    const layout = layoutGraph(graph([node('a'), node('b', ['a']), node('c', ['a'])]), LATTICE_GEOM);
    expect(layout.regions).toHaveLength(1);
  });

  it('boxes each piece around its own nodes, where they were placed', () => {
    const layout = layoutGraph(
      graph([node('a'), node('b', ['a']), node('x'), node('y', ['x'])]),
      LATTICE_GEOM,
    );

    for (const region of layout.regions) {
      const mine = layout.nodes.filter((one) => region.ids.includes(one.node.id));
      const others = layout.nodes.filter((one) => !region.ids.includes(one.node.id));

      for (const placed of mine) {
        expect(placed.x).toBeGreaterThanOrEqual(region.x);
        expect(placed.y).toBeGreaterThanOrEqual(region.y);
        expect(placed.x + LATTICE_GEOM.nodeW).toBeLessThanOrEqual(region.x + region.width);
        expect(placed.y + LATTICE_GEOM.nodeH).toBeLessThanOrEqual(region.y + region.height);
      }

      // And nothing from the other piece is inside it, which is the half that
      // would fail if the boxes were measured before the pieces were shelved.
      for (const placed of others) {
        const inside =
          placed.x >= region.x
          && placed.x < region.x + region.width
          && placed.y >= region.y
          && placed.y < region.y + region.height;
        expect(inside).toBe(false);
      }
    }
  });
});

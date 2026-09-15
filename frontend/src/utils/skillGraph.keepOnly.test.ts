/**
 * Narrowing a graph, and the one promise that makes it usable.
 *
 * `keepOnly` takes nodes out and leaves every survivor's `requires` exactly as
 * it was — which would be a bug if `layoutGraph` did not drop the edges
 * pointing at nodes that are gone. It does, and this is the test that says so,
 * because the failure is invisible in the data and loud on the screen: lines
 * running from a tile to nowhere, off the edge of the canvas.
 *
 * That contract is what the Path mode on pages/SkillTrees rests on — see
 * `pathOf` in skills/route for which nodes it keeps and why.
 */
import { describe, expect, it } from 'vitest';
import {
  LATTICE_GEOM,
  keepOnly,
  layoutGraph,
  type GraphNode,
  type NodeStatus,
  type SkillGraph,
} from './skillGraph';

function node(id: string, status: NodeStatus, requires: string[] = []): GraphNode {
  return {
    id,
    name: id,
    blurb: '',
    category: '',
    difficulty: 'beginner',
    status,
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

const GRAPH: SkillGraph = {
  id: 'mathematics',
  name: 'Mathematics',
  nodes: [
    node('arith', 'complete'),
    node('fractions', 'complete', ['arith']),
    node('algebra', 'progress', ['fractions']),
    node('stats', 'available', ['arith']),
  ],
};

describe('keepOnly', () => {
  it('keeps what it was given and nothing else', () => {
    const kept = keepOnly(GRAPH, new Set(['arith', 'algebra']));
    expect(kept.nodes.map((one) => one.id)).toEqual(['arith', 'algebra']);
    // The tree it belongs to is unchanged: a view is not a different subject.
    expect(kept.id).toBe(GRAPH.id);
    expect(kept.name).toBe(GRAPH.name);
  });

  it('draws no line to a node that is not there', () => {
    // `algebra` still says it requires `fractions`, which has been taken out.
    const kept = keepOnly(GRAPH, new Set(['arith', 'algebra']));
    expect(kept.nodes.find((one) => one.id === 'algebra')?.requires).toEqual(['fractions']);

    const layout = layoutGraph(kept, LATTICE_GEOM);
    expect(layout.edges).toHaveLength(0);
  });

  it('keeps the lines between the nodes that survive', () => {
    const layout = layoutGraph(keepOnly(GRAPH, new Set(['arith', 'stats'])), LATTICE_GEOM);
    expect(layout.edges.map((edge) => [edge.from, edge.to])).toEqual([['arith', 'stats']]);
  });

  it('leaves the original alone', () => {
    keepOnly(GRAPH, new Set(['arith']));
    expect(GRAPH.nodes).toHaveLength(4);
  });
});

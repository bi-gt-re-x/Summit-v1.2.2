/**
 * Where the reader is, and the route that got them there.
 *
 * The fixture is a small ladder with a fork in it, because the two things most
 * worth pinning are both about choosing between candidates: which of several
 * part-done nodes counts as "here", and which of two chains counts as the
 * route. Both have an obviously right answer and an obviously wrong one that a
 * naive implementation reaches first — the first node it finds, and the
 * shortest path.
 */
import { describe, expect, it } from 'vitest';
import type { GraphNode, NodeStatus, SkillGraph } from '@/utils/skillGraph';
import type { Difficulty } from './types';
import { currentSkill, emphasise, focusOn, nextAfter, routeTo } from './route';

function node(
  id: string,
  status: NodeStatus,
  over: Partial<GraphNode> = {},
): GraphNode {
  return {
    id,
    name: id,
    blurb: '',
    category: 'Maths',
    difficulty: 'beginner' as Difficulty,
    status,
    percent: status === 'complete' ? 100 : 0,
    xp: 1000,
    have: 0,
    need: 1000,
    unit: 'XP',
    on: '',
    requires: [],
    gate: '',
    ...over,
  };
}

/**
 *   arith ─┬─ fractions ── algebra ─┬─ linear ── systems
 *          └─ negatives ────────────┘
 *
 * `algebra` is reachable from `arith` in two hops and in three; the three-hop
 * chain is the one the canvas draws it under.
 */
function ladder(over: Record<string, Partial<GraphNode>> = {}): SkillGraph {
  const rows: GraphNode[] = [
    node('arith', 'complete'),
    node('fractions', 'complete', { requires: ['arith'] }),
    node('negatives', 'complete', { requires: ['arith'] }),
    node('algebra', 'progress', {
      requires: ['fractions', 'negatives'], percent: 60, difficulty: 'beginner',
    }),
    node('linear', 'available', { requires: ['algebra'], difficulty: 'intermediate' }),
    node('systems', 'locked', { requires: ['linear'], difficulty: 'advanced' }),
    node('stats', 'available', { requires: ['arith'], percent: 20, difficulty: 'intermediate' }),
  ];
  return {
    id: 'mathematics',
    name: 'Mathematics',
    nodes: rows.map((row) => ({ ...row, ...(over[row.id] ?? {}) })),
  };
}

describe('currentSkill', () => {
  it('takes what is part-done over what is merely open', () => {
    // `stats` is available and sits earlier in the list; attention is already
    // on the node with 60% behind it.
    expect(currentSkill(ladder())?.id).toBe('algebra');
  });

  it('falls back to the furthest-along available node', () => {
    const graph = ladder({ algebra: { status: 'available', percent: 0 } });
    expect(currentSkill(graph)?.id).toBe('stats');
  });

  it('breaks a tie on the lower rung, not on list order', () => {
    // Two part-done nodes at the same percentage: finish the foundation first.
    const graph = ladder({
      stats: { status: 'progress', percent: 60, difficulty: 'intermediate' },
    });
    expect(currentSkill(graph)?.id).toBe('algebra');
  });

  it('never lands on a navigation diamond', () => {
    // A doorway carries a status like any other node and is never the thing
    // somebody is working on. See skills/subjectTrees. `algebra` would win on
    // every other reading, so skipping it is what the assertion is about.
    expect(currentSkill(ladder())?.id).toBe('algebra');
    expect(currentSkill(ladder(), new Set(['algebra']))?.id).toBe('stats');
  });

  it('says nothing rather than guessing on an untouched tree', () => {
    const graph = ladder();
    const locked = { ...graph, nodes: graph.nodes.map((one) => ({ ...one, status: 'locked' as const })) };
    expect(currentSkill(locked)).toBeNull();
  });
});

describe('routeTo', () => {
  it('takes the longest chain, so the route matches where the canvas drew it', () => {
    expect(routeTo(ladder(), 'systems').map((one) => one.id))
      .toEqual(['arith', 'fractions', 'algebra', 'linear', 'systems']);
  });

  it('is just the node itself when nothing comes before it', () => {
    expect(routeTo(ladder(), 'arith').map((one) => one.id)).toEqual(['arith']);
  });

  it('cannot be hung by a cycle', () => {
    const graph = ladder({ arith: { requires: ['systems'] } });
    expect(() => routeTo(graph, 'systems')).not.toThrow();
    expect(routeTo(graph, 'systems').at(-1)?.id).toBe('systems');
  });
});

describe('nextAfter', () => {
  it('prefers what this node alone opens', () => {
    expect(nextAfter(ladder(), 'algebra')?.id).toBe('linear');
  });

  it('is null at the end of a branch', () => {
    expect(nextAfter(ladder(), 'systems')).toBeNull();
  });

  it('takes the reachable one over the one still waiting on others', () => {
    const graph = ladder({
      stats: { requires: ['algebra', 'linear'], difficulty: 'beginner' },
    });
    // `stats` is the lower rung, but it needs `linear` as well — so `linear`
    // is the move.
    expect(nextAfter(graph, 'algebra')?.id).toBe('linear');
  });
});

describe('focusOn', () => {
  it('counts the prerequisites that are actually done', () => {
    const read = focusOn(ladder(), 'algebra')!;
    expect(read.requires.map((one) => one.id)).toEqual(['fractions', 'negatives']);
    expect(read.met).toBe(2);
    expect(read.unlocks.map((one) => one.id)).toEqual(['linear']);
  });

  it('finds a dashed edge from either end', () => {
    // The node stores its own recommendations; the other half is every node
    // that recommends it.
    const graph = ladder({ systems: { recommends: ['stats'] } });
    expect(focusOn(graph, 'stats')!.suggests.map((one) => one.id)).toEqual(['systems']);
    expect(focusOn(graph, 'systems')!.suggests.map((one) => one.id)).toEqual(['stats']);
  });
});

describe('emphasise', () => {
  it('gives one node the weight and everything a step away the next one down', () => {
    const graph = ladder();
    const weights = emphasise(graph, focusOn(graph, 'algebra')!);

    expect(weights.get('algebra')).toBe('here');
    expect(weights.get('fractions')).toBe('near');
    expect(weights.get('linear')).toBe('near');
    expect(weights.get('stats')).toBe('dim');
  });

  it('widens to the whole chain when the route is traced', () => {
    const graph = ladder();
    const weights = emphasise(graph, focusOn(graph, 'systems')!, true);

    expect(weights.get('systems')).toBe('here');
    // Two steps up, and only on the traced reading.
    expect(weights.get('arith')).toBe('near');
    expect(emphasise(graph, focusOn(graph, 'systems')!).get('arith')).toBe('dim');
  });
});

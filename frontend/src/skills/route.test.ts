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
import {
  CHANCES,
  branchIds,
  currentSkill,
  emphasise,
  focusOn,
  gatesOf,
  litBy,
  nearestBlocker,
  nextAfter,
  opportunities,
  pathOf,
  routeTo,
  spotlight,
} from './route';

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
 *   arith ─┬─ fractions ── algebra ── linear ─┬─ systems ─┐
 *          ├─ negatives ─────────────┘        └───────────┴─ quad
 *          └─ stats
 *
 * `algebra` is reachable from `arith` in two hops and in three; the three-hop
 * chain is the one the canvas draws it under. `quad` waits on two things at
 * once, which is what makes it the node an opportunities list must leave out.
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
    node('quad', 'locked', { requires: ['linear', 'systems'], difficulty: 'advanced' }),
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
    expect(nextAfter(ladder(), 'quad')).toBeNull();
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

describe('opportunities', () => {
  it('finishes before it starts, and starts before it queues', () => {
    // `algebra` is part-done, `linear` and `stats` are open, `systems` is one
    // prerequisite away. That is the order, and it is the argument.
    const chances = opportunities(ladder());
    expect(chances.map((one) => one.node.id)).toEqual(['algebra', 'linear', 'stats']);
    expect(chances[0]?.why).toBe('60% done');
    expect(chances[1]?.why).toBe('Open now');
  });

  it('offers a locked node with one prerequisite left, and not one with two', () => {
    // A single blocker is next week; two is the rest of the tree, and a list
    // holding those is a list of everything. `systems` waits only on `linear`;
    // `quad` waits on `linear` and `systems` both.
    const chances = opportunities(ladder({
      algebra: { status: 'complete', percent: 100 },
      stats: { status: 'complete', percent: 100 },
    }));

    expect(chances.map((one) => one.node.id)).toEqual(['linear', 'systems']);
    expect(chances[1]?.why).toBe('1 prerequisite away');
  });

  it('leaves out what the caller is already looking at', () => {
    // The page skips the node the marker is on: "next up: where you already
    // are" is not a next step.
    expect(opportunities(ladder(), new Set(['algebra']))[0]?.node.id).toBe('linear');
  });

  it('never offers more than it can fit', () => {
    expect(opportunities(ladder()).length).toBeLessThanOrEqual(CHANCES);
  });

  it('has nothing to say about a finished tree', () => {
    const graph = ladder();
    const done = { ...graph, nodes: graph.nodes.map((one) => ({ ...one, status: 'complete' as const })) };
    expect(opportunities(done)).toEqual([]);
  });
});

describe('spotlight', () => {
  it('keeps what the figure counted and puts the rest back', () => {
    const weights = spotlight(ladder(), 'locked');
    expect(weights.get('systems')).toBe('near');
    expect(weights.get('algebra')).toBe('dim');
  });

  it('reads "unlocked" as everything that is not locked, the way the band does', () => {
    const weights = spotlight(ladder(), 'unlocked');
    expect(weights.get('arith')).toBe('near');
    expect(weights.get('systems')).toBe('dim');
  });

  it('marks nothing as here, because a lens has no centre', () => {
    expect([...spotlight(ladder(), 'complete').values()]).not.toContain('here');
  });
});

describe('pathOf', () => {
  /* The ladder, read as a route. `algebra` is where the reader is standing:
     `arith`, `fractions` and `negatives` are behind it, `linear` and `stats`
     are open, and `systems` and `quad` are the step past `linear`. On this
     small fixture that is most of the tree — the point of the function is what
     it leaves out, and the tests below are where that shows. */
  it('collects what is behind, what is open, and one step past', () => {
    const path = pathOf(ladder(), 'algebra');

    expect([...path].sort()).toEqual(
      ['algebra', 'arith', 'fractions', 'linear', 'negatives', 'quad', 'stats', 'systems'].sort(),
    );
  });

  it('takes every ancestor, not just the longest chain', () => {
    // `algebra` waits on two things and the route strip prints one of them.
    // A path view that showed only that one would be hiding a branch the
    // reader finished on the way here.
    const path = pathOf(ladder(), 'algebra');
    expect(path.has('fractions')).toBe(true);
    expect(path.has('negatives')).toBe(true);
  });

  it('leaves out a finished branch nobody is standing on', () => {
    /* `stats` mastered and nothing depending on it: true about the subject,
       not part of the route, and the whole reason this is smaller than the
       lattice. */
    const graph = ladder({ stats: { status: 'complete', percent: 100 } });
    expect(pathOf(graph, 'algebra').has('stats')).toBe(false);
  });

  it('measures the horizon from the frontier, not from the ancestors', () => {
    /* `stats` hangs off `arith`, which is behind the reader. A rule that
       stepped one past everything it had collected would pull in every
       sibling of every node on the way here — so with `stats` finished and
       nobody on it, it stays out even though its parent is in. */
    const graph = ladder({ stats: { status: 'complete', percent: 100 } });
    const path = pathOf(graph, 'algebra');
    expect(path.has('arith')).toBe(true);
    expect(path.has('stats')).toBe(false);
  });

  it('still answers where nobody is standing anywhere', () => {
    // No position at all: the frontier and its horizon are still a view, and
    // a finished root with nothing above it is not part of one.
    const path = pathOf(ladder(), null);
    expect(path.has('linear')).toBe(true);
    expect(path.has('arith')).toBe(false);
  });
});

describe('litBy', () => {
  it('is the set spotlight dims everything else from', () => {
    /* The two must not drift: one decides what the canvas is framed around
       and the other decides what stays bright, and a frame around one set of
       tiles with a different set lit inside it is the bug this shares a
       function to prevent. */
    const graph = ladder();
    for (const lens of ['complete', 'available', 'progress', 'locked', 'unlocked'] as const) {
      const lit = new Set(litBy(graph, lens));
      const weights = spotlight(graph, lens);
      for (const node of graph.nodes) {
        expect(weights.get(node.id)).toBe(lit.has(node.id) ? 'near' : 'dim');
      }
    }
  });

  it('leaves out what it was told to skip', () => {
    expect(litBy(ladder(), 'complete', new Set(['arith']))).not.toContain('arith');
  });
});

describe('branchIds', () => {
  it('is the chain, the node, and one step past it', () => {
    const focus = focusOn(ladder(), 'linear')!;
    const ids = branchIds(focus);

    // The route down to it...
    expect(ids).toEqual(expect.arrayContaining(['arith', 'fractions', 'algebra', 'linear']));
    // ...and what it opens.
    expect(ids).toEqual(expect.arrayContaining(['systems', 'quad']));
    // But not a cousin two steps away on a branch of its own.
    expect(ids).not.toContain('stats');
  });

  it('names nothing twice, so the frame is not asked about one node five times', () => {
    const ids = branchIds(focusOn(ladder(), 'algebra')!);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('gatesOf', () => {
  it('counts how far through its prerequisites a gated node is', () => {
    const gates = gatesOf(ladder());
    expect(gates.get('algebra')).toEqual({ met: 2, need: 2 });
    expect(gates.get('quad')).toEqual({ met: 0, need: 2 });
  });

  it('gives a node with nothing above it no fraction at all', () => {
    // `0 of 0` on a tile is worse than a blank.
    expect(gatesOf(ladder()).has('arith')).toBe(false);
  });

  it('tells one left apart from two, which is the whole point of it', () => {
    const gates = gatesOf(ladder());
    const left = (id: string) => {
      const gate = gates.get(id)!;
      return gate.need - gate.met;
    };
    expect(left('systems')).toBe(1);
    expect(left('quad')).toBe(2);
  });
});

describe('nearestBlocker', () => {
  const at = (id: string, graph = ladder()) =>
    nearestBlocker(graph, graph.nodes.find((one) => one.id === id)!);

  it('names the one prerequisite in the way', () => {
    expect(at('systems')?.id).toBe('linear');
  });

  it('sends the reader to what is closest to done, not to the first listed', () => {
    // `quad` waits on `linear` and `systems`. `linear` is open and `systems` is
    // locked behind it, so `linear` is where a reader can actually start.
    expect(at('quad')?.id).toBe('linear');
  });

  it('prefers something part-done over something merely open', () => {
    const graph = ladder({ systems: { status: 'progress', percent: 30 } });
    expect(at('quad', graph)?.id).toBe('systems');
  });

  it('is null when nothing is in the way', () => {
    expect(at('arith')).toBeNull();
    expect(at('algebra')).toBeNull();
  });
});

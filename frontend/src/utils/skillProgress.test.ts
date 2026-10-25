/**
 * Laying the server's reading over a designed tree.
 *
 * The rules themselves are tested on the server (tests/test_skill_progress.py).
 * What this pins is the seam: that a tile shows exactly what the reading says,
 * that a node the reading leaves out is locked, that the tree's doorways stay
 * open, and that a first paint before the reading arrives never shows a skill
 * as done.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SkillReading } from '@/services/skillProgress';
import { DEFAULT_TARGETS, applyReading, practicedFrom } from './skillProgress';
import type { GraphNode, SkillGraph } from './skillGraph';

function node(id: string, over: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    name: id,
    blurb: '',
    category: 'Maths',
    difficulty: 'foundation',
    // The designed tree's illustration, which the reading must replace.
    status: 'complete',
    percent: 100,
    xp: 1000,
    have: 1000,
    need: 1000,
    unit: 'XP',
    on: '2020-01-01',
    requires: [],
    gate: '',
    ...over,
  };
}

const GRAPH: SkillGraph = {
  id: 'mathematics',
  name: 'Mathematics',
  nodes: [
    node('arith'),
    node('order', { requires: ['arith'] }),
    node('fractions', { requires: ['arith'], difficulty: 'intermediate' }),
    node('door'),
  ],
};

function reading(over: Partial<SkillReading> = {}): SkillReading {
  return {
    status: {},
    nodes: {},
    unfiled: {},
    goals: {},
    checkable: [],
    targets: { ...DEFAULT_TARGETS },
    ...over,
  };
}

const byId = (graph: SkillGraph): Record<string, GraphNode> =>
  Object.fromEntries(graph.nodes.map((one) => [one.id, one]));

describe('applyReading', () => {
  it('shows exactly what the reading says, in sessions', () => {
    const out = byId(
      applyReading(
        GRAPH,
        reading({
          status: { arith: 'complete', order: 'progress', fractions: 'available' },
          nodes: {
            arith: { sessions: 3, target: 3, percent: 100, ready: false, on: '2026-10-20', last: '2026-10-20',
              planned: 0, goal_ids: [], check: null, work: [], tasks: 3 },
            order: { sessions: 1, target: 3, percent: 33, ready: false, on: '', last: '2026-10-21',
              planned: 1, goal_ids: [], check: null, work: [], tasks: 1 },
          },
        }),
      ),
    );
    expect(out.arith!).toMatchObject({ status: 'complete', percent: 100, have: 3, need: 3, unit: 'sessions', on: '2026-10-20' });
    expect(out.order!).toMatchObject({ status: 'progress', percent: 33, have: 1, need: 3 });
    expect(out.fractions!).toMatchObject({ status: 'available', percent: 0, have: 0, need: DEFAULT_TARGETS.intermediate });
  });

  it('locks a node the reading leaves out, whatever the tree was drawn with', () => {
    const out = byId(applyReading(GRAPH, reading({ status: { arith: 'available' } })));
    expect(out.order!.status).toBe('locked');
    expect(out.order!.percent).toBe(0);
    expect(out.order!.on).toBe('');
  });

  it('keeps the doorways to other trees open', () => {
    const out = byId(applyReading(GRAPH, reading(), new Set(['door'])));
    expect(out.door!.status).toBe('available');
  });

  it('opens only the roots before the reading arrives, and finishes nothing', () => {
    const out = byId(applyReading(GRAPH, null));
    expect(out.arith!.status).toBe('available');
    expect(out.order!.status).toBe('locked');
    expect(Object.values(out).some((one) => one.status === 'complete')).toBe(false);
  });
});

describe('practicedFrom', () => {
  it('counts sessions and check tries as touching a node', () => {
    const touched = practicedFrom(
      reading({
        nodes: {
          a: { sessions: 2, target: 3, percent: 66, ready: false, on: '', last: '', planned: 0, goal_ids: [],
            check: null, work: [], tasks: 2 },
          b: { sessions: 0, target: 3, percent: 0, ready: false, on: '', last: '', planned: 0, goal_ids: [],
            check: { tries: 1, best: 2, asked: 5, passed_on: '', last_on: '' }, work: [], tasks: 0 },
          c: { sessions: 0, target: 3, percent: 0, ready: false, on: '', last: '', planned: 2, goal_ids: [],
            check: null, work: [], tasks: 0 },
        },
      }),
    );
    expect(touched).toEqual({ a: 2, b: 1 });
  });
});

describe('the targets the page assumes before the reading arrives', () => {
  it('match the server', () => {
    const source = readFileSync(resolve(__dirname, '../../../backend/tracking/skill_progress.py'), 'utf8');
    const block = source.match(/TARGET = \{([^}]*)\}/)![1]!;
    const server = Object.fromEntries(
      [...block.matchAll(/'(\w+)': (\d+)/g)].map(([, tier, count]) => [tier, Number(count)]),
    );
    expect(server).toEqual(DEFAULT_TARGETS);
  });
});

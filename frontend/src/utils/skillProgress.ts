/**
 * Where the reader stands on a lattice: the server's reading, laid over the
 * designed tree.
 *
 * ## What changed
 *
 * This used to be a browser store of XP added by a Practice button, on top of
 * a starting position written into every tree (Variables mastered, Loops
 * three-quarters done). Both were the same on every account and neither was
 * anything the reader did. A tile now moves when work lands on it: a finished
 * task filed under the node, days of sittings on one, or a passed skill check.
 * The rules are on the server (backend/tracking/skill_progress.py) and come
 * down as one reading (services/skillProgress, hooks/useSkillReading); this
 * module only lays that reading over a graph.
 *
 * ## The unit is a session
 *
 * `have` / `need` are sessions of work against the node's target, so a tile
 * reads "2 / 4 sessions". XP stays on the node as what it is worth, for the
 * reward line; it is no longer the thing the bar counts.
 *
 * ## Before the reading arrives
 *
 * Nothing is done and nothing is in progress: the roots are open and the rest
 * locked. That is what an account with no work looks like anyway, so a first
 * paint never shows a tile mastered that the reading then takes back.
 */
import type { NodeWork, SkillReading } from '@/services/skillProgress';
import type { GraphNode, NodeStatus, SkillGraph } from './skillGraph';

/** Node id → sessions of work, for the readers that only ask "touched or
 *  not" (components/Subject/lattice). */
export type SkillProgress = Record<string, number>;

/** What the server's TARGET says when the reading hasn't arrived. Kept in
 *  step by the test in utils/skillProgress.test.ts reading the same numbers
 *  off a reply. */
export const DEFAULT_TARGETS: Record<string, number> = {
  foundation: 3,
  beginner: 3,
  intermediate: 4,
  advanced: 5,
  expert: 6,
  mastery: 8,
};

export function targetFor(node: Pick<GraphNode, 'difficulty'>, reading: SkillReading | null): number {
  return reading?.targets?.[node.difficulty] ?? DEFAULT_TARGETS[node.difficulty] ?? 4;
}

/** The evidence for one node, or null for a node with none. */
export function workFor(reading: SkillReading | null, id: string): NodeWork | null {
  return reading?.nodes?.[id] ?? null;
}

/**
 * The graph with the reading applied: status, percent, sessions and the day
 * it was done, for every node.
 *
 * `doors` are the tree's navigation nodes (a diamond that opens another
 * tree). They are not skills and the server has no reading for them, so they
 * are always open.
 */
export function applyReading(
  graph: SkillGraph,
  reading: SkillReading | null,
  doors: ReadonlySet<string> = new Set(),
): SkillGraph {
  const inGraph = new Set(graph.nodes.map((node) => node.id));
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const target = targetFor(node, reading);
      if (doors.has(node.id)) {
        return { ...node, status: 'available', percent: 0, have: 0, need: target, unit: 'sessions', on: '' };
      }
      const figure = workFor(reading, node.id);
      let status: NodeStatus;
      if (reading) {
        status = reading.status[node.id] ?? 'locked';
      } else {
        const gates = node.requires.filter((id) => inGraph.has(id));
        status = gates.length === 0 ? 'available' : 'locked';
      }
      return {
        ...node,
        status,
        percent: status === 'complete' ? 100 : figure?.percent ?? 0,
        have: figure?.sessions ?? 0,
        need: figure?.target ?? target,
        unit: 'sessions',
        on: figure?.on ?? '',
      };
    }),
  };
}

/** Node id → sessions, for every node the reader has worked on. */
export function practicedFrom(reading: SkillReading | null): SkillProgress {
  const out: SkillProgress = {};
  for (const [id, figure] of Object.entries(reading?.nodes ?? {})) {
    const touched = figure.sessions + (figure.check?.tries ?? 0);
    if (touched > 0) out[id] = touched;
  }
  return out;
}

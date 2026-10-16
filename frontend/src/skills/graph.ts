/**
 * The relationship layer: what depends on what, and whether a rule is met.
 *
 * Everything here is derived from the nodes and nothing is stored. Hand it a
 * library and it produces the indexes a generator needs — the reverse edges, the
 * flattened requirement lists, a topological order — and answers the one
 * question the rules exist for: given a set of things somebody has, is this node
 * open?
 *
 * ## Rule kinds live in one table
 *
 * `EVALUATORS` is the only switch over rule kinds in the system. A new kind is
 * an entry there and a variant in the `Prerequisite` union, and every caller —
 * the generator, the status calculation, the sentence the UI prints — keeps
 * working, because none of them ever asks what kind a rule is.
 *
 * ## A bad library must not white-screen the app
 *
 * `buildGraph` validates and *reports* rather than throwing: a prerequisite
 * naming a node that does not exist is dropped from the edge set and recorded in
 * `problems`, a duplicate id keeps the first and records the second, a cycle is
 * broken at the edge that closed it. A library is content, content gets edited,
 * and an editing mistake should cost a warning in the console rather than the
 * whole page.
 */
import {
  difficultyRank,
  type Prerequisite,
  type PrerequisiteRef,
  type SkillNode,
} from './types';

// ---------------------------------------------------------------------------
// Reading a rule
// ---------------------------------------------------------------------------
/** Every node id a rule mentions, at any depth, in the order it mentions them. */
export function ruleIds(rule: Prerequisite): string[] {
  const out: string[] = [];
  const walk = (ref: PrerequisiteRef) => {
    if (typeof ref === 'string') {
      out.push(ref);
      return;
    }
    if (ref.kind === 'none') return;
    ref.of.forEach(walk);
  };
  walk(rule);
  return out;
}

/**
 * Every id a rule mentions, with the group it belongs to.
 *
 * The generator needs more than the flat id list: it has to know that Matplotlib
 * and Plotly are two options on one choice and that Arrays is not optional at
 * all. A group is a position in the rule tree, so the ids under one ANY share a
 * `groupId` and carry that rule's `need` and `total`.
 *
 * `kind: 'all'` with `need === total === 1` is the ordinary case — one id that is
 * simply required — and every other combination is a choice of some kind. That
 * single test is what the rest of the system branches on, rather than on the
 * rule kind, which is what keeps a new rule kind from needing changes here.
 */
export interface RefGroup {
  id: string;
  /** Stable within one node's rule. Two ids sharing it are one choice. */
  groupId: string;
  kind: Prerequisite['kind'];
  need: number;
  total: number;
}

export function ruleGroups(rule: Prerequisite, path = 'r'): RefGroup[] {
  if (rule.kind === 'none') return [];

  const total = rule.of.length;
  const need = rule.kind === 'all' ? total : rule.kind === 'any' ? 1 : rule.need;

  return rule.of.flatMap((ref, index) => {
    const here = `${path}.${index}`;
    if (typeof ref !== 'string') return ruleGroups(ref, here);
    // Inside an ALL each option is its own group of one, so a plain required id
    // reads as need 1 of 1 rather than as one of five things all required.
    return rule.kind === 'all'
      ? [{ id: ref, groupId: here, kind: rule.kind, need: 1, total: 1 }]
      : [{ id: ref, groupId: path, kind: rule.kind, need, total }];
  });
}

/** Whether a group leaves any choice in it. The one test callers make. */
export const isChoice = (group: RefGroup): boolean => group.need < group.total;

export interface RuleResult {
  satisfied: boolean;
  /** How many of the rule's own options are met, and how many it wanted. */
  have: number;
  need: number;
  /** Ids that count as met, flattened. */
  met: string[];
  /** Ids still outstanding, flattened. Empty once satisfied. */
  missing: string[];
}

const merge = (results: RuleResult[]): { met: string[]; missing: string[] } => ({
  met: results.flatMap((entry) => entry.met),
  missing: results.flatMap((entry) => entry.missing),
});

type Evaluator = (rule: Prerequisite, has: (id: string) => boolean) => RuleResult;

/** One entry per rule kind. The only place a rule kind is named. */
const EVALUATORS: Record<Prerequisite['kind'], Evaluator> = {
  none: () => ({ satisfied: true, have: 0, need: 0, met: [], missing: [] }),

  all: (rule, has) => {
    const parts = 'of' in rule ? rule.of.map((ref) => evaluateRef(ref, has)) : [];
    const done = parts.filter((part) => part.satisfied).length;
    const { met, missing } = merge(parts);
    return {
      satisfied: done === parts.length,
      have: done,
      need: parts.length,
      met,
      missing: done === parts.length ? [] : missing,
    };
  },

  any: (rule, has) => {
    const parts = 'of' in rule ? rule.of.map((ref) => evaluateRef(ref, has)) : [];
    const done = parts.filter((part) => part.satisfied).length;
    const { met, missing } = merge(parts);
    return {
      satisfied: done >= 1,
      have: done,
      need: 1,
      met,
      // An unmet ANY is missing every option, because any one of them would do
      // and naming a particular one would be inventing a recommendation.
      missing: done >= 1 ? [] : missing,
    };
  },

  threshold: (rule, has) => {
    const parts = 'of' in rule ? rule.of.map((ref) => evaluateRef(ref, has)) : [];
    const wanted = rule.kind === 'threshold' ? rule.need : parts.length;
    const done = parts.filter((part) => part.satisfied).length;
    const { met, missing } = merge(parts);
    return {
      satisfied: done >= wanted,
      have: done,
      need: wanted,
      met,
      missing: done >= wanted ? [] : missing,
    };
  },
};

function evaluateRef(ref: PrerequisiteRef, has: (id: string) => boolean): RuleResult {
  if (typeof ref === 'string') {
    const held = has(ref);
    return {
      satisfied: held,
      have: held ? 1 : 0,
      need: 1,
      met: held ? [ref] : [],
      missing: held ? [] : [ref],
    };
  }
  return EVALUATORS[ref.kind](ref, has);
}

/** Whether a rule is satisfied by a set of held node ids, and by how much. */
export function evaluate(rule: Prerequisite, held: ReadonlySet<string>): RuleResult {
  return EVALUATORS[rule.kind](rule, (id) => held.has(id));
}

/**
 * The rule as a sentence, for a locked node's one line.
 *
 * Recursive so a nested rule reads as one clause — "Arrays, Sorting and either
 * Matplotlib or Plotly" — and takes a name lookup rather than ids, because
 * `algorithms.binary-search` in a sentence is a defect.
 */
export function describeRule(rule: Prerequisite, nameOf: (id: string) => string): string {
  const part = (ref: PrerequisiteRef): string =>
    typeof ref === 'string' ? nameOf(ref) : describeRule(ref, nameOf);

  if (rule.kind === 'none') return '';
  const names = rule.of.map(part).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;

  if (rule.kind === 'all') {
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  if (rule.kind === 'any') {
    return `either ${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
  }
  return `${rule.need} of ${names.length}: ${names.join(', ')}`;
}

// ---------------------------------------------------------------------------
// The graph
// ---------------------------------------------------------------------------
export interface GraphProblem {
  kind: 'duplicate-id' | 'unknown-prerequisite' | 'cycle' | 'self-prerequisite';
  node: string;
  detail: string;
}

export interface SkillLibraryGraph {
  /** Every node that survived validation, by id. */
  nodes: ReadonlyMap<string, SkillNode>;
  /** What a node needs, flattened and known to exist. */
  requires: ReadonlyMap<string, readonly string[]>;
  /** What names a node as a prerequisite — the derived `unlocks`. */
  unlocks: ReadonlyMap<string, readonly string[]>;
  problems: readonly GraphProblem[];
}

const EMPTY: readonly string[] = [];

/**
 * Index a set of nodes into a graph.
 *
 * Validation is three passes and each drops the smallest thing it can: a
 * duplicate id loses the later node, an unknown prerequisite loses that one
 * edge and keeps the node, a cycle loses the edge that closed it. A node is only
 * ever dropped for having an id something else already used, because that is the
 * one problem where keeping it means two different skills answer to one name.
 */
export function buildGraph(input: readonly SkillNode[]): SkillLibraryGraph {
  const problems: GraphProblem[] = [];
  const nodes = new Map<string, SkillNode>();

  for (const node of input) {
    if (nodes.has(node.id)) {
      problems.push({
        kind: 'duplicate-id',
        node: node.id,
        detail: `"${node.name}" reuses an id already held by "${nodes.get(node.id)!.name}"`,
      });
      continue;
    }
    nodes.set(node.id, node);
  }

  const requires = new Map<string, string[]>();
  for (const node of nodes.values()) {
    const wanted: string[] = [];
    for (const id of ruleIds(node.prerequisites)) {
      if (id === node.id) {
        problems.push({ kind: 'self-prerequisite', node: node.id, detail: 'requires itself' });
        continue;
      }
      if (!nodes.has(id)) {
        problems.push({
          kind: 'unknown-prerequisite',
          node: node.id,
          detail: `requires "${id}", which isn't in the library`,
        });
        continue;
      }
      if (!wanted.includes(id)) wanted.push(id);
    }
    requires.set(node.id, wanted);
  }

  // Break cycles. Depth-first, and the edge that closes a loop is the one that
  // goes — dropping the node instead would take out everything downstream of a
  // typo in one entry.
  const colour = new Map<string, 'grey' | 'black'>();
  const visit = (id: string, stack: string[]) => {
    if (colour.get(id) === 'black') return;
    colour.set(id, 'grey');
    const wanted = requires.get(id) ?? [];
    const keep: string[] = [];
    for (const next of wanted) {
      if (colour.get(next) === 'grey') {
        problems.push({
          kind: 'cycle',
          node: id,
          detail: `requires "${next}", which already leads back here via ${[...stack, id].join(' → ')}`,
        });
        continue;
      }
      keep.push(next);
      visit(next, [...stack, id]);
    }
    requires.set(id, keep);
    colour.set(id, 'black');
  };
  for (const id of nodes.keys()) visit(id, []);

  const unlocks = new Map<string, string[]>();
  for (const [id, wanted] of requires) {
    for (const dependency of wanted) {
      unlocks.set(dependency, [...(unlocks.get(dependency) ?? []), id]);
    }
  }

  return { nodes, requires, unlocks, problems };
}

/** What this node opens — the reverse edges, which is why it is not a field. */
export function unlockedBy(graph: SkillLibraryGraph, id: string): readonly string[] {
  return graph.unlocks.get(id) ?? EMPTY;
}

export function requirementsOf(graph: SkillLibraryGraph, id: string): readonly string[] {
  return graph.requires.get(id) ?? EMPTY;
}

/**
 * Everything a set of nodes depends on, however far back, including themselves.
 *
 * The generator's first move: given "Binary Search", this is the whole of what
 * has to be in the tree for Binary Search to be reachable. Options inside an ANY
 * are all included — the tree shows the choice rather than picking one for you,
 * and which of them is optional is worked out in skills/generate.
 */
export function ancestors(
  graph: SkillLibraryGraph,
  seeds: readonly string[],
): Set<string> {
  const out = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (out.has(id) || !graph.nodes.has(id)) continue;
    out.add(id);
    queue.push(...requirementsOf(graph, id));
  }
  return out;
}

/**
 * A safe order to take a set of nodes in.
 *
 * Kahn's, with the ready set kept sorted rather than taken in insertion order,
 * which is where "difficulty influences but never overrides" actually lives:
 * only nodes whose prerequisites are *already placed* can be chosen at all, and
 * difficulty decides between them. An Advanced node cannot jump its foundations
 * however early its tier sorts, because it is not in the ready set until they
 * are down.
 *
 * Nodes left over after the queue empties are inside a cycle the validator could
 * not reach — appended in difficulty order so the caller still gets all of them.
 */
export function topologicalOrder(
  graph: SkillLibraryGraph,
  within: ReadonlySet<string>,
): string[] {
  const remaining = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const id of within) {
    const wanted = requirementsOf(graph, id).filter((dependency) => within.has(dependency));
    remaining.set(id, wanted.length);
    for (const dependency of wanted) {
      dependents.set(dependency, [...(dependents.get(dependency) ?? []), id]);
    }
  }

  const weight = (id: string) => {
    const node = graph.nodes.get(id);
    return node ? difficultyRank(node.difficulty) : 99;
  };
  const order = (a: string, b: string) => weight(a) - weight(b) || a.localeCompare(b);

  const ready = [...remaining.entries()]
    .filter(([, count]) => count === 0)
    .map(([id]) => id)
    .sort(order);

  const out: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    out.push(id);
    remaining.delete(id);
    for (const next of dependents.get(id) ?? []) {
      const left = (remaining.get(next) ?? 0) - 1;
      remaining.set(next, left);
      if (left === 0) {
        ready.push(next);
        ready.sort(order);
      }
    }
  }

  const stranded = [...within].filter((id) => !out.includes(id)).sort(order);
  return [...out, ...stranded];
}

/**
 * How deep a node sits within a subgraph — its layer.
 *
 * The longest path from something with nothing above it, so a node sits below
 * *every* prerequisite rather than beside the shallowest of them. Same rule the
 * renderer's own layout uses, computed here as well because a consumer that is
 * not the Part 1 canvas still needs to know the shape.
 */
export function layers(
  graph: SkillLibraryGraph,
  within: ReadonlySet<string>,
): Map<string, number> {
  const depth = new Map<string, number>();
  for (const id of topologicalOrder(graph, within)) {
    const wanted = requirementsOf(graph, id).filter((dependency) => within.has(dependency));
    depth.set(
      id,
      wanted.length === 0 ? 0 : Math.max(...wanted.map((dependency) => (depth.get(dependency) ?? 0) + 1)),
    );
  }
  return depth;
}

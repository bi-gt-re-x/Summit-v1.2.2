/**
 * The tree generation engine.
 *
 * Takes a goal and produces a progression toward it out of the shared library.
 * Nothing it produces is stored, and nothing it produces is authoritative: a
 * generated tree says *how these skills appear in this person's path*, and the
 * library still says what a skill is and what it depends on. Regenerate with a
 * different goal and you get a different tree over the same nodes, which is the
 * property the whole architecture exists to have.
 *
 * ## The five passes
 *
 * **1. Closure.** From the goal's targets, walk prerequisites backwards through
 * every ref. That is the tree: everything the goal could possibly need, options
 * included. A tree that quietly picked Matplotlib over Plotly for you would be
 * presenting a decision as a fact, so both are drawn and the choice is labelled.
 *
 * **2. Which of them are optional.** A node is an *option* when some node in the
 * tree names it inside a choice — an ANY, or a 3-of-5 — and nothing else in the
 * tree requires it outright. Membership of a choice is not inherited: the five
 * routes into Dynamic Programming are options, and Functions, which three of them
 * happen to descend from, is required, because it is required outright elsewhere.
 * Cascading optionality down the ancestry was the first implementation and it
 * reported eleven of the twelve nodes in the chess tree as optional, which is
 * true of no reading anybody has of that tree.
 *
 * **3. Branches.** Nodes that hang *off* the required path and share the goal's
 * tags — the specialised and mastery branches. Ranked by tag overlap and how far
 * their difficulty sits from the goal's own centre of gravity, then taken until
 * the budget runs out. This is where a tree stops being a line.
 *
 * **4. Order and layer.** Topological, difficulty only breaking ties. An Advanced
 * node cannot precede its foundations however early its tier would sort, because
 * it is not eligible until they are placed — see `topologicalOrder` in
 * skills/graph, where that guarantee actually lives.
 *
 * **5. Status and connections.** Statuses come from evaluating each node's rule
 * against what the request says is held. With nothing held that is every root
 * `available` and everything else `locked`, which is true rather than a
 * placeholder. Real progression is Part 3's; this engine only ever reports what
 * the rules say about the inputs it was given.
 *
 * ## Personalisation is wired, not written
 *
 * `GenerationRequest` accepts the full set of inputs the personalised generator
 * will eventually want, and this version uses them in the simplest defensible
 * way — documented at each use, and each marked as the placeholder it is. The
 * point of accepting them now is that the *shape* of a request never changes
 * when the algorithm behind it gets serious.
 *
 * ## Where AI plugs in
 *
 * Three seams, none of which require this file to call anything. A model can add
 * ids to `targets` or `interests` and the engine builds the tree; it can mint a
 * node with `metadata.source: 'ai'` and the library indexes it like any other;
 * and it can read `notes` on the result to see what the engine decided and why.
 * The graph stays authoritative in all three, because a proposal that contradicts
 * a prerequisite still cannot be placed before it.
 */
import {
  ancestors,
  evaluate,
  isChoice,
  layers,
  requirementsOf,
  ruleGroups,
  topologicalOrder,
  type SkillLibraryGraph,
} from './graph';
import { goalById, type SkillGoal } from './goals';
import { difficultyRank, type Difficulty, type SkillCategory } from './types';

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------
export interface GenerationRequest {
  /** A goal id, or a goal object for one built on the fly. */
  goal: string | SkillGoal;
  /** Nodes finished. Drives status, and nothing else in this phase. */
  completedNodes?: readonly string[];
  /** Nodes the person says they already have without having finished them here. */
  currentSkills?: readonly string[];
  /** Tags they claim broadly — "I know some statistics". */
  existingKnowledge?: readonly string[];
  /** Bias for how hard the optional branches should be. */
  difficultyPreference?: Difficulty | null;
  /** Minutes a week. Caps how much optional material is drawn. */
  timeAvailable?: number;
  /** Tags to prefer when choosing branches. */
  interests?: readonly string[];
  /** Hard ceiling on tree size. */
  maxNodes?: number;
}

/** How many weeks of `timeAvailable` the optional branches may spend. */
const BUDGET_WEEKS = 12;

const DEFAULT_MAX_NODES = 60;

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
export type GeneratedStatus = 'locked' | 'available' | 'complete';

export type Relationship = 'requires' | 'any-of' | 'threshold';

export interface GeneratedNode {
  /** The library node's id. The same node, not a copy — see the rule in skills/types. */
  id: string;
  /**
   * Where it sits, abstractly: how deep, and where in that row.
   *
   * Deliberately not pixels. The renderer does its own layout from the same
   * prerequisites and is free to disagree about spacing; a consumer that is not
   * the canvas — a printed plan, an export, a model reading the tree — gets the
   * shape without having to redo the graph walk.
   */
  position: { layer: number; order: number };
  status: GeneratedStatus;
  /** Not required by the goal: an option on a choice, or a branch off the path. */
  optional: boolean;
  /** The choice this node is one option of, when it is one. */
  choice?: { groupId: string; need: number; total: number };
  /** Prerequisites, restricted to nodes that are in this tree. */
  prerequisites: string[];
  /** Why it is here. Reads as the engine's own audit trail. */
  reason: 'target' | 'required' | 'option' | 'branch';
}

export interface GeneratedConnection {
  source: string;
  target: string;
  relationship: Relationship;
}

export interface GeneratedTree {
  id: string;
  name: string;
  /** The goal id this was generated for. */
  goal: string;
  category: SkillCategory;
  generatedAt: string;
  nodes: GeneratedNode[];
  connections: GeneratedConnection[];
  /** What the engine decided and why. For debugging, and for the AI phase. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Pass 1 — what the goal actually requires
// ---------------------------------------------------------------------------
/**
 * Everything reachable backwards from the targets through *required* refs only.
 *
 * The difference from `ancestors` is the `isChoice` test: that one follows every
 * edge, which is right for "what belongs in the tree" and wrong for "what cannot
 * be skipped". Used to answer the second question only — a node reached here is
 * one the goal obliges you to do, whatever else names it.
 */
function requiredClosure(graph: SkillLibraryGraph, targets: readonly string[]): Set<string> {
  const out = new Set<string>();
  const queue = [...targets];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (out.has(id) || !graph.nodes.has(id)) continue;
    out.add(id);
    const node = graph.nodes.get(id)!;
    for (const group of ruleGroups(node.prerequisites)) {
      if (isChoice(group)) continue;
      if (graph.nodes.has(group.id)) queue.push(group.id);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pass 3 — branches
// ---------------------------------------------------------------------------
interface Candidate {
  id: string;
  score: number;
  minutes: number;
}

/**
 * Nodes hanging off the required path that the goal has a reason to want.
 *
 * Scored rather than filtered, because "relevant" is a matter of degree and a
 * hard tag test would either take everything adjacent or nothing. Overlap with
 * the goal's tags is worth most, the reader's own interests next, and difficulty
 * distance is a penalty so a Mastery node does not attach itself to a Foundation
 * tree just because it shares a word.
 *
 * Only nodes whose prerequisites are already satisfied *within the tree* are
 * eligible, so a branch can never introduce a dangling requirement.
 */
function branchesFor(
  graph: SkillLibraryGraph,
  inTree: ReadonlySet<string>,
  goal: SkillGoal,
  request: GenerationRequest,
): Candidate[] {
  const wanted = new Set([...(goal.tags ?? []), ...(request.interests ?? [])]);
  if (wanted.size === 0) return [];

  const interests = new Set(request.interests ?? []);
  const centre =
    [...inTree].reduce((sum, id) => sum + difficultyRank(graph.nodes.get(id)!.difficulty), 0) /
    Math.max(1, inTree.size);

  const out: Candidate[] = [];
  const seen = new Set<string>();

  for (const id of inTree) {
    for (const next of graph.unlocks.get(id) ?? []) {
      if (inTree.has(next) || seen.has(next)) continue;
      seen.add(next);
      const node = graph.nodes.get(next);
      if (!node) continue;

      // Everything it needs has to already be here. A branch that drags in three
      // more required nodes is not a branch, it is a second tree.
      const ready = requirementsOf(graph, next).every((dependency) => inTree.has(dependency));
      if (!ready) continue;

      const overlap = node.tags.filter((tag) => wanted.has(tag)).length;
      if (overlap === 0) continue;
      const mine = node.tags.filter((tag) => interests.has(tag)).length;

      let score = overlap * 3 + mine * 2 - Math.abs(difficultyRank(node.difficulty) - centre);

      // The difficulty preference is a nudge and never a filter: it moves a node
      // up or down the queue, so a preference can change which branches are drawn
      // without ever removing something the goal needs. Placeholder weighting —
      // the personalised generator will want something less blunt.
      if (request.difficultyPreference) {
        score -= Math.abs(
          difficultyRank(node.difficulty) - difficultyRank(request.difficultyPreference),
        );
      }

      out.push({
        id: next,
        score,
        minutes: (node.estimatedTime.minMinutes + node.estimatedTime.maxMinutes) / 2,
      });
    }
  }

  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------
export function generateTree(
  graph: SkillLibraryGraph,
  request: GenerationRequest,
): GeneratedTree | null {
  const goal = typeof request.goal === 'string' ? goalById(request.goal) : request.goal;
  if (!goal) return null;

  const notes: string[] = [];
  const targets = goal.targets.filter((id) => graph.nodes.has(id));
  if (targets.length === 0) {
    notes.push("None of this goal's targets are in the library.");
    return {
      id: `tree.${goal.id}`,
      name: goal.name,
      goal: goal.id,
      category: goal.category,
      generatedAt: new Date().toISOString(),
      nodes: [],
      connections: [],
      notes,
    };
  }

  // ---- 1. closure -------------------------------------------------------
  const core = ancestors(graph, targets);
  const inTree = new Set(core);

  // ---- 2. which of them cannot be skipped -------------------------------
  const required = requiredClosure(graph, targets);
  notes.push(
    `${core.size} nodes lead to the goal's ${targets.length} target(s); ${required.size} of them can't be skipped.`,
  );

  for (const id of goal.optional ?? []) {
    if (!graph.nodes.has(id)) continue;
    // Named optional nodes bring their own requirements, or they would sit in the
    // tree unreachable.
    for (const dependency of ancestors(graph, [id])) inTree.add(dependency);
  }

  // ---- 3. branches ------------------------------------------------------
  const maxNodes = request.maxNodes ?? DEFAULT_MAX_NODES;
  // A week's minutes over a quarter. Absent, the budget is not the constraint and
  // `maxNodes` is. Placeholder: real scheduling belongs with real progress data.
  let budget = request.timeAvailable ? request.timeAvailable * BUDGET_WEEKS : Infinity;
  let added = 0;

  // Two rounds, so a branch can hang off a branch — which is how a specialised
  // path gets any depth — without the unbounded walk that would pull in the
  // whole library.
  for (let round = 0; round < 2; round += 1) {
    for (const candidate of branchesFor(graph, inTree, goal, request)) {
      if (inTree.size >= maxNodes || candidate.minutes > budget) break;
      inTree.add(candidate.id);
      budget -= candidate.minutes;
      added += 1;
    }
  }
  if (added > 0) notes.push(`${added} optional branches drawn from the goal's tags.`);
  if (inTree.size >= maxNodes) notes.push(`Capped at ${maxNodes} nodes.`);

  // ---- what the reader already has --------------------------------------
  const held = new Set<string>([
    ...(request.completedNodes ?? []),
    ...(request.currentSkills ?? []),
  ]);
  // Placeholder rule for claimed knowledge: a broad claim counts for the easy
  // nodes carrying that tag and never for the hard ones, because "I know some
  // statistics" is not a claim about `math.statistics` at Advanced. The real
  // version of this is an assessment, and it is not this phase's.
  const knowledge = new Set(request.existingKnowledge ?? []);
  if (knowledge.size > 0) {
    for (const id of inTree) {
      const node = graph.nodes.get(id)!;
      if (difficultyRank(node.difficulty) > difficultyRank('beginner')) continue;
      if (node.tags.some((tag) => knowledge.has(tag))) held.add(id);
    }
  }
  const heldHere = [...inTree].filter((id) => held.has(id)).length;
  if (heldHere > 0) notes.push(`${heldHere} of them are already held.`);

  // ---- 4. order and layer ------------------------------------------------
  const order = topologicalOrder(graph, inTree);
  const depth = layers(graph, inTree);
  const rowCount = new Map<number, number>();

  // ---- 5. nodes and connections -----------------------------------------
  const targetSet = new Set(targets);

  // Every id some in-tree node names inside a choice. Computed over the finished
  // tree rather than during the walk, because a node's choice membership is a
  // fact about its dependants and the branch pass can add one.
  const choiceMembers = new Set<string>();
  for (const id of inTree) {
    for (const group of ruleGroups(graph.nodes.get(id)!.prerequisites)) {
      if (isChoice(group) && inTree.has(group.id)) choiceMembers.add(group.id);
    }
  }

  const nodes: GeneratedNode[] = [];
  const connections: GeneratedConnection[] = [];

  for (const id of order) {
    const node = graph.nodes.get(id)!;
    const layer = depth.get(id) ?? 0;
    const row = rowCount.get(layer) ?? 0;
    rowCount.set(layer, row + 1);

    const groups = ruleGroups(node.prerequisites).filter((group) => inTree.has(group.id));
    const inside = requirementsOf(graph, id).filter((dependency) => inTree.has(dependency));

    for (const group of groups) {
      connections.push({
        source: group.id,
        target: id,
        relationship:
          group.kind === 'any' ? 'any-of' : group.kind === 'threshold' ? 'threshold' : 'requires',
      });
    }

    // Four reasons, and `optional` is two of them. The order of the tests is the
    // rule: being required outright beats being named inside somebody's choice,
    // so a node that is both — Recursion is one of Dynamic Programming's five
    // routes *and* a hard requirement of Trees — reads as required, which is what
    // it is.
    const reason: GeneratedNode['reason'] = targetSet.has(id)
      ? 'target'
      : required.has(id)
        ? 'required'
        : !core.has(id)
          ? 'branch'
          : choiceMembers.has(id)
            ? 'option'
            : 'required';

    const result = evaluate(node.prerequisites, held);
    nodes.push({
      id,
      position: { layer, order: row },
      status: held.has(id) ? 'complete' : result.satisfied ? 'available' : 'locked',
      optional: reason === 'option' || reason === 'branch',
      prerequisites: inside,
      reason,
    });
  }

  // Which choice each option belongs to, read off the nodes that name it. Done
  // here rather than in the loop above because a node's choice group is a fact
  // about its *dependants*, and the dependant may be ordered after it.
  const byId = new Map(nodes.map((entry) => [entry.id, entry]));
  for (const id of order) {
    for (const group of ruleGroups(graph.nodes.get(id)!.prerequisites)) {
      if (!isChoice(group)) continue;
      const option = byId.get(group.id);
      if (!option || option.choice) continue;
      option.choice = { groupId: `${id}:${group.groupId}`, need: group.need, total: group.total };
    }
  }

  return {
    id: `tree.${goal.id}`,
    name: goal.name,
    goal: goal.id,
    category: goal.category,
    generatedAt: new Date().toISOString(),
    nodes,
    connections,
    notes,
  };
}

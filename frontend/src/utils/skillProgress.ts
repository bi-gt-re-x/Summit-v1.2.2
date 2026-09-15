/**
 * What the reader has actually put into a lattice node — the practising half of
 * the skill tree.
 *
 * ## Why this is in the browser and not in the database
 *
 * There is no table for it. Every other number on this page comes from
 * somewhere real — XP from finished tasks, streaks from the days they were
 * finished on — and a lattice node is not any of those things yet. Inventing a
 * `skill_progress` table to hold it would be inventing the schema for a feature
 * whose rules are not settled, so this follows the calendar's precedent
 * instead: the browser's own store, under a user-scoped key, read and written
 * in exactly one file. Where the backend grows an endpoint for it, this module
 * is the only thing that has to change — nothing above it knows where the
 * numbers came from.
 *
 * The reading and writing is `skillStore` in utils/skillStore, which owns the
 * scoping, the envelope and the versioning for all four of the skill tree's
 * stores. What is left here is the two things only this store knows: what a
 * valid entry looks like, and what to do with an id the trees no longer name.
 *
 * ## The shape
 *
 * `{ [nodeId]: xpEarned }`, and nothing else. Not percentages: XP is the
 * quantity the panel prints and the one a session adds to, and a percentage
 * stored beside a total is two numbers that can disagree. Node ids are unique
 * across every tree, so one map covers the whole hierarchy.
 *
 * ## What is stored is only what was *added*
 *
 * The designed trees in skills/subjectTrees already describe a starting
 * position — Variables mastered, Loops three-quarters done. That seed stays in
 * the data where it can be edited; this store holds the practice done on top of
 * it, and {@link applyProgress} adds the two together. So a reader who has
 * practised nothing has an empty store rather than a copy of the seed, and
 * editing the seed later does not have to reconcile with what a browser saved.
 */
import { keepKnownNodes, treeRevision } from '@/skills/subjectTrees';
import type { GraphNode, NodeStatus, SkillGraph } from './skillGraph';
import { skillStore } from './skillStore';
import { planPercent, type StepPlans } from './skillSteps';

/** Node id → XP added by practising, on top of whatever the tree seeded. */
export type SkillProgress = Record<string, number>;

const progressStore = skillStore<SkillProgress>({
  key: 'skillTreeProgress',
  version: 1,
  empty: {},
  revision: treeRevision,
  // The pre-envelope document was this exact shape, so it comes forward whole.
  // See the note on version 0 in utils/skillStore.
  migrate: (from, raw) => (from === 0 ? raw : undefined),
  validate: (raw) => {
    if (!raw || typeof raw !== 'object') return {};
    // Anything that is not a number is dropped rather than trusted: this is a
    // store a person can edit by hand, and one bad value should cost one node
    // rather than the whole tree.
    const clean: SkillProgress = {};
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) clean[id] = value;
    }
    return clean;
  },
  onRevision: keepKnownNodes,
});

export function loadProgress(username: string | null): SkillProgress {
  return progressStore.load(username);
}

export function saveProgress(username: string | null, progress: SkillProgress): void {
  progressStore.save(username, progress);
}

/**
 * How much one session of practice is worth on a given node.
 *
 * A share of the node's own total rather than a flat figure, so ten sessions
 * carry anything from a foundation to a capstone — and a floor, so a cheap node
 * still moves visibly. The number is here rather than in the component because
 * it is a rule about progression, not about a button.
 */
export function practiceGain(node: GraphNode): number {
  return Math.max(50, Math.round(node.need * 0.1));
}

/**
 * The graph with practice applied: XP added, percentages recomputed, and every
 * status re-derived from the result.
 *
 * ## Unlocking
 *
 * A node is open if the tree seeded it open **or** everything it requires is
 * now complete. The `or` is what makes both halves work: the designed starting
 * position survives — several nodes are drawn available above prerequisites
 * that are only part-done, which is the picture the trees were written to show
 * — and finishing a prerequisite still opens what sits under it, which is the
 * whole point of practising. Deriving purely from prerequisites would relock
 * half of every tree the moment this ran; ignoring them would mean nothing ever
 * opened.
 *
 * `recommends` is deliberately not consulted. A suggestion that gated a node
 * would be a prerequisite wearing a dashed line.
 *
 * Prerequisites are resolved in the order the layout already guarantees — a
 * node's requirements sit above it — but the pass does not depend on that: it
 * repeats until nothing changes, so a chain of unlocks opens in one call rather
 * than one node per render.
 *
 * ## Nodes whose programme the reader has written
 *
 * A node in `plans` is counted in steps rather than in XP: the reader has said
 * what its programme is, so how far through that programme they are *is* how
 * far along they are. XP is then back-filled from the percentage rather than
 * the other way round, so the reward line under the bar still adds up and
 * nothing downstream needs to know which of the two kinds of node it is
 * looking at. This is the only place the two models meet — see utils/skillSteps
 * for why the step count is the record and the percentage the derived thing.
 */
export function applyProgress(
  graph: SkillGraph,
  progress: SkillProgress,
  plans: StepPlans = {},
): SkillGraph {
  const seededOpen = new Set(
    graph.nodes.filter((node) => node.status !== 'locked').map((node) => node.id),
  );

  const earned = new Map<string, number>();
  for (const node of graph.nodes) {
    const plan = plans[node.id];
    if (plan) {
      earned.set(node.id, Math.round((node.need * planPercent(plan)) / 100));
      continue;
    }
    const added = progress[node.id] ?? 0;
    earned.set(node.id, Math.min(node.need, node.have + added));
  }

  /*
   * Finished, by either route.
   *
   * Practising a node to its full XP finishes it — that is the half that has to
   * work. But a tree is also allowed to *say* a node is finished at less than
   * 100%, and several do: mastery is a judgement about a skill, and the last
   * tenth of a bar is often polish rather than the thing itself. Deriving
   * completion from the bar alone would quietly demote every one of those on
   * first render, which is a redesign of the trees rather than a reading of
   * them. So a seeded `complete` stays complete, and XP is the other way in.
   */
  const complete = new Set(
    graph.nodes.filter((node) => node.status === 'complete').map((node) => node.id),
  );
  for (const node of graph.nodes) {
    const plan = plans[node.id];
    // A written programme decides its own node both ways: every step done
    // finishes it even where the tree seeded it short, and a step still to do
    // means it is not finished however the tree was drawn.
    if (plan) {
      if (planPercent(plan) >= 100) complete.add(node.id);
      else complete.delete(node.id);
      continue;
    }
    if (node.need > 0 && (earned.get(node.id) ?? 0) >= node.need) complete.add(node.id);
  }

  // Open what the finished nodes have opened, then see whether that finished
  // anything else's requirements, until the set stops growing.
  const open = new Set(seededOpen);
  for (let pass = 0; pass < graph.nodes.length; pass += 1) {
    let grew = false;
    for (const node of graph.nodes) {
      if (open.has(node.id)) continue;
      const gates = node.requires.filter((id) => graph.nodes.some((entry) => entry.id === id));
      if (gates.length > 0 && gates.every((id) => complete.has(id))) {
        open.add(node.id);
        grew = true;
      }
    }
    if (!grew) break;
  }

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const have = earned.get(node.id) ?? 0;
      const plan = plans[node.id];
      const percent = plan
        ? planPercent(plan)
        : node.need > 0
          ? Math.round((have / node.need) * 100)
          : node.percent;

      let status: NodeStatus;
      if (complete.has(node.id)) status = 'complete';
      else if (!open.has(node.id)) status = 'locked';
      else if (have > 0) status = 'progress';
      else status = 'available';

      return { ...node, have, percent, status };
    }),
  };
}

/**
 * Subject trees — one talent lattice per subject, and the links between them.
 *
 * ## What this is, and what it is not
 *
 * This is a *designed* hierarchy, not a reading of the account's record. It
 * answers "what is the shape of the subject, and where does one part of it hand
 * off to another."
 *
 * There was a second kind, task-derived, in utils/skillTree — "how far into
 * this subject have you actually gone". The two were meant to live side by
 * side, the way the Records page keeps what you logged apart from what Summit
 * counted. Nothing ever rendered the task-derived one, so it has been deleted
 * and this is the only kind. The distinction is still worth knowing: what is
 * here is authored, and none of it is evidence about the reader.
 *
 * ## Where the data is
 *
 * In skills/trees, one file per subject, collected by skills/trees/index. This
 * file is the catalogue and the conversion to the renderer's model: what the
 * trees *are* lives next door, and everything here is derived from it. The split
 * happened when the data outgrew a file — fifty-five lattices of authored
 * description is not something anybody reviews as one document.
 *
 * ## Navigation nodes
 *
 * A subject like Coding does not fit on one lattice. Its foundations do, but the
 * moment it forks into web development, algorithms and systems, each fork is a
 * whole tree of its own. Cramming all three onto one canvas gives a wall no one
 * can read; drawing only the foundations loses the forks entirely.
 *
 * So a fork is a single **navigation node** — `navTo` names the child tree it
 * opens. Clicking it is not selecting a skill, it is walking into that subject.
 * The child names its `parent`, so the walk has a way back, and a tree can be
 * both a child of one subject and hold navigation nodes of its own: the
 * hierarchy is arbitrarily deep, and the page draws whichever level you are on.
 *
 * A navigation node is a leaf on purpose. Nothing requires one, because a
 * doorway cannot be completed, and a node gated behind something uncompletable
 * would be a node nobody can ever reach.
 *
 * ## Required, and merely recommended
 *
 * `requires` gates a node and decides where it sits — it is the prerequisite,
 * drawn solid. `recommends` is a suggestion, drawn dashed, and is kept out of
 * the ranking on purpose: the moment a suggestion moved a node down the canvas
 * it would be a rule wearing a dashed line.
 *
 * ## States are illustrative for now
 *
 * `state`, `percent` and `xpDone` are written into the data rather than derived,
 * because nothing in the account is wired to spend a point on a lattice node
 * yet — that is a later part, and when it lands it replaces these literals with
 * a reading of real progress. Until then they are a plausible walk down each
 * tree, which is what makes the lit-versus-locked drawing worth looking at.
 *
 * Icons name a file in utils/icons/tree_icons (served at
 * `/static/icons/tree_icons`), without the extension. Anything missing falls
 * back to `core-skill` — and scripts/check_trees.mjs fails if any tree is relying
 * on that fallback.
 */
import type { NodeStatus, SkillGraph } from '@/utils/skillGraph';
import { DEFAULT_TREE, TREES } from './trees';
import type { SubjectNode, SubjectTree } from './trees/types';

export type { SubjectNode, SubjectTree };
export { DEFAULT_TREE };

/** Every lattice, in catalogue order. */
export const SUBJECT_TREES: readonly SubjectTree[] = TREES;

const BY_ID = new Map(SUBJECT_TREES.map((tree) => [tree.id, tree]));

export function subjectTreeById(id: string): SubjectTree | null {
  return BY_ID.get(id) ?? null;
}

/** The top-level subjects — the ones the switcher across the page offers. */
export const ROOT_SUBJECTS: readonly SubjectTree[] = SUBJECT_TREES.filter((tree) => !tree.parent);

/** The trees that branch off this one — the other end of `parent`. */
export function childrenOf(id: string): SubjectTree[] {
  return SUBJECT_TREES.filter((tree) => tree.parent === id);
}

/** The tree this one branched off, if it is not a root. */
export function parentOf(id: string): SubjectTree | null {
  const tree = BY_ID.get(id);
  return tree?.parent ? BY_ID.get(tree.parent) ?? null : null;
}

/**
 * Every tree that branches off the same parent as this one — its siblings,
 * itself excluded. Web Development, Algorithms and Systems are each other's.
 */
export function siblingsOf(id: string): SubjectTree[] {
  const tree = BY_ID.get(id);
  if (!tree?.parent) return [];
  return SUBJECT_TREES.filter((entry) => entry.parent === tree.parent && entry.id !== id);
}

/**
 * The chain from a root down to this tree, in reading order, so the header can
 * draw it as a breadcrumb. `[Coding, Web Development]` for the web tree.
 */
export function parentChain(id: string): SubjectTree[] {
  const chain: SubjectTree[] = [];
  let current = BY_ID.get(id);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parent ? BY_ID.get(current.parent) : undefined;
  }
  return chain;
}

/**
 * Which of the catalogue's nine groups a tree belongs to.
 *
 * `group` is stated on roots only — a child tree is inside whatever group its
 * root is in — so this walks up to the root rather than reading the field, and
 * answers for Calculus ("Maths and science") as readily as for Mathematics.
 *
 * It exists because how a subject is *practised* follows the group and almost
 * nothing else: reading a proof, running a set of squats and cutting a draft
 * are three different verbs, and advice general enough to cover all three says
 * nothing about any of them. See skills/improve.
 */
export function groupOf(id: string): string {
  return parentChain(id)[0]?.group ?? '';
}

// ---------------------------------------------------------------------------
// To the renderer's shape
// ---------------------------------------------------------------------------
/** What a state implies about progress, where a node did not say. */
const IMPLIED: Record<NodeStatus, number> = {
  complete: 100,
  progress: 50,
  available: 0,
  locked: 0,
};

export const ICON_BASE = '/static/icons/tree_icons';

/** The URL for a node's drawing, falling back to the generic one. */
export function iconUrl(icon: string | undefined): string {
  return `${ICON_BASE}/${icon || 'core-skill'}.svg`;
}

/**
 * One subject tree as the graph the canvas draws.
 *
 * The one place the designed shape above meets the generic model — everything
 * downstream of here is the renderer's vocabulary rather than this file's.
 */
export function graphFromSubjectTree(tree: SubjectTree): SkillGraph {
  return {
    id: tree.id,
    name: tree.title,
    nodes: tree.nodes.map((node) => {
      const status = node.state ?? 'locked';
      const percent = node.percent ?? IMPLIED[status];
      const xp = node.xp ?? 0;
      return {
        id: node.id,
        name: node.name,
        blurb: node.desc,
        category: tree.title,
        difficulty: node.tier,
        status,
        percent,
        xp,
        // The reward line reads "earned / worth", so a node states both. Where
        // it states only the total, the share earned is what the bar is already
        // showing rather than a second number that could disagree with it.
        have: node.xpDone ?? Math.round((xp * percent) / 100),
        need: xp,
        unit: 'XP',
        on: '',
        requires: node.requires ?? [],
        recommends: node.recommends ?? [],
        gate: '',
        icon: node.icon,
        tags: node.core ? ['Core Skill'] : undefined,
      };
    }),
  };
}

/** The navigation targets on a tree, node id → child tree id. */
export function navTargets(tree: SubjectTree): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of tree.nodes) if (node.navTo) map.set(node.id, node.navTo);
  return map;
}

// --------------------------------------------------------------------------
// What the authored content currently is
// --------------------------------------------------------------------------
/**
 * Every node id on every tree, built once.
 *
 * Ids are unique across the whole hierarchy — that is the property
 * utils/skillProgress relies on to cover sixty-two trees with one map — so this
 * is the complete answer to "does this id still name a skill".
 */
let ids: Set<string> | null = null;

export function knownNodeIds(): ReadonlySet<string> {
  if (!ids) ids = new Set(TREES.flatMap((tree) => tree.nodes.map((node) => node.id)));
  return ids;
}

/**
 * A fingerprint of the authored content, so a browser store can tell whether
 * the trees have moved under it.
 *
 * Derived rather than declared. A hand-maintained `TREE_REVISION = '2026-09'`
 * is a constant somebody has to remember to bump in the same commit that edits
 * a tree, and the failure when they forget is the one this whole mechanism
 * exists to prevent — so it is computed from the thing it is a fingerprint of
 * and cannot be forgotten.
 *
 * Over the ids alone, not the titles or the descriptions: this is asked
 * whenever a store is read, and rewording a node's `desc` should not cost
 * every account on the machine a rewrite of its progress. What it has to catch
 * is a node appearing or disappearing, which is exactly what the ids say.
 *
 * FNV-1a, which is not a cryptographic hash and does not need to be — the
 * question is "same or different", and the cost of a collision is one prune
 * that does not run.
 */
let revision: string | null = null;

export function treeRevision(): string {
  if (revision !== null) return revision;
  let hash = 0x811c9dc5;
  for (const tree of TREES) {
    for (const node of tree.nodes) {
      for (let at = 0; at < node.id.length; at += 1) {
        hash ^= node.id.charCodeAt(at);
        hash = Math.imul(hash, 0x01000193);
      }
      // A separator, or `ab` + `c` and `a` + `bc` fingerprint the same.
      hash ^= 0x2f;
      hash = Math.imul(hash, 0x01000193);
    }
  }
  revision = (hash >>> 0).toString(16);
  return revision;
}

/**
 * A node-keyed store with the ids no tree names any more taken out.
 *
 * What the three browser stores do when {@link treeRevision} moves. A retired
 * id left in place is inert today — nothing looks it up, because the graph it
 * would be looked up against no longer holds it — and is a hazard tomorrow:
 * ids are short and meaningful (`m.algebra`, `c.vars`), so one retired and
 * later reused for a different skill would land somebody's practice on a node
 * they have never opened.
 */
export function keepKnownNodes<T>(record: Record<string, T>): Record<string, T> {
  const known = knownNodeIds();
  const kept: Record<string, T> = {};
  for (const [id, value] of Object.entries(record)) {
    if (known.has(id)) kept[id] = value;
  }
  return kept;
}

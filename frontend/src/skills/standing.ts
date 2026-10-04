/**
 * How far into each skill tree an account's own work has actually got.
 *
 * ## The measure, and the one it is not
 *
 * A lattice node carries a `state` and a `percent`. Neither is evidence about
 * anybody: they are authored illustration, identical on every account — the
 * note at the top of skills/subjectTrees.ts says so, and says why. Reading them
 * back as "your progress" would be the fiction that page was careful not to be.
 *
 * What varies per account is the XP it has filed under the subjects that route
 * to a tree. So a tree's standing is the reader's own XP in it against what
 * the lattice is worth, and every figure below is a re-reading of the task
 * rows — which is the same rule the rest of the analytics page follows.
 *
 * ## The same arithmetic runs on the server
 *
 * `_tree_standing` in backend/api/achievements.py computes this to award the
 * Mastery badges, because a badge has to be counted somewhere the client
 * cannot edit. The two share the routing table by construction — the server's
 * copy is generated from `SUBJECT_TARGETS` below it by scripts/gen_tree_map.mjs
 * — and share a worked example, pinned in skills/standing.test.ts here and in
 * tests/test_skill_tree_badges.py there, so the page and the badge cannot come
 * to different conclusions about the same account.
 *
 * ## Capped at 100
 *
 * A subject can be worked well past what its lattice covers; a serious
 * mathematician's record is several times the Mathematics tree. Uncapped, the
 * bar would run off the end and "halfway into three trees" would be reachable
 * by grinding one. Covering a tree is covering it.
 */
import { SUBJECT_TARGETS } from './subjectMap';
import { SUBJECT_TREES } from './subjectTrees';

/** One tree, and where this account's work has got to in it. */
export interface TreeStanding {
  /** The tree id, e.g. `machine-learning`. */
  id: string;
  /** Its title, e.g. "Machine Learning". */
  title: string;
  /** The account's XP in the subjects that route here. */
  xp: number;
  /** What the lattice is worth in full — the sum of its holdable nodes. */
  worth: number;
  /** `xp` against `worth`, 0-100. */
  percent: number;
  /** The subject ids that fed it, most XP first. */
  subjects: string[];
}

/**
 * What each tree is worth: the sum of its nodes' XP, skipping navigation nodes.
 *
 * A doorway into a child tree is not a skill somebody holds, and counting its
 * worth would charge the reader twice for the tree behind it.
 */
const WORTH = new Map(SUBJECT_TREES.map((tree) => [
  tree.id,
  {
    title: tree.title,
    worth: tree.nodes.reduce(
      (sum, node) => sum + (node.navTo ? 0 : node.xp ?? 0), 0,
    ),
  },
]));

/**
 * Every tree this account has reached, deepest first.
 *
 * Subjects with no route are dropped rather than guessed at. `treeForSubject`
 * would fall back to the subject's group, which is the right answer for a rail
 * that has to put every subject somewhere and the wrong one here: it would
 * show a reader progress in a lattice they have never opened because a subject
 * they invented happened to land in Computing.
 */
export function treeStanding(
  rows: readonly { key: string; xp: number }[],
): TreeStanding[] {
  const earned = new Map<string, { xp: number; subjects: { key: string; xp: number }[] }>();

  for (const row of rows) {
    const tree = SUBJECT_TARGETS[row.key]?.tree;
    if (!tree || row.xp <= 0) continue;
    const entry = earned.get(tree) ?? { xp: 0, subjects: [] };
    entry.xp += row.xp;
    entry.subjects.push({ key: row.key, xp: row.xp });
    earned.set(tree, entry);
  }

  const out: TreeStanding[] = [];
  for (const [id, entry] of earned) {
    const known = WORTH.get(id);
    if (!known || known.worth <= 0) continue;
    out.push({
      id,
      title: known.title,
      xp: Math.round(entry.xp),
      worth: known.worth,
      percent: Math.min(100, Math.round((entry.xp / known.worth) * 100)),
      subjects: entry.subjects
        .sort((a, b) => b.xp - a.xp)
        .map((subject) => subject.key),
    });
  }
  // Deepest first, and by XP where two trees are at the same percent — a tie
  // on a rounded figure should not reorder itself between renders.
  return out.sort((a, b) => b.percent - a.percent || b.xp - a.xp);
}

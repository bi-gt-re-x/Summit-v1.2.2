/**
 * What there is to learn in a subject, and how much of it you have touched.
 *
 * ## Two kinds of fact, and they must not be mixed
 *
 * The skill trees in skills/trees are **authored**. Somebody wrote every node,
 * every prerequisite and every `state`, and that file's own note says the
 * states are illustrative. So a node marked `done` in the seed is not evidence
 * that this reader has done anything, and reporting it as progress would be
 * printing a designer's guess as somebody's record — the exact thing the
 * subject page exists not to do.
 *
 * What *is* the reader's own is `utils/skillProgress`: the store their
 * practice clicks write to. That is a real record of a real action, kept per
 * account, and it is the only number here that describes the person.
 *
 * So this returns the two separately and names them as what they are:
 *
 *   `nodes`, `branches`, `core`, `categories`  — the shape of the curriculum
 *   `practised`                                — what the reader has done
 *
 * Nothing here computes a percentage across the two. "You are 12% through
 * Mathematics" would need the seed's states to mean something about the
 * reader, and they do not.
 *
 * ## Why it is shared
 *
 * Two surfaces read it — the Subjects tab of the analytics page, which lists
 * every subject worked in the window, and the subject page itself, which goes
 * deeper on one. Written twice they would drift, and the first thing to drift
 * would be the distinction above.
 */
import { treeForSubject } from '@/skills/subjectMap';
import { childrenOf, parentChain, subjectTreeById } from '@/skills/subjectTrees';
import type { SkillProgress } from '@/utils/skillProgress';

export interface LatticeBranch {
  id: string;
  title: string;
  /** How many skills are on it. */
  nodes: number;
}

export interface Lattice {
  id: string;
  title: string;
  blurb: string;
  /** Root first, this tree last. One entry when the tree is a root. */
  path: Array<{ id: string; title: string }>;
  /** The trees this one forks into, if any. */
  branches: LatticeBranch[];
  /** Skills on this tree. A fact about the curriculum. */
  nodes: number;
  /** Of those, the ones marked as core. Also a fact about the curriculum. */
  core: number;
  /**
   * Skills on this tree the reader has practised at least once.
   *
   * The one figure here that is about the reader. Read from the practice
   * store, which is per-account and written only by their own clicks.
   */
  practised: number;
  /** Whether this is a branch the reader chose, or the subject's own root. */
  chosen: boolean;
}

/**
 * The lattice a subject opens on, and what the reader has touched of it.
 *
 * `depth` is the branch named in `analytics_subject_depth`, when there is one.
 * A branch that no longer resolves falls back to the subject's own root — the
 * same degradation the rail makes for a deleted subject, and for the same
 * reason: a shorter answer beats a broken one.
 */
export function latticeFor(
  subjectId: string,
  group: string | undefined,
  depth: string | undefined,
  progress: SkillProgress,
): Lattice | null {
  const chosenTree = depth ? subjectTreeById(depth) : null;
  const tree = chosenTree ?? subjectTreeById(treeForSubject(subjectId, group).tree);
  if (!tree) return null;

  const branches = childrenOf(tree.id).map((child) => ({
    id: child.id,
    title: child.title,
    nodes: child.nodes.length,
  }));

  return {
    id: tree.id,
    title: tree.title,
    blurb: tree.blurb,
    /* `parentChain` already ends with this tree — it unshifts the current one
       before walking up — so a root returns a single-entry chain and this
       reads as a breadcrumb either way. Appending `tree` here would print the
       leaf twice. */
    path: parentChain(tree.id).map((entry) => ({ id: entry.id, title: entry.title })),
    branches,
    nodes: tree.nodes.length,
    core: tree.nodes.filter((node) => node.core).length,
    practised: tree.nodes.filter((node) => (progress[node.id] ?? 0) > 0).length,
    chosen: Boolean(chosenTree),
  };
}

// ---------------------------------------------------------------------------
// What the standing in the tree actually says
// ---------------------------------------------------------------------------
/**
 * A short reading of where the reader stands in this subject's curriculum.
 *
 * ## Why this is three sentences and not a panel of figures
 *
 * The tree panel draws the numbers already — a percentage, an XP total, a
 * count of skills and branches. What it never did was say what any of it
 * meant, so a reader saw "12% of this tree" and had nothing to do with it.
 *
 * ## The line this must not cross
 *
 * The tree is **authored**. Every node and every seeded state was written by
 * hand and is identical for every account, so nothing here may read a node's
 * state back as the reader's ability — the rule this whole file exists to
 * hold, stated at the top.
 *
 * Two figures are the reader's own and they are the only two this reads from:
 * `practised`, which their own clicks wrote, and the XP standing, which is
 * counted off their finished work. Everything else in a sentence below is a
 * fact about the size or shape of the curriculum, and is phrased as one.
 *
 * So there is no "you are 12% masterful". There is "you have touched six of
 * forty-two skills on this branch", which is a true sentence about a person,
 * and "this branch forks into four others", which is a true sentence about a
 * tree.
 */
export interface TreeReading {
  /** Where they stand, as a sentence. Always present. */
  standing: string;
  /** What they have touched of it. Empty when the store has nothing. */
  touched: string;
  /** What the tree holds, and where this branch sits in it. */
  shape: string;
  /** What to do with all that, when the figures support saying anything. */
  next: string;
}

/** Under this share of a tree's XP, the reader is at the start of it. */
const EARLY = 15;
/** Over this share, the tree is mostly behind them. */
const LATE = 70;

export function treeReading(
  lattice: Lattice,
  standing: { percent: number; xp: number; worth: number; title: string } | null,
): TreeReading {
  const untouched = Math.max(0, lattice.nodes - lattice.practised);

  const standingLine = standing
    ? standing.percent >= LATE
      ? `You hold ${standing.percent}% of the XP that opens ${standing.title}. `
        + 'Most of this tree is behind you.'
      : standing.percent <= EARLY
        ? `You hold ${standing.percent}% of the XP that opens ${standing.title}. `
          + 'This is the start of it.'
        : `You hold ${standing.percent}% of the XP that opens ${standing.title}.`
    : `Nothing finished here has counted towards ${lattice.title} yet.`;

  const touched = lattice.practised > 0
    ? `You have practised ${lattice.practised} of its ${lattice.nodes} skills`
      + `${untouched > 0 ? `, and not opened ${untouched}` : ''}.`
    : '';

  const shape = lattice.branches.length > 0
    ? `${lattice.title} holds ${lattice.nodes} skills, ${lattice.core} of them core, `
      + `and forks into ${lattice.branches.length} branches.`
    : `${lattice.title} holds ${lattice.nodes} skills, ${lattice.core} of them core.`;

  /* The only line here that tells anybody to do anything, and it is careful:
     the tree cannot say what the reader is good at, so the most it can offer
     is where there is unopened curriculum and which branch it is on. */
  let next = '';
  if (lattice.branches.length > 0 && untouched > 0) {
    next = lattice.chosen
      ? `This is the branch you chose, so the unopened skills on it are the `
        + `nearest thing the curriculum has to a next page.`
      : `No branch has been chosen for this subject, so this is its root — `
        + `naming one in the analytics setup narrows what the tree offers.`;
  } else if (untouched === 0 && lattice.practised > 0) {
    next = 'Every skill on this branch has been opened at least once.';
  }

  return { standing: standingLine, touched, shape, next };
}

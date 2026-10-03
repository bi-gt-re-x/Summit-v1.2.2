/**
 * Subject insights — the figures for one subject, its branches, and the gap.
 *
 * This is the module that connects the analytics page to the rest of Summit.
 * Everything else on the Insights tab ends in a statement; this ends in a
 * branch of a skill tree and a link into it, which is the difference between a
 * page a reader agrees with and a page that changes what they do next:
 *
 *     Mathematics          91% performance · 4.1 difficulty · 84% consistency ↑
 *     "Algebra is moving fastest; Geometry has been flat for 30 days."
 *     Algebra    ████████░  91%
 *     Geometry   ███████░░  73%
 *     Number Theory ██████░  64%
 *     Recommended focus: Geometry is your largest gap. → open it
 *
 * ## Where each figure comes from, and which are not new
 *
 * The four headline figures are a `SkillRow` from utils/skillScore, unchanged:
 * that module already scores a subject out of a hundred from the reader's own
 * ratings, already carries mean difficulty and a trend in points, and already
 * refuses to score a subject with no rated work. Re-deriving any of it here
 * would be a second opinion about the same tasks.
 *
 * What *is* new is the branch reading, and it is new because nothing else in the
 * app looks at a tree this way. The question here is how far into each
 * *branch of one tree* this account has got, where a branch is a node other
 * catalogue subjects route into. `algebra` and `geometry` both route to the
 * mathematics tree and each names a node on it (see `SUBJECT_TARGETS`), so the
 * XP filed under those two subjects is the reader's own progress through those
 * two branches. That routing table is the only reason this is possible without
 * inventing a mapping.
 *
 * ## The same cap, and the same refusal
 *
 * Capped at 100: a serious mathematician's
 * record is several times what the tree is worth, and a bar running off the end
 * would make "covering a branch" unreachable by covering it. A branch whose node
 * is worth nothing, or which the account has never worked, is left out rather
 * than drawn at zero — a row of empty bars is a list of things the reader has
 * not done, which is a different panel and a discouraging one.
 *
 * ## The gap is the point, and it is not the lowest bar
 *
 * "Recommended focus" is the largest distance from full, among branches the
 * reader has actually started. Not the lowest percentage: a branch at 5% they
 * touched once is a branch they have not begun, and sending somebody there
 * because the arithmetic said "biggest gap" is how a recommendation engine
 * loses trust. `MIN_STARTED` is what makes it a gap in something they are doing
 * rather than a hole in something they are not.
 *
 * It says which branch and why, and stops. What to *do* about it is the
 * Recommendations tab, and the link is the door rather than the instruction.
 */
import { SUBJECT_TARGETS } from '@/skills/subjectMap';
import { subjectTreeById } from '@/skills/subjectTrees';
import type { SkillRow } from './skillScore';
import type { SubjectXpRow } from './subjectXp';
import { pctChange } from './recent';

/** Below this share of a branch, the reader has not started it. */
const MIN_STARTED = 10;

/** Below this gap, there is nothing worth calling a focus. */
const MIN_GAP = 15;

/** A branch has to be this far behind the leader to be called flat beside it. */
const FLAT_GAP = 8;

export interface BranchStanding {
  /** The node id on the tree — `m.geometry`. */
  node: string;
  /** The node's name — "Geometry". */
  name: string;
  /** The catalogue subject whose XP feeds it. */
  subject: string;
  /** The account's XP in that subject, over the whole record. */
  xp: number;
  /** What the node is worth in full. */
  worth: number;
  /** `xp` against `worth`, 0-100. */
  percent: number;
  /** Change in XP against the previous window, or null with nothing to compare. */
  change: number | null;
  /** Where the tree opens at this branch. */
  href: string;
}

export interface SubjectFocus {
  /** The catalogue subject id. */
  subject: string;
  name: string;
  /** The tree its work routes into. */
  tree: string;
  treeTitle: string;
  /** Out of 100, from the skill model. */
  performance: number;
  /** 1-5, mean over rated tasks. */
  difficulty: number;
  /** Out of 100 — weeks with work in this subject against weeks in the window. */
  consistency: number;
  /** Accuracy change in points against the earlier half, or null. */
  trend: number | null;
  /** How much of the score the evidence has earned, 0-1. */
  confidence: number;
  /** One sentence about which branches are moving and which are not. */
  sentence: string;
  /** The branches, deepest first. */
  branches: BranchStanding[];
  /** The branch worth putting time into, where one stands out. */
  gap: BranchStanding | null;
}

const treeHref = (subject: string, node: string) =>
  `/skill-trees?subject=${encodeURIComponent(subject)}&node=${encodeURIComponent(node)}`;

/**
 * Every branch of `tree` this account has XP in, deepest first.
 *
 * Exported for the tests and for any surface that wants the branch reading
 * without the sentence around it.
 */
export function branchesOf(
  tree: string,
  xpBySubject: Map<string, number>,
  previous: Map<string, number>,
  nameOf: (id: string) => string,
): BranchStanding[] {
  const lattice = subjectTreeById(tree);
  if (!lattice) return [];

  const out: BranchStanding[] = [];
  for (const [subject, target] of Object.entries(SUBJECT_TARGETS)) {
    if (target.tree !== tree || !target.node) continue;
    const xp = xpBySubject.get(subject) ?? 0;
    if (xp <= 0) continue;
    const node = lattice.nodes.find((entry) => entry.id === target.node);
    const worth = node?.xp ?? 0;
    if (!node || worth <= 0) continue;
    const was = previous.get(subject);
    out.push({
      node: node.id,
      // The tree's own name for the node, falling back to the catalogue's for a
      // node the tree has since renamed.
      name: node.name || nameOf(subject),
      subject,
      xp: Math.round(xp),
      worth,
      percent: Math.min(100, Math.round((xp / worth) * 100)),
      change: was === undefined ? null : pctChange(xp, was),
      href: treeHref(subject, node.id),
    });
  }
  return out.sort((a, b) => b.percent - a.percent || b.xp - a.xp);
}

/**
 * The sentence under the figures.
 *
 * Assembled from the branches rather than written, so it cannot claim a
 * movement the bars beside it do not show. Three shapes, in order of how much
 * the record supports: a leader against a flat one, a leader alone, and — when
 * there is only one branch or they are level — nothing about branches at all,
 * which is where the subject's own trend does the talking.
 */
function sentenceFor(row: SkillRow, name: string, branches: BranchStanding[]): string {
  const moving = branches.filter((branch) => branch.change !== null);
  const rising = [...moving].sort((a, b) => (b.change ?? 0) - (a.change ?? 0));
  const leader = rising[0];
  const laggard = rising[rising.length - 1];

  if (leader && laggard && leader !== laggard && (leader.change ?? 0) - (laggard.change ?? 0) >= FLAT_GAP) {
    const flat = Math.abs(laggard.change ?? 0) < 5;
    return (
      `You are moving fastest in ${leader.name}, while ${laggard.name} has ` +
      `${flat ? 'stayed flat' : `fallen ${Math.abs(Math.round(laggard.change ?? 0))}%`} ` +
      `against the period before.`
    );
  }

  const deepest = branches[0];
  if (deepest && deepest.percent >= MIN_STARTED) {
    return (
      `${deepest.name} is the furthest along at ${deepest.percent}% of the branch, ` +
      `and the rest of ${name} sits behind it.`
    );
  }

  if (row.trend !== null && Math.abs(row.trend) >= 5) {
    return `Accuracy in ${name} is ${row.trend > 0 ? 'up' : 'down'} ${Math.abs(
      Math.round(row.trend),
    )} points on the earlier half of the record.`;
  }
  return `${name} has held steady across the record, with no branch pulling ahead.`;
}

export interface SubjectFocusInput {
  /** Every subject the account has rated work in, scored. */
  skills: SkillRow[];
  /** The window's XP per subject — the rows the radar and the table draw. */
  rows: SubjectXpRow[];
  /** The same subjects over the previous window, for the per-branch change. */
  previous: Map<string, number>;
  nameOf: (id: string) => string;
  /** How many subjects to describe. */
  limit?: number;
}

/**
 * The strongest subjects, with their branches and the gap in each.
 *
 * Ordered by the skill model rather than by XP, because this section is about
 * how well a subject is going and not how much of it there is. A subject with no
 * route to a tree still gets its four figures and its sentence — the branch
 * bars are simply absent, which is the honest state for a subject the lattice
 * does not cover.
 */
export function subjectFocus({
  skills,
  rows,
  previous,
  nameOf,
  limit = 3,
}: SubjectFocusInput): SubjectFocus[] {
  const xpBySubject = new Map(rows.map((row) => [row.key, row.xp]));

  return skills.slice(0, limit).map((row) => {
    const target = SUBJECT_TARGETS[row.subject];
    const tree = target?.tree ?? '';
    const lattice = tree ? subjectTreeById(tree) : null;
    const name = nameOf(row.subject);
    const branches = tree ? branchesOf(tree, xpBySubject, previous, nameOf) : [];

    /* The gap: the largest distance from full among branches actually started.
       Sorted by the distance rather than by the percentage so the two cannot
       disagree, and filtered before sorting rather than after — a list whose
       first row is unstarted has already made the wrong recommendation. */
    const started = branches.filter(
      (branch) => branch.percent >= MIN_STARTED && 100 - branch.percent >= MIN_GAP,
    );
    const gap = [...started].sort((a, b) => a.percent - b.percent)[0] ?? null;

    return {
      subject: row.subject,
      name,
      tree,
      treeTitle: lattice?.title ?? '',
      performance: Math.round(row.score),
      difficulty: Math.round(row.avgDifficulty * 10) / 10,
      consistency: row.weeks > 0 ? Math.round((row.activeWeeks / row.weeks) * 100) : 0,
      trend: row.trend,
      confidence: row.confidence,
      sentence: sentenceFor(row, name, branches),
      branches,
      gap,
    };
  });
}

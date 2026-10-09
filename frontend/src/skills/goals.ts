/**
 * The things somebody might be trying to do, and which nodes each is about.
 *
 * ## A goal names targets, not a curriculum
 *
 * "Become good at competitive programming" is one node — `algorithms.contest-practice`
 * — and everything else in that tree falls out of the prerequisite graph. That
 * is the whole design: a goal is a handful of ids and a couple of tags, and the
 * twenty-node progression under it is *derived*, so fixing one prerequisite in
 * the library fixes every goal that leads through it at once.
 *
 * The failure this avoids is the obvious implementation — a goal holding an
 * ordered list of the nodes in its tree. That is a hardcoded tree wearing a
 * goal's clothes, it goes stale the moment a node is added, and it is exactly
 * what the architecture in skills/types is arranged to prevent.
 *
 * ## Tags do the branching
 *
 * `tags` are what makes a node *interesting* to a goal without being required by
 * it. The generator uses them to decide which of the many things hanging off the
 * required path are worth drawing as optional branches — see `branchesFor` in
 * skills/generate. A goal with no tags gets the required path and nothing else,
 * which is a legitimate answer and not a broken one.
 */
import type { SkillCategory } from './types';

export interface SkillGoal {
  /** Stable and unique. Appears in the generated tree's `goal` field. */
  id: string;
  /** How the goal is offered: a sentence somebody would recognise as theirs. */
  name: string;
  blurb: string;
  category: SkillCategory;
  /**
   * The nodes the goal is actually about. Everything they depend on is pulled in
   * automatically; nothing else is required.
   */
  targets: string[];
  /**
   * Nodes worth drawing even though no target needs them. Use sparingly — a long
   * list here is a curriculum creeping back in.
   */
  optional?: string[];
  /** What makes a nearby node relevant enough to draw as a branch. */
  tags?: string[];
}

export const GOALS: SkillGoal[] = [
  {
    id: 'learn-python',
    name: 'Learn to program',
    blurb:
      'From variables to classes: the fundamentals every other path here is built on. Language-agnostic, because the ideas are.',
    category: 'Programming',
    targets: [
      'programming.classes',
      'programming.file-io',
      'programming.modules',
      'programming.debugging',
    ],
    tags: ['programming', 'fundamentals', 'tooling'],
  },
  {
    id: 'competitive-programming',
    name: 'Become good at competitive programming',
    blurb:
      'Complexity, the standard data structures, and the algorithm families that most contest problems are a version of.',
    category: 'Computer Science',
    targets: ['algorithms.contest-practice'],
    optional: ['math.combinatorics', 'math.modular-arithmetic'],
    tags: ['competitive-programming', 'algorithms', 'data-structures'],
  },
  {
    id: 'usaco',
    name: 'Prepare for USACO',
    blurb:
      'The competitive path with the graph and DP branches USACO actually leans on, and the range-query techniques that show up in Silver and Gold.',
    category: 'Computer Science',
    targets: [
      'algorithms.contest-practice',
      'algorithms.union-find',
      'algorithms.shortest-paths',
    ],
    tags: ['usaco', 'competitive-programming', 'graphs', 'algorithms'],
  },
  {
    id: 'machine-learning',
    name: 'Learn machine learning',
    blurb:
      'The honest route: the math and the data handling before the models, and the models before the architectures.',
    category: 'AI / Machine Learning',
    targets: ['ml.transformers', 'ml.evaluation'],
    optional: ['ml.visualisation', 'ml.clustering'],
    tags: ['machine-learning', 'deep-learning', 'data', 'statistics'],
  },
  {
    id: 'data-science',
    name: 'Work with data',
    blurb:
      'Cleaning, describing and showing data, and being able to say what it does not support.',
    category: 'AI / Machine Learning',
    targets: ['ml.feature-engineering', 'ml.visualisation', 'ml.evaluation'],
    tags: ['data', 'statistics', 'visualisation'],
  },
  {
    id: 'backend-development',
    name: 'Learn backend development',
    blurb:
      'An API, a database behind it, authentication that is not a liability, and the thing actually deployed.',
    category: 'Programming',
    targets: ['programming.deployment', 'programming.auth'],
    optional: ['programming.async', 'programming.testing'],
    tags: ['backend', 'web', 'tooling', 'devops'],
  },
  {
    id: 'violin',
    name: 'Improve at violin',
    blurb:
      'Posture and bow before fingers, scales before repertoire, and the theory that makes intonation correctable.',
    category: 'Music',
    targets: ['violin.repertoire'],
    optional: ['music.ear-training'],
    tags: ['violin', 'technique', 'practice', 'music'],
  },
  {
    id: 'chess-improvement',
    name: 'Get better at chess',
    blurb:
      'Tactics and calculation first, because that is what decides games, then the structure and endgames that decide the rest.',
    category: 'Chess',
    targets: ['chess.tournament-play'],
    tags: ['chess', 'tactics', 'endgame', 'strategy'],
  },
  {
    id: 'strength-training',
    name: 'Get stronger',
    blurb:
      'The three barbell lifts done properly, overload applied on purpose, and the recovery that lets it continue.',
    category: 'Fitness',
    targets: ['fitness.programming'],
    optional: ['fitness.conditioning'],
    tags: ['fitness', 'strength', 'recovery'],
  },
  {
    id: 'essay-writing',
    name: 'Write better essays',
    blurb: 'Sentences, then structure, then argument — and the editing pass that is where the work is.',
    category: 'Writing',
    targets: ['writing.essay'],
    optional: ['writing.technical'],
    tags: ['writing', 'essays', 'argument'],
  },
];

export function goalById(id: string): SkillGoal | undefined {
  return GOALS.find((goal) => goal.id === id);
}

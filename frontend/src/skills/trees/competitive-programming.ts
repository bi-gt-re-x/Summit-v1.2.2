/**
 * Competitive Programming — a branch of Algorithms.
 *
 * USACO, Codeforces and the ICPC ladder. It sits under Algorithms rather than
 * beside it because every technique here is one from that tree used under two
 * constraints it does not have: a time limit measured in seconds, and a
 * problem statement written to disguise which technique it wants.
 *
 * ## What is actually being trained
 *
 * Not the algorithms. A competitor who can write Dijkstra from memory and
 * cannot tell that a problem is a shortest path problem scores zero, and that
 * is the ordinary failure — so the lattice runs from *recognising* a shape to
 * implementing it, and the implementation nodes sit below the recognition
 * ones rather than above.
 *
 * `cp.bounds` is a foundation node for that reason. Reading "n ≤ 200,000" and
 * knowing that rules out anything quadratic is the single highest-value habit
 * on this tree, and it costs nothing to learn.
 *
 * ## The division rungs are real nodes
 *
 * Bronze, Silver, Gold and Platinum are not decoration: each one is a genuine
 * change in what is being asked, and competitors plateau at the boundaries
 * rather than in the middle of a division. They are drawn as convergence
 * points where the techniques a division actually needs come together.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const COMPETITIVE_PROGRAMMING: SubjectTree = {
  id: 'competitive-programming',
  title: 'Competitive Programming',
  blurb: 'USACO and Codeforces — recognising the shape, then writing it fast.',
  parent: 'algorithms',
  nodes: [
    { id: 'cp.io', name: 'Fast Input & Output', icon: 'input-stream', tier: 'foundation', core: true, state: open, percent: 15, xp: 1200,
      desc: 'Reading a hundred thousand lines without the reading being the bottleneck, and printing without flushing every line. It is the one piece of boilerplate worth memorising, because it is the same in every problem you will ever solve.' },
    { id: 'cp.bounds', name: 'Reading the Constraints', icon: 'gauge', tier: 'foundation', core: true, requires: ['cp.io'], state: lock, percent: 0, xp: 1300,
      desc: 'The bound on n is the problem telling you which complexity it will accept. Two hundred thousand rules out quadratic, twenty admits exponential, and reading that line first saves writing the wrong solution twice.' },
    { id: 'cp.brute', name: 'Complete Search', icon: 'searching', tier: 'foundation', requires: ['cp.bounds'], state: lock, percent: 0, xp: 1300,
      desc: 'Trying everything, when the constraints say everything is small enough. It is the correct answer to more Bronze problems than anybody expects, and it is the baseline every cleverer solution gets checked against.' },
    { id: 'cp.sort', name: 'Sorting & Two Pointers', icon: 'sorting', tier: 'beginner', core: true, requires: ['cp.bounds'], state: lock, percent: 0, xp: 1500,
      desc: 'Putting things in order so a second pass can walk them once instead of comparing every pair. A great many quadratic solutions become linear the moment the input is sorted first.' },
    { id: 'cp.prefix', name: 'Prefix Sums', icon: 'aggregate', tier: 'beginner', core: true, requires: ['cp.sort'], state: lock, percent: 0, xp: 1500,
      desc: 'Precomputing running totals so any range sum is one subtraction. The first technique that trades memory for time explicitly, and the mental model every later range structure is built on.' },
    { id: 'cp.bsearch', name: 'Binary Search', icon: 'binary-search', tier: 'beginner', core: true, requires: ['cp.sort'], state: lock, percent: 0, xp: 1600,
      desc: 'Halving the space each step, and — more usefully — binary searching on the answer itself when the check is monotonic. The second use solves problems that look nothing like searching.' },
    { id: 'cp.bronze', name: 'Bronze', icon: 'bronze', tier: 'beginner', requires: ['cp.brute', 'cp.prefix'], state: lock, percent: 0, xp: 1700,
      desc: 'Where the technique is rarely the difficulty and the statement usually is. Bronze problems are won by reading carefully, handling the edge case at n equals one, and not over-engineering a search that was meant to be complete.' },
    { id: 'cp.greedy', name: 'Greedy', icon: 'greedy', tier: 'intermediate', requires: ['cp.sort'], state: lock, percent: 0, xp: 1700,
      desc: 'Taking the locally best option and being able to argue it is globally optimal. The argument is the skill — an unproven greedy that passes the samples is the most common way to fail a whole problem.' },
    { id: 'cp.dfs', name: 'DFS & BFS', icon: 'traversal', tier: 'intermediate', core: true, requires: ['cp.bounds'], state: lock, percent: 0, xp: 1700,
      desc: 'Walking a graph deep-first or level-first, and knowing that the second gives shortest paths when every edge costs the same. Flood fill, connected components and cycle detection are all one of these two wearing a hat.' },
    { id: 'cp.dsu', name: 'Union-Find', icon: 'hierarchy', tier: 'intermediate', requires: ['cp.dfs'], state: lock, percent: 0, xp: 1800,
      desc: 'Keeping track of which things are in the same group, under merges, in almost constant time. Twenty lines that turn a class of connectivity problems into a single pass over the edges.' },
    { id: 'cp.silver', name: 'Silver', icon: 'silver', tier: 'intermediate', core: true, requires: ['cp.greedy', 'cp.dfs', 'cp.bsearch'], state: lock, percent: 0, xp: 2000,
      desc: 'The division where recognising the shape becomes the whole game — a Silver problem is usually a graph, a sort, a prefix sum or a binary search in disguise. The plateau here is diagnostic, not technical.' },
    { id: 'cp.dp1', name: 'Dynamic Programming', icon: 'dynamic-programming', tier: 'advanced', core: true, requires: ['cp.silver'], state: lock, percent: 0, xp: 2200,
      desc: 'Defining a state, a transition and a base case, then filling the table in an order where everything you need is already there. Naming the state precisely is ninety percent of it; the code is usually four lines.' },
    { id: 'cp.dijkstra', name: 'Weighted Shortest Paths', icon: 'path-route', tier: 'advanced', requires: ['cp.silver', 'cp.dsu'], state: lock, percent: 0, xp: 2100,
      desc: 'Dijkstra with a priority queue when the weights are non-negative, and knowing which algorithm to reach for when they are not. The graph is frequently not given as a graph, which is the actual difficulty.' },
    { id: 'cp.treedp', name: 'Trees & Rerooting', icon: 'tree-structure', tier: 'advanced', requires: ['cp.dp1'], state: lock, percent: 0, xp: 2300,
      desc: 'Dynamic programming where the state is a subtree, and the trick of recomputing every root from one traversal instead of n. Lowest common ancestor and binary lifting live here too.' },
    { id: 'cp.segtree', name: 'Segment Trees', icon: 'range', tier: 'advanced', requires: ['cp.prefix', 'cp.dp1'], state: lock, percent: 0, xp: 2400,
      desc: 'Range queries with updates in logarithmic time, which prefix sums cannot do. Lazy propagation is where it stops being a data structure you copy and starts being one you understand.' },
    { id: 'cp.gold', name: 'Gold', icon: 'gold', tier: 'advanced', core: true, requires: ['cp.dp1', 'cp.dijkstra', 'cp.treedp'], state: lock, percent: 0, xp: 2500,
      desc: 'Where dynamic programming and real graph algorithms become the assumption rather than the achievement. Problems stop being one technique and start being two composed, which is the step most competitors find hardest.' },
    { id: 'cp.math', name: 'Contest Number Theory', icon: 'modular', tier: 'advanced', requires: ['cp.bsearch'], state: lock, percent: 0, xp: 2100,
      desc: 'Sieves, modular inverses, fast exponentiation and combinatorics under a prime modulus. A small, fixed toolkit that appears constantly and is almost never the interesting part of the problem.' },
    { id: 'cp.flow', name: 'Flows & Matching', icon: 'pipeline', tier: 'expert', requires: ['cp.gold'], state: lock, percent: 0, xp: 2800,
      desc: 'Maximum flow, minimum cut and bipartite matching — and the fact that a startling range of problems reduce to them. Spotting the reduction is far harder than running the algorithm.' },
    { id: 'cp.strings', name: 'String Algorithms', icon: 'hash', tier: 'expert', requires: ['cp.gold'], state: lock, percent: 0, xp: 2700,
      desc: 'Hashing, Z-function and suffix structures, for the problems where the input is text and the naive comparison is quadratic. Hashing is easiest and carries a collision risk you should be able to quantify.' },
    { id: 'cp.debug', name: 'Debugging Under Time', icon: 'debugging', tier: 'expert', core: true, requires: ['cp.gold'], state: lock, percent: 0, xp: 2500,
      desc: 'Finding the wrong answer on test 14 with no test 14 in front of you — stress testing against a brute force, and checking overflow and bounds before anything cleverer. It is the skill that converts near-misses into points.' },
    { id: 'cp.platinum', name: 'Platinum', icon: 'race', tier: 'mastery', requires: ['cp.flow', 'cp.segtree', 'cp.strings', 'cp.debug'], state: lock, percent: 0, xp: 3200,
      desc: 'Heavy machinery, composed, against a clock, where a full solve may take the whole contest. The division stops rewarding breadth and starts rewarding the ability to hold one hard problem in your head for four hours.' },
  ],
};

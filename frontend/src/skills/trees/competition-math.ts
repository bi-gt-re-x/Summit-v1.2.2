/**
 * Competition Mathematics — a branch of Mathematics.
 *
 * The ladder that runs AMC → AIME → olympiad, and it is a different subject
 * from the Mathematics tree beside it rather than a harder rung of it. School
 * maths asks whether you can execute a method that has already been named;
 * this asks which method, under a clock, on a problem written specifically so
 * that the obvious one does not finish. Those are different skills, and the
 * second is trainable — which is the whole reason it gets a lattice.
 *
 * ## Two spines, and they meet late
 *
 * Everything here descends from arithmetic, and then splits four ways almost
 * immediately: counting, geometry, number theory and algebra are four separate
 * bodies of technique, and a competitor is usually strong in two of them and
 * weak in two. They are drawn as parallel chains for that reason rather than
 * as one line — a tree that made geometry a prerequisite for number theory
 * would be describing a curriculum nobody has ever followed.
 *
 * They converge at `cm.aime`, and again at the olympiad round, because that is
 * genuinely where they converge: a fifteen-problem paper does not tell you
 * which of the four it is testing.
 *
 * ## Timing is a foundation node, not an afterthought
 *
 * It sits at the top with the arithmetic because that is where it belongs. The
 * most common way to lose an AMC is not being unable to do the problems; it is
 * spending eleven minutes on problem 14 and never reading 21 through 25.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const COMPETITION_MATH: SubjectTree = {
  id: 'competition-math',
  title: 'Competition Mathematics',
  blurb: 'AMC, AIME and olympiad — choosing the method, under a clock.',
  parent: 'mathematics',
  nodes: [
    { id: 'cm.arith', name: 'Mental Arithmetic', icon: 'arithmetic', tier: 'foundation', core: true, state: open, percent: 15, xp: 1200,
      desc: 'Fast, accurate calculation without reaching for anything — squares to thirty, common factorizations, fraction sense. It buys back the minutes that the last five problems on a paper actually need.' },
    { id: 'cm.algebra', name: 'Algebraic Manipulation', icon: 'algebra-x', tier: 'foundation', core: true, requires: ['cm.arith'], state: lock, percent: 0, xp: 1400,
      desc: 'Moving expressions around fluently enough that the moving is not what you are thinking about. Substitution, symmetry and factoring are the three that turn an intractable equation into an obvious one.' },
    { id: 'cm.timing', name: 'Contest Timing', icon: 'timer', tier: 'foundation', requires: ['cm.arith'], state: lock, percent: 0, xp: 1300,
      desc: 'Reading the whole paper first, budgeting per problem, and abandoning one on purpose. Most lost AMC points are not problems that could not be solved but problems that were never read.' },
    { id: 'cm.count', name: 'Counting', icon: 'counting', tier: 'beginner', core: true, requires: ['cm.arith'], state: lock, percent: 0, xp: 1500,
      desc: 'Multiplying choices made in sequence and adding choices made instead of one another, plus complementary counting when the direct count is worse. Nearly every combinatorics error is one of those rules used where another belonged.' },
    { id: 'cm.geo', name: 'Angle Chasing', icon: 'geometry', tier: 'beginner', core: true, requires: ['cm.algebra'], state: lock, percent: 0, xp: 1500,
      desc: 'Propagating known angles through a figure until the unknown one falls out. It is the geometry technique with the highest ratio of problems solved to theory required, and it rewards drawing the diagram large.' },
    { id: 'cm.numtheory', name: 'Modular Arithmetic', icon: 'modular', tier: 'beginner', core: true, requires: ['cm.arith'], state: lock, percent: 0, xp: 1500,
      desc: 'Arithmetic that wraps, and what it lets you ignore. Working modulo a well-chosen number turns questions about enormous integers into questions about a handful of residues.' },
    { id: 'cm.prob', name: 'Probability', icon: 'probability', tier: 'beginner', requires: ['cm.count'], state: lock, percent: 0, xp: 1600,
      desc: 'Counting the favorable cases over counting all of them, once you are sure both counts describe the same sample space. Almost every wrong answer here is a right count of the wrong space.' },
    { id: 'cm.seq', name: 'Sequences & Series', icon: 'sequence', tier: 'intermediate', requires: ['cm.algebra'], state: lock, percent: 0, xp: 1700,
      desc: 'Arithmetic and geometric progressions, and the telescoping trick that collapses a sum nobody wants to compute. Recognizing which kind you are looking at is most of the work.' },
    { id: 'cm.poly', name: 'Polynomials', icon: 'functions-graph', tier: 'intermediate', core: true, requires: ['cm.algebra'], state: lock, percent: 0, xp: 1800,
      desc: 'Roots, coefficients and the relations between them. Vieta turns a question about the roots you cannot find into arithmetic on the coefficients you were given.' },
    { id: 'cm.pigeon', name: 'Pigeonhole & Extremal', icon: 'pigeonhole', tier: 'intermediate', requires: ['cm.count'], state: lock, percent: 0, xp: 1700,
      desc: 'More items than boxes means a box holds two, and looking at the largest or smallest case first. Both are ways of proving something exists without ever constructing it.' },
    { id: 'cm.power', name: 'Power of a Point', icon: 'compass', tier: 'intermediate', requires: ['cm.geo'], state: lock, percent: 0, xp: 1800,
      desc: 'One relation that holds for every line through a fixed point and a circle, whichever side the point is on. It is the first result that makes circle geometry feel like algebra rather than luck.' },
    { id: 'cm.trig', name: 'Trigonometry in Geometry', icon: 'trigonometry', tier: 'intermediate', requires: ['cm.geo', 'cm.algebra'], state: lock, percent: 0, xp: 1800,
      desc: 'Law of sines and cosines as escape hatches when the figure refuses to yield to angles alone. The cost is arithmetic, which is why it is a second choice rather than a first.' },
    { id: 'cm.recur', name: 'Recursion & Telescoping', icon: 'recurrence', tier: 'intermediate', requires: ['cm.seq'], state: lock, percent: 0, xp: 1800,
      desc: 'Describing the nth case in terms of the ones before it, then either solving it or summing it so that everything cancels. A great many counting problems are recurrences that have not been written down yet.' },
    { id: 'cm.ineq', name: 'Inequalities', icon: 'inequality', tier: 'advanced', requires: ['cm.poly'], state: lock, percent: 0, xp: 2100,
      desc: 'AM-GM, Cauchy-Schwarz, and the discipline of tracking when equality holds. The equality case is not a footnote — it is usually what tells you whether the bound you proved is the one being asked for.' },
    { id: 'cm.diophantine', name: 'Diophantine Equations', icon: 'primes', tier: 'advanced', requires: ['cm.numtheory', 'cm.poly'], state: lock, percent: 0, xp: 2200,
      desc: 'Equations where only whole-number solutions count, which makes them far more constrained than they look. Factoring and a well-chosen modulus between them dispose of most of what appears on a paper.' },
    { id: 'cm.invariant', name: 'Invariants & Monovariants', icon: 'balance-scale', tier: 'advanced', requires: ['cm.pigeon'], state: lock, percent: 0, xp: 2200,
      desc: 'Finding the quantity a process never changes, or only ever moves one way. It is how a question about a thousand moves is answered without simulating any of them.' },
    { id: 'cm.gen', name: 'Generating Functions', icon: 'series', tier: 'advanced', requires: ['cm.seq', 'cm.count'], state: lock, percent: 0, xp: 2300,
      desc: 'Encoding a counting sequence as the coefficients of a power series, so that combinatorics becomes algebra. Heavy machinery, and unreasonably effective on the problems it fits.' },
    { id: 'cm.aime', name: 'AIME Strategy', icon: 'exam', tier: 'advanced', core: true, requires: ['cm.timing', 'cm.recur', 'cm.trig'], state: lock, percent: 0, xp: 2400,
      desc: 'Three hours, fifteen problems, integer answers and no partial credit — a completely different game from the AMC. Verification matters more than speed here, because an answer you cannot check is worth nothing.' },
    { id: 'cm.proof', name: 'Olympiad Proof Writing', icon: 'proof', tier: 'expert', core: true, requires: ['cm.invariant', 'cm.ineq'], state: lock, percent: 0, xp: 2600,
      desc: 'Writing an argument a hostile grader cannot fault, which is a separate skill from finding it. Stating what you are allowed to assume before you use it is most of the difference between full marks and two.' },
    { id: 'cm.funceq', name: 'Functional Equations', icon: 'functions', tier: 'expert', requires: ['cm.proof'], state: lock, percent: 0, xp: 2700,
      desc: 'Deducing what a function must be from an identity it satisfies everywhere. Substituting well-chosen values is the whole technique, and proving your candidate is the only one is the half people forget.' },
    { id: 'cm.combgeo', name: 'Combinatorial Geometry', icon: 'shapes', tier: 'expert', requires: ['cm.power', 'cm.invariant'], state: lock, percent: 0, xp: 2700,
      desc: 'Counting arguments applied to points, lines and regions in the plane. It is where the two halves of the subject that never speak to each other finally have to.' },
    { id: 'cm.usamo', name: 'The Olympiad Round', icon: 'trophy', tier: 'mastery', requires: ['cm.funceq', 'cm.combgeo', 'cm.diophantine', 'cm.gen'], state: lock, percent: 0, xp: 3200,
      desc: 'Six proof problems over two days, where one solved completely beats three half-written. Everything below this converges here, because a paper at this level never tells you which of the four subjects it is testing.' },
  ],
};

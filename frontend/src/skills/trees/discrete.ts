/**
 * Discrete Mathematics — a branch of Mathematics.
 *
 * The half of maths that computing actually runs on: logic, sets, counting and
 * proof. It sits under Algorithms as much as under Mathematics, and is filed
 * here because the reasoning is the subject and the algorithms are one use of
 * it.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const DISCRETE: SubjectTree = {
  id: 'discrete',
  title: 'Discrete Mathematics',
  blurb: 'Logic, sets, counting and proof — the math that computing is written in.',
  parent: 'mathematics',
  nodes: [
    { id: 'di.logic', name: 'Propositional Logic', icon: 'logic', tier: 'foundation', core: true, state: open, percent: 20, xp: 1400,
      desc: 'Statements that are true or false, joined by and, or and not. A truth table settles any argument in this fragment mechanically, which is exactly why processors can be built out of it.' },
    { id: 'di.implication', name: 'Implication', icon: 'implication', tier: 'foundation', requires: ['di.logic'], state: lock, percent: 0, xp: 1400,
      desc: 'If this, then that — and the fact that it is only false when the promise is broken. Its contrapositive is equivalent and its converse is not, which is the confusion behind an enormous number of wrong arguments.' },
    { id: 'di.sets', name: 'Sets', icon: 'sets', tier: 'foundation', core: true, requires: ['di.logic'], state: lock, percent: 0, xp: 1300,
      desc: 'A collection with no order and no repeats, and the three operations on them. Union, intersection and difference mirror the logic words "or", "and" and "not" exactly, which is not a coincidence.' },
    { id: 'di.quant', name: 'Quantifiers', icon: 'quantifier', tier: 'beginner', requires: ['di.implication', 'di.sets'], state: lock, percent: 0, xp: 1600,
      desc: 'For all, and there exists. Their order changes the meaning completely, and negating a statement correctly means swapping each one and flipping the inside.' },
    { id: 'di.relations', name: 'Relations', icon: 'relation', tier: 'beginner', requires: ['di.sets'], state: lock, percent: 0, xp: 1500,
      desc: 'Which things are connected to which, as a set of pairs. Reflexive, symmetric and transitive are the three properties worth knowing by name, because together they define what it means for things to be equivalent.' },
    { id: 'di.functions', name: 'Functions & Mappings', icon: 'functions', tier: 'beginner', requires: ['di.relations'], state: lock, percent: 0, xp: 1500,
      desc: 'A relation that gives exactly one output per input, and what injective and surjective actually rule out. Counting arguments later depend entirely on which of those two a mapping has.' },
    { id: 'di.count', name: 'Counting', icon: 'counting', tier: 'beginner', core: true, requires: ['di.sets'], state: lock, percent: 0, xp: 1600,
      desc: 'Multiply choices made in sequence, add choices made instead of each other. Nearly every combinatorial mistake is one of those two rules applied where the other belonged.' },
    { id: 'di.perm', name: 'Permutations & Combinations', icon: 'combinations', tier: 'intermediate', requires: ['di.count'], state: lock, percent: 0, xp: 1800,
      desc: 'Arrangements where order matters and selections where it does not. Getting the answer usually means deciding that one question first and doing arithmetic second.' },
    { id: 'di.pigeon', name: 'Pigeonhole Principle', icon: 'pigeonhole', tier: 'intermediate', requires: ['di.count'], state: lock, percent: 0, xp: 1600,
      desc: 'More items than boxes means some box holds two. Trivially obvious and startlingly powerful — it proves that any lossless compressor must make some inputs larger.' },
    { id: 'di.proof', name: 'Direct Proof', icon: 'proof', tier: 'intermediate', core: true, requires: ['di.quant'], state: lock, percent: 0, xp: 1900,
      desc: 'Arguing from the assumption to the conclusion in steps nobody can dispute. Writing one is mostly the discipline of stating what you are allowed to use before you use it.' },
    { id: 'di.contra', name: 'Contradiction & Contrapositive', icon: 'contradiction', tier: 'intermediate', requires: ['di.proof'], state: lock, percent: 0, xp: 1900,
      desc: 'Two ways round a proof that resists the direct route: assume the opposite and break something, or prove the equivalent reversed statement instead. Irrationality and infinitude of primes both fall to the first.' },
    { id: 'di.induction', name: 'Induction', icon: 'induction', tier: 'advanced', core: true, requires: ['di.proof'], state: lock, percent: 0, xp: 2200,
      desc: 'Prove it for the first case, then prove each case follows from the one before. It is the same shape as recursion, and understanding either properly makes the other obvious.' },
    { id: 'di.recur', name: 'Recurrence Relations', icon: 'recurrence', tier: 'advanced', requires: ['di.induction'], state: lock, percent: 0, xp: 2200,
      desc: 'Defining a sequence in terms of its earlier terms, and solving for a closed form. This is where the running time of a divide-and-conquer algorithm actually comes from.' },
    { id: 'di.graphs', name: 'Graph Theory', icon: 'graph-nodes', tier: 'advanced', requires: ['di.relations'], state: lock, percent: 0, xp: 2100,
      desc: 'Things and the connections between them, stripped of everything else. Once a problem is stated as a graph, decades of known results become available to it at once.' },
    { id: 'di.trees', name: 'Trees & Counting Structures', icon: 'tree-structure', tier: 'advanced', requires: ['di.graphs', 'di.perm'], state: lock, percent: 0, xp: 2100,
      desc: 'Connected graphs with no cycles, and how many of them there are. The counting results here are what tell you how large a search space really is before you write the search.' },
    { id: 'di.modular', name: 'Modular Arithmetic', icon: 'modular', tier: 'advanced', requires: ['di.induction'], state: lock, percent: 0, xp: 2000,
      desc: 'Arithmetic that wraps around, the way a clock does. Hashing, checksums and public-key cryptography are all built on the fact that wrapping is easy forwards and hard to undo.' },
    { id: 'di.number', name: 'Number Theory', icon: 'primes', tier: 'expert', requires: ['di.modular'], state: lock, percent: 0, xp: 2400,
      desc: 'Divisibility, primes and the structure hiding in the integers. The oldest branch of pure mathematics, and the one every secure connection you make depends on.' },
    { id: 'di.boolean', name: 'Boolean Algebra', icon: 'boolean', tier: 'expert', requires: ['di.contra'], state: lock, percent: 0, xp: 2200,
      desc: 'Logic as algebra, with laws you can factor and simplify by. It is how a circuit gets smaller and how a compiler decides that two conditions were the same condition.' },
    { id: 'di.automata', name: 'Automata & Languages', icon: 'automaton', tier: 'expert', requires: ['di.boolean', 'di.trees'], state: lock, percent: 0, xp: 2600,
      desc: 'The simplest machines that can recognize patterns, and what each kind of machine cannot recognize at all. This is the theory a regular expression is a practical corner of.' },
    { id: 'di.complex', name: 'Computability & Complexity', icon: 'complexity', tier: 'mastery', requires: ['di.automata', 'di.number'], state: lock, percent: 0, xp: 3000,
      desc: 'What can be computed at all, and what can be computed in reasonable time. The halting problem and the open question about P and NP are both results about limits rather than about cleverness.' },
  ],
};

/**
 * Precalculus, a branch of Mathematics.
 *
 * The full course, where the Precalculus node on Mathematics is the summary of it.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const PRECALCULUS: SubjectTree = {
  id: 'precalculus',
  title: 'Precalculus',
  blurb: 'Everything you need ready the day calculus starts.',
  parent: 'mathematics',
  nodes: [
    { id: 'pc.funcs', name: 'Functions Review', icon: 'functions', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Domain, range and function notation, done fast. Precalc assumes all of this, so shore up any gaps in the first two weeks.' },
    { id: 'pc.transform', name: 'Transformations', icon: 'transform', tier: 'foundation', requires: ['pc.funcs'], state: lock, percent: 0, xp: 1200,
      desc: 'Shifts, stretches and reflections of a parent graph. Learn what each change to the equation does and you can sketch most graphs in seconds.' },
    { id: 'pc.poly', name: 'Polynomials', icon: 'parabola', tier: 'beginner', requires: ['pc.funcs'], state: lock, percent: 0, xp: 1600,
      desc: "End behavior, zeros and multiplicity. You'll be able to sketch a degree-five graph from its factored form without a calculator." },
    { id: 'pc.division', name: 'Polynomial Division', icon: 'fractions', tier: 'beginner', requires: ['pc.poly'], state: lock, percent: 0, xp: 1700,
      desc: "Long division and synthetic division, plus the remainder and factor theorems. It's how you crack open a cubic once you've found one root." },
    { id: 'pc.rational', name: 'Rational Functions', icon: 'functions-graph', tier: 'intermediate', requires: ['pc.division'], state: lock, percent: 0, xp: 1700,
      desc: 'Fractions of polynomials, with holes, vertical asymptotes and horizontal ones. Factor first, cancel second, and the graph tells you the rest.' },
    { id: 'pc.exp', name: 'Exponential Functions', icon: 'growth-curve', tier: 'beginner', requires: ['pc.transform'], state: lock, percent: 0, xp: 1500,
      desc: 'Growth and decay by a fixed percent each step. Compound interest, populations and half-life are all this one shape.' },
    { id: 'pc.logs', name: 'Logarithms', icon: 'logarithm', tier: 'intermediate', core: true, requires: ['pc.exp'], state: lock, percent: 0, xp: 1900,
      desc: 'The inverse of an exponential, and the laws that let you bring exponents down. Most log mistakes are the product rule used backwards.' },
    { id: 'pc.logeq', name: 'Exponential & Log Equations', icon: 'equations', tier: 'intermediate', requires: ['pc.logs'], state: lock, percent: 0, xp: 2000,
      desc: 'Solving for a variable stuck in an exponent. Take a log of both sides, and always check for answers that break the domain.' },
    { id: 'pc.inverse', name: 'Inverse & Composite Functions', icon: 'inverse', tier: 'intermediate', requires: ['pc.transform'], state: lock, percent: 0, xp: 1700,
      desc: 'Putting one function inside another, and undoing a function. The horizontal line test tells you when an inverse even exists.' },
    { id: 'pc.piecewise', name: 'Piecewise & Absolute Value', icon: 'split-data', tier: 'intermediate', requires: ['pc.transform'], state: lock, percent: 0, xp: 1800,
      desc: 'Functions with different rules on different intervals. Calculus teachers use them to test whether you really get limits, so get comfortable now.' },
    { id: 'pc.trig', name: 'Trig Functions', icon: 'trigonometry', tier: 'advanced', core: true, requires: ['pc.transform'], state: lock, percent: 0, xp: 2200,
      desc: 'The unit circle, radians and the six trig graphs as functions. If trig was shaky last year, this is your second chance.' },
    { id: 'pc.identities', name: 'Identities & Equations', icon: 'balance-scale', tier: 'advanced', requires: ['pc.trig'], state: lock, percent: 0, xp: 2300,
      desc: "Simplifying and solving with trig identities. It's mostly algebra wearing a costume, so lean on your factoring." },
    { id: 'pc.sequences', name: 'Sequences & Series', icon: 'sequence', tier: 'advanced', requires: ['pc.exp'], state: lock, percent: 0, xp: 2000,
      desc: "Arithmetic and geometric patterns and their sums. Sigma notation looks scary but it's just a compact loop." },
    { id: 'pc.conics', name: 'Conic Sections', icon: 'orbit', tier: 'advanced', requires: ['pc.poly'], state: lock, percent: 0, xp: 2100,
      desc: 'Circles, ellipses, parabolas and hyperbolas from their equations. Completing the square turns a messy equation into one you can read.' },
    { id: 'pc.vectors', name: 'Vectors', icon: 'vectors', tier: 'advanced', requires: ['pc.trig'], state: lock, percent: 0, xp: 2200,
      desc: 'Quantities with size and direction, added tip to tail. Physics leans on this heavily, so it pays off twice.' },
    { id: 'pc.polar', name: 'Polar & Parametric', icon: 'coordinate-plane', tier: 'expert', requires: ['pc.trig'], state: lock, percent: 0, xp: 2600,
      desc: 'Curves drawn by an angle or by time instead of by x. Parametric equations are how you describe something moving.' },
    { id: 'pc.matrices', name: 'Matrices', icon: 'matrices', tier: 'expert', requires: ['pc.vectors'], state: lock, percent: 0, xp: 2300,
      desc: 'Grids of numbers for solving systems and moving points around. A preview of linear algebra that shows up on some precalc finals.' },
    { id: 'pc.limits', name: 'Intro to Limits', icon: 'limits', tier: 'expert', requires: ['pc.rational', 'pc.piecewise'], state: lock, percent: 0, xp: 2400,
      desc: "What a function heads toward near a point. It's the first idea of calculus, and seeing it early makes the first month of calc much easier." },
    { id: 'pc.ready', name: 'Calc-Ready', icon: 'target', tier: 'mastery', requires: ['pc.limits', 'pc.logeq', 'pc.identities'], state: lock, percent: 0, xp: 2800,
      desc: "Mixed review where you choose the tool yourself. If you can do a page of these without notes, you're ready for calculus." },
  ],
};

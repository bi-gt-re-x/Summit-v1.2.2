/**
 * Differential Equations, a branch of Calculus.
 *
 * Starts where AP Calculus BC leaves off and runs through a first college course.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const DIFF_EQ: SubjectTree = {
  id: 'differential-equations',
  title: 'Differential Equations',
  blurb: 'Equations about change, and the functions that solve them.',
  parent: 'calculus',
  nodes: [
    { id: 'de.what', name: 'What a Diff Eq Is', icon: 'derivatives', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'An equation that links a function to its own rate of change. The answer is a whole function, which takes some getting used to.' },
    { id: 'de.check', name: 'Checking a Solution', icon: 'checklist', tier: 'foundation', requires: ['de.what'], state: lock, percent: 0, xp: 1200,
      desc: "Plug a candidate function in and see if both sides match. It's quick, and it catches most mistakes on homework." },
    { id: 'de.slope', name: 'Slope Fields', icon: 'grid', tier: 'beginner', requires: ['de.what'], state: lock, percent: 0, xp: 1600,
      desc: 'Tiny arrows that show the slope at every point. You can sketch solutions before solving anything, and AP Calc BC loves asking about them.' },
    { id: 'de.separable', name: 'Separable Equations', icon: 'transfer', tier: 'beginner', core: true, requires: ['de.check'], state: lock, percent: 0, xp: 1700,
      desc: "Move every y to one side and every x to the other, then integrate. Don't drop the constant, because it's what fits the solution to the starting point." },
    { id: 'de.ivp', name: 'Initial Value Problems', icon: 'flag', tier: 'beginner', requires: ['de.separable'], state: lock, percent: 0, xp: 1400,
      desc: 'Using a starting condition to pick one solution out of a family. Most real problems come with one, so practice reading it off the question.' },
    { id: 'de.growth', name: 'Growth & Decay Models', icon: 'growth-curve', tier: 'intermediate', requires: ['de.ivp'], state: lock, percent: 0, xp: 1800,
      desc: 'Populations, cooling coffee and radioactive decay. Each is a rate proportional to an amount, and each solves to an exponential.' },
    { id: 'de.euler', name: "Euler's Method", icon: 'estimate', tier: 'intermediate', requires: ['de.slope'], state: lock, percent: 0, xp: 1900,
      desc: "Approximating a solution with small straight steps. Smaller steps give better answers, and you'll see exactly why the error builds up." },
    { id: 'de.linear', name: 'First-Order Linear', icon: 'linear-equation', tier: 'intermediate', core: true, requires: ['de.ivp'], state: lock, percent: 0, xp: 2000,
      desc: 'Equations you solve with an integrating factor. It feels like a trick the first time and like a recipe by the fifth.' },
    { id: 'de.logistic', name: 'Logistic Growth', icon: 'population', tier: 'intermediate', requires: ['de.growth'], state: lock, percent: 0, xp: 1700,
      desc: 'Growth that slows down as it hits a limit. The carrying capacity sits right in the equation once you know where to look.' },
    { id: 'de.exact', name: 'Exact Equations', icon: 'balance-scale', tier: 'advanced', requires: ['de.linear'], state: lock, percent: 0, xp: 2100,
      desc: 'Equations that come from a hidden function of x and y. A quick partial-derivative test tells you if the method applies.' },
    { id: 'de.second', name: 'Second-Order Linear', icon: 'layers', tier: 'advanced', core: true, requires: ['de.linear'], state: lock, percent: 0, xp: 2200,
      desc: 'Equations with a second derivative, solved with a characteristic equation. Real, repeated and complex roots each give a different kind of answer.' },
    { id: 'de.springs', name: 'Springs & Oscillation', icon: 'waves', tier: 'advanced', requires: ['de.second'], state: lock, percent: 0, xp: 2300,
      desc: 'Masses on springs, with and without friction. Underdamped, critically damped and overdamped are three outcomes of one equation.' },
    { id: 'de.forcing', name: 'Forcing Terms', icon: 'forces', tier: 'advanced', requires: ['de.second'], state: lock, percent: 0, xp: 2000,
      desc: 'Adding an outside push with undetermined coefficients or variation of parameters. Resonance is what happens when the push matches the natural rhythm.' },
    { id: 'de.laplace', name: 'Laplace Transforms', icon: 'transform', tier: 'expert', requires: ['de.forcing'], state: lock, percent: 0, xp: 2400,
      desc: 'Turning a calculus problem into an algebra problem and back. Engineers use it for circuits and control systems all the time.' },
    { id: 'de.systems', name: 'Systems of Equations', icon: 'matrices', tier: 'expert', requires: ['de.second'], state: lock, percent: 0, xp: 2500,
      desc: 'Several linked equations solved together with matrices and eigenvalues. Predator and prey models live here.' },
    { id: 'de.phase', name: 'Phase Portraits', icon: 'flow', tier: 'expert', requires: ['de.systems'], state: lock, percent: 0, xp: 2600,
      desc: 'Pictures of how a system moves over time. Stable points, spirals and saddles tell the story without solving anything.' },
    { id: 'de.series', name: 'Series Solutions', icon: 'series', tier: 'mastery', requires: ['de.second'], state: lock, percent: 0, xp: 2600,
      desc: "Building a solution as a power series when nothing else works. It's slow, and it works when the conditions are right." },
    { id: 'de.pde', name: 'Intro to Partial Diff Eqs', icon: 'heat', tier: 'mastery', requires: ['de.phase', 'de.laplace'], state: lock, percent: 0, xp: 2700,
      desc: 'Equations with more than one variable, like heat spreading through a rod. A first look at what physics and engineering majors do next.' },
  ],
};

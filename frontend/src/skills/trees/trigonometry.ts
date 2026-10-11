/**
 * Trigonometry, a branch of Mathematics.
 *
 * Built for the high school course: right triangles first, then the unit circle,
 * then identities and the laws that solve any triangle.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const TRIGONOMETRY: SubjectTree = {
  id: 'trigonometry',
  title: 'Trigonometry',
  blurb: 'Triangles, the unit circle and every wave that comes after.',
  parent: 'mathematics',
  nodes: [
    { id: 'tg.angles', name: 'Angles & Degrees', icon: 'compass', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: "How far something turns, in degrees. You'll use it in every other node here, so get quick at spotting complementary and supplementary pairs." },
    { id: 'tg.right', name: 'Right Triangles', icon: 'geometry', tier: 'foundation', requires: ['tg.angles'], state: lock, percent: 0, xp: 1200,
      desc: 'The Pythagorean theorem and the names of the three sides. Labeling opposite, adjacent and hypotenuse right is half of every trig problem.' },
    { id: 'tg.ratios', name: 'Sine, Cosine & Tangent', icon: 'trigonometry', tier: 'beginner', core: true, requires: ['tg.right'], state: lock, percent: 0, xp: 1600,
      desc: 'Three ratios that link an angle to the sides of a right triangle. SOH CAH TOA gets you started. Knowing which ratio fits the sides you have is the real skill.' },
    { id: 'tg.solve', name: 'Solving Triangles', icon: 'puzzle', tier: 'beginner', requires: ['tg.ratios'], state: lock, percent: 0, xp: 1700,
      desc: 'Finding missing sides and angles from what you know. Draw it, label it, pick the ratio, then check that the answer makes sense for the picture.' },
    { id: 'tg.inverse', name: 'Inverse Trig', icon: 'inverse', tier: 'beginner', requires: ['tg.ratios'], state: lock, percent: 0, xp: 1400,
      desc: 'Going from a ratio back to an angle with arcsin, arccos and arctan. Calculators give one answer, and sometimes the triangle wants the other one.' },
    { id: 'tg.radians', name: 'Radians', icon: 'rotation', tier: 'intermediate', requires: ['tg.angles'], state: lock, percent: 0, xp: 1800,
      desc: 'Angles counted in radius lengths around the circle. It looks strange at first, but calculus only works cleanly in radians, so switch now.' },
    { id: 'tg.unit', name: 'The Unit Circle', icon: 'orbit', tier: 'intermediate', core: true, requires: ['tg.radians', 'tg.ratios'], state: lock, percent: 0, xp: 1900,
      desc: "Sine and cosine as the coordinates of a point on a circle of radius one. Build it from two special triangles and you'll never need to memorize the table." },
    { id: 'tg.elevation', name: 'Angles of Elevation', icon: 'hill', tier: 'intermediate', requires: ['tg.solve'], state: lock, percent: 0, xp: 2000,
      desc: 'Word problems with ladders, ramps and shadows. The math is easy once the sketch is right, so spend your time on the sketch.' },
    { id: 'tg.graphs', name: 'Graphing Sine & Cosine', icon: 'waves', tier: 'intermediate', requires: ['tg.unit'], state: lock, percent: 0, xp: 1700,
      desc: 'Turning the unit circle into waves. Amplitude, period, phase shift and midline are four knobs, and each one moves the graph in its own way.' },
    { id: 'tg.tangent', name: 'Tangent & Reciprocal Graphs', icon: 'functions-graph', tier: 'advanced', requires: ['tg.graphs'], state: lock, percent: 0, xp: 2100,
      desc: 'Tangent, secant, cosecant and cotangent, with their asymptotes. Most mistakes here come from forgetting where cosine equals zero.' },
    { id: 'tg.identities', name: 'Trig Identities', icon: 'equations', tier: 'advanced', core: true, requires: ['tg.unit'], state: lock, percent: 0, xp: 2200,
      desc: 'Equations that hold for every angle, like sin squared plus cos squared equals one. Proving them is algebra practice in disguise. Work one side until it looks like the other.' },
    { id: 'tg.sumdiff', name: 'Sum & Double-Angle Formulas', icon: 'transform', tier: 'advanced', requires: ['tg.identities'], state: lock, percent: 0, xp: 2300,
      desc: "Sine and cosine of a sum, plus the double and half-angle versions. Derive the double-angle ones from the sum formulas and you'll only need to remember two." },
    { id: 'tg.equations', name: 'Solving Trig Equations', icon: 'solution', tier: 'advanced', requires: ['tg.identities', 'tg.inverse'], state: lock, percent: 0, xp: 2000,
      desc: 'Finding every angle that works. Answers repeat around the circle, so read the interval in the question before you stop.' },
    { id: 'tg.laws', name: 'Law of Sines & Cosines', icon: 'triad', tier: 'advanced', requires: ['tg.solve', 'tg.identities'], state: lock, percent: 0, xp: 2100,
      desc: "Solving triangles that don't have a right angle. Use sines for matching pairs and cosines when you know two sides and the angle between them." },
    { id: 'tg.ambiguous', name: 'Area & the Ambiguous Case', icon: 'shapes', tier: 'expert', requires: ['tg.laws'], state: lock, percent: 0, xp: 2500,
      desc: 'Half ab sin C, and the side-side-angle setup that can give zero, one or two triangles. Tests love the ambiguous case because most people stop at one answer.' },
    { id: 'tg.vectors', name: 'Vectors & Components', icon: 'vector-add', tier: 'expert', requires: ['tg.laws'], state: lock, percent: 0, xp: 2600,
      desc: 'Splitting a force or velocity into horizontal and vertical parts with sine and cosine. This is where trig shows up in physics class.' },
    { id: 'tg.polar', name: 'Polar Coordinates', icon: 'coordinate-plane', tier: 'expert', requires: ['tg.unit', 'tg.graphs'], state: lock, percent: 0, xp: 2300,
      desc: 'Points described by a distance and an angle. Roses and spirals that are messy in x and y become one short equation.' },
    { id: 'tg.complex', name: 'Complex Numbers in Trig Form', icon: 'cycle', tier: 'mastery', requires: ['tg.polar', 'tg.sumdiff'], state: lock, percent: 0, xp: 2700,
      desc: "Writing complex numbers with a length and an angle, then using De Moivre's theorem to raise them to powers. It ties algebra, geometry and trig together." },
    { id: 'tg.model', name: 'Modeling Repeating Things', icon: 'sunlight', tier: 'mastery', requires: ['tg.graphs', 'tg.equations'], state: lock, percent: 0, xp: 2800,
      desc: 'Using sine curves to model tides, daylight hours and Ferris wheels. Pick the midline and amplitude from the data first, then the period.' },
  ],
};

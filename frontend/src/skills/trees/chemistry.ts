/**
 * Chemistry — a branch of Science.
 *
 * The mole sits early and gates most of what follows, because every quantitative
 * question in the subject is the same question underneath: how many particles,
 * and how do you count them without seeing them.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const CHEMISTRY: SubjectTree = {
  id: 'chemistry',
  title: 'Chemistry',
  blurb: 'What matter is made of, and what happens when you put two of them together.',
  parent: 'science',
  nodes: [
    { id: 'ch.matter', name: 'States of Matter', icon: 'states-matter', tier: 'foundation', core: true, state: open, percent: 20, xp: 1200,
      desc: 'Solid, liquid and gas as three arrangements of the same particles with different energies. Almost every everyday chemical fact is a statement about how tightly particles are held and how fast they move.' },
    { id: 'ch.atoms', name: 'Atoms & Elements', icon: 'atoms', tier: 'foundation', core: true, requires: ['ch.matter'], state: lock, percent: 0, xp: 1400,
      desc: 'Protons decide what element it is, neutrons decide the isotope, electrons decide the chemistry. Everything else in the subject is a consequence of that last one.' },
    { id: 'ch.periodic', name: 'The Periodic Table', icon: 'periodic', tier: 'foundation', requires: ['ch.atoms'], state: lock, percent: 0, xp: 1500,
      desc: 'The elements arranged so that a column shares behavior. It is a prediction machine rather than a reference list: position tells you reactivity, size and what charge an atom is likely to take.' },
    { id: 'ch.electrons', name: 'Electron Configuration', icon: 'orbital', tier: 'beginner', requires: ['ch.periodic'], state: lock, percent: 0, xp: 1700,
      desc: 'Where electrons sit around a nucleus, in shells and orbitals with room for a fixed number each. The outermost shell being full or nearly full explains why the noble gases do nothing and the halogens do everything.' },
    { id: 'ch.bond', name: 'Bonding', icon: 'bond', tier: 'beginner', core: true, requires: ['ch.electrons'], state: lock, percent: 0, xp: 1800,
      desc: 'Atoms sharing or transferring electrons to reach a stable arrangement. Ionic, covalent and metallic are three answers to one question, and which one you get is largely readable off the periodic table.' },
    { id: 'ch.shapes', name: 'Molecular Shape', icon: 'molecule', tier: 'beginner', requires: ['ch.bond'], state: lock, percent: 0, xp: 1700,
      desc: 'Electron pairs pushing each other apart, giving molecules definite three-dimensional shapes. Shape decides polarity, polarity decides solubility, and that chain is why water behaves as it does.' },
    { id: 'ch.mole', name: 'The Mole', icon: 'mole', tier: 'intermediate', core: true, requires: ['ch.atoms'], state: lock, percent: 0, xp: 1900,
      desc: 'A count, like a dozen, chosen so that atomic mass in grams contains one of them. It is the bridge between the mass you can weigh and the number of particles that actually react.' },
    { id: 'ch.formula', name: 'Formulae & Equations', icon: 'chem-equation', tier: 'intermediate', requires: ['ch.mole', 'ch.shapes'], state: lock, percent: 0, xp: 1800,
      desc: 'Writing what reacted and what came out, balanced so no atoms appear or vanish. The balancing is conservation of mass written down, not a puzzle convention.' },
    { id: 'ch.stoich', name: 'Stoichiometry', icon: 'balance-scale', tier: 'intermediate', requires: ['ch.formula'], state: lock, percent: 0, xp: 2000,
      desc: 'Using the equation as a recipe: how much of this makes how much of that. Finding the reagent that runs out first is the step that converts a chemical question into an arithmetic one.' },
    { id: 'ch.solutions', name: 'Solutions & Concentration', icon: 'solution', tier: 'intermediate', requires: ['ch.stoich'], state: lock, percent: 0, xp: 1800,
      desc: 'Dissolving, and saying how much is dissolved per unit of solution. Nearly all reactions you will meet happen in solution, because particles have to meet to react.' },
    { id: 'ch.reactions', name: 'Reaction Types', icon: 'reaction', tier: 'intermediate', requires: ['ch.formula'], state: lock, percent: 0, xp: 1800,
      desc: 'The handful of patterns most reactions fall into — combination, decomposition, displacement, combustion. Recognizing the pattern lets you predict products you have never been taught.' },
    { id: 'ch.energy', name: 'Energy in Reactions', icon: 'energy', tier: 'advanced', requires: ['ch.reactions'], state: lock, percent: 0, xp: 2000,
      desc: 'Breaking bonds costs energy and making them releases it; the difference is what you feel as hot or cold. It also explains why a reaction that releases energy overall still needs a match.' },
    { id: 'ch.rates', name: 'Reaction Rates', icon: 'rate', tier: 'advanced', requires: ['ch.energy', 'ch.solutions'], state: lock, percent: 0, xp: 2100,
      desc: 'How fast, and the four things that change it: concentration, temperature, surface area and a catalyst. All four work through the same mechanism — how often particles collide hard enough.' },
    { id: 'ch.equilibrium', name: 'Equilibrium', icon: 'equilibrium', tier: 'advanced', core: true, requires: ['ch.rates'], state: lock, percent: 0, xp: 2300,
      desc: 'Reactions that run both ways at once and settle where the two rates match. Nothing has stopped at equilibrium, which is why disturbing it makes the mixture visibly shift to absorb the change.' },
    { id: 'ch.acids', name: 'Acids & Bases', icon: 'acid', tier: 'advanced', requires: ['ch.equilibrium'], state: lock, percent: 0, xp: 2100,
      desc: 'Donating and accepting protons, measured on a scale where each step is a factor of ten. Buffers resisting change are what keep blood and seawater within the narrow band life needs.' },
    { id: 'ch.redox', name: 'Oxidation & Reduction', icon: 'redox', tier: 'advanced', requires: ['ch.energy'], state: lock, percent: 0, xp: 2200,
      desc: 'Electrons moving from one species to another, always in pairs of half-reactions. Rusting, respiration and every battery are the same accounting done in different settings.' },
    { id: 'ch.electro', name: 'Electrochemistry', icon: 'battery', tier: 'expert', requires: ['ch.redox', 'ch.acids'], state: lock, percent: 0, xp: 2400,
      desc: 'Driving a redox reaction with electricity or getting electricity out of one. Cells, plating and corrosion protection all fall out of putting the two half-reactions in separate compartments.' },
    { id: 'ch.organic', name: 'Organic Chemistry', icon: 'benzene', tier: 'expert', core: true, requires: ['ch.shapes', 'ch.reactions'], state: lock, percent: 0, xp: 2600,
      desc: 'The chemistry of carbon, which bonds four ways and to itself indefinitely. Functional groups are the vocabulary: learn what each one does and a million compounds become a few dozen behaviors.' },
    { id: 'ch.lab', name: 'Laboratory Practice', icon: 'titration', tier: 'expert', requires: ['ch.solutions'], state: lock, percent: 0, xp: 2200,
      desc: 'Measuring, titrating, purifying and recording it so somebody else could repeat it. Technique is where the uncertainty in a result actually comes from, long before the arithmetic.' },
    { id: 'ch.analysis', name: 'Analytical Chemistry', icon: 'spectrum', tier: 'mastery', requires: ['ch.lab', 'ch.organic', 'ch.electro'], state: lock, percent: 0, xp: 3000,
      desc: 'Working out what a sample actually contains, by spectroscopy, chromatography and titration. Identification and quantification are separate problems, and most real questions need both answered.' },
  ],
};

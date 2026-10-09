/**
 * Science Olympiad — a branch of Science.
 *
 * F=ma, USNCO, USABO and the Science Olympiad events, which are one tree
 * rather than three because the thing being trained is shared and the content
 * is not. A selection exam is a fixed number of minutes against problems
 * written to separate the top two percent, and what separates them is almost
 * never recall.
 *
 * ## Three chains from one root, and they only meet at the end
 *
 * Physics, chemistry and biology run as parallel spines because a competitor
 * sits one of them, or sits three and is strong in one. Making stoichiometry
 * depend on kinematics would be inventing a dependency nobody's syllabus has.
 * What they *do* share is the top: units, uncertainty and the discipline of
 * reading the question before reaching for a formula.
 *
 * ## Estimation is a foundation node
 *
 * It sits at the top with the units because on a paper with five answer
 * choices, knowing the answer is around ten and not around ten thousand often
 * finishes the problem. It is also the check that catches the algebra slip,
 * which is the way most of these points are actually lost.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const OLYMPIAD_SCIENCE: SubjectTree = {
  id: 'olympiad-science',
  title: 'Science Olympiad',
  blurb: 'F=ma, USNCO, USABO — selection exams, and what actually separates them.',
  parent: 'science',
  nodes: [
    { id: 'os.method', name: 'Reading the Question', icon: 'scientific-method', tier: 'foundation', core: true, state: open, percent: 15, xp: 1200,
      desc: 'Working out what is being asked and what has quietly been given, before any formula is written down. Olympiad problems hide the given quantity in a clause, and the reach for an equation is what walks past it.' },
    { id: 'os.units', name: 'Units & Estimation', icon: 'measurement', tier: 'foundation', core: true, requires: ['os.method'], state: lock, percent: 0, xp: 1300,
      desc: 'Carrying units through an expression so a wrong one announces itself, and knowing the order of magnitude before computing. On a multiple-choice paper the estimate frequently is the answer.' },
    { id: 'os.error', name: 'Uncertainty', icon: 'error-bars', tier: 'beginner', requires: ['os.units'], state: lock, percent: 0, xp: 1500,
      desc: 'How error in a measurement propagates into everything computed from it, and how many figures you are entitled to report. The lab events grade this directly and the written papers assume it.' },
    { id: 'os.freebody', name: 'Free-Body Diagrams', icon: 'free-body', tier: 'beginner', core: true, requires: ['os.units'], state: lock, percent: 0, xp: 1500,
      desc: 'Every force on one object and nothing else on the page. Almost every mechanics mistake at this level is a force drawn that was not acting, or one acting that was not drawn.' },
    { id: 'os.stoich', name: 'Stoichiometry', icon: 'mole', tier: 'beginner', core: true, requires: ['os.units'], state: lock, percent: 0, xp: 1500,
      desc: 'Counting particles by weighing them, and the ratio a balanced equation actually asserts. The limiting reagent is where this is tested, because it is where the arithmetic stops being proportional.' },
    { id: 'os.cell', name: 'Cell Biology', icon: 'cells', tier: 'beginner', core: true, requires: ['os.method'], state: lock, percent: 0, xp: 1500,
      desc: 'Membranes, organelles and the reactions that pay for everything a cell does. Olympiad biology assumes this the way olympiad physics assumes algebra — as vocabulary rather than as content.' },
    { id: 'os.kinematics', name: 'Kinematics & Dynamics', icon: 'kinematics', tier: 'intermediate', requires: ['os.freebody'], state: lock, percent: 0, xp: 1700,
      desc: 'Position, velocity and acceleration as one another’s derivatives, and Newton’s laws applied to a diagram you drew correctly. Choosing the axes well is worth more than any algebraic technique here.' },
    { id: 'os.energy', name: 'Energy & Momentum', icon: 'energy', tier: 'intermediate', core: true, requires: ['os.kinematics'], state: lock, percent: 0, xp: 1800,
      desc: 'Conservation laws, and knowing which one survives a given collision. They turn problems that are brutal in forces into two lines of arithmetic, which is exactly why the paper is written to obscure that they apply.' },
    { id: 'os.equilibrium', name: 'Chemical Equilibrium', icon: 'equilibrium', tier: 'intermediate', requires: ['os.stoich'], state: lock, percent: 0, xp: 1800,
      desc: 'Reactions that arrive somewhere and stop, and what shifts them. Le Chatelier gives the direction in a sentence; the equilibrium constant is what makes it a number.' },
    { id: 'os.redox', name: 'Redox & Electrochemistry', icon: 'redox', tier: 'intermediate', requires: ['os.stoich'], state: lock, percent: 0, xp: 1800,
      desc: 'Tracking electrons through a reaction and the voltage that transfer is worth. Balancing a half-reaction in acid is mechanical, heavily examined, and dropped by people who never practiced it under time.' },
    { id: 'os.genetics', name: 'Genetics', icon: 'dna', tier: 'intermediate', requires: ['os.cell'], state: lock, percent: 0, xp: 1700,
      desc: 'Inheritance as probability, from a cross through linkage to population frequencies. The pedigree questions are logic puzzles wearing a lab coat, which is why they reward practice rather than reading.' },
    { id: 'os.physiology', name: 'Physiology', icon: 'organs', tier: 'intermediate', requires: ['os.cell'], state: lock, percent: 0, xp: 1700,
      desc: 'Systems that hold a body at a set point, and what the feedback loop does when it is pushed. Homeostasis is the through-line, and an answer that does not name a feedback mechanism is usually incomplete.' },
    { id: 'os.fma', name: 'The F=ma Exam', icon: 'forces', tier: 'advanced', core: true, requires: ['os.energy', 'os.error'], state: lock, percent: 0, xp: 2300,
      desc: 'Twenty-five mechanics problems in seventy-five minutes with no calculator, which makes it a test of setup speed rather than of depth. The estimate and the free-body diagram between them decide most of the score.' },
    { id: 'os.thermo', name: 'Thermodynamics', icon: 'entropy', tier: 'advanced', requires: ['os.energy', 'os.equilibrium'], state: lock, percent: 0, xp: 2200,
      desc: 'Energy, entropy and which direction a process will go on its own. It is the one topic both the physics and the chemistry ladders examine, from opposite ends and with different notation.' },
    { id: 'os.ecology', name: 'Ecology & Evolution', icon: 'evolution', tier: 'advanced', requires: ['os.genetics'], state: lock, percent: 0, xp: 2000,
      desc: 'Populations changing over time, under selection and under each other. The quantitative half — Hardy-Weinberg, growth models — is what the olympiad rounds actually test.' },
    { id: 'os.lab', name: 'The Lab Practical', icon: 'lab', tier: 'advanced', requires: ['os.error'], state: lock, percent: 0, xp: 2100,
      desc: 'Doing the measurement, recording it honestly, and writing the uncertainty beside it under a time limit. Graded on the notebook as much as the number, which is a shock to people who only ever sat written papers.' },
    { id: 'os.emag', name: 'Electricity & Magnetism', icon: 'electric-field', tier: 'expert', requires: ['os.fma'], state: lock, percent: 0, xp: 2500,
      desc: 'Fields, potential and the fact that a changing one of each makes the other. The second semester exam assumes calculus fluency in a way the mechanics paper does not.' },
    { id: 'os.usnco', name: 'Chemistry Olympiad', icon: 'titration', tier: 'expert', requires: ['os.thermo', 'os.redox'], state: lock, percent: 0, xp: 2600,
      desc: 'A national exam with a laboratory part, where the written half rewards breadth and the practical half rewards having actually handled glassware. Very few competitors are strong at both.' },
    { id: 'os.usabo', name: 'Biology Olympiad', icon: 'microscope', tier: 'expert', requires: ['os.ecology', 'os.physiology'], state: lock, percent: 0, xp: 2600,
      desc: 'The broadest syllabus of the three by a distance, examined at a depth textbooks do not reach. Semifinalists are separated by reading primary literature rather than by revising harder.' },
    { id: 'os.quantum', name: 'Modern Physics', icon: 'quantum', tier: 'expert', requires: ['os.emag', 'os.thermo'], state: lock, percent: 0, xp: 2700,
      desc: 'Relativity and quantization, where the classical answer is confidently wrong. It appears late in the selection ladder and rewards understanding the postulates over memorizing the results.' },
    { id: 'os.camp', name: 'Selection Camp', icon: 'trophy', tier: 'mastery', requires: ['os.quantum', 'os.usnco', 'os.usabo', 'os.lab'], state: lock, percent: 0, xp: 3200,
      desc: 'The round after the national exam, where problems take hours rather than minutes and a partial argument is worth writing. Everything below converges here because nothing at this level announces its topic.' },
  ],
};

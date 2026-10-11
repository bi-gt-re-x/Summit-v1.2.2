/**
 * Organic Chemistry, a branch of Chemistry.
 *
 * The two-semester college course, ordered so that mechanisms come from
 * understanding electrons rather than from a list of reactions.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const ORGANIC_CHEMISTRY: SubjectTree = {
  id: 'organic-chemistry',
  title: 'Organic Chemistry',
  blurb: 'Carbon, curved arrows and the class with a reputation.',
  parent: 'chemistry',
  nodes: [
    { id: 'oc.carbon', name: 'Why Carbon', icon: 'atoms', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: "Carbon makes four bonds and loves bonding to itself. That's why there are millions of organic compounds and why this class has its own reputation." },
    { id: 'oc.skeletal', name: 'Skeletal Structures', icon: 'molecule', tier: 'foundation', requires: ['oc.carbon'], state: lock, percent: 0, xp: 1200,
      desc: "Drawing molecules as zigzag lines with the hydrogens left out. You'll draw thousands of these, so get fast and get neat." },
    { id: 'oc.naming', name: 'Naming Compounds', icon: 'label', tier: 'beginner', requires: ['oc.skeletal'], state: lock, percent: 0, xp: 1600,
      desc: 'IUPAC names from the longest chain and its branches. Naming feels like busywork until you need to read a lab procedure.' },
    { id: 'oc.groups', name: 'Functional Groups', icon: 'puzzle', tier: 'beginner', core: true, requires: ['oc.skeletal'], state: lock, percent: 0, xp: 1700,
      desc: 'Alcohols, ketones, amines, acids and the rest. The group decides how a molecule reacts, so knowing them on sight is the whole game.' },
    { id: 'oc.resonance', name: 'Resonance', icon: 'resonance', tier: 'beginner', requires: ['oc.skeletal'], state: lock, percent: 0, xp: 1400,
      desc: 'One molecule, several drawings, and the real thing is a blend. Push electrons with curved arrows and leave the atoms where they are.' },
    { id: 'oc.acidbase', name: 'Acids & Bases in Orgo', icon: 'acid', tier: 'intermediate', core: true, requires: ['oc.resonance', 'oc.groups'], state: lock, percent: 0, xp: 1800,
      desc: 'pKa tables and what makes a proton easy to pull off. Almost every mechanism starts with an acid-base step, so this pays off all year.' },
    { id: 'oc.shape', name: 'Conformations', icon: 'form-3d', tier: 'intermediate', requires: ['oc.skeletal'], state: lock, percent: 0, xp: 1900,
      desc: 'Newman projections and chair cyclohexanes. Build a model kit once and these stop being flat puzzles.' },
    { id: 'oc.stereo', name: 'Stereochemistry', icon: 'hands', tier: 'intermediate', core: true, requires: ['oc.shape'], state: lock, percent: 0, xp: 2000,
      desc: "Chirality, R and S, and molecules that are mirror images. It's the topic most students find hardest to see, so use models." },
    { id: 'oc.arrows', name: 'Curved Arrows & Mechanisms', icon: 'flow', tier: 'intermediate', requires: ['oc.acidbase'], state: lock, percent: 0, xp: 1700,
      desc: "Showing where electrons go in a reaction. Memorizing reactions doesn't scale. Understanding arrows does." },
    { id: 'oc.subst', name: 'SN1 & SN2', icon: 'transition', tier: 'advanced', requires: ['oc.arrows', 'oc.stereo'], state: lock, percent: 0, xp: 2100,
      desc: 'Substitution reactions and how to tell which path wins. Look at the substrate, the nucleophile, the leaving group and the solvent.' },
    { id: 'oc.elim', name: 'E1 & E2', icon: 'trim', tier: 'advanced', requires: ['oc.subst'], state: lock, percent: 0, xp: 2200,
      desc: 'Elimination reactions that make double bonds, and how they compete with substitution. Bulky bases change who wins, so watch for them.' },
    { id: 'oc.alkenes', name: 'Alkene Reactions', icon: 'bond', tier: 'advanced', requires: ['oc.elim'], state: lock, percent: 0, xp: 2300,
      desc: "Adding things across a double bond. Markovnikov's rule and its exceptions cover most exam questions." },
    { id: 'oc.carbonyl', name: 'Carbonyl Chemistry', icon: 'reaction', tier: 'expert', requires: ['oc.arrows', 'oc.groups'], state: lock, percent: 0, xp: 2300,
      desc: 'Aldehydes, ketones and the reactions at the C=O. The carbon is slightly positive, and nearly everything follows from that.' },
    { id: 'oc.synthesis', name: 'Multistep Synthesis', icon: 'route', tier: 'expert', core: true, requires: ['oc.alkenes', 'oc.carbonyl'], state: lock, percent: 0, xp: 2400,
      desc: 'Planning how to build a target from simple starting materials. Work backwards from the product, one bond at a time.' },
    { id: 'oc.aromatic', name: 'Aromatic Rings', icon: 'benzene', tier: 'expert', requires: ['oc.resonance', 'oc.alkenes'], state: lock, percent: 0, xp: 2500,
      desc: "Benzene and why it's so stable. Electrophilic substitution and directing groups are the heart of second-semester orgo." },
    { id: 'oc.spectro', name: 'IR & NMR', icon: 'spectrum', tier: 'expert', requires: ['oc.groups'], state: lock, percent: 0, xp: 2600,
      desc: 'Reading a spectrum to work out a structure. Start with the IR for functional groups, then let the NMR count the hydrogens.' },
    { id: 'oc.lab', name: 'Orgo Lab Skills', icon: 'lab', tier: 'expert', requires: ['oc.spectro'], state: lock, percent: 0, xp: 2300,
      desc: 'Recrystallization, distillation, extraction and TLC. Good technique is how you get a yield worth writing up.' },
    { id: 'oc.biomol', name: 'Biomolecules', icon: 'biomolecule', tier: 'mastery', requires: ['oc.synthesis', 'oc.aromatic'], state: lock, percent: 0, xp: 2700,
      desc: 'Sugars, amino acids and fats seen as organic molecules. This is where orgo connects to biochem and the MCAT.' },
  ],
};

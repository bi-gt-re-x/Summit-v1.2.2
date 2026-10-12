/**
 * Genetics, a branch of Biology.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const GENETICS: SubjectTree = {
  id: 'genetics',
  title: 'Genetics',
  blurb: 'How traits pass from parents to kids, and how DNA makes that happen.',
  parent: 'biology',
  nodes: [
    { id: 'gn.dna', name: 'DNA Structure', icon: 'dna', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'The double helix, base pairing and how DNA copies itself. A pairs with T and C pairs with G, every single time.' },
    { id: 'gn.chromosomes', name: 'Genes & Chromosomes', icon: 'strata', tier: 'foundation', requires: ['gn.dna'], state: lock, percent: 0, xp: 1200,
      desc: 'How DNA is packed into chromosomes and where genes sit on them. Humans have 23 pairs.' },
    { id: 'gn.meiosis', name: 'Meiosis', icon: 'mitosis', tier: 'beginner', core: true, requires: ['gn.chromosomes'], state: lock, percent: 0, xp: 1600,
      desc: 'The cell division that makes eggs and sperm with half the chromosomes. Crossing over is where new combinations come from.' },
    { id: 'gn.mendel', name: "Mendel's Laws", icon: 'garden', tier: 'beginner', requires: ['gn.meiosis'], state: lock, percent: 0, xp: 1700,
      desc: 'Dominant and recessive traits, segregation and independent assortment. Mendel worked it all out with pea plants.' },
    { id: 'gn.punnett', name: 'Punnett Squares', icon: 'grid', tier: 'beginner', core: true, requires: ['gn.mendel'], state: lock, percent: 0, xp: 1400,
      desc: "Predicting the odds of a cross. They're probability tables, so treat them like one." },
    { id: 'gn.dihybrid', name: 'Dihybrid Crosses', icon: 'table', tier: 'intermediate', requires: ['gn.punnett'], state: lock, percent: 0, xp: 1800,
      desc: 'Two traits at once, and the classic 9:3:3:1 ratio. Multiplying probabilities beats drawing a sixteen-box square.' },
    { id: 'gn.nonmendel', name: 'Beyond Simple Dominance', icon: 'balance-scale', tier: 'intermediate', requires: ['gn.punnett'], state: lock, percent: 0, xp: 1900,
      desc: 'Incomplete dominance, codominance, multiple alleles and polygenic traits. Blood type is the go-to example.' },
    { id: 'gn.sexlinked', name: 'Sex-Linked Traits', icon: 'branch', tier: 'intermediate', requires: ['gn.punnett'], state: lock, percent: 0, xp: 2000,
      desc: 'Genes on the X chromosome, like color blindness. That is why some traits show up more in boys.' },
    { id: 'gn.pedigree', name: 'Pedigrees', icon: 'hierarchy', tier: 'intermediate', requires: ['gn.sexlinked', 'gn.nonmendel'], state: lock, percent: 0, xp: 1700,
      desc: 'Reading family trees to work out how a trait is inherited. Start with the clues that rule options out.' },
    { id: 'gn.expression', name: 'Gene Expression', icon: 'protein', tier: 'advanced', requires: ['gn.chromosomes'], state: lock, percent: 0, xp: 2100,
      desc: 'Transcription and translation, from DNA to RNA to protein. The codon chart is your decoder ring.' },
    { id: 'gn.regulation', name: 'Gene Regulation', icon: 'switch-cost', tier: 'advanced', requires: ['gn.expression'], state: lock, percent: 0, xp: 2200,
      desc: 'How cells turn genes on and off. Every cell has the same DNA, so regulation is why a skin cell is not a neuron.' },
    { id: 'gn.mutations', name: 'Mutations', icon: 'mutation', tier: 'advanced', requires: ['gn.expression'], state: lock, percent: 0, xp: 2300,
      desc: 'Point mutations, frameshifts and chromosome changes. Most are harmless, and a few cause disease or new traits.' },
    { id: 'gn.popgen', name: 'Population Genetics', icon: 'population', tier: 'expert', requires: ['gn.dihybrid', 'gn.mutations'], state: lock, percent: 0, xp: 2300,
      desc: 'Hardy-Weinberg and how allele frequencies change. It connects genetics straight to evolution.' },
    { id: 'gn.biotech', name: 'Biotech Tools', icon: 'gene-edit', tier: 'expert', requires: ['gn.regulation'], state: lock, percent: 0, xp: 2400,
      desc: 'PCR, gel electrophoresis and CRISPR. These are the tools behind DNA tests and gene therapy.' },
    { id: 'gn.disorders', name: 'Genetic Disorders', icon: 'warning', tier: 'expert', requires: ['gn.pedigree', 'gn.mutations'], state: lock, percent: 0, xp: 2500,
      desc: 'Cystic fibrosis, sickle cell, Down syndrome and more. Link each one to the kind of mutation behind it.' },
    { id: 'gn.ethics', name: 'Genetics & Ethics', icon: 'ethics', tier: 'mastery', requires: ['gn.biotech', 'gn.disorders', 'gn.popgen'], state: lock, percent: 0, xp: 2900,
      desc: 'Designer babies, genetic privacy and testing. Good answers weigh real benefits against real risks.' },
  ],
};

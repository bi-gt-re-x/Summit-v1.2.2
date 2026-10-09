/**
 * Biology — a branch of Science.
 *
 * Cells first, then the two directions the subject runs in: inward to molecules
 * and genes, outward to bodies, populations and ecosystems. Evolution is placed
 * late deliberately — it is the explanation everything else has been quietly
 * needing, and it lands better once there is something to explain.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const BIOLOGY: SubjectTree = {
  id: 'biology',
  title: 'Biology',
  blurb: 'From one cell to a whole ecosystem, and the one idea that ties them together.',
  parent: 'science',
  nodes: [
    { id: 'bi.life', name: 'What Life Is', icon: 'life', tier: 'foundation', core: true, state: open, percent: 20, xp: 1200,
      desc: 'The shared properties of living things: organization, metabolism, response, reproduction. The borderline cases are the interesting part, which is why a virus is still argued about.' },
    { id: 'bi.cells', name: 'Cells', icon: 'cells', tier: 'foundation', core: true, requires: ['bi.life'], state: lock, percent: 0, xp: 1500,
      desc: 'The smallest unit that is alive, and the compartments inside it that do separate jobs. Every organism is one of these or a colony of them cooperating.' },
    { id: 'bi.membrane', name: 'Membranes & Transport', icon: 'membrane', tier: 'foundation', requires: ['bi.cells'], state: lock, percent: 0, xp: 1500,
      desc: 'A boundary that decides what gets in and out, some of it for free and some at a cost. Osmosis is the case worth being fluent in, because it explains wilting, swelling and why saltwater dehydrates you.' },
    { id: 'bi.molecules', name: 'Biological Molecules', icon: 'biomolecule', tier: 'beginner', requires: ['bi.cells'], state: lock, percent: 0, xp: 1600,
      desc: 'Carbohydrates, lipids, proteins and nucleic acids — four families doing nearly everything. Structure predicts function throughout, which is why a change to one amino acid can break an entire organism.' },
    { id: 'bi.enzymes', name: 'Enzymes', icon: 'enzyme', tier: 'beginner', requires: ['bi.molecules'], state: lock, percent: 0, xp: 1700,
      desc: 'Proteins that make a specific reaction fast enough to be useful at body temperature. Their shape is the whole mechanism, which is why heat and the wrong acidity destroy them permanently.' },
    { id: 'bi.respiration', name: 'Respiration', icon: 'respiration', tier: 'beginner', core: true, requires: ['bi.enzymes', 'bi.membrane'], state: lock, percent: 0, xp: 1800,
      desc: 'Releasing energy from food into a form a cell can spend. The aerobic route yields far more than the anaerobic one, which is exactly why muscles burn when the oxygen runs short.' },
    { id: 'bi.photo', name: 'Photosynthesis', icon: 'photosynthesis', tier: 'beginner', requires: ['bi.enzymes'], state: lock, percent: 0, xp: 1800,
      desc: 'Building sugar out of air and water using light. Nearly every calorie in every food chain entered biology through this reaction, which makes it the most important one on the planet.' },
    { id: 'bi.dna', name: 'DNA', icon: 'dna', tier: 'intermediate', core: true, requires: ['bi.molecules'], state: lock, percent: 0, xp: 1900,
      desc: 'A four-letter code that stores instructions and copies itself accurately. The pairing rule is the whole trick: each strand carries enough information to rebuild the other.' },
    { id: 'bi.protein', name: 'Protein Synthesis', icon: 'ribosome', tier: 'intermediate', requires: ['bi.dna'], state: lock, percent: 0, xp: 2000,
      desc: 'Copying a gene and translating it three letters at a time into a chain of amino acids. This is where a sequence stops being information and starts being a working machine.' },
    { id: 'bi.division', name: 'Cell Division', icon: 'mitosis', tier: 'intermediate', requires: ['bi.dna'], state: lock, percent: 0, xp: 1900,
      desc: 'One cell becoming two identical ones for growth, or four half-loaded ones for reproduction. The second kind shuffles the deck, which is where most of the variation in a population comes from.' },
    { id: 'bi.genetics', name: 'Genetics', icon: 'genetics', tier: 'intermediate', core: true, requires: ['bi.division'], state: lock, percent: 0, xp: 2100,
      desc: 'How traits pass down, and why an unexpressed variant can reappear generations later. The simple dominant and recessive cases are the exception; most traits are many genes and an environment.' },
    { id: 'bi.mutation', name: 'Mutation & Variation', icon: 'mutation', tier: 'advanced', requires: ['bi.genetics', 'bi.protein'], state: lock, percent: 0, xp: 2100,
      desc: 'Copying errors and damage, most of which do nothing and some of which change a protein. Variation is not a defect in the system; without it a population cannot respond to anything.' },
    { id: 'bi.evolution', name: 'Evolution', icon: 'evolution', tier: 'advanced', core: true, requires: ['bi.mutation'], state: lock, percent: 0, xp: 2400,
      desc: 'Heritable variation plus differential survival, repeated. It requires no foresight and no goal, which is the part that is genuinely hard to hold onto while reading about adaptation.' },
    { id: 'bi.taxonomy', name: 'Classification', icon: 'taxonomy', tier: 'advanced', requires: ['bi.evolution'], state: lock, percent: 0, xp: 1900,
      desc: 'Grouping organisms by shared ancestry rather than by resemblance. Convergence is why a dolphin and a shark look alike and sit nowhere near each other on the tree.' },
    { id: 'bi.organs', name: 'Organ Systems', icon: 'organs', tier: 'intermediate', requires: ['bi.respiration'], state: lock, percent: 0, xp: 1900,
      desc: 'Cells into tissues into organs into systems, each solving a problem that a single cell solves by diffusion alone. Size is the reason multicellular life needs any of this machinery.' },
    { id: 'bi.homeo', name: 'Homeostasis', icon: 'homeostasis', tier: 'advanced', requires: ['bi.organs'], state: lock, percent: 0, xp: 2100,
      desc: 'Holding internal conditions steady while the outside moves, by negative feedback. Temperature, blood sugar and water balance are three instances of one control pattern.' },
    { id: 'bi.nervous', name: 'Nerves & Hormones', icon: 'neuron', tier: 'advanced', requires: ['bi.homeo'], state: lock, percent: 0, xp: 2200,
      desc: 'Two signaling systems: one electrical and fast down a fixed wire, one chemical and slow but reaching everywhere. Which one a body uses for a job is decided by how quickly the answer is needed.' },
    { id: 'bi.immune', name: 'Immunity', icon: 'immune', tier: 'expert', requires: ['bi.nervous', 'bi.protein'], state: lock, percent: 0, xp: 2400,
      desc: 'Distinguishing self from not-self, and remembering an intruder well enough to answer faster next time. Vaccination is that memory installed without the illness that would normally create it.' },
    { id: 'bi.ecology', name: 'Ecology', icon: 'ecosystem', tier: 'advanced', requires: ['bi.photo', 'bi.taxonomy'], state: lock, percent: 0, xp: 2200,
      desc: 'Organisms interacting with each other and with the physical world. Energy flows through and is lost at each step; matter cycles round, which is why food chains are short and nutrients are not.' },
    { id: 'bi.population', name: 'Populations', icon: 'population', tier: 'expert', requires: ['bi.ecology'], state: lock, percent: 0, xp: 2300,
      desc: 'Growth, limits and the interactions that hold numbers where they are. Exponential growth meeting a ceiling is the model behind conservation, epidemics and pest control alike.' },
    { id: 'bi.biotech', name: 'Biotechnology', icon: 'gene-edit', tier: 'mastery', requires: ['bi.immune', 'bi.population'], state: lock, percent: 0, xp: 3000,
      desc: 'Reading, editing and building with the same molecules. The techniques are now routine enough that the interesting constraints are ethical and ecological rather than technical.' },
  ],
};

/**
 * Ecology, a branch of Biology.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const ECOLOGY: SubjectTree = {
  id: 'ecology',
  title: 'Ecology',
  blurb: 'How living things interact with each other and their world.',
  parent: 'biology',
  nodes: [
    { id: 'eco.levels', name: 'Levels of Ecology', icon: 'layers', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Organism, population, community, ecosystem and biosphere. Know which level a question is asking about before you answer it.' },
    { id: 'eco.biomes', name: 'Biomes', icon: 'globe', tier: 'foundation', requires: ['eco.levels'], state: lock, percent: 0, xp: 1200,
      desc: 'Deserts, forests, tundra, grasslands and oceans. Temperature and rainfall decide which biome you get.' },
    { id: 'eco.energy', name: 'Energy Flow', icon: 'energy', tier: 'beginner', core: true, requires: ['eco.levels'], state: lock, percent: 0, xp: 1600,
      desc: 'Producers, consumers and decomposers, and the ten percent rule. Energy flows through a system and leaks out as heat.' },
    { id: 'eco.webs', name: 'Food Webs', icon: 'graph-nodes', tier: 'beginner', requires: ['eco.energy'], state: lock, percent: 0, xp: 1700,
      desc: 'Who eats whom, drawn as a web. Pull out one species and predict the ripple effects.' },
    { id: 'eco.cycles', name: 'Nutrient Cycles', icon: 'cycle', tier: 'beginner', requires: ['eco.energy'], state: lock, percent: 0, xp: 1400,
      desc: 'Carbon, nitrogen and water moving through living and nonliving things. Draw each cycle from memory.' },
    { id: 'eco.growth', name: 'Population Growth', icon: 'growth-curve', tier: 'intermediate', core: true, requires: ['eco.levels'], state: lock, percent: 0, xp: 1800,
      desc: 'Exponential and logistic growth and carrying capacity. Real populations rarely grow without limits for long.' },
    { id: 'eco.limits', name: 'Limiting Factors', icon: 'constraint', tier: 'intermediate', requires: ['eco.growth'], state: lock, percent: 0, xp: 1900,
      desc: 'Food, space, predators and disease that hold populations in check. Some depend on density and some do not.' },
    { id: 'eco.interactions', name: 'Species Interactions', icon: 'connected-components', tier: 'intermediate', requires: ['eco.webs'], state: lock, percent: 0, xp: 2000,
      desc: 'Predation, competition, mutualism and parasitism. Each one has a plus, minus or zero for each side.' },
    { id: 'eco.niche', name: 'Niches', icon: 'target', tier: 'intermediate', requires: ['eco.interactions'], state: lock, percent: 0, xp: 1700,
      desc: 'The role a species plays and the resources it uses. Two species cannot share the exact same niche for long.' },
    { id: 'eco.succession', name: 'Succession', icon: 'timeline', tier: 'advanced', requires: ['eco.niche', 'eco.limits'], state: lock, percent: 0, xp: 2100,
      desc: 'How communities rebuild after a fire or a new island forms. Pioneer species come first and change the place for the next ones.' },
    { id: 'eco.diversity', name: 'Biodiversity', icon: 'taxonomy', tier: 'advanced', requires: ['eco.interactions'], state: lock, percent: 0, xp: 2200,
      desc: 'Why more species usually means a sturdier ecosystem. Keystone species hold more weight than their numbers suggest.' },
    { id: 'eco.field', name: 'Field Sampling', icon: 'observe', tier: 'advanced', requires: ['eco.growth'], state: lock, percent: 0, xp: 2300,
      desc: 'Quadrats, transects and mark-recapture. You can estimate a whole population without counting every animal.' },
    { id: 'eco.humans', name: 'Human Impact', icon: 'warning', tier: 'expert', requires: ['eco.diversity', 'eco.cycles'], state: lock, percent: 0, xp: 2300,
      desc: 'Habitat loss, invasive species, pollution and climate change. Link each threat to the ecological idea it breaks.' },
    { id: 'eco.conservation', name: 'Conservation', icon: 'shield', tier: 'expert', requires: ['eco.humans'], state: lock, percent: 0, xp: 2400,
      desc: 'Protected areas, corridors and restoration. Saving habitat saves more species than saving one at a time.' },
    { id: 'eco.project', name: 'An Ecology Project', icon: 'project', tier: 'mastery', requires: ['eco.conservation', 'eco.field', 'eco.succession'], state: lock, percent: 0, xp: 2800,
      desc: 'Studying a real local habitat over time. Great for science fair, and the data is all yours.' },
  ],
};

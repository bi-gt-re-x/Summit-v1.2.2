/**
 * Environmental Science, a branch of Science.
 *
 * Follows the APES units, so a student taking the course can work straight down it.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const ENVIRONMENTAL_SCIENCE: SubjectTree = {
  id: 'environmental-science',
  title: 'Environmental Science',
  blurb: 'How the planet works and what people are doing to it.',
  parent: 'science',
  nodes: [
    { id: 'ev.systems', name: 'Earth Systems', icon: 'earth-system', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Air, water, land and life all feeding into each other. APES questions almost always ask how a change in one spreads to the rest.' },
    { id: 'ev.cycles', name: 'Nutrient Cycles', icon: 'cycle', tier: 'foundation', requires: ['ev.systems'], state: lock, percent: 0, xp: 1200,
      desc: 'Carbon, nitrogen, phosphorus and water moving through the planet. Draw each cycle from memory and label where people interfere.' },
    { id: 'ev.ecosystems', name: 'Ecosystems & Energy', icon: 'ecosystem', tier: 'beginner', core: true, requires: ['ev.systems'], state: lock, percent: 0, xp: 1600,
      desc: 'Food webs and the 10 percent rule. Energy flows one way through a system, and matter keeps cycling.' },
    { id: 'ev.biodiversity', name: 'Biodiversity', icon: 'taxonomy', tier: 'beginner', requires: ['ev.ecosystems'], state: lock, percent: 0, xp: 1700,
      desc: 'Why more species make ecosystems tougher. Habitat loss is the biggest threat on the list.' },
    { id: 'ev.population', name: 'Population Growth', icon: 'population', tier: 'beginner', requires: ['ev.ecosystems'], state: lock, percent: 0, xp: 1400,
      desc: 'Carrying capacity, growth curves and human population trends. The demographic transition model shows up on almost every exam.' },
    { id: 'ev.soil', name: 'Soil & Land Use', icon: 'strata', tier: 'intermediate', requires: ['ev.cycles'], state: lock, percent: 0, xp: 1800,
      desc: 'How soil forms, erodes and gets used for farming. Good soil takes centuries to build and a few bad seasons to lose.' },
    { id: 'ev.water', name: 'Water Resources', icon: 'water', tier: 'intermediate', requires: ['ev.cycles'], state: lock, percent: 0, xp: 1900,
      desc: 'Aquifers, watersheds and who gets the water. Farming uses most of it, which surprises a lot of people.' },
    { id: 'ev.food', name: 'Food & Agriculture', icon: 'vegetable', tier: 'intermediate', requires: ['ev.soil', 'ev.population'], state: lock, percent: 0, xp: 2000,
      desc: 'Industrial farming, pesticides and sustainable options. Every choice trades yield for a cost somewhere else.' },
    { id: 'ev.energy', name: 'Energy Sources', icon: 'energy', tier: 'intermediate', core: true, requires: ['ev.systems'], state: lock, percent: 0, xp: 1700,
      desc: 'Fossil fuels, nuclear and renewables, with their pros and cons. Compare them on cost, reliability and pollution.' },
    { id: 'ev.air', name: 'Air Pollution', icon: 'atmosphere', tier: 'advanced', requires: ['ev.energy'], state: lock, percent: 0, xp: 2100,
      desc: 'Smog, acid rain and indoor air quality. Know the main pollutants and where each one comes from.' },
    { id: 'ev.waterpol', name: 'Water Pollution', icon: 'warning', tier: 'advanced', requires: ['ev.water'], state: lock, percent: 0, xp: 2200,
      desc: 'Runoff, dead zones and bioaccumulation. A little toxin at the bottom of a food chain becomes a lot at the top.' },
    { id: 'ev.waste', name: 'Waste & Recycling', icon: 'recycle', tier: 'advanced', requires: ['ev.food'], state: lock, percent: 0, xp: 2300,
      desc: 'Landfills, composting and what really happens to recycling. Using less always does more good than recycling more.' },
    { id: 'ev.climate', name: 'Climate Change', icon: 'climate', tier: 'advanced', core: true, requires: ['ev.air', 'ev.cycles'], state: lock, percent: 0, xp: 2000,
      desc: 'The greenhouse effect, feedback loops and the evidence. Be ready to explain the mechanism in plain words.' },
    { id: 'ev.impacts', name: 'Climate Impacts', icon: 'thermometer', tier: 'expert', requires: ['ev.climate', 'ev.biodiversity'], state: lock, percent: 0, xp: 2400,
      desc: 'Sea level rise, ocean acidification and shifting ranges. The impacts hit unevenly, which makes it a fairness question too.' },
    { id: 'ev.policy', name: 'Solutions & Policy', icon: 'agreement', tier: 'expert', requires: ['ev.impacts', 'ev.energy'], state: lock, percent: 0, xp: 2500,
      desc: 'Carbon pricing, regulations and international deals. Every fix has winners and losers, and good answers name both.' },
    { id: 'ev.frq', name: 'APES Free Response', icon: 'essay', tier: 'expert', requires: ['ev.waterpol', 'ev.population'], state: lock, percent: 0, xp: 2600,
      desc: 'Calculations, experiment design and explain-the-graph questions. Show your units and explain your reasoning in full sentences.' },
    { id: 'ev.field', name: 'Field Studies', icon: 'observe', tier: 'expert', requires: ['ev.biodiversity'], state: lock, percent: 0, xp: 2300,
      desc: 'Sampling plants, testing water and counting species outside. Real data is messy, so record everything as you go.' },
    { id: 'ev.project', name: 'A Local Project', icon: 'project', tier: 'mastery', requires: ['ev.policy', 'ev.field'], state: lock, percent: 0, xp: 2700,
      desc: 'Picking a real problem in your town and studying it. A small project done well is great for college apps too.' },
  ],
};

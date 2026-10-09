/**
 * Earth & Space — a branch of Science.
 *
 * The subject catalogue files geology, astronomy and ecology separately, and a
 * reader who wants any one of them wants the others within a week: they share
 * the same evidence problem, which is that nothing here can be put in a
 * laboratory and repeated. Deep time and observation-without-experiment are the
 * two nodes everything else here hangs off.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const EARTH_SPACE: SubjectTree = {
  id: 'earth-space',
  title: 'Earth & Space',
  blurb: 'Rocks, weather, oceans and everything past the atmosphere.',
  parent: 'science',
  nodes: [
    { id: 'es.time', name: 'Deep Time', icon: 'deep-time', tier: 'foundation', core: true, state: open, percent: 15, xp: 1300,
      desc: 'Getting used to spans where a millimeter a year builds a mountain range. Almost every argument against these subjects is really a failure to take four billion years seriously as a number.' },
    { id: 'es.rocks', name: 'Rocks & Minerals', icon: 'rock', tier: 'foundation', requires: ['es.time'], state: lock, percent: 0, xp: 1300,
      desc: 'Three families defined by how they formed: cooled, compressed or transformed. Identifying which one you are holding tells you what was happening where it was made.' },
    { id: 'es.layers', name: 'Inside the Earth', icon: 'earth-layers', tier: 'foundation', requires: ['es.rocks'], state: lock, percent: 0, xp: 1400,
      desc: 'Crust, mantle and core, deduced almost entirely from how earthquake waves bend on their way through. Nobody has drilled past the crust, and we still know the structure with confidence.' },
    { id: 'es.plates', name: 'Plate Tectonics', icon: 'plates', tier: 'beginner', core: true, requires: ['es.layers'], state: lock, percent: 0, xp: 1800,
      desc: 'A cracked shell moving on a slow-flowing interior. It is the one theory that explains mountains, earthquakes, volcanoes and matching fossils on opposite coasts at the same time.' },
    { id: 'es.quakes', name: 'Earthquakes & Volcanoes', icon: 'volcano', tier: 'beginner', requires: ['es.plates'], state: lock, percent: 0, xp: 1700,
      desc: 'What happens at the edges where plates meet, and why the hazard maps look the way they do. The magnitude scale is logarithmic, so two steps up is a thousand times the energy.' },
    { id: 'es.strata', name: 'Reading the Record', icon: 'strata', tier: 'beginner', requires: ['es.rocks'], state: lock, percent: 0, xp: 1700,
      desc: 'Layers, fossils and radiometric dating as three independent clocks that agree. Their agreement is the evidence, far more than any one of them alone.' },
    { id: 'es.weather', name: 'Weather', icon: 'weather', tier: 'beginner', requires: ['es.time'], state: lock, percent: 0, xp: 1600,
      desc: 'Uneven heating, moving air and water changing state. Fronts, pressure and humidity between them account for nearly everything a forecast is trying to say.' },
    { id: 'es.atmos', name: 'The Atmosphere', icon: 'atmosphere', tier: 'intermediate', requires: ['es.weather'], state: lock, percent: 0, xp: 1800,
      desc: 'A thin layered envelope held on by gravity, with almost all the weather in the bottom slice. Its composition is what keeps the surface habitable and what makes changing it consequential.' },
    { id: 'es.ocean', name: 'Oceans & Currents', icon: 'ocean', tier: 'intermediate', requires: ['es.atmos'], state: lock, percent: 0, xp: 1900,
      desc: 'A heat store that moves energy around the planet on a conveyor driven by temperature and salt. It is why one coast at a given latitude is temperate and another is not.' },
    { id: 'es.cycles', name: 'Earth Cycles', icon: 'cycle', tier: 'intermediate', core: true, requires: ['es.ocean', 'es.strata'], state: lock, percent: 0, xp: 2000,
      desc: 'Water, carbon, nitrogen and rock, each moving through reservoirs on wildly different timescales. Understanding where a cycle stores things and for how long is what makes any of it predictable.' },
    { id: 'es.climate', name: 'Climate', icon: 'climate', tier: 'advanced', requires: ['es.cycles'], state: lock, percent: 0, xp: 2200,
      desc: 'The statistics of weather over decades, and the balance between energy arriving and leaving. Feedbacks are the part that matters: ice reflecting sunlight it no longer reflects once it melts.' },
    { id: 'es.resources', name: 'Resources & Hazards', icon: 'resources', tier: 'advanced', requires: ['es.quakes', 'es.cycles'], state: lock, percent: 0, xp: 2100,
      desc: 'Where useful materials concentrate, and where living is dangerous. Both answers come from the same processes, which is why the most fertile ground is often at the foot of a volcano.' },
    { id: 'es.sky', name: 'The Sky', icon: 'constellation', tier: 'foundation', requires: ['es.time'], state: lock, percent: 0, xp: 1300,
      desc: 'What moves, how often and why, from a fixed spot on a spinning tilted planet. Seasons come from the tilt rather than the distance, which is the most commonly held wrong belief in the subject.' },
    { id: 'es.solar', name: 'The Solar System', icon: 'solar-system', tier: 'beginner', requires: ['es.sky'], state: lock, percent: 0, xp: 1600,
      desc: 'A star, eight planets and an enormous amount of empty space drawn to scale by almost nobody. Orbits, moons and the division between rocky and gas worlds all trace back to how it formed.' },
    { id: 'es.gravity', name: 'Orbits & Gravity', icon: 'orbit', tier: 'intermediate', requires: ['es.solar'], state: lock, percent: 0, xp: 1900,
      desc: 'Continuous falling that keeps missing the ground. Once that clicks, tides, satellites and why astronauts float all stop being separate facts.' },
    { id: 'es.light', name: 'Light from Space', icon: 'spectrum', tier: 'intermediate', requires: ['es.solar'], state: lock, percent: 0, xp: 1900,
      desc: 'Almost everything known about the universe arrived as light. Splitting it reveals composition, temperature and motion, which is how a chemical analysis of a star is possible at all.' },
    { id: 'es.stars', name: 'Stars', icon: 'star-life', tier: 'advanced', requires: ['es.light'], state: lock, percent: 0, xp: 2200,
      desc: 'Fusion holding gravity off for billions of years, then losing. How a star dies depends almost entirely on its mass, and the heavy elements you are made of came from those deaths.' },
    { id: 'es.galaxies', name: 'Galaxies', icon: 'galaxy', tier: 'advanced', requires: ['es.stars'], state: lock, percent: 0, xp: 2300,
      desc: 'Hundreds of billions of stars bound together, rotating faster at the edges than the visible mass allows. That discrepancy is the observation that put dark matter on the table.' },
    { id: 'es.cosmo', name: 'Cosmology', icon: 'cosmos', tier: 'expert', requires: ['es.galaxies', 'es.gravity'], state: lock, percent: 0, xp: 2600,
      desc: 'The universe as one object with a history: expanding, cooling, and leaving a faint glow behind. Distant galaxies receding faster the further away they are is the observation the whole picture rests on.' },
    { id: 'es.observe', name: 'Observation & Instruments', icon: 'telescope', tier: 'expert', requires: ['es.light', 'es.resources'], state: lock, percent: 0, xp: 2400,
      desc: 'Telescopes, satellites, cores and seismographs — evidence gathered where an experiment is impossible. Every one of these subjects advances by finding a new thing to measure rather than a new thing to try.' },
    { id: 'es.system', name: 'Earth as a System', icon: 'earth-system', tier: 'mastery', requires: ['es.climate', 'es.observe'], state: lock, percent: 0, xp: 3000,
      desc: 'Rock, air, water and life as four coupled parts that have shaped each other for billions of years. Oxygen in the atmosphere is biological in origin, which is the clearest case of the coupling running both ways.' },
  ],
};

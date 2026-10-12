/**
 * Astronomy, a branch of Earth & Space.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const ASTRONOMY: SubjectTree = {
  id: 'astronomy',
  title: 'Astronomy',
  blurb: 'The night sky, the solar system and the universe beyond it.',
  parent: 'earth-space',
  nodes: [
    { id: 'ast.sky', name: 'Reading the Night Sky', icon: 'constellation', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Constellations, bright stars and how the sky turns overnight. Learn five constellations and the rest fall into place.' },
    { id: 'ast.motion', name: 'Sky Motions', icon: 'rotation', tier: 'foundation', requires: ['ast.sky'], state: lock, percent: 0, xp: 1200,
      desc: 'Daily rotation, the seasons and why the stars shift through the year. Earth tilts, and that tilt does most of the work.' },
    { id: 'ast.moon', name: 'Moon Phases & Eclipses', icon: 'cycle', tier: 'beginner', core: true, requires: ['ast.motion'], state: lock, percent: 0, xp: 1600,
      desc: 'Why the moon changes shape and when eclipses happen. Draw the sun, earth and moon from above and it clicks.' },
    { id: 'ast.telescope', name: 'Using a Telescope', icon: 'telescope', tier: 'beginner', requires: ['ast.sky'], state: lock, percent: 0, xp: 1700,
      desc: 'Aperture, magnification and finding objects. Start with the moon, then Jupiter and Saturn.' },
    { id: 'ast.gravity', name: 'Gravity & Orbits', icon: 'orbit', tier: 'beginner', requires: ['ast.motion'], state: lock, percent: 0, xp: 1400,
      desc: "Kepler's laws and Newton's gravity. Orbits are just falling and missing, forever." },
    { id: 'ast.light', name: 'Light & Spectra', icon: 'spectrum', tier: 'intermediate', core: true, requires: ['ast.telescope'], state: lock, percent: 0, xp: 1800,
      desc: 'How astronomers learn what stars are made of from their light alone. Each element leaves its own barcode.' },
    { id: 'ast.planets', name: 'The Planets', icon: 'solar-system', tier: 'intermediate', requires: ['ast.gravity'], state: lock, percent: 0, xp: 1900,
      desc: 'Rocky planets, gas giants and ice giants, and what makes each one weird. Compare them by size, distance and atmosphere.' },
    { id: 'ast.small', name: 'Moons, Asteroids & Comets', icon: 'planet', tier: 'intermediate', requires: ['ast.planets'], state: lock, percent: 0, xp: 2000,
      desc: 'The small bodies of the solar system. Some moons may hide oceans that could hold life.' },
    { id: 'ast.sun', name: 'The Sun', icon: 'sunlight', tier: 'intermediate', requires: ['ast.light'], state: lock, percent: 0, xp: 1700,
      desc: 'Fusion in the core, sunspots and solar flares. The sun is an average star that happens to be very close.' },
    { id: 'ast.stars', name: 'Star Properties', icon: 'star', tier: 'advanced', requires: ['ast.sun'], state: lock, percent: 0, xp: 2100,
      desc: 'Brightness, temperature, size and the HR diagram. The HR diagram is the single most useful chart in astronomy.' },
    { id: 'ast.lifecycle', name: 'Lives of Stars', icon: 'star-life', tier: 'advanced', requires: ['ast.stars'], state: lock, percent: 0, xp: 2200,
      desc: "Nebulae, main sequence, red giants, white dwarfs and supernovae. A star's mass decides its whole story." },
    { id: 'ast.remnants', name: 'Black Holes & Neutron Stars', icon: 'gravity', tier: 'expert', requires: ['ast.lifecycle'], state: lock, percent: 0, xp: 2600,
      desc: 'What is left after the biggest stars die. Gravity gets so strong that light cannot escape a black hole.' },
    { id: 'ast.galaxies', name: 'Galaxies', icon: 'galaxy', tier: 'expert', requires: ['ast.lifecycle'], state: lock, percent: 0, xp: 2300,
      desc: 'Spirals, ellipticals and the Milky Way. There are more galaxies than anyone can count.' },
    { id: 'ast.cosmo', name: 'Cosmology', icon: 'cosmos', tier: 'expert', requires: ['ast.galaxies', 'ast.remnants'], state: lock, percent: 0, xp: 2400,
      desc: 'The Big Bang, the expanding universe and dark matter. Looking far away means looking back in time.' },
    { id: 'ast.exoplanets', name: 'Exoplanets', icon: 'search-engine', tier: 'expert', requires: ['ast.light', 'ast.planets'], state: lock, percent: 0, xp: 2500,
      desc: 'Planets around other stars, found by dips in starlight and wobbles. Thousands are known, and more turn up every month.' },
    { id: 'ast.observe', name: 'Observing Projects', icon: 'notebook', tier: 'mastery', requires: ['ast.cosmo', 'ast.exoplanets', 'ast.moon'], state: lock, percent: 0, xp: 2900,
      desc: 'Logging observations, astrophotography and contests like the Science Olympiad astronomy event. Keep a sky journal.' },
  ],
};

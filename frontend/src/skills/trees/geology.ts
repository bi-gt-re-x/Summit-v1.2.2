/**
 * Geology, a branch of Earth & Space.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const GEOLOGY: SubjectTree = {
  id: 'geology',
  title: 'Geology',
  blurb: 'Rocks, plates and the slow forces that shape the planet.',
  parent: 'earth-space',
  nodes: [
    { id: 'gl.minerals', name: 'Minerals', icon: 'gem', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Identifying minerals by hardness, luster, streak and cleavage. A streak plate and a nail do a lot of the work.' },
    { id: 'gl.rockcycle', name: 'The Rock Cycle', icon: 'cycle', tier: 'foundation', core: true, requires: ['gl.minerals'], state: lock, percent: 0, xp: 1200,
      desc: 'Igneous, sedimentary and metamorphic rocks and how each turns into the others. There is no start or end to the cycle.' },
    { id: 'gl.igneous', name: 'Igneous Rocks', icon: 'heat', tier: 'beginner', requires: ['gl.rockcycle'], state: lock, percent: 0, xp: 1600,
      desc: 'Rocks cooled from magma or lava. Big crystals mean slow cooling deep underground.' },
    { id: 'gl.sedimentary', name: 'Sedimentary Rocks', icon: 'strata', tier: 'beginner', requires: ['gl.rockcycle'], state: lock, percent: 0, xp: 1700,
      desc: 'Layers of sand, mud and shells pressed into rock over time. This is where fossils live.' },
    { id: 'gl.metamorphic', name: 'Metamorphic Rocks', icon: 'transform', tier: 'beginner', requires: ['gl.rockcycle'], state: lock, percent: 0, xp: 1400,
      desc: 'Rocks changed by heat and pressure without melting. Marble used to be limestone.' },
    { id: 'gl.interior', name: "Earth's Interior", icon: 'earth-layers', tier: 'beginner', requires: ['gl.rockcycle'], state: lock, percent: 0, xp: 1500,
      desc: 'Crust, mantle, outer core and inner core. Earthquake waves are how we know any of this.' },
    { id: 'gl.plates', name: 'Plate Tectonics', icon: 'puzzle', tier: 'intermediate', core: true, requires: ['gl.interior'], state: lock, percent: 0, xp: 1900,
      desc: 'Plates moving apart, colliding and sliding past each other. Most mountains, volcanoes and quakes sit on plate edges.' },
    { id: 'gl.quakes', name: 'Earthquakes', icon: 'waves', tier: 'intermediate', requires: ['gl.plates'], state: lock, percent: 0, xp: 2000,
      desc: 'Faults, seismic waves and magnitude. Each step up the scale is about 32 times more energy.' },
    { id: 'gl.volcanoes', name: 'Volcanoes', icon: 'volcano', tier: 'intermediate', requires: ['gl.plates', 'gl.igneous'], state: lock, percent: 0, xp: 1700,
      desc: 'Shield, cinder cone and composite volcanoes. Thick, sticky magma makes the explosive ones.' },
    { id: 'gl.weathering', name: 'Weathering & Erosion', icon: 'weather', tier: 'intermediate', requires: ['gl.sedimentary'], state: lock, percent: 0, xp: 1800,
      desc: 'Water, ice, wind and gravity breaking rock down and moving it. Rivers carve canyons a grain at a time.' },
    { id: 'gl.fossils', name: 'Fossils', icon: 'archive', tier: 'advanced', requires: ['gl.sedimentary'], state: lock, percent: 0, xp: 2200,
      desc: 'How fossils form and what they tell us about past life. Most living things never become fossils at all.' },
    { id: 'gl.time', name: 'Geologic Time', icon: 'deep-time', tier: 'advanced', requires: ['gl.fossils'], state: lock, percent: 0, xp: 2300,
      desc: 'Eons, eras and periods, plus radiometric dating. Earth is about 4.6 billion years old, and people are a very recent arrival.' },
    { id: 'gl.maps', name: 'Reading Geologic Maps', icon: 'map', tier: 'advanced', requires: ['gl.weathering', 'gl.plates'], state: lock, percent: 0, xp: 2000,
      desc: 'Topographic maps, contour lines and rock layers on a map. Close contour lines mean steep ground.' },
    { id: 'gl.resources', name: 'Earth Resources', icon: 'resources', tier: 'expert', requires: ['gl.maps'], state: lock, percent: 0, xp: 2400,
      desc: 'Ores, fossil fuels, groundwater and soil. Where they are depends on geology from millions of years ago.' },
    { id: 'gl.hazards', name: 'Geologic Hazards', icon: 'warning', tier: 'expert', requires: ['gl.quakes', 'gl.volcanoes'], state: lock, percent: 0, xp: 2500,
      desc: 'Landslides, tsunamis and sinkholes, and how communities prepare. Mapping risk saves lives.' },
    { id: 'gl.field', name: 'Field Geology', icon: 'hill', tier: 'mastery', requires: ['gl.resources', 'gl.hazards', 'gl.time'], state: lock, percent: 0, xp: 2900,
      desc: 'Reading the rocks on a real hike or road cut. A hand lens and a notebook are all you need to start.' },
  ],
};

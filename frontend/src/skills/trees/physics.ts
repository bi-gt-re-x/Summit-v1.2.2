/**
 * Physics — a branch of Science.
 *
 * Mechanics all the way down the left, and each of the later fields hanging off
 * energy rather than off the one before it. That is how the subject actually
 * connects: thermodynamics, waves and electromagnetism are not sequels to each
 * other, they are three things you can do once energy is understood.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const PHYSICS: SubjectTree = {
  id: 'physics',
  title: 'Physics',
  blurb: 'A small set of laws with enormous reach, starting from how things move.',
  parent: 'science',
  nodes: [
    { id: 'ph.motion', name: 'Kinematics', icon: 'kinematics', tier: 'foundation', core: true, state: open, percent: 20, xp: 1400,
      desc: 'Describing motion without asking what causes it: position, velocity, acceleration and the equations linking them. Getting comfortable that acceleration is a change in velocity rather than a large velocity is half the battle.' },
    { id: 'ph.vectors', name: 'Vectors in Physics', icon: 'vectors', tier: 'foundation', requires: ['ph.motion'], state: lock, percent: 0, xp: 1400,
      desc: 'Quantities with a direction, and splitting them into components along axes you chose. Choosing the axes well turns a two-dimensional problem into two one-dimensional ones.' },
    { id: 'ph.newton', name: 'Newton Laws', icon: 'forces', tier: 'foundation', core: true, requires: ['ph.vectors'], state: lock, percent: 0, xp: 1700,
      desc: 'Force changes motion, forces come in pairs, and a body with no net force keeps doing exactly what it was doing. The third law is the one people state correctly and apply to the wrong body.' },
    { id: 'ph.fbd', name: 'Free-Body Diagrams', icon: 'free-body', tier: 'beginner', requires: ['ph.newton'], state: lock, percent: 0, xp: 1500,
      desc: 'Drawing one object and every force acting on it, and nothing else. It is not a study aid; on most problems it is where the answer comes from, and skipping it is why the algebra goes wrong.' },
    { id: 'ph.friction', name: 'Friction & Circular Motion', icon: 'friction', tier: 'beginner', requires: ['ph.fbd'], state: lock, percent: 0, xp: 1700,
      desc: 'Contact forces that resist sliding, and the fact that going round a corner at constant speed is still accelerating. Centrifugal force does not appear in any of these diagrams, and that is the point.' },
    { id: 'ph.energy', name: 'Work & Energy', icon: 'energy', tier: 'beginner', core: true, requires: ['ph.fbd'], state: lock, percent: 0, xp: 1900,
      desc: 'A bookkeeping quantity that is never created or destroyed, only moved. It answers in one line what tracking forces through a changing geometry takes ten to answer.' },
    { id: 'ph.momentum', name: 'Momentum', icon: 'momentum', tier: 'beginner', requires: ['ph.newton'], state: lock, percent: 0, xp: 1700,
      desc: 'Mass times velocity, conserved in every collision whether or not energy is. That difference is exactly what separates a bounce from a crash, and it is the reason both are solvable.' },
    { id: 'ph.rotation', name: 'Rotation', icon: 'rotation', tier: 'intermediate', requires: ['ph.momentum', 'ph.friction'], state: lock, percent: 0, xp: 2000,
      desc: 'Every linear idea again with angles: torque for force, moment of inertia for mass, angular momentum for momentum. The structure repeats exactly, which makes it far less work than it first looks.' },
    { id: 'ph.gravity', name: 'Gravitation', icon: 'gravity', tier: 'intermediate', requires: ['ph.energy'], state: lock, percent: 0, xp: 1900,
      desc: 'One law covering a dropped apple and a moon, falling off with the square of distance. Orbits are the first case where an object is falling continuously and never arriving.' },
    { id: 'ph.fluids', name: 'Fluids', icon: 'fluid', tier: 'intermediate', requires: ['ph.energy'], state: lock, percent: 0, xp: 1800,
      desc: 'Pressure, buoyancy and flow. Pressure depending only on depth rather than on the shape of the container is the counterintuitive fact that makes hydraulics work.' },
    { id: 'ph.thermo', name: 'Heat & Temperature', icon: 'thermometer', tier: 'intermediate', requires: ['ph.energy'], state: lock, percent: 0, xp: 1900,
      desc: 'Temperature is how fast the particles jiggle; heat is energy moving because of a temperature difference. Treating them as one thing makes every later result impossible to state properly.' },
    { id: 'ph.laws', name: 'Laws of Thermodynamics', icon: 'entropy', tier: 'advanced', requires: ['ph.thermo'], state: lock, percent: 0, xp: 2200,
      desc: 'Energy is conserved, and disorder in a closed system does not decrease. The second law is what forbids perpetual motion and what gives time a direction at all.' },
    { id: 'ph.waves', name: 'Waves', icon: 'waves', tier: 'intermediate', requires: ['ph.momentum'], state: lock, percent: 0, xp: 1900,
      desc: 'Energy traveling without matter traveling with it. Frequency, wavelength and speed are locked together, so a wave entering a new medium must change one of them.' },
    { id: 'ph.sound', name: 'Sound & Resonance', icon: 'sound', tier: 'advanced', requires: ['ph.waves'], state: lock, percent: 0, xp: 2000,
      desc: 'Pressure waves in a medium, and the frequencies at which a system prefers to vibrate. Resonance explains a wine glass shattering and a bridge closing for repairs.' },
    { id: 'ph.optics', name: 'Light & Optics', icon: 'optics', tier: 'advanced', requires: ['ph.waves'], state: lock, percent: 0, xp: 2100,
      desc: 'Reflection, refraction, lenses and the fact that light bends because it changes speed. Interference is the experiment that ended the argument about whether light is a wave.' },
    { id: 'ph.electric', name: 'Electric Fields', icon: 'electric-field', tier: 'advanced', requires: ['ph.gravity'], state: lock, percent: 0, xp: 2200,
      desc: 'Charge, and the field describing what a charge would feel at each point. Mathematically the same shape as gravity, with the crucial difference that it can push as well as pull.' },
    { id: 'ph.circuits', name: 'Circuits', icon: 'circuit', tier: 'advanced', requires: ['ph.electric'], state: lock, percent: 0, xp: 2100,
      desc: 'Current, voltage and resistance, and the two conservation rules that solve any network of them. Voltage is a difference, and forgetting that is why a bird on a power line is fine.' },
    { id: 'ph.magnet', name: 'Magnetism', icon: 'magnet', tier: 'expert', requires: ['ph.circuits'], state: lock, percent: 0, xp: 2400,
      desc: 'Moving charge makes a field, a changing field makes moving charge. That loop is every motor and every generator, and it is what unified electricity and magnetism into one subject.' },
    { id: 'ph.em', name: 'Electromagnetic Waves', icon: 'em-wave', tier: 'expert', requires: ['ph.magnet', 'ph.optics'], state: lock, percent: 0, xp: 2600,
      desc: 'Fields regenerating each other and propagating at a speed the equations predict outright. That speed turning out to be the speed of light is one of the great results in physics.' },
    { id: 'ph.quantum', name: 'Quantum Physics', icon: 'quantum', tier: 'expert', requires: ['ph.em', 'ph.laws'], state: lock, percent: 0, xp: 2800,
      desc: 'Energy arriving in lumps, particles behaving like waves, and outcomes that are probabilities rather than certainties. Strange, exactly right experimentally, and the basis of every semiconductor.' },
    { id: 'ph.relativity', name: 'Relativity', icon: 'spacetime', tier: 'mastery', requires: ['ph.em'], state: lock, percent: 0, xp: 3000,
      desc: 'What follows from the speed of light being the same for everybody: time and length stop being absolute. Every satellite fix you use corrects for it, which is as practical as a revolution gets.' },
  ],
};

/**
 * Engineering, a branch of Physics.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const ENGINEERING: SubjectTree = {
  id: 'engineering',
  title: 'Engineering',
  blurb: 'Designing things that work, and proving that they do.',
  parent: 'physics',
  nodes: [
    { id: 'eng.process', name: 'The Design Process', icon: 'cycle', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Define the problem, brainstorm, build, test and improve. Real engineering loops through it many times.' },
    { id: 'eng.sketch', name: 'Sketching Ideas', icon: 'sketchbook', tier: 'foundation', requires: ['eng.process'], state: lock, percent: 0, xp: 1200,
      desc: 'Quick drawings to think and explain. A rough sketch beats a perfect one that takes an hour.' },
    { id: 'eng.constraints', name: 'Requirements & Constraints', icon: 'constraint', tier: 'beginner', core: true, requires: ['eng.process'], state: lock, percent: 0, xp: 1600,
      desc: 'Budget, size, weight, time and safety. Write them down before you design anything.' },
    { id: 'eng.units', name: 'Units & Estimation', icon: 'units', tier: 'beginner', requires: ['eng.process'], state: lock, percent: 0, xp: 1700,
      desc: 'Keeping units straight and making rough estimates. A quick estimate catches answers that are off by a thousand.' },
    { id: 'eng.statics', name: 'Forces & Statics', icon: 'forces', tier: 'beginner', core: true, requires: ['eng.units'], state: lock, percent: 0, xp: 1400,
      desc: 'Free-body diagrams for things that stay still, like bridges and shelves. Every force has to balance.' },
    { id: 'eng.materials', name: 'Materials', icon: 'materials', tier: 'intermediate', requires: ['eng.statics'], state: lock, percent: 0, xp: 1800,
      desc: 'Strength, stiffness and weight of wood, metal and plastic. The right material is often the cheapest fix.' },
    { id: 'eng.cad', name: 'CAD Modeling', icon: 'form-3d', tier: 'intermediate', requires: ['eng.sketch', 'eng.constraints'], state: lock, percent: 0, xp: 1900,
      desc: 'Turning sketches into 3D models with real dimensions. Models let you test fit before cutting anything.' },
    { id: 'eng.prototype', name: 'Prototyping', icon: 'prototype', tier: 'intermediate', requires: ['eng.cad'], state: lock, percent: 0, xp: 2000,
      desc: 'Cardboard, 3D prints and quick builds. Build cheap first so failures are cheap too.' },
    { id: 'eng.circuits', name: 'Circuits Basics', icon: 'circuit', tier: 'intermediate', requires: ['eng.units'], state: lock, percent: 0, xp: 1700,
      desc: "Voltage, current and resistance with Ohm's law. Most projects end up needing a little electronics." },
    { id: 'eng.testing', name: 'Testing & Data', icon: 'chart-bars', tier: 'advanced', core: true, requires: ['eng.prototype'], state: lock, percent: 0, xp: 2100,
      desc: 'Planning fair tests and recording results. Data beats opinions when picking between designs.' },
    { id: 'eng.tradeoffs', name: 'Trade-Offs & Decision Matrices', icon: 'decision', tier: 'advanced', requires: ['eng.testing', 'eng.materials'], state: lock, percent: 0, xp: 2200,
      desc: 'Scoring options against the requirements. Every design gives up something to get something else.' },
    { id: 'eng.mechanisms', name: 'Mechanisms', icon: 'automation', tier: 'advanced', requires: ['eng.statics'], state: lock, percent: 0, xp: 2300,
      desc: 'Levers, gears, pulleys and linkages. Every simple machine trades force for distance.' },
    { id: 'eng.safety', name: 'Safety & Failure', icon: 'warning', tier: 'expert', requires: ['eng.tradeoffs'], state: lock, percent: 0, xp: 2300,
      desc: 'Factors of safety and learning from famous failures. Engineers design for what can go wrong.' },
    { id: 'eng.docs', name: 'Engineering Notebook', icon: 'lab-notebook', tier: 'expert', requires: ['eng.testing'], state: lock, percent: 0, xp: 2400,
      desc: 'Recording decisions, data and changes as you go. Judges and teams both rely on it.' },
    { id: 'eng.fields', name: 'Fields of Engineering', icon: 'path-route', tier: 'expert', requires: ['eng.circuits', 'eng.mechanisms'], state: lock, percent: 0, xp: 2500,
      desc: 'Mechanical, electrical, civil, chemical, biomedical and software. Try small projects in a few before you pick.' },
    { id: 'eng.capstone', name: 'A Capstone Project', icon: 'invention', tier: 'mastery', requires: ['eng.safety', 'eng.docs', 'eng.fields'], state: lock, percent: 0, xp: 2900,
      desc: 'Solving a real problem from start to finish. It makes a strong portfolio piece for college.' },
  ],
};

/**
 * Art & Design — a root subject.
 *
 * Seeing before making. The trunk here is observation, value, colour and
 * composition, which are what the four branches all draw on: a photographer and
 * an illustrator disagree about tools and agree completely about where the eye
 * goes first.
 */
import type { SubjectTree } from './types';
import { done, prog, open, lock } from './types';

export const ART: SubjectTree = {
  id: 'art',
  title: 'Art & Design',
  blurb: 'Learning to see accurately, then deciding what to do about it.',
  group: 'Creative',
  nodes: [
    { id: 'ar.see', name: 'Observation', icon: 'observe', tier: 'foundation', core: true, state: done, percent: 100, xp: 1300,
      desc: 'Drawing what is there rather than what you know is there. The symbol your hand wants to produce for an eye is the single largest obstacle, and defeating it is most of learning to draw.' },
    { id: 'ar.shape', name: 'Shape & Proportion', icon: 'shapes', tier: 'foundation', requires: ['ar.see'], state: prog, percent: 60, xp: 1400,
      desc: 'Getting the big relationships right before any detail. Measuring by comparison — this is twice that — fixes more work than any amount of careful rendering.' },
    { id: 'ar.line', name: 'Line', icon: 'line-quality', tier: 'foundation', requires: ['ar.shape'], state: prog, percent: 45, xp: 1300,
      desc: 'Confident marks that vary in weight and say something. A line drawn quickly from the shoulder reads better than one assembled from hesitant strokes, even when it is less accurate.' },
    { id: 'ar.value', name: 'Value & Light', icon: 'value-scale', tier: 'beginner', core: true, requires: ['ar.shape'], state: open, percent: 25, xp: 1600,
      desc: 'Light and dark, which do far more work than color does. Squinting collapses a scene into a few values, and a picture that works in those will work in anything.' },
    { id: 'ar.form', name: 'Form & Volume', icon: 'form-3d', tier: 'beginner', requires: ['ar.value'], state: lock, percent: 0, xp: 1700,
      desc: 'Making a flat mark look like a solid object under a light. Once you can see the planes turning away from the source, shading stops being guesswork.' },
    { id: 'ar.perspective', name: 'Perspective', icon: 'perspective', tier: 'beginner', requires: ['ar.form'], state: lock, percent: 0, xp: 1800,
      desc: 'Depth on a flat surface, built from a horizon and vanishing points. The rules are simple and unforgiving: one wrong eye level makes an entire drawing feel off without anybody being able to say why.' },
    { id: 'ar.composition', name: 'Composition', icon: 'composition', tier: 'beginner', core: true, requires: ['ar.value'], state: lock, percent: 0, xp: 1800,
      desc: 'Arranging things inside the frame so the eye goes where you want and stays. It is decided in the first thirty seconds with thumbnails, not rescued in the last hour.' },
    { id: 'ar.colour', name: 'Color', icon: 'colour-wheel', tier: 'intermediate', core: true, requires: ['ar.value'], state: lock, percent: 0, xp: 1900,
      desc: 'Hue, saturation and value as three separate dials. Nearly every muddy result is a saturation problem, and nearly every flat one is a value problem wearing color.' },
    { id: 'ar.materials', name: 'Materials', icon: 'materials', tier: 'intermediate', requires: ['ar.line'], state: lock, percent: 0, xp: 1600,
      desc: 'What pencil, ink, paint or pixels each do well and badly. Learning one medium properly teaches more than sampling six, because the limits are what force decisions.' },
    { id: 'ar.gesture', name: 'Gesture', icon: 'gesture', tier: 'intermediate', requires: ['ar.line'], state: lock, percent: 0, xp: 1700,
      desc: 'Catching the movement and weight of a subject in seconds. Timed studies teach it, and the point is not to produce a good drawing but to stop drawing outlines.' },
    { id: 'ar.anatomy', name: 'Anatomy', icon: 'figure', tier: 'intermediate', requires: ['ar.gesture', 'ar.form'], state: lock, percent: 0, xp: 2000,
      desc: 'The structure under the surface: what a shoulder actually does and where a hip sits. Knowledge is what makes a figure convincing when reference is not available.' },
    { id: 'ar.space', name: 'Depth & Atmosphere', icon: 'depth', tier: 'intermediate', requires: ['ar.perspective', 'ar.colour'], state: lock, percent: 0, xp: 1900,
      desc: 'Contrast, detail and color dropping off with distance. It is the difference between a scene that has air in it and a set of objects at different sizes.' },
    { id: 'ar.style', name: 'Stylization', icon: 'stylise', tier: 'advanced', requires: ['ar.anatomy'], state: lock, percent: 0, xp: 2100,
      desc: 'Choosing what to exaggerate and what to leave out. Convincing stylization is a deliberate departure from something understood, which is why it comes after the observational nodes.' },
    { id: 'ar.critique', name: 'Critique', icon: 'critique', tier: 'advanced', core: true, requires: ['ar.composition'], state: lock, percent: 0, xp: 1900,
      desc: 'Assessing your own work against what you intended, and hearing somebody else do it. Turning the piece upside down or looking in a mirror shows what your eye has stopped seeing.' },
    { id: 'ar.reference', name: 'Working from Reference', icon: 'reference', tier: 'advanced', requires: ['ar.critique'], state: lock, percent: 0, xp: 1900,
      desc: 'Using photographs and life as material rather than as something to copy. Several references combined and understood beats one traced, and it shows immediately.' },
    { id: 'ar.process', name: 'Sketch to Finish', icon: 'process', tier: 'advanced', requires: ['ar.reference', 'ar.materials'], state: lock, percent: 0, xp: 2100,
      desc: 'Thumbnails, then a value study, then color, then detail. Working in that order means the expensive mistakes are found while they cost minutes.' },
    { id: 'ar.voice', name: 'A Body of Work', icon: 'portfolio', tier: 'expert', requires: ['ar.process', 'ar.style'], state: lock, percent: 0, xp: 2500,
      desc: 'Enough finished pieces for the consistencies to become visible. Style is noticed in retrospect across a body of work rather than chosen in advance for a single piece.' },
    { id: 'ar.draw', name: 'Drawing & Painting', icon: 'drawing', tier: 'advanced', requires: ['ar.form'], navTo: 'drawing', state: lock,
      desc: 'A subject of its own: the observational craft taken as far as it goes, in pencil, ink and paint.' },
    { id: 'ar.design', name: 'Design', icon: 'design', tier: 'advanced', requires: ['ar.composition'], navTo: 'design', state: lock,
      desc: 'A subject of its own: type, layout and interfaces, where the work has a job to do.' },
    { id: 'ar.photo', name: 'Photography', icon: 'camera', tier: 'intermediate', requires: ['ar.composition'], navTo: 'photography', state: lock,
      desc: 'A subject of its own: light, exposure and the frame, with a machine doing the rendering.' },
    { id: 'ar.film', name: 'Film & Video', icon: 'film', tier: 'advanced', requires: ['ar.space'], navTo: 'film', state: lock,
      desc: 'A subject of its own: images in sequence, with time and sound doing half of the work.' },
  ],
};

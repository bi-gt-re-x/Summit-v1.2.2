/**
 * Drawing & Painting — a branch of Art & Design.
 *
 * Mileage is the root, and it is not a platitude: every node below it improves
 * with volume in a way that reading about it does not touch. The tree exists to
 * say what to spend that volume on, and in what order.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const DRAWING: SubjectTree = {
  id: 'drawing',
  title: 'Drawing & Painting',
  blurb: 'Hours on paper, spent on the right things in the right order.',
  parent: 'art',
  nodes: [
    { id: 'dr.mileage', name: 'Mileage', icon: 'sketchbook', tier: 'foundation', core: true, state: open, percent: 20, xp: 1300,
      desc: 'Drawing regularly and badly for long enough that the hand catches up with the eye. Nothing else in this tree substitutes for it, and everybody who can draw did this part.' },
    { id: 'dr.control', name: 'Mark Control', icon: 'line-quality', tier: 'foundation', requires: ['dr.mileage'], state: lock, percent: 0, xp: 1300,
      desc: 'Straight lines, smooth curves and ellipses that close, drawn from the shoulder. Dull warm-up exercises that quietly determine whether everything later looks confident or scratchy.' },
    { id: 'dr.construct', name: 'Construction', icon: 'construction', tier: 'foundation', requires: ['dr.control'], state: lock, percent: 0, xp: 1600,
      desc: 'Building a subject from simple solids before refining it. Drawing through the forms, including the parts you cannot see, is what keeps an object coherent from any angle.' },
    { id: 'dr.measure', name: 'Sight Measuring', icon: 'measure-art', tier: 'beginner', requires: ['dr.construct'], state: lock, percent: 0, xp: 1500,
      desc: 'Using a pencil at arm length to compare angles and lengths. It feels mechanical and it is how accurate drawings get made without tracing.' },
    { id: 'dr.still', name: 'Still Life', icon: 'still-life', tier: 'beginner', core: true, requires: ['dr.measure'], state: lock, percent: 0, xp: 1700,
      desc: 'Objects that hold still under a light you control. The ideal training ground precisely because nothing moves and every error is yours.' },
    { id: 'dr.shading', name: 'Shading', icon: 'shading', tier: 'beginner', requires: ['dr.still'], state: lock, percent: 0, xp: 1700,
      desc: 'Turning form with value: core shadow, reflected light, cast shadow. The edge between light and shadow tells the viewer more about the surface than the darkness does.' },
    { id: 'dr.texture', name: 'Texture & Surface', icon: 'texture', tier: 'beginner', requires: ['dr.shading'], state: lock, percent: 0, xp: 1600,
      desc: 'Making a thing look like metal, cloth or skin. It is mostly about how sharp the highlights are and how quickly value changes, not about drawing every detail.' },
    { id: 'dr.figure', name: 'Figure Drawing', icon: 'figure', tier: 'intermediate', core: true, requires: ['dr.shading'], state: lock, percent: 0, xp: 2000,
      desc: 'The human body from life, starting with gesture and ending with structure. Weight, balance and where the ribcage sits relative to the pelvis carry the whole drawing.' },
    { id: 'dr.portrait', name: 'Portraits', icon: 'portrait', tier: 'intermediate', requires: ['dr.figure'], state: lock, percent: 0, xp: 2100,
      desc: 'Likeness, which lives in proportion and placement rather than in careful features. Get the skull and the spacing right and the face appears; get them wrong and no eyelash saves it.' },
    { id: 'dr.hands', name: 'Hands & Feet', icon: 'hands', tier: 'intermediate', requires: ['dr.figure'], state: lock, percent: 0, xp: 1900,
      desc: 'The parts everybody hides behind pockets. Simplified into a box for the palm and wedges for the fingers, they become drawable rather than a wall.' },
    { id: 'dr.perspective', name: 'Perspective in Practice', icon: 'perspective', tier: 'intermediate', requires: ['dr.construct'], state: lock, percent: 0, xp: 1900,
      desc: 'Putting constructed objects into a believable space, including the ones at odd angles. Establish the horizon first; everything else is measured against it.' },
    { id: 'dr.environment', name: 'Environments', icon: 'landscape', tier: 'advanced', requires: ['dr.perspective', 'dr.texture'], state: lock, percent: 0, xp: 2100,
      desc: 'Landscapes and interiors, where the subject is space rather than an object. Depth comes from overlapping shapes and falling contrast far more than from detail.' },
    { id: 'dr.ink', name: 'Ink & Line Work', icon: 'ink', tier: 'advanced', requires: ['dr.texture'], state: lock, percent: 0, xp: 2000,
      desc: 'Committing without an eraser, and building value from hatching. The discipline of no undo teaches decisiveness faster than any other medium.' },
    { id: 'dr.paintbasics', name: 'Paint Handling', icon: 'brush', tier: 'advanced', requires: ['dr.shading'], state: lock, percent: 0, xp: 2000,
      desc: 'Mixing, loading a brush and laying down an edge you meant. Most early painting problems are consistency and brush pressure rather than color choice.' },
    { id: 'dr.colourmix', name: 'Color Mixing', icon: 'palette', tier: 'advanced', requires: ['dr.paintbasics'], state: lock, percent: 0, xp: 2100,
      desc: 'Getting a specific color from a limited palette, and keeping it clean. A restricted palette produces more harmonious work than a full set, and teaches faster.' },
    { id: 'dr.plein', name: 'Painting from Life', icon: 'easel', tier: 'advanced', requires: ['dr.colourmix', 'dr.environment'], state: lock, percent: 0, xp: 2200,
      desc: 'Working outdoors or in front of the subject with the light changing. The time limit forces simplification, which is the lesson rather than a nuisance.' },
    { id: 'dr.digital', name: 'Digital Painting', icon: 'tablet', tier: 'advanced', requires: ['dr.colourmix'], state: lock, percent: 0, xp: 2100,
      desc: 'Layers, brushes and undo, which speed everything up and remove the pressure that taught decisiveness. Fundamentals transfer completely; the shortcuts do not replace them.' },
    { id: 'dr.compose', name: 'Composing a Picture', icon: 'composition', tier: 'expert', requires: ['dr.plein', 'dr.portrait'], state: lock, percent: 0, xp: 2400,
      desc: 'Deciding what the picture is of and removing everything competing with it. Thumbnail several arrangements before committing hours to the first idea.' },
    { id: 'dr.masters', name: 'Master Studies', icon: 'master-study', tier: 'expert', requires: ['dr.ink', 'dr.digital'], state: lock, percent: 0, xp: 2400,
      desc: 'Copying good work to find out how a decision was made. Analytical copying — asking why an edge is soft there — teaches what admiring never will.' },
    { id: 'dr.series', name: 'Finished Work', icon: 'portfolio', tier: 'mastery', requires: ['dr.compose', 'dr.masters'], state: lock, percent: 0, xp: 2900,
      desc: 'Taking pieces all the way to done, repeatedly, rather than accumulating strong studies. Finishing is a separate skill and the one that turns practice into a body of work.' },
  ],
};

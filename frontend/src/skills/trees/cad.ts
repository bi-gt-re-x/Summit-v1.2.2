/**
 * 3D Modeling & CAD, a branch of Design.
 *
 * Two branches that share a start: parametric CAD for parts that get built, and
 * mesh modeling for art. Both end in a portfolio piece.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const CAD: SubjectTree = {
  id: 'cad',
  title: '3D Modeling & CAD',
  blurb: 'Designing objects in 3D, from robot parts to characters.',
  parent: 'design',
  nodes: [
    { id: 'md.space', name: '3D Space', icon: 'form-3d', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: "X, Y and Z axes and moving the camera around. Orbit, pan and zoom until it's second nature." },
    { id: 'md.tools', name: 'Choosing Software', icon: 'toolbox', tier: 'foundation', requires: ['md.space'], state: lock, percent: 0, xp: 1200,
      desc: 'Tinkercad, Fusion, Onshape or Blender. Use a CAD program for parts and Blender for art.' },
    { id: 'md.sketch', name: 'Sketches & Constraints', icon: 'sketchbook', tier: 'beginner', core: true, requires: ['md.tools'], state: lock, percent: 0, xp: 1600,
      desc: "2D shapes with their dimensions locked in. Fully constrained sketches don't break when you change things later." },
    { id: 'md.extrude', name: 'Extrude & Revolve', icon: 'layers', tier: 'beginner', requires: ['md.sketch'], state: lock, percent: 0, xp: 1700,
      desc: 'Turning flat sketches into solid shapes. Most real parts are just a few extrudes stacked together.' },
    { id: 'md.primitives', name: 'Shapes & Modifiers', icon: 'shapes', tier: 'beginner', requires: ['md.tools'], state: lock, percent: 0, xp: 1400,
      desc: 'Cubes, spheres and modifiers in Blender. Build complicated objects out of simple ones.' },
    { id: 'md.fillets', name: 'Fillets & Chamfers', icon: 'trim', tier: 'intermediate', requires: ['md.extrude'], state: lock, percent: 0, xp: 1800,
      desc: 'Rounding and beveling sharp edges. Real parts almost never have perfectly sharp corners.' },
    { id: 'md.params', name: 'Parametric Design', icon: 'variables', tier: 'intermediate', core: true, requires: ['md.extrude'], state: lock, percent: 0, xp: 1900,
      desc: 'Designs driven by dimensions you can change later. Edit one number and the whole model updates.' },
    { id: 'md.mesh', name: 'Mesh Modeling', icon: 'grid', tier: 'intermediate', requires: ['md.primitives'], state: lock, percent: 0, xp: 2000,
      desc: 'Vertices, edges and faces in Blender. Keep the topology clean so the model bends and smooths nicely.' },
    { id: 'md.assembly', name: 'Assemblies', icon: 'components', tier: 'intermediate', requires: ['md.params'], state: lock, percent: 0, xp: 1700,
      desc: 'Fitting parts together with joints. Check for collisions on screen before you build anything.' },
    { id: 'md.drawings', name: 'Technical Drawings', icon: 'wireframe', tier: 'advanced', requires: ['md.assembly'], state: lock, percent: 0, xp: 2100,
      desc: 'Flat drawings with views and dimensions. Machine shops and teachers still ask for them.' },
    { id: 'md.print', name: '3D Printing', icon: 'print', tier: 'advanced', requires: ['md.fillets', 'md.params'], state: lock, percent: 0, xp: 2200,
      desc: 'Exporting, slicing and printer settings. Design with overhangs and tolerances in mind from the start.' },
    { id: 'md.materials', name: 'Materials & Textures', icon: 'texture', tier: 'advanced', requires: ['md.mesh'], state: lock, percent: 0, xp: 2300,
      desc: 'Colors, roughness and image textures. Good materials are what make a model look real.' },
    { id: 'md.render', name: 'Lighting & Rendering', icon: 'lighting', tier: 'advanced', requires: ['md.materials'], state: lock, percent: 0, xp: 2000,
      desc: 'Three-point lighting and render settings. Lighting makes or breaks a final render.' },
    { id: 'md.fit', name: 'Tolerances & Fit', icon: 'precision', tier: 'expert', requires: ['md.print', 'md.assembly'], state: lock, percent: 0, xp: 2400,
      desc: 'Leaving small gaps so parts actually fit together. Print a tiny test piece before the big one.' },
    { id: 'md.sculpt', name: 'Sculpting', icon: 'craft', tier: 'expert', requires: ['md.mesh'], state: lock, percent: 0, xp: 2500,
      desc: 'Organic shapes like characters and creatures. Start rough and add the fine detail last.' },
    { id: 'md.animate', name: 'Animation Basics', icon: 'timeline-edit', tier: 'expert', requires: ['md.render'], state: lock, percent: 0, xp: 2600,
      desc: 'Keyframes and simple motion. A spinning turntable of your model makes a great portfolio piece.' },
    { id: 'md.project', name: 'An Engineering Project', icon: 'invention', tier: 'mastery', requires: ['md.fit', 'md.drawings'], state: lock, percent: 0, xp: 2600,
      desc: 'Designing a real working part for robotics or a club. Check every dimension twice before you print.' },
    { id: 'md.portfolio', name: 'A 3D Portfolio', icon: 'portfolio', tier: 'mastery', requires: ['md.sculpt', 'md.animate'], state: lock, percent: 0, xp: 2700,
      desc: 'Your best models, rendered nicely. Show process shots too so people see how you work.' },
  ],
};

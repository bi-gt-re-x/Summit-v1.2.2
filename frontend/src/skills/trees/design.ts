/**
 * Design — a branch of Art & Design.
 *
 * Design is drawn here as problem-solving with visual materials, so the tree
 * runs from hierarchy and type through to systems and research, and the
 * interface nodes sit late. Everything before them applies equally to a poster,
 * a report and a product.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const DESIGN: SubjectTree = {
  id: 'design',
  title: 'Design',
  blurb: 'Making something clear, usable and unmistakably deliberate.',
  parent: 'art',
  nodes: [
    { id: 'dz.brief', name: 'The Brief', icon: 'brief', tier: 'foundation', core: true, state: open, percent: 20, xp: 1300,
      desc: 'What this is for, who it is for and what it has to achieve. Design without a brief is decoration, and most disagreements about taste are really about an unwritten one.' },
    { id: 'dz.hierarchy', name: 'Visual Hierarchy', icon: 'hierarchy', tier: 'foundation', requires: ['dz.brief'], state: lock, percent: 0, xp: 1600,
      desc: 'Deciding what somebody sees first, second and third, and making the page say so. Size, weight and space do the work; if everything is emphasized, nothing is.' },
    { id: 'dz.space', name: 'Space', icon: 'whitespace', tier: 'foundation', requires: ['dz.hierarchy'], state: lock, percent: 0, xp: 1500,
      desc: 'The empty parts, which are doing as much work as the full ones. Grouping by proximity is the cheapest way to make a layout comprehensible before a single line is drawn.' },
    { id: 'dz.type', name: 'Typography', icon: 'typography', tier: 'beginner', core: true, requires: ['dz.hierarchy'], state: lock, percent: 0, xp: 1800,
      desc: 'Choosing typefaces and setting them so text is comfortable to read. Line length, line height and size do more for readability than the choice of face, and are noticed less.' },
    { id: 'dz.grid', name: 'Grids & Alignment', icon: 'grid', tier: 'beginner', requires: ['dz.space'], state: lock, percent: 0, xp: 1600,
      desc: 'An invisible structure everything lines up to. Most amateur layouts are fixed by alignment alone, and most professional ones are built on a grid nobody notices.' },
    { id: 'dz.colour', name: 'Color in Design', icon: 'colour-wheel', tier: 'beginner', requires: ['dz.type'], state: lock, percent: 0, xp: 1700,
      desc: 'A small palette used consistently, with contrast that survives a bad screen. Color as the only carrier of meaning fails for a tenth of readers, which is why it never carries meaning alone.' },
    { id: 'dz.contrast', name: 'Contrast & Legibility', icon: 'contrast', tier: 'beginner', requires: ['dz.colour'], state: lock, percent: 0, xp: 1600,
      desc: 'Text that stays readable in sunlight, at distance and for eyes that are not yours. There are measurable thresholds for it, and passing them is a floor rather than an aspiration.' },
    { id: 'dz.layout', name: 'Layout', icon: 'layout', tier: 'intermediate', core: true, requires: ['dz.grid', 'dz.type'], state: lock, percent: 0, xp: 1900,
      desc: 'Arranging everything into a whole that reads in the right order. The eye follows size, then contrast, then position, and a layout is a plan for that journey.' },
    { id: 'dz.imagery', name: 'Imagery & Icons', icon: 'iconography', tier: 'intermediate', requires: ['dz.layout'], state: lock, percent: 0, xp: 1700,
      desc: 'Pictures and symbols that carry meaning rather than fill space. An icon without a label is a guess for anybody who has not met it before.' },
    { id: 'dz.brand', name: 'Identity', icon: 'brand', tier: 'intermediate', requires: ['dz.imagery'], state: lock, percent: 0, xp: 1900,
      desc: 'A coherent visual voice across everything a thing produces. Consistency does more for recognition than any individual mark, however good the mark is.' },
    { id: 'dz.system', name: 'Design Systems', icon: 'design-system', tier: 'intermediate', requires: ['dz.brand', 'dz.layout'], state: lock, percent: 0, xp: 2000,
      desc: 'Decisions made once and reused: spacing, type scale, components. It is what keeps a growing product from becoming forty slightly different buttons.' },
    { id: 'dz.users', name: 'Users & Tasks', icon: 'user-research', tier: 'intermediate', core: true, requires: ['dz.brief'], state: lock, percent: 0, xp: 1900,
      desc: 'Who is doing what, under what pressure, on what device. Designing for yourself is the default failure mode, and watching one real person use it cures it instantly.' },
    { id: 'dz.flow', name: 'Flows & Structure', icon: 'flow', tier: 'advanced', requires: ['dz.users'], state: lock, percent: 0, xp: 2000,
      desc: 'The sequence of screens or steps somebody moves through. Most usability problems are structural, and no amount of visual polish will fix a flow that asks for things in the wrong order.' },
    { id: 'dz.wire', name: 'Wireframing', icon: 'wireframe', tier: 'advanced', requires: ['dz.flow'], state: lock, percent: 0, xp: 1800,
      desc: 'Rough structure before any styling, so the conversation is about arrangement rather than color. Deliberately ugly, because polish invites feedback about the wrong thing.' },
    { id: 'dz.proto', name: 'Prototyping', icon: 'prototype', tier: 'advanced', requires: ['dz.wire'], state: lock, percent: 0, xp: 2000,
      desc: 'Something clickable enough to test an idea before it is built. The cheapest prototype that answers the question is the right one, and it is usually cheaper than people expect.' },
    { id: 'dz.a11y', name: 'Accessibility', icon: 'accessibility', tier: 'advanced', core: true, requires: ['dz.contrast', 'dz.flow'], state: lock, percent: 0, xp: 2200,
      desc: 'Usable by keyboard, by screen reader and by somebody with a tremor or in bright sun. Designed in it costs little; retrofitted it costs a rebuild.' },
    { id: 'dz.motion', name: 'Motion', icon: 'motion', tier: 'advanced', requires: ['dz.proto'], state: lock, percent: 0, xp: 1900,
      desc: 'Movement that explains what happened rather than decorating it. Fast, purposeful and skippable, because motion that cannot be turned off makes some people ill.' },
    { id: 'dz.test', name: 'Usability Testing', icon: 'usability', tier: 'expert', requires: ['dz.proto', 'dz.a11y'], state: lock, percent: 0, xp: 2300,
      desc: 'Watching five people attempt a task without help. It finds most of the serious problems, and the hardest part is staying silent while somebody struggles.' },
    { id: 'dz.critique', name: 'Critique & Iteration', icon: 'critique', tier: 'expert', requires: ['dz.test', 'dz.system'], state: lock, percent: 0, xp: 2300,
      desc: 'Presenting work against the brief and changing it in response. Defending every decision is as unproductive as accepting every note, and the brief is what settles which is which.' },
    { id: 'dz.craft', name: 'Craft', icon: 'craft', tier: 'mastery', requires: ['dz.critique', 'dz.motion'], state: lock, percent: 0, xp: 2900,
      desc: 'The last ten percent nobody consciously notices and everybody feels: consistent spacing, considered edge cases, empty states that say something useful. It is what separates competent from finished.' },
  ],
};

/**
 * Photography — a branch of Art & Design.
 *
 * Light first, gear last. The exposure nodes are near the top because they are
 * the mechanism everything else negotiates with, and the tree deliberately puts
 * seeing and editing above any node that involves buying something.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const PHOTOGRAPHY: SubjectTree = {
  id: 'photography',
  title: 'Photography',
  blurb: 'Light, a frame, and the fraction of a second you decided to keep.',
  parent: 'art',
  nodes: [
    { id: 'pt.light', name: 'Seeing Light', icon: 'light', tier: 'foundation', core: true, state: open, percent: 20, xp: 1400,
      desc: 'Noticing direction, quality and color before raising a camera. Photography is a subject about light that happens to involve a machine, and this is the node that decides everything else.' },
    { id: 'pt.frame', name: 'The Frame', icon: 'frame', tier: 'foundation', requires: ['pt.light'], state: lock, percent: 0, xp: 1400,
      desc: 'Deciding what is in and what is out, and where the edges cut. Moving your feet does more for a photograph than any adjustment made afterwards.' },
    { id: 'pt.exposure', name: 'Exposure', icon: 'exposure', tier: 'foundation', requires: ['pt.frame'], state: lock, percent: 0, xp: 1600,
      desc: 'Aperture, shutter and sensitivity as three ways to get the same brightness. They are a triangle because changing one forces another, and each has a side effect that is the actual creative choice.' },
    { id: 'pt.aperture', name: 'Aperture & Depth of Field', icon: 'aperture', tier: 'beginner', core: true, requires: ['pt.exposure'], state: lock, percent: 0, xp: 1700,
      desc: 'How much of the scene is sharp. Wide open isolates a subject and closed down keeps a landscape crisp, and both are decisions rather than settings.' },
    { id: 'pt.shutter', name: 'Shutter & Motion', icon: 'shutter', tier: 'beginner', requires: ['pt.exposure'], state: lock, percent: 0, xp: 1700,
      desc: 'Freezing action or letting it blur on purpose. The slowest speed you can hand-hold is a rule of thumb worth knowing and worth breaking deliberately.' },
    { id: 'pt.iso', name: 'Sensitivity & Noise', icon: 'iso', tier: 'beginner', requires: ['pt.exposure'], state: lock, percent: 0, xp: 1500,
      desc: 'Trading grain for the ability to shoot in less light. A slightly noisy sharp photograph beats a clean blurred one every time, which is why this dial moves first indoors.' },
    { id: 'pt.focus', name: 'Focus', icon: 'focus-lens', tier: 'beginner', requires: ['pt.aperture'], state: lock, percent: 0, xp: 1500,
      desc: 'Putting the sharpness exactly where it belongs, which for a portrait is the near eye. Autofocus is excellent at deciding wrongly with great confidence.' },
    { id: 'pt.compose', name: 'Composition', icon: 'composition', tier: 'intermediate', core: true, requires: ['pt.frame'], state: lock, percent: 0, xp: 1800,
      desc: 'Arranging the frame so the eye goes where you want: lines, balance, and what the background is doing. Most disappointing photographs are compositionally busy rather than technically wrong.' },
    { id: 'pt.colour', name: 'Color & White Balance', icon: 'white-balance', tier: 'intermediate', requires: ['pt.iso'], state: lock, percent: 0, xp: 1600,
      desc: 'Telling the camera what white is, because light is rarely neutral. Getting it right in the file makes every later adjustment easier and more convincing.' },
    { id: 'pt.raw', name: 'Raw & Files', icon: 'raw-file', tier: 'intermediate', requires: ['pt.colour'], state: lock, percent: 0, xp: 1600,
      desc: 'Keeping the sensor data rather than a processed picture. It costs storage and buys latitude in the shadows and the white balance that a compressed file has already thrown away.' },
    { id: 'pt.lens', name: 'Lenses', icon: 'lens', tier: 'intermediate', requires: ['pt.focus'], state: lock, percent: 0, xp: 1700,
      desc: 'Focal length as a decision about perspective, not about zoom. A wide lens close and a long lens far away frame the same subject and describe entirely different spaces.' },
    { id: 'pt.natural', name: 'Natural Light', icon: 'sunlight', tier: 'intermediate', requires: ['pt.compose', 'pt.lens'], state: lock, percent: 0, xp: 1900,
      desc: 'Working with what the sky gives: the hour, the weather and which way the window faces. Overcast is soft and forgiving, and midday sun is the hardest light most people insist on using.' },
    { id: 'pt.flash', name: 'Artificial Light', icon: 'flash', tier: 'advanced', requires: ['pt.natural'], state: lock, percent: 0, xp: 2100,
      desc: 'Adding light and controlling where it falls. One light off the camera, bounced or diffused, is a bigger jump in quality than any body or lens.' },
    { id: 'pt.portrait', name: 'Portraits', icon: 'portrait', tier: 'advanced', requires: ['pt.natural'], state: lock, percent: 0, xp: 2100,
      desc: 'Photographing people, which is half technical and half making somebody comfortable. Direction beats instruction: giving them something to do beats telling them to relax.' },
    { id: 'pt.street', name: 'Street & Documentary', icon: 'street', tier: 'advanced', requires: ['pt.compose'], state: lock, percent: 0, xp: 2000,
      desc: 'Photographs of life as it happens, which requires anticipation and nerve. Being unobtrusive matters more than any camera, and knowing the local rules and courtesies matters more than both.' },
    { id: 'pt.landscape', name: 'Landscape', icon: 'landscape', tier: 'advanced', requires: ['pt.lens'], state: lock, percent: 0, xp: 2000,
      desc: 'Big scenes where light and timing do the work and patience is the technique. A tripod and returning to the same spot at a different hour are the two habits that improve it most.' },
    { id: 'pt.edit', name: 'Editing', icon: 'photo-edit', tier: 'advanced', core: true, requires: ['pt.raw'], state: lock, percent: 0, xp: 2100,
      desc: 'Adjusting exposure, contrast and color to finish what the file started. Restraint is the skill; the strongest edits are usually local and small.' },
    { id: 'pt.select', name: 'Editing Down', icon: 'cull', tier: 'expert', requires: ['pt.edit', 'pt.street'], state: lock, percent: 0, xp: 2200,
      desc: 'Choosing the two frames worth showing out of three hundred. Ruthlessness here does more for how your work is seen than anything you can do to an individual photograph.' },
    { id: 'pt.series', name: 'Working in a Series', icon: 'series-photo', tier: 'expert', requires: ['pt.select', 'pt.portrait'], state: lock, percent: 0, xp: 2400,
      desc: 'Photographs that mean more together than apart. It is the shift from taking good pictures to saying something, and it is what a body of work is made of.' },
    { id: 'pt.print', name: 'Output & Print', icon: 'print', tier: 'mastery', requires: ['pt.series', 'pt.flash', 'pt.landscape'], state: lock, percent: 0, xp: 2800,
      desc: 'Getting an image out of a screen and onto paper or a wall at the right size. Color management and print size change what an image is, and a photograph is not finished until it exists somewhere.' },
  ],
};

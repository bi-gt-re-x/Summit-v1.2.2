/**
 * Film & Video — a branch of Art & Design.
 *
 * Story sits above camera and editing sits above both, which is the order the
 * work actually depends on rather than the order equipment gets bought in. A
 * beautifully shot sequence of a scene that does not work is a well-lit problem.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const FILM: SubjectTree = {
  id: 'film',
  title: 'Film & Video',
  blurb: 'Images in sequence, with time and sound doing half the work.',
  parent: 'art',
  nodes: [
    { id: 'fm.story', name: 'Story', icon: 'story-arc', tier: 'foundation', core: true, state: open, percent: 20, xp: 1500,
      desc: 'Somebody wanting something and meeting resistance. Every technical decision below this exists to serve it, and no amount of craft rescues a sequence with nothing at stake.' },
    { id: 'fm.scene', name: 'Scenes', icon: 'scene', tier: 'foundation', requires: ['fm.story'], state: lock, percent: 0, xp: 1500,
      desc: 'A unit of story in one place and time, which should end somewhere different from where it started. If nothing changed, the scene is a conversation rather than a scene.' },
    { id: 'fm.shot', name: 'Shots & Framing', icon: 'shot', tier: 'foundation', requires: ['fm.scene'], state: lock, percent: 0, xp: 1600,
      desc: 'Wide, medium and close, and what each tells the audience about distance and importance. Changing shot size is punctuation, and using it without reason reads as noise.' },
    { id: 'fm.coverage', name: 'Coverage', icon: 'coverage', tier: 'beginner', core: true, requires: ['fm.shot'], state: lock, percent: 0, xp: 1800,
      desc: 'Shooting a scene from enough angles that it can be cut together. Missing coverage is discovered in the edit, when returning to the location is no longer possible.' },
    { id: 'fm.continuity', name: 'Continuity & the Line', icon: 'continuity', tier: 'beginner', requires: ['fm.coverage'], state: lock, percent: 0, xp: 1700,
      desc: 'Keeping screen direction and physical detail consistent between takes. Crossing the imaginary line between two characters makes them appear to swap sides, and audiences feel it even when they cannot name it.' },
    { id: 'fm.move', name: 'Camera Movement', icon: 'camera-move', tier: 'beginner', requires: ['fm.shot'], state: lock, percent: 0, xp: 1700,
      desc: 'Pans, tilts, dollies and handheld, each carrying a different feeling. A move should be motivated by something in the scene; movement for its own sake is the most common early habit to lose.' },
    { id: 'fm.lens', name: 'Lenses & Depth', icon: 'lens', tier: 'beginner', requires: ['fm.move'], state: lock, percent: 0, xp: 1700,
      desc: 'Focal length changing how close the audience feels and how compressed the space looks. It is a storytelling choice more than a technical one, made before the tripod goes down.' },
    { id: 'fm.expose', name: 'Exposure for Video', icon: 'exposure', tier: 'intermediate', requires: ['fm.lens'], state: lock, percent: 0, xp: 1800,
      desc: 'Shutter angle tied to frame rate, so motion looks the way audiences expect. It is the constraint that makes filters necessary outdoors rather than optional.' },
    { id: 'fm.light', name: 'Lighting', icon: 'lighting', tier: 'intermediate', core: true, requires: ['fm.expose'], state: lock, percent: 0, xp: 2000,
      desc: 'Shaping a scene with key, fill and separation. Where the shadows fall does more for mood than the color of anything, and one flag is often worth two more lights.' },
    { id: 'fm.sound', name: 'Production Sound', icon: 'boom-mic', tier: 'intermediate', core: true, requires: ['fm.coverage'], state: lock, percent: 0, xp: 1900,
      desc: 'Getting a microphone close and the room quiet. Audiences forgive a soft picture and switch off bad audio within seconds, which reverses the order most people buy equipment in.' },
    { id: 'fm.direct', name: 'Directing Actors', icon: 'directing', tier: 'intermediate', requires: ['fm.scene'], state: lock, percent: 0, xp: 2000,
      desc: 'Giving performers an objective rather than a line reading. What the character wants from the other person in the room produces performance; describing an emotion produces imitation.' },
    { id: 'fm.plan', name: 'Planning a Shoot', icon: 'storyboard', tier: 'intermediate', requires: ['fm.continuity'], state: lock, percent: 0, xp: 1800,
      desc: 'Shot lists, storyboards and a schedule that acknowledges how long lighting takes. Planning is what buys the time to be creative when something inevitably goes wrong.' },
    { id: 'fm.edit', name: 'Editing', icon: 'timeline-edit', tier: 'advanced', core: true, requires: ['fm.coverage', 'fm.sound'], state: lock, percent: 0, xp: 2200,
      desc: 'Choosing what to show and for exactly how long. The film is genuinely made here, and the most common improvement is cutting in later and out earlier on every shot.' },
    { id: 'fm.rhythm', name: 'Pacing & Rhythm', icon: 'pacing', tier: 'advanced', requires: ['fm.edit'], state: lock, percent: 0, xp: 2100,
      desc: 'How fast the film feels, which is about information rather than shot length. A scene drags when the audience already knows what it is being told.' },
    { id: 'fm.transitions', name: 'Transitions', icon: 'transition', tier: 'advanced', requires: ['fm.rhythm'], state: lock, percent: 0, xp: 1900,
      desc: 'How one scene becomes the next, and why almost all of them should be a cut. A transition is a statement about the relationship between two scenes, not a decoration between them.' },
    { id: 'fm.colour', name: 'Color Grading', icon: 'colour-grade', tier: 'advanced', requires: ['fm.edit', 'fm.light'], state: lock, percent: 0, xp: 2100,
      desc: 'Matching shots to each other first, then giving the whole thing a look. Consistency across a scene matters far more than any stylistic grade laid over it.' },
    { id: 'fm.mix', name: 'Sound Design & Mix', icon: 'sound-design', tier: 'advanced', requires: ['fm.rhythm'], state: lock, percent: 0, xp: 2200,
      desc: 'Atmosphere, effects, music and dialogue balanced against each other. Sound carries emotion more reliably than picture, and silence used deliberately is the most underused tool available.' },
    { id: 'fm.doc', name: 'Documentary', icon: 'documentary', tier: 'expert', requires: ['fm.direct', 'fm.mix'], state: lock, percent: 0, xp: 2400,
      desc: 'Finding the story in material you did not script, with the ethical questions that come with representing real people. The edit is where the film is written.' },
    { id: 'fm.short', name: 'Making a Short', icon: 'clapper', tier: 'expert', requires: ['fm.plan', 'fm.colour', 'fm.mix'], state: lock, percent: 0, xp: 2600,
      desc: 'Taking one thing from idea to finished, at whatever scale you can actually complete. One finished short teaches more than five abandoned features.' },
    { id: 'fm.voice', name: 'A Body of Work', icon: 'portfolio', tier: 'mastery', requires: ['fm.short', 'fm.doc', 'fm.transitions'], state: lock, percent: 0, xp: 2900,
      desc: 'Enough finished films for the recurring concerns and choices to become visible. Style is what is left after several films, not a decision made before the first one.' },
  ],
};

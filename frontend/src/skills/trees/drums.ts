/**
 * Drums, a branch of Music.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const DRUMS: SubjectTree = {
  id: 'drums',
  title: 'Drums',
  blurb: 'Keeping time, building grooves and driving the band.',
  parent: 'music',
  nodes: [
    { id: 'dm.grip', name: 'Grip & Stroke', icon: 'hands', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Matched grip and letting the stick bounce back up. Let the rebound do the work so your wrists stay loose.' },
    { id: 'dm.count', name: 'Counting', icon: 'counting', tier: 'foundation', requires: ['dm.grip'], state: lock, percent: 0, xp: 1200,
      desc: 'Quarter, eighth and sixteenth notes, counted out loud. Count it before you play it.' },
    { id: 'dm.rudiments', name: 'Rudiments', icon: 'reps', tier: 'beginner', core: true, requires: ['dm.grip'], state: lock, percent: 0, xp: 1600,
      desc: "Singles, doubles, paradiddles and flams. They're the scales of drumming, so drill them daily." },
    { id: 'dm.click', name: 'Playing With a Click', icon: 'metronome', tier: 'beginner', requires: ['dm.count'], state: lock, percent: 0, xp: 1700,
      desc: 'Locking in with a metronome at every tempo. Playing slow and steady is harder than playing fast.' },
    { id: 'dm.kit', name: 'The Drum Kit', icon: 'drum', tier: 'beginner', requires: ['dm.rudiments'], state: lock, percent: 0, xp: 1400,
      desc: 'Kick, snare, hi-hat, toms and cymbals. Set it up so everything is easy to reach without stretching.' },
    { id: 'dm.reading', name: 'Reading Drum Music', icon: 'staff', tier: 'intermediate', requires: ['dm.count'], state: lock, percent: 0, xp: 1800,
      desc: 'Drum notation and lead sheet charts. Concert band and jazz band parts both need it.' },
    { id: 'dm.beat', name: 'Basic Rock Beat', icon: 'rhythm', tier: 'intermediate', core: true, requires: ['dm.kit', 'dm.click'], state: lock, percent: 0, xp: 1900,
      desc: "Hi-hat eighths, snare on 2 and 4, kick on 1 and 3. It's the start of thousands of songs." },
    { id: 'dm.limbs', name: 'Limb Independence', icon: 'two-hands', tier: 'intermediate', requires: ['dm.beat'], state: lock, percent: 0, xp: 2000,
      desc: 'Each limb doing its own thing at the same time. Build it slowly, adding one limb at a time.' },
    { id: 'dm.fills', name: 'Fills', icon: 'flow', tier: 'intermediate', requires: ['dm.beat'], state: lock, percent: 0, xp: 1700,
      desc: 'Short breaks that lead into the next section of a song. Land back on beat one cleanly.' },
    { id: 'dm.dynamics', name: 'Dynamics', icon: 'dynamics', tier: 'advanced', requires: ['dm.limbs'], state: lock, percent: 0, xp: 2100,
      desc: 'Playing quiet as well as loud. Soft ghost notes on the snare add a ton of groove.' },
    { id: 'dm.styles', name: 'Styles', icon: 'genre', tier: 'advanced', requires: ['dm.limbs', 'dm.fills'], state: lock, percent: 0, xp: 2200,
      desc: 'Rock, funk, jazz, Latin and hip-hop grooves. Each style has its own feel and its own rules.' },
    { id: 'dm.snare', name: 'Concert Snare', icon: 'precision', tier: 'advanced', requires: ['dm.rudiments', 'dm.reading'], state: lock, percent: 0, xp: 2300,
      desc: 'Rolls, flams and solos for band and auditions. Clean rolls take daily practice with a metronome.' },
    { id: 'dm.groove', name: 'Groove & Feel', icon: 'tempo', tier: 'expert', core: true, requires: ['dm.dynamics', 'dm.styles'], state: lock, percent: 0, xp: 2300,
      desc: 'Playing in the pocket so the whole band feels good. Feel matters way more than flashy chops.' },
    { id: 'dm.band', name: 'Playing in a Band', icon: 'audience', tier: 'expert', requires: ['dm.groove'], state: lock, percent: 0, xp: 2400,
      desc: "Listening to the bass player and keeping steady time. The drummer is the band's clock." },
    { id: 'dm.solo', name: 'Soloing', icon: 'solo', tier: 'expert', requires: ['dm.styles'], state: lock, percent: 0, xp: 2500,
      desc: 'Building a solo with motifs and space. Tell a story instead of playing every lick you know.' },
    { id: 'dm.percussion', name: 'Percussion Section', icon: 'sound-bank', tier: 'mastery', requires: ['dm.snare', 'dm.band'], state: lock, percent: 0, xp: 2900,
      desc: 'Mallets, timpani and auxiliary percussion. School percussionists end up playing a bit of everything.' },
    { id: 'dm.record', name: 'Recording Drums', icon: 'record', tier: 'mastery', requires: ['dm.band', 'dm.solo'], state: lock, percent: 0, xp: 2600,
      desc: 'Playing to a click track in the studio. Clean, consistent hits make mixing so much easier.' },
  ],
};

/**
 * Violin, a branch of Music.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const VIOLIN: SubjectTree = {
  id: 'violin',
  title: 'Violin',
  blurb: 'From a squeaky first bow stroke to auditions.',
  parent: 'music',
  nodes: [
    { id: 'vn.hold', name: 'Holding the Violin', icon: 'posture', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Chin rest, shoulder rest and a relaxed left hand. Tension now turns into pain later, so set it up right.' },
    { id: 'vn.bow', name: 'Bow Hold', icon: 'hands', tier: 'foundation', requires: ['vn.hold'], state: lock, percent: 0, xp: 1200,
      desc: 'A soft, curved hand on the bow. It feels weird at first and natural after a few weeks.' },
    { id: 'vn.open', name: 'Open Strings', icon: 'violin', tier: 'beginner', requires: ['vn.bow'], state: lock, percent: 0, xp: 1600,
      desc: 'Straight bowing on G, D, A and E. Keep the bow parallel to the bridge the whole way.' },
    { id: 'vn.tuning', name: 'Tuning', icon: 'tuning-peg', tier: 'beginner', requires: ['vn.open'], state: lock, percent: 0, xp: 1700,
      desc: 'Fine tuners, pegs and a tuner app. Tune before every practice, even when you are in a rush.' },
    { id: 'vn.first', name: 'First Position', icon: 'fingering', tier: 'beginner', core: true, requires: ['vn.open'], state: lock, percent: 0, xp: 1400,
      desc: 'Finger patterns on each string. Tape on the fingerboard helps beginners find the notes.' },
    { id: 'vn.bowing', name: 'Bow Strokes', icon: 'legato', tier: 'intermediate', requires: ['vn.open'], state: lock, percent: 0, xp: 1800,
      desc: 'Detache, legato, staccato and slurs. Your bow arm makes the sound, so give it real practice time.' },
    { id: 'vn.reading', name: 'Reading Music', icon: 'staff', tier: 'intermediate', requires: ['vn.first'], state: lock, percent: 0, xp: 1900,
      desc: 'Treble clef, rhythms and all the little markings. Sight-read a little bit every single day.' },
    { id: 'vn.intonation', name: 'Playing in Tune', icon: 'pitch', tier: 'intermediate', core: true, requires: ['vn.first', 'vn.tuning'], state: lock, percent: 0, xp: 2000,
      desc: 'Listening to every note and adjusting. Slow scales against a drone are the best practice there is.' },
    { id: 'vn.scales', name: 'Scales & Arpeggios', icon: 'scales', tier: 'intermediate', requires: ['vn.first'], state: lock, percent: 0, xp: 1700,
      desc: 'Two and three octave scales. They build intonation, shifting and finger strength all at once.' },
    { id: 'vn.shifting', name: 'Shifting', icon: 'transition', tier: 'advanced', core: true, requires: ['vn.scales', 'vn.intonation'], state: lock, percent: 0, xp: 2100,
      desc: 'Moving up to third position and beyond. Slide lightly and land the note with your ear.' },
    { id: 'vn.vibrato', name: 'Vibrato', icon: 'waves', tier: 'advanced', requires: ['vn.shifting'], state: lock, percent: 0, xp: 2200,
      desc: 'A gentle wavering of pitch that warms up the tone. Start slow and wide with a loose wrist.' },
    { id: 'vn.tone', name: 'Dynamics & Tone', icon: 'dynamics', tier: 'advanced', requires: ['vn.bowing'], state: lock, percent: 0, xp: 2300,
      desc: 'Bow speed, weight and contact point. Loud comes from bow weight, and speed alone just sounds thin.' },
    { id: 'vn.double', name: 'Double Stops', icon: 'harmony', tier: 'expert', requires: ['vn.shifting', 'vn.bowing'], state: lock, percent: 0, xp: 2300,
      desc: 'Playing two strings at once and keeping both in tune. Tune each note against the other one.' },
    { id: 'vn.orchestra', name: 'Orchestra Playing', icon: 'audience', tier: 'expert', requires: ['vn.reading', 'vn.tone'], state: lock, percent: 0, xp: 2400,
      desc: 'Following the conductor, matching bowings and counting rests. Listen across the whole section.' },
    { id: 'vn.solo', name: 'Solo Pieces', icon: 'songbook', tier: 'expert', requires: ['vn.vibrato', 'vn.double'], state: lock, percent: 0, xp: 2500,
      desc: 'Concertos and sonatas at your level. Pick pieces slightly above where you are now.' },
    { id: 'vn.audition', name: 'Auditions & All-State', icon: 'trophy', tier: 'mastery', requires: ['vn.solo', 'vn.orchestra'], state: lock, percent: 0, xp: 2900,
      desc: 'Scales, excerpts and a solo under pressure. Record mock auditions and listen back honestly.' },
  ],
};

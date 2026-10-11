/**
 * Music Theory, a branch of Music.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const MUSIC_THEORY: SubjectTree = {
  id: 'music-theory',
  title: 'Music Theory',
  blurb: 'How music is built, from notes to AP Music Theory.',
  parent: 'music',
  nodes: [
    { id: 'mt.clefs', name: 'Notes & Clefs', icon: 'staff', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Note names in treble, bass and alto clef. You want to know them on sight without counting lines.' },
    { id: 'mt.meter', name: 'Rhythm & Meter', icon: 'rhythm', tier: 'foundation', requires: ['mt.clefs'], state: lock, percent: 0, xp: 1200,
      desc: 'Note values, time signatures and simple versus compound meter. Feel how the beats group together.' },
    { id: 'mt.scales', name: 'Major & Minor Scales', icon: 'scales', tier: 'beginner', core: true, requires: ['mt.clefs'], state: lock, percent: 0, xp: 1600,
      desc: 'Whole and half step patterns, plus the three forms of minor. Build each one from the pattern.' },
    { id: 'mt.keys', name: 'Key Signatures', icon: 'key-signature', tier: 'beginner', requires: ['mt.scales'], state: lock, percent: 0, xp: 1700,
      desc: 'The circle of fifths. Sharp keys go up by fifths and flat keys go down by fifths.' },
    { id: 'mt.intervals', name: 'Intervals', icon: 'intervals', tier: 'beginner', requires: ['mt.scales'], state: lock, percent: 0, xp: 1400,
      desc: 'Size and quality, like major, minor and perfect. Count letter names first, then half steps.' },
    { id: 'mt.ear', name: 'Ear Training', icon: 'ear-training', tier: 'beginner', requires: ['mt.intervals'], state: lock, percent: 0, xp: 1500,
      desc: 'Hearing intervals, chords and melodies. Ten minutes a day beats an hour once a week.' },
    { id: 'mt.triads', name: 'Triads & Sevenths', icon: 'triad', tier: 'intermediate', core: true, requires: ['mt.intervals'], state: lock, percent: 0, xp: 1900,
      desc: 'Building chords in stacked thirds. Know all four triad qualities by sound and by sight.' },
    { id: 'mt.roman', name: 'Roman Numerals', icon: 'chords', tier: 'intermediate', requires: ['mt.triads', 'mt.keys'], state: lock, percent: 0, xp: 2000,
      desc: 'Labeling chords by their job in a key. V going to I is the strongest pull in music.' },
    { id: 'mt.inversions', name: 'Inversions & Figured Bass', icon: 'inverse', tier: 'intermediate', requires: ['mt.triads'], state: lock, percent: 0, xp: 1700,
      desc: 'Which note sits on the bottom, and the numbers that show it. You will see 6 and 6/4 all the time.' },
    { id: 'mt.cadences', name: 'Cadences', icon: 'phrase', tier: 'advanced', requires: ['mt.roman'], state: lock, percent: 0, xp: 2100,
      desc: 'How phrases end, like authentic, half, plagal and deceptive. They work like punctuation in music.' },
    { id: 'mt.voice', name: 'Voice Leading', icon: 'harmony-voices', tier: 'advanced', core: true, requires: ['mt.inversions', 'mt.cadences'], state: lock, percent: 0, xp: 2200,
      desc: 'Writing four parts that move smoothly from chord to chord. Avoid parallel fifths and octaves.' },
    { id: 'mt.dictation', name: 'Dictation', icon: 'listening', tier: 'advanced', requires: ['mt.ear'], state: lock, percent: 0, xp: 2300,
      desc: 'Writing down melodies you hear played. Get the rhythm first, then fill in the pitches.' },
    { id: 'mt.singing', name: 'Sight-Singing', icon: 'sight-read', tier: 'advanced', requires: ['mt.ear'], state: lock, percent: 0, xp: 2000,
      desc: "Singing straight from notation with solfege. It's on the AP exam, so practice out loud." },
    { id: 'mt.nct', name: 'Non-Chord Tones', icon: 'branch', tier: 'advanced', requires: ['mt.voice'], state: lock, percent: 0, xp: 2100,
      desc: 'Passing tones, neighbor tones and suspensions. They make lines more interesting.' },
    { id: 'mt.modulation', name: 'Modulation', icon: 'key-id', tier: 'expert', requires: ['mt.nct'], state: lock, percent: 0, xp: 2500,
      desc: 'Changing keys smoothly with pivot chords. Listen for where the new home note lands.' },
    { id: 'mt.form', name: 'Form & Analysis', icon: 'form', tier: 'expert', requires: ['mt.cadences'], state: lock, percent: 0, xp: 2600,
      desc: 'Binary, ternary, rondo and sonata form. See the big shape of a piece before the details.' },
    { id: 'mt.ap', name: 'AP Music Theory', icon: 'exam', tier: 'mastery', requires: ['mt.modulation', 'mt.form', 'mt.dictation', 'mt.singing'], state: lock, percent: 0, xp: 2600,
      desc: 'Written, listening and sight-singing sections. Timed practice with real old exams is the key.' },
  ],
};

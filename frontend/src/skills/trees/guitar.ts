/**
 * Guitar — a branch of Music.
 *
 * Two chains that meet: what the left hand knows about the neck, and what the
 * right hand can do to the strings. They are separated here because they fail
 * separately — most stalled players have one running years ahead of the other,
 * and the tree should make that visible rather than average it away.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const GUITAR: SubjectTree = {
  id: 'guitar',
  title: 'Guitar',
  blurb: 'Both hands, the neck, and the gap between knowing a chord and landing it.',
  parent: 'music',
  nodes: [
    { id: 'gt.hold', name: 'Holding the Guitar', icon: 'guitar', tier: 'foundation', core: true, state: open, percent: 25, xp: 1000,
      desc: 'Posture, the angle of the neck and where the thumb sits behind it. Nearly every early complaint about hand pain or muted strings is a posture problem wearing a technique costume.' },
    { id: 'gt.tune', name: 'Tuning', icon: 'tuning-peg', tier: 'foundation', requires: ['gt.hold'], state: lock, percent: 0, xp: 900,
      desc: 'Getting the six strings to their pitches, by ear and by tuner. Learning to hear when two strings are close but wrong is worth more than the tuner, because it trains the ear you will use for everything else.' },
    { id: 'gt.strings', name: 'Strings & Frets', icon: 'fretboard', tier: 'foundation', requires: ['gt.tune'], state: lock, percent: 0, xp: 1100,
      desc: 'The names of the open strings and the fact that one fret is one semitone. Everything about the neck follows from those two facts, though it takes months for that to feel true.' },
    { id: 'gt.chords', name: 'Open Chords', icon: 'chord-shape', tier: 'beginner', core: true, requires: ['gt.strings'], state: lock, percent: 0, xp: 1600,
      desc: 'The first handful of shapes, played cleanly with every string sounding. Getting one shape perfect teaches more than getting five approximately, because the standard is what you will unconsciously keep.' },
    { id: 'gt.change', name: 'Chord Changes', icon: 'chord-change', tier: 'beginner', requires: ['gt.chords'], state: lock, percent: 0, xp: 1700,
      desc: 'Moving between shapes in time, which is a completely separate skill from forming them. Practice the change itself rather than the chords either side, and always with a beat running.' },
    { id: 'gt.strum', name: 'Strumming', icon: 'strum', tier: 'beginner', core: true, requires: ['gt.chords'], state: lock, percent: 0, xp: 1600,
      desc: 'The right hand keeping a constant motion and choosing which passes hit the strings. Keeping the arm moving through the gaps is what makes a pattern feel steady rather than stitched together.' },
    { id: 'gt.rhythm', name: 'Rhythm Guitar', icon: 'rhythm', tier: 'beginner', requires: ['gt.strum', 'gt.change'], state: lock, percent: 0, xp: 1800,
      desc: 'Playing so somebody else could sing over you without counting. Being the timekeeper is the job, and it is why the least showy player in a band is often the most important one.' },
    { id: 'gt.pick', name: 'Picking', icon: 'pick', tier: 'intermediate', requires: ['gt.strum'], state: lock, percent: 0, xp: 1800,
      desc: 'Hitting single notes deliberately, alternating down and up. Anchoring, angle and how far the pick travels decide speed far more than practice hours do.' },
    { id: 'gt.finger', name: 'Fingerstyle', icon: 'fingerstyle', tier: 'intermediate', requires: ['gt.pick'], state: lock, percent: 0, xp: 2000,
      desc: 'Thumb on the bass, fingers on the melody, played at once. It is the point where one guitar starts sounding like two parts rather than one accompaniment.' },
    { id: 'gt.barre', name: 'Barre Chords', icon: 'barre', tier: 'intermediate', core: true, requires: ['gt.change'], state: lock, percent: 0, xp: 2000,
      desc: 'One finger flattening across all six strings so a shape becomes movable. Brutal for a few weeks, and the moment it works you have every key rather than the four you could reach before.' },
    { id: 'gt.power', name: 'Power Chords & Palm Muting', icon: 'power-chord', tier: 'intermediate', requires: ['gt.barre'], state: lock, percent: 0, xp: 1700,
      desc: 'Two notes with the third left out, and the heel of the hand damping the strings. Deliberately ambiguous harmony, which is exactly why it sits under distortion better than a full chord.' },
    { id: 'gt.scales', name: 'Scales on the Neck', icon: 'scales', tier: 'intermediate', requires: ['gt.pick'], state: lock, percent: 0, xp: 1900,
      desc: 'Patterns that move without changing shape, because the neck is regular. Learning them as shapes is fast and learning where the root sits inside each shape is what makes them usable.' },
    { id: 'gt.penta', name: 'Pentatonic Positions', icon: 'pentatonic', tier: 'advanced', requires: ['gt.scales'], state: lock, percent: 0, xp: 2000,
      desc: 'Five boxes that cover the whole neck and connect to each other. Most lead playing in popular music lives here, and joining the boxes is what stops solos sounding trapped in one position.' },
    { id: 'gt.bend', name: 'Bends & Vibrato', icon: 'bend', tier: 'advanced', requires: ['gt.penta'], state: lock, percent: 0, xp: 2100,
      desc: 'Pushing a string sideways to raise its pitch, and shaking it to give the note life. Bending to the right pitch rather than approximately is what separates expressive from sour.' },
    { id: 'gt.slide', name: 'Slides, Hammers & Pulls', icon: 'legato', tier: 'advanced', requires: ['gt.bend'], state: lock, percent: 0, xp: 1900,
      desc: 'Sounding notes with the fretting hand alone. The connected legato line it produces is a different voice from picking every note, and phrasing usually wants both in the same bar.' },
    { id: 'gt.capo', name: 'Capo & Transposing', icon: 'capo', tier: 'intermediate', requires: ['gt.barre'], state: lock, percent: 0, xp: 1500,
      desc: 'Moving the nut up the neck so familiar shapes play in a different key. Invaluable for singers, and worth understanding as transposition rather than as a shortcut you do not have to think about.' },
    { id: 'gt.tone', name: 'Tone & Effects', icon: 'amp', tier: 'advanced', requires: ['gt.power'], state: lock, percent: 0, xp: 1900,
      desc: 'Pickups, amplifier settings and the small number of pedals that matter. Most of the tone people chase is in the hands, and the rest is gain staging rather than the brand of anything.' },
    { id: 'gt.ear', name: 'Learning by Ear', icon: 'ear-training', tier: 'advanced', requires: ['gt.penta', 'gt.capo'], state: lock, percent: 0, xp: 2200,
      desc: 'Working a song out from the recording instead of from a tab. Slow, frustrating and the single highest-yield practice there is, because it trains the connection tabs let you skip.' },
    { id: 'gt.improv', name: 'Improvising', icon: 'spark', tier: 'expert', requires: ['gt.ear', 'gt.slide'], state: lock, percent: 0, xp: 2500,
      desc: 'Playing lines over changes as they go past. Phrasing and space matter far more than speed, and the players who sound best are usually leaving the most room.' },
    { id: 'gt.songs', name: 'Arranging a Song', icon: 'songbook', tier: 'expert', requires: ['gt.finger', 'gt.rhythm'], state: lock, percent: 0, xp: 2400,
      desc: 'Deciding what one guitar plays of a piece written for a band. Choosing what to leave out is the skill; a good arrangement implies the missing parts rather than cramming them in.' },
    { id: 'gt.perform', name: 'Playing for People', icon: 'trophy', tier: 'mastery', requires: ['gt.improv', 'gt.songs'], state: lock, percent: 0, xp: 2900,
      desc: 'Playing under pressure, recovering from a mistake without stopping, and holding an audience. Only performing trains it, and the first several times are supposed to be bad.' },
  ],
};

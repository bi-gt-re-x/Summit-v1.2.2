/**
 * Piano — a branch of Music.
 *
 * Reading and playing are drawn as two chains that cross rather than one line,
 * because the instrument is unusual in how far each can run without the other.
 * Hands together sits early: it is the first genuinely hard thing and everything
 * repertoire-shaped waits behind it.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const PIANO: SubjectTree = {
  id: 'piano',
  title: 'Piano',
  blurb: 'Two hands doing different jobs, and the reading that keeps up with them.',
  parent: 'music',
  nodes: [
    { id: 'pn.posture', name: 'Sitting & Hand Shape', icon: 'posture', tier: 'foundation', core: true, state: open, percent: 25, xp: 1000,
      desc: 'Bench height, a relaxed arm and fingers curved as though holding a ball. It looks fussy and it is what decides whether an hour of practice leaves you sore.' },
    { id: 'pn.keys', name: 'The Keyboard', icon: 'piano-keys', tier: 'foundation', requires: ['pn.posture'], state: lock, percent: 0, xp: 1000,
      desc: 'Twelve keys repeating, with the black-key groups as landmarks. The layout is the clearest picture of music theory anybody has drawn, which is why theory is easier at a piano than anywhere else.' },
    { id: 'pn.fingering', name: 'Fingering', icon: 'fingering', tier: 'foundation', requires: ['pn.keys'], state: lock, percent: 0, xp: 1300,
      desc: 'Which finger plays which note, decided in advance and written in. Chosen well it makes a passage possible; chosen ad hoc it guarantees a different mistake every run.' },
    { id: 'pn.readtreble', name: 'Reading the Treble Staff', icon: 'staff', tier: 'foundation', requires: ['pn.keys'], state: lock, percent: 0, xp: 1400,
      desc: 'Turning a position on the upper stave straight into a key, without counting up from the bottom line. It has to become recognition rather than arithmetic before anything else works.' },
    { id: 'pn.readbass', name: 'Reading the Bass Staff', icon: 'bass-clef', tier: 'beginner', requires: ['pn.readtreble'], state: lock, percent: 0, xp: 1500,
      desc: 'The second stave, with different lines meaning different notes. Learning it thoroughly rather than by relating everything to the treble is what stops the left hand lagging for years.' },
    { id: 'pn.hands', name: 'Hands Together', icon: 'two-hands', tier: 'beginner', core: true, requires: ['pn.fingering'], state: lock, percent: 0, xp: 1900,
      desc: 'Two independent parts at once, which is the first genuinely difficult thing the instrument asks. Practicing each hand until it is automatic, then joining them slowly, is the only route that reliably works.' },
    { id: 'pn.scales', name: 'Scales & Arpeggios', icon: 'scales', tier: 'beginner', requires: ['pn.hands'], state: lock, percent: 0, xp: 1700,
      desc: 'The standard patterns, with the thumb passing under smoothly. Boring, and they are where evenness and finger independence actually come from.' },
    { id: 'pn.chords', name: 'Chords & Voicings', icon: 'chords', tier: 'intermediate', core: true, requires: ['pn.hands'], state: lock, percent: 0, xp: 1900,
      desc: 'Playing three or more notes together, and choosing which order to stack them in. The same chord voiced differently is the difference between muddy and open, especially low on the keyboard.' },
    { id: 'pn.pedal', name: 'The Sustain Pedal', icon: 'pedal', tier: 'intermediate', requires: ['pn.chords'], state: lock, percent: 0, xp: 1700,
      desc: 'Lifting the dampers so notes ring on. The technique is changing it just after the new harmony arrives rather than with it, and holding it through a chord change is the single most audible beginner error.' },
    { id: 'pn.dynamics', name: 'Touch & Dynamics', icon: 'dynamics', tier: 'intermediate', requires: ['pn.scales'], state: lock, percent: 0, xp: 1800,
      desc: 'Controlling volume and attack with the speed of the key rather than the force of the arm. Being able to play one hand louder than the other is what makes a melody sing over its accompaniment.' },
    { id: 'pn.sight', name: 'Sight Reading', icon: 'sight-read', tier: 'intermediate', requires: ['pn.readbass'], state: lock, percent: 0, xp: 2000,
      desc: 'Playing something unseen, in time, without stopping to correct. Improved only by reading new material constantly and accepting that it will be rough, which is why so few people build it.' },
    { id: 'pn.rhythm', name: 'Rhythmic Independence', icon: 'polyrhythm', tier: 'advanced', requires: ['pn.dynamics'], state: lock, percent: 0, xp: 2100,
      desc: 'Hands playing different rhythms at once, up to three against two. Learned as one combined pattern first, then felt as two, because counting both at speed is not something anybody manages.' },
    { id: 'pn.phrase', name: 'Phrasing', icon: 'phrase', tier: 'advanced', requires: ['pn.dynamics'], state: lock, percent: 0, xp: 2000,
      desc: 'Shaping a line so it has direction, a high point and an ending. It is what makes a correct performance musical, and it is decided before the piece is up to speed, not after.' },
    { id: 'pn.harmony', name: 'Harmony at the Keyboard', icon: 'progressions', tier: 'advanced', requires: ['pn.chords', 'pn.sight'], state: lock, percent: 0, xp: 2200,
      desc: 'Seeing the chords inside written music instead of a wall of individual notes. It cuts memorizing time dramatically and is what makes playing from a chord chart possible at all.' },
    { id: 'pn.memory', name: 'Memorizing', icon: 'memory', tier: 'advanced', requires: ['pn.harmony'], state: lock, percent: 0, xp: 2100,
      desc: 'Holding a piece by structure, harmony and muscle memory at once. Memory that is only in the fingers fails in public, which is why the other two have to be deliberate.' },
    { id: 'pn.style', name: 'Period & Style', icon: 'style', tier: 'advanced', requires: ['pn.phrase'], state: lock, percent: 0, xp: 2100,
      desc: 'Baroque, classical and romantic music asking for different touch, pedaling and freedom with the beat. Playing everything the same way is the most common thing that makes an accurate performance sound wrong.' },
    { id: 'pn.improv', name: 'Improvising', icon: 'spark', tier: 'expert', requires: ['pn.harmony'], state: lock, percent: 0, xp: 2400,
      desc: 'Making something up over a set of changes, which the keyboard layout makes unusually visual. Start with two hands doing very little each; the temptation to fill everything is what kills it.' },
    { id: 'pn.accomp', name: 'Accompanying', icon: 'accompany', tier: 'expert', requires: ['pn.improv', 'pn.style'], state: lock, percent: 0, xp: 2400,
      desc: 'Playing under a singer or another instrument: following, supporting and staying out of the way. Knowing when to drop out entirely is most of what makes an accompanist wanted back.' },
    { id: 'pn.rep', name: 'Building Repertoire', icon: 'songbook', tier: 'expert', requires: ['pn.memory'], state: lock, percent: 0, xp: 2500,
      desc: 'A set of pieces you can actually play today, maintained rather than collected. Three polished pieces beat twenty half-learned ones every time somebody asks you to play something.' },
    { id: 'pn.perform', name: 'Performing', icon: 'trophy', tier: 'mastery', requires: ['pn.rep', 'pn.accomp'], state: lock, percent: 0, xp: 2900,
      desc: 'Playing for people, recovering from a slip without stopping, and communicating something beyond the notes. A separate skill from playing well alone, and one only performing trains.' },
  ],
};

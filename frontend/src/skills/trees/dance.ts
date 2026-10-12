/**
 * Dance, a branch of Art & Design.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const DANCE: SubjectTree = {
  id: 'dance',
  title: 'Dance',
  blurb: 'Technique, rhythm and performing with your whole body.',
  parent: 'art',
  nodes: [
    { id: 'dn.warmup', name: 'Warming Up', icon: 'warmup', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Raising your heart rate and loosening joints before you dance. It protects you and makes moves look smoother.' },
    { id: 'dn.rhythm', name: 'Rhythm & Counting', icon: 'rhythm', tier: 'foundation', requires: ['dn.warmup'], state: lock, percent: 0, xp: 1200,
      desc: 'Counting in eights and hitting the beat. Most choreography is taught in counts, so this comes first.' },
    { id: 'dn.posture', name: 'Posture & Alignment', icon: 'posture', tier: 'beginner', core: true, requires: ['dn.warmup'], state: lock, percent: 0, xp: 1600,
      desc: 'Stacked hips, engaged core and relaxed shoulders. Good alignment makes every move cleaner and safer.' },
    { id: 'dn.flex', name: 'Flexibility', icon: 'mobility', tier: 'beginner', requires: ['dn.warmup'], state: lock, percent: 0, xp: 1700,
      desc: 'Stretching after you warm up, a little every day. Forcing a split hurts more than it helps.' },
    { id: 'dn.balance', name: 'Balance & Turns', icon: 'balance-scale', tier: 'beginner', requires: ['dn.posture'], state: lock, percent: 0, xp: 1400,
      desc: 'Spotting your head and finding your center. Start with single turns that land clean.' },
    { id: 'dn.across', name: 'Across the Floor', icon: 'path-route', tier: 'intermediate', requires: ['dn.rhythm', 'dn.posture'], state: lock, percent: 0, xp: 1800,
      desc: 'Traveling steps, leaps and combinations. Use the whole studio space with confidence.' },
    { id: 'dn.styles', name: 'Dance Styles', icon: 'genre', tier: 'intermediate', requires: ['dn.rhythm'], state: lock, percent: 0, xp: 1900,
      desc: 'Ballet, jazz, hip-hop, contemporary and tap. Each style has its own technique and feel.' },
    { id: 'dn.memory', name: 'Learning Choreography', icon: 'memory', tier: 'intermediate', core: true, requires: ['dn.across'], state: lock, percent: 0, xp: 2000,
      desc: 'Picking up combos fast and remembering them. Break it into chunks and mark it with your hands.' },
    { id: 'dn.musicality', name: 'Musicality', icon: 'harmony', tier: 'advanced', requires: ['dn.memory', 'dn.styles'], state: lock, percent: 0, xp: 2000,
      desc: 'Dancing to the music and lyrics, beyond hitting counts. Listen for the accents and the quiet parts.' },
    { id: 'dn.jumps', name: 'Jumps & Leaps', icon: 'agility', tier: 'advanced', requires: ['dn.flex', 'dn.balance'], state: lock, percent: 0, xp: 2100,
      desc: 'Height, landing softly and pointed feet. Strong legs and a solid core make jumps look easy.' },
    { id: 'dn.partner', name: 'Partnering & Groups', icon: 'friends', tier: 'advanced', requires: ['dn.memory'], state: lock, percent: 0, xp: 2200,
      desc: 'Dancing in formations and with partners. Staying in sync takes trust and lots of rehearsal.' },
    { id: 'dn.expression', name: 'Performance & Expression', icon: 'emotion', tier: 'advanced', requires: ['dn.musicality'], state: lock, percent: 0, xp: 2300,
      desc: 'Using your face and your energy to tell a story. The audience feels what you feel.' },
    { id: 'dn.choreo', name: 'Choreographing', icon: 'compose', tier: 'expert', requires: ['dn.expression', 'dn.partner'], state: lock, percent: 0, xp: 2300,
      desc: 'Making your own pieces from an idea or a song. Start with eight counts and build out.' },
    { id: 'dn.injury', name: 'Staying Healthy', icon: 'injury', tier: 'expert', requires: ['dn.jumps'], state: lock, percent: 0, xp: 2400,
      desc: 'Rest, strength work and listening to pain. Most dance injuries come from doing too much too soon.' },
    { id: 'dn.competition', name: 'Competitions & Auditions', icon: 'trophy', tier: 'expert', requires: ['dn.expression', 'dn.jumps'], state: lock, percent: 0, xp: 2500,
      desc: 'Solos, team routines and audition classes. Clean technique beats harder tricks done sloppily.' },
    { id: 'dn.showcase', name: 'Your Showcase', icon: 'theatre', tier: 'mastery', requires: ['dn.choreo', 'dn.competition', 'dn.injury'], state: lock, percent: 0, xp: 2900,
      desc: 'Putting a full piece on stage. Plan costumes, music and rehearsals backward from the date.' },
  ],
};

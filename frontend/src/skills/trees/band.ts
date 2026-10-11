/**
 * Band & Orchestra, a branch of Music.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const BAND: SubjectTree = {
  id: 'band',
  title: 'Band & Orchestra',
  blurb: 'Playing your part well inside a big group.',
  parent: 'music',
  nodes: [
    { id: 'ens.instrument', name: 'Your Instrument', icon: 'music-note', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Basic care, putting it together and making a good tone. Practice a little every day instead of a lot once a week.' },
    { id: 'ens.tuning', name: 'Tuning Together', icon: 'tuning-peg', tier: 'foundation', requires: ['ens.instrument'], state: lock, percent: 0, xp: 1200,
      desc: 'Matching pitch with the rest of the group. Listen for the wobble between notes and adjust until it stops.' },
    { id: 'ens.reading', name: 'Reading Your Part', icon: 'staff', tier: 'beginner', core: true, requires: ['ens.instrument'], state: lock, percent: 0, xp: 1600,
      desc: 'Key signatures, rhythms and markings. Mark up your music in pencil so you never miss the same thing twice.' },
    { id: 'ens.rests', name: 'Counting Rests', icon: 'counting', tier: 'beginner', requires: ['ens.reading'], state: lock, percent: 0, xp: 1700,
      desc: 'Never losing your place during long rests. Count every single bar, even the boring ones.' },
    { id: 'ens.conductor', name: 'Watching the Conductor', icon: 'directing', tier: 'beginner', requires: ['ens.rests'], state: lock, percent: 0, xp: 1400,
      desc: 'Tempo, cues and dynamics from the baton. Get your eyes off the page and up often.' },
    { id: 'ens.practice', name: 'Practicing Parts', icon: 'practice', tier: 'intermediate', requires: ['ens.reading'], state: lock, percent: 0, xp: 1800,
      desc: 'Pulling out hard passages and slowing them down. Fix the hard bars first instead of playing through.' },
    { id: 'ens.sight', name: 'Sight-Reading', icon: 'sight-read', tier: 'intermediate', requires: ['ens.reading'], state: lock, percent: 0, xp: 1900,
      desc: 'Playing new music on the first read. Check the key, the time and the tricky spots before you start.' },
    { id: 'ens.blend', name: 'Blend & Balance', icon: 'harmony', tier: 'intermediate', core: true, requires: ['ens.tuning', 'ens.conductor'], state: lock, percent: 0, xp: 2000,
      desc: "Matching the sound around you. If you can't hear the people next to you, you're too loud." },
    { id: 'ens.section', name: 'Section Playing', icon: 'friends', tier: 'intermediate', requires: ['ens.blend'], state: lock, percent: 0, xp: 1700,
      desc: 'Playing as one with your section. Match the first chair on bowings, breaths and style.' },
    { id: 'ens.marching', name: 'Marching Band', icon: 'path-route', tier: 'advanced', requires: ['ens.section'], state: lock, percent: 0, xp: 2100,
      desc: 'Playing while moving in formation. Keep your posture and your sound steady while you walk.' },
    { id: 'ens.jazz', name: 'Jazz Band', icon: 'improvise', tier: 'advanced', requires: ['ens.sight'], state: lock, percent: 0, xp: 2200,
      desc: 'Swing feel, chord symbols and improvising. Listen to a lot of recordings to soak up the style.' },
    { id: 'ens.chamber', name: 'Chamber Groups', icon: 'harmony-voices', tier: 'advanced', requires: ['ens.blend'], state: lock, percent: 0, xp: 2300,
      desc: 'Small groups without a conductor. You lead each other with breath and eye contact.' },
    { id: 'ens.chairs', name: 'Chair Tests', icon: 'rank', tier: 'advanced', requires: ['ens.practice'], state: lock, percent: 0, xp: 2000,
      desc: 'Playing excerpts for your seat in the section. Prepare your scales and the hardest passages first.' },
    { id: 'ens.concert', name: 'Concert Prep', icon: 'audience', tier: 'expert', requires: ['ens.section', 'ens.practice'], state: lock, percent: 0, xp: 2400,
      desc: 'Dress rehearsals, nerves and stage etiquette. Know every one of your entrances cold.' },
    { id: 'ens.allstate', name: 'All-State & Honor Bands', icon: 'gold', tier: 'expert', requires: ['ens.chairs'], state: lock, percent: 0, xp: 2500,
      desc: 'Auditions for the top groups in your region. Record yourself and listen back like a judge would.' },
    { id: 'ens.leader', name: 'Section Leader', icon: 'leadership', tier: 'mastery', requires: ['ens.allstate', 'ens.chamber', 'ens.concert'], state: lock, percent: 0, xp: 2900,
      desc: 'Running sectionals and helping younger players. Lead by being the most prepared person in the room.' },
  ],
};

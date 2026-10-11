/**
 * Basketball, a branch of Health & Fitness.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const BASKETBALL: SubjectTree = {
  id: 'basketball',
  title: 'Basketball',
  blurb: 'Handles, shooting and the game sense that wins.',
  parent: 'fitness',
  nodes: [
    { id: 'bb.handles', name: 'Ball Handling', icon: 'basketball', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Dribbling with both hands without looking down. Daily drills make the ball feel like part of your hand.' },
    { id: 'bb.footwork', name: 'Footwork', icon: 'gait', tier: 'foundation', requires: ['bb.handles'], state: lock, percent: 0, xp: 1200,
      desc: 'Pivots, jump stops and triple threat. Good footwork stops travels and makes space for your shot.' },
    { id: 'bb.passing', name: 'Passing', icon: 'transfer', tier: 'beginner', requires: ['bb.handles'], state: lock, percent: 0, xp: 1600,
      desc: 'Chest, bounce and overhead passes. Throw it to the spot your teammate is running to.' },
    { id: 'bb.form', name: 'Shooting Form', icon: 'target', tier: 'beginner', core: true, requires: ['bb.footwork'], state: lock, percent: 0, xp: 1700,
      desc: 'Balance, elbow in and a full follow through. Start close to the hoop and move out as it gets automatic.' },
    { id: 'bb.layups', name: 'Layups', icon: 'hill', tier: 'beginner', requires: ['bb.footwork'], state: lock, percent: 0, xp: 1400,
      desc: 'Both hands, both sides and the right footwork. Practice your weak-hand layups twice as much.' },
    { id: 'bb.defense', name: 'On-Ball Defense', icon: 'shield', tier: 'intermediate', core: true, requires: ['bb.footwork'], state: lock, percent: 0, xp: 1800,
      desc: 'Stance, slides and staying between your player and the hoop. Good defense is mostly effort and focus.' },
    { id: 'bb.rebound', name: 'Rebounding', icon: 'cycle', tier: 'intermediate', requires: ['bb.defense'], state: lock, percent: 0, xp: 1900,
      desc: 'Boxing out and going hard after the ball. Most rebounds go to whoever wants them more.' },
    { id: 'bb.freethrows', name: 'Free Throws', icon: 'routine', tier: 'intermediate', requires: ['bb.form'], state: lock, percent: 0, xp: 2000,
      desc: 'The same routine every single time you step up. Shoot 50 a day and track how many you make.' },
    { id: 'bb.moves', name: 'Dribble Moves', icon: 'agility', tier: 'intermediate', requires: ['bb.handles', 'bb.layups'], state: lock, percent: 0, xp: 1700,
      desc: 'Crossovers, hesitations and spins. Changing speed beats defenders more often than fancy moves.' },
    { id: 'bb.offball', name: 'Moving Without the Ball', icon: 'path-route', tier: 'advanced', requires: ['bb.passing'], state: lock, percent: 0, xp: 2100,
      desc: 'Cuts, screens and spacing. Most points come from players moving when they do not have the ball.' },
    { id: 'bb.teamd', name: 'Team Defense', icon: 'network-people', tier: 'advanced', requires: ['bb.defense'], state: lock, percent: 0, xp: 2200,
      desc: 'Help side, rotations and talking the whole time. A quiet defense is a beaten defense.' },
    { id: 'bb.range', name: 'Shooting Range', icon: 'range', tier: 'advanced', requires: ['bb.freethrows', 'bb.moves'], state: lock, percent: 0, xp: 2300,
      desc: 'Adding the three-pointer without wrecking your form. Strength comes first, then range.' },
    { id: 'bb.plays', name: 'Running Plays', icon: 'strategy', tier: 'advanced', requires: ['bb.offball'], state: lock, percent: 0, xp: 2000,
      desc: "Learning your team's sets and why they work. Know what every position is supposed to do." },
    { id: 'bb.iq', name: 'Basketball IQ', icon: 'brain', tier: 'expert', core: true, requires: ['bb.plays', 'bb.teamd'], state: lock, percent: 0, xp: 2400,
      desc: 'Reading the defense and making the right play. Watch game film to start seeing the patterns.' },
    { id: 'bb.conditioning', name: 'Conditioning', icon: 'aerobic', tier: 'expert', requires: ['bb.rebound'], state: lock, percent: 0, xp: 2500,
      desc: 'Sprints, agility work and lasting all four quarters. Tired players make bad decisions.' },
    { id: 'bb.mental', name: 'Mental Game', icon: 'mind', tier: 'expert', requires: ['bb.iq'], state: lock, percent: 0, xp: 2600,
      desc: 'Shaking off mistakes and staying confident when shots miss. Next play, every time.' },
    { id: 'bb.varsity', name: 'Making Varsity', icon: 'trophy', tier: 'mastery', requires: ['bb.mental', 'bb.range', 'bb.conditioning'], state: lock, percent: 0, xp: 2600,
      desc: 'Tryouts, coach feedback and off-season work. What you do in the summer decides your season.' },
  ],
};

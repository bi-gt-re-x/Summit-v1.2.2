/**
 * Soccer, a branch of Health & Fitness.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const SOCCER: SubjectTree = {
  id: 'soccer',
  title: 'Soccer',
  blurb: 'Touch, passing and reading the game.',
  parent: 'fitness',
  nodes: [
    { id: 'soc.touch', name: 'First Touch', icon: 'soccer', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Controlling the ball so it drops exactly where you want it. A good first touch buys you time.' },
    { id: 'soc.dribble', name: 'Dribbling', icon: 'agility', tier: 'foundation', requires: ['soc.touch'], state: lock, percent: 0, xp: 1200,
      desc: 'Close control with both feet at speed. Use the inside, outside and sole of your foot.' },
    { id: 'soc.pass', name: 'Passing', icon: 'transfer', tier: 'beginner', core: true, requires: ['soc.touch'], state: lock, percent: 0, xp: 1600,
      desc: "Inside-foot passes with the right weight. Pass to your teammate's foot that's away from the defender." },
    { id: 'soc.shoot', name: 'Shooting', icon: 'goal', tier: 'beginner', requires: ['soc.dribble'], state: lock, percent: 0, xp: 1700,
      desc: 'Laces for power and the inside of the foot for placement. Aim low and to the corners.' },
    { id: 'soc.weak', name: 'Weak Foot', icon: 'balance-scale', tier: 'beginner', requires: ['soc.pass'], state: lock, percent: 0, xp: 1400,
      desc: "Training your other foot until defenders can't force you one way. Fifteen minutes a day really works." },
    { id: 'soc.defend', name: 'Defending', icon: 'shield', tier: 'intermediate', requires: ['soc.pass'], state: lock, percent: 0, xp: 1800,
      desc: "Jockeying, staying patient and timing your tackles. Don't dive in, make them make the move." },
    { id: 'soc.position', name: 'Positioning', icon: 'map', tier: 'intermediate', core: true, requires: ['soc.pass'], state: lock, percent: 0, xp: 1900,
      desc: 'Knowing where to be with and without the ball. Good team shape wins more games than talent.' },
    { id: 'soc.scan', name: 'Scanning', icon: 'vision', tier: 'intermediate', requires: ['soc.position'], state: lock, percent: 0, xp: 2000,
      desc: 'Looking around before the ball arrives. Top players check over their shoulder all the time.' },
    { id: 'soc.heading', name: 'Heading', icon: 'form-check', tier: 'intermediate', requires: ['soc.defend'], state: lock, percent: 0, xp: 1700,
      desc: 'Hitting it with your forehead using safe technique. Youth rules limit heading, so check yours.' },
    { id: 'soc.combos', name: 'Combination Play', icon: 'connected-components', tier: 'advanced', requires: ['soc.scan', 'soc.weak'], state: lock, percent: 0, xp: 2100,
      desc: 'Give-and-gos, overlaps and third-man runs. Quick passing breaks down even good defenses.' },
    { id: 'soc.setpieces', name: 'Set Pieces', icon: 'flag', tier: 'advanced', requires: ['soc.shoot'], state: lock, percent: 0, xp: 2200,
      desc: 'Corners, free kicks and throw-ins. A big share of goals come from dead-ball situations.' },
    { id: 'soc.press', name: 'Pressing', icon: 'pacing', tier: 'advanced', requires: ['soc.defend', 'soc.position'], state: lock, percent: 0, xp: 2300,
      desc: 'Winning the ball back as a team. Press together or hold your shape, never halfway.' },
    { id: 'soc.fitness', name: 'Soccer Fitness', icon: 'aerobic', tier: 'advanced', requires: ['soc.dribble'], state: lock, percent: 0, xp: 2000,
      desc: 'Sprints and quick recovery for a full match. Interval runs match what the game asks of you.' },
    { id: 'soc.tactics', name: 'Tactics & Formations', icon: 'strategy', tier: 'expert', core: true, requires: ['soc.combos', 'soc.press'], state: lock, percent: 0, xp: 2400,
      desc: 'A 4-3-3, a 4-4-2 and what each one asks of you. Know your job in every system your coach uses.' },
    { id: 'soc.keeper', name: 'Goalkeeping Basics', icon: 'hands', tier: 'expert', requires: ['soc.position'], state: lock, percent: 0, xp: 2500,
      desc: 'Catching, diving and positioning. Every field player should know the basics in a pinch.' },
    { id: 'soc.mental', name: 'Mental Toughness', icon: 'mind', tier: 'expert', requires: ['soc.tactics'], state: lock, percent: 0, xp: 2600,
      desc: 'Bouncing back after mistakes and handling big games. Put all your focus on the next action.' },
    { id: 'soc.recruit', name: 'Club & College Soccer', icon: 'trophy', tier: 'mastery', requires: ['soc.mental', 'soc.fitness', 'soc.setpieces', 'soc.keeper'], state: lock, percent: 0, xp: 2600,
      desc: 'Showcases, highlight videos and emailing coaches. Start early and keep your grades up.' },
  ],
};

/**
 * Swimming, a branch of Endurance.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const SWIMMING: SubjectTree = {
  id: 'swimming',
  title: 'Swimming',
  blurb: 'Strokes, starts, turns and racing in the pool.',
  parent: 'endurance',
  nodes: [
    { id: 'sw.safety', name: 'Water Safety', icon: 'safety', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Floating, treading water and knowing your limits. Never swim alone, even if you are good.' },
    { id: 'sw.breathing', name: 'Breathing', icon: 'breath', tier: 'foundation', core: true, requires: ['sw.safety'], state: lock, percent: 0, xp: 1200,
      desc: 'Exhaling underwater and breathing to the side. Most beginners hold their breath and tire out fast.' },
    { id: 'sw.body', name: 'Body Position', icon: 'posture', tier: 'beginner', requires: ['sw.breathing'], state: lock, percent: 0, xp: 1600,
      desc: 'A long, flat body with your head down. Less drag means more speed for the same effort.' },
    { id: 'sw.free', name: 'Freestyle', icon: 'aerobic', tier: 'beginner', core: true, requires: ['sw.body'], state: lock, percent: 0, xp: 1700,
      desc: 'Long strokes, a steady kick and bilateral breathing. It is the stroke you will train the most.' },
    { id: 'sw.back', name: 'Backstroke', icon: 'rotation', tier: 'beginner', requires: ['sw.body'], state: lock, percent: 0, xp: 1400,
      desc: 'Hips up, straight arms and counting strokes to the wall. Learn the flags so you never hit your head.' },
    { id: 'sw.breast', name: 'Breaststroke', icon: 'waves', tier: 'intermediate', requires: ['sw.free'], state: lock, percent: 0, xp: 1800,
      desc: 'Pull, breathe, kick, glide, then repeat. Timing matters a lot more than strength in this stroke.' },
    { id: 'sw.fly', name: 'Butterfly', icon: 'flow', tier: 'intermediate', requires: ['sw.free', 'sw.back'], state: lock, percent: 0, xp: 1900,
      desc: 'Two kicks per stroke and a rolling body. Build it with drills before swimming full lengths.' },
    { id: 'sw.kick', name: 'Kick Sets', icon: 'reps', tier: 'intermediate', requires: ['sw.free'], state: lock, percent: 0, xp: 2000,
      desc: 'Building leg strength with a kickboard and fins. A strong kick holds your body position late in races.' },
    { id: 'sw.starts', name: 'Starts', icon: 'race', tier: 'intermediate', requires: ['sw.free'], state: lock, percent: 0, xp: 1700,
      desc: 'Diving off the blocks with a fast reaction and clean entry. Practice in deep water only.' },
    { id: 'sw.turns', name: 'Flip Turns & Walls', icon: 'cycle', tier: 'advanced', requires: ['sw.starts'], state: lock, percent: 0, xp: 2100,
      desc: 'Flip turns and open turns that keep your speed. Races are often won on the walls.' },
    { id: 'sw.underwater', name: 'Underwaters', icon: 'depth', tier: 'advanced', requires: ['sw.turns', 'sw.fly'], state: lock, percent: 0, xp: 2200,
      desc: "Strong dolphin kicks off every wall. They're often faster than swimming on the surface." },
    { id: 'sw.pacing', name: 'Pacing & Splits', icon: 'pacing', tier: 'advanced', requires: ['sw.kick'], state: lock, percent: 0, xp: 2300,
      desc: 'Using the pace clock and holding even splits. Going out too fast is the classic mistake.' },
    { id: 'sw.im', name: 'Individual Medley', icon: 'checklist', tier: 'expert', requires: ['sw.breast', 'sw.fly', 'sw.underwater'], state: lock, percent: 0, xp: 2300,
      desc: 'All four strokes in one race. Smooth transitions matter just as much as each stroke.' },
    { id: 'sw.training', name: 'Training Seasons', icon: 'training-plan', tier: 'expert', requires: ['sw.pacing'], state: lock, percent: 0, xp: 2400,
      desc: 'Base, build and taper phases. A good taper makes you feel fast right when it counts.' },
    { id: 'sw.dryland', name: 'Dryland Training', icon: 'barbell', tier: 'expert', requires: ['sw.pacing'], state: lock, percent: 0, xp: 2500,
      desc: 'Core, mobility and strength work out of the pool. It protects shoulders and adds power.' },
    { id: 'sw.meets', name: 'Swim Meets', icon: 'trophy', tier: 'mastery', requires: ['sw.im', 'sw.training', 'sw.dryland'], state: lock, percent: 0, xp: 2900,
      desc: 'Warm-ups, heat sheets and racing your best events. Chasing qualifying times keeps the season focused.' },
  ],
};

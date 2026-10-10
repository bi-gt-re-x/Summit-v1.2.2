/**
 * Endurance — a branch of Health & Fitness.
 *
 * Aerobic base sits at the root and gates the interval work, in that order and
 * not the other one. The commonest mistake in the whole subject is running every
 * session at a moderate effort that is too hard to recover from and too easy to
 * drive adaptation.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const ENDURANCE: SubjectTree = {
  id: 'endurance',
  title: 'Endurance',
  blurb: 'Building an engine — mostly slowly, occasionally very hard.',
  parent: 'fitness',
  nodes: [
    { id: 'en.base', name: 'Aerobic Base', icon: 'aerobic', tier: 'foundation', core: true, state: open, percent: 25, xp: 1500,
      desc: 'Easy sustained work, at a pace you could hold a conversation through. It feels too slow to be doing anything and it is the foundation every faster session is built on.' },
    { id: 'en.gait', name: 'Technique', icon: 'gait', tier: 'foundation', requires: ['en.base'], state: lock, percent: 0, xp: 1400,
      desc: 'Cadence, posture and where the foot lands, or the equivalent in the pool and on the bike. Efficiency means going the same speed for less energy, which is worth more than fitness gains at first.' },
    { id: 'en.breath', name: 'Breathing', icon: 'breath', tier: 'foundation', requires: ['en.gait'], state: lock, percent: 0, xp: 1300,
      desc: 'Rhythmic, relaxed and matched to effort. It is also the most reliable everyday gauge of how hard a session actually is, long before any device tells you.' },
    { id: 'en.zones', name: 'Effort Zones', icon: 'zones', tier: 'beginner', core: true, requires: ['en.breath'], state: lock, percent: 0, xp: 1700,
      desc: 'Dividing effort into bands by heart rate, pace or feel. The value is not precision; it is keeping easy days actually easy so hard days can be hard.' },
    { id: 'en.long', name: 'The Long Session', icon: 'long-run', tier: 'beginner', requires: ['en.zones'], state: lock, percent: 0, xp: 1800,
      desc: 'One session a week that goes further than the others, built up gradually. It teaches the body to use fat for fuel and teaches you what happens after ninety minutes.' },
    { id: 'en.volume', name: 'Weekly Volume', icon: 'volume', tier: 'beginner', requires: ['en.long'], state: lock, percent: 0, xp: 1700,
      desc: 'Total time or distance across a week, increased in small steps. Most overuse injuries are a volume jump rather than a technique fault, and they arrive two weeks after the jump.' },
    { id: 'en.intervals', name: 'Intervals', icon: 'intervals-training', tier: 'intermediate', core: true, requires: ['en.zones', 'en.volume'], state: lock, percent: 0, xp: 1900,
      desc: 'Hard efforts with recovery between them, which raise the ceiling that base work raised the floor of. One or two sessions a week is the dose; three is how people get injured.' },
    { id: 'en.threshold', name: 'Threshold Work', icon: 'threshold', tier: 'intermediate', requires: ['en.intervals'], state: lock, percent: 0, xp: 2000,
      desc: 'Comfortably hard efforts at the pace you could hold for about an hour. It is the single most trainable determinant of endurance performance.' },
    { id: 'en.hills', name: 'Hills & Resistance', icon: 'hill', tier: 'intermediate', requires: ['en.intervals'], state: lock, percent: 0, xp: 1800,
      desc: 'Strength work disguised as a session, with less impact than flat speed work. Uphill builds power and downhill is where the damage and the skill both live.' },
    { id: 'en.strength', name: 'Strength for Endurance', icon: 'barbell', tier: 'intermediate', requires: ['en.gait'], state: lock, percent: 0, xp: 1800,
      desc: 'Two sessions a week of heavy, low-rep lifting, which improves economy and resistance to injury. It does not make endurance athletes bulky, which is the fear that keeps most of them from doing it.' },
    { id: 'en.fuel', name: 'Fuelling', icon: 'fuel', tier: 'intermediate', requires: ['en.long'], state: lock, percent: 0, xp: 1800,
      desc: 'Carbohydrate before and during anything long, practiced in training rather than tried on the day. The gut is trainable, and race day is the worst possible place to discover it is not.' },
    { id: 'en.heat', name: 'Heat, Cold & Altitude', icon: 'climate', tier: 'advanced', requires: ['en.fuel'], state: lock, percent: 0, xp: 1900,
      desc: 'How conditions change achievable pace and required fluid. Adjusting expectations for the weather is a skill; refusing to is how a good session becomes a bad week.' },
    { id: 'en.plan', name: 'Training Plans', icon: 'training-plan', tier: 'advanced', core: true, requires: ['en.threshold', 'en.volume'], state: lock, percent: 0, xp: 2200,
      desc: 'Weeks arranged around one goal, with easy weeks built in. Roughly eighty percent easy and twenty percent hard is the distribution that keeps reappearing across sports and levels.' },
    { id: 'en.recover', name: 'Recovery Between Sessions', icon: 'recovery', tier: 'advanced', requires: ['en.plan'], state: lock, percent: 0, xp: 1900,
      desc: 'Sleep, food and easy days, which are training rather than the absence of it. Adaptation happens in the gaps, and removing them removes the point of the work.' },
    { id: 'en.injury', name: 'Common Injuries', icon: 'injury', tier: 'advanced', requires: ['en.recover', 'en.strength'], state: lock, percent: 0, xp: 2000,
      desc: 'Shins, knees, tendons and the pattern that precedes each. Almost all of them announce themselves quietly for a week before the session that gets blamed.' },
    { id: 'en.pacing', name: 'Pacing', icon: 'pacing', tier: 'advanced', requires: ['en.plan'], state: lock, percent: 0, xp: 2100,
      desc: 'Distributing effort so the last quarter is the fastest you can make it. Going out too hard is universal, feels correct at the time, and costs more than any tactical error later.' },
    { id: 'en.taper', name: 'Tapering', icon: 'taper', tier: 'expert', requires: ['en.pacing'], state: lock, percent: 0, xp: 2200,
      desc: 'Reducing volume while keeping some intensity in the last couple of weeks. Fitness is already banked; the taper only lets accumulated fatigue clear so it can be shown.' },
    { id: 'en.race', name: 'Racing', icon: 'race', tier: 'expert', requires: ['en.taper', 'en.heat'], state: lock, percent: 0, xp: 2400,
      desc: 'Executing a plan while adrenaline argues for a different one. Nutrition, pacing and the willingness to hold back for the first third are decided beforehand or not at all.' },
    { id: 'en.crosstrain', name: 'Cross-Training', icon: 'cross-train', tier: 'expert', requires: ['en.injury'], state: lock, percent: 0, xp: 2100,
      desc: 'Swimming, cycling or rowing to keep the engine while a joint recovers. It is what turns an injury from a lost season into a lost month.' },
    { id: 'en.season', name: 'Seasons & Longevity', icon: 'longevity', tier: 'mastery', requires: ['en.race', 'en.crosstrain'], state: lock, percent: 0, xp: 2900,
      desc: 'Building years rather than blocks, with off-seasons that are really off. The athletes who improve for a decade are the ones who allowed themselves to be unfit for a few weeks each year.' },
  ],
};

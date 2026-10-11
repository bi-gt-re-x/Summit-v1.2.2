/**
 * Leadership, a branch of Work & Career.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const LEADERSHIP: SubjectTree = {
  id: 'leadership',
  title: 'Leadership',
  blurb: 'Leading a club, a team or a project people want to be part of.',
  parent: 'career',
  nodes: [
    { id: 'ld.self', name: 'Leading Yourself', icon: 'self-manage', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Keeping your own promises first. People follow those who do what they say they will.' },
    { id: 'ld.listen', name: 'Listening', icon: 'listening', tier: 'foundation', requires: ['ld.self'], state: lock, percent: 0, xp: 1200,
      desc: 'Hearing people out fully before you answer. Most team problems start with someone not feeling heard.' },
    { id: 'ld.example', name: 'Leading by Example', icon: 'flag', tier: 'beginner', requires: ['ld.self'], state: lock, percent: 0, xp: 1600,
      desc: 'Doing the hard jobs yourself. Your team copies what you do much more than what you say.' },
    { id: 'ld.comm', name: 'Clear Communication', icon: 'message', tier: 'beginner', core: true, requires: ['ld.listen'], state: lock, percent: 0, xp: 1700,
      desc: 'Saying what needs to happen, by when and why. Repeat important things more than feels necessary.' },
    { id: 'ld.goals', name: 'Setting Goals', icon: 'target', tier: 'beginner', requires: ['ld.comm'], state: lock, percent: 0, xp: 1400,
      desc: 'Goals your group can actually reach and track. Make them specific, with a date on each one.' },
    { id: 'ld.meetings', name: 'Running Meetings', icon: 'meeting', tier: 'intermediate', requires: ['ld.goals'], state: lock, percent: 0, xp: 1800,
      desc: 'An agenda, a time limit and clear next steps. Bad meetings drain clubs faster than anything.' },
    { id: 'ld.delegate', name: 'Delegating', icon: 'delegate', tier: 'intermediate', core: true, requires: ['ld.meetings'], state: lock, percent: 0, xp: 1900,
      desc: 'Giving people real jobs and trusting them to do them. Trying to do everything yourself burns you out.' },
    { id: 'ld.motivate', name: 'Motivating People', icon: 'spark', tier: 'intermediate', requires: ['ld.example', 'ld.comm'], state: lock, percent: 0, xp: 2000,
      desc: 'Recognizing effort and connecting the work to a purpose. Thank people in public.' },
    { id: 'ld.include', name: 'Including Everyone', icon: 'accessibility', tier: 'intermediate', requires: ['ld.listen'], state: lock, percent: 0, xp: 1700,
      desc: 'Making sure quiet members get a voice. Different views lead to better decisions.' },
    { id: 'ld.conflict', name: 'Handling Conflict', icon: 'conflict', tier: 'advanced', requires: ['ld.motivate', 'ld.listen'], state: lock, percent: 0, xp: 2100,
      desc: 'Talking to people privately and finding common ground. Deal with problems while they are still small.' },
    { id: 'ld.feedback', name: 'Giving Feedback', icon: 'feedback', tier: 'advanced', requires: ['ld.delegate'], state: lock, percent: 0, xp: 2200,
      desc: 'Feedback that is specific, kind and on time. Praise in public and correct in private.' },
    { id: 'ld.decide', name: 'Making Decisions', icon: 'decision', tier: 'advanced', core: true, requires: ['ld.conflict', 'ld.include'], state: lock, percent: 0, xp: 2300,
      desc: 'Getting input, then choosing and explaining why. Putting off a decision is a choice too.' },
    { id: 'ld.events', name: 'Planning Events', icon: 'party', tier: 'expert', requires: ['ld.delegate'], state: lock, percent: 0, xp: 2300,
      desc: 'Budgets, timelines and roles for big events like fundraisers. Plan backwards from the date.' },
    { id: 'ld.pressure', name: 'Leading Under Pressure', icon: 'warning', tier: 'expert', requires: ['ld.decide'], state: lock, percent: 0, xp: 2400,
      desc: 'Staying calm when plans fall apart at the last minute. Your mood spreads to the whole team.' },
    { id: 'ld.vision', name: 'Setting a Vision', icon: 'horizon', tier: 'expert', requires: ['ld.goals', 'ld.decide'], state: lock, percent: 0, xp: 2500,
      desc: 'Where the group should be a year from now. A clear vision helps people make choices without you.' },
    { id: 'ld.successors', name: 'Growing New Leaders', icon: 'growth-curve', tier: 'mastery', requires: ['ld.vision', 'ld.feedback'], state: lock, percent: 0, xp: 2900,
      desc: 'Training people to take over after you. Great leaders make themselves easy to replace.' },
    { id: 'ld.reflect', name: 'Reflecting on Leadership', icon: 'reflect', tier: 'mastery', requires: ['ld.pressure', 'ld.events'], state: lock, percent: 0, xp: 2600,
      desc: "Looking back at what worked and what didn't. Write it down for college essays and interviews." },
  ],
};

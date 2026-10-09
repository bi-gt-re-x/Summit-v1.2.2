/**
 * Management — a branch of Business & Money.
 *
 * The tree runs outward: yourself, then one other person, then a team, then a
 * function. That order is not seniority, it is dependency — delegation cannot be
 * learned by somebody who cannot yet plan their own week, and every failure of
 * the later nodes traces back to one of the earlier ones.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const MANAGEMENT: SubjectTree = {
  id: 'management',
  title: 'Management',
  blurb: 'Getting work done through other people without becoming the bottleneck.',
  parent: 'business',
  nodes: [
    { id: 'mg.self', name: 'Managing Yourself', icon: 'self-manage', tier: 'foundation', core: true, state: open, percent: 20, xp: 1400,
      desc: 'Reliable follow-through on your own commitments before asking anybody to rely on you. A manager who drops things teaches the team that dropping things is acceptable.' },
    { id: 'mg.listen', name: 'Listening', icon: 'listening', tier: 'foundation', requires: ['mg.self'], state: lock, percent: 0, xp: 1400,
      desc: 'Hearing what somebody actually said, including the part they were reluctant to say. Most management problems are visible weeks earlier to somebody who was asked and listened to.' },
    { id: 'mg.clarity', name: 'Setting Expectations', icon: 'expectations', tier: 'foundation', requires: ['mg.listen'], state: lock, percent: 0, xp: 1600,
      desc: 'Saying what good looks like and by when, before the work starts. A surprising share of underperformance is a person doing exactly what they understood was wanted.' },
    { id: 'mg.oneones', name: 'One to Ones', icon: 'one-on-one', tier: 'beginner', core: true, requires: ['mg.clarity'], state: lock, percent: 0, xp: 1700,
      desc: 'A regular, protected conversation that belongs to the other person. Canceling it repeatedly says more about your priorities than anything you would say in it.' },
    { id: 'mg.feedback', name: 'Feedback', icon: 'feedback', tier: 'beginner', requires: ['mg.oneones'], state: lock, percent: 0, xp: 1800,
      desc: 'Specific, timely and about the work. Saved for a review six months later it is no longer feedback, it is a verdict on something nobody could still fix.' },
    { id: 'mg.delegate', name: 'Delegation', icon: 'delegate', tier: 'beginner', core: true, requires: ['mg.clarity'], state: lock, percent: 0, xp: 1800,
      desc: 'Handing over the outcome and the authority, not the task and the instructions. Keeping the interesting work is the most common way a new manager stalls both the team and themselves.' },
    { id: 'mg.prioritise', name: 'Prioritising', icon: 'priority', tier: 'beginner', requires: ['mg.delegate'], state: lock, percent: 0, xp: 1700,
      desc: 'Deciding what the team will not do this quarter. A list where everything is important is a list that has not been prioritized, whatever order it is in.' },
    { id: 'mg.plan', name: 'Planning Work', icon: 'plan', tier: 'intermediate', requires: ['mg.prioritise'], state: lock, percent: 0, xp: 1800,
      desc: 'Breaking an objective into work with owners and dates that somebody actually believes. Estimates are ranges, and treating one as a commitment is how a plan becomes a fiction.' },
    { id: 'mg.meetings', name: 'Running Meetings', icon: 'meeting', tier: 'intermediate', requires: ['mg.plan'], state: lock, percent: 0, xp: 1600,
      desc: 'A purpose, the right people and a decision at the end. The best improvement most teams can make is deleting half of them and writing the update instead.' },
    { id: 'mg.decide', name: 'Decision Making', icon: 'decision', tier: 'intermediate', core: true, requires: ['mg.meetings'], state: lock, percent: 0, xp: 2000,
      desc: 'Knowing which decisions are reversible and moving fast on those. Saying who decides, before the discussion, prevents the meeting that ends with everybody assuming somebody else will.' },
    { id: 'mg.hire', name: 'Hiring', icon: 'hiring', tier: 'intermediate', requires: ['mg.decide'], state: lock, percent: 0, xp: 2100,
      desc: 'Defining the role, running a fair process and testing for the work itself. A slow hire is expensive and a wrong hire is far more expensive, mostly to the people around them.' },
    { id: 'mg.onboard', name: 'Onboarding', icon: 'onboard', tier: 'intermediate', requires: ['mg.hire'], state: lock, percent: 0, xp: 1700,
      desc: 'The first month deciding whether somebody becomes effective or quietly disengages. A first task that ships, and one named person to ask anything, does most of the work.' },
    { id: 'mg.coach', name: 'Coaching & Growth', icon: 'coaching', tier: 'advanced', requires: ['mg.feedback', 'mg.onboard'], state: lock, percent: 0, xp: 2200,
      desc: 'Helping somebody get better at what they want to be better at, which may not be what you want from them. Asking beats telling, and the payoff is longer than any one quarter.' },
    { id: 'mg.conflict', name: 'Conflict', icon: 'conflict', tier: 'advanced', requires: ['mg.coach'], state: lock, percent: 0, xp: 2200,
      desc: 'Two people who both have a point, addressed early and in person. Avoided, it does not fade; it becomes a fact about the team that new joiners inherit.' },
    { id: 'mg.performance', name: 'Performance Problems', icon: 'performance', tier: 'advanced', requires: ['mg.conflict'], state: lock, percent: 0, xp: 2300,
      desc: 'Naming the gap, agreeing what changes, and following through either way. Handled clearly it is a kindness; left alone it is unfair to the person and to everybody covering for them.' },
    { id: 'mg.trust', name: 'Trust & Safety', icon: 'trust', tier: 'advanced', core: true, requires: ['mg.coach'], state: lock, percent: 0, xp: 2300,
      desc: 'A team where bad news travels upward quickly. It is built by how you react the first few times somebody tells you something you did not want to hear.' },
    { id: 'mg.process', name: 'Process & Systems', icon: 'process', tier: 'advanced', requires: ['mg.plan'], state: lock, percent: 0, xp: 2000,
      desc: 'Enough structure that the work does not depend on you remembering. Every process has a cost, and the ones added after a single incident are the ones to review.' },
    { id: 'mg.metrics', name: 'Measuring a Team', icon: 'kpi', tier: 'expert', requires: ['mg.process', 'mg.performance'], state: lock, percent: 0, xp: 2400,
      desc: 'Choosing indicators that do not distort behavior when people know they are being measured. Any single number will be gamed eventually, including by well-intentioned people.' },
    { id: 'mg.change', name: 'Leading Change', icon: 'change', tier: 'expert', requires: ['mg.trust', 'mg.metrics'], state: lock, percent: 0, xp: 2500,
      desc: 'Moving a group to a new way of working while the current one is still running. Explaining why, repeatedly and to individuals, is most of the job.' },
    { id: 'mg.lead', name: 'Leadership', icon: 'leadership', tier: 'mastery', requires: ['mg.change'], state: lock, percent: 0, xp: 2900,
      desc: 'Setting direction people choose to follow, and being the same person under pressure as when things are calm. Authority comes with the title; this does not.' },
  ],
};

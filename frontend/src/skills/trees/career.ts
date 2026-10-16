/**
 * Work & Career — a branch of Productivity.
 *
 * The catalogue files meetings, email, presenting, interviews and job searching
 * together, and they are one subject: being effective and legible inside an
 * organisation. Written communication sits early because it is the medium almost
 * everything else here happens in.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const CAREER: SubjectTree = {
  id: 'career',
  title: 'Work & Career',
  blurb: 'Being effective at work, and being seen to be. Which are two skills.',
  parent: 'productivity',
  nodes: [
    { id: 'ca.reliable', name: 'Reliability', icon: 'reliable', tier: 'foundation', core: true, state: open, percent: 25, xp: 1400,
      desc: 'Doing what you said by when you said, or saying early that you cannot. It is unglamorous and it is the reputation everything else is built on.' },
    { id: 'ca.email', name: 'Email & Messages', icon: 'email', tier: 'foundation', requires: ['ca.reliable'], state: lock, percent: 0, xp: 1400,
      desc: 'Writing so the reader knows what is wanted from them in the first two lines. A message that buries the request under context gets answered late or not at all.' },
    { id: 'ca.writing', name: 'Writing at Work', icon: 'report', tier: 'foundation', requires: ['ca.email'], state: lock, percent: 0, xp: 1600,
      desc: 'Documents that survive being skimmed: conclusion first, headings, and a summary somebody could act on alone. Most workplace writing is read by people looking for one thing.' },
    { id: 'ca.meetings', name: 'Meetings', icon: 'meeting', tier: 'beginner', requires: ['ca.writing'], state: lock, percent: 0, xp: 1600,
      desc: 'Knowing why you are there, contributing, and leaving with an owner and a date attached to anything decided. A meeting with no decision should have been a message.' },
    { id: 'ca.notes', name: 'Following Up', icon: 'follow-up', tier: 'beginner', requires: ['ca.meetings'], state: lock, percent: 0, xp: 1400,
      desc: 'A short written record of what was agreed, sent afterwards. It takes five minutes and it is what prevents the most common failure mode of collaborative work.' },
    { id: 'ca.async', name: 'Working with Others Remotely', icon: 'remote', tier: 'beginner', requires: ['ca.notes'], state: lock, percent: 0, xp: 1600,
      desc: 'Writing things down, being explicit about status, and not assuming everybody saw the thread. Distributed work fails on unstated assumptions rather than on technology.' },
    { id: 'ca.present', name: 'Presenting', icon: 'presenting', tier: 'beginner', core: true, requires: ['ca.writing'], state: lock, percent: 0, xp: 1800,
      desc: 'One clear message, slides that support rather than duplicate you, and a rehearsal out loud. Reading your own slides aloud is the most common and most avoidable failure.' },
    { id: 'ca.questions', name: 'Asking Good Questions', icon: 'question', tier: 'intermediate', requires: ['ca.async'], state: lock, percent: 0, xp: 1600,
      desc: 'Saying what you tried, what you expected and what happened. It respects the time of whoever answers and usually solves the problem while you are writing it.' },
    { id: 'ca.feedback', name: 'Receiving Feedback', icon: 'feedback', tier: 'intermediate', requires: ['ca.questions'], state: lock, percent: 0, xp: 1800,
      desc: 'Listening, asking for specifics, and separating the work from yourself. Getting defensive is normal and expensive, because it teaches people to stop telling you things.' },
    { id: 'ca.visible', name: 'Making Work Visible', icon: 'visibility', tier: 'intermediate', core: true, requires: ['ca.present'], state: lock, percent: 0, xp: 1900,
      desc: 'Keeping a record of what you did and its effect, and sharing progress without being asked. Good work that nobody knows about is indistinguishable from no work at review time.' },
    { id: 'ca.stakeholders', name: 'Working Across Teams', icon: 'stakeholder', tier: 'intermediate', requires: ['ca.feedback'], state: lock, percent: 0, xp: 1900,
      desc: 'Understanding what other groups are measured on, which explains most of what looks like obstruction. Finding the shared interest is faster than escalating.' },
    { id: 'ca.priorities', name: 'Managing Your Workload', icon: 'workload', tier: 'intermediate', requires: ['ca.visible'], state: lock, percent: 0, xp: 1900,
      desc: 'Being explicit about what will slip when something is added. Silently absorbing everything ends in missed commitments, and by then the choice has been made for you.' },
    { id: 'ca.skills', name: 'Deliberate Skill Growth', icon: 'skill-up', tier: 'advanced', requires: ['ca.feedback'], state: lock, percent: 0, xp: 2000,
      desc: 'Choosing what to get better at rather than absorbing whatever the job happens to teach. Time at a desk is not experience; repeated practice on hard things is.' },
    { id: 'ca.network', name: 'Professional Relationships', icon: 'network-people', tier: 'advanced', requires: ['ca.stakeholders'], state: lock, percent: 0, xp: 1900,
      desc: 'Staying in touch with people you worked well with, before you need anything. Most jobs arrive through weak connections rather than through applications.' },
    { id: 'ca.cv', name: 'CV & Portfolio', icon: 'resume', tier: 'advanced', requires: ['ca.visible'], state: lock, percent: 0, xp: 1800,
      desc: 'What you did, at what scale, with what result. Responsibilities describe a job description; outcomes describe you doing it.' },
    { id: 'ca.search', name: 'Job Searching', icon: 'jobsearch', tier: 'advanced', requires: ['ca.cv', 'ca.network'], state: lock, percent: 0, xp: 2000,
      desc: 'A targeted small number of applications beats a hundred generic ones. Reading the posting properly and answering it specifically is most of what gets a reply.' },
    { id: 'ca.interview', name: 'Interviewing', icon: 'interview', tier: 'advanced', core: true, requires: ['ca.search'], state: lock, percent: 0, xp: 2200,
      desc: 'Structured answers with a situation, what you did and what resulted. Prepared stories beat improvisation, and questions you ask them are assessed as closely as your answers.' },
    { id: 'ca.negotiate', name: 'Negotiating an Offer', icon: 'negotiate', tier: 'expert', requires: ['ca.interview'], state: lock, percent: 0, xp: 2300,
      desc: 'Knowing the range, asking once, politely and specifically. The conversation is uncomfortable for a few minutes and compounds for years, in both directions.' },
    { id: 'ca.transition', name: 'Changing Direction', icon: 'career-change', tier: 'expert', requires: ['ca.skills', 'ca.negotiate'], state: lock, percent: 0, xp: 2400,
      desc: 'Moving to different work by finding the overlap and building the missing piece publicly. Sideways moves inside a place you are known are usually the cheapest route.' },
    { id: 'ca.direction', name: 'Deciding What You Want', icon: 'compass', tier: 'mastery', requires: ['ca.transition'], state: lock, percent: 0, xp: 2800,
      desc: 'Working out what you actually want from work. The conditions, not the title. It is the question this whole tree is in service of and the one most easily deferred indefinitely.' },
    { id: 'ca.job', name: 'Part-Time Job', icon: 'employment', tier: 'foundation', requires: ['ca.reliable'], navTo: 'part-time-job', state: lock,
      desc: 'Its own tree: getting hired, your first paycheck, customer service and balancing school.' },
    { id: 'ca.intern', name: 'Internships', icon: 'onboard', tier: 'intermediate', requires: ['ca.visible'], navTo: 'internships', state: lock,
      desc: 'Its own tree: finding and landing an internship, doing great work and the offer after.' },
    { id: 'ca.lead', name: 'Leadership', icon: 'leadership', tier: 'intermediate', requires: ['ca.present'], navTo: 'leadership', state: lock,
      desc: 'Its own tree: running meetings, delegating, handling conflict and growing the next leaders.' },
  ],
};

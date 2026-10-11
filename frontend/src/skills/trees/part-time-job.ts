/**
 * Part-Time Job, a branch of Work & Career.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const PART_TIME_JOB: SubjectTree = {
  id: 'part-time-job',
  title: 'Part-Time Job',
  blurb: 'Getting hired, doing well and balancing it with school.',
  parent: 'career',
  nodes: [
    { id: 'job.find', name: 'Finding a Job', icon: 'jobsearch', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Restaurants, stores, tutoring, lifeguarding and babysitting. Ask around, since lots of teen jobs never get posted.' },
    { id: 'job.papers', name: 'Work Permits & Paperwork', icon: 'source-doc', tier: 'foundation', requires: ['job.find'], state: lock, percent: 0, xp: 1200,
      desc: 'Work permits, ID, tax forms and bank info. The rules for teens vary by state, so look yours up.' },
    { id: 'job.resume', name: 'Your First Resume', icon: 'resume', tier: 'beginner', requires: ['job.find'], state: lock, percent: 0, xp: 1600,
      desc: "School, activities, volunteering and skills. You don't need job experience to have a good resume." },
    { id: 'job.apply', name: 'Applying', icon: 'apply', tier: 'beginner', requires: ['job.find'], state: lock, percent: 0, xp: 1700,
      desc: 'Filling out applications and dropping off a resume. Show up in person when you can, and dress neatly.' },
    { id: 'job.interview', name: 'Job Interviews', icon: 'interview', tier: 'beginner', core: true, requires: ['job.apply', 'job.resume'], state: lock, percent: 0, xp: 1400,
      desc: 'Being on time, smiling and having a few examples ready. Practice the common questions out loud.' },
    { id: 'job.first', name: 'Your First Week', icon: 'onboard', tier: 'intermediate', requires: ['job.interview', 'job.papers'], state: lock, percent: 0, xp: 1800,
      desc: 'Learning the ropes, asking questions and writing things down. Everyone expects you to be new.' },
    { id: 'job.reliable', name: 'Being Reliable', icon: 'reliable', tier: 'intermediate', core: true, requires: ['job.first'], state: lock, percent: 0, xp: 1900,
      desc: 'Showing up on time and covering the shifts you agreed to. Reliability gets you more hours and good references.' },
    { id: 'job.service', name: 'Customer Service', icon: 'customer', tier: 'intermediate', requires: ['job.first'], state: lock, percent: 0, xp: 2000,
      desc: 'Staying friendly with difficult people. Stay calm, listen and grab a manager when you need one.' },
    { id: 'job.school', name: 'Balancing School', icon: 'calendar-block', tier: 'intermediate', requires: ['job.reliable'], state: lock, percent: 0, xp: 1700,
      desc: 'Keeping your hours low during busy school weeks. Tell your manager about exams early.' },
    { id: 'job.paycheck', name: 'Understanding Your Paycheck', icon: 'income', tier: 'advanced', requires: ['job.papers'], state: lock, percent: 0, xp: 2100,
      desc: 'Taxes, withholding and hourly math. Your take-home pay will be lower than you expect.' },
    { id: 'job.save', name: 'Saving What You Earn', icon: 'piggy-bank', tier: 'advanced', requires: ['job.paycheck'], state: lock, percent: 0, xp: 2200,
      desc: 'Splitting each paycheck into saving and spending. A savings habit started now grows huge over time.' },
    { id: 'job.team', name: 'Working With Coworkers', icon: 'friends', tier: 'advanced', requires: ['job.service'], state: lock, percent: 0, xp: 2300,
      desc: 'Getting along with people of all ages. Help out without being asked and people notice.' },
    { id: 'job.boss', name: 'Talking to Your Boss', icon: 'one-on-one', tier: 'advanced', requires: ['job.team', 'job.school'], state: lock, percent: 0, xp: 2000,
      desc: 'Asking for time off, more hours or feedback. Be specific and give plenty of notice.' },
    { id: 'job.rights', name: 'Your Rights at Work', icon: 'balance-scale', tier: 'expert', requires: ['job.boss'], state: lock, percent: 0, xp: 2400,
      desc: 'Minimum wage, breaks, hour limits for teens and safety rules. Know them so nobody takes advantage of you.' },
    { id: 'job.raise', name: 'Asking for a Raise', icon: 'negotiate', tier: 'expert', requires: ['job.rights', 'job.save'], state: lock, percent: 0, xp: 2500,
      desc: "Showing what you've done and asking at the right time. Back it up with real examples." },
    { id: 'job.leave', name: 'Leaving Well', icon: 'transition', tier: 'expert', requires: ['job.raise'], state: lock, percent: 0, xp: 2600,
      desc: "Giving two weeks' notice and asking for a reference. You never know when you'll need that boss again." },
    { id: 'job.story', name: 'Using Your Experience', icon: 'career', tier: 'mastery', requires: ['job.leave'], state: lock, percent: 0, xp: 2600,
      desc: 'Turning job skills into resume lines and essay stories. A cashier job shows responsibility colleges value.' },
  ],
};

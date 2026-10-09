/**
 * Productivity — a root subject.
 *
 * The one tree in the app whose subject is the app itself: capture, planning,
 * review and the discipline of deciding what not to do. It forks into studying,
 * focus and work, which are the three places the catalogue puts the same skills
 * to different uses.
 */
import type { SubjectTree } from './types';
import { done, prog, open, lock } from './types';

export const PRODUCTIVITY: SubjectTree = {
  id: 'productivity',
  title: 'Productivity',
  blurb: 'Getting the right things done without holding all of them in your head.',
  group: 'Work',
  nodes: [
    { id: 'pd.capture', name: 'Capture', icon: 'inbox', tier: 'foundation', core: true, state: done, percent: 100, xp: 1200,
      desc: 'Writing everything down the moment it appears, in one place you trust. The value is not the list; it is that nothing is being held in working memory where it costs attention all day.' },
    { id: 'pd.tasks', name: 'Tasks Worth Writing', icon: 'todo', tier: 'foundation', requires: ['pd.capture'], state: prog, percent: 70, xp: 1300,
      desc: 'A task that names a physical next action rather than a topic. "Sort out the insurance" sits untouched for weeks; "find the renewal email" gets done in four minutes.' },
    { id: 'pd.today', name: 'Deciding the Day', icon: 'day-plan', tier: 'foundation', core: true, requires: ['pd.tasks'], state: prog, percent: 55, xp: 1500,
      desc: 'Choosing a small number of things for today, in the morning or the night before. A list of thirty is not a plan; it is a way of guaranteeing the day ends in a sense of failure.' },
    { id: 'pd.priority', name: 'Prioritising', icon: 'priority', tier: 'beginner', requires: ['pd.today'], state: open, percent: 30, xp: 1600,
      desc: 'Separating what is urgent from what actually matters, and doing the second before the first has finished shouting. Most days are spent entirely on urgent items belonging to other people unless this is deliberate.' },
    { id: 'pd.estimate', name: 'Estimating Time', icon: 'estimate', tier: 'beginner', requires: ['pd.today'], state: lock, percent: 0, xp: 1500,
      desc: 'Guessing how long something will take and then checking. Everybody underestimates, consistently, and the only fix is a record of how wrong you were last time.' },
    { id: 'pd.calendar', name: 'Time Blocking', icon: 'calendar-block', tier: 'beginner', requires: ['pd.estimate', 'pd.priority'], state: lock, percent: 0, xp: 1700,
      desc: 'Putting work in the calendar rather than on a list, so it has to compete with everything else for actual hours. A list pretends time is infinite; a calendar refuses to.' },
    { id: 'pd.batch', name: 'Batching', icon: 'batch', tier: 'beginner', requires: ['pd.calendar'], state: lock, percent: 0, xp: 1400,
      desc: 'Grouping similar work so the setup cost is paid once. Email four times a day rather than continuously is the standard example, and the one with the largest effect.' },
    { id: 'pd.start', name: 'Starting', icon: 'kickoff', tier: 'intermediate', core: true, requires: ['pd.today'], state: lock, percent: 0, xp: 1700,
      desc: 'Getting past the first two minutes, which is where most procrastination actually lives. Shrinking the first step until it is faintly ridiculous is the reliable trick.' },
    { id: 'pd.procrastination', name: 'Procrastination', icon: 'avoidance', tier: 'intermediate', requires: ['pd.start'], state: lock, percent: 0, xp: 1800,
      desc: 'Usually avoidance of a feeling rather than laziness: the task is ambiguous, or the outcome is frightening. Naming which one it is suggests the fix, and discipline alone rarely does.' },
    { id: 'pd.habits', name: 'Habits', icon: 'habit', tier: 'intermediate', requires: ['pd.start'], state: lock, percent: 0, xp: 1800,
      desc: 'Behavior that no longer requires a decision, built with a cue, a small action and a consistent time. Starting far too small is what makes one stick.' },
    { id: 'pd.energy', name: 'Energy & Rhythms', icon: 'energy', tier: 'intermediate', requires: ['pd.calendar'], state: lock, percent: 0, xp: 1700,
      desc: 'Matching demanding work to the hours you are actually sharp. Scheduling analytical work into your worst two hours daily is a hidden and enormous tax.' },
    { id: 'pd.review', name: 'The Weekly Review', icon: 'weekly-review', tier: 'intermediate', core: true, requires: ['pd.batch'], state: lock, percent: 0, xp: 1900,
      desc: 'An hour to empty the inbox, look at every commitment and choose the coming week. It is the maintenance that keeps a system trustworthy, and the first thing dropped when things get busy.' },
    { id: 'pd.notes', name: 'Notes & Reference', icon: 'notes', tier: 'intermediate', requires: ['pd.capture'], state: lock, percent: 0, xp: 1600,
      desc: 'Somewhere to put things you will want later but do not have to act on. Keeping reference material out of the task list is what stops the list becoming unreadable.' },
    { id: 'pd.goals', name: 'Goals', icon: 'goal', tier: 'advanced', requires: ['pd.review'], state: lock, percent: 0, xp: 2000,
      desc: 'A small number of outcomes with a date and a defined finish. Goals without a next action are wishes, and goals without a review are forgotten by February.' },
    { id: 'pd.projects', name: 'Projects', icon: 'project', tier: 'advanced', requires: ['pd.goals'], state: lock, percent: 0, xp: 2000,
      desc: 'Anything that takes more than one action, broken down far enough that the next step is obvious. A stalled project is nearly always one whose next action was never defined.' },
    { id: 'pd.saying-no', name: 'Saying No', icon: 'decline', tier: 'advanced', requires: ['pd.priority'], state: lock, percent: 0, xp: 1900,
      desc: 'Declining early and clearly rather than agreeing and delivering late. Every yes is a no to something with less of a voice, usually your own work.' },
    { id: 'pd.tools', name: 'Tools', icon: 'toolbox', tier: 'advanced', requires: ['pd.notes'], state: lock, percent: 0, xp: 1600,
      desc: 'The smallest set of tools that supports the habits. Reorganizing the system is itself a satisfying form of procrastination, and switching apps has never once been the problem.' },
    { id: 'pd.reflect', name: 'Reflection', icon: 'reflect', tier: 'advanced', requires: ['pd.review', 'pd.projects'], state: lock, percent: 0, xp: 2100,
      desc: 'Looking back at what worked and what did not, on purpose and in writing. Without it, the same week is repeated with more effort applied to it.' },
    { id: 'pd.system', name: 'A System You Trust', icon: 'system', tier: 'mastery', requires: ['pd.reflect', 'pd.saying-no', 'pd.tools'], state: lock, percent: 0, xp: 2800,
      desc: 'Everything captured, reviewed regularly, and reliable enough that nothing is being remembered. That trust is the point of the whole tree: it is what makes it possible to work on one thing without the rest of it nagging.' },
    { id: 'pd.focus', name: 'Focus & Deep Work', icon: 'focus', tier: 'intermediate', requires: ['pd.start'], navTo: 'focus', state: lock,
      desc: 'A subject of its own: sustained attention, and defending it from everything designed to interrupt it.' },
    { id: 'pd.study', name: 'Studying', icon: 'study', tier: 'intermediate', requires: ['pd.notes'], navTo: 'study', state: lock,
      desc: 'A subject of its own: learning material deliberately, and remembering it past the exam.' },
    { id: 'pd.career', name: 'Work & Career', icon: 'career', tier: 'advanced', requires: ['pd.saying-no'], navTo: 'career', state: lock,
      desc: 'A subject of its own: the meetings, writing and decisions that make up a working week.' },
  ],
};

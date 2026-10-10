/**
 * Focus & Deep Work — a branch of Productivity.
 *
 * Environment before technique. Every node about willpower sits below the nodes
 * about removing the interruption, because a notification that never arrives
 * costs nothing to resist and one that does costs the next twenty minutes.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const FOCUS: SubjectTree = {
  id: 'focus',
  title: 'Focus & Deep Work',
  blurb: 'Long stretches of undivided attention, defended on purpose.',
  parent: 'productivity',
  nodes: [
    { id: 'fo.attention', name: 'How Attention Works', icon: 'attention', tier: 'foundation', core: true, state: open, percent: 20, xp: 1400,
      desc: 'A limited resource that refills with rest and is spent by switching. Understanding that switching has a cost, rather than believing in multitasking, is what makes the rest of this tree worth doing.' },
    { id: 'fo.distraction', name: 'Naming Distractions', icon: 'distraction', tier: 'foundation', requires: ['fo.attention'], state: lock, percent: 0, xp: 1400,
      desc: 'Keeping a note of what pulled you away for a week. It is nearly always a shorter and more specific list than expected, which makes it fixable.' },
    { id: 'fo.environment', name: 'Environment', icon: 'workspace', tier: 'foundation', core: true, requires: ['fo.distraction'], state: lock, percent: 0, xp: 1600,
      desc: 'A place where the default is work: the phone in another room, the browser closed, the door shut. Changing the surroundings beats resisting them every time.' },
    { id: 'fo.notifications', name: 'Notifications', icon: 'notification-off', tier: 'beginner', requires: ['fo.environment'], state: lock, percent: 0, xp: 1500,
      desc: 'Turning off everything that is not a person needing an answer now, which is almost all of it. Each interruption costs far longer than it takes, because attention has to be rebuilt.' },
    { id: 'fo.sessions', name: 'Focus Sessions', icon: 'timer', tier: 'beginner', requires: ['fo.notifications'], state: lock, percent: 0, xp: 1600,
      desc: 'A fixed block with one task and a timer running. The length matters less than the commitment not to switch inside it, and twenty-five minutes is a starting point rather than a rule.' },
    { id: 'fo.single', name: 'Single-Tasking', icon: 'single-task', tier: 'beginner', requires: ['fo.sessions'], state: lock, percent: 0, xp: 1600,
      desc: 'One thing until it is finished or the block ends. It feels slower and finishes more, which is unintuitive enough that most people need to measure it once to believe it.' },
    { id: 'fo.ritual', name: 'Starting Rituals', icon: 'ritual', tier: 'beginner', requires: ['fo.sessions'], state: lock, percent: 0, xp: 1400,
      desc: 'A short, repeated sequence that signals work is beginning. Same place, same time, same first action removes the negotiation about whether to start.' },
    { id: 'fo.deep', name: 'Deep Work', icon: 'deep-work', tier: 'intermediate', core: true, requires: ['fo.single', 'fo.ritual'], state: lock, percent: 0, xp: 2000,
      desc: 'Ninety minutes or more on something cognitively demanding, with nothing else touched. Almost all really hard work is produced in blocks like this and almost nobody schedules them.' },
    { id: 'fo.shallow', name: 'Shallow Work', icon: 'shallow-work', tier: 'intermediate', requires: ['fo.deep'], state: lock, percent: 0, xp: 1600,
      desc: 'Email, admin and coordination, which are necessary and expand to fill whatever space is left. Giving them a fixed window is what stops them eating the day.' },
    { id: 'fo.context', name: 'Context Switching', icon: 'switch-cost', tier: 'intermediate', requires: ['fo.deep'], state: lock, percent: 0, xp: 1800,
      desc: 'The cost of picking up a different task, which is paid in minutes of reloading state. It is why five projects in one day gets less done than two, with more effort.' },
    { id: 'fo.flow', name: 'Flow', icon: 'flow-state', tier: 'intermediate', requires: ['fo.context'], state: lock, percent: 0, xp: 1900,
      desc: 'The state where the work carries itself, reached when difficulty roughly matches skill. It cannot be forced and it can be arranged for: clear goal, no interruptions, the right level of hard.' },
    { id: 'fo.boredom', name: 'Tolerating Boredom', icon: 'boredom', tier: 'intermediate', requires: ['fo.notifications'], state: lock, percent: 0, xp: 1700,
      desc: 'Not reaching for a phone in a queue. Attention trained to expect stimulation at every gap will not sit still for two hours of hard work when it is asked to.' },
    { id: 'fo.digital', name: 'Digital Minimalism', icon: 'device-off', tier: 'advanced', requires: ['fo.boredom'], state: lock, percent: 0, xp: 1900,
      desc: 'Deciding what each tool is for and removing the rest. Applications are designed by large teams to hold attention, and treating that as a fair fight is the mistake.' },
    { id: 'fo.breaks', name: 'Breaks', icon: 'break', tier: 'advanced', requires: ['fo.flow'], state: lock, percent: 0, xp: 1600,
      desc: 'Real breaks between blocks, away from a screen. A break spent scrolling restores very little, which is why people finish a day of them still feeling drained.' },
    { id: 'fo.energy', name: 'Working with Energy', icon: 'energy', tier: 'advanced', requires: ['fo.breaks'], state: lock, percent: 0, xp: 1900,
      desc: 'Putting the hardest work where your attention is best and admin where it is not. Most people have two or three really sharp hours, and spend them on email.' },
    { id: 'fo.interrupt', name: 'Handling Interruptions', icon: 'interrupt', tier: 'advanced', requires: ['fo.context'], state: lock, percent: 0, xp: 1900,
      desc: 'Capturing the thing and returning, rather than following it. Telling somebody when you will be free is more effective than being unreachable and less costly than stopping.' },
    { id: 'fo.meetings', name: 'Protecting the Calendar', icon: 'calendar-block', tier: 'advanced', requires: ['fo.energy'], state: lock, percent: 0, xp: 2000,
      desc: 'Defending contiguous hours from being sliced into unusable fragments. Four meetings spread across a day cost far more than four in a row, and only one of those is negotiable.' },
    { id: 'fo.attention-span', name: 'Rebuilding Attention', icon: 'attention-span', tier: 'expert', requires: ['fo.digital', 'fo.meetings'], state: lock, percent: 0, xp: 2300,
      desc: 'Extending how long you can concentrate, deliberately and gradually, as a trainable capacity. Reading a long book is unfashionable and remains the most effective exercise for it.' },
    { id: 'fo.measure', name: 'Measuring Focus', icon: 'focus-log', tier: 'expert', requires: ['fo.interrupt'], state: lock, percent: 0, xp: 2100,
      desc: 'Recording hours of real concentration rather than hours at a desk. The number is always lower than expected, and it is the only one that correlates with output.' },
    { id: 'fo.practice', name: 'A Focused Working Life', icon: 'longevity', tier: 'mastery', requires: ['fo.attention-span', 'fo.measure'], state: lock, percent: 0, xp: 2800,
      desc: 'Structuring weeks around the work that needs depth rather than fitting it into the gaps. It is a set of arrangements defended repeatedly, not a personality trait somebody has.' },
  ],
};

/**
 * Stress, a branch of Mind & Recovery.
 *
 * Practical and student-sized. The Getting Help node carries the US crisis line,
 * because someone reading this tree may need it today.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const STRESS: SubjectTree = {
  id: 'stress',
  title: 'Stress',
  blurb: 'Handling school pressure before it handles you.',
  parent: 'mindfulness',
  nodes: [
    { id: 'str.notice', name: 'Noticing Stress', icon: 'body-scan', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Tight shoulders, racing thoughts and bad sleep. Spotting stress early makes it much easier to handle.' },
    { id: 'str.breathe', name: 'Calming Breaths', icon: 'breath', tier: 'foundation', requires: ['str.notice'], state: lock, percent: 0, xp: 1200,
      desc: 'Slow breathing with a longer breath out than in. It works in two minutes, even in the middle of a test.' },
    { id: 'str.sources', name: 'Finding the Source', icon: 'magnifier', tier: 'beginner', requires: ['str.notice'], state: lock, percent: 0, xp: 1600,
      desc: 'School, friends, family, money or the future. Name what is stressing you so you can work on it.' },
    { id: 'str.sleep', name: 'Sleep First', icon: 'sleep', tier: 'beginner', core: true, requires: ['str.notice'], state: lock, percent: 0, xp: 1700,
      desc: 'Eight to ten hours a night for teens. Stress and bad sleep feed each other in a loop.' },
    { id: 'str.move', name: 'Moving Your Body', icon: 'walking', tier: 'beginner', requires: ['str.breathe'], state: lock, percent: 0, xp: 1400,
      desc: 'Walks, sports or dancing around your room. Exercise burns off stress hormones fast.' },
    { id: 'str.steps', name: 'Breaking It Down', icon: 'checklist', tier: 'intermediate', requires: ['str.sources'], state: lock, percent: 0, xp: 1800,
      desc: 'Turning a big scary task into small steps. Starting is the hardest part, so make the first step tiny.' },
    { id: 'str.thoughts', name: 'Catching Spiral Thoughts', icon: 'thoughts', tier: 'intermediate', core: true, requires: ['str.sources'], state: lock, percent: 0, xp: 1900,
      desc: "Noticing when one bad grade turns into worst-case thinking. Ask what you'd tell a friend in the same spot." },
    { id: 'str.tests', name: 'Test Anxiety', icon: 'exam', tier: 'intermediate', requires: ['str.breathe', 'str.steps'], state: lock, percent: 0, xp: 2000,
      desc: 'Prep, practice tests and a calm routine for test day. A few nerves actually help you focus.' },
    { id: 'str.social', name: 'Social Media & Comparison', icon: 'social-media', tier: 'intermediate', requires: ['str.thoughts'], state: lock, percent: 0, xp: 1700,
      desc: 'Scrolling that leaves you feeling worse. Mute, unfollow and set time limits that you keep.' },
    { id: 'str.talk', name: 'Talking It Out', icon: 'conversation', tier: 'advanced', requires: ['str.thoughts'], state: lock, percent: 0, xp: 2100,
      desc: 'Sharing with friends, family or a school counselor. Saying it out loud makes it smaller.' },
    { id: 'str.no', name: 'Saying No', icon: 'boundary', tier: 'advanced', requires: ['str.steps'], state: lock, percent: 0, xp: 2200,
      desc: "Protecting your time and energy. You can't do everything, and that's completely fine." },
    { id: 'str.fun', name: 'Making Time for Fun', icon: 'party', tier: 'advanced', requires: ['str.move', 'str.social'], state: lock, percent: 0, xp: 2300,
      desc: 'Hobbies and hanging out, on purpose and on the calendar. Rest makes you better at the hard stuff.' },
    { id: 'str.perfect', name: 'Letting Go of Perfect', icon: 'compassion', tier: 'advanced', requires: ['str.no'], state: lock, percent: 0, xp: 2000,
      desc: 'Good enough is often good enough. Perfectionism slows you down and wears you out.' },
    { id: 'str.help', name: 'Getting Help', icon: 'therapy', tier: 'expert', core: true, requires: ['str.talk'], state: lock, percent: 0, xp: 2400,
      desc: "When stress won't go away, talk to a counselor, doctor or adult you trust. In a crisis in the US, call or text 988." },
    { id: 'str.kit', name: 'Your Stress Toolkit', icon: 'toolbox', tier: 'expert', requires: ['str.perfect', 'str.fun', 'str.help', 'str.tests', 'str.sleep'], state: lock, percent: 0, xp: 2500,
      desc: 'A short list of what works for you, written down. Reach for it before things get bad.' },
    { id: 'str.bounce', name: 'Bouncing Back', icon: 'growth-curve', tier: 'mastery', requires: ['str.kit'], state: lock, percent: 0, xp: 2900,
      desc: 'Getting through hard times and learning from them. Every rough patch you survive is proof you can handle the next.' },
  ],
};

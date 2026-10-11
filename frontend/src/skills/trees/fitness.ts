/**
 * Health & Fitness — a root subject.
 *
 * Consistency is the root and everything hangs off it, which is the honest
 * version of this subject: the programme somebody follows for two years beats
 * the optimal one they abandon in March. The branches are the four things the
 * catalogue actually files here — lifting, endurance, eating and recovery.
 */
import type { SubjectTree } from './types';
import { done, prog, open, lock } from './types';

export const FITNESS: SubjectTree = {
  id: 'fitness',
  title: 'Health & Fitness',
  blurb: 'Turning up regularly, moving well, and letting the body catch up.',
  group: 'Health and fitness',
  nodes: [
    { id: 'ft.consistency', name: 'Consistency', icon: 'streak', tier: 'foundation', core: true, state: done, percent: 100, xp: 1400,
      desc: 'Training on the days you do not want to, at a volume you can repeat next week. It is the only variable that reliably separates people who get results from people who read about them.' },
    { id: 'ft.warmup', name: 'Warming Up', icon: 'warmup', tier: 'foundation', requires: ['ft.consistency'], state: prog, percent: 70, xp: 1000,
      desc: 'Raising temperature and rehearsing the movement before loading it. Ten minutes that make the session better rather than a ritual performed to avoid guilt.' },
    { id: 'ft.form', name: 'Movement Quality', icon: 'form-check', tier: 'foundation', core: true, requires: ['ft.warmup'], state: prog, percent: 50, xp: 1600,
      desc: 'Doing the movement well before doing it heavy or fast. Filming a set is the cheapest coaching available, and almost always shows something different from what it felt like.' },
    { id: 'ft.mobility', name: 'Mobility', icon: 'mobility', tier: 'foundation', requires: ['ft.warmup'], state: open, percent: 30, xp: 1300,
      desc: 'Being able to get into the positions the training asks for. Usually a strength problem at the end of a range rather than a tightness problem, which changes what fixes it.' },
    { id: 'ft.effort', name: 'Effort & Intensity', icon: 'effort', tier: 'beginner', requires: ['ft.form'], state: open, percent: 25, xp: 1500,
      desc: 'Knowing how hard a set or an interval actually was, in repeats left or in how hard it was to breathe. Most people train the middle too hard and the top not hard enough.' },
    { id: 'ft.progress', name: 'Progressive Overload', icon: 'overload', tier: 'beginner', core: true, requires: ['ft.effort'], state: lock, percent: 0, xp: 1800,
      desc: 'Asking slightly more of the body over time — more weight, more reps, more distance, better form. Without it, training maintains, which is a legitimate goal but a different one.' },
    { id: 'ft.programme', name: 'Programming', icon: 'training-plan', tier: 'beginner', requires: ['ft.progress'], state: lock, percent: 0, xp: 1800,
      desc: 'Deciding in advance what each session is for across a week and a block. A plan written down is what stops every session becoming whatever you felt like on the day.' },
    { id: 'ft.rest', name: 'Rest & Recovery', icon: 'recovery', tier: 'beginner', core: true, requires: ['ft.progress'], state: lock, percent: 0, xp: 1700,
      desc: 'The adaptation happens between sessions, not during them. Training more while recovering less is the most common way that progress stops and injuries start.' },
    { id: 'ft.sleep', name: 'Sleep', icon: 'sleep', tier: 'beginner', requires: ['ft.rest'], state: lock, percent: 0, xp: 1600,
      desc: 'The single largest recovery variable and the one most often traded away. Nothing in supplementation comes close to the effect of an extra hour, consistently.' },
    { id: 'ft.fuel', name: 'Eating for Training', icon: 'fuel', tier: 'intermediate', requires: ['ft.rest'], state: lock, percent: 0, xp: 1800,
      desc: 'Enough energy and enough protein to support what you are asking for. Under-eating while training hard produces fatigue that looks like a programming problem.' },
    { id: 'ft.hydration', name: 'Hydration', icon: 'water', tier: 'intermediate', requires: ['ft.fuel'], state: lock, percent: 0, xp: 1300,
      desc: 'Enough fluid, and electrolytes when sessions are long or hot. Small deficits reduce performance measurably before thirst becomes noticeable.' },
    { id: 'ft.injury', name: 'Injury & Pain', icon: 'injury', tier: 'intermediate', requires: ['ft.form', 'ft.rest'], state: lock, percent: 0, xp: 1900,
      desc: 'Telling soreness from something that needs attention, and modifying rather than stopping entirely. Training around an injury keeps the habit that would otherwise be lost with it.' },
    { id: 'ft.measure', name: 'Tracking Progress', icon: 'progress-log', tier: 'intermediate', requires: ['ft.programme'], state: lock, percent: 0, xp: 1700,
      desc: 'A log of what was actually done, which is the only reliable memory of it. Trends over months are the signal; any single session is noise.' },
    { id: 'ft.goals', name: 'Goals & Phases', icon: 'target', tier: 'intermediate', requires: ['ft.measure'], state: lock, percent: 0, xp: 1900,
      desc: 'Choosing what this block is for, because strength, endurance and body composition pull in different directions. Chasing all three at once is how people spend a year unchanged.' },
    { id: 'ft.habit', name: 'Habits & Environment', icon: 'habit', tier: 'intermediate', requires: ['ft.consistency'], state: lock, percent: 0, xp: 1700,
      desc: 'Making the session easy to start: kit ready, a fixed time, somewhere close. Motivation is unreliable and arranging your surroundings is not.' },
    { id: 'ft.longevity', name: 'Training for Life', icon: 'longevity', tier: 'advanced', requires: ['ft.goals', 'ft.injury'], state: lock, percent: 0, xp: 2300,
      desc: 'Strength, cardiovascular fitness and balance as the things that decide how the last decades go. The training that matters at sixty is decided at thirty.' },
    { id: 'ft.strength', name: 'Strength Training', icon: 'barbell', tier: 'intermediate', requires: ['ft.progress'], navTo: 'strength', state: lock,
      desc: 'A subject of its own: lifting, the main movements, and how to add weight without breaking.' },
    { id: 'ft.endurance', name: 'Endurance', icon: 'running', tier: 'intermediate', requires: ['ft.effort'], navTo: 'endurance', state: lock,
      desc: 'A subject of its own: running, cycling and swimming, and the engine underneath all three.' },
    { id: 'ft.nutrition', name: 'Nutrition', icon: 'nutrition', tier: 'intermediate', requires: ['ft.fuel'], navTo: 'nutrition', state: lock,
      desc: 'A subject of its own: what food actually does, and how to read a claim about it past the marketing.' },
    { id: 'ft.mind', name: 'Mind & Recovery', icon: 'meditation', tier: 'intermediate', requires: ['ft.sleep'], navTo: 'mindfulness', state: lock,
      desc: 'A subject of its own: stress, attention and the practices that make rest deliberate.' },
    { id: 'ft.basketball', name: 'Basketball', icon: 'basketball', tier: 'beginner', requires: ['ft.form'], navTo: 'basketball', state: lock,
      desc: 'Its own tree: handles, shooting form, defense, basketball IQ and making varsity.' },
    { id: 'ft.soccer', name: 'Soccer', icon: 'soccer', tier: 'beginner', requires: ['ft.form'], navTo: 'soccer', state: lock,
      desc: 'Its own tree: first touch, passing, positioning, tactics and club and college soccer.' },
  ],
};

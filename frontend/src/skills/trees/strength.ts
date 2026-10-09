/**
 * Strength Training — a branch of Health & Fitness.
 *
 * The lifts come before the programming and the programming before anything
 * about specialisation, because a well-run beginner programme with four
 * movements outperforms every clever split for longer than most people expect.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const STRENGTH: SubjectTree = {
  id: 'strength',
  title: 'Strength Training',
  blurb: 'A handful of movements, done well, with a little more weight over time.',
  parent: 'fitness',
  nodes: [
    { id: 'sr.bodyweight', name: 'Bodyweight Basics', icon: 'pushup', tier: 'foundation', core: true, state: open, percent: 25, xp: 1300,
      desc: 'Push-ups, squats, rows and holds, which build the control that loading later depends on. They are also the fallback that keeps training possible with no equipment at all.' },
    { id: 'sr.brace', name: 'Bracing & Breathing', icon: 'brace', tier: 'foundation', requires: ['sr.bodyweight'], state: lock, percent: 0, xp: 1400,
      desc: 'Creating pressure through the trunk so the spine stays stacked under load. It is the technique that makes heavy lifting safe, and it is taught last far too often.' },
    { id: 'sr.hinge', name: 'The Hinge', icon: 'hinge', tier: 'foundation', requires: ['sr.brace'], state: lock, percent: 0, xp: 1600,
      desc: 'Pushing the hips back with a neutral spine — the pattern under deadlifts, swings and picking anything up. Confusing it with a squat is the most common and most costly error.' },
    { id: 'sr.squat', name: 'Squat', icon: 'squat', tier: 'beginner', core: true, requires: ['sr.brace'], state: lock, percent: 0, xp: 1800,
      desc: 'Sitting between your feet under load, to a depth your hips and ankles allow today. Depth follows mobility rather than willpower, and forcing it is how backs round.' },
    { id: 'sr.deadlift', name: 'Deadlift', icon: 'deadlift', tier: 'beginner', requires: ['sr.hinge'], state: lock, percent: 0, xp: 1900,
      desc: 'Lifting a loaded bar from the floor, which trains almost everything at once. It is also the lift where fatigue degrades form fastest, so the last rep decides whether the set was a good idea.' },
    { id: 'sr.press', name: 'Pressing', icon: 'bench-press', tier: 'beginner', requires: ['sr.bodyweight'], state: lock, percent: 0, xp: 1700,
      desc: 'Pushing weight away, overhead and horizontally. Shoulder position at the start decides how much load the joint tolerates, far more than the weight on the bar does.' },
    { id: 'sr.pull', name: 'Pulling', icon: 'pullup', tier: 'beginner', requires: ['sr.bodyweight'], state: lock, percent: 0, xp: 1700,
      desc: 'Rows and chin-ups, which most programs under-do relative to pressing. Balancing the two is what keeps shoulders healthy over years rather than months.' },
    { id: 'sr.carry', name: 'Carries & Core', icon: 'carry', tier: 'intermediate', requires: ['sr.deadlift'], state: lock, percent: 0, xp: 1600,
      desc: 'Holding something heavy and walking, plus the anti-rotation work that goes with it. The most direct transfer to real tasks of anything in the gym.' },
    { id: 'sr.equipment', name: 'Bars, Dumbbells & Machines', icon: 'dumbbell', tier: 'intermediate', requires: ['sr.press', 'sr.pull'], state: lock, percent: 0, xp: 1500,
      desc: 'What each implement is good for. Machines are not cheating; they remove the balance requirement, which is sometimes exactly what a session needs.' },
    { id: 'sr.volume', name: 'Sets, Reps & Load', icon: 'reps', tier: 'intermediate', core: true, requires: ['sr.squat', 'sr.deadlift'], state: lock, percent: 0, xp: 1900,
      desc: 'How the three interact: heavy and few for strength, moderate and more for size. Total hard sets per muscle per week is the number that predicts progress best.' },
    { id: 'sr.rest', name: 'Rest Between Sets', icon: 'timer', tier: 'intermediate', requires: ['sr.volume'], state: lock, percent: 0, xp: 1400,
      desc: 'Long enough to repeat the effort, which for heavy compound work is minutes rather than seconds. Cutting rest turns a strength session into a conditioning one by accident.' },
    { id: 'sr.tempo', name: 'Tempo & Control', icon: 'tempo', tier: 'intermediate', requires: ['sr.volume'], state: lock, percent: 0, xp: 1600,
      desc: 'Owning the lowering phase rather than dropping into it. Slower eccentrics build more with less load, which is useful whenever joints are complaining.' },
    { id: 'sr.programme', name: 'Programming', icon: 'training-plan', tier: 'advanced', core: true, requires: ['sr.rest', 'sr.tempo'], state: lock, percent: 0, xp: 2200,
      desc: 'Sessions arranged so the hard work is spread and recovered from. Beginners progress every session, everybody else progresses across weeks, and confusing the two stalls people for years.' },
    { id: 'sr.deload', name: 'Deloads & Fatigue', icon: 'deload', tier: 'advanced', requires: ['sr.programme'], state: lock, percent: 0, xp: 1900,
      desc: 'Planned easy weeks that let accumulated fatigue clear. Taken before they are needed they cost nothing; taken after, they are called an injury.' },
    { id: 'sr.plateau', name: 'Breaking Plateaus', icon: 'plateau', tier: 'advanced', requires: ['sr.deload'], state: lock, percent: 0, xp: 2100,
      desc: 'Diagnosing whether the block is technique, recovery, nutrition or programming. Adding more work is the usual guess and the least often correct one.' },
    { id: 'sr.hyper', name: 'Training for Size', icon: 'hypertrophy', tier: 'advanced', requires: ['sr.programme'], state: lock, percent: 0, xp: 2100,
      desc: 'Volume near failure with enough food to build on. Muscle grows on a timescale of months, and expecting to see it weekly is what makes people abandon working programs.' },
    { id: 'sr.power', name: 'Power & Speed', icon: 'power', tier: 'advanced', requires: ['sr.carry', 'sr.tempo'], state: lock, percent: 0, xp: 2100,
      desc: 'Moving moderate loads fast, which is a different quality from maximum strength. Trained fresh and stopped the moment bar speed drops, because slow practice trains slow.' },
    { id: 'sr.mobility', name: 'Strength Through Range', icon: 'mobility', tier: 'expert', requires: ['sr.hyper'], state: lock, percent: 0, xp: 2200,
      desc: 'Being strong in the positions at the end of a range rather than only in the middle. It is what makes mobility work stick instead of resetting within days.' },
    { id: 'sr.peak', name: 'Peaking & Testing', icon: 'peak', tier: 'expert', requires: ['sr.plateau', 'sr.power'], state: lock, percent: 0, xp: 2400,
      desc: 'Arranging several weeks so that one day is your strongest. Testing maximums often is not training; it is a repeated interruption of it.' },
    { id: 'sr.longterm', name: 'Lifting for Decades', icon: 'longevity', tier: 'mastery', requires: ['sr.peak', 'sr.mobility'], state: lock, percent: 0, xp: 2900,
      desc: 'Adjusting the training as the body and the calendar change, so it lasts. Almost nobody regrets going slightly lighter and almost everybody regrets one session they knew they should have stopped.' },
  ],
};

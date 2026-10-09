/**
 * Mind & Recovery — a branch of Health & Fitness.
 *
 * Attention practices, sleep and stress in one tree, because the catalogue files
 * meditation, sleep, therapy and yoga together and they share a mechanism: all
 * four are about the state the nervous system spends its day in. Nothing here is
 * clinical advice, and the node on getting help says so explicitly.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const MINDFULNESS: SubjectTree = {
  id: 'mindfulness',
  title: 'Mind & Recovery',
  blurb: 'Attention, sleep and stress — the parts of training nobody logs.',
  parent: 'fitness',
  nodes: [
    { id: 'mi.breath', name: 'Breathing', icon: 'breath', tier: 'foundation', core: true, state: open, percent: 25, xp: 1300,
      desc: 'Slow breathing with a longer exhale, which measurably shifts the nervous system toward rest. It is the shortest route from a stressed state to a calmer one, and it works within minutes.' },
    { id: 'mi.attention', name: 'Attention', icon: 'focus', tier: 'foundation', requires: ['mi.breath'], state: lock, percent: 0, xp: 1400,
      desc: 'Noticing where the mind has gone and bringing it back, which is the entire exercise. The wandering is not failure; the noticing is the repetition being trained.' },
    { id: 'mi.sit', name: 'Sitting Practice', icon: 'meditation', tier: 'foundation', requires: ['mi.attention'], state: lock, percent: 0, xp: 1500,
      desc: 'Ten minutes daily, which beats an hour on Sunday. The goal is not a blank mind, and expecting one is the reason most people conclude they cannot do it.' },
    { id: 'mi.body', name: 'Body Awareness', icon: 'body-scan', tier: 'beginner', requires: ['mi.sit'], state: lock, percent: 0, xp: 1400,
      desc: 'Scanning through physical sensation deliberately. It is also the most reliable early warning of accumulated stress, which is otherwise noticed only once it is expensive.' },
    { id: 'mi.stress', name: 'Understanding Stress', icon: 'stress', tier: 'beginner', core: true, requires: ['mi.body'], state: lock, percent: 0, xp: 1700,
      desc: 'A short-term response that is useful and a long-term state that is not. Chronic activation of a system built for emergencies explains a great deal of what feels like being tired all the time.' },
    { id: 'mi.sleep', name: 'Sleep', icon: 'sleep', tier: 'beginner', core: true, requires: ['mi.stress'], state: lock, percent: 0, xp: 1800,
      desc: 'Consistent timing, darkness and a cool room, which do more than anything sold to improve it. It is the recovery process everything else in health depends on.' },
    { id: 'mi.hygiene', name: 'Sleep Habits', icon: 'bedtime', tier: 'beginner', requires: ['mi.sleep'], state: lock, percent: 0, xp: 1500,
      desc: 'The hour before bed, caffeine timing and what happens when you cannot sleep. Lying awake trying harder is counterproductive; getting up until sleepy is the counterintuitive fix.' },
    { id: 'mi.rest', name: 'Rest That Is Not Sleep', icon: 'rest', tier: 'intermediate', requires: ['mi.hygiene'], state: lock, percent: 0, xp: 1500,
      desc: 'Deliberate downtime without input: a walk with no headphones, sitting still, doing nothing on purpose. Scrolling is stimulation rather than rest, whatever it feels like at the time.' },
    { id: 'mi.yoga', name: 'Yoga & Movement Practice', icon: 'yoga', tier: 'intermediate', requires: ['mi.body'], state: lock, percent: 0, xp: 1800,
      desc: 'Movement with breath and attention attached, which trains mobility and the nervous system at once. Also a legitimate strength stimulus, which surprises people arriving from a gym.' },
    { id: 'mi.walk', name: 'Walking', icon: 'walking', tier: 'intermediate', requires: ['mi.rest'], state: lock, percent: 0, xp: 1400,
      desc: 'The most underrated thing on this tree: daily, unhurried, ideally outside. It improves mood, sleep and thinking, and requires no equipment or motivation to begin.' },
    { id: 'mi.nature', name: 'Time Outdoors', icon: 'nature', tier: 'intermediate', requires: ['mi.walk'], state: lock, percent: 0, xp: 1500,
      desc: 'Daylight early and green space regularly. Morning light is the strongest signal available for anchoring a sleep cycle, and it is free.' },
    { id: 'mi.emotion', name: 'Naming Emotions', icon: 'emotion', tier: 'intermediate', requires: ['mi.stress'], state: lock, percent: 0, xp: 1800,
      desc: 'Identifying what you are feeling with some precision, which reliably reduces its intensity. Anxious, disappointed and resentful call for different responses and feel similar from inside.' },
    { id: 'mi.thoughts', name: 'Working with Thoughts', icon: 'thoughts', tier: 'advanced', requires: ['mi.emotion'], state: lock, percent: 0, xp: 2000,
      desc: 'Noticing a thought as a thought rather than as a report on reality. Catastrophizing and mind reading are patterns rather than insights, and naming them takes most of their force.' },
    { id: 'mi.journal', name: 'Journalling', icon: 'journal', tier: 'advanced', requires: ['mi.thoughts'], state: lock, percent: 0, xp: 1700,
      desc: 'Writing to find out what you think, rather than to record what happened. Ten minutes on paper resolves more circling than an hour of thinking about it does.' },
    { id: 'mi.boundaries', name: 'Boundaries', icon: 'boundary', tier: 'advanced', requires: ['mi.emotion'], state: lock, percent: 0, xp: 1900,
      desc: 'Deciding what you will and will not take on, and saying so early. Most burnout is an accumulation of small agreements that each seemed manageable in isolation.' },
    { id: 'mi.digital', name: 'Digital Habits', icon: 'device-off', tier: 'advanced', requires: ['mi.rest'], state: lock, percent: 0, xp: 1800,
      desc: 'Notifications, evening screens and the machinery designed to hold attention. Changing the environment beats resisting it, because the design is better funded than your willpower.' },
    { id: 'mi.burnout', name: 'Recognizing Burnout', icon: 'burnout', tier: 'advanced', core: true, requires: ['mi.boundaries', 'mi.digital'], state: lock, percent: 0, xp: 2100,
      desc: 'Exhaustion, cynicism and a sense of ineffectiveness together. It is a state produced by conditions rather than a personal failure, and rest alone does not fix conditions.' },
    { id: 'mi.help', name: 'Getting Help', icon: 'therapy', tier: 'expert', requires: ['mi.burnout'], state: lock, percent: 0, xp: 2200,
      desc: 'Knowing when something is beyond self-management and talking to a professional. Nothing in this tree is treatment, and persistent low mood, anxiety or sleeplessness is a reason to ask somebody qualified.' },
    { id: 'mi.compassion', name: 'Self-Compassion', icon: 'compassion', tier: 'expert', requires: ['mi.journal', 'mi.thoughts'], state: lock, percent: 0, xp: 2200,
      desc: 'Treating yourself roughly as you would a friend in the same position. It correlates with more follow-through rather than less, which is the opposite of what people fear about it.' },
    { id: 'mi.practice', name: 'A Practice That Lasts', icon: 'longevity', tier: 'mastery', requires: ['mi.compassion', 'mi.help', 'mi.nature'], state: lock, percent: 0, xp: 2800,
      desc: 'Something small and daily that survives a bad month. The version that continues at five minutes beats the ambitious one that stops when life gets busy, which is exactly when it was needed.' },
  ],
};

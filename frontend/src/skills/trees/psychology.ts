/**
 * Psychology — a branch of Humanities.
 *
 * Method sits at the root and gates the content nodes, which is unusual for a
 * tree in this app and deliberate here: this is the field where the difference
 * between a finding that replicated and one that made a good headline matters
 * most, and a reader who meets the results first has no way to tell them apart.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const PSYCHOLOGY: SubjectTree = {
  id: 'psychology',
  title: 'Psychology',
  blurb: 'How minds actually behave, measured rather than assumed.',
  parent: 'humanities',
  nodes: [
    { id: 'psy.method', name: 'Research Methods', icon: 'scientific-method', tier: 'foundation', core: true, state: open, percent: 20, xp: 1500,
      desc: 'Experiments, observation and self-report, and what each can and cannot establish. Almost every disagreement in the field is really about whether the design supports the claim.' },
    { id: 'psy.measure', name: 'Measuring the Mind', icon: 'measurement', tier: 'foundation', requires: ['psy.method'], state: lock, percent: 0, xp: 1500,
      desc: 'Turning something internal into a number: reaction times, scales, physiological signals. Validity is the whole question — whether the thing you measured is the thing you meant.' },
    { id: 'psy.stats', name: 'Statistics in Psychology', icon: 'statistics', tier: 'foundation', requires: ['psy.measure'], state: lock, percent: 0, xp: 1700,
      desc: 'Effect sizes, confidence and the difference between significant and important. A field studying small effects in noisy samples has to be unusually careful here, and historically was not.' },
    { id: 'psy.replication', name: 'Replication', icon: 'replicate', tier: 'beginner', core: true, requires: ['psy.stats'], state: lock, percent: 0, xp: 1800,
      desc: 'Whether a result appears again when somebody else runs it. A large fraction of famous findings did not, and knowing which is now part of basic literacy in the subject.' },
    { id: 'psy.ethics', name: 'Research Ethics', icon: 'ethics', tier: 'beginner', requires: ['psy.method'], state: lock, percent: 0, xp: 1500,
      desc: 'Consent, deception, debriefing and the right to withdraw. The rules exist because several of the most cited studies of the last century would not be approved today.' },
    { id: 'psy.brain', name: 'Brain & Behavior', icon: 'brain', tier: 'beginner', requires: ['psy.replication'], state: lock, percent: 0, xp: 1800,
      desc: 'Which structures do what, and the limits of inferring a mental process from a bright patch on a scan. Localization is real and far less tidy than popular accounts suggest.' },
    { id: 'psy.perception', name: 'Perception', icon: 'perception', tier: 'beginner', requires: ['psy.brain'], state: lock, percent: 0, xp: 1700,
      desc: 'Sensation arriving and being turned into an experience of a world. Illusions are the standard tool because they show the construction happening rather than a fault in it.' },
    { id: 'psy.attention', name: 'Attention', icon: 'focus', tier: 'intermediate', requires: ['psy.perception'], state: lock, percent: 0, xp: 1800,
      desc: 'What gets processed out of everything arriving, and what does not. The reliable finding is that people miss far more than they believe they do, including in plain sight.' },
    { id: 'psy.memory', name: 'Memory', icon: 'memory', tier: 'intermediate', core: true, requires: ['psy.attention'], state: lock, percent: 0, xp: 2000,
      desc: 'Encoding, storing and reconstructing. And it really is reconstruction. Confident memories can be entirely false, which is a fact with consequences well outside the laboratory.' },
    { id: 'psy.learning', name: 'Learning', icon: 'learning', tier: 'intermediate', requires: ['psy.memory'], state: lock, percent: 0, xp: 1900,
      desc: 'Conditioning, reinforcement and how practice changes behavior. Spacing and retrieval beat repetition and rereading, which is one of the best-replicated results in the field.' },
    { id: 'psy.cognition', name: 'Thinking & Reasoning', icon: 'cognition', tier: 'intermediate', requires: ['psy.memory'], state: lock, percent: 0, xp: 2000,
      desc: 'Problem solving, judgment and the shortcuts that usually work. Biases are not stupidity; they are heuristics being applied outside the conditions they were good for.' },
    { id: 'psy.language', name: 'Language & Thought', icon: 'meaning', tier: 'intermediate', requires: ['psy.cognition'], state: lock, percent: 0, xp: 1900,
      desc: 'How language is acquired so fast, and how much it shapes what can be thought. The strong version of that second claim has not survived; the weak version keeps producing results.' },
    { id: 'psy.develop', name: 'Development', icon: 'development', tier: 'advanced', requires: ['psy.learning'], state: lock, percent: 0, xp: 2000,
      desc: 'How thinking, attachment and moral reasoning change from infancy onward. Stage theories are useful frames and less rigid than their diagrams imply.' },
    { id: 'psy.social', name: 'Social Psychology', icon: 'social', tier: 'advanced', requires: ['psy.cognition'], state: lock, percent: 0, xp: 2100,
      desc: 'How the presence of others changes what people do. Situation beats disposition far more often than intuition allows, and that finding survived the replication crisis better than most.' },
    { id: 'psy.person', name: 'Personality', icon: 'personality', tier: 'advanced', requires: ['psy.social'], state: lock, percent: 0, xp: 2000,
      desc: 'Stable differences between people, and the five dimensions that keep reappearing across cultures. Popular type indicators are not among the things that replicated.' },
    { id: 'psy.emotion', name: 'Emotion & Motivation', icon: 'emotion', tier: 'advanced', requires: ['psy.person'], state: lock, percent: 0, xp: 2100,
      desc: 'What emotions are for, how they are regulated, and why people persist at some things and not others. Reward that undermines existing interest is the finding worth knowing first.' },
    { id: 'psy.clinical', name: 'Clinical Psychology', icon: 'therapy', tier: 'advanced', core: true, requires: ['psy.emotion', 'psy.develop'], state: lock, percent: 0, xp: 2300,
      desc: 'How disorders are classified, and what the evidence says about treating them. Diagnosis is a working description rather than a discovered category, and the manual is revised for exactly that reason.' },
    { id: 'psy.health', name: 'Health & Stress', icon: 'stress', tier: 'expert', requires: ['psy.clinical'], state: lock, percent: 0, xp: 2300,
      desc: 'The routes between mind and body: stress, sleep, pain and adherence. Chronic activation of a system built for short emergencies explains a large share of it.' },
    { id: 'psy.applied', name: 'Applied Psychology', icon: 'apply', tier: 'expert', requires: ['psy.social', 'psy.person'], state: lock, percent: 0, xp: 2400,
      desc: 'Psychology in workplaces, classrooms, courts and interfaces. It is also where findings get oversold, so the method nodes at the top of this tree stay relevant.' },
    { id: 'psy.critical', name: 'Reading the Literature', icon: 'scrutiny', tier: 'mastery', requires: ['psy.applied', 'psy.health', 'psy.ethics'], state: lock, percent: 0, xp: 2900,
      desc: 'Reading a paper for its sample, its design and its analysis before its abstract. The whole tree points here: being able to tell a solid finding from a well-publicised one.' },
  ],
};

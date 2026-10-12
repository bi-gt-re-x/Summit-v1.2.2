/**
 * Sociology, a branch of Humanities.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const SOCIOLOGY: SubjectTree = {
  id: 'sociology',
  title: 'Sociology',
  blurb: 'How groups, institutions and society shape the people inside them.',
  parent: 'humanities',
  nodes: [
    { id: 'sog.imagination', name: 'Sociological Imagination', icon: 'insight', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Seeing how personal troubles connect to bigger social patterns. Unemployment for one person is a story, and for millions it is a trend.' },
    { id: 'sog.theories', name: 'Big Theories', icon: 'concept-map', tier: 'foundation', requires: ['sog.imagination'], state: lock, percent: 0, xp: 1200,
      desc: 'Functionalism, conflict theory and symbolic interactionism. Each one is a lens, and each sees something the others miss.' },
    { id: 'sog.methods', name: 'Research Methods', icon: 'research', tier: 'beginner', core: true, requires: ['sog.imagination'], state: lock, percent: 0, xp: 1600,
      desc: 'Surveys, interviews, observation and experiments. Every method trades depth for breadth somewhere.' },
    { id: 'sog.culture', name: 'Culture', icon: 'culture', tier: 'beginner', requires: ['sog.theories'], state: lock, percent: 0, xp: 1700,
      desc: 'Norms, values, symbols and language. You notice your own culture most when you leave it.' },
    { id: 'sog.socialization', name: 'Socialization', icon: 'social', tier: 'beginner', requires: ['sog.culture'], state: lock, percent: 0, xp: 1400,
      desc: 'How family, school, friends and media teach us who to be. It never really stops.' },
    { id: 'sog.groups', name: 'Groups & Networks', icon: 'network-people', tier: 'intermediate', requires: ['sog.socialization'], state: lock, percent: 0, xp: 1800,
      desc: 'In-groups, out-groups and peer pressure. Even the size of a group changes how people act.' },
    { id: 'sog.deviance', name: 'Deviance & Crime', icon: 'warning', tier: 'intermediate', requires: ['sog.groups'], state: lock, percent: 0, xp: 1900,
      desc: 'Who decides what counts as breaking the rules. What is deviant changes from place to place and decade to decade.' },
    { id: 'sog.stratification', name: 'Social Class', icon: 'layers', tier: 'intermediate', core: true, requires: ['sog.theories'], state: lock, percent: 0, xp: 2000,
      desc: 'Wealth, income, status and mobility. Where you start shapes where you are likely to end up.' },
    { id: 'sog.race', name: 'Race & Ethnicity', icon: 'fairness', tier: 'intermediate', requires: ['sog.stratification'], state: lock, percent: 0, xp: 1700,
      desc: 'How race is a social idea with real effects. Look at data on housing, schooling and health.' },
    { id: 'sog.gender', name: 'Gender', icon: 'balance-scale', tier: 'advanced', requires: ['sog.socialization'], state: lock, percent: 0, xp: 2100,
      desc: 'How expectations about gender are learned and enforced. Compare them across cultures and over time.' },
    { id: 'sog.family', name: 'Family', icon: 'homecoming', tier: 'advanced', requires: ['sog.socialization'], state: lock, percent: 0, xp: 2200,
      desc: 'How families form and change. The typical family looks very different than it did fifty years ago.' },
    { id: 'sog.education', name: 'Education', icon: 'graduation', tier: 'advanced', requires: ['sog.stratification'], state: lock, percent: 0, xp: 2300,
      desc: 'What schools teach on purpose, and what they teach without meaning to. Tracking and funding shape outcomes.' },
    { id: 'sog.institutions', name: 'Religion, Economy & Politics', icon: 'monument', tier: 'advanced', requires: ['sog.family', 'sog.education'], state: lock, percent: 0, xp: 2000,
      desc: 'The big institutions that organize society. Each one sets rules most people follow without thinking.' },
    { id: 'sog.change', name: 'Social Change & Movements', icon: 'flag', tier: 'expert', requires: ['sog.race', 'sog.gender', 'sog.institutions'], state: lock, percent: 0, xp: 2400,
      desc: 'How movements form, grow and win change. Steady organizing does more than a burst of outrage.' },
    { id: 'sog.project', name: 'A Sociology Study', icon: 'study-design', tier: 'mastery', requires: ['sog.change', 'sog.methods', 'sog.deviance'], state: lock, percent: 0, xp: 2800,
      desc: 'Designing and running a small study of your own school or town. Protect the privacy of everyone you ask.' },
  ],
};

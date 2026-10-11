/**
 * Civics & Government, a branch of Humanities.
 *
 * Follows US Government and AP Gov, and ends with getting involved locally.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const CIVICS: SubjectTree = {
  id: 'civics',
  title: 'Civics & Government',
  blurb: 'How government works and how to have a say in it.',
  parent: 'humanities',
  nodes: [
    { id: 'cv.why', name: 'Why Government Exists', icon: 'social-contract', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'People giving up some freedom for order and protection. Locke and Hobbes disagreed about how much.' },
    { id: 'cv.constitution', name: 'The Constitution', icon: 'source-doc', tier: 'foundation', core: true, requires: ['cv.why'], state: lock, percent: 0, xp: 1200,
      desc: "The Preamble, seven articles and how it can change. It's short enough to read in one afternoon." },
    { id: 'cv.branches', name: 'Three Branches', icon: 'tree-structure', tier: 'beginner', requires: ['cv.constitution'], state: lock, percent: 0, xp: 1600,
      desc: 'Congress makes laws, the president enforces them and courts interpret them. Each one can check the others.' },
    { id: 'cv.federalism', name: 'Federalism', icon: 'layers', tier: 'beginner', requires: ['cv.constitution'], state: lock, percent: 0, xp: 1700,
      desc: 'Power split between the national and state governments. Lots of fights in the news are really about this split.' },
    { id: 'cv.rights', name: 'The Bill of Rights', icon: 'shield', tier: 'beginner', core: true, requires: ['cv.constitution'], state: lock, percent: 0, xp: 1400,
      desc: 'The first ten amendments and what they protect. Speech, religion, press and fair trials are the big ones.' },
    { id: 'cv.local', name: 'Local Government', icon: 'map', tier: 'beginner', requires: ['cv.federalism'], state: lock, percent: 0, xp: 1500,
      desc: 'City councils, school boards and mayors. Local decisions affect your daily life the most.' },
    { id: 'cv.congress', name: 'Congress', icon: 'meeting', tier: 'intermediate', requires: ['cv.branches'], state: lock, percent: 0, xp: 1900,
      desc: 'The House, the Senate and how a bill becomes a law. Most bills die in committee.' },
    { id: 'cv.president', name: 'The Presidency', icon: 'leadership', tier: 'intermediate', requires: ['cv.branches'], state: lock, percent: 0, xp: 2000,
      desc: 'Formal powers, executive orders and the cabinet. Presidents have more room in foreign policy than at home.' },
    { id: 'cv.courts', name: 'The Courts', icon: 'balance-scale', tier: 'intermediate', requires: ['cv.branches'], state: lock, percent: 0, xp: 1700,
      desc: 'Judicial review, precedent and how cases reach the Supreme Court. Landmark cases are favorite test questions.' },
    { id: 'cv.elections', name: 'Elections', icon: 'checklist', tier: 'intermediate', requires: ['cv.federalism'], state: lock, percent: 0, xp: 1800,
      desc: 'Primaries, the Electoral College and how campaigns work. Voting rules vary a lot from state to state.' },
    { id: 'cv.cases', name: 'Landmark Cases', icon: 'archive', tier: 'advanced', requires: ['cv.courts', 'cv.rights'], state: lock, percent: 0, xp: 2200,
      desc: 'Marbury, Brown, Miranda, Tinker and more. Know the facts, the ruling and why it mattered.' },
    { id: 'cv.civil', name: 'Civil Rights & Liberties', icon: 'fairness', tier: 'advanced', requires: ['cv.rights'], state: lock, percent: 0, xp: 2300,
      desc: 'Equal protection and the movements that fought for it. Rights grew through struggle and court battles.' },
    { id: 'cv.parties', name: 'Parties & Interest Groups', icon: 'network-people', tier: 'advanced', requires: ['cv.elections'], state: lock, percent: 0, xp: 2000,
      desc: 'How groups organize to win power and shape policy. Know how lobbying and PACs work.' },
    { id: 'cv.media', name: 'Media & Public Opinion', icon: 'media', tier: 'advanced', requires: ['cv.parties'], state: lock, percent: 0, xp: 2100,
      desc: 'Polls, news coverage and social media. Learn to spot bias and check claims before you share them.' },
    { id: 'cv.policy', name: 'How Policy Gets Made', icon: 'pipeline', tier: 'expert', requires: ['cv.congress', 'cv.president', 'cv.media'], state: lock, percent: 0, xp: 2500,
      desc: 'From a problem to a law to how it gets carried out. Agencies write a lot of the actual rules.' },
    { id: 'cv.econ', name: 'Economic Policy', icon: 'econ-lens', tier: 'expert', requires: ['cv.policy'], state: lock, percent: 0, xp: 2600,
      desc: 'Taxes, spending and what the Federal Reserve does. Budget fights shape every other issue.' },
    { id: 'cv.frq', name: 'AP Gov Essays', icon: 'essay', tier: 'expert', requires: ['cv.cases', 'cv.civil'], state: lock, percent: 0, xp: 2300,
      desc: 'Argument essays and Supreme Court comparisons. Cite a founding document and a case in every answer.' },
    { id: 'cv.involved', name: 'Getting Involved', icon: 'flag', tier: 'mastery', requires: ['cv.local', 'cv.frq', 'cv.econ'], state: lock, percent: 0, xp: 2700,
      desc: 'Registering to vote, contacting officials and showing up at meetings. Young voters can swing local elections.' },
  ],
};

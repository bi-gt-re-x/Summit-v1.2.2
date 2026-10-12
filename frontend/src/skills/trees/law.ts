/**
 * Law, a branch of Business & Money.
 *
 * Built for students: law class, mock trial and knowing your own rights,
 * rather than business contracts alone.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const LAW: SubjectTree = {
  id: 'law',
  title: 'Law',
  blurb: 'How the legal system works, from your rights to a mock trial.',
  parent: 'business',
  nodes: [
    { id: 'law.why', name: 'What Law Does', icon: 'balance-scale', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Rules that keep order, settle fights and protect rights. Laws come from constitutions, legislatures, courts and agencies.' },
    { id: 'law.types', name: 'Civil vs Criminal Law', icon: 'split-data', tier: 'foundation', core: true, requires: ['law.why'], state: lock, percent: 0, xp: 1200,
      desc: 'Criminal cases are the state against a person, and civil cases are disputes between people. The burden of proof differs a lot.' },
    { id: 'law.courts', name: 'The Court System', icon: 'hierarchy', tier: 'beginner', requires: ['law.types'], state: lock, percent: 0, xp: 1600,
      desc: 'Trial courts, appeals courts and supreme courts, state and federal. Most cases never leave the state system.' },
    { id: 'law.rights', name: 'Your Rights', icon: 'shield', tier: 'beginner', core: true, requires: ['law.why'], state: lock, percent: 0, xp: 1700,
      desc: 'Speech, search and seizure and the right to remain silent. Students have rights at school too, with some limits.' },
    { id: 'law.process', name: 'How a Case Moves', icon: 'pipeline', tier: 'beginner', requires: ['law.courts'], state: lock, percent: 0, xp: 1400,
      desc: 'Arrest or filing, pretrial, trial and appeal. Most cases end in a plea deal or a settlement.' },
    { id: 'law.contracts', name: 'Contracts', icon: 'contract', tier: 'intermediate', requires: ['law.types'], state: lock, percent: 0, xp: 1800,
      desc: 'Offer, acceptance and consideration. Minors can usually cancel contracts, with some exceptions.' },
    { id: 'law.torts', name: 'Torts', icon: 'warning', tier: 'intermediate', requires: ['law.types'], state: lock, percent: 0, xp: 1900,
      desc: 'Negligence, defamation and other harms you can sue over. Duty, breach, cause and damages is the checklist.' },
    { id: 'law.criminal', name: 'Criminal Law', icon: 'evidence', tier: 'intermediate', requires: ['law.process', 'law.rights'], state: lock, percent: 0, xp: 2000,
      desc: 'Elements of a crime, intent and defenses. Prosecutors must prove every element beyond a reasonable doubt.' },
    { id: 'law.reading', name: 'Reading Cases', icon: 'source-doc', tier: 'intermediate', requires: ['law.courts'], state: lock, percent: 0, xp: 1700,
      desc: 'Facts, issue, rule, analysis and conclusion. Briefing a case is how every law student starts.' },
    { id: 'law.reasoning', name: 'Legal Reasoning', icon: 'logic', tier: 'advanced', requires: ['law.reading'], state: lock, percent: 0, xp: 2100,
      desc: 'Applying rules to new facts and arguing from precedent. Good lawyers find the case that fits best.' },
    { id: 'law.evidence', name: 'Rules of Evidence', icon: 'magnifier', tier: 'advanced', requires: ['law.criminal', 'law.reasoning'], state: lock, percent: 0, xp: 2200,
      desc: 'Relevance, hearsay and when to object. Knowing these rules is half of doing well in mock trial.' },
    { id: 'law.opening', name: 'Openings & Closings', icon: 'speaking', tier: 'advanced', requires: ['law.reasoning'], state: lock, percent: 0, xp: 2300,
      desc: 'Telling the jury the story you will prove, then showing that you did. Plain words beat legal jargon.' },
    { id: 'law.witnesses', name: 'Direct & Cross', icon: 'question', tier: 'expert', requires: ['law.evidence'], state: lock, percent: 0, xp: 2300,
      desc: 'Open questions on direct and short leading ones on cross. Never ask a question on cross you do not know the answer to.' },
    { id: 'law.mocktrial', name: 'Mock Trial', icon: 'trophy', tier: 'expert', requires: ['law.witnesses', 'law.opening'], state: lock, percent: 0, xp: 2400,
      desc: 'Playing attorneys and witnesses in a full trial against another school. It is great for confidence and college apps.' },
    { id: 'law.justice', name: 'Law & Justice', icon: 'fairness', tier: 'expert', requires: ['law.rights', 'law.criminal'], state: lock, percent: 0, xp: 2500,
      desc: 'Wrongful convictions, sentencing and reform debates. Fair laws can still be applied unfairly.' },
    { id: 'law.path', name: 'Paths Into Law', icon: 'career', tier: 'mastery', requires: ['law.mocktrial', 'law.justice', 'law.contracts', 'law.torts'], state: lock, percent: 0, xp: 2900,
      desc: 'Pre-law majors, the LSAT and jobs that use legal skills. Many people with law degrees never become trial lawyers.' },
  ],
};

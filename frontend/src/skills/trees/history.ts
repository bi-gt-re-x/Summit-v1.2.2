/**
 * History — a branch of Humanities.
 *
 * Chronology sits at the root not because dates are the subject but because
 * nothing else works without a frame to hang events on. Everything after it is
 * a way of asking why, and historiography is placed last: it is the subject
 * turning round to examine its own account.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const HISTORY: SubjectTree = {
  id: 'history',
  title: 'History',
  blurb: 'What happened, how anybody knows, and why the story keeps being rewritten.',
  parent: 'humanities',
  nodes: [
    { id: 'hi.time', name: 'Chronology', icon: 'timeline', tier: 'foundation', core: true, state: open, percent: 20, xp: 1200,
      desc: 'A rough frame of what came before what, across more than one part of the world. Not an end in itself, and impossible to argue about causes without it.' },
    { id: 'hi.periods', name: 'Periods & Labels', icon: 'era', tier: 'foundation', requires: ['hi.time'], state: lock, percent: 0, xp: 1300,
      desc: 'Ancient, medieval, modern and the rest are conveniences invented afterwards. Knowing they are arguments rather than facts is what stops them quietly doing your thinking.' },
    { id: 'hi.archive', name: 'Working with Sources', icon: 'archive', tier: 'foundation', requires: ['hi.time'], state: lock, percent: 0, xp: 1500,
      desc: 'Documents, objects, images and testimony, and what survived by accident rather than by importance. Absence of evidence is usually a fact about record-keeping rather than about the past.' },
    { id: 'hi.dating', name: 'Dating & Evidence', icon: 'strata', tier: 'beginner', requires: ['hi.archive'], state: lock, percent: 0, xp: 1500,
      desc: 'Working out when something happened when nobody wrote it down: layers, materials, cross-references, radiocarbon. Independent methods agreeing is what turns a guess into a date.' },
    { id: 'hi.narrative', name: 'Building a Narrative', icon: 'narrative', tier: 'beginner', core: true, requires: ['hi.archive', 'hi.periods'], state: lock, percent: 0, xp: 1700,
      desc: 'Turning fragments into an account, and being honest about the joins. Every narrative chooses a start point, and the choice is already an argument about causes.' },
    { id: 'hi.social', name: 'Social History', icon: 'society', tier: 'beginner', requires: ['hi.narrative'], state: lock, percent: 0, xp: 1700,
      desc: 'Ordinary lives: work, food, family, illness. Harder to research because ordinary people left fewer documents, and the part that changes how the period actually felt.' },
    { id: 'hi.political', name: 'Political History', icon: 'politics', tier: 'beginner', requires: ['hi.narrative'], state: lock, percent: 0, xp: 1700,
      desc: 'States, rulers, laws and wars — the traditional spine of the subject. Best read as one thread among several rather than the frame everything else fits into.' },
    { id: 'hi.economic', name: 'Economic History', icon: 'trade', tier: 'intermediate', requires: ['hi.social'], state: lock, percent: 0, xp: 1900,
      desc: 'Trade, prices, harvests and who owned the land. Long series of dull numbers explain more political upheaval than most political documents do.' },
    { id: 'hi.culture', name: 'Cultural History', icon: 'culture', tier: 'intermediate', requires: ['hi.social'], state: lock, percent: 0, xp: 1800,
      desc: 'Belief, ritual, art and what people found funny or shameful. It is the fastest route to the fact that the past was genuinely foreign rather than us in worse clothes.' },
    { id: 'hi.empire', name: 'Empires & Encounter', icon: 'empire', tier: 'intermediate', requires: ['hi.political', 'hi.economic'], state: lock, percent: 0, xp: 2000,
      desc: 'Expansion, conquest and what happened where two societies met. The sources are overwhelmingly from one side, and reading against them is a technique in itself.' },
    { id: 'hi.revolution', name: 'Revolutions', icon: 'revolution', tier: 'intermediate', requires: ['hi.political'], state: lock, percent: 0, xp: 1900,
      desc: 'Moments when the arrangement of power broke rather than bent. They look inevitable afterwards and looked impossible a year before, which is the thing worth explaining.' },
    { id: 'hi.war', name: 'War & Its Aftermath', icon: 'conflict', tier: 'intermediate', requires: ['hi.empire'], state: lock, percent: 0, xp: 1900,
      desc: 'Causes, conduct and the settlements that set up the next one. Battles are the least explanatory part; logistics, finance and what happened afterwards do most of the work.' },
    { id: 'hi.tech', name: 'Technology & Change', icon: 'invention', tier: 'advanced', requires: ['hi.economic'], state: lock, percent: 0, xp: 2000,
      desc: 'Printing, steam, rail, antibiotics and the internet — inventions that reorganized what was possible. Adoption is usually slower and stranger than the invention story suggests.' },
    { id: 'hi.global', name: 'Global Connections', icon: 'globe', tier: 'advanced', requires: ['hi.empire', 'hi.culture'], state: lock, percent: 0, xp: 2100,
      desc: 'Following goods, diseases, people and ideas across borders instead of inside them. Many national histories stop making sense the moment you look at the shipping.' },
    { id: 'hi.memory', name: 'Memory & Commemoration', icon: 'monument', tier: 'advanced', requires: ['hi.culture'], state: lock, percent: 0, xp: 2000,
      desc: 'How a society remembers, forgets and argues about its own past. What gets a statue is evidence about the people who put it up rather than about the person on it.' },
    { id: 'hi.quant', name: 'Quantitative History', icon: 'statistics', tier: 'advanced', requires: ['hi.tech'], state: lock, percent: 0, xp: 2100,
      desc: 'Censuses, tax rolls and parish records treated as data. It answers questions no chronicle can and inherits every bias in who was counted.' },
    { id: 'hi.oral', name: 'Oral History', icon: 'testimony', tier: 'advanced', requires: ['hi.memory'], state: lock, percent: 0, xp: 2000,
      desc: 'Testimony gathered from people who were there, decades later. Memory reshapes itself over time, and that reshaping is itself a subject rather than only a limitation.' },
    { id: 'hi.public', name: 'Public History', icon: 'museum', tier: 'expert', requires: ['hi.oral', 'hi.global'], state: lock, percent: 0, xp: 2400,
      desc: 'History outside the academy: museums, documentaries, curricula and heritage. What the public believes about the past is decided here far more than in journals.' },
    { id: 'hi.method', name: 'Historiography', icon: 'historiography', tier: 'expert', core: true, requires: ['hi.quant', 'hi.memory'], state: lock, percent: 0, xp: 2500,
      desc: 'The history of the writing of history: what each generation thought worth explaining and what it could not see. Reading it makes the current consensus visible as a position rather than as the truth.' },
    { id: 'hi.research', name: 'Doing Research', icon: 'research', tier: 'mastery', requires: ['hi.method', 'hi.public'], state: lock, percent: 0, xp: 2900,
      desc: 'A question, an archive, months of material that answers something else, and an argument at the end. The gap between reading history and producing it is mostly patience.' },
  ],
};

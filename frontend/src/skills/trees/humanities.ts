/**
 * Humanities — a root subject.
 *
 * History, philosophy, psychology, geography, sociology and politics share one
 * problem that the sciences do not have in the same form: the evidence is
 * partial, produced by interested parties, and about people who cannot be put in
 * a laboratory. Everything in the trunk of this tree is a method for dealing
 * with that, which is why source criticism sits so near the root.
 */
import type { SubjectTree } from './types';
import { done, prog, open, lock } from './types';

export const HUMANITIES: SubjectTree = {
  id: 'humanities',
  title: 'Humanities',
  blurb: 'Evidence about people — partial, argued over, and worth getting right.',
  group: 'Language and humanities',
  nodes: [
    { id: 'hu.curious', name: 'Asking a Question', icon: 'question', tier: 'foundation', core: true, state: done, percent: 100, xp: 1200,
      desc: 'Turning an interest into something that could actually be answered with evidence. "Was the revolution inevitable" is a topic; "what did the people who joined it say they wanted" is a question.' },
    { id: 'hu.sources', name: 'Sources', icon: 'source-doc', tier: 'foundation', core: true, requires: ['hu.curious'], state: prog, percent: 60, xp: 1400,
      desc: 'Primary material made at the time, and secondary work written about it afterwards. Knowing which you are holding decides what it can be used to prove.' },
    { id: 'hu.criticism', name: 'Source Criticism', icon: 'scrutiny', tier: 'foundation', requires: ['hu.sources'], state: prog, percent: 40, xp: 1600,
      desc: 'Who made this, for whom, and what they wanted the reader to believe. A biased source is not a useless source; it is excellent evidence about the person who produced it.' },
    { id: 'hu.evidence', name: 'Evidence & Inference', icon: 'evidence', tier: 'beginner', requires: ['hu.criticism'], state: open, percent: 25, xp: 1600,
      desc: 'The gap between what a document shows and what you want to conclude, crossed explicitly. Most weak arguments in these subjects are a hidden step in that crossing.' },
    { id: 'hu.context', name: 'Context', icon: 'context', tier: 'beginner', requires: ['hu.evidence'], state: lock, percent: 0, xp: 1600,
      desc: 'What was normal, sayable and possible at the time. Judging a decision by what everybody knows now is the error that makes the past look stupid rather than different.' },
    { id: 'hu.bias', name: 'Bias & Perspective', icon: 'perspective', tier: 'beginner', requires: ['hu.context'], state: lock, percent: 0, xp: 1700,
      desc: 'Every account is from somewhere, including yours. The useful move is naming the position rather than hunting for a source that has none, because there are none.' },
    { id: 'hu.argue', name: 'Constructing an Argument', icon: 'argument', tier: 'beginner', core: true, requires: ['hu.evidence'], state: lock, percent: 0, xp: 1800,
      desc: 'A claim, the evidence, and why the evidence supports that claim rather than another. Handling the counter-example directly is what makes an argument stand up.' },
    { id: 'hu.logic', name: 'Reasoning & Fallacies', icon: 'logic', tier: 'intermediate', requires: ['hu.argue'], state: lock, percent: 0, xp: 1800,
      desc: 'The common ways an argument fails while sounding fine. Naming a fallacy is not a refutation on its own, and treating it as one is itself a habit worth losing.' },
    { id: 'hu.compare', name: 'Comparison', icon: 'compare', tier: 'intermediate', requires: ['hu.bias'], state: lock, percent: 0, xp: 1800,
      desc: 'Putting two cases side by side so the differences say something. Choosing cases that are similar enough for the difference to mean anything is most of the work.' },
    { id: 'hu.change', name: 'Continuity & Change', icon: 'change-over-time', tier: 'intermediate', requires: ['hu.context'], state: lock, percent: 0, xp: 1800,
      desc: 'What actually shifted, how fast, and what stayed the same underneath. Periods are labels applied afterwards, and people living through them rarely noticed the boundary.' },
    { id: 'hu.cause', name: 'Cause & Consequence', icon: 'causal', tier: 'intermediate', core: true, requires: ['hu.change', 'hu.logic'], state: lock, percent: 0, xp: 2000,
      desc: 'Distinguishing what made something possible, what made it likely, and what set it off. Single-cause explanations of large events are almost always a shortened version of a real argument.' },
    { id: 'hu.people', name: 'People & Societies', icon: 'society', tier: 'intermediate', requires: ['hu.compare'], state: lock, percent: 0, xp: 1900,
      desc: 'Groups, institutions and the rules that hold them together. Sociology as a habit rather than a subject: asking what a structure is doing rather than only what a person decided.' },
    { id: 'hu.place', name: 'Place & Geography', icon: 'geography', tier: 'intermediate', requires: ['hu.people'], state: lock, percent: 0, xp: 1900,
      desc: 'Rivers, mountains, distance and climate as constraints on what people could do. It is not determinism to notice that the map made some outcomes much cheaper than others.' },
    { id: 'hu.power', name: 'Power & Politics', icon: 'politics', tier: 'advanced', requires: ['hu.people'], state: lock, percent: 0, xp: 2100,
      desc: 'Who decides, how they keep the ability to decide, and who is excluded. Formal institutions are half of it; the informal half is where most of it actually happens.' },
    { id: 'hu.economy', name: 'Economy & Society', icon: 'trade', tier: 'advanced', requires: ['hu.power'], state: lock, percent: 0, xp: 2100,
      desc: 'How people made a living, and what that allowed and prevented. Following the material constraints explains a surprising amount of what looks like pure ideology.' },
    { id: 'hu.ideas', name: 'History of Ideas', icon: 'idea', tier: 'advanced', requires: ['hu.cause'], state: lock, percent: 0, xp: 2100,
      desc: 'Where beliefs came from and what they were reacting against. Most ideas that feel obvious now were once a minority position with a specific opponent in mind.' },
    { id: 'hu.write', name: 'Writing in the Humanities', icon: 'essay', tier: 'advanced', core: true, requires: ['hu.argue', 'hu.cause'], state: lock, percent: 0, xp: 2200,
      desc: 'An essay that advances a position and shows its evidence, rather than surveying what others said. The literature review is background; the argument is the piece.' },
    { id: 'hu.ethics', name: 'Ethical Reasoning', icon: 'ethics', tier: 'expert', requires: ['hu.ideas'], state: lock, percent: 0, xp: 2300,
      desc: 'Working out what should be done, with reasons somebody who disagrees can engage with. It is a discipline rather than an opinion, and the disagreements are usually about which principle wins.' },
    { id: 'hu.history', name: 'History', icon: 'history', tier: 'advanced', requires: ['hu.change'], navTo: 'history', state: lock,
      desc: 'A subject of its own: what happened, how anybody knows, and why the account keeps being rewritten.' },
    { id: 'hu.philosophy', name: 'Philosophy', icon: 'philosophy', tier: 'advanced', requires: ['hu.logic'], navTo: 'philosophy', state: lock,
      desc: 'A subject of its own: the questions that do not resolve into evidence, and how to argue about them anyway.' },
    { id: 'hu.psychology', name: 'Psychology', icon: 'psychology', tier: 'advanced', requires: ['hu.people'], navTo: 'psychology', state: lock,
      desc: 'A subject of its own: how minds actually behave, measured carefully rather than assumed from introspection.' },
    { id: 'hu.debate', name: 'Competitive Debate', icon: 'debate', tier: 'advanced', requires: ['hu.argue', 'hu.evidence'], navTo: 'debate', state: lock,
      desc: 'A subject of its own: policy, LD and public forum — winning arguments, then winning rounds.' },
  ],
};

/**
 * Philosophy — a branch of Humanities.
 *
 * Argument analysis is the root and gates everything, because the discipline is
 * not a set of positions to hold: it is the ability to say precisely why an
 * argument works or does not, including one you would prefer to believe.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const PHILOSOPHY: SubjectTree = {
  id: 'philosophy',
  title: 'Philosophy',
  blurb: 'Questions evidence alone cannot settle, argued about carefully anyway.',
  parent: 'humanities',
  nodes: [
    { id: 'phi.argue', name: 'Arguments', icon: 'argument', tier: 'foundation', core: true, state: open, percent: 20, xp: 1400,
      desc: 'Premises, a conclusion, and the claim that the second follows from the first. Separating whether the reasoning is valid from whether the premises are true is the first move and the one people skip.' },
    { id: 'phi.logic', name: 'Formal Logic', icon: 'logic', tier: 'foundation', requires: ['phi.argue'], state: lock, percent: 0, xp: 1600,
      desc: 'Rules of inference that hold regardless of subject matter. Symbolizing an argument strips the rhetoric off it and shows what was actually being claimed.' },
    { id: 'phi.fallacy', name: 'Fallacies', icon: 'fallacy', tier: 'foundation', requires: ['phi.argue'], state: lock, percent: 0, xp: 1400,
      desc: 'Standard ways of reasoning badly while sounding persuasive. Useful for reading your own drafts, and overused as a way of dismissing arguments without answering them.' },
    { id: 'phi.concepts', name: 'Concepts & Definitions', icon: 'definition', tier: 'beginner', requires: ['phi.logic'], state: lock, percent: 0, xp: 1600,
      desc: 'Being precise about what a word is being used to mean here. A surprising number of long disagreements dissolve the moment both sides define the central term.' },
    { id: 'phi.thought', name: 'Thought Experiments', icon: 'thought-exp', tier: 'beginner', requires: ['phi.concepts'], state: lock, percent: 0, xp: 1600,
      desc: 'Impossible cases built to isolate one intuition. They are instruments rather than stories, and complaining that the scenario is unrealistic usually misses what it is for.' },
    { id: 'phi.epist', name: 'Epistemology', icon: 'knowledge', tier: 'beginner', core: true, requires: ['phi.concepts'], state: lock, percent: 0, xp: 1800,
      desc: 'What knowledge is and when a belief is justified. Scepticism is not the answer here; it is the pressure test every account of knowledge has to survive.' },
    { id: 'phi.meta', name: 'Metaphysics', icon: 'metaphysics', tier: 'intermediate', requires: ['phi.epist'], state: lock, percent: 0, xp: 1900,
      desc: 'What exists and what kind of thing it is: objects, properties, time, identity over change. Abstract until it turns out that most disputes elsewhere depend on an answer here.' },
    { id: 'phi.mind', name: 'Philosophy of Mind', icon: 'mind', tier: 'intermediate', requires: ['phi.meta'], state: lock, percent: 0, xp: 2000,
      desc: 'How thought relates to matter, and what conscious experience even is. The hard question is not how brains process information but why any of it is like something from the inside.' },
    { id: 'phi.free', name: 'Free Will', icon: 'choice', tier: 'intermediate', requires: ['phi.mind'], state: lock, percent: 0, xp: 1900,
      desc: 'Whether choices could have been otherwise, and whether it matters for responsibility. Most of the interesting work argues that determinism and responsibility are compatible, which is less obvious than either extreme.' },
    { id: 'phi.ethics', name: 'Ethics', icon: 'ethics', tier: 'intermediate', core: true, requires: ['phi.epist'], state: lock, percent: 0, xp: 2000,
      desc: 'What makes an action right — consequences, duties, or the character it expresses. The three main answers each get some cases obviously right and one case famously wrong.' },
    { id: 'phi.applied', name: 'Applied Ethics', icon: 'dilemma', tier: 'advanced', requires: ['phi.ethics'], state: lock, percent: 0, xp: 2000,
      desc: 'Medicine, animals, war, technology and the environment, argued case by case. It is where the theories earn their keep or turn out to be unusable.' },
    { id: 'phi.political', name: 'Political Philosophy', icon: 'social-contract', tier: 'advanced', requires: ['phi.ethics'], state: lock, percent: 0, xp: 2100,
      desc: 'What makes authority legitimate and what a just distribution would look like. Every actual political argument is standing on an unstated answer to one of these.' },
    { id: 'phi.aesthetics', name: 'Aesthetics', icon: 'beauty', tier: 'advanced', requires: ['phi.meta'], state: lock, percent: 0, xp: 1900,
      desc: 'What art is, and whether a judgment of beauty claims anything beyond a preference. The interesting cases are the ones where taste feels like it should be arguable.' },
    { id: 'phi.science', name: 'Philosophy of Science', icon: 'scientific-method', tier: 'advanced', requires: ['phi.epist'], state: lock, percent: 0, xp: 2100,
      desc: 'What makes a claim scientific, how theories are chosen, and what happens when one is overturned. It takes the method seriously enough to ask what it actually guarantees.' },
    { id: 'phi.language', name: 'Philosophy of Language', icon: 'meaning', tier: 'advanced', requires: ['phi.logic', 'phi.concepts'], state: lock, percent: 0, xp: 2100,
      desc: 'How words attach to things, and how a sentence gets to be about anything at all. A great deal of twentieth-century philosophy runs through this question.' },
    { id: 'phi.ancient', name: 'Ancient Philosophy', icon: 'column', tier: 'intermediate', requires: ['phi.thought'], state: lock, percent: 0, xp: 1800,
      desc: 'The Greek beginnings, where the questions were set and several answers still stand. Reading the dialogues is also the best available demonstration of what an argument in good faith looks like.' },
    { id: 'phi.modern', name: 'Modern Philosophy', icon: 'enlightenment', tier: 'advanced', requires: ['phi.ancient', 'phi.epist'], state: lock, percent: 0, xp: 2100,
      desc: 'The turn to the knowing subject: rationalists, empiricists, and the synthesis that tried to end the argument. Most contemporary debates are still using vocabulary settled here.' },
    { id: 'phi.contemporary', name: 'Contemporary Traditions', icon: 'branch', tier: 'expert', requires: ['phi.modern', 'phi.language'], state: lock, percent: 0, xp: 2400,
      desc: 'The split into analytic and continental approaches, and the traditions outside Europe that were doing this all along. Knowing what each is trying to achieve makes the mutual dismissals less confusing.' },
    { id: 'phi.write', name: 'Writing Philosophy', icon: 'essay', tier: 'expert', requires: ['phi.applied', 'phi.political'], state: lock, percent: 0, xp: 2400,
      desc: 'One claim, defended, with the strongest objection answered rather than avoided. Clarity is the whole style: obscurity in this subject is nearly always a sign the thought is not finished.' },
    { id: 'phi.examined', name: 'The Examined Life', icon: 'insight', tier: 'mastery', requires: ['phi.write', 'phi.free', 'phi.contemporary'], state: lock, percent: 0, xp: 2900,
      desc: 'Actually applying any of it to how you live and what you believe. The subject is famously capable of being studied for years with no such contact, which was never the intention.' },
  ],
};

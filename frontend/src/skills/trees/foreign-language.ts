/**
 * Foreign Languages — a branch of Language & Writing.
 *
 * One tree for all five languages in the catalogue rather than five nearly
 * identical ones. What differs between Spanish and Japanese is the content of
 * each node, not the order of them: everybody needs sounds before words, comfort
 * with being misunderstood before fluency, and enormous amounts of input
 * throughout.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const FOREIGN_LANGUAGE: SubjectTree = {
  id: 'foreign-language',
  title: 'Foreign Languages',
  blurb: 'Understanding, and being understood, in a language you were not raised in.',
  parent: 'language',
  nodes: [
    { id: 'fl.sounds', name: 'Sounds & Script', icon: 'phonetics', tier: 'foundation', core: true, state: open, percent: 20, xp: 1300,
      desc: 'The sounds the language uses and the marks it writes them with, learned before any vocabulary. A word learned with the wrong sounds has to be unlearned, and that is far more expensive than a slow start.' },
    { id: 'fl.core', name: 'Core Vocabulary', icon: 'vocabulary', tier: 'foundation', requires: ['fl.sounds'], state: lock, percent: 0, xp: 1400,
      desc: 'The first thousand words, which cover most of ordinary speech. Frequency order is not a preference here; it is the difference between six months and three years to a first conversation.' },
    { id: 'fl.phrases', name: 'Survival Phrases', icon: 'phrasebook', tier: 'foundation', requires: ['fl.core'], state: lock, percent: 0, xp: 1200,
      desc: 'Greetings, asking for things, and the sentences that keep a conversation alive when you are lost. "Say that again slowly" is worth more than fifty nouns.' },
    { id: 'fl.grammar', name: 'Basic Grammar', icon: 'grammar', tier: 'beginner', core: true, requires: ['fl.core'], state: lock, percent: 0, xp: 1700,
      desc: 'Word order, and how verbs change for who is doing what and when. Enough structure to build sentences you have never heard, which is the point at which phrases become a language.' },
    { id: 'fl.listen', name: 'Listening', icon: 'listening', tier: 'beginner', core: true, requires: ['fl.phrases'], state: lock, percent: 0, xp: 1700,
      desc: 'Making out words in speech at full speed, where they run together and nothing is enunciated. It lags behind reading for everybody, and the only fix is hours of it.' },
    { id: 'fl.speak', name: 'Speaking', icon: 'speaking', tier: 'beginner', requires: ['fl.phrases'], state: lock, percent: 0, xp: 1800,
      desc: 'Producing sentences aloud, badly, in front of somebody. The willingness to be wrong out loud is the single largest predictor of how fast anybody learns a language.' },
    { id: 'fl.read', name: 'Reading', icon: 'reading', tier: 'beginner', requires: ['fl.grammar'], state: lock, percent: 0, xp: 1600,
      desc: 'Text you can work through with a dictionary, then text you can follow without one. Graded material first: reading something too hard teaches vocabulary and destroys the habit.' },
    { id: 'fl.tenses', name: 'Tenses & Aspect', icon: 'tense', tier: 'intermediate', requires: ['fl.grammar'], state: lock, percent: 0, xp: 1900,
      desc: 'Talking about what happened, what will, and what was ongoing when something else interrupted. Languages divide time differently, and the divisions rarely map onto the ones you grew up with.' },
    { id: 'fl.cases', name: 'Cases & Agreement', icon: 'agreement', tier: 'intermediate', requires: ['fl.tenses'], state: lock, percent: 0, xp: 2000,
      desc: 'How a language marks who did what to whom — endings, particles, or strict word order. Whichever system it uses, it is doing a job your first language does some other way.' },
    { id: 'fl.input', name: 'Comprehensible Input', icon: 'input-stream', tier: 'intermediate', core: true, requires: ['fl.listen', 'fl.read'], state: lock, percent: 0, xp: 2000,
      desc: 'Large amounts of material just above your level, understood mostly from context. This is where most real acquisition happens, and it does not feel like studying, which is why it gets skipped.' },
    { id: 'fl.srs', name: 'Spaced Review', icon: 'flashcards', tier: 'intermediate', requires: ['fl.core'], state: lock, percent: 0, xp: 1600,
      desc: 'Reviewing each item just before you would forget it. Twenty minutes daily beats three hours weekly by a wide margin, and cards made from sentences you met beat cards bought in a deck.' },
    { id: 'fl.convo', name: 'Conversation', icon: 'conversation', tier: 'intermediate', requires: ['fl.speak', 'fl.input'], state: lock, percent: 0, xp: 2100,
      desc: 'Real exchanges at real speed, including the part where you did not catch it. Learning to repair a conversation without switching to English is a skill of its own.' },
    { id: 'fl.write', name: 'Writing', icon: 'writing', tier: 'advanced', requires: ['fl.cases'], state: lock, percent: 0, xp: 1900,
      desc: 'Producing text with time to think, which exposes exactly the gaps speaking lets you skate over. Getting a sentence corrected teaches more than getting a paragraph praised.' },
    { id: 'fl.idiom', name: 'Idiom & Collocation', icon: 'idiom', tier: 'advanced', requires: ['fl.convo'], state: lock, percent: 0, xp: 2100,
      desc: 'Which words go together, which is mostly arbitrary and entirely noticeable. Grammatically perfect sentences that no native speaker would say are the last thing to disappear.' },
    { id: 'fl.register', name: 'Register & Politeness', icon: 'tone', tier: 'advanced', requires: ['fl.idiom'], state: lock, percent: 0, xp: 2100,
      desc: 'Formal and casual, and who gets which. Some languages encode it in the verb itself, and getting it wrong reads as rudeness rather than as a learner error.' },
    { id: 'fl.culture', name: 'Cultural Context', icon: 'culture', tier: 'advanced', requires: ['fl.register'], state: lock, percent: 0, xp: 2000,
      desc: 'What is assumed, what is impolite to say directly, and the references everybody shares. Language separated from this produces sentences that are correct and land wrongly.' },
    { id: 'fl.media', name: 'Native Media', icon: 'media', tier: 'advanced', requires: ['fl.input'], state: lock, percent: 0, xp: 2200,
      desc: 'Film, news and books made for native speakers rather than for you. The first ones are exhausting; the transition from subtitles to none is the milestone most learners remember.' },
    { id: 'fl.fluency', name: 'Fluency', icon: 'fluency', tier: 'expert', core: true, requires: ['fl.media', 'fl.culture'], state: lock, percent: 0, xp: 2600,
      desc: 'Speaking without translating in your head, and thinking in the language for stretches. It arrives gradually and is usually noticed in retrospect, often by somebody else.' },
    { id: 'fl.translate', name: 'Translating', icon: 'translate', tier: 'expert', requires: ['fl.write', 'fl.fluency'], state: lock, percent: 0, xp: 2500,
      desc: 'Carrying meaning across rather than words, and deciding what to lose. Being fluent in both languages is a prerequisite and nowhere near sufficient.' },
    { id: 'fl.maintain', name: 'Maintenance', icon: 'maintain', tier: 'mastery', requires: ['fl.fluency'], state: lock, percent: 0, xp: 2800,
      desc: 'Keeping a language you stopped studying. Without regular contact it fades faster than anything else you have learned, and reading twenty minutes a week holds most of it.' },
    { id: 'fl.latin', name: 'Latin', icon: 'monument', tier: 'intermediate', requires: ['fl.grammar'], navTo: 'latin', state: lock,
      desc: 'Its own tree: cases, declensions and translation, from your first noun to reading Vergil.' },
    { id: 'fl.asl', name: 'Sign Language', icon: 'hands', tier: 'beginner', requires: ['fl.sounds'], navTo: 'sign-language', state: lock,
      desc: 'Its own tree: fingerspelling, facial grammar, classifiers and real conversations in ASL.' },
  ],
};

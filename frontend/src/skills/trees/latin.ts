/**
 * Latin, a branch of Foreign Languages.
 *
 * Its own tree because Latin is learned for reading. The order runs toward
 * translation and AP Latin, with almost no conversation in it.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const LATIN: SubjectTree = {
  id: 'latin',
  title: 'Latin',
  blurb: 'Endings, translation and reading the Romans in their own words.',
  parent: 'foreign-language',
  nodes: [
    { id: 'lt.sounds', name: 'Pronunciation', icon: 'phonetics', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Classical sounds, like a hard c, w for v and long and short vowels. Reading aloud helps the endings stick.' },
    { id: 'lt.verbs', name: 'Verbs & Conjugations', icon: 'tense', tier: 'foundation', requires: ['lt.sounds'], state: lock, percent: 0, xp: 1200,
      desc: 'Person, number and tense packed into one ending. Learn the four conjugations and the principal parts.' },
    { id: 'lt.nouns', name: 'Nouns & Cases', icon: 'labels', tier: 'foundation', core: true, requires: ['lt.sounds'], state: lock, percent: 0, xp: 1300,
      desc: "Nominative, genitive, dative, accusative and ablative. In Latin, the ending shows a word's job, so word order is loose." },
    { id: 'lt.decl', name: 'The Five Declensions', icon: 'table', tier: 'beginner', requires: ['lt.nouns'], state: lock, percent: 0, xp: 1700,
      desc: "Noun families that share the same set of endings. Chant the charts out loud until they're automatic." },
    { id: 'lt.vocab', name: 'Core Vocabulary', icon: 'vocabulary', tier: 'beginner', requires: ['lt.nouns'], state: lock, percent: 0, xp: 1400,
      desc: 'The thousand words that cover most texts. Loads of English words come from them, so look for the links.' },
    { id: 'lt.adj', name: 'Adjectives & Agreement', icon: 'agreement', tier: 'beginner', requires: ['lt.decl'], state: lock, percent: 0, xp: 1500,
      desc: "Adjectives match their nouns in gender, number and case. That's how you pair them up when they sit far apart." },
    { id: 'lt.roots', name: 'Latin in English', icon: 'tree-structure', tier: 'beginner', requires: ['lt.vocab'], state: lock, percent: 0, xp: 1600,
      desc: 'Roots and prefixes behind half the words on the SAT. Latin students tend to crush vocab sections.' },
    { id: 'lt.culture', name: 'Roman Life & History', icon: 'monument', tier: 'beginner', requires: ['lt.vocab'], state: lock, percent: 0, xp: 1700,
      desc: 'Daily life, the Republic and the Empire. Knowing the world makes the texts make sense.' },
    { id: 'lt.tenses', name: 'All Six Tenses', icon: 'timeline', tier: 'intermediate', requires: ['lt.verbs'], state: lock, percent: 0, xp: 1700,
      desc: 'Present, imperfect, future, perfect, pluperfect and future perfect. The perfect stem unlocks three of them.' },
    { id: 'lt.pronouns', name: 'Pronouns', icon: 'reference', tier: 'intermediate', requires: ['lt.adj'], state: lock, percent: 0, xp: 1800,
      desc: 'Personal, demonstrative and relative pronouns. Relative clauses are where sentences start to get long.' },
    { id: 'lt.translate', name: 'Translating Sentences', icon: 'translate', tier: 'intermediate', core: true, requires: ['lt.tenses', 'lt.pronouns', 'lt.vocab'], state: lock, percent: 0, xp: 1900,
      desc: 'Finding the verb, then the subject, then everything else. Read the whole sentence before you write a word.' },
    { id: 'lt.passive', name: 'Passive Voice', icon: 'transform', tier: 'advanced', requires: ['lt.tenses'], state: lock, percent: 0, xp: 2300,
      desc: 'Things being done to someone. The endings change, and the ablative tells you who did it.' },
    { id: 'lt.particip', name: 'Participles', icon: 'branch', tier: 'advanced', requires: ['lt.passive'], state: lock, percent: 0, xp: 2000,
      desc: 'Verb adjectives that pack a whole clause into one word. The ablative absolute is the classic one.' },
    { id: 'lt.subj', name: 'The Subjunctive', icon: 'conditionals', tier: 'advanced', requires: ['lt.particip'], state: lock, percent: 0, xp: 2100,
      desc: 'The mood for wishes, purposes and what-ifs. Its forms are simple once you spot the vowel swap.' },
    { id: 'lt.indirect', name: 'Indirect Speech', icon: 'message', tier: 'expert', requires: ['lt.subj'], state: lock, percent: 0, xp: 2500,
      desc: 'Reported statements and questions. Latin uses an infinitive where English would say that.' },
    { id: 'lt.caesar', name: 'Reading Caesar', icon: 'manuscript', tier: 'expert', requires: ['lt.translate', 'lt.indirect'], state: lock, percent: 0, xp: 2600,
      desc: "Real prose from the Gallic War. It's clear and military, and AP Latin builds right on it." },
    { id: 'lt.vergil', name: 'Reading Vergil', icon: 'poem', tier: 'expert', requires: ['lt.caesar'], state: lock, percent: 0, xp: 2300,
      desc: 'The Aeneid in dactylic hexameter. Poetry scrambles word order, so the endings matter even more.' },
    { id: 'lt.scansion', name: 'Scansion', icon: 'rhythm', tier: 'expert', requires: ['lt.vergil'], state: lock, percent: 0, xp: 2400,
      desc: 'Marking long and short syllables to find the rhythm. It helps you read the poetry out loud the way it was meant.' },
    { id: 'lt.exam', name: 'AP Latin & Contests', icon: 'trophy', tier: 'mastery', requires: ['lt.scansion', 'lt.culture', 'lt.roots'], state: lock, percent: 0, xp: 2800,
      desc: 'Sight reading, the National Latin Exam and the AP. Timed translation with no dictionary is the final test.' },
  ],
};

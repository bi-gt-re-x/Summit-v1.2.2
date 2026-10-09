/**
 * Language & Writing — a root subject.
 *
 * The catalogue files English, literature, writing, grammar, vocabulary and five
 * spoken languages separately, and they share a spine: sentences, meaning and
 * the habit of reading closely. That spine is this tree, and the three forks are
 * the places it genuinely stops being one subject.
 */
import type { SubjectTree } from './types';
import { done, prog, open, lock } from './types';

export const LANGUAGE: SubjectTree = {
  id: 'language',
  title: 'Language & Writing',
  blurb: 'Sentences that say what you meant, and reading that catches what somebody else did.',
  group: 'Language and humanities',
  nodes: [
    { id: 'ln.read', name: 'Reading Fluently', icon: 'reading', tier: 'foundation', core: true, state: done, percent: 100, xp: 1200,
      desc: 'Getting through a page without decoding it word by word, so attention is free for the meaning. Everything else in this tree assumes it, and it is built by volume rather than by exercises.' },
    { id: 'ln.vocab', name: 'Vocabulary', icon: 'vocabulary', tier: 'foundation', core: true, requires: ['ln.read'], state: prog, percent: 70, xp: 1300,
      desc: 'Words known well enough to use, not merely to recognize. Learning them inside a sentence you met them in beats a list, because the connotation is most of what a word actually carries.' },
    { id: 'ln.spelling', name: 'Spelling & Sound', icon: 'alphabet', tier: 'foundation', requires: ['ln.read'], state: done, percent: 100, xp: 1000,
      desc: 'The patterns behind English spelling, which is far more regular than its reputation once you know where the borrowings came from. Knowing the pattern beats memorizing the exception.' },
    { id: 'ln.parts', name: 'Parts of Speech', icon: 'grammar', tier: 'foundation', requires: ['ln.vocab'], state: prog, percent: 55, xp: 1200,
      desc: 'What each word is doing in a sentence rather than what it means. It is the vocabulary you need to talk about why a sentence is broken instead of only feeling that it is.' },
    { id: 'ln.sentence', name: 'Sentences', icon: 'sentence', tier: 'beginner', core: true, requires: ['ln.parts'], state: prog, percent: 45, xp: 1500,
      desc: 'Subject, verb and the clauses hanging off them. Most bad writing is not a vocabulary problem; it is sentences with too many things going on and no clear main action.' },
    { id: 'ln.punct', name: 'Punctuation', icon: 'punctuation', tier: 'beginner', requires: ['ln.sentence'], state: open, percent: 30, xp: 1300,
      desc: 'Marks that show a reader how the parts fit together. The comma splice and the misused apostrophe are the two errors that cost credibility fastest, and both take an afternoon to fix for good.' },
    { id: 'ln.tense', name: 'Tense & Agreement', icon: 'tense', tier: 'beginner', requires: ['ln.sentence'], state: open, percent: 25, xp: 1400,
      desc: 'Keeping time consistent and making the parts of a sentence match. Drifting between past and present mid-paragraph is invisible while writing and glaring on the second read.' },
    { id: 'ln.para', name: 'Paragraphs', icon: 'paragraph', tier: 'beginner', requires: ['ln.punct'], state: open, percent: 20, xp: 1500,
      desc: 'One idea, developed, with a sentence that says what it is. A paragraph that changes subject halfway is two paragraphs, and splitting them is the cheapest structural improvement there is.' },
    { id: 'ln.summary', name: 'Summarizing', icon: 'summary', tier: 'beginner', requires: ['ln.para'], state: lock, percent: 0, xp: 1500,
      desc: 'Saying in three sentences what took three pages, without smuggling in your own view. It is the most reliable test of whether something was actually understood.' },
    { id: 'ln.notes', name: 'Note-Taking', icon: 'notes', tier: 'beginner', requires: ['ln.summary'], state: lock, percent: 0, xp: 1400,
      desc: 'Capturing meaning rather than transcribing words, in a form your later self can use. Notes that are shorter than the source and rewritten in your own phrasing are the ones that survive.' },
    { id: 'ln.close', name: 'Close Reading', icon: 'magnifier', tier: 'intermediate', core: true, requires: ['ln.summary'], state: lock, percent: 0, xp: 1900,
      desc: 'Reading for how something is said as well as what it says: word choice, structure, what is left out. It is the difference between having an opinion about a text and having evidence.' },
    { id: 'ln.argument', name: 'Argument', icon: 'argument', tier: 'intermediate', requires: ['ln.close'], state: lock, percent: 0, xp: 1900,
      desc: 'A claim, reasons and the evidence under them, arranged so a skeptical reader follows. Anticipating the strongest objection rather than the weakest is what separates persuasion from assertion.' },
    { id: 'ln.tone', name: 'Tone & Register', icon: 'tone', tier: 'intermediate', requires: ['ln.para'], state: lock, percent: 0, xp: 1600,
      desc: 'Matching how formal, warm or direct the writing is to who is reading it. The same content in the wrong register reads as rude, unserious or evasive, none of which was meant.' },
    { id: 'ln.edit', name: 'Editing', icon: 'edit-pen', tier: 'intermediate', core: true, requires: ['ln.tone', 'ln.tense'], state: lock, percent: 0, xp: 1800,
      desc: 'Cutting, reordering and tightening after the draft exists. Nearly every first draft loses a fifth of its words with no loss of meaning, and finding them is a separate sitting from writing them.' },
    { id: 'ln.research', name: 'Research & Sources', icon: 'research', tier: 'advanced', requires: ['ln.notes'], state: lock, percent: 0, xp: 1900,
      desc: 'Finding material, judging whether it is any good, and tracking where each fact came from. Recording the source at the moment you use it costs seconds and saves an evening.' },
    { id: 'ln.cite', name: 'Citation & Integrity', icon: 'citation', tier: 'advanced', requires: ['ln.research'], state: lock, percent: 0, xp: 1700,
      desc: 'Attributing ideas and quotations in a consistent style. The rule underneath the formatting is simple: a reader should always be able to tell which thoughts are yours.' },
    { id: 'ln.speak', name: 'Speaking & Discussion', icon: 'discussion', tier: 'intermediate', requires: ['ln.argument'], state: lock, percent: 0, xp: 1800,
      desc: 'Making a point aloud, listening to the reply, and changing your mind in public when it is warranted. Structure helps more than confidence: one claim, one reason, one example.' },
    { id: 'ln.listen', name: 'Listening', icon: 'listening', tier: 'intermediate', requires: ['ln.speak'], state: lock, percent: 0, xp: 1600,
      desc: 'Following an argument you did not construct, including the part you disagree with. Being able to restate a position you disagree with, to the satisfaction of the person holding it, to their satisfaction is the test worth applying.' },
    { id: 'ln.style', name: 'Style', icon: 'style', tier: 'advanced', requires: ['ln.edit'], state: lock, percent: 0, xp: 2200,
      desc: 'The choices that make prose yours: rhythm, sentence length, how much you leave to the reader. It arrives from reading widely and imitating deliberately, not from adjectives.' },
    { id: 'ln.write', name: 'Writing', icon: 'writing', tier: 'advanced', requires: ['ln.style'], navTo: 'writing', state: lock,
      desc: 'A subject of its own: drafting, structure, and the long forms that need more than a good paragraph.' },
    { id: 'ln.lit', name: 'Literature', icon: 'literature', tier: 'advanced', requires: ['ln.close'], navTo: 'literature', state: lock,
      desc: 'A subject of its own: reading fiction and poetry closely, and the traditions they answer.' },
    { id: 'ln.foreign', name: 'Foreign Languages', icon: 'translate', tier: 'intermediate', requires: ['ln.parts'], navTo: 'foreign-language', state: lock,
      desc: 'A subject of its own: learning to understand and be understood in a language you were not raised in.' },
  ],
};

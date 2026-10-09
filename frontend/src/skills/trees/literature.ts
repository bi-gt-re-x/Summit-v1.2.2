/**
 * Literature — a branch of Language & Writing.
 *
 * Arranged so that theory arrives after enough reading to argue with it. A
 * reader handed a critical lens before they have formed an opinion of their own
 * learns to produce readings rather than to have them.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const LITERATURE: SubjectTree = {
  id: 'literature',
  title: 'Literature',
  blurb: 'Reading closely enough to say something nobody could have said from the blurb.',
  parent: 'language',
  nodes: [
    { id: 'lit.read', name: 'Reading Widely', icon: 'library', tier: 'foundation', core: true, state: open, percent: 20, xp: 1300,
      desc: 'Enough books, across enough kinds, that comparisons become available. Every later skill here is a way of noticing, and noticing needs something to notice against.' },
    { id: 'lit.plot', name: 'Plot & Structure', icon: 'story-arc', tier: 'foundation', requires: ['lit.read'], state: lock, percent: 0, xp: 1400,
      desc: 'What happens, in what order, and why that order. Noticing where a book withholds information is the first step from summarizing a story to reading one.' },
    { id: 'lit.character', name: 'Character', icon: 'character', tier: 'foundation', requires: ['lit.plot'], state: lock, percent: 0, xp: 1400,
      desc: 'People built from what they want, what they do about it, and what they say instead. A character who changes is the engine of most fiction, and the change is usually smaller than the plot.' },
    { id: 'lit.pov', name: 'Narrator & Point of View', icon: 'viewpoint', tier: 'beginner', core: true, requires: ['lit.character'], state: lock, percent: 0, xp: 1700,
      desc: 'Who is telling this, how much they know, and whether they can be trusted. Recognizing an unreliable narrator changes everything a book appeared to be saying.' },
    { id: 'lit.setting', name: 'Setting & Atmosphere', icon: 'setting', tier: 'beginner', requires: ['lit.plot'], state: lock, percent: 0, xp: 1400,
      desc: 'Where and when, and what that does to what is possible. Setting is rarely decoration; it is usually the constraint the whole conflict depends on.' },
    { id: 'lit.imagery', name: 'Imagery & Figurative Language', icon: 'imagery', tier: 'beginner', requires: ['lit.pov'], state: lock, percent: 0, xp: 1600,
      desc: 'Metaphor, simile and the images a book keeps returning to. A repeated image is a claim the book is making without stating it.' },
    { id: 'lit.theme', name: 'Theme', icon: 'theme', tier: 'beginner', requires: ['lit.imagery'], state: lock, percent: 0, xp: 1700,
      desc: 'What the book is about underneath what happens in it. A theme is an argument rather than a topic, which is why "love" is not one and "what love costs" might be.' },
    { id: 'lit.form', name: 'Form & Genre', icon: 'genre', tier: 'intermediate', requires: ['lit.setting'], state: lock, percent: 0, xp: 1700,
      desc: 'The conventions a work is written inside, and what breaking one signals. Genre is a set of expectations shared with the reader, and the interesting books know exactly which one they are refusing.' },
    { id: 'lit.poetry', name: 'Reading Poetry', icon: 'poem', tier: 'intermediate', core: true, requires: ['lit.imagery'], state: lock, percent: 0, xp: 1900,
      desc: 'Line, sound, compression and what the break at the end of a line does to a phrase. Read aloud twice before deciding what it means, and expect the first reading to be wrong.' },
    { id: 'lit.drama', name: 'Reading Drama', icon: 'theatre', tier: 'intermediate', requires: ['lit.pov'], state: lock, percent: 0, xp: 1700,
      desc: 'Text written to be performed, where nobody narrates and everything must be shown or said. What a character conceals is doing as much work as what they announce.' },
    { id: 'lit.close', name: 'Close Reading', icon: 'magnifier', tier: 'intermediate', core: true, requires: ['lit.theme'], state: lock, percent: 0, xp: 2000,
      desc: 'Building a reading of a whole work out of a paragraph of it. The discipline is that every claim points at specific words, which is what makes it an argument rather than an impression.' },
    { id: 'lit.context', name: 'Historical Context', icon: 'timeline', tier: 'advanced', requires: ['lit.form'], state: lock, percent: 0, xp: 1900,
      desc: 'What the book was answering, and what its first readers took for granted. Context explains choices that look like flaws from here and stops anachronistic readings.' },
    { id: 'lit.tradition', name: 'Movements & Tradition', icon: 'tradition', tier: 'advanced', requires: ['lit.context'], state: lock, percent: 0, xp: 2000,
      desc: 'The conversations books have with each other across centuries. Most famous works are replies, and knowing what they are replying to is half the meaning.' },
    { id: 'lit.compare', name: 'Comparative Reading', icon: 'compare', tier: 'advanced', requires: ['lit.close'], state: lock, percent: 0, xp: 2100,
      desc: 'Two texts side by side, chosen so the comparison produces something neither would alone. The pairing is the argument, and a lazy pairing cannot be rescued by good analysis.' },
    { id: 'lit.theory', name: 'Critical Approaches', icon: 'lens', tier: 'advanced', requires: ['lit.tradition'], state: lock, percent: 0, xp: 2200,
      desc: 'Deliberate lenses — historical, psychological, political, formal — each making some features visible and others invisible. The point is choosing one knowingly rather than having one by default.' },
    { id: 'lit.essay', name: 'The Literary Essay', icon: 'essay', tier: 'advanced', core: true, requires: ['lit.compare'], state: lock, percent: 0, xp: 2200,
      desc: 'A claim about a text, defended with quotation and analysis rather than plot summary. The commonest failure is retelling the book to a reader who has read it.' },
    { id: 'lit.translate', name: 'Literature in Translation', icon: 'translate', tier: 'expert', requires: ['lit.theory'], state: lock, percent: 0, xp: 2300,
      desc: 'Reading work whose sentences somebody else chose. Comparing two translations of one paragraph is the fastest lesson in how much of style is decision.' },
    { id: 'lit.canon', name: 'Canon & Its Critics', icon: 'canon', tier: 'expert', requires: ['lit.theory'], state: lock, percent: 0, xp: 2300,
      desc: 'How a set of books came to be the set everybody studies, and who decided. The argument about what was left out is itself one of the more interesting things in the subject.' },
    { id: 'lit.research', name: 'Literary Research', icon: 'research', tier: 'expert', requires: ['lit.essay', 'lit.canon'], state: lock, percent: 0, xp: 2500,
      desc: 'Finding what has already been argued, and locating the gap your reading fills. Knowing the existing scholarship is what turns an opinion into a contribution.' },
    { id: 'lit.own', name: 'Your Own Reading', icon: 'insight', tier: 'mastery', requires: ['lit.research', 'lit.translate', 'lit.drama'], state: lock, percent: 0, xp: 2900,
      desc: 'An interpretation you can defend that is genuinely yours, held loosely enough to revise. That is the whole point of the apparatus, and it is easy to lose sight of behind the apparatus.' },
  ],
};

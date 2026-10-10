/**
 * Studying — a branch of Productivity.
 *
 * Every node here has evidence behind it, and the tree is arranged to put the
 * techniques that work above the ones that feel productive. Rereading and
 * highlighting are the two most popular study methods and among the least
 * effective, which is exactly why retrieval sits so near the root.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const STUDY: SubjectTree = {
  id: 'study',
  title: 'Studying',
  blurb: 'Learning things deliberately, and still having them next year.',
  parent: 'productivity',
  nodes: [
    { id: 'sy.plan', name: 'Planning Study', icon: 'study-plan', tier: 'foundation', core: true, state: open, percent: 20, xp: 1400,
      desc: 'Deciding what to study when, against the date it is needed. Working through material in the order it appears in a book is a plan by default rather than a decision.' },
    { id: 'sy.read', name: 'Reading to Learn', icon: 'reading', tier: 'foundation', requires: ['sy.plan'], state: lock, percent: 0, xp: 1500,
      desc: 'Previewing the structure, asking questions, then reading for the answers. Passive reading from the first line produces a feeling of familiarity that is easily mistaken for knowledge.' },
    { id: 'sy.notes', name: 'Note-Taking', icon: 'notes', tier: 'foundation', requires: ['sy.read'], state: lock, percent: 0, xp: 1500,
      desc: 'Notes in your own words, shorter than the source. Transcribing what was said keeps the hands busy and the understanding untested.' },
    { id: 'sy.retrieval', name: 'Retrieval Practice', icon: 'retrieval', tier: 'beginner', core: true, requires: ['sy.notes'], state: lock, percent: 0, xp: 1900,
      desc: 'Closing the book and trying to produce the answer. Difficult, unpleasant, and by a wide margin the best-supported study technique there is.' },
    { id: 'sy.spacing', name: 'Spaced Repetition', icon: 'flashcards', tier: 'beginner', core: true, requires: ['sy.retrieval'], state: lock, percent: 0, xp: 1900,
      desc: 'Reviewing just before you would forget, at growing intervals. It converts a fact learned once into a fact you still have in June, for a fraction of the total time.' },
    { id: 'sy.interleave', name: 'Interleaving', icon: 'interleave', tier: 'beginner', requires: ['sy.spacing'], state: lock, percent: 0, xp: 1700,
      desc: 'Mixing problem types instead of doing thirty of one kind. Performance in the session gets worse and retention afterwards gets better, which is why almost nobody does it voluntarily.' },
    { id: 'sy.explain', name: 'Explaining It', icon: 'explain', tier: 'beginner', requires: ['sy.retrieval'], state: lock, percent: 0, xp: 1700,
      desc: 'Teaching the material to somebody, or to an empty room. The point where the explanation stalls is precisely the gap that rereading would have hidden.' },
    { id: 'sy.understand', name: 'Understanding vs Memorizing', icon: 'understanding', tier: 'intermediate', requires: ['sy.explain'], state: lock, percent: 0, xp: 1800,
      desc: 'Knowing why something follows, so it can be reconstructed rather than recalled. Some things just have to be memorized, and knowing which is a decision worth making explicitly.' },
    { id: 'sy.problems', name: 'Practice Problems', icon: 'problem-set', tier: 'intermediate', requires: ['sy.interleave'], state: lock, percent: 0, xp: 1900,
      desc: 'Working problems without the solution visible, then checking. Reading a worked solution and nodding is the most reliable way to be surprised in an exam.' },
    { id: 'sy.mistakes', name: 'Learning from Mistakes', icon: 'error-log', tier: 'intermediate', core: true, requires: ['sy.problems'], state: lock, percent: 0, xp: 1900,
      desc: 'A record of what you got wrong and why, revisited. Most people mark, feel bad and move on, which throws away the most information-dense part of the session.' },
    { id: 'sy.memory', name: 'Memory Techniques', icon: 'mnemonic', tier: 'intermediate', requires: ['sy.understand'], state: lock, percent: 0, xp: 1800,
      desc: 'Mnemonics, stories and places for material that is arbitrary. Enormously effective on lists and sequences, and no substitute for understanding anything with a structure.' },
    { id: 'sy.summarise', name: 'Summarizing & Mapping', icon: 'concept-map', tier: 'intermediate', requires: ['sy.notes'], state: lock, percent: 0, xp: 1700,
      desc: 'Compressing a topic onto one page and drawing what connects to what. The compression is where the learning happens; the page afterwards is mostly a souvenir.' },
    { id: 'sy.deep', name: 'Deep Study Sessions', icon: 'deep-work', tier: 'advanced', requires: ['sy.mistakes'], state: lock, percent: 0, xp: 2000,
      desc: 'Long uninterrupted blocks on difficult material, which is what hard subjects require. Two focused hours outperform six with a phone on the desk, and it is not close.' },
    { id: 'sy.group', name: 'Study Groups', icon: 'study-group', tier: 'advanced', requires: ['sy.explain'], state: lock, percent: 0, xp: 1700,
      desc: 'Working with others, which is excellent for explaining and testing and terrible for first exposure. It needs a stated purpose or it becomes a social event with books open.' },
    { id: 'sy.sources', name: 'Finding Material', icon: 'research', tier: 'advanced', requires: ['sy.summarise'], state: lock, percent: 0, xp: 1800,
      desc: 'Past papers, textbooks, lectures and problem sets, chosen for the question you actually have. Past papers are consistently the most underused resource available.' },
    { id: 'sy.revision', name: 'Revision Timetables', icon: 'revision', tier: 'advanced', requires: ['sy.deep', 'sy.sources'], state: lock, percent: 0, xp: 2000,
      desc: 'A schedule across weeks that revisits everything more than once. Building a beautiful timetable is itself a well-known form of procrastination, so keep it to twenty minutes.' },
    { id: 'sy.exam', name: 'Exam Technique', icon: 'exam', tier: 'advanced', core: true, requires: ['sy.revision'], state: lock, percent: 0, xp: 2100,
      desc: 'Reading the question, allocating time by marks, and writing what is being asked for. A large fraction of lost marks are technique rather than knowledge.' },
    { id: 'sy.nerves', name: 'Exam Nerves', icon: 'calm', tier: 'expert', requires: ['sy.exam'], state: lock, percent: 0, xp: 2100,
      desc: 'Practicing under timed conditions so the state is familiar, and having a plan for going blank. Preparation reduces anxiety far more effectively than reassurance does.' },
    { id: 'sy.longterm', name: 'Keeping What You Learned', icon: 'retain', tier: 'expert', requires: ['sy.nerves', 'sy.memory'], state: lock, percent: 0, xp: 2300,
      desc: 'Occasional review after the exam, which is what separates a subject you studied from one you know. Almost all of it goes within months otherwise, whatever the grade said.' },
    { id: 'sy.self', name: 'Teaching Yourself', icon: 'autodidact', tier: 'mastery', requires: ['sy.longterm', 'sy.group'], state: lock, percent: 0, xp: 2800,
      desc: 'Learning something with no course, no deadline and nobody checking. It needs every skill in this tree at once, and it is the one that keeps working for the rest of your life.' },
  ],
};

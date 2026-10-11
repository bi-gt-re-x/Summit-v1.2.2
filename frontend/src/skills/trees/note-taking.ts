/**
 * Note-Taking, a branch of Studying.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const NOTE_TAKING: SubjectTree = {
  id: 'note-taking',
  title: 'Note-Taking',
  blurb: 'Notes you can actually study from.',
  parent: 'study',
  nodes: [
    { id: 'nt.why', name: 'Why Take Notes', icon: 'notes', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Notes help you pay attention now and review later. Writing by hand helps you process, and typing helps you keep up.' },
    { id: 'nt.listen', name: 'Listening for Key Points', icon: 'listening', tier: 'foundation', requires: ['nt.why'], state: lock, percent: 0, xp: 1200,
      desc: 'Catching what the teacher repeats, writes on the board or says will be on the test. Those are your headings.' },
    { id: 'nt.reading', name: 'Notes From Reading', icon: 'reading', tier: 'beginner', requires: ['nt.why'], state: lock, percent: 0, xp: 1600,
      desc: 'Summarizing textbook sections in your own words. Read a section first, then write without looking.' },
    { id: 'nt.shorthand', name: 'Shorthand', icon: 'compress', tier: 'beginner', requires: ['nt.listen'], state: lock, percent: 0, xp: 1700,
      desc: "Symbols and abbreviations you'll still understand later. Make a key and stay consistent." },
    { id: 'nt.cornell', name: 'Cornell Notes', icon: 'layout', tier: 'beginner', core: true, requires: ['nt.listen'], state: lock, percent: 0, xp: 1400,
      desc: 'Notes, a cue column and a summary on one page. The cue column turns your notes into a quiz.' },
    { id: 'nt.outline', name: 'Outline Method', icon: 'outline', tier: 'beginner', requires: ['nt.listen'], state: lock, percent: 0, xp: 1500,
      desc: 'Main ideas with indented details under them. It works great for organized lectures.' },
    { id: 'nt.maps', name: 'Mind Maps & Diagrams', icon: 'concept-map', tier: 'intermediate', requires: ['nt.cornell'], state: lock, percent: 0, xp: 1900,
      desc: 'Drawing the links between ideas. Good for subjects where everything connects to everything else.' },
    { id: 'nt.slides', name: 'Notes From Slides', icon: 'presenting', tier: 'intermediate', requires: ['nt.outline'], state: lock, percent: 0, xp: 2000,
      desc: 'Adding what the teacher says out loud, since slides are only the outline. Copying slides word for word misses most of the lesson.' },
    { id: 'nt.digital', name: 'Digital Notes', icon: 'tablet', tier: 'intermediate', requires: ['nt.shorthand'], state: lock, percent: 0, xp: 1700,
      desc: 'Apps like Notion, OneNote or GoodNotes. Pick one system, give every class a home and keep it organized.' },
    { id: 'nt.math', name: 'Notes for Math & Science', icon: 'equations', tier: 'intermediate', requires: ['nt.cornell'], state: lock, percent: 0, xp: 1800,
      desc: 'Worked examples with every step and the reason for it. Leave space to redo the problems later.' },
    { id: 'nt.organize', name: 'Organizing Notes', icon: 'archive', tier: 'advanced', requires: ['nt.digital', 'nt.maps'], state: lock, percent: 0, xp: 2200,
      desc: "Dates, titles and folders by class. If you can't find a note, it can't help you." },
    { id: 'nt.review', name: 'Same-Day Review', icon: 'reflect', tier: 'advanced', core: true, requires: ['nt.organize'], state: lock, percent: 0, xp: 2300,
      desc: 'Ten minutes the same day to fill the gaps. It makes a huge difference in what you remember a week later.' },
    { id: 'nt.quiz', name: 'Quizzing From Notes', icon: 'retrieval', tier: 'advanced', requires: ['nt.review'], state: lock, percent: 0, xp: 2000,
      desc: 'Covering your notes and recalling the answers. Rereading feels productive, and testing yourself works far better.' },
    { id: 'nt.sheets', name: 'Study Sheets', icon: 'summary', tier: 'expert', requires: ['nt.quiz', 'nt.math', 'nt.slides'], state: lock, percent: 0, xp: 2400,
      desc: 'Shrinking a whole unit onto one page before a test. Making the sheet is the studying.' },
    { id: 'nt.system', name: 'Your Note System', icon: 'system', tier: 'mastery', requires: ['nt.sheets', 'nt.reading'], state: lock, percent: 0, xp: 2800,
      desc: 'A setup that works for every class you take. Tweak it at the start of each semester.' },
  ],
};

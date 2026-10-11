/**
 * Essays, a branch of Writing.
 *
 * The essay as English, history and AP classes grade it: a thesis, evidence,
 * analysis and a clock.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const ESSAYS: SubjectTree = {
  id: 'essays',
  title: 'Essays',
  blurb: 'School essays that make a point and prove it.',
  parent: 'writing',
  nodes: [
    { id: 'ey.prompt', name: 'Reading the Prompt', icon: 'question', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Underlining the task words like analyze, compare and argue. Answering a different question than the one asked is the most common way to lose points.' },
    { id: 'ey.thesis', name: 'A Clear Thesis', icon: 'target', tier: 'foundation', core: true, requires: ['ey.prompt'], state: lock, percent: 0, xp: 1200,
      desc: "One arguable sentence that answers the prompt. If nobody could disagree with it, it's too weak." },
    { id: 'ey.outline', name: 'Outlining', icon: 'outline', tier: 'beginner', requires: ['ey.thesis'], state: lock, percent: 0, xp: 1600,
      desc: 'Topic sentences and evidence planned before you draft. Ten minutes of outlining saves an hour of rewriting.' },
    { id: 'ey.intro', name: 'Introductions', icon: 'opening', tier: 'beginner', requires: ['ey.thesis'], state: lock, percent: 0, xp: 1700,
      desc: 'A hook, some context and your thesis. Skip dictionary definitions and huge vague openers about all of human history.' },
    { id: 'ey.evidence', name: 'Choosing Evidence', icon: 'evidence', tier: 'beginner', core: true, requires: ['ey.outline'], state: lock, percent: 0, xp: 1400,
      desc: 'Quotes, data and examples that really prove your point. A few strong pieces do more than lots of weak ones.' },
    { id: 'ey.paragraphs', name: 'Body Paragraphs', icon: 'paragraph', tier: 'beginner', requires: ['ey.outline'], state: lock, percent: 0, xp: 1500,
      desc: 'Claim, evidence, analysis and a link back to the thesis. Each paragraph does one job.' },
    { id: 'ey.analysis', name: 'Analysis', icon: 'insight', tier: 'intermediate', core: true, requires: ['ey.evidence'], state: lock, percent: 0, xp: 1900,
      desc: 'Explaining how the evidence proves your claim. This is where most of the grade lives.' },
    { id: 'ey.quotes', name: 'Quoting Well', icon: 'citation', tier: 'intermediate', requires: ['ey.evidence'], state: lock, percent: 0, xp: 2000,
      desc: 'Short quotes woven into your own sentences. Always set a quote up before you drop it in.' },
    { id: 'ey.transitions', name: 'Transitions', icon: 'transition', tier: 'intermediate', requires: ['ey.paragraphs'], state: lock, percent: 0, xp: 1700,
      desc: 'Words and sentences that link ideas logically. They show how each point builds on the last.' },
    { id: 'ey.conclusion', name: 'Conclusions', icon: 'summary', tier: 'intermediate', requires: ['ey.paragraphs'], state: lock, percent: 0, xp: 1800,
      desc: 'Showing why your argument matters. Restating the thesis word for word wastes the space.' },
    { id: 'ey.counter', name: 'Counterarguments', icon: 'argument', tier: 'advanced', requires: ['ey.analysis'], state: lock, percent: 0, xp: 2200,
      desc: 'Raising the other side and answering it. Doing this makes your own argument look stronger.' },
    { id: 'ey.cite', name: 'MLA & APA Citations', icon: 'reference', tier: 'advanced', requires: ['ey.quotes'], state: lock, percent: 0, xp: 2300,
      desc: 'In-text citations and a works cited page. Free citation tools help, but double-check what they spit out.' },
    { id: 'ey.timed', name: 'Timed Essays', icon: 'timer', tier: 'advanced', core: true, requires: ['ey.analysis', 'ey.intro'], state: lock, percent: 0, xp: 2000,
      desc: 'Planning, writing and checking in 40 minutes. Spend five minutes planning, even under pressure.' },
    { id: 'ey.rhetoric', name: 'Rhetorical Analysis', icon: 'magnifier', tier: 'expert', requires: ['ey.analysis'], state: lock, percent: 0, xp: 2400,
      desc: "Explaining how an author persuades. Focus on the author's choices and their effects on the reader." },
    { id: 'ey.synthesis', name: 'Synthesis Essays', icon: 'aggregate', tier: 'expert', requires: ['ey.counter', 'ey.cite'], state: lock, percent: 0, xp: 2500,
      desc: 'Combining several sources into one argument of your own. AP Lang loves this one.' },
    { id: 'ey.revise', name: 'Revising Essays', icon: 'revise', tier: 'expert', requires: ['ey.timed', 'ey.transitions', 'ey.conclusion'], state: lock, percent: 0, xp: 2600,
      desc: 'Rereading for argument first, then clarity, then grammar. Reading aloud catches clunky sentences.' },
    { id: 'ey.research', name: 'Research Papers', icon: 'research', tier: 'mastery', requires: ['ey.synthesis', 'ey.revise'], state: lock, percent: 0, xp: 2600,
      desc: 'Longer papers with real sources and a strong question. Manage your notes and citations from the very start.' },
    { id: 'ey.style', name: 'Your Writing Style', icon: 'style', tier: 'mastery', requires: ['ey.revise', 'ey.rhetoric'], state: lock, percent: 0, xp: 2700,
      desc: 'Clear, confident and specific prose. Teachers notice writing that sounds like a real person.' },
  ],
};

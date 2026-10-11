/**
 * Writing — a branch of Language & Writing.
 *
 * Split down the middle: the left of this tree is the craft that every form
 * shares, the right is the forms themselves. Revision gates the long forms on
 * purpose — a writer who has never cut a thousand words cannot finish something
 * that needs ten thousand.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const WRITING: SubjectTree = {
  id: 'writing',
  title: 'Writing',
  blurb: 'Getting the draft out, then making it worth somebody reading.',
  parent: 'language',
  nodes: [
    { id: 'wr.habit', name: 'A Writing Habit', icon: 'habit', tier: 'foundation', core: true, state: open, percent: 20, xp: 1300,
      desc: 'Words on a schedule rather than when inspired. Every professional writer describes the same discovery: the sitting down produces the ideas, not the other way round.' },
    { id: 'wr.draft', name: 'Drafting', icon: 'draft', tier: 'foundation', requires: ['wr.habit'], state: lock, percent: 0, xp: 1400,
      desc: 'Writing badly on purpose to get something to work with. Editing while drafting is the most common way a piece takes four times as long and comes out worse.' },
    { id: 'wr.audience', name: 'Audience & Purpose', icon: 'audience', tier: 'foundation', requires: ['wr.habit'], state: lock, percent: 0, xp: 1400,
      desc: 'Who reads this and what they should be able to do afterwards. Almost every question about tone, length and how much to explain answers itself once those two are written down.' },
    { id: 'wr.outline', name: 'Outlining', icon: 'outline', tier: 'beginner', requires: ['wr.draft'], state: lock, percent: 0, xp: 1500,
      desc: 'Deciding the order before committing sentences to it. Even a five-line outline prevents the commonest structural failure, which is a piece that arrives at its point in the last paragraph.' },
    { id: 'wr.thesis', name: 'The Central Claim', icon: 'thesis', tier: 'beginner', core: true, requires: ['wr.outline', 'wr.audience'], state: lock, percent: 0, xp: 1700,
      desc: 'The one sentence the whole piece is defending. If it cannot be written in one sentence, the piece is not ready to be written, however much research is behind it.' },
    { id: 'wr.opening', name: 'Openings', icon: 'opening', tier: 'beginner', requires: ['wr.thesis'], state: lock, percent: 0, xp: 1500,
      desc: 'Earning the second paragraph. Written last, almost always, because you do not know what you were introducing until the piece exists.' },
    { id: 'wr.flow', name: 'Flow & Transitions', icon: 'flow', tier: 'beginner', requires: ['wr.outline'], state: lock, percent: 0, xp: 1500,
      desc: 'Each paragraph picking up something the last one put down. When writing feels choppy the cause is usually order rather than sentence quality.' },
    { id: 'wr.clarity', name: 'Clarity', icon: 'clarity', tier: 'intermediate', core: true, requires: ['wr.flow'], state: lock, percent: 0, xp: 1800,
      desc: 'Making the subject do the action and putting the important thing at the end of the sentence. Two habits that fix more prose than any amount of vocabulary.' },
    { id: 'wr.concise', name: 'Concision', icon: 'trim', tier: 'intermediate', requires: ['wr.clarity'], state: lock, percent: 0, xp: 1700,
      desc: 'Removing words that are doing nothing. It is a mechanical pass rather than a talent, and it is the fastest visible improvement any writer makes.' },
    { id: 'wr.revise', name: 'Revision', icon: 'revise', tier: 'intermediate', core: true, requires: ['wr.concise'], state: lock, percent: 0, xp: 2000,
      desc: 'Rewriting at the level of structure, not commas. That means being willing to cut a section you like, which is why it is easier a day later than an hour later.' },
    { id: 'wr.feedback', name: 'Taking Feedback', icon: 'feedback', tier: 'intermediate', requires: ['wr.revise'], state: lock, percent: 0, xp: 1800,
      desc: 'Hearing where a reader got lost without arguing that they should not have. Readers are reliable about where the problem is and unreliable about what would fix it.' },
    { id: 'wr.essay', name: 'Essays', icon: 'essay', tier: 'intermediate', requires: ['wr.thesis', 'wr.flow'], state: lock, percent: 0, xp: 1900,
      desc: 'An argument built in public, with the evidence shown. The form rewards conceding the strongest counter-argument early rather than pretending it does not exist.' },
    { id: 'wr.report', name: 'Reports & Documentation', icon: 'report', tier: 'intermediate', requires: ['wr.clarity'], state: lock, percent: 0, xp: 1800,
      desc: 'Writing that people navigate rather than read: headings, summaries and a structure that survives being skimmed. The conclusion goes first, which reverses everything essay writing taught.' },
    { id: 'wr.email', name: 'Professional Writing', icon: 'email', tier: 'intermediate', requires: ['wr.report'], state: lock, percent: 0, xp: 1600,
      desc: 'Emails and messages that get a decision instead of a thread. Ask for one thing, say when it is needed, and put both in the first two lines.' },
    { id: 'wr.story', name: 'Narrative', icon: 'story-arc', tier: 'advanced', requires: ['wr.revise'], state: lock, percent: 0, xp: 2100,
      desc: 'Somebody wanting something and having trouble getting it. Scene by scene, with tension that changes rather than repeats, is most of what makes a story readable.' },
    { id: 'wr.character', name: 'Character & Dialogue', icon: 'character', tier: 'advanced', requires: ['wr.story'], state: lock, percent: 0, xp: 2100,
      desc: 'People who want incompatible things, talking past each other. Dialogue that only exchanges information is the most common thing that makes fiction feel flat.' },
    { id: 'wr.creative', name: 'Description & Image', icon: 'imagery', tier: 'advanced', requires: ['wr.story'], state: lock, percent: 0, xp: 2000,
      desc: 'One precise detail rather than three vague ones. The rule that outlives every workshop is to give the reader something to see and let them supply the adjective.' },
    { id: 'wr.poetry', name: 'Poetry', icon: 'poem', tier: 'advanced', requires: ['wr.creative'], state: lock, percent: 0, xp: 2100,
      desc: 'Compression, line breaks and sound doing work that sentences alone cannot. Reading it aloud is not optional; the ear catches what the eye forgives.' },
    { id: 'wr.long', name: 'Long-Form Projects', icon: 'manuscript', tier: 'expert', requires: ['wr.character', 'wr.essay'], state: lock, percent: 0, xp: 2600,
      desc: 'Holding something together across months, when momentum matters more than any single day. Finishing badly and revising beats stalling in pursuit of a perfect chapter three.' },
    { id: 'wr.voice', name: 'Voice', icon: 'voice-print', tier: 'expert', requires: ['wr.feedback', 'wr.poetry'], state: lock, percent: 0, xp: 2500,
      desc: 'Writing that could not be by anybody else. It comes from imitating deliberately until the imitations stop fitting, rather than from trying to be original at the start.' },
    { id: 'wr.publish', name: 'Publishing', icon: 'publish', tier: 'mastery', requires: ['wr.long', 'wr.voice', 'wr.email'], state: lock, percent: 0, xp: 2900,
      desc: 'Submitting, being rejected, and sending it out again the same week. The manuscript is half the work; the other half is the unglamorous business of putting it in front of people.' },
    { id: 'wr.essays', name: 'Essays (Full Course)', icon: 'essay', tier: 'intermediate', requires: ['wr.essay'], navTo: 'essays', state: lock,
      desc: 'Its own tree: theses, evidence, analysis and timed essays for English, history and AP classes.' },
    { id: 'wr.journal', name: 'Journalism', icon: 'print', tier: 'intermediate', requires: ['wr.clarity'], navTo: 'journalism', state: lock,
      desc: 'Its own tree: interviewing, ledes, news and feature writing, editing and press law.' },
    { id: 'wr.creativex', name: 'Creative Writing', icon: 'story-arc', tier: 'advanced', requires: ['wr.story'], navTo: 'creative-writing', state: lock,
      desc: 'Its own tree: characters, scenes, short stories, workshops and sending your work out.' },
  ],
};

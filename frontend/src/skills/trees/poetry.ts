/**
 * Poetry, a branch of Literature.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const POETRY: SubjectTree = {
  id: 'poetry',
  title: 'Poetry',
  blurb: 'Reading, writing and performing poems.',
  parent: 'literature',
  nodes: [
    { id: 'po.aloud', name: 'Reading Poems Aloud', icon: 'speaking', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Poems are meant to be heard. Read slowly and let yourself pause where the lines break.' },
    { id: 'po.image', name: 'Images', icon: 'imagery', tier: 'foundation', requires: ['po.aloud'], state: lock, percent: 0, xp: 1200,
      desc: 'Pictures made of words that hit the senses. Strong poems show you things and trust you to feel them.' },
    { id: 'po.sound', name: 'Sound & Rhyme', icon: 'sound', tier: 'beginner', requires: ['po.aloud'], state: lock, percent: 0, xp: 1600,
      desc: 'Rhyme, alliteration and assonance. Sound can make a line feel soft, sharp or fast.' },
    { id: 'po.lines', name: 'Line Breaks', icon: 'whitespace', tier: 'beginner', core: true, requires: ['po.aloud'], state: lock, percent: 0, xp: 1700,
      desc: 'Where a line ends changes how it reads. Breaks add pause, surprise and double meanings.' },
    { id: 'po.figures', name: 'Metaphor & Simile', icon: 'insight', tier: 'beginner', requires: ['po.image'], state: lock, percent: 0, xp: 1400,
      desc: 'Comparing two things to show something new about one of them. The best ones are surprising and exact.' },
    { id: 'po.write', name: 'Writing Your Own', icon: 'edit-pen', tier: 'beginner', requires: ['po.image'], state: lock, percent: 0, xp: 1500,
      desc: 'Drafting poems from prompts and memories. Write first and judge later, much later.' },
    { id: 'po.meter', name: 'Meter', icon: 'rhythm', tier: 'intermediate', requires: ['po.sound'], state: lock, percent: 0, xp: 1900,
      desc: 'Patterns of stressed and unstressed syllables. Iambic pentameter is the heartbeat of Shakespeare.' },
    { id: 'po.forms', name: 'Fixed Forms', icon: 'form', tier: 'intermediate', requires: ['po.meter', 'po.lines'], state: lock, percent: 0, xp: 2000,
      desc: "Sonnets, haiku, villanelles and more. Rules can push you to ideas you wouldn't find on your own." },
    { id: 'po.free', name: 'Free Verse', icon: 'spark', tier: 'intermediate', requires: ['po.lines'], state: lock, percent: 0, xp: 1700,
      desc: "Poems without set rhyme or meter. Every choice still counts, since there's no pattern to hide behind." },
    { id: 'po.tone', name: 'Tone & Speaker', icon: 'tone', tier: 'intermediate', requires: ['po.figures'], state: lock, percent: 0, xp: 1800,
      desc: "Who's talking, who they're talking to and how they feel. The speaker isn't always the poet." },
    { id: 'po.analyze', name: 'Analyzing a Poem', icon: 'magnifier', tier: 'advanced', core: true, requires: ['po.tone', 'po.forms'], state: lock, percent: 0, xp: 2200,
      desc: 'Linking techniques to meaning for an essay or an AP question. Every claim needs a quote and an explanation.' },
    { id: 'po.revise', name: 'Revising Poems', icon: 'revise', tier: 'advanced', requires: ['po.write', 'po.free'], state: lock, percent: 0, xp: 2300,
      desc: "Cutting weak words and sharpening images. Read each draft aloud to hear what's off." },
    { id: 'po.spoken', name: 'Spoken Word & Slam', icon: 'microphone', tier: 'advanced', requires: ['po.revise'], state: lock, percent: 0, xp: 2000,
      desc: 'Poems built for the stage and an audience. Performance adds rhythm, pauses and eye contact.' },
    { id: 'po.eras', name: 'Poetry Through Time', icon: 'era', tier: 'expert', requires: ['po.analyze'], state: lock, percent: 0, xp: 2400,
      desc: 'Romantic, modern and contemporary voices. Each era argued with the one before it.' },
    { id: 'po.compare', name: 'Comparing Poems', icon: 'compare', tier: 'expert', requires: ['po.analyze'], state: lock, percent: 0, xp: 2500,
      desc: 'Putting two poems side by side for a timed essay. Find a shared theme, then show how each one handles it.' },
    { id: 'po.chapbook', name: 'A Chapbook', icon: 'book', tier: 'mastery', requires: ['po.spoken', 'po.eras'], state: lock, percent: 0, xp: 2900,
      desc: 'A small collection of your best poems in an order that works. Contests and small presses publish these.' },
    { id: 'po.publish', name: 'Publishing Poems', icon: 'publish', tier: 'mastery', requires: ['po.chapbook', 'po.compare'], state: lock, percent: 0, xp: 2600,
      desc: 'Magazines, contests and student anthologies. Read what a journal publishes before you send it anything.' },
  ],
};

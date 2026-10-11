/**
 * Theater, a branch of Art & Design.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const THEATER: SubjectTree = {
  id: 'theater',
  title: 'Theater',
  blurb: 'Acting, rehearsing and putting on a show.',
  parent: 'art',
  nodes: [
    { id: 'th.games', name: 'Theater Games', icon: 'improvise', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Warm-ups and games that build focus and trust. Being silly with a group is where it all starts.' },
    { id: 'th.voice', name: 'Voice & Projection', icon: 'microphone', tier: 'foundation', requires: ['th.games'], state: lock, percent: 0, xp: 1200,
      desc: 'Being heard in the back row without yelling. Breathe from your belly and aim your voice at the back wall.' },
    { id: 'th.body', name: 'Movement & Body', icon: 'gesture', tier: 'beginner', requires: ['th.games'], state: lock, percent: 0, xp: 1600,
      desc: 'Using posture and gesture to show who your character is. Your body speaks before you say a word.' },
    { id: 'th.improv', name: 'Improv', icon: 'spark', tier: 'beginner', requires: ['th.games'], state: lock, percent: 0, xp: 1700,
      desc: 'Saying yes, and, building scenes and staying present. Great for confidence and for thinking on your feet.' },
    { id: 'th.script', name: 'Script Analysis', icon: 'source-doc', tier: 'beginner', core: true, requires: ['th.voice'], state: lock, percent: 0, xp: 1400,
      desc: 'Finding what your character wants in each scene. Read the whole play before you start on your lines.' },
    { id: 'th.lines', name: 'Memorizing Lines', icon: 'memory', tier: 'beginner', requires: ['th.script'], state: lock, percent: 0, xp: 1500,
      desc: 'Chunking, running lines with a partner and learning your cues. Know your cues as well as your lines.' },
    { id: 'th.objective', name: 'Objectives & Tactics', icon: 'target', tier: 'intermediate', core: true, requires: ['th.script', 'th.body'], state: lock, percent: 0, xp: 1900,
      desc: 'What your character wants and how they try to get it. Play the action and the emotion will follow.' },
    { id: 'th.blocking', name: 'Blocking', icon: 'grid', tier: 'intermediate', requires: ['th.lines'], state: lock, percent: 0, xp: 2000,
      desc: 'Where you move on stage and when. Write it in your script in pencil, since it will change.' },
    { id: 'th.listen', name: 'Listening on Stage', icon: 'listening', tier: 'intermediate', requires: ['th.objective'], state: lock, percent: 0, xp: 1700,
      desc: 'Reacting to your scene partner for real, every night. Most good acting is really good reacting.' },
    { id: 'th.character', name: 'Building a Character', icon: 'character', tier: 'advanced', requires: ['th.listen'], state: lock, percent: 0, xp: 2100,
      desc: 'Backstory, voice and physical choices. Steal small details from real people you know.' },
    { id: 'th.auditions', name: 'Auditions', icon: 'audience', tier: 'advanced', requires: ['th.character'], state: lock, percent: 0, xp: 2200,
      desc: 'Monologues, cold reads and callbacks. Pick a monologue close to your age that shows your range.' },
    { id: 'th.musical', name: 'Musical Theater', icon: 'harmony-voices', tier: 'advanced', requires: ['th.voice', 'th.blocking'], state: lock, percent: 0, xp: 2300,
      desc: 'Acting through a song and surviving dance calls. Treat every song as a scene with music under it.' },
    { id: 'th.tech', name: 'Tech Theater', icon: 'lighting', tier: 'advanced', requires: ['th.blocking'], state: lock, percent: 0, xp: 2000,
      desc: "Lights, sound, sets and stage managing. Shows don't happen without a great crew." },
    { id: 'th.shakespeare', name: 'Shakespeare', icon: 'manuscript', tier: 'expert', requires: ['th.character'], state: lock, percent: 0, xp: 2400,
      desc: 'Verse, meaning and speaking it so people understand. Put every line in your own words first.' },
    { id: 'th.rehearsal', name: 'The Rehearsal Process', icon: 'calendar-block', tier: 'expert', requires: ['th.auditions', 'th.tech'], state: lock, percent: 0, xp: 2500,
      desc: 'Everything from the first read-through to tech week. Show up prepared to every single rehearsal.' },
    { id: 'th.perform', name: 'Performing', icon: 'theatre', tier: 'expert', core: true, requires: ['th.rehearsal', 'th.musical', 'th.improv'], state: lock, percent: 0, xp: 2600,
      desc: 'Keeping your energy up and handling mistakes live. Whatever happens, keep the scene going.' },
    { id: 'th.direct', name: 'Directing', icon: 'directing', tier: 'mastery', requires: ['th.perform', 'th.shakespeare'], state: lock, percent: 0, xp: 2600,
      desc: 'Leading a scene or a one-act play. Directors see the whole picture and help actors find it too.' },
  ],
};

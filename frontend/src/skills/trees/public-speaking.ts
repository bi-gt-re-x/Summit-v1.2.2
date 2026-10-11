/**
 * Public Speaking, a branch of Language & Writing.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const PUBLIC_SPEAKING: SubjectTree = {
  id: 'public-speaking',
  title: 'Public Speaking',
  blurb: 'Talking in front of people without wanting to vanish.',
  parent: 'language',
  nodes: [
    { id: 'ps.nerves', name: 'Handling Nerves', icon: 'calm', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'Everyone gets nervous. Slow breathing and lots of practice turn panic into energy.' },
    { id: 'ps.voice', name: 'Voice & Volume', icon: 'microphone', tier: 'foundation', requires: ['ps.nerves'], state: lock, percent: 0, xp: 1200,
      desc: 'Speaking loud enough for the back row and slowing down. Most nervous speakers talk way too fast.' },
    { id: 'ps.structure', name: 'Structuring a Speech', icon: 'outline', tier: 'beginner', core: true, requires: ['ps.nerves'], state: lock, percent: 0, xp: 1600,
      desc: 'An opening, three main points and a close. Tell them what you will say, say it, then sum it up.' },
    { id: 'ps.body', name: 'Body Language', icon: 'posture', tier: 'beginner', requires: ['ps.voice'], state: lock, percent: 0, xp: 1700,
      desc: 'Standing tall, using your hands and keeping your feet still. Your body should match your words.' },
    { id: 'ps.eyes', name: 'Eye Contact', icon: 'vision', tier: 'beginner', requires: ['ps.body'], state: lock, percent: 0, xp: 1400,
      desc: 'Looking at real people, one at a time. It feels like a conversation instead of a speech.' },
    { id: 'ps.cards', name: 'Notes & Cue Cards', icon: 'notes', tier: 'beginner', requires: ['ps.structure'], state: lock, percent: 0, xp: 1500,
      desc: 'Short keywords instead of a full script. Reading word for word kills your connection with the room.' },
    { id: 'ps.hook', name: 'Strong Openings', icon: 'opening', tier: 'intermediate', requires: ['ps.structure'], state: lock, percent: 0, xp: 1900,
      desc: 'A story, a question or a surprising fact. You have about thirty seconds to grab people.' },
    { id: 'ps.slides', name: 'Slides That Help', icon: 'presenting', tier: 'intermediate', requires: ['ps.structure'], state: lock, percent: 0, xp: 2000,
      desc: 'Big images, few words and one idea per slide. Your slides should back you up and stay out of the way.' },
    { id: 'ps.stories', name: 'Telling Stories', icon: 'story-arc', tier: 'intermediate', requires: ['ps.hook'], state: lock, percent: 0, xp: 1700,
      desc: 'Short, specific stories make points stick. People remember stories long after they forget facts.' },
    { id: 'ps.rehearse', name: 'Rehearsing', icon: 'practice', tier: 'intermediate', core: true, requires: ['ps.cards', 'ps.eyes'], state: lock, percent: 0, xp: 1800,
      desc: 'Practicing out loud, standing up and timing yourself. Record yourself once and watch it back.' },
    { id: 'ps.persuade', name: 'Persuasive Speaking', icon: 'argument', tier: 'advanced', requires: ['ps.stories'], state: lock, percent: 0, xp: 2200,
      desc: 'Using logic, emotion and credibility to move people. Know exactly what you want the audience to do.' },
    { id: 'ps.impromptu', name: 'Impromptu Speaking', icon: 'improvise', tier: 'advanced', requires: ['ps.rehearse'], state: lock, percent: 0, xp: 2300,
      desc: 'Speaking with little prep time. A quick structure like point, reason, example saves you.' },
    { id: 'ps.qa', name: 'Handling Q&A', icon: 'question', tier: 'advanced', requires: ['ps.impromptu'], state: lock, percent: 0, xp: 2000,
      desc: "Listening fully, pausing and answering briefly. It's fine to say you'll find out and get back to them." },
    { id: 'ps.class', name: 'Class Presentations', icon: 'audience', tier: 'advanced', requires: ['ps.slides', 'ps.rehearse'], state: lock, percent: 0, xp: 2100,
      desc: 'Hitting the rubric and the time limit, and sharing the stage in group talks. Plan the handoffs between speakers.' },
    { id: 'ps.video', name: 'Speaking on Video', icon: 'camera', tier: 'expert', requires: ['ps.class'], state: lock, percent: 0, xp: 2500,
      desc: 'Looking at the camera, decent lighting and clear audio. Your energy needs to be a little bigger on screen.' },
    { id: 'ps.contests', name: 'Speech Contests', icon: 'trophy', tier: 'expert', requires: ['ps.persuade', 'ps.qa'], state: lock, percent: 0, xp: 2600,
      desc: 'Oratory, extemp and declamation events. Judges reward clear structure and real presence.' },
    { id: 'ps.talk', name: "A Talk You're Proud Of", icon: 'star', tier: 'mastery', requires: ['ps.contests', 'ps.video'], state: lock, percent: 0, xp: 2600,
      desc: 'One polished talk on something you care about. TEDx youth events and school assemblies are great stages.' },
  ],
};

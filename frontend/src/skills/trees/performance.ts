/**
 * Performance & Auditions — a branch of Music.
 *
 * What happens between knowing a piece and playing it once, correctly, in
 * front of people who are deciding something about you. The instrument trees
 * beside this one — Piano, Guitar, Voice — teach the playing; this teaches the
 * once.
 *
 * ## It is a separate subject, and treating it as one is the point
 *
 * The most common story in competitive music is a player whose practice-room
 * standard is a full grade above their stage standard, and who responds by
 * practicing the notes more. That does not touch the gap, because the gap is
 * not in the notes: it is memory under adrenaline, recovery from a slip
 * without stopping, and having rehearsed the walk-on. Those are trainable, and
 * they are what this lattice is made of.
 *
 * ## Recording is the hinge node
 *
 * Everything downstream of `pf.record` depends on being able to hear yourself
 * as an audience does, which nobody can do while playing. It is the cheapest
 * intervention on this tree and the one most consistently skipped, so it sits
 * where the branch to criticism, interpretation and the stage begins.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const PERFORMANCE: SubjectTree = {
  id: 'performance',
  title: 'Performance & Auditions',
  blurb: 'Recitals, juries and competitions — playing it once, in front of people.',
  parent: 'music',
  nodes: [
    { id: 'pf.posture', name: 'Posture & Setup', icon: 'posture', tier: 'foundation', core: true, state: open, percent: 15, xp: 1200,
      desc: 'How you sit or stand, where the instrument is, and what is carrying the weight. It decides what is physically possible before technique gets a say, and it is the usual cause of an injury that ends a season.' },
    { id: 'pf.warmup', name: 'Warm-Up Routine', icon: 'warmup', tier: 'foundation', requires: ['pf.posture'], state: lock, percent: 0, xp: 1300,
      desc: 'The same ten minutes every time, so that the body arrives at the piece already working. On a competition day it doubles as a familiar thing to do in an unfamiliar building, which is most of its value.' },
    { id: 'pf.practice', name: 'Deliberate Practice', icon: 'practice', tier: 'foundation', core: true, requires: ['pf.posture'], state: lock, percent: 0, xp: 1500,
      desc: 'Isolating the bar that fails, slowing it until it never fails, and only then speeding it up. Playing a piece through from the top is performing, not practicing, and an hour of it improves almost nothing.' },
    { id: 'pf.tone', name: 'Tone Production', icon: 'tone', tier: 'beginner', requires: ['pf.warmup'], state: lock, percent: 0, xp: 1500,
      desc: 'The sound itself, before any of the notes are interesting. It is the first thing a panel hears and the thing they can judge in four seconds, which is roughly how long they take to form an impression.' },
    { id: 'pf.tempo', name: 'Working with a Metronome', icon: 'metronome', tier: 'beginner', core: true, requires: ['pf.practice'], state: lock, percent: 0, xp: 1400,
      desc: 'Finding out where you actually rush, which is never where you think. The hard passage is usually played too slowly and the easy bar after it too fast, and only an external pulse will tell you so.' },
    { id: 'pf.sight', name: 'Sight-Reading', icon: 'sight-read', tier: 'beginner', requires: ['pf.practice'], state: lock, percent: 0, xp: 1600,
      desc: 'Playing something in front of you for the first time without stopping. Examined directly in most auditions, and improved only by reading new material daily rather than by getting better at your pieces.' },
    { id: 'pf.ear', name: 'Ear Training', icon: 'ear-training', tier: 'beginner', requires: ['pf.practice'], state: lock, percent: 0, xp: 1600,
      desc: 'Hearing an interval, a chord or a wrong note and knowing what it was. It is what lets you correct pitch mid-phrase instead of finding out afterwards from a recording.' },
    { id: 'pf.memory', name: 'Memorisation', icon: 'memory', tier: 'intermediate', core: true, requires: ['pf.practice'], state: lock, percent: 0, xp: 1800,
      desc: 'Four memories, not one — muscular, aural, visual and structural — because adrenaline takes the muscular one first. A performer who can only start from the top has one memory and no way back in.' },
    { id: 'pf.phrase', name: 'Phrasing', icon: 'phrase', tier: 'intermediate', requires: ['pf.tone', 'pf.tempo'], state: lock, percent: 0, xp: 1800,
      desc: 'Deciding where a line is going and shaping it so a listener can hear the destination. Correct notes with no phrasing is the most common thing a jury describes as technically fine and unmemorable.' },
    { id: 'pf.ensemble', name: 'Ensemble Playing', icon: 'accompany', tier: 'intermediate', requires: ['pf.tempo', 'pf.ear'], state: lock, percent: 0, xp: 1800,
      desc: 'Listening across while playing, and following a breath rather than a count. Playing with an accompanist for the first time in the audition itself is the avoidable disaster this node exists to prevent.' },
    { id: 'pf.rep', name: 'Building Repertoire', icon: 'songbook', tier: 'intermediate', core: true, requires: ['pf.sight', 'pf.memory'], state: lock, percent: 0, xp: 1900,
      desc: 'A set of pieces at performance standard, kept there, covering the periods a syllabus asks for. Learning a program from scratch for each competition is why players plateau — nothing ever gets past merely secure.' },
    { id: 'pf.record', name: 'Recording Yourself', icon: 'record', tier: 'intermediate', core: true, requires: ['pf.phrase'], state: lock, percent: 0, xp: 1700,
      desc: 'Hearing what an audience hears, which is impossible while playing. It is uncomfortable, it takes ten minutes, and it is the single highest-yield thing on this tree — every branch above depends on it.' },
    { id: 'pf.dynamics', name: 'Dynamics & Contrast', icon: 'dynamics', tier: 'advanced', requires: ['pf.phrase'], state: lock, percent: 0, xp: 2000,
      desc: 'Real range rather than three shades of medium, and the discipline of saving the loudest for where it means something. A recording is usually what reveals that your forte and piano are a great deal closer than intended.' },
    { id: 'pf.nerves', name: 'Performance Nerves', icon: 'stress', tier: 'advanced', core: true, requires: ['pf.memory', 'pf.record'], state: lock, percent: 0, xp: 2200,
      desc: 'Rehearsing the conditions, not just the piece — playing it cold, first thing, to one person, without a warm-up. Adrenaline cannot be removed, so the training is making the performance survivable while it is present.' },
    { id: 'pf.critique', name: 'Taking Criticism', icon: 'critique', tier: 'advanced', requires: ['pf.record'], state: lock, percent: 0, xp: 2000,
      desc: 'Separating what a teacher or panel actually said from how it felt to hear it, and turning it into a practice plan by the next day. Feedback that is agreed with and not acted on is the same as feedback nobody gave.' },
    { id: 'pf.recital', name: 'The Recital', icon: 'audience', tier: 'advanced', requires: ['pf.nerves', 'pf.rep'], state: lock, percent: 0, xp: 2300,
      desc: 'A program, in order, without stopping, in front of people who came to listen. Recovering from a slip inaudibly is worth more here than any single difficult passage, because the audience only notices the stopping.' },
    { id: 'pf.interp', name: 'Interpretation', icon: 'style', tier: 'expert', requires: ['pf.dynamics', 'pf.critique'], state: lock, percent: 0, xp: 2600,
      desc: 'Having a defensible reason for every choice — tempo, rubato, voicing — grounded in the period and the score rather than in habit. At this level a panel is choosing between players who all have the notes.' },
    { id: 'pf.audition', name: 'Auditions', icon: 'scrutiny', tier: 'expert', core: true, requires: ['pf.recital', 'pf.critique'], state: lock, percent: 0, xp: 2600,
      desc: 'Two minutes, possibly behind a screen, possibly stopped partway through. Choosing an excerpt that shows what you do well, and opening in a way that survives the first four seconds, is a strategy problem rather than a musical one.' },
    { id: 'pf.competition', name: 'The Competition Stage', icon: 'trophy', tier: 'mastery', requires: ['pf.audition', 'pf.interp', 'pf.ensemble'], state: lock, percent: 0, xp: 3200,
      desc: 'Rounds, an unfamiliar instrument, a jury with a rubric, and one attempt. Everything below converges here because the stage tests preparation, memory, nerve and interpretation at the same time and gives no second run.' },
  ],
};

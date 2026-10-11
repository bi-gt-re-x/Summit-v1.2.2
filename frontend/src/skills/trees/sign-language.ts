/**
 * Sign Language, a branch of Foreign Languages.
 *
 * American Sign Language. A visual language with its own grammar, so the face,
 * the space and the hands each get their own nodes.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const SIGN_LANGUAGE: SubjectTree = {
  id: 'sign-language',
  title: 'Sign Language',
  blurb: 'ASL from fingerspelling to real conversations.',
  parent: 'foreign-language',
  nodes: [
    { id: 'sl.fingers', name: 'Fingerspelling', icon: 'alphabet', tier: 'foundation', core: true, state: open, percent: 0, xp: 1100,
      desc: 'The handshape for each letter. Practice reading it too, which is way harder than signing it.' },
    { id: 'sl.numbers', name: 'Numbers', icon: 'counting', tier: 'foundation', requires: ['sl.fingers'], state: lock, percent: 0, xp: 1200,
      desc: 'Counting, ages, time and money each have their own rules. Palm direction can change the meaning.' },
    { id: 'sl.parts', name: 'Parts of a Sign', icon: 'hands', tier: 'beginner', core: true, requires: ['sl.fingers'], state: lock, percent: 0, xp: 1600,
      desc: 'Handshape, location, movement, palm direction and facial expression. Change one and you can change the word.' },
    { id: 'sl.everyday', name: 'Everyday Signs', icon: 'vocabulary', tier: 'beginner', requires: ['sl.parts'], state: lock, percent: 0, xp: 1700,
      desc: "Greetings, family, school and feelings. These are the signs you'll use in your first real conversations." },
    { id: 'sl.face', name: 'Facial Grammar', icon: 'emotion', tier: 'beginner', core: true, requires: ['sl.parts'], state: lock, percent: 0, xp: 1400,
      desc: 'Eyebrows and mouth shapes are part of the grammar. Raised brows mark a yes-or-no question.' },
    { id: 'sl.culture', name: 'Deaf Culture', icon: 'culture', tier: 'beginner', requires: ['sl.everyday'], state: lock, percent: 0, xp: 1500,
      desc: 'Deaf community values, history and etiquette. Getting attention with a wave or a tap is normal and polite.' },
    { id: 'sl.questions', name: 'Asking Questions', icon: 'question', tier: 'intermediate', requires: ['sl.face'], state: lock, percent: 0, xp: 1900,
      desc: 'WH-questions with lowered brows and yes-no questions with raised ones. The face does the work that word order does in English.' },
    { id: 'sl.space', name: 'Using Space', icon: 'layout', tier: 'intermediate', requires: ['sl.everyday'], state: lock, percent: 0, xp: 2000,
      desc: "Placing people and things in the space around you and pointing back to them. It's how ASL keeps track of who's who." },
    { id: 'sl.time', name: 'Time & Tense', icon: 'timeline', tier: 'intermediate', requires: ['sl.everyday'], state: lock, percent: 0, xp: 1700,
      desc: 'ASL sets the time at the start of a sentence instead of on every verb. Past sits behind you and the future sits ahead.' },
    { id: 'sl.verbs', name: 'Directional Verbs', icon: 'path-route', tier: 'intermediate', requires: ['sl.space'], state: lock, percent: 0, xp: 1800,
      desc: "Verbs that move between people to show who's doing what to whom. Give and help work this way." },
    { id: 'sl.bignumbers', name: 'Number Systems', icon: 'arithmetic', tier: 'advanced', requires: ['sl.numbers'], state: lock, percent: 0, xp: 2200,
      desc: 'Numbers built right into signs for time, age and money. Three weeks and five years each pack the number into one sign.' },
    { id: 'sl.classifiers', name: 'Classifiers', icon: 'shapes', tier: 'advanced', core: true, requires: ['sl.verbs'], state: lock, percent: 0, xp: 2300,
      desc: 'Handshapes that stand for kinds of objects and show how they move. They make descriptions vivid.' },
    { id: 'sl.receptive', name: 'Understanding Signers', icon: 'observe', tier: 'advanced', requires: ['sl.questions', 'sl.space'], state: lock, percent: 0, xp: 2000,
      desc: 'Watching the face and the whole picture at once. Watch Deaf creators and native signers on video every week.' },
    { id: 'sl.convo', name: 'Conversations', icon: 'conversation', tier: 'advanced', requires: ['sl.receptive', 'sl.time'], state: lock, percent: 0, xp: 2100,
      desc: "Taking turns, checking understanding and keeping eye contact. Looking away can mean you've stopped listening." },
    { id: 'sl.story', name: 'Storytelling', icon: 'story-arc', tier: 'expert', requires: ['sl.classifiers', 'sl.convo'], state: lock, percent: 0, xp: 2500,
      desc: 'Role shifting and classifiers bring a story to life. ASL storytelling is an art form of its own.' },
    { id: 'sl.interpret', name: 'Intro to Interpreting', icon: 'translate', tier: 'expert', requires: ['sl.story'], state: lock, percent: 0, xp: 2600,
      desc: 'What interpreters do and how hard it is. Fluency takes years, and certification takes more.' },
    { id: 'sl.fluency', name: 'Fluency & Community', icon: 'friends', tier: 'mastery', requires: ['sl.interpret', 'sl.bignumbers', 'sl.culture'], state: lock, percent: 0, xp: 2600,
      desc: 'Signing comfortably with Deaf people in real settings. Community events teach more than any class can.' },
  ],
};

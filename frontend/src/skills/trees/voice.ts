/**
 * Singing — a branch of Music.
 *
 * Breath is the root and stays the root: nearly every problem further down this
 * tree, from a wobbling pitch to a voice that gives out after twenty minutes, is
 * a breath problem that has learned to look like something else.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const VOICE: SubjectTree = {
  id: 'voice',
  title: 'Singing',
  blurb: 'Breath, pitch and the instrument you cannot see or put down.',
  parent: 'music',
  nodes: [
    { id: 'vo.breath', name: 'Breath Support', icon: 'breath', tier: 'foundation', core: true, state: open, percent: 25, xp: 1300,
      desc: 'Low, quiet breathing and a steady controlled release. It is the engine of the whole instrument, and the fix for more vocal problems than any technique that sounds more interesting.' },
    { id: 'vo.posture', name: 'Posture & Alignment', icon: 'posture', tier: 'foundation', requires: ['vo.breath'], state: lock, percent: 0, xp: 1100,
      desc: 'A tall spine, a loose jaw and a neck that is not doing any lifting. The throat is a tube, and anything that kinks it changes the sound before any technique gets a chance to.' },
    { id: 'vo.warmup', name: 'Warming Up', icon: 'warmup', tier: 'foundation', requires: ['vo.posture'], state: lock, percent: 0, xp: 1100,
      desc: 'Gentle sirens and lip trills that get blood into the folds before demanding anything. Ten minutes beforehand costs less than the two days off that skipping it eventually buys.' },
    { id: 'vo.pitch', name: 'Pitch Matching', icon: 'pitch', tier: 'foundation', core: true, requires: ['vo.warmup'], state: lock, percent: 0, xp: 1500,
      desc: 'Hearing a note and producing that note. Almost nobody is truly tone deaf; most people who believe they are have never been taught to hear the gap and adjust.' },
    { id: 'vo.range', name: 'Finding Your Range', icon: 'range', tier: 'beginner', requires: ['vo.pitch'], state: lock, percent: 0, xp: 1400,
      desc: 'The notes available comfortably today, which is not the same as the notes you can reach once. Choosing songs inside it is the fastest improvement most singers ever make.' },
    { id: 'vo.tone', name: 'Tone & Resonance', icon: 'resonance', tier: 'beginner', requires: ['vo.range'], state: lock, percent: 0, xp: 1700,
      desc: 'Where the sound vibrates once it has left the folds, and how much of it comes out. Volume comes from resonance rather than effort, which is exactly backwards from how it feels.' },
    { id: 'vo.vowels', name: 'Vowels & Diction', icon: 'vowel', tier: 'beginner', requires: ['vo.tone'], state: lock, percent: 0, xp: 1600,
      desc: 'Shaping vowels consistently and getting consonants out of the way of them. Sung text lives on the vowels, and words become unintelligible when consonants are late rather than when they are quiet.' },
    { id: 'vo.registers', name: 'Registers', icon: 'registers', tier: 'intermediate', core: true, requires: ['vo.tone'], state: lock, percent: 0, xp: 1900,
      desc: 'Chest, head and the mixed sound between them. The break is where the folds change how they vibrate, and smoothing it is a matter of practice at the crossing rather than avoiding it.' },
    { id: 'vo.support', name: 'Sustain & Control', icon: 'sustain', tier: 'intermediate', requires: ['vo.registers', 'vo.breath'], state: lock, percent: 0, xp: 1800,
      desc: 'Holding a note steady at any volume, and ending it deliberately. A note that sags in pitch as it fades is a breath running out, not an ear failing.' },
    { id: 'vo.dynamics', name: 'Dynamics', icon: 'dynamics', tier: 'intermediate', requires: ['vo.support'], state: lock, percent: 0, xp: 1800,
      desc: 'Singing really quietly without going breathy, and loudly without pushing. The quiet end is the harder one and the one that makes the loud end mean anything.' },
    { id: 'vo.rhythm', name: 'Rhythm & Timing', icon: 'rhythm', tier: 'intermediate', requires: ['vo.vowels'], state: lock, percent: 0, xp: 1700,
      desc: 'Landing exactly where the beat is, including when the phrase starts before it. Singers drift more than instrumentalists because breath takes time and nobody plans for it.' },
    { id: 'vo.ear', name: 'Ear Training for Singers', icon: 'ear-training', tier: 'advanced', requires: ['vo.pitch', 'vo.rhythm'], state: lock, percent: 0, xp: 2100,
      desc: 'Hearing an interval and singing it cold, without an instrument. This is what lets you hold a part when everything around you is doing something else.' },
    { id: 'vo.harmony', name: 'Harmony Singing', icon: 'harmony-voices', tier: 'advanced', requires: ['vo.ear'], state: lock, percent: 0, xp: 2200,
      desc: 'Holding a line a third or a fifth away from the tune while hearing both. The hard part is not finding the note, it is not being pulled onto the melody by the person beside you.' },
    { id: 'vo.agility', name: 'Agility & Runs', icon: 'agility', tier: 'advanced', requires: ['vo.dynamics'], state: lock, percent: 0, xp: 2100,
      desc: 'Moving quickly and cleanly between notes so each one is actually there. Built slowly with a metronome, exactly like an instrumental passage, and audibly faked when it is not.' },
    { id: 'vo.belt', name: 'Belting Safely', icon: 'belt', tier: 'advanced', requires: ['vo.registers', 'vo.dynamics'], state: lock, percent: 0, xp: 2300,
      desc: 'Carrying a strong sound high without shouting. It relies entirely on support and a mixed register, and doing it wrong is the fastest way to injure a voice.' },
    { id: 'vo.health', name: 'Vocal Health', icon: 'vocal-health', tier: 'advanced', core: true, requires: ['vo.belt'], state: lock, percent: 0, xp: 2000,
      desc: 'Hydration, sleep, silence after heavy use, and knowing what hoarseness means. The instrument is tissue and it does not care about the schedule you have committed to.' },
    { id: 'vo.style', name: 'Style & Interpretation', icon: 'style', tier: 'expert', requires: ['vo.agility', 'vo.harmony'], state: lock, percent: 0, xp: 2400,
      desc: 'Deciding what the song is about and letting that choose the phrasing, weight and where you sit against the beat. Two technically identical performances differ entirely here.' },
    { id: 'vo.mic', name: 'Microphone Technique', icon: 'microphone', tier: 'expert', requires: ['vo.dynamics'], state: lock, percent: 0, xp: 2100,
      desc: 'Distance and angle as a volume control, and pulling back on the loud notes. A microphone rewards restraint, and singing at it as though it were a room throws away everything it offered.' },
    { id: 'vo.stage', name: 'Performing', icon: 'trophy', tier: 'expert', requires: ['vo.style', 'vo.mic', 'vo.health'], state: lock, percent: 0, xp: 2600,
      desc: 'Singing to people with adrenaline running, which shortens breath and sharpens pitch. Preparation is the answer: rehearse in the state you will be in, not only in the state you like.' },
    { id: 'vo.record', name: 'Recording Vocals', icon: 'record', tier: 'mastery', requires: ['vo.stage'], state: lock, percent: 0, xp: 2800,
      desc: 'Performing to a microphone in a silent room, in pieces, with no audience to lift it. Comping several takes into one is normal practice, and the skill is keeping the result sounding like one performance.' },
  ],
};

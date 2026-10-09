/**
 * Music Production — a branch of Music.
 *
 * Arrangement gates mixing here, which is the opposite of the order most people
 * learn in. A mix cannot rescue a part that should not be there, and the hours
 * lost to that lesson are the reason it is drawn as a prerequisite rather than
 * as advice.
 */
import type { SubjectTree } from './types';
import { open, lock } from './types';

export const PRODUCTION: SubjectTree = {
  id: 'production',
  title: 'Music Production',
  blurb: 'Turning parts into a record — arrangement, sound, and the mix last.',
  parent: 'music',
  nodes: [
    { id: 'pr.daw', name: 'The DAW', icon: 'daw', tier: 'foundation', core: true, state: open, percent: 20, xp: 1300,
      desc: 'The software everything happens in: tracks, a timeline, transport and a mixer. Learning the shortcuts of one program properly beats trying three, because fluency is what keeps an idea alive.' },
    { id: 'pr.audio', name: 'How Audio Works', icon: 'waveform', tier: 'foundation', requires: ['pr.daw'], state: lock, percent: 0, xp: 1400,
      desc: 'Sample rate, bit depth, and what a waveform on screen actually represents. Knowing why digital audio clips hard rather than gracefully explains most of the rules that follow.' },
    { id: 'pr.midi', name: 'MIDI', icon: 'midi', tier: 'foundation', requires: ['pr.daw'], state: lock, percent: 0, xp: 1300,
      desc: 'Notes as instructions rather than sound: pitch, timing, length and how hard. It is infinitely editable, which is why an idea gets written in MIDI and committed to audio later.' },
    { id: 'pr.grid', name: 'Tempo & Grid', icon: 'grid-time', tier: 'foundation', requires: ['pr.midi'], state: lock, percent: 0, xp: 1300,
      desc: 'Setting a tempo and placing everything against the bar. Quantizing fixes timing and flattens feel at the same time, so how much to apply is a musical decision rather than a technical one.' },
    { id: 'pr.drums', name: 'Programming Drums', icon: 'drum-machine', tier: 'beginner', core: true, requires: ['pr.grid'], state: lock, percent: 0, xp: 1700,
      desc: 'Kick, snare and hats laid out to carry a groove. Velocity and small timing shifts are what stop a pattern sounding like a machine, and they matter more than the choice of samples.' },
    { id: 'pr.bass', name: 'Bass & Low End', icon: 'bass', tier: 'beginner', requires: ['pr.drums'], state: lock, percent: 0, xp: 1700,
      desc: 'The part that ties rhythm to harmony, and the region where a mix most easily turns to mud. Getting kick and bass to share the space is the first real mixing decision anybody faces.' },
    { id: 'pr.chords', name: 'Chords & Melody', icon: 'chords', tier: 'beginner', requires: ['pr.midi'], state: lock, percent: 0, xp: 1700,
      desc: 'Writing the harmonic bed and the line that sits on top of it. A strong four-chord loop with one good melody beats a clever progression nobody can hum.' },
    { id: 'pr.sound', name: 'Sound Selection', icon: 'sound-bank', tier: 'beginner', requires: ['pr.chords'], state: lock, percent: 0, xp: 1600,
      desc: 'Choosing sounds that leave room for each other. Half of what people try to fix with equalization is a choice of two sounds that occupy exactly the same territory.' },
    { id: 'pr.synth', name: 'Synthesis', icon: 'synth', tier: 'intermediate', requires: ['pr.sound'], state: lock, percent: 0, xp: 2000,
      desc: 'Building a sound from oscillators, a filter and an envelope. Learning subtractive synthesis once makes every preset readable and every plugin less mysterious.' },
    { id: 'pr.sampling', name: 'Sampling', icon: 'sampler', tier: 'intermediate', requires: ['pr.sound'], state: lock, percent: 0, xp: 1900,
      desc: 'Taking recorded audio and playing it as an instrument — chopped, stretched, reversed. The technical part is easy; clearing what you sample from a record is the part that ends projects.' },
    { id: 'pr.record', name: 'Recording', icon: 'microphone', tier: 'intermediate', requires: ['pr.audio'], state: lock, percent: 0, xp: 1900,
      desc: 'Getting a real performance in cleanly: gain staging, microphone placement and a room that is not fighting you. Everything gained here is free, and everything lost here is permanent.' },
    { id: 'pr.edit', name: 'Editing', icon: 'audio-edit', tier: 'intermediate', requires: ['pr.record'], state: lock, percent: 0, xp: 1800,
      desc: 'Comping takes, trimming, crossfading and tightening timing. Invisible when done well, and the difference between a demo and something that holds attention for three minutes.' },
    { id: 'pr.arrange', name: 'Arrangement', icon: 'arrangement', tier: 'advanced', core: true, requires: ['pr.bass', 'pr.chords'], state: lock, percent: 0, xp: 2300,
      desc: 'Deciding what happens when, and what drops out so the next section can arrive. Most tracks that feel flat are arrangement problems that no amount of mixing will touch.' },
    { id: 'pr.eq', name: 'Equalization', icon: 'eq', tier: 'advanced', requires: ['pr.arrange'], state: lock, percent: 0, xp: 2100,
      desc: 'Turning frequency ranges up and down so parts stop competing. Cutting what is not needed goes further than boosting what you want, and both are done in the context of the whole mix.' },
    { id: 'pr.comp', name: 'Compression', icon: 'compressor', tier: 'advanced', requires: ['pr.eq'], state: lock, percent: 0, xp: 2200,
      desc: 'Automatic volume control: threshold, ratio, attack and release. The attack setting is what decides whether a snare keeps its crack, and it is the control most people ignore.' },
    { id: 'pr.space', name: 'Reverb & Delay', icon: 'reverb', tier: 'advanced', requires: ['pr.comp'], state: lock, percent: 0, xp: 2000,
      desc: 'Putting sounds in a room and at a distance. Predelay and how much low end the effect keeps decide whether a mix sounds spacious or washed out.' },
    { id: 'pr.mix', name: 'Mixing', icon: 'mixer', tier: 'expert', core: true, requires: ['pr.space'], state: lock, percent: 0, xp: 2600,
      desc: 'Balance, panning and depth so every part is audible and the important one is in front. Start with faders alone; if it does not work there, no plugin is going to rescue it.' },
    { id: 'pr.automate', name: 'Automation', icon: 'automation', tier: 'expert', requires: ['pr.mix'], state: lock, percent: 0, xp: 2300,
      desc: 'Changes written into the timeline rather than set once. A static mix is a compromise across three minutes, and moving one fader through a chorus often solves what an hour of processing could not.' },
    { id: 'pr.master', name: 'Mastering', icon: 'master', tier: 'expert', requires: ['pr.automate'], state: lock, percent: 0, xp: 2500,
      desc: 'The final pass for level, tone and consistency across a release, ideally by fresh ears. It is a polish on a finished mix, not a rescue, and loudness past a point costs dynamics outright.' },
    { id: 'pr.release', name: 'Finishing & Releasing', icon: 'release', tier: 'mastery', requires: ['pr.master', 'pr.sampling'], state: lock, percent: 0, xp: 2900,
      desc: 'Exporting properly, naming files, keeping stems, and actually putting it out. Deciding a track is done is a skill, and the alternative is a hard drive of things that were nearly finished.' },
  ],
};

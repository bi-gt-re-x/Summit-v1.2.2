/**
 * The ten styles, and the arithmetic that walks a cycle through them.
 *
 * ## Why ten, and why these
 *
 * A pomodoro is one number — how long you sit before you stop — and the
 * twenty-five minutes everybody quotes is one person's answer from 1987. It is
 * a good answer for reading a chapter and a bad one for a proof or a piece of
 * music, where twenty-five minutes is roughly the point at which you have
 * finished remembering where you were. So the list below is not decoration: it
 * spans ten to ninety minutes, and the reason a reader is choosing is that
 * their work has a natural length and it is probably not 25.
 *
 * Each one is a real, named method rather than a slider position, because
 * "Ultradian" is a thing somebody can go and read about and "82 minutes" is
 * not. `who` is one short line saying when the style is right — the numbers
 * are already on the card in a bigger typeface than any sentence, so a
 * description that restated them would be the third time of asking.
 *
 * ## What a cycle is
 *
 * focus, break, focus, break, … and every `rounds` focus intervals, the break
 * is a long one. `rounds: 1` means there is no long break at all, which is
 * correct for the styles built around a single long sitting — DeskTime and the
 * ultradian rhythm are not four-round methods and pretending they are would
 * invent a structure their authors did not put there.
 *
 * ## Everything here is pure
 *
 * `next` takes a phase and gives back the phase after it. No clock, no state,
 * no storage — the page owns all three. That is what makes the cycle testable
 * without pretending to be a timer, and it is the same split the rest of the
 * app uses for its arithmetic.
 */

export type Phase = 'focus' | 'break' | 'long';

/**
 * What each phase is called on screen.
 *
 * Here rather than on a page because two of them show it now — the Timer page
 * and the dashboard's Focus panel — and a cycle whose phases are named one way
 * in one place and another way in the other is one cycle described twice.
 */
export const PHASE_LABEL: Record<Phase, string> = {
  focus: 'Focus',
  break: 'Break',
  long: 'Long break',
};

/**
 * The ten card colours.
 *
 * One per style rather than one per family: the grid is the only place all ten
 * are seen together, and a reader picking from it is looking for the one they
 * used last, which they remember as a colour before they remember as a name.
 */
export type Tone =
  | 'green' | 'blue' | 'purple' | 'rose' | 'amber'
  | 'indigo' | 'teal' | 'violet' | 'cyan' | 'slate';

export type IconName =
  | 'leaf' | 'bolt' | 'rocket' | 'target' | 'sun'
  | 'star' | 'book' | 'atom' | 'clock' | 'wave';

export interface Style {
  id: string;
  name: string;
  /** Minutes of work in one interval. */
  focus: number;
  /** Minutes of the ordinary break after one. */
  rest: number;
  /** Minutes of the long break, when the style has one. */
  long: number;
  /** Focus intervals before the long break. 1 means the style has none. */
  rounds: number;
  /** One short line on the card. The numbers beside it say the rest. */
  who: string;
  /** Which colour the card is tinted with, and its icon draws in. */
  tone: Tone;
  /** Key into ICONS in Styles.tsx. A glyph, so ten cards are scannable. */
  icon: IconName;
}

/**
 * Ten, shortest first, so the list reads as a scale rather than a menu.
 *
 * The order matters more than it looks: somebody who does not know which they
 * want is choosing by how long they can sit, and a list sorted by that answers
 * the question they actually have.
 */
export const STYLES: Style[] = [
  {
    id: 'gentle',
    name: 'Gentle',
    focus: 10,
    rest: 5,
    long: 15,
    rounds: 4,
    who: 'When starting is the hard part.',
    tone: 'green',
    icon: 'leaf',
  },
  {
    id: 'short-burst',
    name: 'Short Burst',
    focus: 15,
    rest: 3,
    long: 10,
    rounds: 4,
    who: 'Drills, flashcards, admin.',
    tone: 'blue',
    icon: 'bolt',
  },
  {
    id: 'sprint',
    name: 'Sprint',
    focus: 20,
    rest: 10,
    long: 20,
    rounds: 3,
    who: 'Tiring work, generous breaks.',
    tone: 'purple',
    icon: 'rocket',
  },
  {
    id: 'classic',
    name: 'Classic',
    focus: 25,
    rest: 5,
    long: 15,
    rounds: 4,
    who: 'The default. Start here.',
    tone: 'rose',
    icon: 'target',
  },
  {
    id: 'extended',
    name: 'Extended',
    focus: 30,
    rest: 5,
    long: 20,
    rounds: 4,
    who: 'Room to finish a thought.',
    tone: 'amber',
    icon: 'sun',
  },
  {
    id: 'animedoro',
    name: 'Animedoro',
    focus: 40,
    rest: 20,
    long: 20,
    rounds: 1,
    who: 'Long evenings, real breaks.',
    tone: 'indigo',
    icon: 'star',
  },
  {
    id: 'study-hall',
    name: 'Study Hall',
    focus: 45,
    rest: 15,
    long: 30,
    rounds: 2,
    who: 'The length of a school period.',
    tone: 'teal',
    icon: 'book',
  },
  {
    id: 'deep-work',
    name: 'Deep Work',
    focus: 50,
    rest: 10,
    long: 30,
    rounds: 2,
    who: 'Essays, proofs, code, practice.',
    tone: 'violet',
    icon: 'atom',
  },
  {
    id: 'desktime',
    name: 'DeskTime',
    focus: 52,
    rest: 17,
    long: 17,
    rounds: 1,
    who: 'The 52/17 ratio, from the study.',
    tone: 'cyan',
    icon: 'clock',
  },
  {
    id: 'ultradian',
    name: 'Ultradian',
    focus: 90,
    rest: 20,
    long: 20,
    rounds: 1,
    who: 'One full attention cycle.',
    tone: 'slate',
    icon: 'wave',
  },
];

export const BY_ID: Record<string, Style> = Object.fromEntries(
  STYLES.map((style) => [style.id, style]),
);

export const DEFAULT_STYLE = 'classic';

/** The style with that id, or the default — never undefined. */
export function styleFor(id: string | null | undefined): Style {
  const found = id ? BY_ID[id] : undefined;
  // Falling back twice rather than asserting once: the id comes out of the
  // reader's storage and may have been written by a build whose list was
  // different, and a picker that throws on one is worse than a picker that
  // opens on the default. The last step only satisfies the type — the list is
  // a literal and DEFAULT_STYLE is in it.
  return found ?? BY_ID[DEFAULT_STYLE] ?? STYLES[0]!;
}

/** How many minutes a phase runs for, under a given style. */
export function lengthOf(style: Style, phase: Phase): number {
  if (phase === 'focus') return style.focus;
  if (phase === 'long') return style.long;
  return style.rest;
}

export interface Cycle {
  phase: Phase;
  /**
   * Focus intervals finished in this cycle, counting from zero.
   *
   * Reset by the long break rather than by the fourth focus interval, so the
   * count on screen reads "2 of 4" through the break that follows the second —
   * which is where somebody looks at it.
   */
  done: number;
}

/**
 * The phase after this one.
 *
 * Focus goes to a break, and the break is the long one when this was the last
 * round. A break goes back to focus. A style with `rounds: 1` never produces a
 * short break at all: its rest *is* its long one, and giving it both would put
 * a seventeen-minute and a seventeen-minute break in a row.
 */
export function next(style: Style, cycle: Cycle): Cycle {
  if (cycle.phase === 'focus') {
    const done = cycle.done + 1;
    if (done >= style.rounds) return { phase: 'long', done };
    return { phase: 'break', done };
  }
  // Coming out of either break: the long one starts the count again.
  return { phase: 'focus', done: cycle.phase === 'long' ? 0 : cycle.done };
}

/** A whole cycle's length in minutes — what the picker prints under the name. */
export function cycleMinutes(style: Style): number {
  return style.focus * style.rounds
    + style.rest * Math.max(0, style.rounds - 1)
    + style.long;
}

/**
 * How much of an hour of sitting is actually work, 0-100.
 *
 * The picker shows it because it is the one figure that compares ten styles
 * that are otherwise not comparable: Gentle and Ultradian differ by an hour and
 * twenty minutes per interval and are within nine points of each other here.
 */
export function focusShare(style: Style): number {
  const total = cycleMinutes(style);
  return total ? Math.round((style.focus * style.rounds) / total * 100) : 0;
}

/** mm:ss for a whole number of seconds, and h:mm:ss once it passes an hour. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// --------------------------------------------------------------------------
// The wizard's one question
// --------------------------------------------------------------------------
/**
 * The three answers the setup asks for, and what they pick between.
 *
 * Deliberately one axis rather than a questionnaire: how long can you sit? Every
 * other property of these styles follows from that, so a second question would
 * be asking somebody to specify something they can only find out by trying it.
 */
export type Sitting = 'short' | 'medium' | 'long';

export const SITTINGS: { id: Sitting; label: string; hint: string }[] = [
  { id: 'short', label: 'Not long', hint: '10–20 minutes.' },
  { id: 'medium', label: 'Half an hour', hint: 'Enough to finish something.' },
  { id: 'long', label: 'A long stretch', hint: 'I lose an hour without noticing.' },
];

/** What the setup lands on for each answer. */
export const RECOMMENDED: Record<Sitting, string> = {
  short: 'short-burst',
  medium: 'classic',
  long: 'deep-work',
};

/**
 * The styles offered beside the recommendation, for that answer.
 *
 * Three each, and the recommendation is one of them: the wizard's last step is
 * a choice with a default rather than an announcement, because somebody who
 * knows they want Ultradian should not have to finish a wizard to say so.
 */
export const NEARBY: Record<Sitting, string[]> = {
  short: ['gentle', 'short-burst', 'sprint'],
  medium: ['classic', 'extended', 'animedoro'],
  long: ['study-hall', 'deep-work', 'ultradian'],
};

// --------------------------------------------------------------------------
// Intensity
// --------------------------------------------------------------------------
/**
 * How much you are going for today, as a level.
 *
 * The second half of the hero's pair: the style says how long one sitting is,
 * this says how many of them you are aiming at. Together they are the whole of
 * "pick your focus", and both are real settings rather than flavour — the
 * target is what `2 / 8 pomodoros` counts against, and it moves the day's
 * focus goal with it, which is the figure the dashboard and the report card
 * already read.
 *
 * ## What a level deliberately does not do
 *
 * It does not multiply XP. A level that paid 20% more for the same finished
 * task would make the ledger a function of a dropdown, and the ledger is what
 * every analytic in the app counts from — the same reason there is no XP for
 * running the timer at all. Harder here means *more sittings aimed at*, and
 * the extra XP that follows is the extra work, counted the ordinary way.
 */
export interface Level {
  id: number;
  name: string;
  /** Pomodoros aimed at in a day. */
  target: number;
  hint: string;
}

export const LEVELS: Level[] = [
  { id: 1, name: 'Level 1 · Easy', target: 2, hint: 'A short sitting to get going.' },
  { id: 2, name: 'Level 2 · Steady', target: 4, hint: 'A normal working evening.' },
  { id: 3, name: 'Level 3 · Focused', target: 6, hint: 'A full afternoon of it.' },
  { id: 4, name: 'Level 4 · Hard', target: 8, hint: 'Longer focus. Bigger rewards.' },
  { id: 5, name: 'Level 5 · Relentless', target: 10, hint: 'A day given over to the work.' },
];

export const DEFAULT_LEVEL = 4;

export function levelFor(id: number | null | undefined): Level {
  return LEVELS.find((level) => level.id === id) ?? LEVELS[DEFAULT_LEVEL - 1]!;
}

/**
 * The focus goal a level implies, in hours.
 *
 * Its target of sittings times the style's own focus length — so choosing
 * Ultradian at Level 4 asks for a great deal more of the day than Classic at
 * Level 4 does, which is true and is the point of choosing both.
 */
export function goalHoursFor(level: Level, style: Style): number {
  return Math.round((level.target * style.focus) / 60 * 2) / 2;
}

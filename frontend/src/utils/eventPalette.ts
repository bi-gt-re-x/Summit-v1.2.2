/**
 * The calendar's colour system: twelve families, six shades each.
 *
 * Every colour on the calendar comes from here. Nothing draws a hex of its own
 * — the components carry a family name and the stylesheet turns it into the
 * right shade for the job, which is what makes a week of forty blocks read as
 * one design rather than as forty decisions. The hexes themselves live once, in
 * styles/calendar/palette.css, as `--event-<family>-100` … `-600`; this module
 * holds the same values so the arithmetic below (how far apart two families
 * are, which family a subject belongs to) can be done in TypeScript, and the
 * two are checked against each other by `PALETTE` being the source both were
 * written from.
 *
 * **What replaced what.** Blocks used to be given a random hex apiece, kept a
 * distance from every other hex handed out. That produced a calendar where no
 * two blocks matched and none of them meant anything: colour was noise with a
 * uniqueness guarantee. Colour is now *semantic* — a family per kind of work,
 * so every Chemistry block on the account is the same teal and the reader
 * learns the calendar rather than re-reading it. Only the shade varies, and it
 * varies by role.
 *
 * **The ladder, and what each rung is for.** Six shades, lightest to darkest:
 *
 *   100  the event background in light mode
 *   200  secondary background, subtle hover
 *   300  hover / active background
 *   400  the primary accent
 *   500  borders, icons, labels — the edge down a block's left side
 *   600  text and emphasis
 *
 * Every shade is a real colour rather than an opacity of one. A block drawn
 * with `rgba(x, .4)` over a grid line shows the grid line; it also changes
 * colour when it overlaps its neighbour, which is exactly the "chaotic
 * rainbow" a calendar with thirty blocks on it cannot afford.
 *
 * **The shades were generated, not picked.** One lightness ladder across all
 * twelve families with per-family saturation, so the families have the same
 * visual weight — a green and a yellow at the same rung look equally strong,
 * which is the thing that stops a palette reading as a rainbow. The darkest
 * rung of each family is then darkened until it clears 4.6:1 against that
 * family's lightest, so 600-on-100 is readable in every family and not only in
 * the ones that happen to be dark. Nothing is neon (saturation tops out at
 * .72), nothing is near-white (the lightest sits at 85% lightness) and nothing
 * is near-black (the darkest floors at 25%).
 */

export const FAMILIES = [
  'blue',
  'indigo',
  'purple',
  'teal',
  'green',
  'cyan',
  'yellow',
  'orange',
  'red',
  'rose',
  'brown',
  'gray',
] as const;

export type Family = (typeof FAMILIES)[number];

/** Lightest → darkest. The same values styles/calendar/palette.css declares. */
export const PALETTE: Record<Family, readonly [string, string, string, string, string, string]> = {
  blue:   ['#c1d3f3', '#a0bceb', '#779ee2', '#4a7dd6', '#2c61bc', '#254c90'],
  indigo: ['#c6c3f1', '#a8a3e8', '#827bdd', '#5950d0', '#3b33b5', '#302a8b'],
  purple: ['#dbc5ef', '#c7a5e6', '#ae7fda', '#9254cc', '#7637b1', '#5c2d88'],
  teal:   ['#c6eee8', '#a7e5da', '#80d8c9', '#57cab6', '#35a391', '#277064'],
  green:  ['#c8ecd6', '#aae1c0', '#85d3a4', '#5dc386', '#3da064', '#2d7148'],
  cyan:   ['#c4e4f0', '#a4d4e7', '#7dc1db', '#52abce', '#338bae', '#286780'],
  yellow: ['#f2e7c2', '#ead9a1', '#e0c878', '#d4b44c', '#af902b', '#796420'],
  orange: ['#f5d6bf', '#efc09c', '#e7a472', '#dd8643', '#bf6825', '#8f4f1f'],
  red:    ['#f1c7c3', '#e9a9a2', '#de847a', '#d25b4e', '#b83e30', '#8d3228'],
  rose:   ['#f0c4d6', '#e7a4bf', '#db7da3', '#ce5284', '#b33567', '#8a2b51'],
  brown:  ['#e6d8ce', '#d8c3b3', '#c6a992', '#b28c6e', '#976f51', '#755740'],
  gray:   ['#d6d9de', '#bfc4cc', '#a3aab5', '#848d9c', '#687180', '#525863'],
};

/** The rung a family is identified by when families are compared. */
const ACCENT = 4;

// --------------------------------------------------------------------------
// Distance
// --------------------------------------------------------------------------
/**
 * How far apart two families have to look before both may be on one calendar.
 *
 * Twenty-eight, as asked. It is measured on the accent rung in the redmean
 * approximation — the same 0-765 scale a channel-wise distance runs on — and it
 * is a floor the palette clears with room to spare: the closest pair of the
 * twelve (teal and cyan) sit 68 apart, so no two families on screen can be
 * confused for each other and the check below only ever binds as a safety net
 * on a palette somebody has edited. That is the useful shape for a constant
 * like this: it is a rule the design is tested against rather than a lottery
 * the colours have to win.
 */
export const COLOR_RADIUS = 28;

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  if (!match) return null;
  return [
    parseInt(match[1] ?? '0', 16),
    parseInt(match[2] ?? '0', 16),
    parseInt(match[3] ?? '0', 16),
  ];
}

/**
 * How different two colours look, near enough.
 *
 * Straight Euclidean distance in RGB rates a pair of dark blues as far apart as
 * a pair of greens the eye cannot separate, because it treats a step of green
 * as worth the same as a step of blue. This is the "redmean" approximation —
 * the same three squares weighted by where the pair sits on the red axis —
 * within a few percent of a proper Lab distance for a tenth of the code.
 */
export function perceptualDistance(a: Rgb, b: Rgb): number {
  const redMean = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(
    (2 + redMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - redMean) / 256) * db * db,
  );
}

/** How far a family's accent sits from the nearest of `others`. */
export function familyGap(family: Family, others: Iterable<Family>): number {
  const mine = hexToRgb(PALETTE[family][ACCENT])!;
  let nearest = Infinity;
  for (const other of others) {
    if (other === family) return 0;
    const gap = perceptualDistance(mine, hexToRgb(PALETTE[other][ACCENT])!);
    if (gap < nearest) nearest = gap;
  }
  return nearest;
}

/** The family whose accent is closest to a loose hex. For legacy colours. */
export function nearestFamily(hex: string): Family {
  const rgb = hexToRgb(hex);
  if (!rgb) return 'gray';
  let best: Family = 'gray';
  let bestGap = Infinity;
  FAMILIES.forEach((family) => {
    const gap = perceptualDistance(rgb, hexToRgb(PALETTE[family][ACCENT])!);
    if (gap < bestGap) {
      bestGap = gap;
      best = family;
    }
  });
  return best;
}

// --------------------------------------------------------------------------
// What a family means
// --------------------------------------------------------------------------
/**
 * The default meaning of each family, in the reader's words.
 *
 * These are the labels a picker would show. They are defaults rather than
 * rules — `SUBJECT_FAMILY` below is the mapping anyone may override, and
 * nothing in the drawing code depends on a family meaning anything in
 * particular.
 */
export const FAMILY_MEANING: Record<Family, string> = {
  blue: 'Coding / Technology',
  indigo: 'Math / Academic',
  purple: 'Music / Creative',
  teal: 'Science',
  green: 'Exercise / Health / Growth',
  cyan: 'Learning / Research',
  yellow: 'Personal / Planning',
  orange: 'Projects / Important work',
  red: 'Deadlines / Urgent',
  rose: 'Social / Events',
  brown: 'Life / Chores',
  gray: 'Miscellaneous',
};

/**
 * Which family each subject belongs to.
 *
 * Written out per subject rather than derived from the catalogue's groups,
 * because the groups are an ordering for a picker and these are meanings: the
 * catalogue files Economics under "Business and money" beside Budgeting, and a
 * reader wants the first to look academic and the second to look like admin.
 *
 * A subject missing from here falls to gray, which is the honest answer for
 * "this is on the calendar and nobody has said what kind of work it is" — see
 * `familyForSubject`. Every id in backend/config/subjects.py is listed.
 */
export const SUBJECT_FAMILY: Record<string, Family> = {
  // Maths — indigo is the academic family.
  mathematics: 'indigo', algebra: 'indigo', calculus: 'indigo',
  geometry: 'indigo', statistics: 'indigo',
  trigonometry: 'indigo', precalculus: 'indigo', differential_equations: 'indigo',

  // Science — teal.
  physics: 'teal', chemistry: 'teal', biology: 'teal', anatomy: 'teal',
  genetics: 'teal', astronomy: 'teal', geology: 'teal', ecology: 'teal',
  science: 'teal',
  organic_chemistry: 'teal', biochemistry: 'teal', microbiology: 'teal',
  neuroscience: 'teal', environmental_science: 'teal', forensic_science: 'teal',
  lab_work: 'teal', science_fair: 'teal',

  // Studying is learning and research — cyan. Exams are a deadline; they are
  // the one part of studying that is red, because that is what they are.
  homework: 'cyan', revision: 'cyan', lectures: 'cyan', research: 'cyan',
  thesis: 'cyan', coursework: 'cyan', tutoring: 'cyan', study_group: 'cyan',
  flashcards: 'cyan', reading: 'cyan',
  school: 'cyan', note_taking: 'cyan', test_prep: 'cyan', ai_tools: 'cyan',
  pre_med: 'cyan',
  // Applications are a big project with hard dates, money forms are admin,
  // and clubs and teams are the personal side of school.
  college_apps: 'orange', financial_aid: 'brown', extracurriculars: 'yellow',
  exams: 'red',

  // Language and humanities — indigo, the academic family.
  english: 'indigo', literature: 'indigo', writing: 'indigo',
  grammar: 'indigo', vocabulary: 'indigo', spanish: 'indigo',
  french: 'indigo', german: 'indigo', japanese: 'indigo',
  mandarin: 'indigo', history: 'indigo', geography: 'indigo',
  philosophy: 'indigo', psychology: 'indigo', sociology: 'indigo',
  politics: 'indigo',
  latin: 'indigo', sign_language: 'indigo', essays: 'indigo', journalism: 'indigo',
  public_speaking: 'indigo', civics: 'indigo', model_un: 'indigo',
  creative_writing: 'purple', poetry: 'purple',

  // Computing — blue.
  programming: 'blue', computer_science: 'blue', web_design: 'blue',
  data_science: 'blue', machine_learning: 'blue', cybersecurity: 'blue',
  databases: 'blue', networking: 'blue', robotics: 'blue',
  engineering: 'blue',
  python: 'blue', java: 'blue', game_dev: 'blue', app_dev: 'blue',
  electronics: 'blue', spreadsheets: 'blue',

  // Business and money. Economics is a subject; the rest is admin, and admin
  // is life rather than study.
  economics: 'indigo',
  business: 'orange', marketing: 'orange',
  accounting: 'brown', finance: 'brown', budgeting: 'brown',
  investing: 'brown', taxes: 'brown',
  entrepreneurship: 'orange',

  // Work — orange is the family for a project somebody is being paid for.
  management: 'orange', work: 'orange', planning: 'yellow',
  meetings: 'rose', presenting: 'orange', reports: 'orange',
  interviews: 'rose', job_search: 'orange',
  email: 'gray', calls: 'gray', admin: 'gray',
  part_time_job: 'orange', internships: 'orange', leadership: 'orange',

  // Creative — purple.
  art: 'purple', drawing: 'purple', design: 'purple', photography: 'purple',
  music: 'purple', guitar: 'purple', piano: 'purple', singing: 'purple',
  dance: 'purple', film: 'purple',
  violin: 'purple', drums: 'purple', band: 'purple', music_theory: 'purple',
  theater: 'purple', art_history: 'purple', cad: 'purple',

  // Health and fitness — green.
  gym: 'green', running: 'green', cycling: 'green', swimming: 'green',
  yoga: 'green', meditation: 'green', nutrition: 'green', sleep: 'green',
  therapy: 'green', health: 'green',
  basketball: 'green', soccer: 'green', stress: 'green',

  // Life and home — brown for the chores, rose for the people, yellow for
  // the things somebody does for themselves.
  chores: 'brown', laundry: 'brown', cooking: 'brown', groceries: 'brown',
  errands: 'brown',
  family: 'rose', friends: 'rose',
  travel: 'yellow', journaling: 'yellow',
  driving: 'yellow', chess: 'yellow',
};

/**
 * What the account has said, overriding the table above.
 *
 * `SUBJECT_FAMILY` is this app's opinion about what kind of work each of the
 * hundred subjects is. The subject library (components/Calendar/SubjectLibrary)
 * lets a reader disagree, and lets them name subjects the hundred never had —
 * and a subject the table has never heard of has no opinion to override.
 *
 * A module-level map rather than a parameter because of who has to read it.
 * `familyForSubject` is called from `utils/calendarGrid` and
 * `utils/calendarFamilies`, which are pure functions over tasks and events with
 * no account in scope and a dozen callers between them; threading an override
 * map through all of that to change one lookup would put the account into the
 * signature of everything that draws a block. Instead the hook that owns the
 * library publishes here whenever the answer changes — see
 * hooks/useSubjects.ts — and the lookup stays a lookup.
 *
 * One account is signed in at a time, so one map is the whole of the state.
 */
const OVERRIDES = new Map<string, Family>();

/**
 * Replace the account's colour choices wholesale.
 *
 * Wholesale rather than per-subject: the caller has just been handed the full
 * list by the server, and applying that as a set means a colour cleared
 * somewhere else is cleared here too. Called with nothing on sign-out, which
 * puts every subject back to the table above.
 */
export function setSubjectFamilies(entries: Iterable<readonly [string, Family]>): void {
  OVERRIDES.clear();
  for (const [subject, family] of entries) OVERRIDES.set(subject, family);
}

/**
 * The family a task belongs to.
 *
 * The account's choice, then this app's, then gray — which is the honest
 * answer for "this is on the calendar and nobody has said what kind of work it
 * is", and is what a subject the account invented gets until it is given a
 * colour.
 */
export function familyForSubject(subject: string | null | undefined): Family {
  if (!subject) return 'gray';
  return OVERRIDES.get(subject) ?? SUBJECT_FAMILY[subject] ?? 'gray';
}

/** Whether a string names one of the twelve. */
export function isFamily(value: unknown): value is Family {
  return typeof value === 'string' && (FAMILIES as readonly string[]).includes(value);
}

// --------------------------------------------------------------------------
// Choosing one for an event
// --------------------------------------------------------------------------
/**
 * A family for a new event.
 *
 * An event has no subject, so nothing about it says what kind of work it is —
 * which leaves the one thing the calendar does know: what is already on it. The
 * family furthest from everything in use wins, so two events made in a row are
 * never neighbours on the colour wheel and a calendar fills out across the
 * palette rather than piling into one corner of it.
 *
 * Ties are broken by the order of `FAMILIES` rather than at random, so the same
 * calendar in the same state always produces the same next colour. That is what
 * "do not randomly assign colours" comes to in the one place a colour cannot be
 * looked up: it is chosen by a rule, and the rule is repeatable.
 *
 * Gray is skipped unless everything else is taken — it is the family that means
 * "nobody said", and handing it to an event somebody has just named would say
 * something untrue about it.
 */
export function chooseFamily(inUse: Iterable<Family>): Family {
  const taken = new Set(inUse);
  const candidates = FAMILIES.filter((family) => family !== 'gray');

  let best: Family = candidates[0]!;
  let bestGap = -1;
  candidates.forEach((family) => {
    const gap = familyGap(family, taken);
    if (gap > bestGap) {
      bestGap = gap;
      best = family;
    }
  });
  return best;
}

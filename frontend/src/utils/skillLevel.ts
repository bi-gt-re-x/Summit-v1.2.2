/**
 * A skill's level — the words for it, and the shape it arrives in.
 *
 * The level itself is worked out on the server (backend/tracking/skill_level.py)
 * from the rows in `skill_attempts`, and arrives with them: `/api/skill-attempts`
 * returns every step's reading now and a month ago, and each add or delete
 * returns the new reading for the step it touched. See hooks/useSkillAttempts.
 *
 *     0  Not started   1  Started   2  Easy   3  Medium   4  Hard   5  Mastered
 *
 * It used to be computed here, once per panel that showed a level, from the
 * same rows — the skill tree and the analytics page each doing the arithmetic
 * for themselves. What is left is how a reading is said.
 */
import type { Attempt, Tier } from '@/services/skillAttempts';

export type { Attempt, Tier };

/** Easy, Medium, Hard — the order the ladder climbs them in. */
export const TIERS: readonly Tier[] = ['warmup', 'core', 'stretch'];

export const TIER_NAME: Record<Tier, string> = {
  warmup: 'Easy',
  core: 'Medium',
  stretch: 'Hard',
};

/** Problems per difficulty that accuracy is read over. */
/** The top of the ladder. */
export const MAX_LEVEL = 5;

export type Level = 0 | 1 | 2 | 3 | 4 | 5;

export const LEVEL_NAME: Record<Level, string> = {
  0: 'Not started',
  1: 'Started',
  2: 'Easy',
  3: 'Medium',
  4: 'Hard',
  5: 'Mastered',
};

/** What each level means, in one sentence. */
export const LEVEL_MEANS: Record<Level, string> = {
  0: 'No problems answered yet.',
  1: 'Problems answered, but not enough right at any difficulty yet.',
  2: 'You reliably get Easy problems right.',
  3: 'You reliably get Medium problems right.',
  4: 'You reliably get Hard problems right.',
  5: 'Hard problems, right almost every time, across more than one day.',
};

/** One difficulty, over its recent window. */
export interface TierRead {
  attempted: number;
  correct: number;
  rate: number | null;
  days: number;
  /** Whether this difficulty is cleared — enough of it, right often enough. */
  cleared: boolean;
}

export interface NextLevel {
  level: Level;
  tier: Tier | null;
  need: number;
  rate: number;
  days: number;
  have: TierRead;
}

export interface SkillLevel {
  level: Level;
  mastery: number;
  attempted: number;
  correct: number;
  accuracy: number | null;
  tiers: Record<Tier, TierRead>;
  hardest: Tier | null;
  lastAt: string | null;
  activeDays: number;
  next: NextLevel | null;
  evidence: 'none' | 'thin' | 'fair' | 'solid';
}

/** One step's readings, as the server sends them. */
export interface StepLevels {
  /** Where the step stands now. */
  now: SkillLevel;
  /** Where it stood thirty days ago. */
  before: SkillLevel;
  /** Every problem ever answered on it. */
  attempted: number;
}

/** Every step's readings, keyed by `skillKey`. */
export type Levels = Record<string, StepLevels>;

const EMPTY_TIER: TierRead = { attempted: 0, correct: 0, rate: null, days: 0, cleared: false };

/** A step with nothing answered on it: what the server would say, said here. */
export const NOTHING: SkillLevel = {
  level: 0,
  mastery: 0,
  attempted: 0,
  correct: 0,
  accuracy: null,
  tiers: { warmup: EMPTY_TIER, core: EMPTY_TIER, stretch: EMPTY_TIER },
  hardest: null,
  lastAt: null,
  activeDays: 0,
  next: { level: 1, tier: null, need: 1, rate: 0, days: 1, have: EMPTY_TIER },
  evidence: 'none',
};

const NOTHING_YET: StepLevels = { now: NOTHING, before: NOTHING, attempted: 0 };

/** One step's readings, or nothing-yet when it has none. */
export function stepLevels(levels: Levels, nodeId: string, ordinal: number): StepLevels {
  return levels[skillKey(nodeId, ordinal)] ?? NOTHING_YET;
}

const DAY = 86_400_000;

const stamp = (attempt: Attempt) => Date.parse(attempt.at);

const pct = (rate: number | null) => `${Math.round((rate ?? 0) * 100)}%`;

/**
 * What the next level asks for, and how far off it is, in one sentence.
 *
 * The figure a reader acts on. "Level 3" says where they are; this says what
 * to do about it, with their own numbers beside the target so the gap is
 * visible rather than implied.
 */
export function nextStepText(read: SkillLevel): string {
  const next = read.next;
  if (!next) return 'Mastered. Keep it that way with a few Hard problems now and then.';
  if (next.tier === null) return 'Answer any problem to start — mark it right or wrong.';

  const name = TIER_NAME[next.tier];
  const want =
    `${name} problems right at least ${pct(next.rate)} of the time, over ${next.need} or more`
    + (next.days > 1 ? `, on ${next.days} different days` : '');
  const have = next.have.attempted === 0
    ? `You haven't answered a ${name} one yet.`
    : `You're at ${next.have.attempted} answered, ${pct(next.have.rate)} right`
      + (next.days > 1 ? `, on ${next.have.days} ${next.have.days === 1 ? 'day' : 'days'}` : '')
      + '.';
  return `Level ${next.level} needs ${want}. ${have}`;
}

/** "3 days ago", "today" — for "last practised". */
export function sinceText(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'never';
  const then = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  const today = new Date(now.toDateString()).getTime();
  const days = Math.round((today - then) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

export const EVIDENCE_TEXT: Record<SkillLevel['evidence'], string> = {
  none: 'nothing yet',
  thin: 'thin — a handful of problems',
  fair: 'fair',
  solid: 'solid',
};

// --------------------------------------------------------------------------
// Grouping
// --------------------------------------------------------------------------
/** The key one skill's attempts share: a step of a node, or the node itself. */
export const skillKey = (nodeId: string, ordinal: number) => `${nodeId}#${ordinal}`;

/** The newest attempt at one problem — for "last time: right". */
export function lastAt(
  attempts: Attempt[],
  nodeId: string,
  ordinal: number,
  slot: number,
): Attempt | null {
  let found: Attempt | null = null;
  for (const row of attempts) {
    if (row.node_id !== nodeId || row.ordinal !== ordinal || row.slot !== slot) continue;
    if (!found || stamp(row) >= stamp(found)) found = row;
  }
  return found;
}

/**
 * One skill over a period: where it stood at the start and at the end.
 *
 * `from` null is the whole record, whose start is "before anything".
 */

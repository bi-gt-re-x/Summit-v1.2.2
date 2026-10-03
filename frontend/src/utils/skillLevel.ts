/**
 * A skill's level, read from what the reader actually got right.
 *
 * ## What this replaces, and why
 *
 * The skill tree's percentages are authored — identical on every account, a
 * route map rather than a measurement — and a task records nothing finer than
 * its subject. So "Factoring: Level 2 → Level 4" was not a sentence the app could
 * write. The evidence it needed is the problems under each step, which are
 * graded warm-up, core and stretch and now record whether the reader got them
 * right (data/sql/skillattempts.sql). Everything below is arithmetic over
 * those rows and a date.
 *
 * ## The ladder, in the reader's words
 *
 * Five levels, and each one is a sentence a reader can check against their own
 * memory of the problems:
 *
 *     0  Not started   nothing answered
 *     1  Started       answered something, nothing reliable yet
 *     2  Easy          Easy problems right at least 70% of the time, over 5+
 *     3  Medium        the same, on Medium problems
 *     4  Hard          the same, on Hard problems
 *     5  Mastered      Hard problems right 85%+, over 10+, on 2+ different days
 *
 * A level is the hardest difficulty *cleared*, not a climb through each one in
 * turn. A reader who does only Medium problems and gets them right is at level
 * 3 without having touched an Easy one — demanding the Easy ones first would be
 * a toll rather than evidence.
 *
 * Mastery asks for two days because one good evening is not a skill. It is the
 * one place time enters the ladder, and it is the guard against a level that
 * would be gone by the next morning.
 *
 * ## Recent, not lifetime
 *
 * Accuracy at each difficulty is read over the last 20 problems at that
 * difficulty. A lifetime mean would hold a reader's first fumbling week
 * against them for ever, and the point of "68% → 91%" is that the second
 * number can leave the first behind. It also means a level can fall: a run of
 * misses on Hard problems takes level 4 away, which is the honest reading.
 *
 * ## The past is the same function
 *
 * `readLevel(attempts, asOf)` reads only rows from before `asOf`, so the level
 * a month ago is this file run against a shorter list — not a stored history.
 */
import type { Attempt, Tier } from '@/services/skillAttempts';

export type { Attempt, Tier };

/** Lightest first. */
export const TIERS: readonly Tier[] = ['warmup', 'core', 'stretch'];

/** What the page calls each grade. The column keeps the problems' own words. */
export const TIER_NAME: Record<Tier, string> = {
  warmup: 'Easy',
  core: 'Medium',
  stretch: 'Hard',
};

/** Problems per difficulty that accuracy is read over. */
export const RECENT = 20;
/** Problems at a difficulty before it can count as cleared. */
export const CLEAR_MIN = 5;
/** The share right that clears a difficulty. */
export const CLEAR_RATE = 0.7;
/** Mastery: this many Hard problems… */
export const MASTER_MIN = 10;
/** …at this share right… */
export const MASTER_RATE = 0.85;
/** …on at least this many different days. */
export const MASTER_DAYS = 2;
/** The window "consistency" counts practice days in. */
export const CONSISTENCY_DAYS = 28;

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
  /** 0-1, or null with nothing attempted. */
  rate: number | null;
  /** Different days the recent window was practised on. */
  days: number;
}

/** What it would take to reach the next level. */
export interface NextLevel {
  level: Level;
  /** Null for the step from 0 to 1, which is any problem at all. */
  tier: Tier | null;
  /** Problems needed in the window. */
  need: number;
  /** Share right needed, 0-1. */
  rate: number;
  /** Days needed — only the step to mastery asks for more than one. */
  days: number;
  have: TierRead;
}

export interface SkillLevel {
  level: Level;
  /**
   * How far along the five levels, 0-100, with partial credit toward the
   * next one — so a reader two right answers from level 4 is not shown the
   * same figure as one who just reached 3.
   */
  mastery: number;
  /** Every problem up to the date, and how many were right. */
  attempted: number;
  correct: number;
  /** Share right over the last `RECENT` problems of any difficulty, 0-100. */
  accuracy: number | null;
  tiers: Record<Tier, TierRead>;
  /** The hardest difficulty answered correctly at least once. */
  hardest: Tier | null;
  /** When it was last practised, as stored. */
  lastAt: string | null;
  /** Different days practised in the `CONSISTENCY_DAYS` before the date. */
  activeDays: number;
  next: NextLevel | null;
  /** How much the level is standing on. */
  evidence: 'none' | 'thin' | 'fair' | 'solid';
}

const DAY = 86_400_000;

const stamp = (attempt: Attempt) => Date.parse(attempt.at);
const dayOf = (attempt: Attempt) => attempt.at.slice(0, 10);

/**
 * The most recent `limit` problems among `rows`, newest first.
 *
 * A logged batch is many problems in one row, so the row that crosses the
 * limit is taken in part — its share right kept — rather than whole. Without
 * that, one log of fifty would make "your last 20" mean fifty.
 */
function recentWindow(rows: Attempt[], limit: number): TierRead {
  const newest = [...rows].sort((a, b) => stamp(b) - stamp(a));
  let attempted = 0;
  let correct = 0;
  const days = new Set<string>();
  for (const row of newest) {
    if (attempted >= limit) break;
    const take = Math.min(row.attempted, limit - attempted);
    attempted += take;
    correct += take === row.attempted ? row.correct : (row.correct * take) / row.attempted;
    days.add(dayOf(row));
  }
  return {
    attempted,
    correct: Math.round(correct),
    rate: attempted > 0 ? correct / attempted : null,
    days: days.size,
  };
}

const cleared = (read: TierRead) =>
  read.attempted >= CLEAR_MIN && (read.rate ?? 0) >= CLEAR_RATE;

const mastered = (read: TierRead) =>
  read.attempted >= MASTER_MIN && (read.rate ?? 0) >= MASTER_RATE && read.days >= MASTER_DAYS;

/** The requirement for the level after `level`, or null at the top. */
function nextFor(level: Level, tiers: Record<Tier, TierRead>): NextLevel | null {
  const empty: TierRead = { attempted: 0, correct: 0, rate: null, days: 0 };
  switch (level) {
    case 0:
      return { level: 1, tier: null, need: 1, rate: 0, days: 1, have: empty };
    case 1:
      return { level: 2, tier: 'warmup', need: CLEAR_MIN, rate: CLEAR_RATE, days: 1, have: tiers.warmup };
    case 2:
      return { level: 3, tier: 'core', need: CLEAR_MIN, rate: CLEAR_RATE, days: 1, have: tiers.core };
    case 3:
      return { level: 4, tier: 'stretch', need: CLEAR_MIN, rate: CLEAR_RATE, days: 1, have: tiers.stretch };
    case 4:
      return {
        level: 5, tier: 'stretch', need: MASTER_MIN, rate: MASTER_RATE, days: MASTER_DAYS,
        have: tiers.stretch,
      };
    default:
      return null;
  }
}

/** How much of the way to `next` the reader is, 0-1. */
function partial(next: NextLevel | null): number {
  if (!next || next.tier === null || next.have.attempted === 0) return 0;
  const volume = Math.min(1, next.have.attempted / next.need);
  const accuracy = Math.min(1, (next.have.rate ?? 0) / next.rate);
  const spread = Math.min(1, next.have.days / next.days);
  return volume * accuracy * spread;
}

/**
 * The level as it stood at `asOf`, from the rows logged by then.
 *
 * `asOf` null is *now*, and means every row recorded rather than every row
 * stamped before this browser's clock. The two differ when the server's clock
 * runs ahead of the reader's time zone — a mark made a second ago can carry a
 * time that is still in the future here, and a level that ignored the answer
 * the reader just gave would be the one bug they would certainly notice.
 *
 * `attempts` should already be one skill's — a step's, or a node's when the
 * node is read as a whole. Nothing here groups.
 */
export function readLevel(attempts: Attempt[], asOf: Date | null = null): SkillLevel {
  const cut = asOf ? asOf.getTime() : Number.POSITIVE_INFINITY;
  const base = asOf ?? new Date();
  const rows = attempts.filter((row) => {
    const at = stamp(row);
    return !Number.isNaN(at) && at <= cut && row.attempted > 0;
  });

  const tiers = Object.fromEntries(
    TIERS.map((tier) => [tier, recentWindow(rows.filter((row) => row.weight === tier), RECENT)]),
  ) as Record<Tier, TierRead>;

  let level: Level = 0;
  if (rows.length > 0) level = 1;
  if (cleared(tiers.warmup)) level = 2;
  if (cleared(tiers.core)) level = 3;
  if (cleared(tiers.stretch)) level = 4;
  if (mastered(tiers.stretch)) level = 5;

  const next = nextFor(level, tiers);
  const attempted = rows.reduce((sum, row) => sum + row.attempted, 0);
  const correct = rows.reduce((sum, row) => sum + row.correct, 0);
  const overall = recentWindow(rows, RECENT);

  let hardest: Tier | null = null;
  for (const tier of TIERS) {
    if (rows.some((row) => row.weight === tier && row.correct > 0)) hardest = tier;
  }

  const since = base.getTime() - (CONSISTENCY_DAYS - 1) * DAY;
  const activeDays = new Set(
    rows.filter((row) => stamp(row) >= new Date(new Date(since).toDateString()).getTime()).map(dayOf),
  ).size;

  const lastAt = rows.reduce<string | null>(
    (latest, row) => (latest === null || stamp(row) > Date.parse(latest) ? row.at : latest),
    null,
  );

  return {
    level,
    mastery: Math.round(((level + (level < MAX_LEVEL ? partial(next) : 0)) / MAX_LEVEL) * 100),
    attempted,
    correct,
    accuracy: overall.rate === null ? null : Math.round(overall.rate * 100),
    tiers,
    hardest,
    lastAt,
    activeDays,
    next,
    evidence: attempted === 0 ? 'none' : attempted < CLEAR_MIN ? 'thin' : attempted < 15 ? 'fair' : 'solid',
  };
}

// --------------------------------------------------------------------------
// Words
// --------------------------------------------------------------------------
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

/** Attempts by skill. */
export function bySkill(attempts: Attempt[]): Map<string, Attempt[]> {
  const out = new Map<string, Attempt[]>();
  for (const row of attempts) {
    const key = skillKey(row.node_id, row.ordinal);
    const list = out.get(key);
    if (list) list.push(row);
    else out.set(key, [row]);
  }
  return out;
}

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
export interface LevelChange {
  then: SkillLevel;
  now: SkillLevel;
  /** Problems answered inside the period. */
  inPeriod: number;
}

export function levelChange(
  attempts: Attempt[],
  from: Date | null,
  to: Date | null = null,
): LevelChange {
  const start = from ?? new Date(0);
  const end = to ? to.getTime() : Number.POSITIVE_INFINITY;
  return {
    then: readLevel(attempts, start),
    now: readLevel(attempts, to),
    inPeriod: attempts
      .filter((row) => {
        const at = stamp(row);
        return at > start.getTime() && at <= end;
      })
      .reduce((sum, row) => sum + row.attempted, 0),
  };
}

/**
 * The mastery ladder — a hundred levels, twenty-one names.
 *
 * The Subjects tab used to read the account's own ladder: level N costs N × 100
 * XP, six rank names, two levels a rank. That was the right call while a skill
 * level had to mean exactly what an account level meant, and it had two
 * problems as a progression track. The curve was a straight line, so level 60
 * cost six times level 10 and every level after about thirty was a wall. And
 * six names over an unbounded ladder meant "Master" arrived at level eleven and
 * then never changed again, however long anybody kept going.
 *
 * This is an explicit table instead of a formula, and that is deliberate: the
 * costs were chosen rather than derived, they bend where a designer wanted them
 * to bend, and no closed form would reproduce them. `LEVEL_COST[n]` is what it
 * costs to get from level n to level n + 1, so the ladder holds 99 numbers and
 * level 100 is the top.
 *
 * ## This is the mastery track's ladder, not the account's
 *
 * The account's level still follows `level_for_total_xp` in
 * backend/tracking/xp.py, unchanged. That is a real divergence from how this
 * file used to work — a subject's level and the account's level are now counted
 * on different curves, and 300 XP of chemistry is no longer the same level as
 * 300 XP of anything.
 *
 * The reason to accept it: they are answering different questions. The account
 * level is a single running total of everything ever done, and a linear ladder
 * suits it. Mastery is per subject, most subjects are small, and a track meant
 * to be climbed twenty times over needs to be gentle at the bottom and named
 * all the way up. Anything that prints both on one screen should say which is
 * which — see `SkillsChapter`.
 */

/**
 * What each level costs, from 1 to 99.
 *
 * Index 0 is level 1's cost. `LEVEL_COST[n - 1]` is the XP that takes a subject
 * from level n to level n + 1, which makes the whole climb 269,483 XP.
 *
 * Written out rather than generated. Every attempt to fit these to a curve
 * loses the shape — the steps jump at each tier boundary and flatten inside it,
 * which is the thing that makes a tier feel like an arrival — and a formula
 * that was 3 XP out at level 60 would be a ladder nobody could check.
 */
export const LEVEL_COST: readonly number[] = [
  // Beginner
  95, 105, 114, 124, 133,
  // Novice
  143, 152, 162, 171, 181,
  // Apprentice
  190, 204, 219, 233, 247,
  // Adept
  261, 280, 299, 318, 338,
  // Skilled
  356, 380, 404, 428, 451,
  // Expert
  475, 504, 532, 561, 589,
  // Master
  618, 651, 684, 717, 751,
  // Grand Master
  784, 822, 860, 898, 936,
  // Elite
  974, 1021, 1069, 1116, 1164,
  // Champion
  1211, 1268, 1325, 1383, 1439,
  // Grand Champion
  1496, 1568, 1639, 1710, 1781,
  // Legend
  1853, 1948, 2043, 2138, 2233,
  // Ascendant
  2328, 2446, 2565, 2684, 2803,
  // Elite Ascendant
  2921, 3064, 3206, 3349, 3491,
  // Mythic
  3634, 3800, 3966, 4133, 4299,
  // Transcendent
  4465, 4655, 4845, 5035, 5225,
  // Immortal
  5415, 5653, 5890, 6128, 6365,
  // Overlord
  6603, 6888, 7173, 7458, 7743,
  // Ascended
  8028, 8360, 8693, 9025, 9358,
  // Grand Arbiter
  9690, 10070, 10450, 10830,
];

/** The top of the ladder. Nothing above it, by design. */
export const MAX_LEVEL = 100;

export interface Tier {
  name: string;
  /** First and last level of the band, inclusive. */
  from: number;
  to: number;
}

/**
 * The twenty-one bands, in order.
 *
 * Five levels each, which is what keeps a name from being either permanent or
 * disposable: at the pace a real subject moves, a band is a season's work near
 * the bottom and a long project near the top. The last two are irregular on
 * purpose — Grand Arbiter runs four levels so that Eternal can be a band of
 * exactly one, and arriving at the top should not share its name with the four
 * levels below it.
 */
export const TIERS: readonly Tier[] = [
  { name: 'Beginner', from: 1, to: 5 },
  { name: 'Novice', from: 6, to: 10 },
  { name: 'Apprentice', from: 11, to: 15 },
  { name: 'Adept', from: 16, to: 20 },
  { name: 'Skilled', from: 21, to: 25 },
  { name: 'Expert', from: 26, to: 30 },
  { name: 'Master', from: 31, to: 35 },
  { name: 'Grand Master', from: 36, to: 40 },
  { name: 'Elite', from: 41, to: 45 },
  { name: 'Champion', from: 46, to: 50 },
  { name: 'Grand Champion', from: 51, to: 55 },
  { name: 'Legend', from: 56, to: 60 },
  { name: 'Ascendant', from: 61, to: 65 },
  { name: 'Elite Ascendant', from: 66, to: 70 },
  { name: 'Mythic', from: 71, to: 75 },
  { name: 'Transcendent', from: 76, to: 80 },
  { name: 'Immortal', from: 81, to: 85 },
  { name: 'Overlord', from: 86, to: 90 },
  { name: 'Ascended', from: 91, to: 95 },
  { name: 'Grand Arbiter', from: 96, to: 99 },
  { name: 'Eternal', from: 100, to: 100 },
];

/**
 * Cumulative XP to reach each level, worked out once.
 *
 * `CUMULATIVE[n]` is the lifetime XP a subject needs before it *is* level n.
 * Index 0 is unused, `CUMULATIVE[1]` is 0 — level 1 is where everything starts
 * and costs nothing — and `CUMULATIVE[100]` is the whole climb.
 *
 * Built at module load rather than summed per call: `masteryLevel` runs once
 * per subject per render on a tab that can be showing a dozen of them, and a
 * hundred-element prefix sum is cheaper to compute once than to re-derive.
 */
const CUMULATIVE: readonly number[] = (() => {
  const out = [0, 0];
  for (let level = 1; level <= LEVEL_COST.length; level++) {
    out[level + 1] = out[level]! + LEVEL_COST[level - 1]!;
  }
  return out;
})();

/** Lifetime XP needed to *reach* `level`. Level 1 is free; level 100 is the cap. */
export function xpToReach(level: number): number {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return CUMULATIVE[clamped] ?? 0;
}

/** What it costs to leave `level`. Zero at the top, which has nowhere to go. */
export function costOf(level: number): number {
  if (level >= MAX_LEVEL || level < 1) return 0;
  return LEVEL_COST[level - 1] ?? 0;
}

/** The band a level sits in. Never null — the table covers 1 to 100. */
export function tierFor(level: number): Tier {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return TIERS.find((tier) => clamped >= tier.from && clamped <= tier.to) ?? TIERS[0]!;
}

/** What a level is called. `rankFor` under its old name; see `SkillLevel.rank`. */
export function rankFor(level: number): string {
  return tierFor(level).name;
}

/** The band after this one, or null at the top. */
export function nextTier(level: number): Tier | null {
  const here = tierFor(level);
  const index = TIERS.indexOf(here);
  return index >= 0 && index < TIERS.length - 1 ? TIERS[index + 1]! : null;
}

export interface MasteryLevel {
  /** The whole level, 1 to 100. */
  tier: number;
  /** The same with the fraction of the current level on it — 4.37. */
  exact: number;
  /** XP banked inside the current level. */
  xpInLevel: number;
  /** What the current level costs in total. Zero at 100. */
  xpRequired: number;
  /** 0-100 through the current level. Always 100 at the cap. */
  percent: number;
  /** XP still to earn before the next whole level. Zero at the cap. */
  toNext: number;
  /** The band's name — "Adept". */
  rank: string;
  /** The band itself, for a panel that wants its range. */
  band: Tier;
  /** True at level 100, which behaves differently everywhere it is drawn. */
  maxed: boolean;
}

/**
 * Where a lifetime XP total lands on the ladder.
 *
 * A linear scan rather than a binary search over `CUMULATIVE`: the array is a
 * hundred long, most subjects land in its first few entries, and the loop is
 * plainly correct in a way the off-by-ones of a hand-written bisection would
 * not be.
 *
 * At the cap the fractional parts stop meaning anything and are pinned rather
 * than left to divide by a zero-cost level: `percent` is 100 and `toNext` is 0,
 * so a progress bar drawn from either reads as finished rather than as empty.
 */
export function masteryLevel(xp: number): MasteryLevel {
  const total = Math.max(0, xp);

  let tier = 1;
  while (tier < MAX_LEVEL && total >= xpToReach(tier + 1)) tier += 1;

  const band = tierFor(tier);
  const maxed = tier >= MAX_LEVEL;
  const xpInLevel = total - xpToReach(tier);
  const xpRequired = costOf(tier);

  if (maxed) {
    return {
      tier: MAX_LEVEL,
      exact: MAX_LEVEL,
      xpInLevel,
      xpRequired: 0,
      percent: 100,
      toNext: 0,
      rank: band.name,
      band,
      maxed: true,
    };
  }

  const percent = xpRequired > 0 ? (xpInLevel / xpRequired) * 100 : 0;
  return {
    tier,
    exact: tier + (xpRequired > 0 ? xpInLevel / xpRequired : 0),
    xpInLevel,
    xpRequired,
    percent,
    toNext: Math.max(0, xpRequired - xpInLevel),
    rank: band.name,
    band,
    maxed: false,
  };
}

/**
 * What an account level is called — the name at the foot of the rail.
 *
 * Twenty-one bands over levels 1 to 100; past 100 the name stays Eternal. These
 * names used to belong to a second, per-subject ladder of a hundred levels (the
 * "mastery" track) as well, which gave every subject a level and a rank of its
 * own beside the account's. That ladder is gone; the names are the account's.
 */

/** The top of the table. Levels above it keep the last band's name. */
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
 * disposable. The last two are irregular on
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

/** The band a level sits in. Never null — a level outside 1-100 is clamped. */
export function tierFor(level: number): Tier {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return TIERS.find((tier) => clamped >= tier.from && clamped <= tier.to) ?? TIERS[0]!;
}

/** What a level is called. */
export function rankFor(level: number): string {
  return tierFor(level).name;
}

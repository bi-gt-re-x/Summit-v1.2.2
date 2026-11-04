/**
 * How much a figure is allowed to claim.
 *
 *     1-3 observations    Insufficient evidence    Say nothing. Say what's missing.
 *     4-9 observations    Preliminary signal       Say it as something to test.
 *     10-29 observations  Emerging pattern         Say it, hedged.
 *     30+ observations    Potentially reliable     Say it, and still not as a cause.
 *
 * For a comparison the count is the smaller side, and the gap is also read in
 * standard errors: under `weak_gap` the two sides can't be told apart, and under
 * `clear_gap` it stays preliminary however large the sample. The why is in
 * backend/tracking/evidence.py, the table in shared/rules.json, and
 * shared/cases/evidence.json pins both copies.
 */
import rules from '@shared/rules.json';

export type EvidenceTier = 'insufficient' | 'preliminary' | 'emerging' | 'reliable';

export interface EvidenceRead {
  tier: EvidenceTier;
  label: string;
  /** Observations behind it. For a comparison, the smaller side. */
  n: number;
  /** True when there was enough to compare and the two sides can't be told apart. */
  noise: boolean;
  /** True when the gap is well outside the ordinary swing of the figures. */
  clear: boolean;
}

const RULES = rules.evidence;
const TIERS = RULES.tiers as ReadonlyArray<{ key: EvidenceTier; from: number; label: string }>;

export const EVIDENCE_LABEL = Object.fromEntries(TIERS.map((row) => [row.key, row.label])) as Record<EvidenceTier, string>;

/** The fewest observations that can claim anything at all. */
export const EVIDENCE_FLOOR = TIERS.find((row) => row.key === 'preliminary')!.from;

const ORDER: EvidenceTier[] = TIERS.map((row) => row.key);

export function tierFor(n: number): EvidenceTier {
  let found: EvidenceTier = 'insufficient';
  TIERS.forEach((row) => {
    if (n >= row.from) found = row.key;
  });
  return found;
}

const read = (tier: EvidenceTier, n: number, noise = false, clear = false): EvidenceRead => ({
  tier,
  label: EVIDENCE_LABEL[tier],
  n,
  noise,
  clear,
});

/** A figure with no second side to compare with: only its count limits it. */
export function counted(n: number): EvidenceRead {
  return read(tierFor(n), n);
}

function judged(n: number, gap: number): EvidenceRead {
  const tier = tierFor(n);
  if (tier === 'insufficient') return read(tier, n);
  if (gap < RULES.weak_gap) return read('insufficient', n, true);
  if (gap < RULES.clear_gap) return read('preliminary', n);
  return read(tier, n, false, true);
}

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

function sampleVariance(values: number[]): number {
  const centre = average(values);
  return values.reduce((sum, value) => sum + (value - centre) ** 2, 0) / (values.length - 1);
}

/** Whether two groups of readings really differ (Welch's standard error). */
export function compareMeans(a: number[], b: number[]): EvidenceRead {
  const n = Math.min(a.length, b.length);
  if (n < 2) return read('insufficient', n);
  const gap = Math.abs(average(a) - average(b));
  const error = Math.sqrt(sampleVariance(a) / a.length + sampleVariance(b) / b.length);
  if (error === 0) return judged(n, gap > 0 ? Infinity : 0);
  return judged(n, gap / error);
}

/** Whether two shares really differ (two-proportion, pooled). */
export function compareRates(hitsA: number, nA: number, hitsB: number, nB: number): EvidenceRead {
  const n = Math.min(nA, nB);
  if (n < 1) return read('insufficient', n);
  const pooled = (hitsA + hitsB) / (nA + nB);
  const error = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));
  const gap = Math.abs(hitsA / nA - hitsB / nB);
  if (error === 0) return judged(n, gap > 0 ? Infinity : 0);
  return judged(n, gap / error);
}

/** Whether two paired figures really move together. */
export function correlationEvidence(r: number, n: number): EvidenceRead {
  const tier = tierFor(n);
  if (tier === 'insufficient') return read(tier, n);
  if (Math.abs(r) < RULES.min_correlation) return read('insufficient', n, true);
  if (Math.abs(r) >= 1) return read(tier, n);
  return judged(n, Math.abs(r) * Math.sqrt((n - 2) / (1 - r * r)));
}

export const speaks = (found: EvidenceRead) => found.tier !== 'insufficient';

/** The lowest of several tiers, for a claim that rests on all of them. */
export function weakest(...tiers: EvidenceTier[]): EvidenceTier {
  return tiers.reduce((low, tier) => (ORDER.indexOf(tier) < ORDER.indexOf(low) ? tier : low));
}

/**
 * A "This suggests..." sentence, as strong as its tier allows. Empty when it
 * can't be said at all, so a caller that prints it prints nothing.
 */
export function hedge(text: string, tier: EvidenceTier): string {
  if (tier === 'insufficient') return '';
  if (tier === 'reliable') return text;
  const opens = text.startsWith('This suggests ');
  const rest = opens ? text.slice('This suggests '.length) : text;
  if (tier === 'emerging') return opens ? `This may mean ${rest}` : text;
  const lead = opens ? `It's early, but this may mean ${rest}` : `It's early. ${rest}`;
  return `${lead} Treat it as something to test.`;
}

/**
 * What sort of claim a finding makes, which is a separate question from how sure it is.
 *
 * Only `arithmetic` can say "because". The rest are a person's own days and tasks,
 * never an experiment, so at their strongest they show two things go together.
 */
export type ClaimKind = 'arithmetic' | 'count' | 'before-after' | 'correlation';

export const CLAIM_LABEL: Record<ClaimKind, string> = {
  arithmetic: 'Adds up exactly',
  count: 'Counted',
  'before-after': 'Before and after',
  correlation: 'Goes together',
};

export const CLAIM_NOTE: Record<ClaimKind, string> = {
  arithmetic: 'The total breaks down into these parts, so this is arithmetic and not a guess.',
  count: 'A count of what happened. It says what, and not why.',
  'before-after': "Then against now. Other things changed too, so this doesn't show what caused it.",
  correlation: "These happen together. That doesn't show one causes the other.",
};

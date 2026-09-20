/**
 * Sentences about skills, from the scores rather than about them.
 *
 * "You have been lacking on Geometry the last week" is the ask, and the thing
 * that makes it worth printing is that it is *derived*: every finding below
 * names the figures it came from, and a reader who does not believe one can
 * check it against the panel beside it. A page that asserts and cannot be
 * checked is a page that gets ignored the first time it is wrong.
 *
 * ## Silence is a real answer
 *
 * Each rule has a floor, and most accounts trip few of them. An analytics page
 * that always has six things to say is a page that has learned to fill space —
 * the same rule `goalSuggest` follows, and for the same reason.
 *
 * ## Nothing here is advice
 *
 * A finding states what the record shows. What to do about it is the
 * Recommendations tab's job, and mixing the two puts a suggestion the reader
 * did not ask for inside a figure they did.
 */
import { PART_WEIGHTS, type SkillRow } from './skillScore';

export type FindingTone = 'good' | 'watch' | 'bad';

export interface SkillFinding {
  /** Stable per rule + subject, so a list can key on it. */
  id: string;
  subject: string;
  tone: FindingTone;
  /** The sentence. One, and it names its own evidence. */
  text: string;
  /** For ordering: how much this is worth saying, 0-1. */
  weight: number;
}

/** Below this a subject has too little behind it to be worth a sentence. */
const MIN_RATED = 4;

/** A gap in weeks that counts as having gone quiet on something real. */
const QUIET_DAYS = 7;

/** A drop in accuracy points over the recent window worth naming. */
const SLIP = 8;

/** A rise worth naming. Higher than the drop: praise should be earned. */
const CLIMB = 10;

/** The spread between a subject's best and worst part that makes it lopsided. */
const LOPSIDED = 40;

/**
 * What the scores say, best sentence first.
 *
 * `nameOf` turns a subject id into its display name, and `limit` is how many
 * the caller has room for — the tone setting decides that on the analytics
 * page, the same way it decides how many suggestions a reader is shown at
 * once.
 */
export function skillFindings(
  rows: SkillRow[],
  nameOf: (id: string) => string,
  limit = 4,
): SkillFinding[] {
  const found: SkillFinding[] = [];
  const solid = rows.filter((row) => row.rated >= MIN_RATED);

  for (const row of solid) {
    const name = nameOf(row.subject);

    // --- Gone quiet on something that was going well ----------------------
    if (row.daysSince !== null && row.daysSince >= QUIET_DAYS && row.parts.accuracy >= 55) {
      found.push({
        id: `quiet:${row.subject}`,
        subject: row.subject,
        tone: row.daysSince >= 21 ? 'bad' : 'watch',
        text:
          `You have been lacking on ${name} — nothing finished there in ${row.daysSince} days, ` +
          `on a subject you were averaging ${row.avgExecution} out of 5 in.`,
        // The longer the gap on a stronger subject, the more it is worth saying.
        weight: Math.min(1, row.daysSince / 45) * (row.parts.accuracy / 100),
      });
    }

    // --- Recent form has slipped -----------------------------------------
    if (row.trend !== null && row.trend <= -SLIP) {
      found.push({
        id: `slip:${row.subject}`,
        subject: row.subject,
        tone: 'bad',
        text:
          `${name} has gone backwards this month: ${Math.abs(row.trend)} points down on ` +
          `accuracy against your record before it.`,
        weight: Math.min(1, Math.abs(row.trend) / 40),
      });
    }

    // --- Recent form has climbed -----------------------------------------
    if (row.trend !== null && row.trend >= CLIMB) {
      found.push({
        id: `climb:${row.subject}`,
        subject: row.subject,
        tone: 'good',
        text: `${name} is climbing: ${row.trend} points up on accuracy over the last 30 days.`,
        weight: Math.min(1, row.trend / 40),
      });
    }

    // --- A ceiling on the hard end ---------------------------------------
    if (
      row.hardAccuracy !== null &&
      row.parts.accuracy - row.hardAccuracy >= 18 &&
      row.rated >= 6
    ) {
      found.push({
        id: `ceiling:${row.subject}`,
        subject: row.subject,
        tone: 'watch',
        text:
          `${name} holds up until the work gets hard: ${Math.round(row.parts.accuracy)}% overall ` +
          `against ${row.hardAccuracy}% on the hardest third of what you attempted.`,
        weight: (row.parts.accuracy - row.hardAccuracy) / 100,
      });
    }

    // --- One part dragging a subject that is otherwise fine ---------------
    /* Retention is out of this comparison at both ends, and that is not a
       detail. It measures when the subject was last touched, not how well it
       is done — so a subject worked yesterday scores ~100 on it, and against
       a difficulty part in the fifties that is a 45-point spread on every
       actively-worked subject. The rule fired on almost everything and named
       "retention" as the thing carrying a skill, which is a sentence about a
       date. What is left is the five parts that are about the work. */
    const values = PART_WEIGHTS.filter((part) => part.key !== 'retention').map((part) => ({
      ...part,
      value: row.parts[part.key],
    }));
    const best = values.reduce((a, b) => (b.value > a.value ? b : a));
    const worst = values.reduce((a, b) => (b.value < a.value ? b : a));
    if (best.value - worst.value >= LOPSIDED) {
      found.push({
        id: `lopsided:${row.subject}`,
        subject: row.subject,
        tone: 'watch',
        text:
          `${name} is lopsided: ${best.label.toLowerCase()} at ${Math.round(best.value)} and ` +
          `${worst.label.toLowerCase()} at ${Math.round(worst.value)}. The score is held back by one of the six.`,
        weight: (best.value - worst.value) / 100,
      });
    }
  }

  // --- Where the account actually stands, once ----------------------------
  const top = solid[0];
  if (top && top.score >= 75) {
    found.push({
      id: `peak:${top.subject}`,
      subject: top.subject,
      tone: 'good',
      text:
        `${nameOf(top.subject)} is your strongest subject at ${top.score} — ` +
        `${top.band.toLowerCase()}, on ${top.rated} rated tasks.`,
      weight: 0.5,
    });
  }

  /* One sentence per subject. Several rules can fire on the same subject —
     a slipping subject is often a lopsided one — and printing three sentences
     about Geometry above a list of four findings means the page has one
     finding and a stutter. */
  const seen = new Set<string>();
  return found
    .sort((a, b) => b.weight - a.weight)
    .filter((finding) => {
      if (seen.has(finding.subject)) return false;
      seen.add(finding.subject);
      return true;
    })
    .slice(0, limit);
}

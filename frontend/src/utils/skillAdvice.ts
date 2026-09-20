/**
 * The two recommendations only the skill model can make.
 *
 * `utils/advice` already produces the habit rules — work more days, claim a
 * weekend, restart a dropped subject — off the window's shape. It has no view
 * of how *well* the work went at each difficulty, because until the skill
 * model there was nothing computing that. These two rules are what the model
 * adds, and both are written to be things the existing rules cannot say:
 *
 *   **The hard end.** A subject where accuracy holds up until the work gets
 *   hard and then drops. No habit rule can see this — it is not about how much
 *   or how often, it is about a ceiling inside work that is already happening.
 *
 *   **The unrated record.** A subject with a lot of finished work and few
 *   ratings on it. The score exists and is being held down by missing
 *   evidence rather than by the work, and the reader is the only one who can
 *   supply the missing half.
 *
 * ## No XP figure
 *
 * Every rule in utils/advice carries `impact` in XP a year and is ranked by it.
 * These carry zero, deliberately: "attempt harder problems" does not convert to
 * an XP rate without inventing the conversion, and `AdviceCard` already draws a
 * card with no impact line when the figure is zero. They sort to the bottom of
 * the ranked list, which is the right place for a change whose payoff is a
 * better score rather than more of one.
 */
import { SUBJECT_RULE_FLOOR_NOTE } from './skillScore';
import type { Advice } from './advice';
import type { SkillRow } from './skillScore';

/** The gap between overall accuracy and the hardest third that is a ceiling. */
const CEILING_GAP = 18;

/** Rated tasks before a rule will tell somebody to change how they study. */
const RULE_FLOOR = 6;

/** Finished tasks in a subject before "you have not rated this" is worth saying. */
const UNRATED_FLOOR = 12;

/** Below this share rated, the score is standing on too little. */
const THIN = 0.5;

/**
 * Skill-derived advice, in the shape the Recommendations tab already renders.
 *
 * `nameOf` turns a subject id into its display name. `limit` caps how many of
 * each rule reach the list, because six cards all saying "rate your work"
 * would crowd out the habit rules that carry real XP figures.
 */
export function skillAdvice(
  rows: SkillRow[],
  nameOf: (id: string) => string,
  limit = 2,
): Advice[] {
  const out: Advice[] = [];

  // --- A ceiling on the hard end -------------------------------------------
  const ceilings = rows
    .filter(
      (row) =>
        row.rated >= RULE_FLOOR &&
        row.hardAccuracy !== null &&
        row.parts.accuracy - row.hardAccuracy >= CEILING_GAP,
    )
    .sort((a, b) => b.parts.accuracy - b.hardAccuracy! - (a.parts.accuracy - a.hardAccuracy!))
    .slice(0, limit);

  for (const row of ceilings) {
    const name = nameOf(row.subject);
    const gap = Math.round(row.parts.accuracy - row.hardAccuracy!);
    out.push({
      id: `skill-ceiling:${row.subject}`,
      kind: 'load',
      category: 'Subjects',
      title: `Work the hard end of ${name}`,
      because: `You average ${Math.round(row.parts.accuracy)}% in ${name} but ${row.hardAccuracy}% on the hardest third of what you attempt.`,
      action: `Make the next two ${name} tasks ones you expect to rate 4 or 5 for difficulty, and rate how they actually went.`,
      evidence: `${row.rated} rated tasks · ${gap} points between your overall accuracy and your hardest third`,
      impact: 0,
      workings: `Difficulty handled is 20% of a skill score and it is the part this moves. ${name} sits at ${Math.round(row.parts.difficulty)} on it against ${Math.round(row.parts.accuracy)} on accuracy.`,
      effort: 3,
      priority: 'low',
    });
  }

  // --- A record that cannot be scored --------------------------------------
  const thin = rows
    .filter((row) => row.finished >= UNRATED_FLOOR && row.rated / row.finished < THIN)
    .sort((a, b) => b.finished - a.finished)
    .slice(0, limit);

  for (const row of thin) {
    const name = nameOf(row.subject);
    const share = Math.round((row.rated / row.finished) * 100);
    out.push({
      id: `skill-unrated:${row.subject}`,
      kind: 'quality',
      category: 'Quality',
      title: `Rate your ${name} work`,
      because: `You have finished ${row.finished} ${name} tasks and rated ${row.rated} of them — ${share}%.`,
      action: `Rate the next few ${name} tasks as you finish them. Two rows, difficulty and how it went.`,
      evidence: `${row.rated} of ${row.finished} finished tasks rated`,
      workings: `${name} scores ${row.score} against a raw ${row.raw}, because ${SUBJECT_RULE_FLOOR_NOTE}. The gap closes as you rate more.`,
      impact: 0,
      effort: 1,
      priority: 'low',
    });
  }

  return out;
}

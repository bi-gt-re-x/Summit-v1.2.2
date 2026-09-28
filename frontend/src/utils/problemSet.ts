/**
 * The ladder of problems behind one step.
 *
 * A step says what to practise; this says in what order to meet it. The rule is
 * that a set opens light and gets heavier — the first third are warm-ups a
 * reader can finish before deciding whether they are in the mood, and the last
 * are the ones that actually settle whether they have the skill.
 *
 * ## Why a third, and why the bands are named
 *
 * A set that opens on its hardest question is a set most people close. A set
 * that never gets past recall is one nobody learns from. Splitting it into
 * thirds gives a reader two cheap wins to start on and a visible slope after
 * them, and naming the bands means the slope is *stated* rather than left to be
 * inferred from the questions — which matters most to the reader who is
 * struggling, because they can see that the thing defeating them is supposed to
 * be hard.
 *
 * The first third is the floor rather than the target: `WARM_UP_SHARE` rounds
 * up, so a set of four opens with two warm-ups rather than one.
 *
 * ## Why this is derived rather than stored
 *
 * The problems themselves are not written yet — see the slots in
 * components/SkillTree/LatticePanel. What *is* decided is the shape of a set:
 * how many, in what order, under which headings. Deciding that here means the
 * panel already lays out a graded ladder, and filling it later is a change of
 * source rather than a change of design.
 *
 * When the problems do arrive they will arrive per step from the server, the
 * same way the steps themselves did — see services/skillSteps and the note at
 * the top of data/sql/skillsteps.sql on why generated content is stored rather
 * than derived. `slotsFor` is then the thing that gets deleted, not extended.
 */
/**
 * The least a step has to be for problems to be built on it.
 *
 * `WrittenStep` satisfies this and carries more. The looser shape exists
 * because the problems screen has to work on the derived programme too: most
 * of the library has no written steps yet, and a reader on one of those nodes
 * should still get a graded set rather than a feature that is invisible until
 * a generator run reaches them. See `asPractice` in
 * components/SkillTree/LatticePanel for how a ladder rung becomes one of
 * these.
 */
export interface PracticeStep {
  ordinal: number;
  /** A short label for the step — what the problems are for. */
  title: string;
  /** One line of what this step is, shown above the problems. */
  mastery: string;
  proof: string;
  pitfall: string;
  minutes: number;
}

/** How hard a problem in the set is meant to be. */
export type ProblemWeight = 'warmup' | 'core' | 'stretch';

export interface ProblemSlot {
  /** 1-based, and the order a reader should meet them in. */
  index: number;
  weight: ProblemWeight;
}

/** What each band is called, and what it is for. */
export const WEIGHT_LABEL: Record<ProblemWeight, string> = {
  warmup: 'Warm-up',
  core: 'Core',
  stretch: 'Stretch',
};

export const WEIGHT_BLURB: Record<ProblemWeight, string> = {
  warmup: 'Short, and answerable straight from the step.',
  core: 'The ordinary version of the skill, unaided.',
  stretch: 'Harder than the step asked for. This is the one that proves it.',
};

/** The fraction of a set that opens light. Rounded up, so it is a floor. */
export const WARM_UP_SHARE = 1 / 3;

/**
 * How many problems a step gets.
 *
 * Read off the step's own cost rather than fixed, because a five-minute step
 * and a ninety-minute one are not owed the same number of questions. Clamped
 * hard at both ends: fewer than three cannot show a slope at all, and more than
 * nine is a problem sheet rather than a step.
 */
export const MIN_PROBLEMS = 3;
export const MAX_PROBLEMS = 9;

export function countFor(step: Pick<PracticeStep, 'minutes'>): number {
  const byCost = Math.round(step.minutes / 5);
  return Math.max(MIN_PROBLEMS, Math.min(MAX_PROBLEMS, byCost));
}

/**
 * The set for one step: light first, heavy last.
 *
 * The middle band takes whatever is left over, which is deliberate — with three
 * problems the split is one of each, and with nine it is 3/3/3. What never
 * changes is that the set opens on a warm-up and ends on a stretch.
 */
export function slotsFor(step: Pick<PracticeStep, 'minutes'>): ProblemSlot[] {
  const total = countFor(step);
  const warm = Math.max(1, Math.ceil(total * WARM_UP_SHARE));
  // The stretch band is the same size as the warm-up one, so the slope is
  // symmetrical and the core is the widest part of any set big enough to have
  // one. `total - warm` keeps it from overlapping when a set is small.
  const stretch = Math.max(1, Math.min(total - warm, warm));
  return Array.from({ length: total }, (_, at) => {
    const index = at + 1;
    const weight: ProblemWeight =
      index <= warm ? 'warmup' : index > total - stretch ? 'stretch' : 'core';
    return { index, weight };
  });
}

/** The set grouped into its bands, in order, skipping any band that is empty. */
export function bandsFor(
  step: Pick<PracticeStep, 'minutes'>,
): { weight: ProblemWeight; slots: ProblemSlot[] }[] {
  const slots = slotsFor(step);
  return (['warmup', 'core', 'stretch'] as ProblemWeight[])
    .map((weight) => ({ weight, slots: slots.filter((slot) => slot.weight === weight) }))
    .filter((band) => band.slots.length > 0);
}

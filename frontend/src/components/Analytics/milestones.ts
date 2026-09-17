/**
 * Every threshold on the analytics page, what it opens, and why it is there.
 *
 * ## Why this is one table
 *
 * The numbers were already in two places and the *words* about them were in
 * five. `STAGE_FLOOR` holds 3, 7, 14 and 30; `NEED_DAYS` holds 14, 21 and 28;
 * and the sentences explaining them were written separately at each call site
 * — a `nextBrings` ternary in the Overview tab, a `promise` string on each of
 * the four `Building` tabs, and a hardcoded list of four rows in the ladder.
 *
 * Nothing enforced agreement between them, and they had already drifted: the
 * ladder promised "Weekly trends" at 7 while the countdown three inches above
 * it promised "your first patterns" for the same threshold. Both sentences
 * were written by somebody sensible; neither knew the other existed.
 *
 * So the thresholds and their copy live together. A number moved here moves
 * everywhere that names it, and a threshold cannot acquire a second
 * explanation without somebody deleting the first.
 *
 * ## `why` and `reward` are different jobs
 *
 * `why` answers "why that number" — it is a statement about evidence, and it
 * exists because "14 days required" reads as a policy somebody chose and
 * "enough history to evaluate performance rather than describe activity" reads
 * as a reason. The thresholds in this product were all picked for an actual
 * reason; the reader was simply never told any of them.
 *
 * `reward` answers "what happens then", concretely and in the second person.
 * "Weekly trends open here" is a category. "Summit will compare this week
 * against the one before it" is a thing that will happen to the reader's own
 * record, which is the version somebody comes back for.
 *
 * ## One entry per number, not one per feature
 *
 * Fourteen is both the `developing` stage and the Recommendations gate, and a
 * reader who is told twice that something happens at 14 has learned that the
 * page is describing its own internals. The entry names everything that opens
 * there in one line.
 */
import { STAGE_FLOOR } from '@/utils/dataMaturity';
import { NEED_DAYS } from './useAnalyticsModel';

export interface Milestone {
  /** Active days it opens at. Days worked, never days on the calendar. */
  need: number;
  /** What opens, as the reader would name it. */
  title: string;
  /** Why that number and not another. A statement about evidence. */
  why: string;
  /** What Summit will actually do once it opens. Concrete, second person. */
  reward: string;
}

/** Ascending, and `nextAfter` relies on it. */
export const MILESTONES: Milestone[] = [
  {
    need: STAGE_FLOOR.early,
    title: 'Your first patterns',
    why: 'Three days is where a tally stops being one day repeated and starts describing how you work.',
    reward: 'Summit will show when in the day you work, and what you actually finish.',
  },
  {
    need: STAGE_FLOOR.weekly,
    title: 'Weekly trends',
    why: 'A week is the shortest stretch that can be held against another week without measuring which days happened to land in the window.',
    reward: 'Summit will compare this week against the one before it.',
  },
  {
    /* Also `NEED_DAYS.recommendations`. One entry, because two lines both
       saying "at 14" is the page describing its own internals. */
    need: STAGE_FLOOR.developing,
    title: 'Performance and recommendations',
    why: 'Enough history to evaluate performance rather than describe activity, and to price advice against an average that means something.',
    reward: 'Summit will grade your record, show where you stand, and name the change worth making first.',
  },
  {
    need: NEED_DAYS.habits,
    title: 'Habit patterns',
    why: 'Three weeks is where a repetition has happened often enough to be a habit rather than a run of good days.',
    reward: 'Summit will name what you do consistently, and tell you when one starts slipping.',
  },
  {
    need: NEED_DAYS.insights,
    title: 'Insights',
    why: 'An explanation needs two comparable stretches to hold against each other, and four weeks is the first point there are two.',
    reward: 'Summit will look for what moves with what, and say why a stretch went the way it did.',
  },
  {
    need: STAGE_FLOOR.full,
    title: 'Full analytics',
    /* Honest about being the thin one. Nothing opens at 30 — see `stageShows`
       in utils/dataMaturity, where `full` is every flag already on. Saying so
       is better than inventing a feature to justify the number. */
    why: 'A month is where the long-range readings stop needing to be qualified.',
    reward: 'Nothing new opens. The notes saying how little record a figure rests on come off.',
  },
];

/** The next threshold above `activeDays`, or null once they are all behind. */
export function nextMilestone(activeDays: number): Milestone | null {
  return MILESTONES.find((step) => activeDays < step.need) ?? null;
}

/** Everything still ahead, nearest first. Reached ones are dropped, not ticked. */
export function milestonesAhead(activeDays: number): Milestone[] {
  return MILESTONES.filter((step) => activeDays < step.need);
}

/**
 * The reason behind one threshold, for a component that knows its own number.
 *
 * `Building` is the caller: each gated tab knows what it needs and wants the
 * sentence explaining it, and looking it up by the figure means the tab and
 * the ladder listing the same threshold cannot explain it two different ways.
 */
export function whyFor(need: number): string {
  return MILESTONES.find((step) => step.need === need)?.why ?? '';
}

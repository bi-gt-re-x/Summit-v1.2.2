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
    why: 'Three days is enough to start seeing how you work.',
    reward: 'See when you work and what you finish.',
  },
  {
    need: STAGE_FLOOR.weekly,
    title: 'Weekly trends',
    why: 'A full week can be compared with the next.',
    reward: 'Compare this week with last week.',
  },
  {
    /* Also `NEED_DAYS.recommendations`. One entry, because two lines both
       saying "at 14" is the page describing its own internals. */
    need: STAGE_FLOOR.developing,
    title: 'Performance and recommendations',
    why: 'Two weeks is enough to judge performance and give advice.',
    reward: 'Get a grade, your ranking and recommendations.',
  },
  {
    need: NEED_DAYS.habits,
    title: 'Habit patterns',
    why: 'Three weeks is enough to spot real habits.',
    reward: 'See your habits and when they slip.',
  },
  {
    need: NEED_DAYS.insights,
    title: 'Insights',
    why: 'Four weeks gives two periods to compare.',
    reward: 'Find out what affects your results and why.',
  },
  {
    need: STAGE_FLOOR.full,
    title: 'Full analytics',
    /* Honest about being the thin one. Nothing opens at 30 — see `stageShows`
       in utils/dataMaturity, where `full` is every flag already on. Saying so
       is better than inventing a feature to justify the number. */
    why: 'A month of data makes long-term figures reliable.',
    reward: 'Everything is unlocked, without the low-data warnings.',
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

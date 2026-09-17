/**
 * The one thing most responsible for a goal not moving, and where to go about it.
 *
 * ## The gap this fills
 *
 * The analytics page could already say *whether* a goal was going to happen
 * (utils/goalHealth), *why it was going the way it was* in terms of its own
 * pace and recency (utils/goalAnalytics), and what to change about the account's
 * habits (utils/advice). What none of them could say is the sentence a reader
 * actually arrives with:
 *
 *     Goal: get 24 on the AMC 8
 *     You are improving, but geometry is the biggest limiter.
 *     ~60% of the work on this goal that went badly is filed under it.
 *
 * That is an *attribution* — one subject named out of the several a goal spans,
 * carrying a share of the shortfall — and it is a different question from all
 * three above, every one of which is blind to which subject the work was in.
 *
 * ## What the share is a share of
 *
 * Two bases, and the panel always says which one it used, because "60%" means
 * nothing until the reader knows what it is 60% of.
 *
 * **`rated`** — of the goal's finished work that the reader themselves marked
 * as having gone badly (`execution` 1 or 2; see the field note in
 * types/models), this share is filed under one subject. This is the closer
 * analogue of accuracy and it is preferred whenever there is enough of it,
 * because it is about how the work *went* rather than about how much is left.
 *
 * **`open`** — of the tasks still open against the goal, this share is filed
 * under one subject. Always available, and the fallback when too little has
 * been rated for the first basis to mean anything.
 *
 * ## What this deliberately refuses to say
 *
 * **Points, marks or accuracy percentages.** Summit records a task's
 * `execution` on a five-point scale that a person types in, not questions
 * right and wrong, so "geometry is costing you 4 points on the AMC 8" is a
 * number nothing in the database supports — the same rule utils/goalAnalytics
 * states about hours. What is counted is tasks, and the sentences say "tasks".
 *
 * **Anything at all, below the floors.** A subject leading 2 of 3 rated tasks
 * is not a finding, it is a coin landing twice, so `MIN_ITEMS` and `MIN_SHARE`
 * have to clear before a limiter exists and the honest answer otherwise is
 * `null`. A page that always names a culprit is a page whose culprits mean
 * nothing.
 */
import { evidenceFor } from './goalHealth';
import { goalReading, type Direction } from './goalAnalytics';
import { treeForSubject } from '@/skills/subjectMap';
import type { Goal, Task } from '@/types';

/** Which pile the share was counted out of. */
export type LimiterBasis = 'rated' | 'open';

/**
 * How badly a task has to have gone to count against its subject.
 *
 * `execution` is 1-5 and absent unless the reader answered. Two and below is
 * the bottom two of five — "it went badly" rather than "it was not my best" —
 * and an absent rating is left out entirely rather than read as a low one, for
 * the reason the field's own note gives in types/models.
 */
const POOR_EXECUTION = 2;

/**
 * The floors, and why there are two.
 *
 * `MIN_ITEMS` is about the pile being big enough to have a majority at all.
 * `MIN_SHARE` is about the leader actually leading: with four subjects at 25%
 * each there is no limiter, there is an even spread, and naming the one that
 * happened to sort first would be the page inventing a culprit.
 */
const MIN_ITEMS = 4;
const MIN_SHARE = 0.4;

export interface GoalLimiter {
  goalId: string;
  goalTitle: string;
  /** Which way the work on the goal is going. From `goalReading`. */
  direction: Direction;
  /** That direction as the clause the panels open with. */
  movement: string;
  /** The subject carrying the shortfall, and what to call it on screen. */
  subjectId: string;
  subjectName: string;
  basis: LimiterBasis;
  /**
   * The subject's share of the pile, 0-100, rounded to the nearest five.
   *
   * Rounded because it is printed with a "~" in front of it: the figure is
   * exact arithmetic over a small pile, and printing "57%" off seven tasks
   * claims a precision the pile does not have.
   */
  share: number;
  /** The counts the share came from, so a panel can print its working. */
  count: number;
  total: number;
  /** The finding, in one sentence, naming the figure. */
  because: string;
  /** The lattice that teaches this subject, opened on the right node. */
  treeHref: string;
  /** The subject's own analytics page — its record, and the work in it. */
  subjectHref: string;
}

/** Turns a direction into the clause the sentence opens with. */
function movementOf(direction: Direction): string {
  if (direction === 'accelerating') return 'You are improving';
  if (direction === 'slowing') return 'You are slowing down';
  if (direction === 'stalled') return 'Nothing has moved lately';
  return 'You are holding steady';
}

/** The subject holding the largest share of a pile, when one clearly does. */
function leaderOf(rows: Task[]): { subjectId: string; count: number } | null {
  const counts = new Map<string, number>();
  rows.forEach((task) => {
    const id = task.subject;
    if (!id) return;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  if (counts.size === 0) return null;

  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  const [subjectId, count] = ranked[0]!;
  // A tie for the lead is not a lead. Two subjects on three each is an even
  // spread wearing a sort order.
  if (ranked.length > 1 && ranked[1]![1] === count) return null;
  return { subjectId, count };
}

/**
 * What is most responsible for this goal not moving, if anything is.
 *
 * `nameOf` turns a catalogue id into the label the rest of the page prints, and
 * `groupOf` is what routes a subject this app has no lattice for — both are
 * passed in rather than looked up here, because this file is arithmetic and the
 * catalogue is a fetch.
 *
 * `today` is a parameter for the same reason it is in utils/goalAnalytics: the
 * whole file is then a pure function of its inputs and can be checked.
 */
export function goalLimiter(
  goal: Goal,
  tasks: Task[],
  nameOf: (id: string) => string,
  groupOf: (id: string) => string | undefined = () => undefined,
  today: Date = new Date(),
): GoalLimiter | null {
  if (goal.status === 'completed') return null;

  const linked = evidenceFor(goal, tasks);
  if (linked.length === 0) return null;

  // The rated pile first: how the work went beats how much of it is left.
  const poor = linked.filter(
    (task) =>
      task.status === 'done'
      && typeof task.execution === 'number'
      && task.execution > 0
      && task.execution <= POOR_EXECUTION,
  );
  const open = linked.filter((task) => task.status !== 'done');

  const pile: { rows: Task[]; basis: LimiterBasis } | null =
    poor.length >= MIN_ITEMS
      ? { rows: poor, basis: 'rated' }
      : open.length >= MIN_ITEMS
        ? { rows: open, basis: 'open' }
        : null;
  if (!pile) return null;

  const lead = leaderOf(pile.rows);
  if (!lead) return null;

  const total = pile.rows.filter((task) => task.subject).length;
  const exact = total > 0 ? lead.count / total : 0;
  if (exact < MIN_SHARE) return null;

  const share = Math.round((exact * 100) / 5) * 5;
  const subjectName = nameOf(lead.subjectId);
  const target = treeForSubject(lead.subjectId, groupOf(lead.subjectId));
  const reading = goalReading(goal, tasks, today);

  const noun = lead.count === 1 ? 'task' : 'tasks';
  const because =
    pile.basis === 'rated'
      ? `${lead.count} of the ${total} ${noun} you rated as going badly on this goal `
        + `are filed under ${subjectName}.`
      : `${lead.count} of the ${total} ${noun} still open against this goal `
        + `${lead.count === 1 ? 'is' : 'are'} filed under ${subjectName}.`;

  return {
    goalId: goal.id,
    goalTitle: goal.title,
    direction: reading.direction,
    movement: movementOf(reading.direction),
    subjectId: lead.subjectId,
    subjectName,
    basis: pile.basis,
    share,
    count: lead.count,
    total,
    because,
    treeHref: `/skill-trees?subject=${encodeURIComponent(lead.subjectId)}`
      + (target.node ? `&node=${encodeURIComponent(target.node)}` : ''),
    subjectHref: `/analytics/subject/${encodeURIComponent(lead.subjectId)}`,
  };
}

/**
 * Every live goal that has a limiter, worst first.
 *
 * "Worst" is the share rather than the goal's priority, and deliberately: this
 * list is about how concentrated a shortfall is, and a 70% concentration is a
 * more useful thing to be told than a 45% one on a goal the reader happened to
 * mark important. Priority orders the goals page; this orders a diagnosis.
 */
export function goalLimiters(
  goals: Goal[],
  tasks: Task[],
  nameOf: (id: string) => string,
  groupOf: (id: string) => string | undefined = () => undefined,
  today: Date = new Date(),
): GoalLimiter[] {
  return goals
    .filter((goal) => goal.status !== 'completed')
    .map((goal) => goalLimiter(goal, tasks, nameOf, groupOf, today))
    .filter((row): row is GoalLimiter => row !== null)
    .sort((a, b) => b.share - a.share);
}

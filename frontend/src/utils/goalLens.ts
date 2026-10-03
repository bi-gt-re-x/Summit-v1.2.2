/**
 * A goal lens — which kind of goal leads, and what the pages lean toward
 * because of it.
 *
 * Chosen on the server (`leading_lens` in backend/tracking/next_actions.py) and
 * returned with the plan from `/api/next_actions`: the plan is ordered through
 * it, the Overview orders its score factors by its priorities, and the
 * Recommendations tab says which goal it is reading through. This file keeps
 * the shape and the one piece of ordering the page does with it.
 */
import type { MetricKey } from '@/components/Analytics/data';
import type { ActionKind } from '@/services/next';

export type LensId = 'accuracy' | 'depth' | 'volume' | 'consistency';

/**
 * What a lens can rank.
 *
 * The five the growth score is built from plus the two the charts add. It is
 * wider than `MetricKey` because the score's factors carry `efficiency`, which
 * is not a chartable series and is still one of the five things a lens has an
 * opinion about — see `analyticalScore`. Every lens lists all seven, so
 * nothing is ranked by omission.
 */
export type LensMetric = MetricKey | 'efficiency';

export interface GoalLens {
  goalId: string;
  goalTitle: string;
  id: LensId;
  /** The lens in two or three words, for the line above the page. */
  label: string;
  /**
   * The metrics this goal makes most worth reading, first is most.
   *
   * Every key here is one the analytics page already charts — see METRICS in
   * components/Analytics/data. A lens cannot invent a measure; it can only say
   * which of the five to read first.
   */
  priorities: LensMetric[];
  /** What this lens says the reader should be watching, in their words. */
  watch: string[];
  /** Why this lens and not another, naming the figure. One sentence. */
  because: string;
  /** Mean difficulty of the work aimed at the goal, or null if too little. */
  difficulty: number | null;
  /** How many rated tasks that mean came from. */
  rated: number;
  /**
   * Multipliers on the next-action ranking, by kind. 1 leaves a kind alone.
   *
   * Deliberately narrow — 0.8 to 1.5. A lens is a reordering of things that all
   * earned their place; one that could multiply by five would be choosing the
   * plan rather than tilting it, and an overdue task would drop below a
   * revision suggestion because of what the reader is aiming at this term.
   */
  weights: Partial<Record<ActionKind, number>>;
}

/** The four lenses, as everything about them except which goal chose it. */
/**
 * Reorder metric keys so the lens's priorities lead.
 *
 * Stable within each half: anything the lens does not mention keeps the order
 * it arrived in, so a lens that cares about two metrics moves those two and
 * leaves the rest exactly as they were.
 */
export function throughLens<T>(
  rows: T[],
  keyOf: (row: T) => LensMetric,
  lens: GoalLens | null,
): T[] {
  if (!lens) return rows;
  const rank = new Map(lens.priorities.map((key, at) => [key, at]));
  return [...rows].sort(
    (a, b) => (rank.get(keyOf(a)) ?? 99) - (rank.get(keyOf(b)) ?? 99),
  );
}

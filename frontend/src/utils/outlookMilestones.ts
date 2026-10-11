/**
 * When the five-year chart's two paces reach things the reader cares about.
 *
 * The chart says "more XP with the changes". This says what that buys: the
 * next round levels, each active XP goal, and the next round lifetime total,
 * each dated at today's pace and with every change made. A milestone more than
 * ten years out at a pace is not dated, because a date that far off is a
 * division, not a forecast.
 */
import { LEVEL_XP_STEP } from '@/services/constants';
import { levelForTotalXp } from './format';
import { compact } from './growthSummary';
import type { Goal } from '@/types';

export interface OutlookMilestone {
  id: string;
  label: string;
  kind: 'level' | 'goal' | 'total';
  /** XP still to earn. */
  needed: number;
  /** Days to reach it at today's pace, or null past the horizon. */
  atPace: number | null;
  /** Days to reach it with the changes, or null past the horizon. */
  withChanges: number | null;
  /** A goal's own date, when it has one. */
  deadline?: string;
}

export const HORIZON_DAYS = 365 * 10;

/** Round lifetime totals worth naming. */
const TOTALS = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000];

/** Total XP at which `level` is reached: level N takes N × the step to leave. */
export function xpForLevel(level: number): number {
  return (LEVEL_XP_STEP * (level - 1) * level) / 2;
}

function daysTo(needed: number, perYear: number): number | null {
  if (needed <= 0) return 0;
  if (perYear <= 0) return null;
  const days = Math.ceil((needed / perYear) * 365);
  return days > HORIZON_DAYS ? null : days;
}

export function outlookMilestones({
  banked,
  current,
  improved,
  goals,
}: {
  banked: number;
  current: number;
  improved: number;
  goals: Goal[];
}): OutlookMilestone[] {
  const rows: Array<Omit<OutlookMilestone, 'atPace' | 'withChanges'>> = [];

  // The next two round levels: fives while the levels come quickly, tens after.
  const level = levelForTotalXp(banked).level;
  const step = level < 20 ? 5 : 10;
  const next = Math.ceil((level + 1) / step) * step;
  [next, next + step].forEach((target) => {
    rows.push({ id: `level-${target}`, label: `Level ${target}`, kind: 'level', needed: xpForLevel(target) - banked });
  });

  goals
    .filter(
      (goal) =>
        goal.status === 'active' &&
        (goal.measure === 'xp' || goal.goal_type === 'xp') &&
        Number(goal.target_xp) > Number(goal.current_xp),
    )
    .slice(0, 2)
    .forEach((goal) => {
      rows.push({
        id: `goal-${goal.id}`,
        label: goal.title,
        kind: 'goal',
        needed: Number(goal.target_xp) - Number(goal.current_xp),
        ...(goal.deadline ? { deadline: goal.deadline } : {}),
      });
    });

  const total = TOTALS.find((mark) => mark > banked);
  if (total) rows.push({ id: `total-${total}`, label: `${compact(total)} XP in total`, kind: 'total', needed: total - banked });

  return rows.map((row) => ({
    ...row,
    atPace: daysTo(row.needed, current),
    withChanges: daysTo(row.needed, improved),
  }));
}

/** "Mar 2027" for a number of days from `from`. */
export function monthFrom(days: number, from: Date = new Date()): string {
  const at = new Date(from.getTime() + days * 86_400_000);
  return at.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** "8 months sooner", "2 years sooner", "3 weeks sooner". */
export function sooner(days: number): string {
  if (days >= 365 * 2) return `${Math.round(days / 365)} years sooner`;
  if (days >= 60) return `${Math.round(days / 30.4)} months sooner`;
  if (days >= 14) return `${Math.round(days / 7)} weeks sooner`;
  return days >= 1 ? `${days} day${days === 1 ? '' : 's'} sooner` : 'Same time';
}

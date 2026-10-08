/**
 * How hard a task is, from what it is worth.
 *
 * XP is the only thing a reader ever sets — no dialog in the app asks for a
 * priority — so the band has to follow from it, and it has to follow the same
 * way everywhere. It did not: the calendar's dialog banded a new task at 33
 * and 66 while the day panel labelled the same task off the same numbers, and
 * the dashboard's dialog sent no priority at all, so a 90 XP task created
 * there was stored as "medium" and drawn on the grid in the medium colour.
 *
 * One rule, in one place, on the boundaries the reader was given:
 *
 *    10– 40  Easy
 *    40– 80  Light
 *    80–120  Medium
 *   120–160  Intermediate+
 *   160–200  Hard
 *   200–250  Very Challenging
 *
 * The lower bound of each band is the one that belongs to it — 40 is Light,
 * not the top of Easy — because that is how a range written "40-80" reads.
 * The top of the last band is the only closed end, and it is `MAX_TASK_XP`.
 */
import type { TaskPriority } from '@/types';
import { RULES } from '@/utils/sharedRules';

/** The XP a task may be worth. The dialogs' sliders run between these.
    From shared/rules.json, which the server reads too. */
export const MIN_TASK_XP: number = RULES.task_xp.min;
export const MAX_TASK_XP: number = RULES.task_xp.max;

/** A band's name, as the cards print it ("Easy" … "Very Challenging"). */
export type XpBand = string;

/** The six bands, low to high, each named by the XP it starts at. */
export const XP_BANDS: ReadonlyArray<{ from: number; label: XpBand }> = RULES.task_xp.bands;

/**
 * Where the six bands fold onto the three the database stores.
 *
 * `tasks.priority` is a three-value column — low, medium, high — with a CHECK
 * behind it, and it is what colours a grid block and sorts the list. Six names
 * cannot be kept in it, so the two scales are related rather than equal: the
 * bands are the words a reader is shown, and each pair of them is one stored
 * priority. Nothing derives one from the other except here.
 */
export const MEDIUM_FROM: number = RULES.task_xp.medium_from;
export const HARD_FROM: number = RULES.task_xp.hard_from;

export function xpToPriority(xp: number): TaskPriority {
  if (xp >= HARD_FROM) return 'high';
  if (xp >= MEDIUM_FROM) return 'medium';
  return 'low';
}

/** The band a number falls in. Anything under the floor reads as the floor. */
export function xpToBand(xp: number): XpBand {
  let found: XpBand = XP_BANDS[0]!.label;
  for (const band of XP_BANDS) {
    if (xp >= band.from) found = band.label;
  }
  return found;
}

/** The same six bands, as the words the cards print. */
export function xpToDifficulty(xp: number): XpBand {
  return xpToBand(xp);
}

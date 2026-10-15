/**
 * What finishing a task late costs, as the server charges it.
 *
 * Each day late takes `cut_per_day` of a task's XP, down to `floor` of it and
 * never below 1 XP. A due date with no time is due by the end of that day; one
 * with a time is late from the minute after, and counts as at least a day.
 * Tasks finished before `since` were paid in full and are shown that way.
 *
 * The server's copy is backend/tracking/overdue.py; both run the same cases
 * (shared/cases/overdue.json), and the numbers come from shared/rules.json.
 */
import type { Task } from '@/types';
import { RULES } from './sharedRules';

const { cut_per_day: CUT_PER_DAY, floor: FLOOR, since: SINCE } = RULES.overdue;
const DAY = 86_400_000;

type Stamp = string | Date | null | undefined;

function parse(raw: Stamp): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  let text = String(raw).trim();
  if (text.endsWith('Z')) text = text.slice(0, -1);
  text = text.replace(' ', 'T');
  const at = new Date(text.includes('T') ? text : `${text}T00:00:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}

function hasTime(raw: Stamp): boolean {
  const text = String(raw).trim();
  return text.length > 10 && (text[10] === 'T' || text[10] === ' ');
}

/** Midnight-to-midnight days from `from` to `to`, by the local calendar. */
function calendarDays(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY);
}

/** Whole days `at` is past `due`. 0 when on time or undated. */
export function daysLate(due: Stamp, at: Stamp = new Date()): number {
  const dueAt = parse(due);
  const when = parse(at);
  if (!dueAt || !when) return 0;
  const days = calendarDays(dueAt, when);
  if (!(due instanceof Date) && hasTime(due)) return when > dueAt ? Math.max(1, days) : 0;
  return Math.max(0, days);
}

/** The share of a task's XP still paid when it is `days` late, 0-100. */
export function keptPercent(days: number): number {
  if (days <= 0) return 100;
  return Math.max(Math.round(FLOOR * 100), 100 - Math.round(CUT_PER_DAY * 100) * days);
}

/** The XP a task is worth finished at `at`. */
export function lateXp(xp: number | string | null | undefined, due: Stamp, at: Stamp = new Date()): number {
  const full = Math.trunc(Number(xp) || 0);
  const when = parse(at);
  if (full <= 0 || !when) return full;
  if (calendarDays(when, parse(SINCE) as Date) > 0) return full;
  const percent = keptPercent(daysLate(due, when));
  if (percent >= 100) return full;
  return Math.max(1, Math.floor((full * percent + 50) / 100));
}

/** An open task past its due date. */
export function isOverdue(task: Pick<Task, 'status' | 'due_date'>, now: Date = new Date()): boolean {
  return task.status !== 'done' && daysLate(task.due_date, now) > 0;
}

/** What a finished task actually paid: its XP, less any late cut. */
export function earnedXp(task: Pick<Task, 'xp_value' | 'due_date' | 'completed_at'>): number {
  return task.completed_at ? lateXp(task.xp_value, task.due_date, task.completed_at) : Number(task.xp_value) || 0;
}

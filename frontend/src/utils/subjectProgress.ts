/**
 * One subject over a period, as rates a reader can act on.
 *
 * The Growth tab's subject rows used to print a skill score — "49 → 57", "106
 * rated tasks behind this" — which is a number about the record that a reader
 * cannot do anything with. What they can act on is how the work in that
 * subject is actually going: whether they finish what they plan, whether it
 * goes well, whether it lands on time, whether it is hard enough, and whether
 * the goals it serves are moving. This module reads all five from the task
 * list and the goals the page already holds, for the period and the period of
 * the same length before it.
 *
 * Every rate carries its numerator and denominator, so a card can print "82%"
 * and, under it, "18 of 22 tasks" — the rate is the headline and the counts
 * are how it is checked. A rate over nothing is null, never zero: a subject
 * with no deadlines has not missed all of them.
 */
import { goalNumbers } from '@/components/Goals/numbers';
import { goalHealth, type GoalHealth } from './goalHealth';
import { goalIdsOf } from './goalLinks';
import type { Goal, Task } from '@/types';

const DAY = 86_400_000;

/** One rate, this period and the one before. */
export interface Rate {
  /** 0-100, or null over nothing. */
  rate: number | null;
  num: number;
  den: number;
  /** The same rate over the previous period, or null where there is none. */
  before: number | null;
}

export interface SubjectGoal {
  goal: Goal;
  /** 0-100. */
  progress: number;
  health: GoalHealth;
}

export interface SubjectProgress {
  /** Of the tasks added in the period, how many are finished. */
  completion: Rate;
  /** Of the rated tasks finished in the period, how many went well (4-5 of 5). */
  wentWell: Rate;
  /** Of the tasks with a deadline finished in the period, how many made it. */
  onTime: Rate;
  /** Open tasks past their deadline right now. */
  overdue: number;
  /** Of the rated tasks finished in the period, how many were hard (4-5 of 5). */
  hard: Rate;
  /** Tasks finished in the period, whenever they were added. */
  finished: number;
  /** When something was last finished here. */
  lastDone: string | null;
  /** Active goals this subject serves, the ones in trouble first. */
  goals: SubjectGoal[];
}

const dayOf = (iso: string | undefined) => (iso ? String(iso).slice(0, 10) : '');
const num = (value: unknown) => Number(value) || 0;

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

/** Whether a finished task made its deadline. The server's flag where it set one. */
function madeIt(task: Task): boolean {
  if (typeof task.met_deadline === 'boolean') return task.met_deadline;
  return dayOf(task.completed_at) <= dayOf(task.due_date);
}

/** The four rates over one window of days, `[from, to]` inclusive. */
function window(tasks: Task[], from: string, to: string) {
  const inside = (day: string) => day !== '' && (from === '' || day >= from) && day <= to;

  const added = tasks.filter((task) => inside(dayOf(task.created_at)));
  const addedDone = added.filter((task) => task.status === 'done').length;

  const done = tasks.filter((task) => task.status === 'done' && inside(dayOf(task.completed_at)));
  const rated = done.filter((task) => num(task.difficulty) > 0 && num(task.execution) > 0);
  const dated = done.filter((task) => dayOf(task.due_date) !== '');

  return {
    completion: [addedDone, added.length] as const,
    wentWell: [rated.filter((task) => num(task.execution) >= 4).length, rated.length] as const,
    onTime: [dated.filter(madeIt).length, dated.length] as const,
    hard: [rated.filter((task) => num(task.difficulty) >= 4).length, rated.length] as const,
    finished: done.length,
  };
}

/** Active goals this subject is work for: named on the goal, or by a task. */
function goalsFor(subject: string, subjectTasks: Task[], goals: Goal[]): Goal[] {
  const viaTasks = new Set(subjectTasks.flatMap((task) => goalIdsOf(task)));
  return goals.filter((goal) => {
    if (goal.status !== 'active') return false;
    const named = String(goal.subject_ids ?? '')
      .split(',')
      .map((id) => id.trim())
      .includes(subject);
    return named || viaTasks.has(String(goal.id));
  });
}

const TROUBLE: Record<string, number> = { 'off-track': 0, 'at-risk': 1, 'not-started': 2, 'on-track': 3 };

export interface SubjectProgressInput {
  subject: string;
  /** Every task the account has; filtered to the subject here. */
  tasks: Task[];
  goals: Goal[];
  /** Days in the period, or null for the whole record. */
  days: number | null;
  /** The period's last day, ISO. */
  toIso: string;
  /** Today, for "overdue now" and goal health. */
  today?: Date;
}

export function subjectProgress({
  subject,
  tasks,
  goals,
  days,
  toIso,
  today = new Date(),
}: SubjectProgressInput): SubjectProgress {
  const mine = tasks.filter((task) => task.subject === subject);
  const toMs = Date.parse(`${toIso}T00:00:00Z`);
  const shift = (n: number) => new Date(toMs - n * DAY).toISOString().slice(0, 10);

  const from = days === null || Number.isNaN(toMs) ? '' : shift(days - 1);
  const now = window(mine, from, toIso);
  // The period before, of the same length. None for the whole record.
  const then = days === null || Number.isNaN(toMs) ? null : window(mine, shift(days * 2 - 1), shift(days));

  const pair = (key: 'completion' | 'wentWell' | 'onTime' | 'hard'): Rate => ({
    rate: rate(now[key][0], now[key][1]),
    num: now[key][0],
    den: now[key][1],
    before: then ? rate(then[key][0], then[key][1]) : null,
  });

  const todayIso = dayOf(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
  );
  const overdue = mine.filter(
    (task) => task.status === 'todo' && dayOf(task.due_date) !== '' && dayOf(task.due_date) < todayIso,
  ).length;

  const lastDone = mine
    .filter((task) => task.status === 'done' && task.completed_at)
    .reduce<string | null>((latest, task) => {
      const day = dayOf(task.completed_at);
      return latest === null || day > latest ? day : latest;
    }, null);

  const linked = goalsFor(subject, mine, goals)
    .map((goal) => ({
      goal,
      progress: Math.round(Math.max(0, Math.min(100, goalNumbers(goal).progress))),
      health: goalHealth(goal, tasks, today),
    }))
    .sort((a, b) => (TROUBLE[a.health.state] ?? 9) - (TROUBLE[b.health.state] ?? 9));

  return {
    completion: pair('completion'),
    wentWell: pair('wentWell'),
    onTime: pair('onTime'),
    overdue,
    hard: pair('hard'),
    finished: now.finished,
    lastDone,
    goals: linked,
  };
}

/**
 * The card's opening sentence, assembled from its own figures.
 *
 * Never written — every clause is one of the rates beside it, so the sentence
 * cannot say something the tiles do not.
 */
export function subjectVerdict(read: SubjectProgress, periodText: string): string {
  const { completion, wentWell, overdue, goals, finished } = read;
  if (completion.den === 0 && finished === 0) {
    return `Nothing was planned or finished here in ${periodText}.`;
  }

  const first = completion.den > 0
    ? `You finished ${completion.num} of the ${completion.den} tasks you planned`
    : `You finished ${finished} ${finished === 1 ? 'task' : 'tasks'}`;

  let second = '';
  if (wentWell.rate !== null) {
    second = `${wentWell.rate}% of the rated work went well`;
    if (wentWell.before !== null && Math.abs(wentWell.rate - wentWell.before) >= 10) {
      second += wentWell.rate > wentWell.before
        ? ` (up from ${wentWell.before}%)`
        : ` (down from ${wentWell.before}%)`;
    }
  }

  let third = '';
  const trouble = goals.find((entry) => entry.health.state === 'off-track' || entry.health.state === 'at-risk');
  if (overdue > 0) third = `${overdue} ${overdue === 1 ? 'task is' : 'tasks are'} past due.`;
  else if (trouble) third = `“${trouble.goal.title}” is ${trouble.health.label.toLowerCase()}.`;

  return `${first}${second ? `, and ${second}` : ''}.${third ? ` ${third}` : ''}`;
}

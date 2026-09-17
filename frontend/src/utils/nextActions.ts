/**
 * "What should I do next?" — a short plan for the time you actually have.
 *
 * Every other page in this app answers a question about the past. This one
 * answers the only question a reader has at nine in the morning: given the
 * goals I set, the deadlines coming, the subjects going badly and the forty
 * minutes I have before I leave — what do I do *now*?
 *
 * The output is a plan, not a list:
 *
 *     You have 45 minutes
 *     → Finish "Chapter 7 problem set"        due today            25 min
 *     → Practise Geometry                     weakest rating       20 min
 *
 * ## Why it is a budget and not a ranking
 *
 * A ranked list of eight things is a to-do list with extra steps, and the
 * reader already has one of those. The budget is what makes this different: it
 * forces the page to *choose*, and a page that has chosen three things is one
 * you can act on before your coffee goes cold. Everything that did not fit is
 * kept in `more`, which the panel shows on request rather than by default.
 *
 * ## Where the minutes come from
 *
 * From the account's own record, never from a guess about how long a task
 * "should" take. `typicalMinutes` is the median time this person's finished
 * tasks have actually taken; a practice block is a round half of a sitting.
 * Where there is no history the fallbacks are deliberately modest, because an
 * over-long estimate makes the plan not fit and the reader stop trusting it.
 *
 * ## The eight sources, and why each earns its place
 *
 * Overdue and due-today work outranks everything, because a plan that ignores
 * a deadline the reader already knows about is a plan they will close. Goal
 * and milestone work comes next — it is the work they said mattered. Then the
 * conditions the record has noticed: a subject rated worse than the rest, one
 * that has not been touched in a fortnight, work rated badly and never revisited,
 * a task that has sat untouched long enough to be a decision rather than a
 * task, and — only when the day is still empty — the streak.
 *
 * The streak is last on purpose. It is the cheapest possible reason to do
 * something, and an app that leads with it every morning has taught its reader
 * that the point is the number rather than the work.
 *
 * ## What it will not do
 *
 * It will not invent work. Every action either names a task that exists, a goal
 * that exists, or a subject with real history behind it. If the record supports
 * nothing, `actions` comes back empty and the panel says so — a made-up
 * suggestion is worse than no suggestion, because it is indistinguishable from
 * the real ones.
 */
import type { Goal, GrowthDay, Task } from '@/types';
import { RECENT_DAYS, seeded } from './recent';

/** The time budgets offered. The middle one is the default. */
export const BUDGETS = [15, 30, 45, 60, 90, 120] as const;
export const DEFAULT_BUDGET = 45;

/** Fallback minutes for a task with no timing history behind it. */
const FALLBACK_TASK_MINUTES = 25;

/** A practice block, where the suggestion is a subject rather than a task. */
const PRACTICE_MINUTES = 30;

/** Nothing shorter than this is worth a line in the plan. */
const MIN_SLOT = 10;

/** Days a subject can go untouched before it counts as dropped. */
const NEGLECT_DAYS = 12;

/** Days a task can sit untouched before it is a decision rather than a task. */
const STALE_DAYS = 14;

/** Execution at or below this is work worth going back to. */
const POOR_EXECUTION = 2;

/** Fewest finished tasks in a subject before its rating is worth acting on. */
const SUBJECT_FLOOR = 5;

/** Most badly-rated tasks a single review action will ask for. */
const REVIEW_MAX = 5;

const num = (value: unknown) => Number(value) || 0;
const day = 86_400_000;

export type ActionKind =
  | 'overdue'
  | 'due'
  | 'goal'
  | 'weak-subject'
  | 'neglected'
  | 'review'
  | 'stale'
  | 'streak';

export interface NextAction {
  id: string;
  kind: ActionKind;
  /** The imperative — what to actually do. */
  title: string;
  /** Why this one, in the reader's own figures. One sentence. */
  because: string;
  /** Minutes to set aside. */
  minutes: number;
  /** An existing task this is about, where there is one. */
  taskId?: string;
  /** A subject id, where the action is about one. */
  subject?: string;
  /** A goal id, where the action serves one. */
  goalId?: string;
  /** Ranking weight, before the budget is applied. */
  weight: number;
}

export interface Plan {
  /** The budget asked for, in minutes. */
  budget: number;
  /** What fits, in the order it should be done. */
  actions: NextAction[];
  /** Minutes of the budget left over. */
  spare: number;
  /** Earned a place but did not fit. */
  more: NextAction[];
  /** Minutes the plan accounts for. */
  planned: number;
}

/**
 * The median time this account's finished tasks actually take.
 *
 * Median rather than mean: one task left open over a holiday and closed three
 * weeks later would drag a mean into hours and make every estimate useless.
 * Null when too little has been timed to say.
 */
export function typicalMinutes(finished: Task[]): number | null {
  const timed = finished
    .map((task) => num(task.completion_seconds))
    .filter((seconds) => seconds > 0)
    .sort((a, b) => a - b);
  if (timed.length < 5) return null;
  const middle = timed[Math.floor(timed.length / 2)]!;
  const minutes = Math.round(middle / 60);
  /* Clamped, because both ends of this are unusable as a plan: a two-minute
     median makes every slot look free, and a two-hour one makes nothing fit. */
  return Math.min(60, Math.max(MIN_SLOT, minutes));
}

export interface PlanInput {
  /** Every task on the account, open and finished. */
  tasks: Task[];
  /** The account's goals. */
  goals: Goal[];
  /** The recent day series — see utils/recent. */
  days: GrowthDay[];
  /** Turns a subject id into its name. */
  nameOf: (id: string) => string;
  /** Minutes available. */
  budget: number;
  /** Now. Passed in so the plan is testable and stable within a render. */
  now?: Date;
  /** The week stamp, so ties break the same way all week. */
  stamp: string;
  /**
   * What the reader is aiming at, as a tilt on the ranking. Optional.
   *
   * Every candidate below still earns its place on its own evidence, and the
   * lens never adds one or removes one — it multiplies weights inside a narrow
   * band so that, between two suggestions the record likes equally, the one
   * that serves the goal goes first. See utils/goalLens for why the band is
   * narrow: a plan that could be rewritten by what somebody is aiming at this
   * term would put a revision nudge above an overdue essay.
   */
  lens?: { weights: Partial<Record<ActionKind, number>> } | null;
}

/**
 * Build the plan.
 *
 * Candidates are gathered from every source, sorted by weight, then packed into
 * the budget greedily — highest weight first, skipping anything that no longer
 * fits. Greedy rather than optimal on purpose: the reader expects the most
 * important thing to be in the plan, and an optimiser that drops the overdue
 * essay because two small tasks fill the slot more neatly is solving the wrong
 * problem.
 */
export function buildPlan({
  tasks,
  goals,
  days,
  nameOf,
  budget,
  now = new Date(),
  stamp,
  lens = null,
}: PlanInput): Plan {
  const candidates = gather({ tasks, goals, days, nameOf, now, stamp, lens });

  const actions: NextAction[] = [];
  const more: NextAction[] = [];
  let left = budget;

  candidates.forEach((item) => {
    if (item.minutes <= left) {
      actions.push(item);
      left -= item.minutes;
    } else {
      more.push(item);
    }
  });

  /* A budget shorter than anything on the list used to come back empty, which
     is the one answer a planner must never give: the reader asked what to do
     with fifteen minutes and was told nothing, while an overdue essay sat two
     rows down in "more". Fifteen minutes of the most important thing is a real
     answer — you do not have to finish a task to have started it — so the top
     candidate is taken at the length actually available and says so. */
  if (actions.length === 0 && more.length > 0 && budget >= MIN_SLOT) {
    const first = more.shift()!;
    actions.push({
      ...first,
      minutes: budget,
      because: `${first.because} It needs about ${first.minutes} minutes; this is a start on it, not the whole thing.`,
    });
    left = 0;
  }

  /* One subject practised twice, or two tasks from the same goal, is a plan
     that has found one thing to say and said it three times. */
  const planned = actions.reduce((sum, item) => sum + item.minutes, 0);
  return { budget, actions, spare: Math.max(0, budget - planned), more, planned };
}

function gather({
  tasks,
  goals,
  days,
  nameOf,
  now,
  stamp,
  lens = null,
}: Omit<PlanInput, 'budget'> & { now: Date }): NextAction[] {
  const found: NextAction[] = [];
  const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    .toISOString()
    .slice(0, 10);

  const open = tasks.filter((task) => task.status !== 'done');
  const finished = tasks.filter((task) => task.status === 'done');
  const slot = typicalMinutes(finished) ?? FALLBACK_TASK_MINUTES;

  const daysAgo = (iso?: string) => {
    if (!iso) return null;
    const at = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
    if (Number.isNaN(at)) return null;
    return Math.floor((now.getTime() - at) / day);
  };

  // ---- 1. Overdue -----------------------------------------------------------
  open
    .filter((task) => task.due_date && task.due_date.slice(0, 10) < todayIso)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    .slice(0, 3)
    .forEach((task, index) => {
      const late = daysAgo(task.due_date) ?? 0;
      found.push({
        id: `overdue-${task.id}`,
        kind: 'overdue',
        title: `Finish “${task.title}”`,
        because: `It was due ${late === 1 ? 'yesterday' : `${late} days ago`}, and it is the oldest thing still open.`,
        minutes: slot,
        taskId: task.id,
        subject: task.subject,
        goalId: task.goal_id,
        weight: 1000 - index * 10 + Math.min(late, 30),
      });
    });

  // ---- 2. Due today ---------------------------------------------------------
  open
    .filter((task) => task.due_date && task.due_date.slice(0, 10) === todayIso)
    .slice(0, 3)
    .forEach((task, index) => {
      found.push({
        id: `due-${task.id}`,
        kind: 'due',
        title: `Finish “${task.title}”`,
        because: 'Due today.',
        minutes: slot,
        taskId: task.id,
        subject: task.subject,
        goalId: task.goal_id,
        weight: 900 - index * 10 + (task.priority === 'high' ? 25 : 0),
      });
    });

  // ---- 3. The goal under the most time pressure -----------------------------
  goals
    .filter((goal) => goal.status === 'active' && goal.deadline)
    .map((goal) => {
      const left = daysAgo(goal.deadline);
      const remaining = left === null ? null : -left;
      const progress = num(goal.progress);
      return { goal, remaining, progress };
    })
    .filter(
      (entry): entry is { goal: Goal; remaining: number; progress: number } =>
        entry.remaining !== null && entry.remaining >= 0 && entry.remaining <= 45,
    )
    /* Behind pace: how far through the time against how far through the work.
       A goal ahead of its own schedule is not a thing to be told about today. */
    .map((entry) => {
      const started = new Date(
        `${(entry.goal.start_date || entry.goal.created_at).slice(0, 10)}T00:00:00`,
      ).getTime();
      const ends = new Date(`${entry.goal.deadline.slice(0, 10)}T00:00:00`).getTime();
      const span = Math.max(1, ends - started);
      const elapsed = Math.min(1, Math.max(0, (now.getTime() - started) / span));
      return { ...entry, behind: elapsed * 100 - entry.progress };
    })
    .filter((entry) => entry.behind > 8)
    .sort((a, b) => b.behind - a.behind)
    .slice(0, 2)
    .forEach((entry, index) => {
      const stone = (entry.goal.milestones ?? [])
        .filter((item) => item.status !== 'done')
        .sort((a, b) => a.position - b.position)[0];
      const linked = open.find(
        (task) => task.goal_id === entry.goal.id || (stone && task.milestone_id === stone.id),
      );
      found.push({
        id: `goal-${entry.goal.id}`,
        kind: 'goal',
        title: linked
          ? `Finish “${linked.title}” for ${entry.goal.title}`
          : stone
            ? `Work on “${stone.title}” for ${entry.goal.title}`
            : `Put an hour into ${entry.goal.title}`,
        because: `${entry.remaining} day${entry.remaining === 1 ? '' : 's'} left and it is ${Math.round(entry.behind)} points behind where the calendar says it should be.`,
        minutes: slot,
        taskId: linked?.id,
        goalId: entry.goal.id,
        weight: 800 - index * 20 + Math.min(entry.behind, 40),
      });
    });

  // ---- 4. The subject going worst -------------------------------------------
  const bySubject = new Map<string, Task[]>();
  finished.forEach((task) => {
    if (!task.subject) return;
    const list = bySubject.get(task.subject) ?? [];
    list.push(task);
    bySubject.set(task.subject, list);
  });

  const subjectRatings = [...bySubject.entries()]
    .map(([subject, list]) => {
      const rated = list.filter((task) => num(task.execution) > 0);
      return {
        subject,
        count: list.length,
        rated: rated.length,
        execution: rated.length
          ? rated.reduce((sum, task) => sum + num(task.execution), 0) / rated.length
          : null,
      };
    })
    .filter((row) => row.count >= SUBJECT_FLOOR && row.execution !== null);

  if (subjectRatings.length >= 2) {
    const worst = subjectRatings.sort((a, b) => a.execution! - b.execution!)[0]!;
    const average =
      subjectRatings.reduce((sum, row) => sum + row.execution!, 0) / subjectRatings.length;
    if (worst.execution! < average - 0.3) {
      found.push({
        id: `weak-${worst.subject}`,
        kind: 'weak-subject',
        title: `Practise ${nameOf(worst.subject)}`,
        because: `You rate your ${nameOf(worst.subject)} work ${worst.execution!.toFixed(1)} out of 5, against ${average.toFixed(1)} across everything else — ${worst.rated} rated tasks.`,
        minutes: PRACTICE_MINUTES,
        subject: worst.subject,
        weight: 620 + (average - worst.execution!) * 40,
      });
    }
  }

  // ---- 5. Work you rated badly and never went back to -----------------------
  const poor = finished.filter((task) => {
    const age = daysAgo(task.completed_at);
    return (
      num(task.execution) > 0 &&
      num(task.execution) <= POOR_EXECUTION &&
      age !== null &&
      age <= RECENT_DAYS
    );
  });
  if (poor.length >= 3) {
    /* A session, not an inbox. Fifty badly-rated tasks is a real finding and a
       useless instruction — "go back over 50 things" is the sort of suggestion
       a reader closes the tab on. The action names how many actually fit in the
       slot and the reason carries the true total, which is the honest way round:
       the scale of the problem is stated, the ask is one sitting. */
    const takeable = Math.min(poor.length, REVIEW_MAX);
    const newest = [...poor].sort((a, b) =>
      String(b.completed_at ?? '').localeCompare(String(a.completed_at ?? '')),
    );
    const subject = newest.find((task) => task.subject)?.subject;
    found.push({
      id: 'review-poor',
      kind: 'review',
      title: `Redo the ${takeable} most recent tasks you rated badly`,
      because:
        poor.length > takeable
          ? `You marked ${poor.length} tasks 1 or 2 out of 5 for execution in the last fortnight. Start with the newest ${takeable} — they are the ones still fresh enough to fix.`
          : `You marked ${poor.length} tasks 1 or 2 out of 5 for execution in the last fortnight and none of them has been revisited.`,
      minutes: Math.min(30, Math.max(MIN_SLOT, takeable * 6)),
      subject,
      weight: 560 + Math.min(poor.length, 12) * 6,
    });
  }

  // ---- 6. A subject that has been dropped -----------------------------------
  const neglected = [...bySubject.entries()]
    .map(([subject, list]) => {
      const last = list
        .map((task) => daysAgo(task.completed_at))
        .filter((age): age is number => age !== null)
        .sort((a, b) => a - b)[0];
      return { subject, count: list.length, since: last ?? null };
    })
    .filter((row) => row.count >= SUBJECT_FLOOR && row.since !== null && row.since >= NEGLECT_DAYS)
    .sort((a, b) => b.since! - a.since!)[0];

  if (neglected) {
    found.push({
      id: `neglected-${neglected.subject}`,
      kind: 'neglected',
      title: `Come back to ${nameOf(neglected.subject)}`,
      because: `${neglected.since} days since the last one, after ${neglected.count} tasks. This is the point where a subject stops being paused and starts being dropped.`,
      minutes: PRACTICE_MINUTES,
      subject: neglected.subject,
      weight: 540 + Math.min(neglected.since!, 40),
    });
  }

  // ---- 7. A task old enough to be a decision --------------------------------
  const stale = open
    .map((task) => ({ task, age: daysAgo(task.created_at) }))
    .filter((row) => row.age !== null && row.age >= STALE_DAYS && !row.task.due_date)
    .sort((a, b) => b.age! - a.age!)[0];

  if (stale) {
    found.push({
      id: `stale-${stale.task.id}`,
      kind: 'stale',
      title: `Do or drop “${stale.task.title}”`,
      because: `It has been on the list ${stale.age} days without a date. Either it happens this week or it is not really a task.`,
      minutes: Math.min(slot, 20),
      taskId: stale.task.id,
      subject: stale.task.subject,
      weight: 420 + Math.min(stale.age!, 30),
    });
  }

  // ---- 8. The streak, and only if today is still empty ----------------------
  const today = days[days.length - 1];
  const todayEmpty =
    today && today.date === todayIso && num(today.tasks_completed) === 0 && num(today.xp_earned) === 0;
  if (todayEmpty) {
    const quickest = open
      .filter((task) => !task.due_date)
      .sort((a, b) => num(a.xp_value) - num(b.xp_value))[0];
    found.push({
      id: 'streak',
      kind: 'streak',
      title: quickest ? `Close “${quickest.title}”` : 'Close one small task',
      because: 'Nothing is logged today yet. One finished task keeps the day on the record.',
      minutes: MIN_SLOT,
      taskId: quickest?.id,
      subject: quickest?.subject,
      weight: 380,
    });
  }

  /* One line per task and one per subject: two suggestions about the same
     Geometry are one suggestion the reader has to read twice. */
  const seenTask = new Set<string>();
  const seenSubject = new Set<string>();
  /* The tilt, applied to the weight each rule already set.
 
     On the weight rather than on the order, so it composes with the seeded
     tiebreak below instead of fighting it, and so a kind the lens does not
     mention is untouched rather than implicitly demoted. `weight` is not shown
     anywhere, so multiplying it changes the order and nothing a reader sees is
     a different number because of it. */
  const tilt = (item: NextAction) => item.weight * (lens?.weights?.[item.kind] ?? 1);

  return found
    .sort((a, b) => tilt(b) - tilt(a) || seeded(stamp + a.id) - seeded(stamp + b.id))
    .filter((item) => {
      if (item.taskId) {
        if (seenTask.has(item.taskId)) return false;
        seenTask.add(item.taskId);
      }
      /* Only the subject-shaped suggestions collapse. A task that happens to be
         Geometry should not block the "practise Geometry" line — one is a
         specific piece of work and the other is an hour of study. */
      if (item.subject && (item.kind === 'weak-subject' || item.kind === 'neglected')) {
        if (seenSubject.has(item.subject)) return false;
        seenSubject.add(item.subject);
      }
      return true;
    });
}

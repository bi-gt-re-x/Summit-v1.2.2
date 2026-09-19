/**
 * Discovered patterns — the answer to "why am I improving?"
 *
 * A chart of XP over time shows *that* something changed. This module looks for
 * the conditions the better work happens under, and says them as sentences:
 *
 *     Your Mathematics execution is 14% higher on tasks you finish before 5pm.
 *     You take on 31% harder work in the morning than after lunch.
 *     Your average task rating has risen four weeks running.
 *
 * Every one of them is the same shape underneath: split this account's own
 * finished tasks into two groups by some condition it can actually observe,
 * compare a measure across the split, and state the difference only when both
 * groups are big enough for the difference to mean anything.
 *
 * ## Why so much of this file is refusing to speak
 *
 * A pattern-finder run over enough splits will always find something. Twenty
 * comparisons at a 5% threshold produce one "finding" from noise alone, and a
 * page that reports it is worse than a page with no patterns at all — it is
 * confidently wrong about the reader's own life, which is the one thing an app
 * built on somebody's record must never be.
 *
 * So: `MIN_GROUP` tasks on *both* sides of every split, `MIN_LIFT` before a
 * difference is spoken about at all, and a `strength` on every finding that
 * says plainly how much weight it can carry. A pattern with 8 tasks behind it
 * is labelled as such rather than printed in the same voice as one with 60.
 *
 * Nothing here is a correlation coefficient dressed up in a sentence. Two
 * groups, one measure, one difference, and the counts printed beside it.
 *
 * ## What it deliberately does not do
 *
 * It does not claim cause. "Higher before 5pm" is not "finishing earlier makes
 * you better" — the reader may simply schedule their easy revision for the
 * evening. The sentences are written to state the association and stop, and
 * where a finding suggests something to try, that goes in `soWhat` as a
 * suggestion to test rather than a conclusion to accept.
 */
import type { GrowthDay, Task } from '@/types';
import type { Strength } from './insight';
import { PATTERN_DAYS, mean, pctChange } from './recent';
import { isGoalWork } from '@/utils/goalLinks';

/** Fewest tasks on each side of a split before the split is worth reading. */
const MIN_GROUP = 6;

/** Below this difference, the two groups are the same group. */
const MIN_LIFT = 10;

/** A run of weeks this long is a trend rather than a coincidence. */
const MIN_RUN = 3;

const num = (value: unknown) => Number(value) || 0;

export type PatternKind = 'timing' | 'subject' | 'streak' | 'context' | 'quality';

export interface Pattern {
  id: string;
  kind: PatternKind;
  /** The finding, as one sentence the reader could repeat to somebody. */
  text: string;
  /** The evidence, in counts — what the sentence is standing on. */
  basis: string;
  /** Signed percentage difference. Drives the figure shown beside the text. */
  lift: number;
  /** How much weight this can carry, from the sample it is drawn from. */
  strength: Strength;
  /** Something to try, where the finding suggests one. Never a conclusion. */
  soWhat?: string;
  /** Ranking weight. */
  weight: number;
}

const rated = (task: Task) => num(task.difficulty) > 0 && num(task.execution) > 0;

const hourOf = (task: Task): number | null => {
  if (!task.completed_at) return null;
  const at = new Date(task.completed_at);
  return Number.isNaN(at.getTime()) ? null : at.getHours();
};

/**
 * How much weight a two-group finding can carry.
 *
 * Sample size first, because a large difference over ten tasks is still ten
 * tasks. A finding only reaches `strong` when both groups are properly
 * populated *and* the gap is wide enough that a couple of tasks moving between
 * them would not close it.
 */
function strengthFor(smaller: number, lift: number): Strength {
  const size = Math.abs(lift);
  if (smaller >= 20 && size >= 15) return 'strong';
  if (smaller >= 12 && size >= 12) return 'likely';
  return 'weak';
}

interface Split {
  withCount: number;
  withoutCount: number;
  lift: number;
  smaller: number;
}

/**
 * Compare one measure across a condition, or return null if it cannot be said.
 *
 * `pick` returns the measure for a task, or null when that task cannot answer —
 * an unrated task has no execution, an untimed one has no duration — and those
 * are dropped from both sides rather than counted as zero.
 */
function split(
  tasks: Task[],
  when: (task: Task) => boolean | null,
  pick: (task: Task) => number | null,
): Split | null {
  const yes: number[] = [];
  const no: number[] = [];
  tasks.forEach((task) => {
    const side = when(task);
    if (side === null) return;
    const value = pick(task);
    if (value === null) return;
    (side ? yes : no).push(value);
  });
  if (yes.length < MIN_GROUP || no.length < MIN_GROUP) return null;
  const lift = pctChange(mean(yes), mean(no));
  if (lift === null || Math.abs(lift) < MIN_LIFT) return null;
  return {
    withCount: yes.length,
    withoutCount: no.length,
    lift,
    smaller: Math.min(yes.length, no.length),
  };
}

const upDown = (lift: number) => (lift >= 0 ? 'higher' : 'lower');
const pct = (lift: number) => `${Math.round(Math.abs(lift))}%`;

export interface PatternInput {
  /** The day series, already narrowed to the pattern window. */
  days: GrowthDay[];
  /** Tasks finished inside that window. */
  finished: Task[];
  /** Turns a subject id into its name. */
  nameOf: (id: string) => string;
}

/**
 * Everything the record supports saying about the conditions of good work.
 *
 * Ordered by weight, which is sample size and effect together — so a finding
 * over sixty tasks outranks a louder one over twelve, which is the opposite of
 * what sorting by the headline figure would do.
 */
export function discoverPatterns({ days, finished, nameOf }: PatternInput): Pattern[] {
  const found: Pattern[] = [];
  if (finished.length < MIN_GROUP * 2) return found;

  const dated = finished.filter((task) => hourOf(task) !== null);

  // ---- Execution before and after 5pm -------------------------------------
  const evening = split(
    dated,
    (task) => hourOf(task)! < 17,
    (task) => (rated(task) ? num(task.execution) : null),
  );
  if (evening) {
    found.push({
      id: 'exec-before-five',
      kind: 'timing',
      text: `You rate your own work ${pct(evening.lift)} ${upDown(evening.lift)} on tasks you finish before 5pm.`,
      basis: `${evening.withCount} tasks finished before 5pm, ${evening.withoutCount} after.`,
      lift: evening.lift,
      strength: strengthFor(evening.smaller, evening.lift),
      soWhat:
        evening.lift > 0
          ? 'Try moving one important task earlier in the day.'
          : 'Check what you do in the mornings. It may be the tasks, not the time.',
      weight: evening.smaller + Math.abs(evening.lift),
    });
  }

  // ---- Difficulty taken on in the morning ---------------------------------
  const morning = split(
    dated,
    (task) => hourOf(task)! < 12,
    (task) => (rated(task) ? num(task.difficulty) : null),
  );
  if (morning) {
    found.push({
      id: 'difficulty-morning',
      kind: 'timing',
      text: `Your morning tasks are ${pct(morning.lift)} ${morning.lift >= 0 ? 'harder' : 'easier'} than your afternoon ones.`,
      basis: `${morning.withCount} tasks finished in the morning, ${morning.withoutCount} later.`,
      lift: morning.lift,
      strength: strengthFor(morning.smaller, morning.lift),
      soWhat:
        morning.lift > 0
          ? 'Keep your mornings free for hard work.'
          : 'Try doing one hard task first thing each day this week.',
      weight: morning.smaller + Math.abs(morning.lift),
    });
  }

  // ---- Weekday against weekend --------------------------------------------
  const weekend = split(
    dated,
    (task) => {
      const at = new Date(task.completed_at!).getDay();
      return at === 0 || at === 6;
    },
    (task) => (rated(task) ? num(task.execution) : null),
  );
  if (weekend) {
    found.push({
      id: 'exec-weekend',
      kind: 'context',
      text: `Your execution is ${pct(weekend.lift)} ${upDown(weekend.lift)} on weekends than weekdays.`,
      basis: `${weekend.withCount} tasks at the weekend, ${weekend.withoutCount} in the week.`,
      lift: weekend.lift,
      strength: strengthFor(weekend.smaller, weekend.lift),
      soWhat:
        weekend.lift > 0
          ? 'You do your best work on weekends. Save hard tasks for then.'
          : 'Your weekday work goes better.',
      weight: weekend.smaller + Math.abs(weekend.lift),
    });
  }

  // ---- Work that names a goal ---------------------------------------------
  const linked = split(
    finished,
    (task) => isGoalWork(task) || Boolean(task.milestone_id),
    (task) => (rated(task) ? num(task.execution) : null),
  );
  if (linked) {
    found.push({
      id: 'exec-goal-linked',
      kind: 'context',
      text: `Tasks linked to a goal are rated ${pct(linked.lift)} ${upDown(linked.lift)} than other tasks.`,
      basis: `${linked.withCount} tasks linked to a goal, ${linked.withoutCount} unlinked.`,
      lift: linked.lift,
      strength: strengthFor(linked.smaller, linked.lift),
      soWhat:
        linked.lift > 0
          ? 'Link more tasks to your goals. You can do this from the Goals page.'
          : undefined,
      weight: linked.smaller + Math.abs(linked.lift),
    });
  }

  // ---- Long days against short ones ---------------------------------------
  const focusValues = days.map((day) => num(day.focus_minutes)).filter((value) => value > 0);
  if (focusValues.length >= MIN_GROUP * 2) {
    const sorted = [...focusValues].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const long = days.filter((day) => num(day.focus_minutes) > median);
    const short = days.filter(
      (day) => num(day.focus_minutes) > 0 && num(day.focus_minutes) <= median,
    );
    if (long.length >= MIN_GROUP && short.length >= MIN_GROUP) {
      const lift = pctChange(
        mean(long.map((day) => num(day.tasks_completed))),
        mean(short.map((day) => num(day.tasks_completed))),
      );
      if (lift !== null && Math.abs(lift) >= MIN_LIFT) {
        found.push({
          id: 'long-days',
          kind: 'context',
          text: `On days with over ${Math.round(median)} minutes of focus, you finish ${pct(lift)} ${lift >= 0 ? 'more' : 'fewer'} tasks.`,
          basis: `${long.length} longer days against ${short.length} shorter ones.`,
          lift,
          strength: strengthFor(Math.min(long.length, short.length), lift),
          soWhat:
            lift > 0
              ? `Longer focus days work well for you. Aim for ${Math.round(median)}+ minutes.`
              : 'Longer focus days are not helping. More time is not the answer here.',
          weight: Math.min(long.length, short.length) + Math.abs(lift),
        });
      }
    }
  }

  // ---- Per subject, against everything else -------------------------------
  const bySubject = new Map<string, Task[]>();
  finished.forEach((task) => {
    if (!task.subject) return;
    const list = bySubject.get(task.subject) ?? [];
    list.push(task);
    bySubject.set(task.subject, list);
  });

  /* Every subject against everything else — but only the two extremes are
     kept. On an account with five subjects this rule can produce five findings
     that are all the same finding seen from different ends, and a panel of
     "Maths is 18% better, Physics is 15% better, Chemistry is 4% worse" tells
     the reader nothing they could act on. The best and the worst are the two
     that carry information; the middle is the middle. */
  const subjectRows: Pattern[] = [];
  bySubject.forEach((list, subject) => {
    const others = finished.filter((task) => task.subject && task.subject !== subject);
    const mine = list.filter(rated).map((task) => num(task.execution));
    const rest = others.filter(rated).map((task) => num(task.execution));
    if (mine.length < MIN_GROUP || rest.length < MIN_GROUP) return;
    const lift = pctChange(mean(mine), mean(rest));
    if (lift === null || Math.abs(lift) < MIN_LIFT) return;
    const smaller = Math.min(mine.length, rest.length);
    subjectRows.push({
      id: `subject-exec-${subject}`,
      kind: 'subject',
      text: `You rate ${nameOf(subject)} ${pct(lift)} ${lift >= 0 ? 'higher' : 'lower'} than your other subjects.`,
      basis: `${mine.length} rated ${nameOf(subject)} tasks against ${rest.length} elsewhere.`,
      lift,
      strength: strengthFor(smaller, lift),
      soWhat:
        lift < 0
          ? `Try a different approach to ${nameOf(subject)}.`
          : undefined,
      weight: smaller + Math.abs(lift),
    });
  });

  if (subjectRows.length > 0) {
    const byLift = [...subjectRows].sort((a, b) => a.lift - b.lift);
    const worst = byLift[0]!;
    const best = byLift[byLift.length - 1]!;
    found.push(worst);
    if (best.id !== worst.id) found.push(best);
  }

  // ---- A rating that has been climbing for weeks --------------------------
  const weekly = weeklyExecution(finished);
  if (weekly.length >= MIN_RUN + 1) {
    let run = 0;
    for (let at = weekly.length - 1; at > 0; at -= 1) {
      if (weekly[at]!.value > weekly[at - 1]!.value) run += 1;
      else break;
    }
    if (run >= MIN_RUN) {
      const first = weekly[weekly.length - 1 - run]!.value;
      const last = weekly[weekly.length - 1]!.value;
      found.push({
        id: 'rating-run',
        kind: 'streak',
        text: `Your ratings have risen ${run} weeks in a row, from ${first.toFixed(1)} to ${last.toFixed(1)} out of 5.`,
        basis: `${weekly.slice(-run - 1).reduce((sum, week) => sum + week.count, 0)} rated tasks across ${run + 1} weeks.`,
        lift: pctChange(last, first) ?? 0,
        strength: run >= 4 ? 'strong' : 'likely',
        soWhat: 'Whatever you changed recently is working. Keep it up.',
        weight: 60 + run * 8,
      });
    }
  }

  return found.sort((a, b) => b.weight - a.weight);
}

interface WeekPoint {
  key: string;
  value: number;
  count: number;
}

/**
 * Mean execution per calendar week, oldest first.
 *
 * Weeks with fewer than three rated tasks are dropped rather than averaged: a
 * single task's rating is not a week's, and letting one through is what turns a
 * quiet week into a fake step in a run.
 */
function weeklyExecution(finished: Task[]): WeekPoint[] {
  const buckets = new Map<string, number[]>();
  finished.filter(rated).forEach((task) => {
    if (!task.completed_at) return;
    const at = new Date(task.completed_at);
    if (Number.isNaN(at.getTime())) return;
    const monday = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    const list = buckets.get(key) ?? [];
    list.push(num(task.execution));
    buckets.set(key, list);
  });
  return [...buckets.entries()]
    .filter(([, values]) => values.length >= 3)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, values]) => ({ key, value: mean(values), count: values.length }));
}

/** The window these run over, exported so the panel can say so. */
export const PATTERN_WINDOW = PATTERN_DAYS;

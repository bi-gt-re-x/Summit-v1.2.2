/**
 * Goals worth setting that are not set — the one piece of goal analysis the
 * app could not already do.
 *
 * Everything else about goals answers "how is this one going". This answers
 * "what is missing", which is a question about the *set* rather than about any
 * member of it, and it is the only one that can be asked of an account with no
 * goals at all.
 *
 * ## Every suggestion is drawn from the record, never from a template
 *
 * The tempting version of this file is a list of good goals — "build a
 * streak", "finish 100 tasks" — ranked by nothing and true of everybody. That
 * is a page telling you about its own defaults. Each rule below fires only on
 * a fact about this account, prints that fact as its reason, and stays silent
 * when the fact is absent. An account the record cannot say anything useful
 * about gets nothing here, which is the honest answer and the same one the
 * rest of the analytics page gives.
 *
 * ## Silence is the common case, and that is correct
 *
 * A reader with four well-paced goals covering their live subjects should see
 * this panel empty. Advice that is always present is advice nobody reads, and
 * the goals page is where goals get made — this is a prompt, not a queue.
 */
import { goalNumbers, measureOf } from '@/components/Goals/numbers';
import type { Goal, GrowthDay, Task } from '@/types';

/** A subject's share of the window's XP, and whether a goal already names it. */
export interface SubjectShare {
  id: string;
  label: string;
  xp: number;
  share: number;
}

export interface GoalSuggestion {
  id: string;
  /** The instruction, in the imperative. */
  title: string;
  /** The fact from the record that produced it. One sentence. */
  because: string;
  /** What kind of goal it would be, for the label on the way out. */
  kind: 'outcome' | 'streak' | 'subject' | 'date' | 'first';
}

/** Below this a subject is not really being worked on. */
const SUBJECT_SHARE = 0.12;

/** A run of days worked, at or above which consistency is worth formalising. */
const STREAK_WORTH_KEEPING = 5;

/** How many suggestions is a prompt rather than a queue. */
const MAX_SUGGESTIONS = 3;

export interface SuggestInput {
  goals: Goal[];
  tasks: Task[];
  days: GrowthDay[];
  /** Subject shares over the window, biggest first. */
  subjects: SubjectShare[];
  currentStreak: number;
}

export function suggestGoals(input: SuggestInput): GoalSuggestion[] {
  const { goals, tasks, subjects, currentStreak } = input;
  const active = goals.filter((goal) => goal.status !== 'completed');
  const out: GoalSuggestion[] = [];

  /* Nothing at all. The one case where a suggestion is not competing with
     anything the reader has already decided, so it leads and it is the only
     one — offering three to somebody with none is a form to fill in. */
  if (active.length === 0) {
    const busiest = subjects[0];
    return [
      {
        id: 'first',
        kind: 'first',
        title: busiest ? `Set a goal on ${busiest.label}` : 'Set your first goal',
        because: busiest
          ? `Most of your work is in ${busiest.label}, but it has no goal.`
          : 'You have no goals yet, so there is nothing to measure against.',
      },
    ];
  }

  /* A subject carrying real work with no goal pointed at it. The strongest
     rule here, because the gap is between what the reader is *doing* and what
     they have said they are doing — and the record is unambiguous about the
     first half. */
  const named = new Set(
    active.flatMap((goal) =>
      String(goal.subject_ids || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  );
  const orphan = subjects.find((row) => row.share >= SUBJECT_SHARE && !named.has(row.id));
  if (orphan) {
    out.push({
      id: `subject-${orphan.id}`,
      kind: 'subject',
      title: `Aim a goal at ${orphan.label}`,
      because: `${Math.round(orphan.share * 100)}% of your recent work was ${orphan.label}, which has no goal.`,
    });
  }

  /* Every goal is a counter. A counter cannot be missed — XP only goes up —
     so an account whose every goal is one has nothing on it that can report
     bad news, which is the failure mode the tile row on the Overview exists
     to avoid. */
  const measures = new Set(active.map((goal) => measureOf(goal)));
  const allCounters = [...measures].every((measure) =>
    ['xp', 'streak', 'tasks', 'focus'].includes(measure),
  );
  if (allCounters && active.length >= 2) {
    out.push({
      id: 'outcome',
      kind: 'outcome',
      title: 'Set one goal that is not a counter',
      because:
        'Your goals only count up, so they can’t show when you fall behind. Add one with checkpoints or a target.',
    });
  }

  /* A streak worth keeping, with nothing protecting it. */
  const hasStreakGoal = active.some((goal) => measureOf(goal) === 'streak');
  if (!hasStreakGoal && currentStreak >= STREAK_WORTH_KEEPING) {
    out.push({
      id: 'streak',
      kind: 'streak',
      title: `Put a streak goal behind your ${currentStreak} days`,
      because: `You're on a ${currentStreak}-day streak. A streak goal helps you keep it.`,
    });
  }

  /* Open-ended goals that are actually moving. A date is what turns "one day"
     into a pace that can be read, and it is only worth suggesting for a goal
     with work behind it — putting a deadline on something dormant is a way to
     be late rather than a way to finish. */
  const moving = active.filter((goal) => {
    if (goal.deadline) return false;
    if (goalNumbers(goal).progress <= 0) return false;
    return tasks.some((task) => task.goal_id === goal.id && task.status === 'done');
  });
  if (moving.length > 0 && moving[0]) {
    out.push({
      id: `date-${moving[0].id}`,
      kind: 'date',
      title: `Put a date on "${moving[0].title}"`,
      because:
        moving.length === 1
          ? 'It has no due date, so there is no way to tell if it is on track.'
          : `${moving.length} of your goals have no due date, so there is no way to tell if they are on track.`,
    });
  }

  return out.slice(0, MAX_SUGGESTIONS);
}

/**
 * How much of the account's finished work is aimed at a goal.
 *
 * One figure, used in two places — the Goals tab states it and the Insights
 * tab prints it as a line. Tasks that carry a goal, over tasks finished in the
 * same window; null when nothing was finished, because a share of nothing is
 * not zero percent.
 */
export function goalWorkShare(tasks: Task[]): { share: number; aimed: number; total: number } | null {
  const done = tasks.filter((task) => task.status === 'done');
  if (done.length === 0) return null;
  const aimed = done.filter((task) => task.goal_id).length;
  return { share: aimed / done.length, aimed, total: done.length };
}

// --------------------------------------------------------------------------
// The line at the head of the tab
// --------------------------------------------------------------------------
/**
 * Everything on this tab, in one sentence of about a dozen words.
 *
 * Assembled from the figures rather than written, so it cannot drift from the
 * panels underneath it — the same rule `howItIsCalculated` and `habitLead`
 * follow. Three clauses at most: how many, what state they are in, and where
 * the work is actually going. A clause whose figure is missing is dropped
 * rather than hedged, so a thin account gets a shorter sentence instead of a
 * vaguer one.
 *
 * Short on purpose. It is the thing a reader who opens this tab and reads
 * nothing else should leave with, and at thirty words nobody reads it either.
 */
export function goalHeadline(input: {
  active: number;
  behind: number;
  completed: number;
  /** The subject the most goal-linked work went to, if one stands out. */
  focusSubject: string | null;
  /** Share of finished work aimed at any goal, 0-1, or null. */
  aimedShare: number | null;
  /**
   * Which half of the count the sentence opens on — `toneRules().leadWithStrength`.
   *
   * The same rule Summary follows on the Overview, applied to the one sentence
   * this tab opens with: gentle names what is holding and then what is not,
   * blunt names the shortfall first. **Both orders carry both figures**, and
   * neither changes what `goalsOverview` counted — a goal that is behind is
   * behind at every setting. Default is the blunt order, which is what this
   * sentence did before the setting reached it.
   */
  leadWithStrength?: boolean;
}): string {
  const { active, behind, completed, focusSubject, aimedShare, leadWithStrength } = input;

  if (active === 0) {
    return completed > 0
      ? `No live goals. ${completed} finished — nothing is aimed anywhere right now.`
      : 'No goals yet, so nothing on this page has a target to be read against.';
  }

  const one = active === 1;
  /* Nothing behind reads the same either way — there is no weak half to lead
     with — so the order only does anything when there is something to order. */
  const holding = active - behind;
  const head =
    leadWithStrength && behind > 0
      ? `${holding} of ${active} holding`
      : `${active} ${one ? 'goal' : 'goals'} live`;
  const state =
    behind === 0
      ? one
        ? 'and on track'
        : 'and none behind'
      : leadWithStrength
        ? `and ${behind} ${behind === 1 ? 'is' : 'are'} not`
        : `and ${behind} behind`;

  /* The third clause is whichever of the two is the more useful thing to know,
     never both — two trailing clauses is how a dozen words becomes twenty.
     A majority of unaimed work outranks naming a subject, because it says the
     rest of the tab is describing a minority of what the reader does. */
  if (aimedShare !== null && aimedShare < 0.5) {
    return `${head}, ${state}, but most of your work is not aimed at any of them.`;
  }
  if (focusSubject) {
    return `${head}, ${state}, with most of the work going to ${focusSubject}.`;
  }
  return `${head}, ${state}.`;
}

// --------------------------------------------------------------------------
// The pace map
// --------------------------------------------------------------------------
export interface PacePoint {
  id: string;
  title: string;
  /** Share of the goal's own window that has gone, 0-1.2 — see below. */
  elapsed: number;
  /** Share of the goal that is done, 0-1. */
  progress: number;
  /** Priority, 1-10, which the chart draws as the dot's size. */
  weight: number;
  state: string;
}

/**
 * Every goal as a point of "time gone" against "work done".
 *
 * The chart this feeds has one idea in it: the diagonal. A goal exactly on
 * pace sits on the line where those two shares are equal, and everything below
 * it is behind. That is a comparison the reader cannot make from a list of
 * percentages, because "40% done" means nothing until you know whether 20% or
 * 90% of the time has gone.
 *
 * Only goals with both a start and a deadline: without a deadline there is no
 * window for time to be a share *of*, and a point plotted at an invented x
 * would be the one thing on this page that was made up. They are counted out
 * loud by the panel instead.
 *
 * `elapsed` is allowed past 1 and capped at 1.2, so an overdue goal sits just
 * off the right edge rather than being clamped onto it beside goals that are
 * merely due today — the distinction between "late" and "due" is the one this
 * chart most needs to keep.
 */
export function paceMap(
  goals: Goal[],
  health: (goal: Goal) => string,
  today: Date = new Date(),
): { points: PacePoint[]; undated: number } {
  const live = goals.filter((goal) => goal.status !== 'completed');
  const points: PacePoint[] = [];
  let undated = 0;

  live.forEach((goal) => {
    const start = Date.parse(`${String(goal.start_date || goal.created_at).slice(0, 10)}T00:00:00`);
    const end = Date.parse(`${String(goal.deadline).slice(0, 10)}T00:00:00`);
    if (!goal.deadline || Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      undated += 1;
      return;
    }
    const elapsed = Math.max(0, Math.min(1.2, (today.getTime() - start) / (end - start)));
    points.push({
      id: goal.id,
      title: goal.title,
      elapsed,
      progress: Math.max(0, Math.min(1, goalNumbers(goal).progress / 100)),
      weight: Math.max(1, Math.min(10, Math.trunc(Number(goal.priority)) || 5)),
      state: health(goal),
    });
  });

  return { points, undated };
}

// --------------------------------------------------------------------------
// Where the work actually went
// --------------------------------------------------------------------------
export interface EffortRow {
  id: string;
  title: string;
  /** Priority as the reader set it, 0-1 of the maximum. */
  priority: number;
  /** This goal's share of all goal-aimed finished work, 0-1. */
  effort: number;
  finished: number;
}

/**
 * What the reader said mattered, against what they actually worked on.
 *
 * The one reading on this tab that neither figure gives on its own: a goal at
 * priority 9 holding 4% of the work is a real finding, and it is invisible in
 * both the goals list (which sorts by priority) and the task list (which knows
 * nothing about priority).
 *
 * Shares of the goal-aimed work rather than raw counts, because the question
 * is allocation. Goals with no finished work still appear — a zero bar against
 * a tall priority is the strongest row this can produce, and dropping it would
 * hide exactly the case worth seeing.
 */
export function effortAgainstPriority(goals: Goal[], tasks: Task[]): EffortRow[] {
  const live = goals.filter((goal) => goal.status !== 'completed');
  if (live.length === 0) return [];

  const done = tasks.filter((task) => task.status === 'done' && task.goal_id);
  const counts = new Map<string, number>();
  done.forEach((task) => {
    const id = String(task.goal_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  const aimed = live.reduce((sum, goal) => sum + (counts.get(goal.id) ?? 0), 0);

  return live
    .map((goal) => {
      const finished = counts.get(goal.id) ?? 0;
      return {
        id: goal.id,
        title: goal.title,
        priority: Math.max(1, Math.min(10, Math.trunc(Number(goal.priority)) || 5)) / 10,
        effort: aimed > 0 ? finished / aimed : 0,
        finished,
      };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6);
}

// --------------------------------------------------------------------------
// Checkpoints reached, over time
// --------------------------------------------------------------------------
export interface ReachedMonth {
  key: string;
  label: string;
  count: number;
}

/**
 * Checkpoints reached per month — the only real history goals have.
 *
 * A goal's progress is not recorded over time anywhere; only its current value
 * is stored, so "progress over the last six months" cannot be drawn without
 * inventing the middle. What *is* dated is every checkpoint the reader has
 * ticked, because `completed_at` is written when they tick it — so this is the
 * honest version of the same question, and it is a count rather than a curve.
 *
 * Empty months are kept. A gap is the finding here, and a chart that skipped
 * the quiet months would draw four scattered checkpoints as a steady rhythm.
 */
export function checkpointsByMonth(goals: Goal[], months = 6, today: Date = new Date()): ReachedMonth[] {
  const out: ReachedMonth[] = [];
  const cursor = new Date(today.getFullYear(), today.getMonth(), 1);

  for (let back = months - 1; back >= 0; back--) {
    const at = new Date(cursor.getFullYear(), cursor.getMonth() - back, 1);
    out.push({
      key: `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`,
      label: at.toLocaleDateString(undefined, { month: 'short' }),
      count: 0,
    });
  }

  const index = new Map(out.map((row) => [row.key, row]));
  goals.forEach((goal) => {
    (goal.milestones ?? []).forEach((stone) => {
      if (stone.status !== 'done' || !stone.completed_at) return;
      const row = index.get(String(stone.completed_at).slice(0, 7));
      if (row) row.count += 1;
    });
  });

  return out;
}

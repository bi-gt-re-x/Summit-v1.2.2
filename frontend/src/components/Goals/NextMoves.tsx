/**
 * The half of the goals page that answers "so what do I do now".
 *
 * ## Why this exists
 *
 * Everything else on the page describes a goal: how far into it you are, which
 * checkpoint is next, whether the date is going to hold. All of that is the
 * present tense of a plan, and a plan you can only read is a plan you do not
 * act on. A goals page that stops at description is a Notion database with a
 * progress bar on it.
 *
 * So these read the same rows the rest of the page does and answer a
 * different question. `NextMoves` says which specific tasks move a goal, and
 * lets you tick one off without leaving. `Momentum` says whether the last week
 * actually went anywhere. What the reader is carrying is said once, in the
 * header — see `GoalsState` in ./Outcome.
 *
 * ## Nothing here invents work
 *
 * Every row in `NextMoves` is a real open task that names a goal, through
 * `goal_id` or through a `milestone_id` belonging to one. It does not propose
 * tasks, and it does not turn checkpoints into pretend ones: a goal with
 * nothing linked shows as exactly that, because "you have not connected any
 * work to this" is the useful thing to say to somebody who has not.
 */
import { useMemo, useState } from 'react';
import { categoryOf } from './Outcome';
import { goalNumbers } from './numbers';
import type { Goal, Task } from '@/types';
import { goalIdsOf } from '@/utils/goalLinks';

const DAY = 86_400_000;

/** The window `Momentum` reads. A week, because that is the unit people plan in. */
export const MOMENTUM_DAYS = 7;

/** Every goal a task could be pointing at, by the two ids that can point at one. */
function goalIndex(goals: Goal[]): Map<string, Goal> {
  const index = new Map<string, Goal>();
  for (const goal of goals) {
    index.set(goal.id, goal);
    for (const milestone of goal.milestones ?? []) index.set(milestone.id, goal);
  }
  return index;
}

/**
 * The goal a task is work toward, or undefined. The strongest of its goals —
 * the hand-made link first, then the best match — wins over the checkpoint.
 */
export function goalOf(task: Task, index: Map<string, Goal>): Goal | undefined {
  for (const id of goalIdsOf(task)) {
    const goal = index.get(id);
    if (goal) return goal;
  }
  return task.milestone_id ? index.get(task.milestone_id) : undefined;
}

const at = (iso?: string): number | null => {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : time;
};

// ---------------------------------------------------------------------------
// Next moves
// ---------------------------------------------------------------------------
export interface Move {
  task: Task;
  goal: Goal;
  /** Seconds the block was scheduled for, when it is a block. */
  planned: number | null;
  /** Days past its date. 0 or less means it is not late. */
  late: number;
}

// ---------------------------------------------------------------------------
// Momentum
// ---------------------------------------------------------------------------
export interface MomentumReading {
  done: number;
  /** Everything that was on the week: finished, plus what was due and is not. */
  total: number;
  /** Which of the last seven days had a goal-linked completion. */
  days: boolean[];
}

/**
 * Whether the last week actually went anywhere.
 *
 * The denominator is the honest part. It is not "every task you have", which
 * would make a long backlog look like failure, and it is not "what you
 * finished", which would make every week 100%. It is what the week was
 * actually asked to carry: the goal-linked tasks finished inside it, plus the
 * goal-linked tasks that were due inside it and are still open. A week where
 * nothing was due and nothing was done has no reading at all, and says so.
 */
export function momentum(
  goals: Goal[],
  tasks: Task[],
  today: Date = new Date(),
  span = MOMENTUM_DAYS,
): MomentumReading {
  const index = goalIndex(goals);
  const now = today.getTime();
  const from = now - span * DAY;
  const days = Array.from({ length: span }, () => false);

  let done = 0;
  let missed = 0;

  for (const task of tasks) {
    if (!goalOf(task, index)) continue;

    const finished = at(task.completed_at);
    if (task.status === 'done' && finished !== null && finished >= from && finished <= now) {
      done += 1;
      const slot = span - 1 - Math.floor((now - finished) / DAY);
      if (slot >= 0 && slot < span) days[slot] = true;
      continue;
    }

    const due = at(task.due_date);
    if (task.status !== 'done' && due !== null && due >= from && due <= now) missed += 1;
  }

  return { done, total: done + missed, days };
}

export function Momentum({
  goals,
  tasks,
  today = new Date(),
}: {
  goals: Goal[];
  tasks: Task[];
  today?: Date;
}) {
  const reading = useMemo(() => momentum(goals, tasks, today), [goals, tasks, today]);

  if (reading.total === 0) {
    return (
      <p className="gx-empty">
        Nothing was due or finished toward a goal this week.
      </p>
    );
  }

  const pct = Math.round((reading.done / reading.total) * 100);

  return (
    <div className="gx-mo">
      <p className="gx-mo-line">
        You finished <strong>{reading.done}</strong> of <strong>{reading.total}</strong>{' '}
        goal-linked {reading.total === 1 ? 'task' : 'tasks'} this week.
      </p>

      <div
        className="gx-mo-bar"
        role="img"
        aria-label={`${pct} percent of this week's goal-linked tasks finished`}
      >
        <span style={{ width: `${pct}%` }} />
      </div>

      {/* One square a day, so a good week and a week that was all Monday do not
          read the same. The bar above cannot tell those apart. */}
      <div className="gx-mo-days" aria-hidden="true">
        {reading.days.map((lit, index) => (
          <i key={index} className={lit ? 'is-lit' : ''} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Growth areas
// ---------------------------------------------------------------------------
export interface Area {
  /** The subject id, or the empty string for goals filed under none. */
  id: string;
  label: string;
  tone: string;
  /** 0-100, this area's share of everything still outstanding. */
  share: number;
  /** The goals it is made of, most outstanding first. */
  goals: Goal[];
}

/**
 * Where the unfinished work is concentrated, by subject.
 *
 * ## Why the figure is a share of what is left, not progress
 *
 * It used to be the weighted mean progress of each *category* — Math 62%,
 * Coding 40% — which is two problems in one line. A mean tells you how the
 * goals in a group are doing on average, and an average is exactly the wrong
 * shape for "what should I work on": a category holding one finished goal and
 * one abandoned one reads 50% and looks unremarkable. And grouping by category
 * made the rows almost tautological, because the category *is* the grouping —
 * clicking "Math" to be shown your maths goals is not a finding.
 *
 * So it is the subject, which is the dimension the rest of the app already
 * analyses against, and the figure is each subject's share of the total
 * outstanding work: how much of everything you have left to do sits here.
 * Those shares sum to 100, which is what makes them comparable — "32% of what
 * is left is geometry" is a sentence somebody can act on in a way that
 * "geometry is 62% done" is not.
 *
 * ## How one goal's shortfall is counted
 *
 * What is left of it — 100 minus its progress — weighted by the priority the
 * reader gave it, because a neglected goal they marked 9 is more of a problem
 * than one they marked 2. A goal filed under several subjects splits its
 * shortfall evenly between them rather than counting whole in each: counting
 * it twice would push the shares past 100 and quietly make multi-subject goals
 * look like the biggest problem in every area they touch.
 *
 * A goal with no subject at all is kept, under its own row. It is not
 * invisible work — and it is also the only row a reader can fix by filing it,
 * which is worth saying rather than hiding.
 */
export function growthAreas(goals: Goal[], nameOf: (id: string) => string): Area[] {
  const rows = new Map<string, { weight: number; goals: Array<{ goal: Goal; shortfall: number }> }>();
  let total = 0;

  for (const goal of goals) {
    if (goal.status === 'completed') continue;

    const priority = Math.max(1, Math.min(10, Math.trunc(Number(goal.priority)) || 5));
    const left = Math.max(0, 100 - goalNumbers(goal).progress) * priority;
    if (left <= 0) continue;

    const subjects = String(goal.subject_ids ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const across = subjects.length > 0 ? subjects : [''];
    const each = left / across.length;

    for (const id of across) {
      const row = rows.get(id) ?? { weight: 0, goals: [] };
      row.weight += each;
      row.goals.push({ goal, shortfall: each });
      rows.set(id, row);
    }
    total += left;
  }

  if (total <= 0) return [];

  return [...rows.entries()]
    .map(([id, row]) => ({
      id,
      label: id ? nameOf(id) : 'No subject',
      /* The colour of whichever goal is most of this row, so a subject made
         mostly of one kind of work is drawn in that kind's colour rather than
         in whichever happened to be added first. */
      tone: categoryOf(
        [...row.goals].sort((a, b) => b.shortfall - a.shortfall)[0]!.goal,
      ).tone,
      share: (row.weight / total) * 100,
      goals: [...row.goals]
        .sort((a, b) => b.shortfall - a.shortfall)
        .map((entry) => entry.goal),
    }))
    .sort((a, b) => b.share - a.share);
}

/**
 * The areas, each opening onto the goals it is made of.
 *
 * The connection is the point. Growth areas were a bar chart of categories
 * with nothing behind them — a reader could see that one area was further
 * along than another and had no way to reach the goals that made it so, which
 * left the panel as an isolated reading on a page whose whole argument is that
 * its figures come from the reader's own work.
 */
export function GrowthAreas({
  goals,
  nameOf,
  onOpen,
}: {
  goals: Goal[];
  nameOf: (id: string) => string;
  onOpen?: (goal: Goal) => void;
}) {
  const areas = useMemo(() => growthAreas(goals, nameOf), [goals, nameOf]);
  const [open, setOpen] = useState<string | null>(null);

  if (areas.length === 0) {
    return <p className="gx-empty">Nothing outstanding to group. Every active goal is finished.</p>;
  }

  return (
    <ul className="gx-areas">
      {areas.map((area) => {
        const showing = open === area.id;
        return (
          <li key={area.id || 'none'} className={`gx-area tone-${area.tone}`}>
            <button
              type="button"
              aria-expanded={showing}
              onClick={() => setOpen(showing ? null : area.id)}
            >
              <span className="gx-area-name">{area.label}</span>
              <span className="gx-area-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(2, Math.min(100, area.share))}%` }} />
              </span>
              <span className="gx-area-pct">{Math.round(area.share)}%</span>
              <span className="gx-area-n">
                {area.goals.length} {area.goals.length === 1 ? 'goal' : 'goals'}
              </span>
            </button>

            {showing && (
              <ul className="gx-area-goals">
                {area.goals.map((goal) => (
                  <li key={goal.id}>
                    <button type="button" disabled={!onOpen} onClick={() => onOpen?.(goal)}>
                      <span>{goal.title}</span>
                      <em>{Math.round(goalNumbers(goal).progress)}%</em>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

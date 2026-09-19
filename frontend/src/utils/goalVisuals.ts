/**
 * Which chart a goal gets, and the data behind it.
 *
 * ## The rule, in the order it is applied
 *
 *     goal type  →  subject  →  available data  →  visualisation
 *
 * and never "Mathematics means chart X". The subject decides the *order of
 * preference*; the data decides what is actually possible; the first preference
 * the data can support wins. An AMC goal with six rated attempts behind it gets
 * difficulty against accuracy. The same goal on its first week gets its
 * checkpoints, because the other chart would be four points and a shrug.
 *
 * That ordering is the whole point. A dashboard that hands every goal the same
 * eight graphs is telling you about its own template; this tells you about the
 * goal, and quietly draws something simpler when it has nothing better to say.
 *
 * ## One chart per card
 *
 * `pickVisual` returns exactly one. Not a set to stack, not tabs — a goal card
 * has one visual and the rest of the card is words and numbers. Two charts on a
 * card is two things competing to be the thing you look at, and neither wins.
 *
 * ## The "detail level" the brief asks for
 *
 * There is no such setting on the account, so it is not read as one. What stands
 * in for it is the data itself: every `fits` below carries a threshold, and a
 * goal with more work recorded against it passes more of them and is therefore
 * offered richer charts. A setting can be added later and slotted in as one more
 * gate; nothing here would have to move.
 *
 * ## Everything is counted off linked work
 *
 * A goal's tasks are the ones naming it through `goal_id`, or naming one of its
 * checkpoints. Nothing is estimated and nothing is shared with another goal.
 */
import type { Goal, GoalCategory, Task } from '@/types';

const DAY = 86_400_000;

export type VisualId =
  /** Completion over time, from the days checkpoints were reached. */
  | 'progress'
  /** Where the figure stands between nothing and the target. */
  | 'scale'
  /** Accuracy against difficulty, off the two ratings a finished task carries. */
  | 'difficulty'
  /** Volume and how it went, per subject. */
  | 'skills'
  /** Which days carried work, over the last twelve weeks. */
  | 'heatmap'
  /** How much work landed on each day of the week. */
  | 'volume'
  /** The checkpoints, as a roadmap. */
  | 'roadmap'
  /** Checkpoints reached over time, one step up per checkpoint. Chosen only. */
  | 'step'
  /** One bar: how far along, against the goal's own target. Chosen only. */
  | 'basic';

export interface VisualMeta {
  /** The panel heading. */
  title: string;
  /** One line under the chart saying what it is showing. */
  caption: string;
}

export const VISUALS: Record<VisualId, VisualMeta> = {
  progress: {
    title: 'Progress over time',
    caption: 'Built from the days checkpoints were actually reached.',
  },
  scale: {
    title: 'Distance to target',
    caption: 'Where the figure stands, and what is left to cover.',
  },
  difficulty: {
    title: 'Difficulty against execution',
    caption: 'How well it went at each difficulty, off the ratings you gave.',
  },
  skills: {
    title: 'By subject',
    caption: 'Where the work went, and how well it went there.',
  },
  heatmap: {
    title: 'Consistency',
    caption: 'Which days carried work. Twelve weeks, most recent on the right.',
  },
  volume: {
    title: 'Practice volume',
    caption: 'When in the week the work actually happens.',
  },
  roadmap: {
    title: 'Roadmap',
    caption: 'The checkpoints between here and done.',
  },
  step: {
    title: 'Checkpoints reached',
    caption: 'Each step up is a checkpoint reached.',
  },
  basic: {
    title: 'Progress',
    caption: 'How far along, in one bar.',
  },
};

/**
 * The charts a reader can pin to a goal, in menu order.
 *
 * The automatic pick below stays the default. These exist because the reader
 * sometimes knows better — a goal they want to watch for consistency even
 * while the data would support a richer chart. `step` and `basic` are only
 * ever chosen, never picked: the automatic order already has a better chart
 * for every case either would cover.
 */
export const CHART_CHOICES: { id: VisualId; label: string }[] = [
  { id: 'progress', label: 'Line graph' },
  { id: 'step', label: 'Step chart' },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'basic', label: 'Basic graph' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'volume', label: 'Weekly volume' },
  { id: 'difficulty', label: 'Difficulty' },
];

const CHOSEN = new Set<string>(CHART_CHOICES.map((choice) => choice.id));

/** The goal's pinned chart, or null when the page should pick. */
export function chosenChart(goal: Goal): VisualId | null {
  return goal.chart && CHOSEN.has(goal.chart) ? (goal.chart as VisualId) : null;
}

/**
 * What each kind of goal wants to be shown, best first.
 *
 * Read top to bottom until one fits. The lists differ where the subjects
 * genuinely differ: a violin goal is bottlenecked on whether you sat down, so
 * consistency comes first; a competition maths goal is bottlenecked on where the
 * marks go, so accuracy against difficulty comes first and the practice charts
 * are far down. Getting that backwards is how an app ends up telling somebody
 * preparing for the AMC that they practised for 47 minutes.
 *
 * `scale` is not in any of them. It is checked before the list, because a goal
 * measured by a number has a number, and no arrangement of subjects changes
 * that.
 */
const BY_CATEGORY: Record<GoalCategory, VisualId[]> = {
  math: ['difficulty', 'progress', 'skills', 'roadmap', 'heatmap'],
  coding: ['skills', 'difficulty', 'progress', 'roadmap', 'heatmap'],
  ai: ['skills', 'progress', 'difficulty', 'roadmap', 'heatmap'],
  school: ['progress', 'skills', 'difficulty', 'roadmap', 'volume'],
  music: ['heatmap', 'volume', 'progress', 'roadmap'],
  fitness: ['volume', 'heatmap', 'progress', 'roadmap'],
  projects: ['roadmap', 'progress', 'skills', 'volume'],
  personal: ['heatmap', 'progress', 'roadmap', 'volume'],
  other: ['progress', 'roadmap', 'heatmap', 'skills'],
};

export interface VisualContext {
  goal: Goal;
  /** Finished tasks linked to this goal. */
  done: Task[];
  /** Every task linked to it, finished or not. */
  linked: Task[];
}

/** The tasks that are work toward this goal, by either route. */
export function linkedTasks(goal: Goal, tasks: Task[]): Task[] {
  const stones = new Set((goal.milestones ?? []).map((stone) => stone.id));
  return tasks.filter(
    (task) => task.goal_id === goal.id || (task.milestone_id && stones.has(task.milestone_id)),
  );
}

export function visualContext(goal: Goal, tasks: Task[]): VisualContext {
  const linked = linkedTasks(goal, tasks);
  return { goal, linked, done: linked.filter((task) => task.status === 'done') };
}

const dated = (tasks: Task[]) => tasks.filter((task) => Boolean(task.completed_at));

const rated = (tasks: Task[]) =>
  tasks.filter((task) => Number(task.difficulty) > 0 && Number(task.execution) > 0);

/**
 * Whether there is enough behind a chart to draw it honestly.
 *
 * Each threshold is the point below which the chart would be a picture of noise
 * rather than of the goal. Three rated attempts do not establish where accuracy
 * falls off; two subjects with one task each is not a distribution. They are
 * judgements and they are deliberately on the cautious side, because the cost of
 * drawing too early is a reader trusting a shape that is not there.
 */
const FITS: Record<VisualId, (context: VisualContext) => boolean> = {
  progress: (ctx) =>
    (ctx.goal.milestones ?? []).filter(
      (stone) => stone.status === 'done' && Boolean(stone.completed_at),
    ).length >= 2,

  scale: (ctx) => ctx.goal.measure === 'number' && Number(ctx.goal.target_number) > 0,

  difficulty: (ctx) => {
    const marks = rated(ctx.done);
    return marks.length >= 6 && new Set(marks.map((task) => task.difficulty)).size >= 3;
  },

  skills: (ctx) => {
    const filed = ctx.done.filter((task) => Boolean(task.subject));
    return filed.length >= 5 && new Set(filed.map((task) => task.subject)).size >= 2;
  },

  heatmap: (ctx) => {
    const days = new Set(dated(ctx.done).map((task) => task.completed_at!.slice(0, 10)));
    return days.size >= 4;
  },

  volume: (ctx) => dated(ctx.done).length >= 4,

  roadmap: (ctx) => (ctx.goal.milestones ?? []).length > 0,

  // Never reached by the automatic pick; kept so the table stays total.
  step: (ctx) =>
    (ctx.goal.milestones ?? []).some(
      (stone) => stone.status === 'done' && Boolean(stone.completed_at),
    ),
  basic: () => true,
};

export interface Pick {
  id: VisualId;
  meta: VisualMeta;
  /** Why this one and not another, printed under the chart. */
  why: string;
}

/**
 * The sentence under each chart saying why it is the one being drawn.
 *
 * Choosing a chart per goal is the most opinionated thing this page does, and
 * it used to be invisible: every pick carried "Chosen for a math goal from
 * what is recorded against it", which is true of all five charts a math goal
 * could have got and therefore says nothing. Two cards side by side showing
 * different charts looked like an inconsistency rather than a decision.
 *
 * So each one names the evidence that made it fit — the counts `FITS` actually
 * tested. That turns the line into something the reader can act on: "18 rated
 * attempts across 4 difficulties" tells somebody who wants the other chart
 * what they have to record to get it, which "chosen for a math goal" never
 * could.
 *
 * Keep these in step with `FITS`. A threshold that moves and a sentence that
 * does not is a page explaining itself with the old rule.
 */
const WHY: Record<VisualId, (context: VisualContext) => string> = {
  progress: (ctx) => {
    const marked = (ctx.goal.milestones ?? []).filter(
      (stone) => stone.status === 'done' && Boolean(stone.completed_at),
    ).length;
    return `${marked} checkpoints were reached on a recorded date, so the run has a real shape.`;
  },

  scale: (ctx) =>
    `You set a target of ${ctx.goal.target_number} ${ctx.goal.unit || 'units'}, and the distance `
    + 'to a figure you chose comes before anything this page could infer.',

  difficulty: (ctx) => {
    const marks = rated(ctx.done);
    const levels = new Set(marks.map((task) => task.difficulty)).size;
    return `${marks.length} finished tasks carry both ratings, across ${levels} difficulty `
      + 'levels — enough to see where the work stops going well.';
  },

  skills: (ctx) => {
    const filed = ctx.done.filter((task) => Boolean(task.subject));
    const subjects = new Set(filed.map((task) => task.subject)).size;
    return `${filed.length} finished tasks are filed across ${subjects} subjects, so where the `
      + 'effort went is a real split rather than one subject with a rounding error.';
  },

  heatmap: (ctx) => {
    const days = new Set(dated(ctx.done).map((task) => task.completed_at!.slice(0, 10))).size;
    return `Work landed on ${days} separate days. For this kind of goal the question is `
      + 'whether you sat down, not how hard it was.';
  },

  volume: (ctx) =>
    `${dated(ctx.done).length} finished tasks carry a date, which is enough to say when in the `
    + 'week the work actually happens.',

  roadmap: (ctx) =>
    `${(ctx.goal.milestones ?? []).length} checkpoints are set and there is not yet enough `
    + 'finished work to chart. The plan is the most honest thing to show.',

  step: () => '',
  basic: () => '',
};

/**
 * The one chart this goal gets.
 *
 * Returns null when nothing fits — a goal with no checkpoints and no work
 * against it, which the card answers with an invitation rather than a chart.
 */
export function pickVisual(context: VisualContext): Pick | null {
  // A chart the reader chose is drawn whatever the data says. The panel copes
  // with thin data on its own, and says so, rather than overruling them.
  const chosen = chosenChart(context.goal);
  if (chosen) {
    return {
      id: chosen,
      meta: VISUALS[chosen],
      why: 'You chose this chart. Pick Automatic from the ⋯ menu to let the page choose.',
    };
  }

  const category = (context.goal.category || 'other') as GoalCategory;
  const order = BY_CATEGORY[category] ?? BY_CATEGORY.other;

  // A goal measured by a number is checked first, ahead of the subject's own
  // preferences: the reader set a figure and a target, and the distance between
  // them is the thing they asked to be told.
  const wanted: VisualId[] = FITS.scale(context) ? ['scale', ...order] : order;

  for (const id of wanted) {
    if (!FITS[id](context)) continue;
    return { id, meta: VISUALS[id], why: WHY[id](context) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The data each chart needs
// ---------------------------------------------------------------------------
export interface Bar {
  label: string;
  /** 0-100, for the bar's length. */
  percent: number;
  /** What the row actually prints on the right. */
  value: string;
  /** Rows with no data at all are drawn empty rather than dropped. */
  empty?: boolean;
}

const RATING = ['', 'Very easy', 'Easy', 'Moderate', 'Hard', 'Very hard'];

/**
 * Mean execution at each difficulty, 1 to 5.
 *
 * Both figures come from the one question a task asks on completion — how hard
 * was it, and how did it go — so this is the reader's own account of where their
 * work stops going well, rather than a score the app assigned. Difficulties with
 * nothing behind them are kept as empty rows, because a gap in the middle of the
 * range is itself the finding.
 */
export function difficultyBars(context: VisualContext): Bar[] {
  const marks = rated(context.done);
  return [1, 2, 3, 4, 5].map((level) => {
    const at = marks.filter((task) => Number(task.difficulty) === level);
    if (at.length === 0) {
      return { label: RATING[level]!, percent: 0, value: '—', empty: true };
    }
    const mean = at.reduce((sum, task) => sum + Number(task.execution), 0) / at.length;
    return {
      label: RATING[level]!,
      percent: (mean / 5) * 100,
      value: `${mean.toFixed(1)} / 5`,
    };
  });
}

/** Volume and how it went, per subject — most-worked first. */
export function subjectBars(context: VisualContext, nameOf: (id: string) => string): Bar[] {
  const groups = new Map<string, Task[]>();
  for (const task of context.done) {
    if (!task.subject) continue;
    groups.set(task.subject, [...(groups.get(task.subject) ?? []), task]);
  }

  const most = Math.max(1, ...[...groups.values()].map((rows) => rows.length));

  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
    .map(([id, rows]) => {
      const marks = rows.filter((task) => Number(task.execution) > 0);
      const mean = marks.length
        ? marks.reduce((sum, task) => sum + Number(task.execution), 0) / marks.length
        : 0;
      return {
        label: nameOf(id),
        percent: (rows.length / most) * 100,
        // The count is the length of the bar and the rating is the reading
        // beside it — two facts, and the one that can be missing is the one
        // that is printed rather than drawn.
        value: mean > 0 ? `${rows.length} · ${mean.toFixed(1)}/5` : `${rows.length}`,
      };
    });
}

/** Finished work per weekday, Monday first. */
export function weekdayBars(context: VisualContext): Bar[] {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const counts = new Array(7).fill(0) as number[];

  for (const task of dated(context.done)) {
    const at = new Date(task.completed_at!);
    if (Number.isNaN(at.getTime())) continue;
    // getDay is Sunday-first; the week reads Monday-first here.
    const slot = (at.getDay() + 6) % 7;
    counts[slot] = (counts[slot] ?? 0) + 1;
  }

  const most = Math.max(1, ...counts);
  return names.map((label, index) => {
    const count = counts[index] ?? 0;
    return {
      label,
      percent: (count / most) * 100,
      value: String(count),
      empty: count === 0,
    };
  });
}

export interface HeatCell {
  /** ISO day. */
  day: string;
  count: number;
  /** 0-4. Zero draws the empty square. */
  level: number;
}

/**
 * Twelve weeks of days, oldest first, in Monday-first columns.
 *
 * Levels are quartiles of the busiest day rather than fixed counts, so a goal
 * carrying one task a week and one carrying six both read as a pattern instead
 * of one of them being uniformly pale.
 */
export function heatCells(context: VisualContext, today = new Date()): HeatCell[] {
  const counts = new Map<string, number>();
  for (const task of dated(context.done)) {
    const day = task.completed_at!.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Wind back to the Monday of this week, then eleven weeks before that.
  const monday = new Date(end.getTime() - ((end.getDay() + 6) % 7) * DAY);
  const start = new Date(monday.getTime() - 11 * 7 * DAY);

  const most = Math.max(1, ...counts.values());
  const cells: HeatCell[] = [];
  for (let i = 0; i < 12 * 7; i += 1) {
    const at = new Date(start.getTime() + i * DAY);
    const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
    const count = counts.get(day) ?? 0;
    cells.push({
      day,
      count,
      level: count === 0 ? 0 : Math.min(4, Math.ceil((count / most) * 4)),
    });
  }
  return cells;
}

/**
 * The shapes the backend actually stores and returns.
 *
 * These mirror the rows in data/sql/ as they come back through
 * backend/database/connection.py, and there is one thing about that worth
 * knowing before reading further:
 *
 *   **A column that is NULL is left out of the row entirely.**
 *
 * `read_table` drops it rather than returning null, because the backend tests
 * `'met_deadline' in task` and reads `row.get('x', fallback)` — spellings that
 * only agree if a value never written stays missing. So a field the database
 * has not filled in arrives as `undefined`, not `null`, and every optional
 * field below is marked `?` for that reason rather than out of caution.
 */

// --------------------------------------------------------------------------
// Accounts
// --------------------------------------------------------------------------
export type Theme = 'light' | 'dark';

/** The fields the client is allowed to see — backend `public_user`. */
export interface PublicUser {
  username: string;
  name: string;
  email?: string;
  theme: Theme;
  daily_goal?: number;
  profile_complete: boolean;
  /** Absolute path under /static, already resolved. */
  avatar: string;
}

/** What the dashboard shows: an account's live progression. */
export interface UserStats {
  level: number;
  xp: number;
  tasks_completed: number;
  current_streak: number;
  best_streak: number;
  charge: number;
}

// --------------------------------------------------------------------------
// Tasks
// --------------------------------------------------------------------------
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'todo' | 'done' | 'expired';

export interface Task {
  id: string;
  /**
   * Who owns it. Sent up when a task is created and not read back anywhere.
   *
   * Optional because a task does not always arrive whole any more: the
   * analytics page asks for sixteen columns rather than the row (see
   * `AnalyticsTask` in services/analytics), and the alternative to marking the
   * two missing fields optional here was a parallel task type that every util
   * taking a `Task` would have to be widened to accept.
   */
  user_id?: string;
  title: string;
  /**
   * Free text, unbounded, and read in exactly one place — the task board's
   * search. Optional for the same reason as `user_id` above, and it is the
   * field that made the projection worth having: it is on every row, it has no
   * ceiling, and no page but the task list has ever looked at it.
   */
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  /** The XP completing it awards. Named `xp_value` in the database. */
  xp_value: number;
  /** What the task is about — an id from the subject catalogue. Optional. */
  subject?: string;
  /**
   * What this task is execution for. Both optional and most tasks have
   * neither — work done for its own sake is not a lesser kind of work.
   * A link pointing at a deleted goal reads as no link.
   */
  goal_id?: string;
  milestone_id?: string;
  due_date?: string;
  show_on_calendar?: boolean;
  created_at: string;
  completed_at?: string;
  /** Creation to completion, recorded on completion. Feeds the efficiency metric. */
  completion_seconds?: number;
  /** Whether it beat its deadline. Absent when it had none. */
  met_deadline?: boolean;
  /**
   * How hard it was and how well it went, 1-5 each, asked once on completion.
   *
   * Both absent unless the person answered. Absent is not zero and must never
   * be averaged as one: a task nobody rated says nothing about the work, where
   * a task rated 1 says something quite specific.
   */
  difficulty?: number;
  execution?: number;
  /**
   * The one thing that made the difference, from a fixed vocabulary of twelve
   * — six for a task that went badly, six for one that went well. See REASONS
   * in utils/ratings.
   *
   * Only asked at rating_depth 'reasons', so absent is the ordinary state and
   * means the question was not put rather than that there was no reason.
   */
  reason?: string;
  timer_duration?: number;
  timer_expired?: boolean;
}

// --------------------------------------------------------------------------
// Goals
// --------------------------------------------------------------------------
export type GoalType = 'xp' | 'streak' | 'tasks' | 'focus';
export type GoalStatus = 'active' | 'completed';

/**
 * How a goal's progress is read.
 *
 * The first four are the counters the app feeds itself. The last two are the
 * outcome measures: `number` is a figure the app has no way to count — a
 * rating, a contest score, a user count — and `milestones` is a goal with no
 * number at all, measured by the checkpoints on the way to it.
 *
 * The backend guarantees this is always one of the six on the way out, even
 * for rows written before the column existed. See `_measure_of` in
 * backend/api/goals.py.
 */
export type GoalMeasure = GoalType | 'number' | 'milestones';

export type GoalCategory =
  | 'math'
  | 'coding'
  | 'ai'
  | 'school'
  | 'music'
  | 'fitness'
  | 'projects'
  | 'personal'
  | 'other';

export type MilestoneStatus = 'pending' | 'active' | 'done';

/**
 * One small piece of work under a checkpoint.
 *
 * Not a `Task`, and the difference is the same one the checkpoint itself draws
 * against a task: a step has no XP, no due date, no timer and no priority, and
 * never reaches the tasks page. It is the checkpoint's own breakdown — the
 * three-to-eight things that, done, mean the checkpoint is reached.
 *
 * `placeholder` is derived from the title being empty, never sent up by the
 * client: a checklist always has at least `MIN_STEPS` rows and the unwritten
 * ones are drawn as prompts rather than counted as work planned.
 */
export interface MilestoneStep {
  /** Unique within its own checklist, not across the account. */
  id: string;
  title: string;
  done: boolean;
  placeholder: boolean;
  /**
   * The one task this step is execution for, or null.
   *
   * A pointer, not ownership. The step stands whether or not anything is on
   * the other end, and unlinking a task does not delete the step — which is
   * the difference between this and the step simply *being* the task.
   */
  task_id: string | null;
  /**
   * When this step is meant to be done, as an ISO day, or null.
   *
   * Only ever set on a step with no `task_id`. A step pointing at a task takes
   * that task's date: two dates for one piece of work is two answers to
   * "when", and the task's is the one the calendar, the dashboard and the
   * reminders read. Linking a task therefore clears this rather than keeping a
   * second copy nothing else can see.
   */
  due: string | null;
}

/**
 * A checkpoint inside a goal.
 *
 * Not a task, and the difference is the whole reason the table exists: a task
 * is one action and a milestone is a state the goal reaches. "Solve ten DP
 * problems" is a task; "Master Silver DP" is the checkpoint those ten
 * problems are evidence for. A milestone has an order and no XP.
 */
export interface Milestone {
  id: string;
  goal_id: string;
  user_id: string;
  title: string;
  note: string;
  /** Execution order, dense from 0. Rewritten on every reorder. */
  position: number;
  status: MilestoneStatus;
  /** Always at least MIN_STEPS long — the API pads it. See utils/milestoneSteps. */
  steps: MilestoneStep[];
  target_date?: string;
  completed_at?: string;
  created_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string;
  goal_type: GoalType;
  status: GoalStatus;
  /** Percent, 0-100, to one decimal. */
  progress: number;
  /** The target for whichever type this is — a copy, for display. */
  target_value: number;

  target_xp: number;
  current_xp: number;
  target_streak: number;
  current_streak: number;
  target_tasks: number;
  current_tasks: number;
  /** Minutes of tracked focus time. */
  target_focus: number;
  current_focus: number;
  /**
   * A focus goal counts time from the moment it was set, so it remembers the
   * account's lifetime focus total at creation and measures against that.
   */
  focus_baseline_seconds: number;

  /** 1-10. */
  priority: number;
  deadline: string;
  created_at: string;

  // ---- The outcome layer -------------------------------------------------
  /** How progress is read. Always present on a goal from the API. */
  measure: GoalMeasure;
  category: GoalCategory;
  /** Why it matters — the second question the creation flow asks. */
  why: string;
  /** When the run at it began. Pace is measured from here, not from today. */
  start_date: string;
  /** What `current_value` counts, for the label: "rating", "problems", "users". */
  unit: string;
  current_value: number;
  target_number: number;
  /** Comma-separated subject ids, split at the call sites that read them. */
  subject_ids: string;
  /**
   * Which chart the card draws. Empty (or missing on an old row) lets the page
   * pick from the goal's data — see utils/goalVisuals.
   */
  chart?: string;
  /** In execution order. The API sends them with every goal. */
  milestones: Milestone[];
}

// --------------------------------------------------------------------------
// Calendar
// --------------------------------------------------------------------------
/** A task placed on a day. */
export interface CalendarEntry {
  id: string;
  user_id: string;
  date: string;
  time_block: string;
  task_id?: string;
  completed?: boolean;
  completed_at?: string;
  created_at: string;
}

/**
 * A standalone block created on the calendar itself.
 *
 * The two recurrence fields are hyphenated because that is the spelling
 * already in the database and in every calendar script — not a mistake.
 */
export interface CalendarEvent {
  id: string;
  name: string;
  date: string;
  time_block: string;
  description: string;
  completed: boolean;
  created_at: string;
  /** Built-in events, which cannot be deleted. */
  is_default?: boolean;
  'recurrence-month'?: string | null;
  'recurrence-week'?: string | null;
  end_date?: string | null;
}

// --------------------------------------------------------------------------
// Focus
// --------------------------------------------------------------------------
export interface FocusDay {
  seconds: number;
  goal_hours: number;
}

/** Keyed by ISO date. */
export type FocusHistory = Record<string, FocusDay>;

/** The one-line note on a day, keyed by ISO date. */
export type DayFocusNotes = Record<string, string>;

// --------------------------------------------------------------------------
// Growth
// --------------------------------------------------------------------------
export interface GrowthDay {
  date: string;
  day_number: number;
  xp_earned: number;
  tasks_completed: number;
  cumulative_xp: number;
  avg_task_xp: number;
  focus_minutes: number;
  cumulative_focus_minutes: number;
  /**
   * How many of the day's finished tasks were rated on both rows.
   *
   * **This is the field to branch on, never `quality_score`.** The prompt after
   * a completed task is optional, so a zero score means nobody said rather than
   * "the work was bad", and the two must never be drawn as the same thing.
   */
  rated_tasks: number;
  /** Mean of difficulty × execution over that day's rated tasks, 1-25. */
  quality_score: number;
  avg_difficulty: number;
  avg_execution: number;
}

// --------------------------------------------------------------------------
// The report card
// --------------------------------------------------------------------------
/**
 * The letter grades, best first.
 *
 * `S` is a perfect hundred and `A+` the band below it; everything under that is
 * the conventional school scale in tens. Mirrors GRADE_BANDS in
 * backend/tracking/analytics.py, which is where the boundaries live.
 */
export type Grade = 'S' | 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface Trend {
  direction: 'up' | 'down' | 'flat';
  pct: number;
}

interface MetricBase {
  score: number;
  grade: Grade;
  trend: Trend;
}

export interface Ratings {
  overall: MetricBase & { message: string };
  metrics: {
    productivity: MetricBase & { avg_daily_xp: number };
    quality: MetricBase & {
      avg_task_xp: number;
      /**
       * Which measurement the score came from.
       *
       * `ratings` is difficulty × execution over the tasks the reader rated.
       * `xp` is the old XP-per-task proxy, used only while nothing has been
       * rated — the prompt is optional and an account that skips it is not
       * graded zero for quality. Every surface that prints the figure prints
       * the basis with it.
       */
      basis: 'ratings' | 'xp';
      rated_tasks: number;
      total_tasks: number;
      /** Mean of difficulty × execution, out of `max_quality`. */
      avg_quality: number;
      avg_difficulty: number;
      avg_execution: number;
      max_quality: number;
    };
    consistency: MetricBase & {
      active_days: number;
      total_days: number;
      rate: number;
    };
    efficiency: MetricBase & {
      /** Null when no completed task has been timed yet. */
      avg_minutes: number | null;
      on_time_pct: number;
      has_timing: boolean;
    };
    focus: MetricBase & {
      focused_minutes: number;
      goal_minutes: number;
      pct_of_goal: number;
    };
  };
}

/** The metric names, for iterating the report card in a stable order. */
export const METRIC_NAMES = [
  'productivity',
  'quality',
  'consistency',
  'efficiency',
  'focus',
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];

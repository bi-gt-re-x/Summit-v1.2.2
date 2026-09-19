/**
 * Analytics: the one figure on the page that needs more than one account.
 *
 * Everything else the analytics page draws is computed on the client from the
 * growth series — see `@/components/Analytics/data`. This is the exception, and
 * necessarily so: "where you stand against other Summit users" cannot be derived
 * from the reader's own record, and the other accounts' records are not
 * something the client should ever hold.
 *
 * Backend: backend/api/analytics.py, backend/tracking/standing.py.
 */
import { get, post } from './api';
import type { ApiResult, TaskPriority, TaskStatus } from '@/types';

/** The measures, in the order the panel lists them. Matches MEASURES server-side. */
export type StandingKey = 'xp' | 'focus' | 'consistency' | 'tasks' | 'score';

export interface StandingRow {
  key: StandingKey;
  /** This account's own figure — XP, minutes, a percentage, a count, a score. */
  value: number;
  /** "Top N%", so lower is better. `null` when the cohort was too small. */
  percentile: number | null;
}

export interface Standing {
  /** The reader plus everyone they were measured against. */
  cohort: number;
  /** False when there were too few comparable accounts to place against. */
  enough: boolean;
  /** The number of *other* accounts the backend wanted before placing. */
  floor: number;
  rows: StandingRow[];
}

export function standing(): Promise<ApiResult<Standing>> {
  return get<Standing>('/api/standing');
}

/** One dated reading of a graded metric. Scores are out of 100. */
export interface MetricPoint {
  date: string;
  score: number;
  grade: string;
}

export interface MetricHistory {
  metric: string;
  /** Oldest first. */
  points: MetricPoint[];
}

/**
 * Past grades for one metric.
 *
 * The snapshots have been accumulating since the report card existed — reading
 * `/api/get_growth_ratings` files a dated row per metric — and nothing read
 * them back until now. The page drew its "score over time" line from a
 * generated shape with the real score pinned on the end.
 */
export function metricHistory(
  metric = 'overall',
): Promise<ApiResult<MetricHistory>> {
  return get<MetricHistory>('/api/metric_history', { metric });
}

/**
 * What the account said it was aiming at.
 *
 * The one thing on the analytics page that is stated rather than measured, and
 * the only reason a brand-new account has anything to do there. Everything else
 * the page draws needs a fortnight to three weeks of record first.
 */
export interface Baseline {
  /** Days a week they mean to work, 1-7. */
  active_days: number;
  /** What they consider a normal sitting, in minutes. */
  session_minutes: number;
  /** The subject id this is mostly for, or '' for no one subject. */
  focus_subject: string;
  /** The day it was set, ISO. What makes a stale baseline legible as stale. */
  set_on: string;
}

/** `baseline: null` means this account has never set one — a real answer. */
/**
 * A task, in the fields the analytics page reads.
 *
 * Deliberately not `Task`. The full row carries `description` — unbounded free
 * text on every task the account owns — plus the calendar and timer fields, and
 * no panel on this page has ever looked at any of them. Typing this as `Task`
 * would compile and would quietly re-authorise every one of those fields the
 * first time somebody reached for one.
 *
 * The utils under utils/ take `Task`, and this is assignable to it: every field
 * here has the same name and type it has there, and everything missing is
 * optional there. So the arithmetic did not change to accept it — see
 * ANALYTICS_TASK_FIELDS in backend/api/analytics.py, which is the same list on
 * the other side of the wire and the thing to change if a panel needs a field
 * that is not here.
 */
export interface AnalyticsTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  subject?: string;
  xp_value: number;
  created_at: string;
  completed_at?: string;
  due_date?: string;
  completion_seconds?: number;
  met_deadline?: boolean;
  difficulty?: number;
  execution?: number;
  reason?: string;
  goal_id?: string;
  milestone_id?: string;
  /** Every goal it counts toward, from `goal_links`. See `goal_ids` on Task. */
  goal_ids?: string[];
}

export interface AnalyticsTasksResult {
  tasks: AnalyticsTask[];
}

/** What the endpoint actually sends: the names once, then a row of values each. */
interface ColumnarTasks {
  fields: (keyof AnalyticsTask)[];
  rows: unknown[][];
  /**
   * {task_id: goal ids} for the tasks that count toward any goal, as the
   * server stored them when each task was written. Beside the rows rather
   * than a column of them, since most rows would carry a null.
   */
  goal_links?: Record<string, string[]>;
}

/**
 * Columns back into the objects every panel expects.
 *
 * The endpoint sends `{fields, rows}` because two thirds of the old payload was
 * the sixteen field names repeated once per task — 4.00 MB of 5.99 MB on the
 * largest account here. See `columns_table_for` in
 * backend/database/connection.py for the measurements.
 *
 * This is the whole decoder, and it is deliberately the dumbest one that works:
 * zip the names against each row. Anything cleverer on the wire — dropping
 * nulls, interning repeated subjects, delta-encoding the dates — would save a
 * little more and would need a decoder that can be subtly wrong about a field
 * nothing notices for weeks.
 *
 * ## A null is a field that is not there
 *
 * The one thing this has to get right. The old endpoint sent objects built by
 * `_decode_records`, which **omits** a NULL column rather than sending it — so
 * a task that was never rated arrived with no `met_deadline` key at all. A
 * positional row cannot omit anything, so the wire carries nulls to keep the
 * columns lined up and they are dropped here.
 *
 * That is not tidiness. `utils/diagnosis` filters on
 * `task.met_deadline !== undefined` to find the tasks that had a deadline, and
 * `null !== undefined` is true — so a null left in place would put every
 * unrated task into that count and quietly change what the page says about
 * deadlines, with nothing on screen looking wrong.
 *
 * A row shorter than `fields` is not defended against, because SQLite cannot
 * produce one: every row comes from one SELECT of the same column list.
 */
export function rehydrate(data: ColumnarTasks): AnalyticsTask[] {
  const { fields, rows } = data;
  const links = data.goal_links ?? {};
  const width = fields.length;
  const out = new Array<AnalyticsTask>(rows.length);
  for (let at = 0; at < rows.length; at += 1) {
    const values = rows[at]!;
    const task = {} as Record<string, unknown>;
    for (let field = 0; field < width; field += 1) {
      const value = values[field];
      if (value !== null) task[fields[field] as string] = value;
    }
    // Attached once, here, so no panel ever has to look a task up in the map.
    const goals = links[task.id as string];
    if (goals && goals.length) task.goal_ids = goals;
    out[at] = task as unknown as AnalyticsTask;
  }
  return out;
}

/**
 * The account's tasks, narrowed to what this page counts.
 *
 * Unwindowed on purpose — the picker slices in the browser so that changing it
 * costs nothing, and the goal and habit panels are not scoped by it at all. The
 * saving is the width of each row, not the number of them.
 *
 * Callers get `{ tasks }` exactly as they always did; the columnar shape does
 * not escape this function. Use `taskHistory` in ./taskHistory rather than
 * calling this directly — two pages want this same answer and it is the largest
 * response the app makes.
 */
export async function analyticsTasks(): Promise<ApiResult<AnalyticsTasksResult>> {
  const result = await get<ColumnarTasks>('/api/analytics/tasks');
  if (!result.success) return result;
  return { success: true, tasks: rehydrate(result) };
}

export interface BaselineResult {
  baseline: Baseline | null;
}

export function baseline(): Promise<ApiResult<BaselineResult>> {
  return get<BaselineResult>('/api/baseline');
}

export function setBaseline(
  values: Pick<Baseline, 'active_days' | 'session_minutes' | 'focus_subject'>,
): Promise<ApiResult<BaselineResult>> {
  return post<BaselineResult>('/api/baseline', { ...values });
}

/** Every graded metric's readings, keyed by metric name. */
export interface MetricHistories {
  series: Record<string, MetricPoint[]>;
}

/**
 * All five metrics' histories in one call.
 *
 * `metricHistory` above answers about one metric and is what the score panel
 * reads. This is for the follow-up on Recommendations, which needs whichever
 * metric the reader happened to adopt a recommendation about.
 */
export function metricHistories(): Promise<ApiResult<MetricHistories>> {
  return get<MetricHistories>('/api/metric_histories');
}

/**
 * A recommendation the reader said they would act on, and when.
 *
 * Two fields and a date is the whole record. The "did it work" comparison that
 * hangs off it is recomputed from the day series every time — see
 * utils/followup for why nothing is snapshotted here.
 */
export interface AdoptedAdvice {
  id: string;
  /** What the rule was called on the day it was adopted. */
  title: string;
  /** ISO date. */
  on: string;
}

export interface AdoptedResult {
  /** Oldest first, as the backend returns them. */
  adopted: AdoptedAdvice[];
}

export function adoptedAdvice(): Promise<ApiResult<AdoptedResult>> {
  return get<AdoptedResult>('/api/adopted_advice');
}

/** Records the decision. Re-adopting keeps the original date. */
export function adoptAdvice(
  id: string,
  title: string,
): Promise<ApiResult<AdoptedResult>> {
  return post<AdoptedResult>('/api/adopt_advice', { id, title });
}

/** Forgets the decision. Any task it created is left alone. */
export function dropAdvice(id: string): Promise<ApiResult<AdoptedResult>> {
  return post<AdoptedResult>('/api/drop_advice', { id });
}

// --------------------------------------------------------------------------
// Periods — the Growth tab's whole data source
// --------------------------------------------------------------------------
/**
 * The windows the Growth tab offers. Mirrors `PERIODS` in
 * backend/tracking/analytics.py, which is where the day counts live.
 */
export type PeriodKey = '7d' | '30d' | '90d' | '180d' | '365d' | 'all';

/** The five graded measures, in the order the tab lists them. */
export const PERIOD_METRICS = [
  'productivity',
  'quality',
  'consistency',
  'efficiency',
  'focus',
] as const;

export type PeriodMetric = (typeof PERIOD_METRICS)[number];

/** Every metric's 0-100 score for one window. */
export type MetricScores = Record<PeriodMetric, number>;

/** One window, scored, with the measured figures the scores came from. */
export interface PeriodSide {
  /** The mean of the five, 0-100. */
  overall: number;
  grade: string;
  parts: MetricScores;
  grades: Record<PeriodMetric, string>;
  /** The quantities behind each score, in their own units. Shapes vary. */
  figures: Record<PeriodMetric, Record<string, unknown>>;
  /** Only on `previous`: which days it covered. */
  start?: string;
  end?: string;
}

/** A point on the growth line — the five metrics over the days behind it. */
export interface PeriodPoint extends MetricScores {
  date: string;
  overall: number;
}

/** One card in the "growth by period" row. */
export interface PeriodCard {
  key: PeriodKey;
  label: string;
  days: number;
  overall: number;
  /** The equivalent stretch before it, or null when there was not one. */
  previous: number | null;
  /** Percentage movement against that, or null. */
  change: number | null;
  /** True when the account is younger than the window the label names. */
  partial: boolean;
  /**
   * The card's own overall score across the period, for its sparkline.
   *
   * Scored the same trailing-window way as the main line, so a card and the
   * chart it opens cannot disagree about the shape. Twelve points, because a
   * sparkline at this width is read as a shape rather than as a series.
   */
  spark: number[];
}

export interface GrowthPeriods {
  period: PeriodKey;
  label: string;
  start: string;
  end: string;
  days: number;
  /** How many days each point on the line was scored over. */
  trend_window: number;
  current: PeriodSide;
  /** Null when the account has no equal stretch before this one. */
  previous: PeriodSide | null;
  /** Percentage movement per metric, and overall. Null where there is no base. */
  change: { overall: number | null } & Record<PeriodMetric, number | null>;
  series: PeriodPoint[];
  periods: PeriodCard[];
}

/**
 * The five metrics over a period, the period before it, and a line.
 *
 * The one call the Growth tab makes, and the page's one deliberate exception to
 * "a tab costs no request" — see the endpoint in backend/api/analytics.py for
 * why this cannot be arithmetic in the browser like everything else here. In
 * short: focus needs each day's goal, which the growth series does not send,
 * and mirroring the five formulas in TypeScript would create the second scoring
 * implementation this codebase has one rule against.
 */
export function growthPeriods(period: PeriodKey = '30d'): Promise<ApiResult<GrowthPeriods>> {
  return get<GrowthPeriods>('/api/growth_periods', { period });
}


// --------------------------------------------------------------------------
// Writing one subject up, with a model
// --------------------------------------------------------------------------
/**
 * The findings the subject page sends to be read back to it.
 *
 * The page's own figures, computed in components/Subject/model — this is not
 * a second source of them. The server sends them to a model, which is allowed
 * to write prose over them and explicitly not allowed to produce any number
 * that is not in here; see backend/tracking/subject_brief.py for the prompt
 * that enforces it and for why that rule is the whole feature.
 */
export interface BriefFindings {
  subject: string;
  span: string;
  /** What the reader said they are chasing, and where they say they are. */
  aim: string;
  level: string;
  checkpoints: string[];
  score: number | null;
  grade: string | null;
  finished: number;
  finished_before: number;
  streak: number;
  rates: Array<{ label: string; now: number }>;
  bands: Array<{ label: string; done: number; holding: number | null }>;
  struggles: Array<{ label: string; share: number; count: number }>;
  goals: Array<{ title: string; progress: number; deadline: string; drift: number | null }>;
}

/** One thing to practise, and the figure that says why. */
export interface BriefPractice {
  title: string;
  /** A suggested sitting length. The one number the model supplies. */
  minutes: number;
  focus: string[];
  why: string;
}

export interface SubjectBrief {
  reading: string;
  practice: BriefPractice[];
}

/**
 * Whether the write-up is available at all on this install.
 *
 * Asked so the page can leave the button out rather than draw one that fails
 * when pressed — the feature needs an Anthropic key and a great many installs
 * will not have one.
 */
export function subjectBriefAvailable(): Promise<ApiResult<{ available: boolean }>> {
  return get<{ available: boolean }>('/api/subject_brief');
}

/** A model's reading of one subject. Stores nothing; costs a call. */
export function writeSubjectBrief(
  findings: BriefFindings,
): Promise<ApiResult<{ brief: SubjectBrief }>> {
  return post<{ brief: SubjectBrief }>('/api/subject_brief', findings);
}

// --------------------------------------------------------------------------
// The subject reading — diagnosis, priorities, and what to do next
// --------------------------------------------------------------------------
/** The kinds of session the model may recommend. Closed, so they can be counted. */
export const STEP_TYPES = [
  'targeted_practice',
  'mixed_practice',
  'timed_set',
  'review',
  'concept',
  'project',
] as const;

export type StepType = (typeof STEP_TYPES)[number];

/** What each kind is called on the page. Mirrors STEP_TYPES in backend/api/subject_ai.py. */
export const STEP_WORDS: Record<StepType, string> = {
  targeted_practice: 'Targeted practice',
  mixed_practice: 'Mixed practice',
  timed_set: 'Timed set',
  review: 'Review',
  concept: 'Concept',
  project: 'Project',
};

/** One finding, with how sure the model is and what it rests on. */
export interface Diagnosis {
  finding: string;
  /** 0-1. Bounded server-side; out-of-range confidence is not confidence. */
  confidence: number;
  evidence: string[];
}

export interface Priority {
  focus: string;
  /** 0-1. */
  weight: number;
  reason: string;
}

/**
 * One recommended session.
 *
 * `difficulty` and `minutes` are the model's own recommendations rather than
 * measurements — the only two figures it is allowed to supply — and both are
 * clamped by the server. `id` is the row it was stored as, which is what the
 * feedback loop is keyed on.
 */
export interface NextStep {
  id: string;
  title: string;
  focus: string;
  type: StepType;
  /** 1-5, on Summit's own scale. */
  difficulty: number;
  minutes: number;
  reason: string;
  /**
   * What would say this worked, written when the advice was given.
   *
   * A prediction rather than a measurement, and the field that turns a
   * recommendation into an experiment somebody can settle: "if execution at
   * Hard rises while the difficulty you file stays the same, this is
   * working." Stored beside the recommendation, because a prediction judged
   * against a test invented afterwards is not a prediction.
   *
   * Empty on a step whose signal cited a figure nobody counted, and on every
   * step advised before the field existed.
   */
  signal: string;
  drills: string[];
}

/** An observation is not an insight until it says what to do differently. */
export interface Insight {
  observation: string;
  evidence: string;
  implication: string;
}

/**
 * What kind of thing the reader is chasing.
 *
 * The most consequential word in the reading, because it decides what counts
 * as progress: a competition is won under a clock, so execution under pressure
 * is the measure and raw difficulty is not; coverage is throughput against a
 * syllabus; for a habit, consistency *is* the goal rather than a means to one.
 * Mirrors GOAL_KINDS in backend/tracking/subject_ai.py.
 */
export type GoalKind =
  | 'exam'
  | 'competition'
  | 'mastery'
  | 'habit'
  | 'project'
  | 'coverage'
  | 'unstated';

/** Which way a piece of evidence cuts for the goal. */
export type EvidenceDirection = 'helps' | 'hurts' | 'watch';

/**
 * The goal, read rather than restated.
 *
 * `objective` is the difference between a label and an aim: "Qualify for
 * AIME" is the first, "Qualify for AIME by turning strong problem-solving
 * into consistent contest execution" is the second, because it names the
 * thing that has to change. `focus` is that thing on its own, as the one
 * sentence the rest of the page has to support.
 *
 * Every field may be empty. The server blanks a sentence that cites a figure
 * nobody counted rather than dropping the band, so the page falls back to the
 * goal's own title — see `_clean` in backend/tracking/subject_ai.py.
 */
export interface GoalRead {
  objective: string;
  kind: GoalKind;
  focus: string;
  /** What in the record made it that kind, for when the reader doubts it. */
  why_kind: string;
}

/**
 * One thing about the record that matters *for this goal*.
 *
 * Not the highest figure and not the lowest — the one that would change the
 * reader's next fortnight. "Quality: 78" is not evidence; "your contest
 * execution is improving, 24 to 30 across recent timed work" is. `relevance`
 * is what keeps it honest: a sentence equally true of any goal in any subject
 * is filler, and the server is told to cut the card rather than write it.
 */
export interface GoalEvidence {
  claim: string;
  direction: EvidenceDirection;
  evidence: string[];
  relevance: string;
}

/**
 * The one thing most in the way.
 *
 * The page's only outright judgement, and the reason it is a section of its
 * own rather than the first of three diagnoses: a page with two bottlenecks
 * on it has none.
 *
 * `ruledOut` is the half a reader cannot get anywhere else — "harder material
 * is not the next move, and here is the figure that says so". It is empty
 * rather than reassuring when nothing supports ruling anything out.
 */
export interface Bottleneck {
  name: string;
  evidence: string[];
  reading: string;
  ruled_out: string;
  /** 0-1. */
  confidence: number;
}

export interface SubjectReading {
  /** Absent on a reading written before the objective band existed. */
  goal_read?: GoalRead;
  goal_evidence?: GoalEvidence[];
  bottleneck?: Bottleneck;
  diagnosis: Diagnosis[];
  priorities: Priority[];
  next_steps: NextStep[];
  insights: Insight[];
}

/**
 * The deterministic state, on its way to being read.
 *
 * Everything here was counted in the browser from the account's own tasks —
 * components/Subject/state — and the server tells the model to use these
 * figures and produce no others. Sending them rather than having the server
 * recompute them is what keeps the reading quoting the numbers on screen.
 */
export interface SubjectStatePayload {
  subject: string;
  span: string;
  aim?: string;
  level?: string;
  overall?: number | null;
  finished?: number;
  finished_before?: number;
  rated?: number;
  active_days?: number;
  dimensions: Array<{
    label: string;
    value: number | null;
    meaning: string;
    evidence: string[];
  }>;
  curve?: {
    rungs: Array<{
      level: number;
      label: string;
      done: number;
      execution: number | null;
      quality: number | null;
      cleared: number | null;
      minutes: number | null;
    }>;
    best?: unknown;
    threshold?: unknown;
    drop?: number | null;
  };
  time?: Record<string, unknown>;
  momentum?: Record<string, unknown>;
  mistakes?: Array<{ label: string; count: number; share: number }>;
  /**
   * The relationships between the figures above, worked out before the call.
   *
   * Not more figures — conclusions. Which measure is carrying the shortfall,
   * whether what goes wrong is about knowing the work or about the sitting,
   * where the difficulty filed and the result disagree, and whether capability
   * is running ahead of the score. A model handed only the raw table restates
   * it; handed these it has to reason from them. See components/Subject/performance.
   */
  performance?: Record<string, unknown>;
  goals?: Array<{
    title: string;
    progress: number;
    deadline: string;
    standing: string;
    levers: string[];
  }>;
  /** The authored tree's area names. A curriculum, carrying no measurement. */
  vocabulary?: string[];
}

/** Whether the reading is available at all on this install. */
export function subjectReadingAvailable(): Promise<ApiResult<{ available: boolean }>> {
  return get<{ available: boolean }>('/api/subject_reading');
}

/**
 * A model's reading of one subject. Costs a call.
 *
 * The recommendations that come back are stored server-side so their
 * effectiveness can be checked later — the only thing about this feature that
 * is written down. See backend/api/subject_ai.py.
 */
export function readSubject(
  state: SubjectStatePayload,
): Promise<ApiResult<{ reading: SubjectReading }>> {
  return post<{ reading: SubjectReading }>('/api/subject_reading', state);
}

/** How each kind of session has gone for this account, in this subject. */
export interface StepOutcome {
  type: StepType;
  given: number;
  taken: number;
  /** Points of execution since, or null when none were acted on. */
  change: number | null;
}

export interface PastRecommendation {
  id: string;
  title: string;
  focus: string;
  type: StepType;
  difficulty: number;
  minutes: number;
  reason: string;
  /** Empty for advice given before the field existed. */
  signal: string;
  on: string;
  taken: boolean;
  /** The day it was acted on. Empty while it has not been. */
  taken_on: string;
  /**
   * Execution in this subject on the day it was advised.
   *
   * The `before` half of "did this work". Held rather than recomputed, for
   * the reason the column exists: a change measured against a window that has
   * since moved is not a change. Null for advice given before the figure was
   * being kept, and for a reading taken with nothing rated.
   */
  was: number | null;
  task_id: string;
}

/**
 * The last reading written for this subject, if there is one.
 *
 * Costs nothing — it is a read of what a previous call already paid for. The
 * panel asks on load so a refresh does not throw away a reading, which is what
 * it used to do: the answer lived in component state and nowhere else.
 *
 * `reading` is null when none has been asked for yet, which is a real state
 * and not a failure.
 */
export function savedSubjectReading(
  subject: string,
): Promise<ApiResult<{ reading: SubjectReading | null; written_at: string; span: string }>> {
  return get<{ reading: SubjectReading | null; written_at: string; span: string }>(
    `/api/subject_reading_saved?subject=${encodeURIComponent(subject)}`,
  );
}

export function subjectRecommendations(
  subject: string,
): Promise<ApiResult<{ recommendations: PastRecommendation[]; outcomes: StepOutcome[] }>> {
  return get<{ recommendations: PastRecommendation[]; outcomes: StepOutcome[] }>(
    `/api/subject_recommendations?subject=${encodeURIComponent(subject)}`,
  );
}

/**
 * Record that the reader acted on one.
 *
 * The half of the loop that makes the other half worth anything: without it
 * every recommendation reads as untaken, and "this did not work" cannot be
 * told apart from "this was never tried".
 */
export function takeRecommendation(
  id: string,
  taskId = '',
): Promise<ApiResult<{ id: string }>> {
  return post<{ id: string }>('/api/subject_recommendation', { id, task_id: taskId });
}

// --------------------------------------------------------------------------
// The route to one goal
// --------------------------------------------------------------------------
/** One stage of the plan, with what is true at the end of it. */
export interface PlanPhase {
  title: string;
  /** The model's recommendation, not a measurement. Bounded server-side. */
  weeks: number;
  outcome: string;
  focus: string[];
}

export interface GoalPlan {
  /** Two or three sentences on what stands between them and the goal. */
  route: string;
  phases: PlanPhase[];
  /** Three to five things to do in the next seven days. */
  week: string[];
}

/**
 * What the page has already worked out about one goal, on its way to a plan.
 *
 * Every figure here is one the page drew — see `goalsFor` and `leversFor` in
 * components/Subject/model — and the server tells the model to use these and
 * produce no others. Sending them rather than having the server recompute them
 * is what keeps the plan quoting the same numbers the reader is looking at.
 */
export interface GoalPlanFindings {
  goal: string;
  subject: string;
  why?: string;
  standing?: string;
  deadline?: string;
  days_left?: number | null;
  need_weekly?: string;
  have_weekly?: string;
  lands?: string;
  expected?: number | null;
  stages?: string[];
  levers?: string[];
  aim?: string;
  level?: string;
  span?: string;
  score?: number | null;
  grade?: string | null;
  finished?: number | null;
  aimed?: number | null;
  recent_days?: number | null;
  bands?: BriefFindings['bands'];
  struggles?: BriefFindings['struggles'];
}

/**
 * A model's route from here to one goal. Stores nothing; costs a call.
 *
 * Availability is not asked separately: this needs an Anthropic key and
 * nothing else, which is exactly what `subjectBriefAvailable` answers, so the
 * page draws both buttons or neither.
 */
export function writeGoalPlan(
  findings: GoalPlanFindings,
): Promise<ApiResult<{ plan: GoalPlan }>> {
  return post<{ plan: GoalPlan }>('/api/goal_plan', findings);
}

// --------------------------------------------------------------------------
// Checkpoints set against a subject, and the goal drafted from them
// --------------------------------------------------------------------------
/**
 * One checkpoint on a subject.
 *
 * Not a goal milestone. These hang off the *subject*, need no target and no
 * date, and exist before there is a goal — which is the order people actually
 * work in. See backend/api/subjects.py for why they are kept apart.
 */
export interface SubjectMilestone {
  id: string;
  title: string;
  done: boolean;
}

/** Every subject's checkpoints, keyed by subject id. One read for the lot. */
export function subjectMilestones(): Promise<
  ApiResult<{ milestones: Record<string, SubjectMilestone[]> }>
> {
  return get<{ milestones: Record<string, SubjectMilestone[]> }>('/api/subject_milestones');
}

/** Replace one subject's list. An empty array clears it. */
export function saveSubjectMilestones(
  subject: string,
  milestones: SubjectMilestone[],
): Promise<ApiResult<{ milestones: Record<string, SubjectMilestone[]> }>> {
  return post<{ milestones: Record<string, SubjectMilestone[]> }>(
    '/api/subject_milestones',
    { subject, milestones },
  );
}

/**
 * A goal drafted for a subject from its checkpoints.
 *
 * A draft, not a goal: the page shows it and only the reader pressing Create
 * sends it to `/api/add_goal`, where it is validated like any other.
 */
export interface GoalDraft {
  title: string;
  why: string;
  unit: string;
  target: number;
  weeks: number;
  milestones: string[];
}

export interface DraftFindings {
  subject: string;
  finished: number;
  days: number;
  active_days: number;
  hours: number;
  milestones: string[];
  /* What the subject is for, and how hard the work has actually been.
     The four above say how much was done; these say what it was worth, which
     is what stops a drafted target being a number the reader can already hit.
     Optional because the panel draws before the wizard has been answered and
     on a subject with nothing rated yet — an absent section is left out of the
     brief rather than sent empty. */
  aim?: string;
  level?: string;
  rates?: Array<{ label: string; now: number }>;
  bands?: Array<{ label: string; done: number; holding: number | null }>;
  struggles?: Array<{ label: string; share: number; count: number }>;
}

export function suggestSubjectGoal(
  findings: DraftFindings,
): Promise<ApiResult<{ draft: GoalDraft }>> {
  return post<{ draft: GoalDraft }>('/api/suggest_subject_goal', findings);
}

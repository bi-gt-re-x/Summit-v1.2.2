/**
 * The first thing Summit can honestly say about somebody.
 *
 * ## The gap this fills
 *
 * The early stages of the analytics page were built to a strict rule: count,
 * never infer. That rule is right, and it is the reason the figures on this
 * product are worth reading — but taken to the end it means an account spends
 * its first fortnight being handed totals and never once being told anything.
 * A reader does not experience "no unsupported claims" as integrity. They
 * experience it as a product that has nothing to say about them.
 *
 * So this is the narrow exception, and the narrowness is the whole design: a
 * finding is surfaced only when it rests on a floor of observations, only when
 * the effect is big enough that it is not the coarseness of a five-point scale
 * talking, and only ever wearing the sample it came from. Nothing here
 * projects, nothing here explains *why*, and nothing here is a
 * recommendation — those are the Insights and Recommendations tabs, and they
 * have their own, much higher, thresholds.
 *
 * ## Why every finding carries a confidence
 *
 * Because four observations and forty are not the same claim, and a page that
 * prints them in the same voice is lying with true sentences. The label is the
 * claim's own hedge — "Early observation" is a different sentence from
 * "Established pattern" even when the words after it are identical — so the
 * reader is never asked to work out for themselves how much to believe it.
 *
 * Confidence needs *both* a sample and an effect. A huge gap over five tasks
 * is not established, and neither is a hairline one over two hundred: the
 * first has not been seen enough times, and the second is not a finding at
 * all. Requiring both is what keeps the top tier rare.
 *
 * ## What is deliberately not in here
 *
 * Anything needing a column the record does not have. There is no sub-skill,
 * no topic and no session grouping on a task — see the note at the top of
 * components/Subject/state for the full list of what a task actually carries —
 * so there is no "your algebra is improving" here, however much a reader would
 * want it. Every finding below is counted off `difficulty`, `execution`,
 * `completed_at`, `met_deadline` or `priority`, and nothing else.
 */
import { DIFFICULTY_WORDS } from './ratings';

/**
 * The columns a finding is counted off, and nothing else.
 *
 * Declared structurally rather than as `Task` or `Observable` because both
 * of those satisfy it and both call in here — the analytics page hands over
 * `Task`, the subject page `Observable`, and neither should have to convert.
 * More usefully, it is the list: if a reading below wants a column that is not
 * on here, adding it is a visible decision rather than a field access nobody
 * reviews.
 */
export interface Observable {
  status: string;
  priority?: string;
  completed_at?: string;
  met_deadline?: boolean;
  difficulty?: number;
  execution?: number;
}

/**
 * Observations a finding needs before it is said out loud at all.
 *
 * Five. Below it there is no finding of any strength — a four-task run that is
 * all evenings is a week, not a habit, and saying so at "Early observation"
 * would still be saying it.
 */
export const OBSERVATION_FLOOR = 5;

export type Confidence = 'low' | 'moderate' | 'high';

/**
 * What each tier is called on screen.
 *
 * The label carries the hedge, so the sentence under it does not have to. That
 * keeps the finding itself short and readable — "Most of your finished work
 * here happens in the evening" rather than "There is weak evidence that you
 * may tend to…", which is the register that makes a reader stop reading.
 */
export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: 'Early observation',
  moderate: 'Pattern emerging',
  high: 'Established pattern',
};

export interface Observation {
  key: string;
  /** The finding, in one sentence, in the reader's terms. */
  text: string;
  /** What it was counted off: "from 9 rated tasks". Always printed. */
  support: string;
  confidence: Confidence;
  /** Observations behind it. */
  n: number;
  /** How pronounced the effect is, 0-1. Ranking only; never shown. */
  strength: number;
}

/**
 * Both a sample and an effect, or it does not move up a tier.
 *
 * The thresholds are deliberately steep. `high` means twenty observations
 * *and* a strong effect, which on an account doing a few tasks a day is a
 * month of work — and that is the point: "Established pattern" should be
 * something a reader earns rather than something they see in week one.
 */
function confidenceFor(n: number, strength: number): Confidence {
  if (n >= 20 && strength >= 0.6) return 'high';
  if (n >= 10 && strength >= 0.4) return 'moderate';
  return 'low';
}

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Both rating rows answered. The same test components/Subject/state uses. */
function rated(task: Observable): boolean {
  return Number(task.difficulty) > 0 && Number(task.execution) > 0;
}

function done(tasks: Observable[]): Observable[] {
  return tasks.filter((task) => task.status === 'done');
}

/*
 * The four buckets, shared with utils/habits rather than redeclared, so this
 * and the Habits tab cannot disagree about where the evening ends.
 */
const PART_OF_DAY: Array<{ from: number; to: number; label: string }> = [
  { from: 5, to: 11, label: 'the morning' },
  { from: 12, to: 16, label: 'the afternoon' },
  { from: 17, to: 21, label: 'the evening' },
  { from: 22, to: 28, label: 'the late hours' },
];

function partOfDay(hour: number): string {
  const at = hour < 5 ? hour + 24 : hour;
  return PART_OF_DAY.find((slot) => at >= slot.from && at <= slot.to)?.label ?? 'the evening';
}

/**
 * Executing better, or worse, than the difficulty being taken on.
 *
 * Both rows are one-to-five and both are the reader's own judgement, so the
 * difference between them is the one comparison on this record that needs no
 * external scale: it is somebody's estimate of a task held against their
 * estimate of how it went.
 *
 * Three quarters of a point is the floor, and it is chosen against the scale
 * rather than picked: a five-point scale makes half a point the smallest
 * difference a person can even express, so a threshold below that would be
 * reporting rounding. The sentence stays descriptive — it says the two ratings
 * disagree, not that the reader is underestimating themselves, which would be
 * a claim about a person rather than about a record.
 */
function executionGap(tasks: Observable[]): Observation | null {
  const marks = done(tasks).filter(rated);
  if (marks.length < OBSERVATION_FLOOR) return null;

  const difficulty = mean(marks.map((task) => Number(task.difficulty)));
  const execution = mean(marks.map((task) => Number(task.execution)));
  const gap = execution - difficulty;
  if (Math.abs(gap) < 0.75) return null;

  const n = marks.length;
  const strength = Math.min(1, Math.abs(gap) / 2);
  return {
    key: 'execution-gap',
    text:
      gap > 0
        ? 'You tend to rate these as harder than your execution ratings suggest.'
        : 'These are going less smoothly than the difficulty you give them suggests.',
    support: `from ${plural(n, 'rated task')}, difficulty ${difficulty.toFixed(1)} against execution ${execution.toFixed(1)}`,
    confidence: confidenceFor(n, strength),
    n,
    strength,
  };
}

/**
 * When the finished work actually lands.
 *
 * Tasks whose `completed_at` is a bare date are skipped rather than bucketed:
 * the column carried no clock for a while, and putting those rows in "the
 * morning" would invent exactly the thing being reported. Half is the floor
 * because there are four buckets — a quarter is what chance looks like, and
 * anything under half is not a concentration.
 */
function whenFinished(tasks: Observable[]): Observation | null {
  const counts = new Map<string, number>(PART_OF_DAY.map((slot) => [slot.label, 0]));
  let n = 0;

  done(tasks).forEach((task) => {
    const stamp = String(task.completed_at || '');
    if (stamp.length <= 10) return;
    const hour = Number(stamp.slice(11, 13));
    if (Number.isNaN(hour)) return;
    const label = partOfDay(hour);
    counts.set(label, (counts.get(label) ?? 0) + 1);
    n += 1;
  });

  if (n < OBSERVATION_FLOOR) return null;

  let top = { label: '', count: 0 };
  counts.forEach((count, label) => {
    if (count > top.count) top = { label, count };
  });

  const share = top.count / n;
  if (share < 0.5) return null;

  // A quarter is chance across four buckets; the scale runs from there to all.
  const strength = Math.min(1, (share - 0.25) / 0.75);
  return {
    key: 'when-finished',
    text: `Most of your finished work here happens in ${top.label}.`,
    support: `${top.count} of ${n} timed finishes`,
    confidence: confidenceFor(n, strength),
    n,
    strength,
  };
}

/**
 * Whether deadlines hold.
 *
 * Only tasks that actually had one and recorded an outcome — `met_deadline` is
 * absent on anything undated, and counting those as met would turn "you set no
 * deadline" into "you hit it".
 */
function deadlines(tasks: Observable[]): Observation | null {
  const judged = done(tasks).filter((task) => typeof task.met_deadline === 'boolean');
  if (judged.length < OBSERVATION_FLOOR) return null;

  const met = judged.filter((task) => task.met_deadline).length;
  const n = judged.length;
  const rate = met / n;
  if (rate > 0.4 && rate < 0.8) return null;

  const strength = Math.min(1, Math.abs(rate - 0.5) * 2);
  return {
    key: 'deadlines',
    text:
      rate >= 0.8
        ? 'When you put a deadline on work here, you meet it.'
        : 'Deadlines on this work slip more often than they hold.',
    support: `${met} of ${n} met`,
    confidence: confidenceFor(n, strength),
    n,
    strength,
  };
}

/**
 * Whether the work clusters at one difficulty.
 *
 * Sixty per cent across five levels, which is a long way above the twenty that
 * an even spread would give — the bar is high because this is the least
 * surprising of the four findings, and a reader who takes on mostly Fair work
 * is not learning much from being told so unless it is emphatic.
 */
function difficultyMix(tasks: Observable[]): Observation | null {
  const marks = done(tasks).filter((task) => Number(task.difficulty) > 0);
  if (marks.length < OBSERVATION_FLOOR) return null;

  const counts = new Map<number, number>();
  marks.forEach((task) => {
    const level = Number(task.difficulty);
    counts.set(level, (counts.get(level) ?? 0) + 1);
  });

  let top = { level: 0, count: 0 };
  counts.forEach((count, level) => {
    if (count > top.count) top = { level, count };
  });

  const n = marks.length;
  const share = top.count / n;
  if (share < 0.6) return null;

  const word = DIFFICULTY_WORDS[top.level - 1] ?? 'that level';
  const strength = Math.min(1, (share - 0.2) / 0.8);
  return {
    key: 'difficulty-mix',
    text: `Nearly everything you take on here sits at ${word}.`,
    support: `${top.count} of ${plural(n, 'rated task')}`,
    confidence: confidenceFor(n, strength),
    n,
    strength,
  };
}

const READINGS = [executionGap, whenFinished, deadlines, difficultyMix];

/**
 * Everything that can honestly be said, strongest first.
 *
 * Ranked by confidence before strength, because a moderate finding over thirty
 * tasks is worth more to a reader than a spectacular one over six — and by `n`
 * last, so two findings that tie are settled by which has been seen more
 * often rather than by the order they happen to be declared in above.
 *
 * Callers that want the single "aha" take the first. Nothing here caps the
 * list; the page decides how many it has room to say.
 */
export function observations(tasks: Observable[]): Observation[] {
  const rank: Record<Confidence, number> = { high: 3, moderate: 2, low: 1 };
  return READINGS.map((read) => read(tasks))
    .filter((found): found is Observation => found !== null)
    .sort(
      (a, b) =>
        rank[b.confidence] - rank[a.confidence] ||
        b.strength - a.strength ||
        b.n - a.n,
    );
}

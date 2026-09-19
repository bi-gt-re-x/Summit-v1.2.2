/**
 * The lens — which questions a goal makes worth asking of the same record.
 *
 * ## The problem this solves
 *
 * Analytics scores five metrics and prints them in a fixed order on every
 * account. That order is a guess about what the reader came for, and it is the
 * same guess whether they are trying to stop missing easy problems or trying to
 * solve harder ones than they can currently solve. Those two readers want
 * opposite things out of one record:
 *
 *     Reach 24 on the AMC 8      accuracy, carelessness, topic gaps,
 *                                consistency — getting right what you already
 *                                half-know
 *
 *     Reach 7 on the AIME        depth, difficulty, time per solved problem —
 *                                extending what you can do at all
 *
 * Same tasks, same ratings, same focus ledger. Different lens.
 *
 * ## What decides the lens, and what does not
 *
 * **Not the title.** Nothing here reads "AMC" or "AIME" out of a string. A
 * substring match is a guess dressed as a rule: it would fire on a goal called
 * "stop doing AMC problems", miss every goal written in another language, and
 * leave a reader whose goal is phrased unusually with a page silently tuned for
 * somebody else.
 *
 * What decides it is the goal's own terms and the work aimed at it:
 *
 *   `measure`     what the goal counts. A streak or a focus goal is about
 *                 turning up; an XP or task goal is about volume; a number or
 *                 a milestone goal is about an outcome, and the two lenses
 *                 above are both that kind.
 *
 *   `difficulty`  the mean the reader themselves put on the tasks they pointed
 *                 at it. This is what tells the two outcome lenses apart, and
 *                 it is the honest version of the distinction: a goal being fed
 *                 tasks the reader rates 4s and 5s is a goal about hard work,
 *                 whatever it is called; one being fed 2s and 3s is a goal
 *                 about getting a lot of ordinary work right.
 *
 * ## It refuses before it guesses
 *
 * `MIN_RATED` tasks have to carry a difficulty before the outcome lenses are
 * told apart, and with fewer the lens is `null` — the page keeps its ordinary
 * order and says nothing. A lens chosen off two ratings would reorder somebody's
 * analytics page on a coin flip, and the reader has no way to see that it
 * happened. Every lens carries the count it was chosen on for the same reason.
 *
 * ## It reorders; it never hides
 *
 * A lens moves what leads. It does not remove a panel, change a figure, or
 * weight a score — the growth score is the same number under every lens, and
 * `analyticalScore` never sees this file. Anything else would make "how am I
 * doing" depend on which goal happened to be top of the list.
 */
import { goalNumbers } from '@/components/Goals/numbers';
import { evidenceFor } from './goalHealth';
import type { MetricKey } from '@/components/Analytics/data';
import type { ActionKind } from './nextActions';
import type { Goal, Task } from '@/types';

/** Which reading of the record a goal calls for. */
export type LensId = 'accuracy' | 'depth' | 'volume' | 'consistency';

/**
 * What a lens can rank.
 *
 * The five the growth score is built from plus the two the charts add. It is
 * wider than `MetricKey` because the score's factors carry `efficiency`, which
 * is not a chartable series and is still one of the five things a lens has an
 * opinion about — see `analyticalScore`. Every lens lists all seven, so
 * nothing is ranked by omission.
 */
export type LensMetric = MetricKey | 'efficiency';

/**
 * Ratings needed before an outcome goal's lens is chosen.
 *
 * Eight, which is the same floor `goalReading` uses before it will name a best
 * weekday (utils/goalAnalytics) and for the same reason: below it the mean is
 * whatever the last couple of answers happened to be.
 */
const MIN_RATED = 8;

/**
 * Where hard work starts, on the five-point scale a reader types in.
 *
 * Above the middle rather than at it. A mean of exactly 3 is a goal being fed
 * ordinary work, and rounding that toward "this is a depth goal" would put half
 * of all accounts under the harder lens by default.
 */
const HARD = 3.5;

export interface GoalLens {
  goalId: string;
  goalTitle: string;
  id: LensId;
  /** The lens in two or three words, for the line above the page. */
  label: string;
  /**
   * The metrics this goal makes most worth reading, first is most.
   *
   * Every key here is one the analytics page already charts — see METRICS in
   * components/Analytics/data. A lens cannot invent a measure; it can only say
   * which of the five to read first.
   */
  priorities: LensMetric[];
  /** What this lens says the reader should be watching, in their words. */
  watch: string[];
  /** Why this lens and not another, naming the figure. One sentence. */
  because: string;
  /** Mean difficulty of the work aimed at the goal, or null if too little. */
  difficulty: number | null;
  /** How many rated tasks that mean came from. */
  rated: number;
  /**
   * Multipliers on the next-action ranking, by kind. 1 leaves a kind alone.
   *
   * Deliberately narrow — 0.8 to 1.5. A lens is a reordering of things that all
   * earned their place; one that could multiply by five would be choosing the
   * plan rather than tilting it, and an overdue task would drop below a
   * revision suggestion because of what the reader is aiming at this term.
   */
  weights: Partial<Record<ActionKind, number>>;
}

/** The four lenses, as everything about them except which goal chose it. */
const LENSES: Record<LensId, Omit<GoalLens, 'goalId' | 'goalTitle' | 'because' | 'difficulty' | 'rated'>> = {
  accuracy: {
    id: 'accuracy',
    label: 'Accuracy and control',
    /* Quality first — it is difficulty times execution, which is the closest
       this record comes to "did you get it right" — then whether the work is
       happening often enough to hold a standard. */
    priorities: ['quality', 'consistency', 'efficiency', 'productivity', 'tasks', 'focus', 'xp'],
    watch: [
      'How well rated work goes, not how much of it there is',
      'Subjects where execution drops below your own average',
      'Whether the standard holds across days rather than peaking',
    ],
    /* Review and the weak subject are the two that fix a slip rather than add
       volume, so they lead; a streak nudge is not what this goal needs. */
    weights: { review: 1.5, 'weak-subject': 1.4, stale: 1.1, streak: 0.8 },
  },
  depth: {
    id: 'depth',
    label: 'Depth and difficulty',
    priorities: ['focus', 'quality', 'productivity', 'tasks', 'consistency', 'efficiency', 'xp'],
    watch: [
      'Unbroken time, because hard work needs a long sitting',
      'How the hardest work you rate actually goes',
      'Whether one subject is going deep or several are going shallow',
    ],
    /* The goal's own work first, and long sessions over frequent ones. A
       neglected subject matters less than the one the goal is about. */
    weights: { goal: 1.5, 'weak-subject': 1.2, neglected: 0.8, streak: 0.8 },
  },
  volume: {
    id: 'volume',
    label: 'Throughput',
    priorities: ['productivity', 'efficiency', 'tasks', 'xp', 'consistency', 'quality', 'focus'],
    watch: [
      'XP a day, and whether it is rising',
      'How many tasks actually close rather than accumulate',
      'What is sitting unfinished and dragging the rate down',
    ],
    weights: { overdue: 1.4, stale: 1.3, goal: 1.2, review: 0.8 },
  },
  consistency: {
    id: 'consistency',
    label: 'Turning up',
    priorities: ['consistency', 'focus', 'productivity', 'tasks', 'quality', 'efficiency', 'xp'],
    watch: [
      'The share of days with anything on them',
      'The length of the gaps, not the size of the good days',
      'Whether the habit survives a bad week',
    ],
    weights: { streak: 1.5, neglected: 1.3, goal: 1.1, review: 0.9 },
  },
};

/** Mean difficulty over the goal's rated work, and how many rows said so. */
function difficultyOf(goal: Goal, tasks: Task[]): { mean: number | null; rated: number } {
  const rated = evidenceFor(goal, tasks).filter(
    (task) =>
      task.status === 'done'
      && typeof task.difficulty === 'number'
      && task.difficulty > 0,
  );
  if (rated.length < MIN_RATED) return { mean: null, rated: rated.length };
  const total = rated.reduce((sum, task) => sum + Number(task.difficulty), 0);
  return { mean: total / rated.length, rated: rated.length };
}

/**
 * The lens one goal calls for, or null when the record cannot say.
 *
 * Null is a real answer and the common one on a young account: the page then
 * keeps the order it has always had, which is the right behaviour for a reader
 * whose goals have nothing pointed at them yet.
 */
export function goalLens(goal: Goal, tasks: Task[]): GoalLens | null {
  if (goal.status === 'completed') return null;

  const measure = goalNumbers(goal).measure;
  const { mean, rated } = difficultyOf(goal, tasks);

  const wrap = (id: LensId, because: string): GoalLens => ({
    ...LENSES[id],
    goalId: goal.id,
    goalTitle: goal.title,
    because,
    difficulty: mean,
    rated,
  });

  // Turning up is the whole goal. Nothing about difficulty changes that.
  if (measure === 'streak' || measure === 'focus') {
    return wrap(
      'consistency',
      `${goal.title} is measured in ${measure === 'streak' ? 'days in a row' : 'time logged'}, so how often you turn up is the goal.`,
    );
  }

  // Counters. The goal is a quantity, so the rate at which it fills is what
  // there is to read; nothing about it asks how well any one task went.
  if (measure === 'xp' || measure === 'tasks') {
    return wrap('volume', `${goal.title} counts totals, so the rate it fills at is what moves it.`);
  }

  // An outcome — a number to reach, or a ladder to climb. Both lenses below
  // are this kind, and the work aimed at it is what tells them apart.
  if (mean === null) {
    // Not enough rated work to say which. Saying nothing beats picking one.
    return null;
  }
  if (mean >= HARD) {
    return wrap(
      'depth',
      `Your ${rated} rated tasks for this goal average ${mean.toFixed(1)}/5 for difficulty, so focus on harder work, not more of it.`,
    );
  }
  return wrap(
    'accuracy',
    `The ${rated} tasks you rated for this average ${mean.toFixed(1)} out of 5 for difficulty, so what decides it is how reliably the ordinary work goes.`,
  );
}

/**
 * The lens the page should read through, across every live goal.
 *
 * One, not several. A page tuned four ways at once is a page tuned no way, and
 * the reader has one screen — so the goal with the most work pointed at it
 * wins, which is the one they are actually spending their term on. Priority is
 * deliberately not the tiebreak: what somebody marked important and what they
 * are doing are different facts, and this is about reading the record.
 */
export function leadingLens(goals: Goal[], tasks: Task[]): GoalLens | null {
  const ranked = goals
    .filter((goal) => goal.status !== 'completed')
    .map((goal) => ({
      lens: goalLens(goal, tasks),
      aimed: evidenceFor(goal, tasks).filter((task) => task.status === 'done').length,
    }))
    .filter((row): row is { lens: GoalLens; aimed: number } => row.lens !== null)
    .sort((a, b) => b.aimed - a.aimed || a.lens.goalTitle.localeCompare(b.lens.goalTitle));

  return ranked[0]?.lens ?? null;
}

/**
 * Reorder metric keys so the lens's priorities lead.
 *
 * Stable within each half: anything the lens does not mention keeps the order
 * it arrived in, so a lens that cares about two metrics moves those two and
 * leaves the rest exactly as they were.
 */
export function throughLens<T>(
  rows: T[],
  keyOf: (row: T) => LensMetric,
  lens: GoalLens | null,
): T[] {
  if (!lens) return rows;
  const rank = new Map(lens.priorities.map((key, at) => [key, at]));
  return [...rows].sort(
    (a, b) => (rank.get(keyOf(a)) ?? 99) - (rank.get(keyOf(b)) ?? 99),
  );
}

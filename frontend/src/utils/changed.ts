/**
 * What changed — the three sentences a reader opens Insights for.
 *
 * Every other panel on that tab answers a question the reader had to think of
 * first: what are my hours like, which subject is widest, how consistent am I.
 * This one answers the question they actually arrived with — *what is different
 * about me lately* — and it answers it in at most three cards:
 *
 *     Getting stronger   Your average difficulty rose from 3.2 to 3.8 over the
 *                        last 30 days while your execution held at 86%.
 *     Emerging problem   Your hardest tasks go badly 23 points more often than
 *                        your medium ones — 31% against 8%.
 *     Hidden pattern     You rate your own work 12% higher on tasks you finish
 *                        before 5pm.
 *
 * ## Why this is an assembly rather than a new finder
 *
 * Three modules already look for this material and each is careful in its own
 * way: utils/insight's `whatsWorking` measures improvements against the
 * previous period of the same length, utils/diagnosis names tensions between
 * two readings, and utils/patterns splits the account's own tasks and refuses
 * to speak below a sample floor. A fourth finder would be a fourth set of
 * thresholds to keep in step, and the first time two of them disagreed the page
 * would be arguing with itself.
 *
 * So most of this file is selection: take what those three found, put one of
 * each kind in front of the reader, and rank the rest. Only two findings are
 * computed here, because nothing else computes them — difficulty rising while
 * execution holds, and the gap between how the hardest and the middling work
 * turns out. Both are movements in what the reader *said about their own
 * tasks*, which is the half of the record the day series cannot see.
 *
 * ## One of each, not the top three
 *
 * Ranking three kinds of finding on one scale would let a good month fill the
 * section with four gains, and the card a reader needs most is the one they
 * would not have gone looking for. So the three kinds are drawn round-robin,
 * strongest of each first. That is also why `whatChanged` returns the kind on
 * every row rather than a pre-sorted list of strings: the panel needs to know
 * which of the three it is drawing to label and colour it.
 *
 * ## It never says what to do
 *
 * Same rule as the rest of the Insights tab. `Diagnosis.action` and
 * `Pattern.soWhat` both exist and both are deliberately dropped here — the
 * Recommendations tab owns instructions, and a card that states a finding and
 * then tells you to fix it has made the next tab redundant.
 */
import type { GrowthDay, Task } from '@/types';
import type { Diagnosis } from './diagnosis';
import type { Strength } from './insight';
import type { Win } from './insight';
import type { Pattern } from './patterns';
import { pctChange } from './recent';

/** How long "lately" is, in days, and the length of the stretch it is compared with. */
export const CHANGE_WINDOW = 30;

/**
 * Fewest rated tasks on each side of the difficulty split before it is read.
 *
 * The same floor utils/patterns uses, for the same reason: a gap between four
 * hard tasks and five medium ones is a gap between one bad afternoon and
 * another.
 */
const MIN_BAND = 6;

/** Below this, a difficulty band's outcomes are the same as the other's. */
const MIN_POINTS = 8;

/** Below this, the difficulty a reader takes on has not moved. */
const MIN_DIFFICULTY_LIFT = 8;

/** An execution rating at or under this is work that went badly. */
const POOR_EXECUTION = 2;

/** Difficulty at or above this is the hard end of what this account takes on. */
const HARD_FLOOR = 4;

export type ChangeKind = 'gain' | 'problem' | 'pattern';

/** The heading each kind of card wears. */
export const CHANGE_TITLE: Record<ChangeKind, string> = {
  gain: 'Getting stronger',
  problem: 'Emerging problem',
  pattern: 'Hidden pattern',
};

export interface Change {
  id: string;
  kind: ChangeKind;
  /** The finding, as one sentence a reader could repeat to somebody. */
  text: string;
  /**
   * "3.2 → 3.8", where the finding is a movement between two readings.
   *
   * Separate from the sentence because it is the one part of a card worth
   * reading at a glance, and because a reader scanning four cards for the
   * arrows should not have to find them inside four different clauses.
   */
  move?: string;
  /** The counts the sentence stands on. Absent when the source carried none. */
  basis?: string;
  /** How much weight it can take, where the source graded itself. */
  strength?: Strength;
  /** Ranking weight within its own kind. */
  weight: number;
}

const num = (value: unknown) => Number(value) || 0;
const one = (value: number) => (Math.round(value * 10) / 10).toFixed(1);
const pct = (value: number) => `${Math.round(Math.abs(value))}%`;

/** Mean over rated tasks, weighted by how many each day had. */
function overRated(days: GrowthDay[], read: (day: GrowthDay) => number): number | null {
  const rated = days.reduce((sum, day) => sum + num(day.rated_tasks), 0);
  if (!rated) return null;
  const weighted = days.reduce((sum, day) => sum + read(day) * num(day.rated_tasks), 0);
  return weighted / rated;
}

/**
 * Difficulty rising while execution holds — the one finding worth leading with.
 *
 * Taking on harder work is the only thing in the record that can look like a
 * decline and be an improvement: XP per day falls, tasks per day falls, and the
 * reader is getting better. Nothing else here would say so, because every other
 * measure on the tab reads output rather than what the output cost.
 *
 * "Holds" is deliberately generous — within a tenth of a point, in either
 * direction. Demanding that execution *rise* with difficulty would be asking
 * the reader to get better at a harder thing at the same time, which is not
 * what this card is about.
 */
function difficultyRising(days: GrowthDay[], window: number): Change | null {
  const now = days.slice(-window);
  const before = days.slice(-window * 2, -window);
  if (before.length !== now.length || now.length < 7) return null;

  const hardNow = overRated(now, (day) => num(day.avg_difficulty));
  const hardWas = overRated(before, (day) => num(day.avg_difficulty));
  const wellNow = overRated(now, (day) => num(day.avg_execution));
  const wellWas = overRated(before, (day) => num(day.avg_execution));
  if (hardNow === null || hardWas === null || wellNow === null || wellWas === null) return null;

  const lift = pctChange(hardNow, hardWas);
  if (lift === null || lift < MIN_DIFFICULTY_LIFT) return null;
  // Execution may sag a little under harder work and this still be the finding;
  // a real collapse is a different card, and the problem rules below own it.
  if (wellNow < wellWas - 0.1) return null;

  const ratedNow = now.reduce((sum, day) => sum + num(day.rated_tasks), 0);
  return {
    id: 'change-difficulty-up',
    kind: 'gain',
    text:
      `The work you take on has got harder — average difficulty ${one(hardWas)} to ` +
      `${one(hardNow)} over ${window} days — and how well it goes has held at ` +
      `${Math.round((wellNow / 5) * 100)}% of the maximum.`,
    move: `${one(hardWas)} → ${one(hardNow)}`,
    basis: `${ratedNow.toLocaleString()} rated tasks in the last ${window} days.`,
    weight: 40 + lift,
  };
}

/**
 * Whether the hard end of the work goes worse than the middle.
 *
 * Bands rather than a correlation: difficulty is a 1-5 rating a person assigns,
 * and treating five self-reported steps as a continuous scale to fit a line
 * through claims a precision the input does not have. Two named groups — 4s and
 * 5s against 3s — is a claim the reader can check by remembering last week.
 *
 * "Goes badly" is an execution of 1 or 2, which is the reader's own verdict
 * rather than an inference from output. The gap is stated in points and both
 * rates are printed, because "23% higher" over an 8% base is a different fact
 * from "23 points higher" and the two get confused constantly.
 */
function hardTasksFailing(finished: Task[]): Change | null {
  const rated = finished.filter((task) => num(task.difficulty) > 0 && num(task.execution) > 0);
  const hard = rated.filter((task) => num(task.difficulty) >= HARD_FLOOR);
  const middling = rated.filter((task) => num(task.difficulty) === 3);
  if (hard.length < MIN_BAND || middling.length < MIN_BAND) return null;

  const poorRate = (rows: Task[]) =>
    (rows.filter((task) => num(task.execution) <= POOR_EXECUTION).length / rows.length) * 100;
  const hardRate = poorRate(hard);
  const midRate = poorRate(middling);
  const points = hardRate - midRate;
  if (points < MIN_POINTS) return null;

  const smaller = Math.min(hard.length, middling.length);
  return {
    id: 'change-hard-failing',
    kind: 'problem',
    text:
      `Your hardest tasks go badly ${Math.round(points)} points more often than your ` +
      `middling ones — ${Math.round(hardRate)}% against ${Math.round(midRate)}% rated 2 or below.`,
    move: `${Math.round(midRate)}% → ${Math.round(hardRate)}%`,
    basis: `${hard.length} tasks rated 4 or 5 for difficulty, ${middling.length} rated 3.`,
    strength: smaller >= 20 && points >= 15 ? 'strong' : smaller >= 12 ? 'likely' : 'weak',
    weight: 30 + points,
  };
}

/** A win, as a change card. The figure it carries is already a movement. */
function fromWin(win: Win): Change {
  return {
    id: `change-${win.id}`,
    kind: 'gain',
    text: `${win.text}.`,
    move: win.figure.includes('→') ? win.figure : undefined,
    basis: win.figure.includes('→') ? undefined : win.figure,
    weight: 20,
  };
}

/**
 * A diagnosis, as a change card — its two readings, and not its instruction.
 *
 * `headline` is the tension in words and `detail` is where the figures are, so
 * the card is both of them: the headline alone is a mood and the detail alone
 * is a pair of numbers nobody asked for.
 */
function fromDiagnosis(row: Diagnosis): Change {
  return {
    id: `change-${row.id}`,
    kind: 'problem',
    text: `${row.headline} ${row.detail}`,
    weight: row.weight,
  };
}

/** A discovered pattern, as a change card. */
function fromPattern(row: Pattern): Change {
  return {
    id: `change-${row.id}`,
    kind: 'pattern',
    text: row.text,
    move: `${row.lift >= 0 ? '+' : '−'}${pct(row.lift)}`,
    basis: row.basis,
    strength: row.strength,
    weight: row.weight,
  };
}

export interface ChangedInput {
  /** The day series. Only the last two windows of it are read. */
  days: GrowthDay[];
  /** Tasks finished in the pattern window, for the difficulty bands. */
  finished: Task[];
  /** What utils/insight found going right. */
  wins: Win[];
  /** What utils/diagnosis found in tension. */
  diagnoses: Diagnosis[];
  /** What utils/patterns found, already ranked. */
  patterns: Pattern[];
  window?: number;
}

/**
 * The cards, one kind at a time, strongest of each first.
 *
 * Round-robin rather than ranked: see the note at the top. A caller that wants
 * three cards takes the first three and gets one of each kind where each kind
 * has one, which is the shape the section was designed around.
 */
export function whatChanged({
  days,
  finished,
  wins,
  diagnoses,
  patterns,
  window = CHANGE_WINDOW,
}: ChangedInput): Change[] {
  const gains: Change[] = [];
  const problems: Change[] = [];

  const rising = difficultyRising(days, window);
  if (rising) gains.push(rising);
  gains.push(...wins.map(fromWin));

  const failing = hardTasksFailing(finished);
  if (failing) problems.push(failing);
  problems.push(...diagnoses.map(fromDiagnosis));

  const found = patterns.map(fromPattern);

  const byWeight = (a: Change, b: Change) => b.weight - a.weight;
  const lanes = [gains.sort(byWeight), problems.sort(byWeight), found.sort(byWeight)];

  const out: Change[] = [];
  for (let round = 0; out.length < gains.length + problems.length + found.length; round += 1) {
    let added = false;
    lanes.forEach((lane) => {
      const row = lane[round];
      if (row) {
        out.push(row);
        added = true;
      }
    });
    if (!added) break;
  }
  return out;
}

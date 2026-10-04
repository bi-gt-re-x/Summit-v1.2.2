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
  /**
   * What sort of finding this is, for keeping two of the same off the page.
   *
   * Not the same as `kind`, which is the three columns the panel draws. This
   * is the *measure* underneath, and it exists because the section printed
   * "Gym: 267 weeks in a row" and "Lift: 267 weeks in a row" one above the
   * other: two rows from `whatsWorking`'s habit-streak lane, both true, and
   * together saying nothing the first did not. One per family reaches the
   * reader; the rest are still ranked behind it and still available to a
   * caller that asks for more than the page does.
   */
  family: string;
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
    family: 'difficulty',
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
    family: 'difficulty-bands',
    text:
      `Your hardest tasks go badly ${Math.round(points)} points more often than your ` +
      `middling ones — ${Math.round(hardRate)}% against ${Math.round(midRate)}% rated 2 or below.`,
    move: `${Math.round(midRate)}% → ${Math.round(hardRate)}%`,
    basis: `${hard.length} tasks rated 4 or 5 for difficulty, ${middling.length} rated 3.`,
    strength: smaller >= 20 && points >= 15 ? 'strong' : smaller >= 12 ? 'likely' : 'weak',
    weight: 30 + points,
  };
}

/* --------------------------------------------------------------------------
   The five measures this section was missing.

   What it drew before came almost entirely from `whatsWorking`, and that
   reads the day series — XP, tasks completed, focus minutes, days worked. All
   output, all of it the same shape, and on an account with two strong habits
   two of the three cards were the same streak twice. A reader asking "what is
   different about me lately" gets a thinner answer from four views of their
   XP than from one each about how well the work went, what it cost, which
   subject moved, where their level moved, and what is sitting overdue.

   Every one of these reads something already fetched. None of them says what
   to do about it — the rule at the top of this file.
   -------------------------------------------------------------------------- */

/** Below this many points of movement, execution has not moved. */
const MIN_QUALITY_MOVE = 6;

/** Below this, XP per hour is the same XP per hour. */
const MIN_EFFICIENCY_MOVE = 12;

/** Below this many points of share, a subject has not moved. */
const MIN_SUBJECT_MOVE = 8;

/** Fewer rated tasks than this either side and none of the ratings hold. */
const MIN_RATED = 8;

/**
 * How well the work went, now against the window before it.
 *
 * The reader's own execution rating, which is the only measure on the page
 * that is about *quality* rather than quantity — an account can finish more,
 * earn more and log more hours while doing the work worse, and nothing else
 * in this section would notice.
 *
 * Stated out of five rather than as a percentage because that is the scale
 * the reader answered on, and a rating rendered as "68%" is a number they
 * never gave.
 */
function qualityMoved(days: GrowthDay[], window: number): Change | null {
  const now = days.slice(-window);
  const before = days.slice(-window * 2, -window);
  if (before.length !== now.length || now.length < 7) return null;

  const ratedNow = now.reduce((sum, day) => sum + num(day.rated_tasks), 0);
  const ratedWas = before.reduce((sum, day) => sum + num(day.rated_tasks), 0);
  if (ratedNow < MIN_RATED || ratedWas < MIN_RATED) return null;

  const wellNow = overRated(now, (day) => num(day.avg_execution));
  const wellWas = overRated(before, (day) => num(day.avg_execution));
  if (wellNow === null || wellWas === null) return null;

  const move = pctChange(wellNow, wellWas);
  if (move === null || Math.abs(move) < MIN_QUALITY_MOVE) return null;

  const up = move > 0;
  return {
    id: 'change-quality',
    kind: up ? 'gain' : 'problem',
    family: 'quality',
    text: up
      ? `The work is going better — you rate your own execution ${one(wellWas)} out of 5 ` +
        `before, ${one(wellNow)} now.`
      : `The work is going worse — you rate your own execution ${one(wellWas)} out of 5 ` +
        `before, ${one(wellNow)} now.`,
    move: `${one(wellWas)} → ${one(wellNow)}`,
    basis: `${ratedNow.toLocaleString()} rated tasks in the last ${window} days, ${ratedWas.toLocaleString()} before.`,
    weight: 45 + Math.abs(move),
  };
}

/**
 * What an hour of focus is worth, now against before.
 *
 * XP per focus hour rather than minutes per task: a task is not a fixed unit
 * of work, so "tasks are taking longer" is as easily a reader taking on more
 * per task as it is a reader slowing down — which is exactly the misreading
 * the difficulty card above exists to prevent. XP is what the account itself
 * decided each task was worth, so the ratio is output against the time it
 * took, in the app's own currency.
 */
function efficiencyMoved(days: GrowthDay[], window: number): Change | null {
  const now = days.slice(-window);
  const before = days.slice(-window * 2, -window);
  if (before.length !== now.length || now.length < 7) return null;

  const perHour = (rows: GrowthDay[]) => {
    const minutes = rows.reduce((sum, day) => sum + num(day.focus_minutes), 0);
    const xp = rows.reduce((sum, day) => sum + num(day.xp_earned), 0);
    // An hour of logged focus either side, or the ratio is one afternoon.
    return minutes >= 60 ? { rate: xp / (minutes / 60), hours: minutes / 60 } : null;
  };
  const nowRate = perHour(now);
  const wasRate = perHour(before);
  if (!nowRate || !wasRate) return null;

  const move = pctChange(nowRate.rate, wasRate.rate);
  if (move === null || Math.abs(move) < MIN_EFFICIENCY_MOVE) return null;

  const up = move > 0;
  const round = (value: number) => Math.round(value).toLocaleString();
  return {
    id: 'change-efficiency',
    kind: up ? 'gain' : 'problem',
    family: 'efficiency',
    text: up
      ? `An hour of focus is worth more than it was — ${round(nowRate.rate)} XP an hour ` +
        `against ${round(wasRate.rate)} over the ${window} days before.`
      : `An hour of focus is worth less than it was — ${round(nowRate.rate)} XP an hour ` +
        `against ${round(wasRate.rate)} over the ${window} days before.`,
    move: `${round(wasRate.rate)} → ${round(nowRate.rate)} XP/h`,
    basis: `${Math.round(nowRate.hours)} focus hours in the last ${window} days, ${Math.round(wasRate.hours)} before.`,
    weight: 35 + Math.abs(move),
  };
}

/** One subject's XP over the window on screen and the one before it. */
export interface SubjectMove {
  key: string;
  name: string;
  now: number;
  before: number;
}

/**
 * Which subject took a different share of the work.
 *
 * Share rather than raw XP, and deliberately: a reader who simply did more of
 * everything has not *changed* what they work on, and a card saying Maths rose
 * 40% on a month where everything rose 40% is a card about the month. Share
 * asks the question the section is for — is the balance different.
 */
function subjectMoved(rows: SubjectMove[]): Change[] {
  const totalNow = rows.reduce((sum, row) => sum + row.now, 0);
  const totalWas = rows.reduce((sum, row) => sum + row.before, 0);
  if (totalNow <= 0 || totalWas <= 0) return [];

  const moved = rows
    .map((row) => {
      const shareNow = (row.now / totalNow) * 100;
      const shareWas = (row.before / totalWas) * 100;
      return { ...row, shareNow, shareWas, points: shareNow - shareWas };
    })
    .filter((row) => Math.abs(row.points) >= MIN_SUBJECT_MOVE)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));

  const risen = moved.find((row) => row.points > 0);
  const fallen = moved.find((row) => row.points < 0);

  const card = (row: (typeof moved)[number]): Change => {
    const up = row.points > 0;
    return {
      id: `change-subject-${row.key}`,
      kind: up ? 'gain' : 'problem',
      family: up ? 'subject-risen' : 'subject-fallen',
      text: up
        ? `${row.name} is taking more of your work — ${Math.round(row.shareWas)}% of the XP ` +
          `you earned before, ${Math.round(row.shareNow)}% now.`
        : `${row.name} is taking less of your work — ${Math.round(row.shareWas)}% of the XP ` +
          `you earned before, ${Math.round(row.shareNow)}% now.`,
      move: `${Math.round(row.shareWas)}% → ${Math.round(row.shareNow)}%`,
      basis: `${Math.round(row.now).toLocaleString()} XP in this window against ${Math.round(row.before).toLocaleString()} before.`,
      weight: 25 + Math.abs(row.points),
    };
  };

  return [risen, fallen].filter(Boolean).map((row) => card(row!));
}

/** Below this many overdue tasks, a backlog is a couple of things you moved. */
const MIN_OVERDUE = 3;

/**
 * What is sitting past its due date right now.
 *
 * The one card here that is a state rather than a movement, and it earns the
 * exception: every other finding in this section is about the last thirty days
 * and this is about work the reader still owes. A month that looks good on
 * every measure above can have nine things rotting behind it, and nothing on
 * the tab said so.
 *
 * Only dated, unfinished work counts. An undated task cannot be late, and
 * treating one as late is how a tracker teaches people to stop setting dates.
 */
function overdueBacklog(open: Task[], todayIso: string): Change | null {
  if (!todayIso) return null;
  const late = open.filter(
    (task) => task.status !== 'done' && task.due_date && task.due_date < todayIso,
  );
  if (late.length < MIN_OVERDUE) return null;

  const oldest = late.reduce(
    (earliest, task) => (task.due_date! < earliest ? task.due_date! : earliest),
    late[0]!.due_date!,
  );
  const days = Math.max(
    0,
    Math.round((Date.parse(todayIso) - Date.parse(oldest)) / (1000 * 60 * 60 * 24)),
  );

  return {
    id: 'change-overdue',
    kind: 'problem',
    family: 'overdue',
    text:
      `${late.length} ${late.length === 1 ? 'task is' : 'tasks are'} past the date you set for ` +
      `${late.length === 1 ? 'it' : 'them'}` +
      (days > 0 ? `, the oldest by ${days} ${days === 1 ? 'day' : 'days'}.` : '.'),
    basis: `Counted from unfinished tasks carrying a due date.`,
    weight: 32 + Math.min(20, late.length),
  };
}

/** A win, as a change card. The figure it carries is already a movement. */
function fromWin(win: Win): Change {
  return {
    id: `change-${win.id}`,
    kind: 'gain',
    /* `win-habit-Gym` and `win-habit-Lift` are one family, which is the whole
       reason this field exists — see `Change.family`. Everything else from
       `whatsWorking` is its own measure and keeps its own id. */
    family: win.id.startsWith('win-habit-') ? 'habit-streak' : win.id,
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
    family: row.id,
    text: `${row.headline} ${row.detail}`,
    weight: row.weight,
  };
}

/** A discovered pattern, as a change card. */
function fromPattern(row: Pattern): Change {
  return {
    id: `change-${row.id}`,
    kind: 'pattern',
    family: row.id,
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

  /* ---- The ones below are optional, and a caller that omits one loses that
     card and nothing else. They are optional because this function is called
     from tests and fixtures that predate them, and because each is a *source*
     rather than a setting. */

  /** Every subject's XP this window and the one before, for the balance card. */
  subjects?: SubjectMove[];
  /** Subject id to the name a reader recognises. */
  nameOf?: (id: string) => string;
  /** Every task, finished or not — the overdue card reads the unfinished half. */
  open?: Task[];
  /** Today, as an ISO date, so "overdue" is measured against a fixed point. */
  todayIso?: string;
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
  subjects,
  open,
  todayIso,
}: ChangedInput): Change[] {
  const gains: Change[] = [];
  const problems: Change[] = [];

  const rising = difficultyRising(days, window);
  if (rising) gains.push(rising);
  gains.push(...wins.map(fromWin));

  const failing = hardTasksFailing(finished);
  if (failing) problems.push(failing);
  problems.push(...diagnoses.map(fromDiagnosis));

  /* The five measures the section was missing. Each returns its card to the
     lane its own direction puts it in — quality falling is a problem and
     quality rising is a gain, and neither is a third kind of card. */
  const more: (Change | null)[] = [
    qualityMoved(days, window),
    efficiencyMoved(days, window),
    overdueBacklog(open ?? [], todayIso ?? ''),
  ];
  if (subjects?.length) more.push(...subjectMoved(subjects));
  more.forEach((row) => {
    if (!row) return;
    (row.kind === 'gain' ? gains : problems).push(row);
  });

  const found = patterns.map(fromPattern);

  const byWeight = (a: Change, b: Change) => b.weight - a.weight;
  const lanes = [gains.sort(byWeight), problems.sort(byWeight), found.sort(byWeight)];

  const out: Change[] = [];
  /* One per family, strongest first. Two rows from one measure are two ways of
     saying the thing the reader has already read — see `Change.family`. The
     weaker one is dropped here rather than filtered by the caller, because a
     caller taking "the first three" would otherwise take a duplicate as one of
     its three and have no way to know it had. */
  const drawn = new Set<string>();
  const total = gains.length + problems.length + found.length;
  for (let round = 0; round < total; round += 1) {
    let added = false;
    lanes.forEach((lane) => {
      const row = lane[round];
      if (!row) return;
      added = true;
      if (drawn.has(row.family)) return;
      drawn.add(row.family);
      out.push(row);
    });
    if (!added) break;
  }
  return out;
}

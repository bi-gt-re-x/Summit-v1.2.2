/**
 * Skill growth — the Growth tab's subject, rather than one of its panels.
 *
 * The tab opened on five graded measures: productivity, quality, consistency,
 * efficiency, focus. Every one of them reads *output* — how much got done, how
 * often, how fast, how well it was rated. None of them answers the question
 * the tab's own name asks, which is not "how much did I do" but **what can I
 * do now that I could not do before**. An account can hold all five steady for
 * a term and have climbed two bands in Mathematics, and the page would have
 * reported a flat month.
 *
 * So this module reads the one figure that is about the reader rather than
 * their record — the skill score — at several points across a period, and
 * hands back the movement.
 *
 * ## Why the score is recomputed rather than logged
 *
 * There is no history table for it. `skillScores` is a pure function of the
 * reader's finished, rated tasks, and every one of those carries the day it
 * was finished on — so the score *as it stood* on any past date is the same
 * function over the tasks that existed by then, with that date as its today.
 * That is not a reconstruction or an estimate: it is the identical arithmetic
 * the subject pages print, run against a shorter list.
 *
 * It also means the trajectory cannot drift from the figure beside it, which a
 * logged history eventually would — the first time the scoring changed, every
 * stored point would be a number the current code would not produce.
 *
 * ## What this deliberately does not claim
 *
 * **Sub-skills.** A page about Mathematics wants to say "Algebra 64 → 78,
 * Geometry 51 → 55", and Summit has no evidence for either: a task carries a
 * subject and nothing finer. The skill trees do name branches, but their node
 * states are authored rather than measured — `utils/skillProgress` holds what
 * the reader has practised and it lives in their own browser, unscored. So the
 * grain here is the subject, which is the finest grain the record supports,
 * and the trees stay where they are: a route map beside the evidence rather
 * than a second set of figures pretending to be it. See the note at the top of
 * pages/SubjectAnalytics, which settled this for the subject page first.
 *
 * **A subject with no rated work.** It has no score, so it has no movement,
 * and a zero would read as "you are bad at this" where the record says "you
 * never said how it went".
 */
import { skillScores, type SkillBand, type SkillRow } from './skillScore';
import type { GrowthDay, Task } from '@/types';

/** How many readings a sparkline is drawn from, the period's end included. */
export const TRACK_POINTS = 8;

/**
 * Below this confidence, the score has barely moved off its prior and a
 * movement in it is a movement in the prior. The same floor the change cards
 * use — see `skillMoved` in utils/changed.
 */
const MIN_CONFIDENCE = 0.3;

export interface SkillTrack {
  subject: string;
  /** The name a reader recognises. */
  name: string;
  /** The score at the end of the period, 0-100. */
  now: number;
  /**
   * The score at the start of it, or null where there was none.
   *
   * Null is not zero and is drawn differently: a subject the reader had not
   * rated anything in at the start of the period has not *fallen from* zero,
   * it has appeared.
   */
  then: number | null;
  /** `now - then`, or null where there is no start to measure from. */
  delta: number | null;
  band: SkillBand;
  bandThen: SkillBand | null;
  /** True where the band itself changed, which is the movement worth leading. */
  promoted: boolean;
  confidence: number;
  /** Rated tasks behind the closing score. */
  rated: number;
  /** The score at each sample, oldest first, for the sparkline. */
  spark: number[];
}

/** Midnight UTC-ish, as a day key, for comparing against `completed_at`. */
const dayKey = (at: Date) => at.toISOString().slice(0, 10);

/**
 * One subject's line, with the gaps filled from the side that knew.
 *
 * A subject has no score until the reader has rated enough of it, so the early
 * samples of a period can be empty — and what fills them decides whether the
 * line is history or hindsight. Carrying the *closing* score backwards is
 * hindsight: it draws a flat line at today's number across weeks when today's
 * number did not exist, and it makes the start of the line move whenever work
 * is added at the end of it.
 *
 * So a gap before the first reading holds that first reading, and a gap after
 * one holds the last known. The line then says "this is where it stood once it
 * stood anywhere", which is true, and the earliest point stops depending on
 * what happened last week.
 */
function sparkFor(readings: Map<string, SkillRow>[], subject: string): number[] {
  const known = readings.map((reading) => reading.get(subject)?.score ?? null);
  const firstKnown = known.find((score) => score !== null) ?? 0;

  let carried = firstKnown;
  return known.map((score) => {
    if (score !== null) carried = score;
    return Math.round(carried);
  });
}

export interface TrajectoryInput {
  tasks: Task[];
  nameOf: (id: string) => string;
  /** How long the period is. `null` means the whole record. */
  days: number | null;
  /** The last day of the period, as an ISO date. */
  toIso: string;
  /** How many readings to take. Fewer on a short period — see `samples`. */
  points?: number;
}

/**
 * The sample dates, oldest first, with the period's last day always last.
 *
 * A seven-day period gets fewer than eight readings on purpose: eight points
 * across seven days is the same score plotted twice in places, which draws a
 * staircase a reader would take for a plateau.
 */
function samples(fromMs: number, toMs: number, points: number): Date[] {
  const span = toMs - fromMs;
  const day = 24 * 60 * 60 * 1000;
  const wanted = Math.max(2, Math.min(points, Math.floor(span / day) + 1));
  const step = span / (wanted - 1);
  return Array.from({ length: wanted }, (_, i) => new Date(fromMs + step * i));
}

/**
 * Every subject's score across the period, ranked by how far it moved.
 *
 * Ranked by movement rather than by standing, and that is the tab's whole
 * argument: the analytics page already ranks subjects by where they stand, and
 * a Growth tab that repeated that ranking would be the same list twice. The
 * subject that moved furthest is the one this page is about, whether it moved
 * up or down.
 */
export function skillTrajectory({
  tasks,
  nameOf,
  days,
  toIso,
  points = TRACK_POINTS,
}: TrajectoryInput): SkillTrack[] {
  if (!toIso) return [];
  const toMs = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(toMs)) return [];

  const done = tasks.filter((task) => task.status === 'done' && task.completed_at);
  if (!done.length) return [];

  const earliest = done.reduce(
    (first, task) => (task.completed_at!.slice(0, 10) < first ? task.completed_at!.slice(0, 10) : first),
    done[0]!.completed_at!.slice(0, 10),
  );
  const startMs = days === null
    ? Date.parse(`${earliest}T00:00:00Z`)
    : toMs - days * 24 * 60 * 60 * 1000;
  if (Number.isNaN(startMs) || startMs >= toMs) return [];

  /* One pass per sample, each over the tasks that existed by then. The list is
     sorted once so each pass is a prefix rather than a filter over the whole
     thing — the cost is `points` × the tasks in the period, not `points` × the
     account. */
  const sorted = [...done].sort((a, b) => a.completed_at!.localeCompare(b.completed_at!));
  const readings = samples(startMs, toMs, points).map((at) => {
    const key = dayKey(at);
    let cut = sorted.length;
    for (let i = 0; i < sorted.length; i += 1) {
      if (sorted[i]!.completed_at!.slice(0, 10) > key) {
        cut = i;
        break;
      }
    }
    return new Map(skillScores(sorted.slice(0, cut), at).map((row) => [row.subject, row]));
  });

  const last = readings[readings.length - 1];
  const first = readings[0];
  if (!last || !first) return [];

  const out: SkillTrack[] = [];
  for (const [subject, row] of last) {
    if (row.confidence < MIN_CONFIDENCE) continue;
    const started = first.get(subject) ?? null;
    const then = started && started.confidence >= MIN_CONFIDENCE ? started.score : null;
    out.push({
      subject,
      name: nameOf(subject),
      now: Math.round(row.score),
      then: then === null ? null : Math.round(then),
      delta: then === null ? null : Math.round(row.score) - Math.round(then),
      band: row.band,
      bandThen: started ? started.band : null,
      promoted: Boolean(started) && started!.band !== row.band,
      confidence: row.confidence,
      rated: row.rated,
      spark: sparkFor(readings, subject),
    });
  }

  return out.sort((a, b) => {
    const moved = Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0);
    return moved !== 0 ? moved : b.now - a.now;
  });
}

// --------------------------------------------------------------------------
// Time → progress
// --------------------------------------------------------------------------
/**
 * What the hours bought.
 *
 * "12 hours studied" is a number about the reader's diary. "12 hours, and your
 * level rose 9 points across three subjects" is a number about the reader.
 * Time on its own is the input half of a ratio nobody was printing the other
 * half of, and an account can log its heaviest month and learn nothing — which
 * is precisely the month this panel exists to catch.
 *
 * Everything here is counted from the same two sources the rest of the tab
 * uses, over the same period, so it cannot disagree with the figures beside
 * it.
 */
export interface TimeProgress {
  /** Focus hours logged in the period. */
  hours: number;
  /** And in the period of the same length before it, for the trend. */
  hoursBefore: number;
  /** Finished tasks in the period. */
  finished: number;
  /** Of those, the ones the reader rated — the only ones that move a score. */
  rated: number;
  /** Of those, the ones they rated 4 or 5 for difficulty. */
  hard: number;
  /** XP earned in the period. */
  xp: number;
  /**
   * Skill-score points gained across every subject that rose.
   *
   * Only the rises. A fall is a real finding and the panel above says so per
   * subject; summed into one figure it would cancel a climb in one subject
   * against a slip in another and report a month of hard work as nothing.
   */
  pointsGained: number;
  /** Subjects that rose at all. */
  subjectsUp: number;
  /** XP per focus hour, this period and the one before it. */
  perHour: number | null;
  perHourBefore: number | null;
  /** Skill points gained per ten focus hours, where there were hours to read. */
  pointsPerTenHours: number | null;
}

const num = (value: unknown) => Number(value) || 0;

export interface TimeProgressInput {
  /** The day series, oldest first. */
  days: GrowthDay[];
  /** Tasks finished within the period. */
  finished: Task[];
  /** The trajectory this period, for the improvement half. */
  tracks: SkillTrack[];
  /** How long the period is, in days. `null` means the whole record. */
  windowDays: number | null;
}

export function timeToProgress({
  days,
  finished,
  tracks,
  windowDays,
}: TimeProgressInput): TimeProgress {
  const span = windowDays ?? days.length;
  const now = days.slice(-span);
  const before = days.slice(-span * 2, -span);

  const hoursOf = (rows: GrowthDay[]) =>
    rows.reduce((sum, day) => sum + num(day.focus_minutes), 0) / 60;
  const xpOf = (rows: GrowthDay[]) => rows.reduce((sum, day) => sum + num(day.xp_earned), 0);

  const hours = hoursOf(now);
  const hoursBefore = hoursOf(before);
  const xp = xpOf(now);
  const xpBefore = xpOf(before);

  const rated = finished.filter((task) => num(task.difficulty) > 0 && num(task.execution) > 0);
  const risen = tracks.filter((track) => (track.delta ?? 0) > 0);
  const pointsGained = risen.reduce((sum, track) => sum + (track.delta ?? 0), 0);

  /* An hour either side before a ratio is printed. Below that the figure is
     one afternoon divided by another, and it swings far enough to read as a
     collapse or a breakthrough that never happened. */
  const rate = (amount: number, over: number) => (over >= 1 ? amount / over : null);

  return {
    hours,
    hoursBefore,
    finished: finished.length,
    rated: rated.length,
    hard: rated.filter((task) => num(task.difficulty) >= 4).length,
    xp,
    pointsGained,
    subjectsUp: risen.length,
    perHour: rate(xp, hours),
    perHourBefore: rate(xpBefore, hoursBefore),
    pointsPerTenHours: hours >= 1 ? (pointsGained / hours) * 10 : null,
  };
}

/** Re-exported so a caller drawing a track does not import two modules. */
export type { SkillBand, SkillRow };

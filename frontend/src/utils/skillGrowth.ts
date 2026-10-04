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
import { SKILL_BANDS, bandFor, skillScores, type SkillBand, type SkillRow } from './skillScore';
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
  /**
   * The same samples before the gaps were filled: null where the subject had
   * no score yet. The average line reads these, so a subject that appeared
   * halfway through the period does not pull the start of it.
   */
  known: Array<number | null>;
  /** The date of each sample, ISO, parallel to `spark`. */
  dates: string[];
  /** Rated tasks finished inside the period — what "worked on" means here. */
  ratedInPeriod: number;
  /** Days since anything was last finished in this subject, as of the period's end. */
  daysSince: number | null;
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
  /* Plain comparison rather than `localeCompare`: these are ISO stamps, which
     sort correctly as code points, and locale collation on twenty thousand of
     them was a large share of this function's time for an identical order. */
  const sorted = [...done].sort((a, b) =>
    a.completed_at! < b.completed_at! ? -1 : a.completed_at! > b.completed_at! ? 1 : 0,
  );
  const sortedDays = sorted.map((task) => task.completed_at!.slice(0, 10));
  const sampled = samples(startMs, toMs, points);
  const dates = sampled.map(dayKey);
  const fromKey = dates[0]!;
  const readings = sampled.map((at) => {
    const key = dayKey(at);
    // The first task finished after `key`, by binary search over the days.
    let lo = 0;
    let hi = sortedDays.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedDays[mid]! > key) hi = mid;
      else lo = mid + 1;
    }
    const cut = lo;
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
      known: readings.map((reading) => {
        const score = reading.get(subject)?.score;
        return score === undefined ? null : Math.round(score);
      }),
      dates,
      ratedInPeriod: sorted.filter((task) => {
        const on = task.completed_at!.slice(0, 10);
        return task.subject === subject && on >= fromKey && on <= toIso
          && Number(task.difficulty) > 0 && Number(task.execution) > 0;
      }).length,
      daysSince: row.daysSince,
    });
  }

  return out.sort((a, b) => {
    const moved = Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0);
    return moved !== 0 ? moved : b.now - a.now;
  });
}

// --------------------------------------------------------------------------
// The headline figures
// --------------------------------------------------------------------------
/**
 * Six figures over the trajectory, each carrying the evidence it came from.
 *
 * A bare "+18%" or "Needs attention: Geometry" is a number the reader has to
 * take on trust, and that was the complaint about this tab. So every figure
 * here comes back with what it was counted from — the subjects behind a count,
 * the start and end behind a percentage, the reason behind a warning — and the
 * panel prints both.
 *
 * "Skill" means subject throughout, because a subject is the finest thing a
 * task records. See the note at the top of this file.
 */
export interface SkillSummary {
  /** Every subject with a level. */
  total: number;
  /**
   * Average level across the subjects that had one at the start, then and now.
   *
   * Only those subjects, so the comparison is like for like: a subject that
   * appeared halfway through would otherwise drag the "then" average with a
   * number it never had.
   */
  overall: { avgThen: number; avgNow: number; pct: number; points: number; subjects: number } | null;
  /** Rose at all over the period. */
  improved: SkillTrack[];
  /** At Mastery (90+) now. */
  mastered: SkillTrack[];
  /** The nearest to Mastery, when nothing is there yet, and how far it has to go. */
  closest: { track: SkillTrack; toGo: number } | null;
  /** Below Mastery and with rated work inside the period. */
  developing: SkillTrack[];
  /** The largest rise, where anything rose. */
  biggest: SkillTrack | null;
  /** The subject most worth looking at, and why — see `attentionFor`. */
  attention: { track: SkillTrack; reason: 'fell' | 'idle' | 'lowest' } | null;
}

/** How long without finishing anything before a subject counts as left alone. */
export const IDLE_DAYS = 21;

/**
 * Which subject needs attention, and the reason, in the order that matters.
 *
 * A fall first, because a level that went down is the only thing on this panel
 * that has already cost something. Then a subject left alone for three weeks,
 * which has not fallen yet and will — retention and recent form both decay.
 * Then simply the lowest level, which is the weakest claim and is only made
 * when there is more than one subject to be lowest among.
 */
function attentionFor(tracks: SkillTrack[]): SkillSummary['attention'] {
  const fell = tracks
    .filter((track) => (track.delta ?? 0) < 0)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))[0];
  if (fell) return { track: fell, reason: 'fell' };

  const idle = tracks
    .filter((track) => (track.daysSince ?? 0) >= IDLE_DAYS)
    .sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0))[0];
  if (idle) return { track: idle, reason: 'idle' };

  if (tracks.length < 2) return null;
  const lowest = [...tracks].sort((a, b) => a.now - b.now)[0]!;
  return { track: lowest, reason: 'lowest' };
}

export function skillSummary(tracks: SkillTrack[]): SkillSummary {
  const compared = tracks.filter((track) => track.then !== null);
  const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

  let overall: SkillSummary['overall'] = null;
  if (compared.length) {
    const avgThen = mean(compared.map((track) => track.then!));
    const avgNow = mean(compared.map((track) => track.now));
    overall = {
      avgThen: Math.round(avgThen),
      avgNow: Math.round(avgNow),
      /* Against a floor of one, so a start at zero is a large rise rather than
         a division by nothing. The scores are shrunk toward 30, so a real
         start at zero does not happen; the guard is for the arithmetic. */
      pct: Math.round(((avgNow - avgThen) / Math.max(1, avgThen)) * 100),
      points: Math.round(avgNow - avgThen),
      subjects: compared.length,
    };
  }

  const improved = tracks
    .filter((track) => (track.delta ?? 0) > 0)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
  const mastered = tracks.filter((track) => track.band === 'Mastery');
  const below = tracks.filter((track) => track.band !== 'Mastery');
  const nearest = [...below].sort((a, b) => b.now - a.now)[0];

  return {
    total: tracks.length,
    overall,
    improved,
    mastered,
    closest: mastered.length === 0 && nearest ? { track: nearest, toGo: 90 - nearest.now } : null,
    developing: below
      .filter((track) => track.ratedInPeriod > 0)
      .sort((a, b) => b.ratedInPeriod - a.ratedInPeriod),
    biggest: improved[0] ?? null,
    attention: attentionFor(tracks),
  };
}

/**
 * The average level at each sample, for the line under the figures.
 *
 * Read from `known` rather than `spark`, so each point averages only the
 * subjects that had a level on that date. A sample nobody had a level at yet
 * takes the first real average, the same rule `sparkFor` uses for one subject.
 */
export function averageLine(tracks: SkillTrack[]): number[] {
  const length = tracks[0]?.known.length ?? 0;
  const raw = Array.from({ length }, (_, i) => {
    const there = tracks.map((track) => track.known[i]).filter((v): v is number => v != null);
    return there.length ? there.reduce((sum, v) => sum + v, 0) / there.length : null;
  });
  const first = raw.find((v) => v !== null) ?? 0;
  let carried = first;
  return raw.map((value) => {
    if (value !== null) carried = value;
    return Math.round(carried);
  });
}

/**
 * Every point at which a subject's line crossed up into a new band.
 *
 * These are the moments the panel exists to show — "Algebra reached Strong" —
 * so they are drawn on the line where they happened rather than listed apart.
 */
export function bandCrossings(tracks: SkillTrack[]): Array<{ at: number; label: string }> {
  const rank = (score: number) => SKILL_BANDS.findIndex((row) => row.band === bandFor(score));
  const out: Array<{ at: number; label: string }> = [];
  for (const track of tracks) {
    for (let i = 1; i < track.spark.length; i += 1) {
      if (rank(track.spark[i]!) > rank(track.spark[i - 1]!)) {
        out.push({ at: i, label: `${track.name} reached ${bandFor(track.spark[i]!)}` });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
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

/**
 * A skill score per subject, computed from the record rather than declared.
 *
 * ## What this scores, and why it is not a node
 *
 * The ask was a score per lattice *node* — "Similarity — 72". The record
 * cannot carry that and this file will not pretend otherwise. A task stores a
 * `subject` (`geometry`, `algebra`, one of a hundred); a subject routes to a
 * tree; the nodes inside that tree carry an authored `state` and `percent`
 * that are identical on every account. skills/standing.ts says it plainly:
 * "Neither is evidence about anybody." Spreading a subject's evidence across
 * its nodes would produce exactly the decorative number this is meant to
 * replace, with a decimal point on it.
 *
 * So the grain is the subject, which is the finest thing the reader has
 * actually told the app. Every figure below is a re-reading of task rows, and
 * a subject with nothing rated gets no score at all rather than a default one.
 *
 * ## The six parts
 *
 * Weighted as specified, each normalised to 0-100 before weighting:
 *
 *   35%  accuracy            mean `execution` — how well the work went
 *   20%  difficulty handled  mean `difficulty` — what was attempted
 *   15%  consistency         share of the window's weeks with work in it
 *   15%  recent performance  the last 30 days' accuracy against the rest
 *   10%  execution quality   deadlines met, where deadlines were tracked
 *    5%  retention           how recently it was last touched
 *
 * Each part is reported alongside the total, because the total's job is to
 * rank and the parts' job is to explain. A reader told "72" and nothing else
 * has been given a grade; told which of the six is holding it down, they have
 * been given something to do.
 *
 * ## Why one good session cannot inflate a subject
 *
 * Two guards, and they do different jobs.
 *
 * **Shrinkage.** The raw score is pulled toward `PRIOR` by how little evidence
 * stands behind it. Four perfect problems in a new subject score in the
 * fifties, not the nineties — which is correct, because four problems is not
 * evidence of mastery and the number is read as though it were. At
 * `FULL_CONFIDENCE` rated tasks the pull is gone entirely and the raw score
 * stands: see the note there for why it has to actually reach zero.
 *
 * **Recency weighting inside accuracy.** The mean is not flat: a task's weight
 * halves every `HALF_LIFE_DAYS`, so a strong week three months ago informs the
 * score without holding it up. That is the "rolling average" half of the
 * guard, and it is what makes the score fall when somebody stops.
 *
 * `confidence` is returned rather than folded away, so a panel can say what
 * the number is standing on instead of implying it is all equally solid.
 */
import type { Task } from '@/types';

const DAY = 86_400_000;

/** How hard the prior pulls while the evidence is thin. */
export const CONFIDENCE_WEIGHT = 8;

/**
 * Rated tasks at which the record speaks entirely for itself.
 *
 * The plain `n / (n + k)` curve never reaches 1, which sounds harmless and is
 * not: at sixty rated tasks it still held a score eight points under what the
 * record said, permanently. Shrinkage is a guard against thin evidence, not a
 * tax on thick evidence — so the curve is scaled to arrive at exactly 1 here
 * and is clamped there. Thirty rated tasks in one subject is a real record.
 */
const FULL_CONFIDENCE = 30;

/** Where a subject with almost no evidence is pulled toward. */
const PRIOR = 30;

/** The shrinkage, in a clause a recommendation can drop into a sentence. */
export const SUBJECT_RULE_FLOOR_NOTE =
  'a score is held toward the middle until there are enough rated tasks behind it';

/** A task's weight halves this often, so the score follows current work. */
const HALF_LIFE_DAYS = 45;

/** The window "recent performance" asks about. */
const RECENT_DAYS = 30;

/** Retention is spent by this long without touching a subject. */
const COLD_DAYS = 60;

export type SkillBand =
  | 'Beginner'
  | 'Developing'
  | 'Competent'
  | 'Strong'
  | 'Advanced'
  | 'Mastery';

/** The bands, low to high. `from` is inclusive, `to` exclusive except at 100. */
export const SKILL_BANDS: { band: SkillBand; from: number; to: number }[] = [
  { band: 'Beginner', from: 0, to: 20 },
  { band: 'Developing', from: 20, to: 40 },
  { band: 'Competent', from: 40, to: 60 },
  { band: 'Strong', from: 60, to: 75 },
  { band: 'Advanced', from: 75, to: 90 },
  { band: 'Mastery', from: 90, to: 100 },
];

export function bandFor(score: number): SkillBand {
  const found = SKILL_BANDS.find((row) => score >= row.from && score < row.to);
  return found?.band ?? (score >= 90 ? 'Mastery' : 'Beginner');
}

/** The six parts, each 0-100, in the order they are weighted. */
export interface SkillParts {
  accuracy: number;
  difficulty: number;
  consistency: number;
  recent: number;
  execution: number;
  retention: number;
}

export const PART_WEIGHTS: { key: keyof SkillParts; weight: number; label: string }[] = [
  { key: 'accuracy', weight: 0.35, label: 'Accuracy' },
  { key: 'difficulty', weight: 0.2, label: 'Difficulty handled' },
  { key: 'consistency', weight: 0.15, label: 'Consistency' },
  { key: 'recent', weight: 0.15, label: 'Recent form' },
  { key: 'execution', weight: 0.1, label: 'Delivery' },
  { key: 'retention', weight: 0.05, label: 'Retention' },
];

/** One subject, scored, with everything needed to explain the number. */
export interface SkillRow {
  subject: string;
  /** 0-100, after shrinkage. */
  score: number;
  /** What the parts came to before shrinkage — see the note on confidence. */
  raw: number;
  band: SkillBand;
  parts: SkillParts;
  /** 0-1: how far the evidence has moved the score off the prior. */
  confidence: number;

  // ---- The evidence, in the units a reader recognises --------------------
  /** Finished tasks in this subject, rated or not. */
  finished: number;
  /** Of those, the ones carrying both ratings. Everything above rests on these. */
  rated: number;
  /** Mean execution, 1-5. */
  avgExecution: number;
  /** Mean difficulty, 1-5. */
  avgDifficulty: number;
  /** Accuracy on the hardest third of what was attempted, 0-100, or null. */
  hardAccuracy: number | null;
  /** Days since the last finished task here, or null when there are none. */
  daysSince: number | null;
  /** Weeks in the window with work in this subject. */
  activeWeeks: number;
  /** Weeks the window covers. */
  weeks: number;
  /** Change in accuracy over the recent window against before it, in points. */
  trend: number | null;
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

/** 1-5 onto 0-100. A 1 is not zero: attempting and scraping it is not nothing. */
const fromFive = (value: number) => clamp(((value - 1) / 4) * 100);

function isRated(task: Task): boolean {
  const d = Number(task.difficulty);
  const e = Number(task.execution);
  return d >= 1 && d <= 5 && e >= 1 && e <= 5;
}

function dayOf(task: Task): number {
  const at = Date.parse(`${String(task.completed_at ?? '').slice(0, 10)}T00:00:00`);
  return Number.isNaN(at) ? 0 : at;
}

/**
 * Score every subject the account has finished rated work in.
 *
 * Unrated finished work counts toward `finished` and toward consistency and
 * retention — turning up is turning up — but not toward accuracy or
 * difficulty, which have nothing to read. A subject with no rated work at all
 * is left out entirely: there is no honest number for it, and printing a low
 * one would say "you are bad at this" where the record says "you never said
 * how it went".
 */
export function skillScores(tasks: Task[], today: Date = new Date()): SkillRow[] {
  const now = new Date(today.toDateString()).getTime();
  const bySubject = new Map<string, Task[]>();

  for (const task of tasks) {
    if (task.status !== 'done') continue;
    const subject = String(task.subject ?? '').trim();
    if (!subject) continue;
    const at = dayOf(task);
    if (!at) continue;
    const held = bySubject.get(subject);
    if (held) held.push(task);
    else bySubject.set(subject, [task]);
  }

  const rows: SkillRow[] = [];

  for (const [subject, done] of bySubject) {
    const rated = done.filter(isRated);
    if (rated.length === 0) continue;

    const days = done.map(dayOf);
    const first = Math.min(...days);
    const last = Math.max(...days);
    const weeks = Math.max(1, Math.ceil((now - first) / (7 * DAY)) || 1);
    const activeWeeks = new Set(days.map((at) => Math.floor((now - at) / (7 * DAY)))).size;
    const daysSince = Math.max(0, Math.round((now - last) / DAY));

    // --- Accuracy: recency-weighted mean execution ------------------------
    let weightSum = 0;
    let executionSum = 0;
    let difficultySum = 0;
    let flatExecution = 0;
    for (const task of rated) {
      const age = Math.max(0, (now - dayOf(task)) / DAY);
      const weight = Math.pow(0.5, age / HALF_LIFE_DAYS);
      weightSum += weight;
      executionSum += Number(task.execution) * weight;
      difficultySum += Number(task.difficulty) * weight;
      flatExecution += Number(task.execution);
    }
    const avgExecution = weightSum > 0 ? executionSum / weightSum : 0;
    const avgDifficulty = weightSum > 0 ? difficultySum / weightSum : 0;

    // --- Difficulty handled, credited for succeeding at it ----------------
    // Attempting hard work is worth something and failing it is worth less:
    // the raw mean difficulty would rank somebody who attempts fives and
    // scores ones above somebody who attempts threes and scores fives.
    const difficultyPart = clamp(fromFive(avgDifficulty) * (0.55 + 0.45 * (avgExecution / 5)));

    // --- The hardest third, which is where a ceiling shows ----------------
    const ordered = [...rated].sort(
      (a, b) => Number(b.difficulty) - Number(a.difficulty),
    );
    const hardCount = Math.max(1, Math.floor(ordered.length / 3));
    const hard = ordered.slice(0, hardCount);
    const hardAccuracy =
      rated.length >= 3
        ? clamp(fromFive(hard.reduce((sum, t) => sum + Number(t.execution), 0) / hard.length))
        : null;

    // --- Recent form against the rest -------------------------------------
    const recent = rated.filter((task) => now - dayOf(task) <= RECENT_DAYS * DAY);
    const earlier = rated.filter((task) => now - dayOf(task) > RECENT_DAYS * DAY);
    const meanExecution = (rows_: Task[]) =>
      rows_.length ? rows_.reduce((sum, t) => sum + Number(t.execution), 0) / rows_.length : 0;
    const recentMean = meanExecution(recent);
    const earlierMean = meanExecution(earlier);
    /* No recent work is not the same as recent bad work, and must not score
       as it. The part falls back to the subject's own standing, and the fact
       that nothing is recent is what `retention` is for. */
    const recentPart = recent.length === 0 ? fromFive(avgExecution) : fromFive(recentMean);
    const trend =
      recent.length > 0 && earlier.length > 0
        ? Math.round(fromFive(recentMean) - fromFive(earlierMean))
        : null;

    // --- Delivery: deadlines met, where any were tracked ------------------
    const tracked = done.filter((task) => task.met_deadline !== undefined && task.met_deadline !== null);
    const onTime = tracked.filter((task) => Boolean(task.met_deadline)).length;
    /* Untracked is not late. A subject nobody set deadlines in scores at the
       accuracy it earned rather than at zero, which is what "no evidence"
       should cost. */
    const executionPart = tracked.length === 0 ? fromFive(avgExecution) : (onTime / tracked.length) * 100;

    // --- Retention: spent by going cold -----------------------------------
    const retentionPart = clamp(100 * (1 - Math.min(1, daysSince / COLD_DAYS)));

    const parts: SkillParts = {
      accuracy: clamp(fromFive(avgExecution)),
      difficulty: difficultyPart,
      consistency: clamp((activeWeeks / weeks) * 100),
      recent: clamp(recentPart),
      execution: clamp(executionPart),
      retention: retentionPart,
    };

    const raw = PART_WEIGHTS.reduce((sum, part) => sum + parts[part.key] * part.weight, 0);
    /* Scaled so it is 1 at FULL_CONFIDENCE and still low when the evidence
       is a handful of tasks: four rated tasks sit near 0.4, which is what
       stops a perfect run of four reading as mastery. */
    const confidence = Math.min(
      1,
      (rated.length / (rated.length + CONFIDENCE_WEIGHT))
        * ((FULL_CONFIDENCE + CONFIDENCE_WEIGHT) / FULL_CONFIDENCE),
    );
    const score = raw * confidence + PRIOR * (1 - confidence);

    rows.push({
      subject,
      score: Math.round(score),
      raw: Math.round(raw),
      band: bandFor(Math.round(score)),
      parts,
      confidence,
      finished: done.length,
      rated: rated.length,
      avgExecution: Math.round((flatExecution / rated.length) * 10) / 10,
      avgDifficulty: Math.round(avgDifficulty * 10) / 10,
      hardAccuracy: hardAccuracy === null ? null : Math.round(hardAccuracy),
      daysSince,
      activeWeeks,
      weeks,
      trend,
    });
  }

  return rows.sort((a, b) => b.score - a.score || b.rated - a.rated);
}

// --------------------------------------------------------------------------
// Why is it this number
// --------------------------------------------------------------------------
/** The strongest and weakest of the six, by how far each sits from the mean. */
function extremes(parts: SkillParts) {
  const scored = PART_WEIGHTS.map((part) => ({ ...part, value: parts[part.key] }));
  const sorted = [...scored].sort((a, b) => b.value - a.value);
  return { best: sorted[0]!, worst: sorted[sorted.length - 1]! };
}

export interface SkillExplanation {
  /** Two sentences: what is carrying the score, and what is holding it down. */
  lifting: string;
  limiting: string;
  /** The figures behind both, as short labelled rows. */
  evidence: { label: string; value: string }[];
  /** Present only while shrinkage is still moving the number. */
  caveat: string | null;
}

/**
 * The answer to "why is this subject this number?".
 *
 * Assembled from the parts rather than written, for the reason every other
 * sentence on the analytics page is assembled: a sentence a reader can check
 * against the figures beside it has to be derived from those figures, or the
 * first time they disagree the page loses the reader entirely.
 *
 * `nameOf` turns a subject id into its display name. Passed in rather than
 * imported so this file stays testable without the catalogue.
 */
export function explainSkill(row: SkillRow, nameOf: (id: string) => string): SkillExplanation {
  const { best, worst } = extremes(row.parts);
  const name = nameOf(row.subject);

  const lifting =
    `${best.label} is what is carrying ${name}: ` +
    (best.key === 'accuracy' || best.key === 'recent'
      ? `${row.avgExecution} out of 5 on execution across ${row.rated} rated ${row.rated === 1 ? 'task' : 'tasks'}.`
      : best.key === 'difficulty'
        ? `you are attempting work at ${row.avgDifficulty} out of 5 and landing it.`
        : best.key === 'consistency'
          ? `you have worked it in ${row.activeWeeks} of the last ${row.weeks} weeks.`
          : best.key === 'execution'
            ? 'you finish what you start here by the date you set.'
            : 'you have been in it recently.');

  const limiting =
    worst.value >= 70
      ? `Nothing is holding it back much — the weakest of the six is ${worst.label.toLowerCase()} at ${Math.round(worst.value)}.`
      : `${worst.label} is the limit: ` +
        (worst.key === 'difficulty'
          ? row.hardAccuracy !== null
            ? `you are steady on the easier work and drop to ${row.hardAccuracy}% on the hardest third of it.`
            : 'what you have attempted here has stayed on the easier end of the scale.'
          : worst.key === 'consistency'
            ? `${row.activeWeeks} active ${row.activeWeeks === 1 ? 'week' : 'weeks'} out of ${row.weeks} is not a habit yet.`
            : worst.key === 'retention'
              ? `it has been ${row.daysSince} days since you last touched it.`
              : worst.key === 'recent'
                ? 'your last month here has gone worse than your record before it.'
                : worst.key === 'execution'
                  ? 'work here tends to land after the date you set for it.'
                  : `execution is averaging ${row.avgExecution} out of 5.`);

  const evidence: { label: string; value: string }[] = [
    { label: 'Rated tasks', value: String(row.rated) },
    { label: 'Accuracy', value: `${Math.round(row.parts.accuracy)}%` },
    { label: 'Avg difficulty', value: `${row.avgDifficulty} / 5` },
  ];
  if (row.hardAccuracy !== null) {
    evidence.push({ label: 'On the hardest third', value: `${row.hardAccuracy}%` });
  }
  evidence.push({
    label: 'Last worked',
    value: row.daysSince === 0 ? 'today' : `${row.daysSince} days ago`,
  });
  if (row.trend !== null) {
    evidence.push({
      label: 'Last 30 days',
      value: `${row.trend > 0 ? '+' : ''}${row.trend} pts`,
    });
  }

  const caveat =
    row.confidence < 0.75
      ? `Held at ${row.score} rather than ${row.raw} because ${row.rated} rated ${row.rated === 1 ? 'task is' : 'tasks are'} not yet enough to be sure. The two converge as you rate more.`
      : null;

  return { lifting, limiting, evidence, caveat };
}

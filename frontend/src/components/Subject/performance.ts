/**
 * What the record says about *why*, not about *how much*.
 *
 * ## The problem this exists to fix
 *
 * Everything above this file counts. The dimensions say execution is 62 and
 * consistency is 57; the curve says the work falls off at Fair; the reasons
 * say eighteen bad sessions ran out of time. All true, all on the page, and
 * all of it snapshots.
 *
 * A reader looking at that still has to do the hard part themselves: which of
 * those figures explains the others, and therefore what would actually move
 * if they changed something. A model handed the raw figures answers that
 * question badly — it restates them with adjectives, because restating is what
 * a list of numbers invites. The fix is not a better prompt over the same
 * table. It is to compute the relationships here, where they can be checked,
 * and hand the model conclusions it has to *use* rather than figures it can
 * merely describe.
 *
 * So this module turns counted figures into four readings, and every one of
 * them is arithmetic over data already on the page:
 *
 *   - **Error families** — the six struggle reasons regrouped by what they
 *     indicate, so "is the problem knowing it or doing it" has an answer with
 *     a percentage behind it.
 *   - **The goal gap** — the shortfall from a clean run, split across the
 *     measures responsible for it, summing exactly to the whole.
 *   - **Calibration** — where the difficulty a task was filed under and the
 *     way it actually went disagree.
 *   - **Divergence** — whether capability and outcome are moving together,
 *     and which is ahead.
 *
 * ## What it deliberately does not do
 *
 * It does not estimate a sub-skill. Summit records a subject and a difficulty
 * and nothing finer, so "geometry 71" is a number about a person that nobody
 * counted — the rule the whole page is built on, stated at the top of
 * pages/SubjectAnalytics. Every figure here is derived from the rating, the
 * difficulty, the time and the reason, because those are what exist.
 *
 * It also does not invent a second difficulty signal. A calibration reading in
 * the full sense wants *objective* difficulty against *perceived* difficulty,
 * and Summit asks for one number, not two. What `calibration` below reads is
 * the honest version of that: the difficulty the reader filed the work under
 * against how the work then went, which catches the same mistake from one
 * side.
 */
import type {
  DifficultyCurve,
  Dimension,
  Mistake,
  Momentum,
  TimeAnalysis,
} from './state';

// ---------------------------------------------------------------------------
// Error families
// ---------------------------------------------------------------------------
/**
 * What each struggle reason actually indicates.
 *
 * The six words are fixed (STRUGGLE_REASONS in utils/ratings) and they are not
 * six of a kind: "did not know where to start" is a gap in what the reader
 * knows, and "kept getting interrupted" is a fact about the room. Treating
 * them as one ranked list — which is what the page does above this panel —
 * answers "what happens most" and never answers "what kind of problem is
 * this", which is the question that decides whether the next session should be
 * harder or merely quieter.
 *
 * Four families, and the split that matters is the first against the rest:
 * conceptual work needs new material, everything else needs the same material
 * under different conditions.
 */
export type FamilyKey = 'conceptual' | 'execution' | 'time' | 'calibration';

const FAMILY_OF: Record<string, FamilyKey> = {
  /* Not knowing how to begin is the only one of the six that is a gap in what
     the reader knows rather than in how the sitting went. */
  unclear: 'conceptual',
  /* Work that was bigger than it looked is a misread of the task, not a
     failure at it — the reader could do it and planned for the wrong thing. */
  underestimated: 'calibration',
  'no-time': 'time',
  distracted: 'execution',
  'low-energy': 'execution',
  interrupted: 'execution',
};

const FAMILY_LABEL: Record<FamilyKey, string> = {
  conceptual: 'Not knowing it',
  execution: 'The sitting itself',
  time: 'Time pressure',
  calibration: 'Misjudging the work',
};

export interface ErrorFamilies {
  /** False when nothing carries a reason — `rating_depth` is not 'reasons'. */
  known: boolean;
  /** Badly-rated tasks that named a reason. The base every share is of. */
  answered: number;
  shares: Array<{ key: FamilyKey; label: string; count: number; share: number }>;
  /** The family with the most behind it, when one is clearly ahead. */
  leading: { key: FamilyKey; label: string; share: number } | null;
  /**
   * The share of named struggles that were *not* about knowing the material.
   *
   * The single most useful number in this module, and the one the whole
   * "should the next session be harder" question turns on. High means the
   * reader can already do the work and keeps not doing it; harder material
   * would add a second problem on top of the one they have.
   */
  notConceptual: number;
}

/**
 * What it takes to name one family as the problem.
 *
 * Two conditions, because a margin alone is not enough. Five struggles against
 * four is a fifty-six/forty-four split and a twelve-point lead, which clears
 * any sensible margin and is still nine answers — one different afternoon and
 * the leader changes. So there is a floor under the sample as well, and it is
 * the same floor the difficulty bands use: below it, naming something stops
 * being a finding and starts being noise with a percentage attached.
 *
 * `notConceptual` is not gated on either. It is a proportion rather than a
 * winner, the brief carries the count it is out of, and the model is asked to
 * be honest about confidence from that.
 */
const CLEARLY_AHEAD = 15;
const ENOUGH_ANSWERS = 6;

export function errorFamilies(mistakes: Mistake[]): ErrorFamilies {
  const answered = mistakes.reduce((sum, entry) => sum + entry.count, 0);
  if (answered === 0) {
    return { known: false, answered: 0, shares: [], leading: null, notConceptual: 0 };
  }

  const counts = new Map<FamilyKey, number>();
  for (const entry of mistakes) {
    const family = FAMILY_OF[entry.key];
    // A reason this build does not know is dropped rather than bucketed into
    // one of the four. A word from a future vocabulary counted as "execution"
    // is a wrong finding, and a wrong finding is worse than a missing one.
    if (!family) continue;
    counts.set(family, (counts.get(family) ?? 0) + entry.count);
  }

  const placed = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (placed === 0) {
    return { known: false, answered, shares: [], leading: null, notConceptual: 0 };
  }

  const shares = [...counts.entries()]
    .map(([key, count]) => ({
      key,
      label: FAMILY_LABEL[key],
      count,
      share: Math.round((count / placed) * 100),
    }))
    .sort((a, b) => b.share - a.share);

  const [top, next] = shares;
  const conceptual = counts.get('conceptual') ?? 0;

  return {
    known: true,
    answered: placed,
    shares,
    /* Named only when it is actually ahead. Two families within a few points
       of each other have no leader, and printing one is the page inventing a
       finding out of a rounding difference. */
    leading: top && placed >= ENOUGH_ANSWERS
      && (!next || top.share - next.share >= CLEARLY_AHEAD)
      ? { key: top.key, label: top.label, share: top.share }
      : null,
    notConceptual: Math.round(((placed - conceptual) / placed) * 100),
  };
}

// ---------------------------------------------------------------------------
// The goal gap
// ---------------------------------------------------------------------------
/**
 * The distance from a clean run, split across what is responsible for it.
 *
 * `overall` is the mean of the measured dimensions, so the shortfall from 100
 * is the mean of their shortfalls — which means it can be *divided* among them
 * exactly, with no weighting and nothing left over. That is the whole trick
 * here, and it is why these numbers can be trusted: the parts sum to the
 * total by construction rather than by adjustment.
 *
 * Four groups, because the seven dimensions answer four different questions:
 *
 *   - **Knowing it** — mastery. How hard the work taken on is.
 *   - **Doing it** — execution and quality. How it goes once started.
 *   - **Time** — efficiency. Whether the hours bought anything.
 *   - **Turning up** — consistency, productivity, momentum.
 *
 * ## Why difficulty is not one of the four
 *
 * It ought to be, and it cannot be honestly. There is no *dimension* for
 * difficulty — mastery measures how hard the work was, not how much of the
 * shortfall sits in the hard end — so a fifth slice would have to be carved
 * out of the others by a rule, and any rule for that is a guess wearing a
 * number. The curve already answers the difficulty question directly and
 * better: `threshold` is the level where the work falls away, and `drop` is
 * how far. Those are reported alongside rather than folded in, and the reading
 * that uses both is the model's job.
 */
export interface GoalGap {
  known: boolean;
  /** Where the subject stands, 0-100. */
  standing: number;
  /** Points short of a clean run. `standing + total` is 100. */
  total: number;
  parts: Array<{ key: string; label: string; points: number; from: string }>;
  /** The part carrying the most of it, when one is clearly ahead. */
  largest: { key: string; label: string; points: number } | null;
}

const GROUPS: Array<{ key: string; label: string; keys: string[]; from: string }> = [
  { key: 'knowledge', label: 'Knowing it', keys: ['mastery'],
    from: 'how hard the work you take on is' },
  { key: 'execution', label: 'Doing it', keys: ['execution', 'quality'],
    from: 'how it goes once you start' },
  { key: 'time', label: 'Time', keys: ['efficiency'],
    from: 'whether the time bought anything' },
  { key: 'consistency', label: 'Turning up', keys: ['consistency', 'productivity', 'momentum'],
    from: 'how often there is work here at all' },
];

/** Points between the largest part and the next before one is named. */
const AHEAD_BY = 2;

export function goalGap(dimensions: Dimension[], overall: number | null): GoalGap {
  const known = dimensions.filter((entry) => entry.known && entry.value !== null);
  if (overall === null || known.length === 0) {
    return { known: false, standing: 0, total: 0, parts: [], largest: null };
  }

  const parts = GROUPS.map((group) => {
    const mine = known.filter((entry) => group.keys.includes(entry.key));
    // Each dimension's shortfall, divided by how many dimensions there are in
    // total rather than in this group — which is what makes the parts sum to
    // the whole shortfall instead of to four times it.
    const points = mine.reduce((sum, entry) => sum + (100 - (entry.value ?? 0)), 0)
      / known.length;
    return { key: group.key, label: group.label, points: Math.round(points * 10) / 10,
             from: group.from };
  }).filter((part) => part.points > 0);

  const ranked = [...parts].sort((a, b) => b.points - a.points);
  const [top, next] = ranked;

  return {
    known: true,
    standing: Math.round(overall),
    total: Math.round((100 - overall) * 10) / 10,
    parts,
    largest: top && (!next || top.points - next.points >= AHEAD_BY)
      ? { key: top.key, label: top.label, points: top.points }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------
/**
 * Where the difficulty a task was filed under and the way it went disagree.
 *
 * Summit asks for one difficulty, set before or while doing the work, and one
 * execution rating after it. Read together across a rung they say something
 * neither says alone: a level filed as hard that consistently goes well is a
 * level the reader has outgrown, and a level filed as easy that consistently
 * goes badly is the one quietly costing them the grade.
 *
 * This is the honest half of a difficulty-calibration reading. The full
 * version wants an independent estimate of how hard the work really was, to
 * set against the reader's own — and Summit has no such estimate and should not
 * pretend to one. What it has is what the reader said and what then happened,
 * which catches the same mistake from one side.
 */
export interface Calibration {
  known: boolean;
  /** Rungs filed as hard that go well: room above where they are working. */
  outgrown: Array<{ label: string; execution: number; done: number }>;
  /** Rungs filed as easy that go badly: the quiet losses. */
  overestimated: Array<{ label: string; execution: number; done: number }>;
  /**
   * Finished quicker than their own median for the level *and* rated badly.
   * Rushing, which has a different fix from not knowing.
   */
  rushed: number;
}

/** Execution above this on a hard rung is work that has been outgrown. */
const COMFORTABLE = 75;
/** Execution below this on an easy rung is a loss that should not happen. */
const STRUGGLING = 60;
/** Levels 4 and 5 are the hard end; 1 and 2 the easy one. */
const HARD_FROM = 4;
const EASY_TO = 2;

export function calibration(curve: DifficultyCurve, time: TimeAnalysis): Calibration {
  const measured = curve.rungs.filter(
    (rung) => rung.execution !== null && rung.done > 0,
  );
  if (measured.length === 0) {
    return { known: false, outgrown: [], overestimated: [], rushed: 0 };
  }

  return {
    known: true,
    outgrown: measured
      .filter((rung) => rung.level >= HARD_FROM && (rung.execution ?? 0) >= COMFORTABLE)
      .map((rung) => ({ label: rung.label, execution: rung.execution ?? 0, done: rung.done })),
    overestimated: measured
      .filter((rung) => rung.level <= EASY_TO && (rung.execution ?? 0) <= STRUGGLING)
      .map((rung) => ({ label: rung.label, execution: rung.execution ?? 0, done: rung.done })),
    rushed: time.rushed,
  };
}

// ---------------------------------------------------------------------------
// Divergence
// ---------------------------------------------------------------------------
/**
 * Whether capability and outcome are moving together.
 *
 * The reading the request for this module was really about. Somebody working
 * on steadily harder material whose score has sat still is not stuck — their
 * ability is climbing and their *conversion* of it has stalled, and those two
 * situations want opposite instructions. Told apart, the advice is "stop
 * adding difficulty and practice under the real conditions"; conflated, it is
 * "keep going", which is the advice that wastes the next month.
 *
 * `capability` is momentum: execution over the later half of the window
 * against the earlier half. `outcome` is the same comparison on quality, which
 * is difficulty times execution and therefore the figure that moves only when
 * both do.
 */
export type DivergenceReading =
  | 'capability-ahead'
  | 'outcome-ahead'
  | 'together'
  | 'unknown';

export interface Divergence {
  known: boolean;
  capability: number | null;
  outcome: number | null;
  reading: DivergenceReading;
}

/** Points of difference before the two are described as diverging at all. */
const APART = 5;

export function divergence(momentum: Momentum, qualityChange: number | null): Divergence {
  if (!momentum.known || momentum.change === null || qualityChange === null) {
    return {
      known: false,
      capability: momentum.change,
      outcome: qualityChange,
      reading: 'unknown',
    };
  }

  const apart = momentum.change - qualityChange;
  return {
    known: true,
    capability: momentum.change,
    outcome: qualityChange,
    reading: apart >= APART ? 'capability-ahead'
      : apart <= -APART ? 'outcome-ahead'
        : 'together',
  };
}

// ---------------------------------------------------------------------------
// All four, for the brief
// ---------------------------------------------------------------------------
export interface Performance {
  families: ErrorFamilies;
  gap: GoalGap;
  calibration: Calibration;
  divergence: Divergence;
}

/**
 * Everything in this file, over one subject's state.
 *
 * `qualityChange` comes from the model rather than the state — it is the
 * quality rate's delta against the previous window, which pages/SubjectAnalytics
 * already has and this module has no business recomputing.
 */
export function performance(
  state: {
    dimensions: Dimension[];
    overall: number | null;
    curve: DifficultyCurve;
    time: TimeAnalysis;
    momentum: Momentum;
    mistakes: Mistake[];
  },
  qualityChange: number | null,
): Performance {
  return {
    families: errorFamilies(state.mistakes),
    gap: goalGap(state.dimensions, state.overall),
    calibration: calibration(state.curve, state.time),
    divergence: divergence(state.momentum, qualityChange),
  };
}

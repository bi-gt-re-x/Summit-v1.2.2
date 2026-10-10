/**
 * WHAT ARE YOU TRYING TO ACCOMPLISH — and what in the record bears on it.
 *
 * ## Why this exists above the dimensions rather than beside them
 *
 * The subject page used to open on four figures. Quality 78, execution 74,
 * consistency 82, momentum +8: all counted, all true, and none of them an
 * answer to anything the reader came with. A dashboard makes the reader do
 * the interpretation, and interpretation is the part they wanted help with.
 *
 * So the page opens on the goal, and the two things under it are the goal
 * said properly and the handful of facts that bear on *it*. The figures are
 * still there, underneath, as the evidence they always were — the number is
 * not removed, it stops being the protagonist.
 *
 * ## Two sources, and the page must work with either
 *
 * The model writes the good version: it knows what an AIME is, it can tell an
 * exam from a competition, and it can say which of thirty counted figures
 * actually bears on qualifying for one. That is `GoalRead` and `GoalEvidence`
 * from services/analytics, and it arrives only when somebody presses the
 * button.
 *
 * Everything here is the version that is always true. It is arithmetic over
 * figures already on the page, it costs nothing, and it is what the band says
 * before any reading exists — because a page whose first section is empty
 * until a paid call succeeds has no first section.
 *
 * The two merge rather than compete: `objectiveFrom` takes the counted band
 * and overlays whatever the reading supplied, field by field, so a reading
 * that came back with a blanked sentence (see `_clean` in
 * backend/tracking/subject_ai.py) falls back to the counted one rather than
 * to nothing.
 *
 * ## The one thing the arithmetic cannot do
 *
 * It cannot name the *kind* of goal. Whether "Qualify for AIME" is an exam or
 * a competition changes what counts as progress — a competition is won under
 * a clock, so execution under pressure is the measure and raw difficulty is
 * not — and nothing in this app's tables knows which it is. So the counted
 * band returns `unstated` and says so, rather than inferring a competition
 * from a subject that merely has competitions in it. That is the model's
 * call, and it is asked to justify it.
 */
import type { Bottleneck, GoalKind, GoalRead } from '@/services/analytics';
import type { Performance } from './performance';
import type { SubjectState } from './state';
import type { SubjectGoal } from './model';

/** What the reader typed into the wizard: the aim, and where they say they are. */
export interface Ambition {
  aim?: string;
  level?: string;
}

/** One fact about the goal itself, for the right of the band. */
export interface ObjectiveMark {
  label: string;
  value: string;
  tone: 'good' | 'bad' | 'flat';
}

export interface Objective {
  /** The goal as an aim, not as a label. Empty when nothing says. */
  objective: string;
  kind: GoalKind;
  /** What in the record made it that kind. Empty on the counted band. */
  whyKind: string;
  /** The one thing that has to change next. */
  focus: string;
  /** Where the reader's own words came from, when they are being shown. */
  aim: string;
  level: string;
  /** Whether the sentences are the model's reading or the app's arithmetic. */
  source: 'read' | 'counted';
  /** The goal's own position: days left, drift, how much work points at it. */
  marks: ObjectiveMark[];
}

/** The words each kind is drawn with. `unstated` draws no chip at all. */
export const KIND_WORDS: Record<GoalKind, string> = {
  exam: 'Dated exam',
  competition: 'Competition',
  mastery: 'Mastery',
  habit: 'Habit',
  project: 'Project',
  coverage: 'Coverage',
  unstated: '',
};

/**
 * What each kind means progress *is*, in the reader's terms.
 *
 * Shown under the chip. It is the page saying out loud which measure it is
 * about to weigh everything against, so a reader who disagrees with the call
 * can see that it was made rather than discovering it in the recommendations.
 */
export const KIND_MEANS: Record<GoalKind, string> = {
  exam: 'Progress is coverage and timing together.',
  competition: 'Progress is reproducing what you can do, under a clock.',
  mastery: 'Progress is the level of work you can land.',
  habit: 'Progress is how often there is work here at all.',
  project: 'Progress is the thing being finished.',
  coverage: 'Progress is getting through the material.',
  unstated: '',
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// The band
// ---------------------------------------------------------------------------
/**
 * The counted focus sentence, in priority order.
 *
 * Each branch is a template over figures this page already draws, which is the
 * same licence `headline.verdict` in ./model takes. The order is by what would
 * move most if it changed, not by which figure is worst — the rule the model
 * is given for its own ranking, applied here so the two cannot open on
 * different advice.
 *
 * Empty is a real answer. A subject with nothing measured yet gets a band with
 * the goal in it and no strapline, which is honest; a generated sentence over
 * no evidence would be the placeholder this page exists not to print.
 */
function countedFocus(state: SubjectState, perf: Performance): string {
  if (perf.divergence.known && perf.divergence.reading === 'capability-ahead') {
    return 'Turn what you can already do into work that lands.';
  }
  if (perf.families.known && perf.families.answered >= 6
      && perf.families.notConceptual >= 60) {
    return 'Fix how the sittings go, not what is in them.';
  }
  if (state.curve.threshold) {
    return `Make ${state.curve.threshold.label} land the way the levels below it do.`;
  }
  if (perf.gap.known && perf.gap.largest) {
    return `Close the ${perf.gap.largest.label.toLowerCase()} gap — it carries `
      + `${plural(perf.gap.largest.points, 'point')} of the `
      + `${plural(perf.gap.total, 'point')} you are short.`;
  }
  if (state.momentum.known && state.momentum.direction === 'slipping') {
    return 'Get execution moving the right way again before adding anything.';
  }
  return '';
}

/** Days between an ISO day and today. Negative once it has passed. */
function daysUntil(deadline: string, today: string): number | null {
  if (!deadline || !today) return null;
  const end = Date.parse(`${deadline.slice(0, 10)}T00:00:00Z`);
  const now = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(end) || Number.isNaN(now)) return null;
  return Math.round((end - now) / 86_400_000);
}

/**
 * The facts about the goal that belong beside it rather than in a panel.
 *
 * Three at most, and every one of them is about *this goal* rather than about
 * the subject: how long is left, whether the current rate arrives, and how
 * much of the work here is actually pointed at it. The last is the one a
 * reader almost never has: "you have done 46 things in this subject and four
 * of them were aimed at the thing you said you were doing" is the sentence
 * that changes two weeks.
 */
function marksFor(goal: SubjectGoal | null, today: string): ObjectiveMark[] {
  if (!goal) return [];
  const marks: ObjectiveMark[] = [];

  const left = daysUntil(goal.deadline, today);
  if (left !== null) {
    marks.push({
      label: left < 0 ? 'Overdue' : 'Left',
      value: left < 0 ? plural(Math.abs(left), 'day') : plural(left, 'day'),
      tone: left < 0 ? 'bad' : left <= 14 ? 'flat' : 'good',
    });
  }

  if (goal.drift !== null) {
    marks.push({
      label: 'At this rate',
      value: goal.drift > 0
        ? `${plural(goal.drift, 'day')} late`
        : goal.drift < 0
          ? `${plural(Math.abs(goal.drift), 'day')} early`
          : 'on the day',
      tone: goal.drift > 0 ? 'bad' : goal.drift < 0 ? 'good' : 'flat',
    });
  }

  if (goal.ofFinished > 0) {
    marks.push({
      label: 'Work pointed here',
      value: `${goal.aimed} of ${goal.ofFinished}`,
      // Not a judgement on the ratio. A subject whose goal is one of several
      // honest things to do in it is not failing by having other work in it,
      // so this reports rather than scores.
      tone: goal.aimed === 0 ? 'bad' : 'flat',
    });
  }

  return marks;
}

/**
 * The band, counted and then overlaid with whatever the reading supplied.
 *
 * `read` is field-by-field rather than all-or-nothing on purpose: the server
 * blanks a sentence that cited a figure nobody counted and keeps the rest, so
 * an overlay that replaced the whole band would turn one overreaching clause
 * into an empty heading.
 */
export function objectiveFrom(
  state: SubjectState,
  perf: Performance,
  goals: SubjectGoal[],
  ambition: Ambition | null,
  today: string,
  read?: GoalRead | null,
): Objective {
  const goal = goals[0] ?? null;
  const aim = (ambition?.aim ?? '').trim();
  const level = (ambition?.level ?? '').trim();

  /* The reader's own sentence outranks the goal's title, because they wrote it
     to say what the work is *for* and a goal title is a label on a row. */
  const counted = aim || goal?.title || '';

  return {
    objective: (read?.objective || '').trim() || counted,
    kind: read?.kind ?? 'unstated',
    whyKind: (read?.why_kind || '').trim(),
    focus: (read?.focus || '').trim() || countedFocus(state, perf),
    aim,
    level,
    source: read?.objective || read?.focus ? 'read' : 'counted',
    marks: marksFor(goal, today),
  };
}

/**
 * Rated tasks behind a shortfall split before it may name anything.
 *
 * The composite bottleneck divides the gap between the measures, and a
 * division is only as trustworthy as the count under it — "turning up
 * carries most of your shortfall" read off two afternoons is the kind of
 * sentence that makes a reader stop believing the rest of the page.
 *
 * Six, matching the floor the reasons use, and for the same reason: below
 * it, naming something stops being a finding and starts being noise with a
 * number attached.
 */
export const GAP_FLOOR = 6;

// ---------------------------------------------------------------------------
// The bottleneck
// ---------------------------------------------------------------------------
/** The named bottleneck, and where the naming came from. */
export interface NamedBottleneck extends Bottleneck {
  source: 'read' | 'counted';
}

/**
 * The one thing most in the way, named from the arithmetic.
 *
 * ## Why the order below is the order
 *
 * These are not ranked by which figure is worst. They are ranked by how much
 * the naming *rules out*, because ruling something out is the half of this
 * section a reader cannot get anywhere else and it is what stops the next
 * two weeks being spent on the wrong thing.
 *
 * So "capability is ahead of what lands" comes first: it is the one that says
 * plainly that harder material is not the move, and getting that call wrong
 * costs two weeks of work at the wrong level in either direction. The
 * difficulty cliff comes before the composite gap for the same reason — it
 * names a rung, and a rung is something to go and do on Tuesday.
 *
 * ## What it cannot do
 *
 * It cannot say what the bottleneck means *for this goal*. "Reliable
 * execution under time pressure" is a statement about a competition, and
 * whether this is a competition is the one thing the arithmetic does not
 * know. The model's version is a reading; this one is a classification, and
 * the page says which it is showing.
 *
 * Null is a real answer. A subject whose figures do not agree on a
 * bottleneck has no bottleneck, and the section does not draw — which is
 * better than the page naming one at 0.3 confidence and a reader spending a
 * month on it.
 */
export function bottleneckFrom(
  state: SubjectState,
  perf: Performance,
  read?: Bottleneck | null,
): NamedBottleneck | null {
  if (read && read.name) return { ...read, source: 'read' };

  const { divergence, families, gap, calibration } = perf;
  const cliff = state.curve.threshold;
  const holds = state.curve.holds ?? state.curve.best;
  const enough = families.known && families.answered >= 6;

  /* Capability running ahead of what lands, with the reasons agreeing that it
     is not about knowing the work. The strongest thing the arithmetic can
     say, because it rules out the commonest wrong move. */
  if (divergence.known && divergence.reading === 'capability-ahead') {
    return {
      name: 'Turning capability into work that lands',
      evidence: [
        `execution ${(divergence.capability ?? 0) > 0 ? '+' : ''}${divergence.capability} points across the window`,
        `quality ${(divergence.outcome ?? 0) > 0 ? '+' : ''}${divergence.outcome} points over the same run`,
        enough
          ? `${families.notConceptual}% of ${families.answered} named struggles were not conceptual`
          : `${state.ratedCount} rated tasks behind the comparison`,
      ],
      reading:
        'You are taking on more than you are finishing well. The fix is '
        + 'repetition, not new material.',
      ruled_out: enough && families.notConceptual >= 60
        ? 'Harder material. Most of what goes wrong is not about knowing it.'
        : '',
      confidence: enough ? 0.7 : 0.5,
      source: 'counted',
    };
  }

  /* The sitting rather than the subject. Second because it names a kind of
     problem rather than a level to work at. */
  if (enough && families.notConceptual >= 60) {
    return {
      name: 'How the sittings go, not what is in them',
      evidence: [
        `${families.notConceptual}% of named struggles were not conceptual`,
        `out of ${families.answered} answered struggles`,
        families.leading ? `most common: ${families.leading.label}, ${families.leading.share}%` : '',
      ].filter(Boolean),
      reading:
        'Problems come from how sessions go, not the material. '
        + 'Change how you work before what you work on.',
      ruled_out: 'Adding difficulty. That would make it worse.',
      confidence: families.answered >= 12 ? 0.7 : 0.55,
      source: 'counted',
    };
  }

  /* A ceiling at a named rung. Third, and it is the most actionable of the
     three — it says which level to work at. */
  if (cliff && cliff.execution !== null && holds) {
    return {
      name: `Work at ${cliff.label}`,
      evidence: [
        `${cliff.label}: execution ${cliff.execution} over ${plural(cliff.done, 'rated task')}`,
        `${holds.label}: execution ${holds.execution} over ${plural(holds.done, 'rated task')}`,
        state.curve.drop !== null ? `a ${state.curve.drop}-point step between them` : '',
      ].filter(Boolean),
      reading:
        `You do well up to ${holds.label}, then drop off. `
        + `Practice at ${holds.label} until it feels easy.`,
      ruled_out: `Everything below ${cliff.label}.`,
      confidence: cliff.done >= 8 ? 0.65 : 0.45,
      source: 'counted',
    };
  }

  /* Finished fast and rated badly. Narrow, but it is a specific behaviour
     with a specific fix, which most composites are not. */
  if (calibration.known && calibration.rushed >= 3) {
    return {
      name: 'Rushing rather than not knowing',
      evidence: [
        `${plural(calibration.rushed, 'task')} came in under your own median for the level and rated 3 or below`,
      ],
      reading:
        'You are finishing quicker than usual and rating it badly. That is '
        + 'pace, and pace does not improve with more to do.',
      ruled_out: 'More volume.',
      confidence: calibration.rushed >= 6 ? 0.6 : 0.45,
      source: 'counted',
    };
  }

  /* The composite, last. It names a group of measures rather than a thing to
     do, which is why nothing above it defers to it.

     Two parts with points in them, at least. "The largest of one" is not a
     finding — an account with only productivity measured would be told that
     turning up carries its whole shortfall, which is true, vacuous, and
     indistinguishable on screen from a real naming. */
  const carrying = gap.parts.filter((part) => part.points > 0).length;
  if (gap.known && gap.largest && gap.total > 0 && carrying >= 2
      && state.ratedCount >= GAP_FLOOR) {
    return {
      name: gap.largest.label,
      evidence: [
        `${plural(gap.largest.points, 'point')} of the ${plural(gap.total, 'point')} you are short`,
        ...gap.parts
          .filter((part) => part.key !== gap.largest?.key && part.points > 0)
          .slice(0, 2)
          .map((part) => `${part.label}: ${plural(part.points, 'point')}`),
      ],
      reading:
        `More of the shortfall sits here than anywhere else: `
        + `${gap.parts.find((part) => part.key === gap.largest?.key)?.from ?? ''}.`,
      ruled_out: '',
      confidence: 0.45,
      source: 'counted',
    };
  }

  return null;
}

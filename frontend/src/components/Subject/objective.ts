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
import type {
  Bottleneck,
  EvidenceDirection,
  GoalEvidence,
  GoalKind,
  GoalRead,
} from '@/services/analytics';
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

/** A card under "what matters now". */
export interface EvidenceCard extends GoalEvidence {
  id: string;
  source: 'read' | 'counted';
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
 * that changes a fortnight.
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

// ---------------------------------------------------------------------------
// What matters now
// ---------------------------------------------------------------------------
interface Candidate {
  id: string;
  when: boolean;
  claim: string;
  direction: EvidenceDirection;
  evidence: string[];
  relevance: string;
}

/**
 * The counted evidence cards.
 *
 * Every one is a relationship this app already computed, written as a claim
 * with the figures under it. They are ordered by what a reader could act on
 * this week rather than by size, and cut to three — the section answers "what
 * matters", and eight cards is the dashboard it replaces.
 *
 * The `relevance` line here is mechanical: what the finding implies about what
 * to do. It cannot be goal-aware, because the arithmetic does not know what
 * kind of goal this is — that is the whole reason the model's version of this
 * section is better, and the page labels which one it is showing.
 */
function candidates(
  state: SubjectState,
  perf: Performance,
  goal: SubjectGoal | null,
): Candidate[] {
  const curve = state.curve;
  const cliff = curve.threshold;
  const hold = curve.best;

  return [
    {
      id: 'cliff',
      when: Boolean(cliff && cliff.execution !== null),
      claim: `Work stops landing at ${cliff?.label}.`,
      direction: 'hurts',
      evidence: [
        `${cliff?.label}: execution ${cliff?.execution} over ${plural(cliff?.done ?? 0, 'rated task')}`,
        hold && hold.execution !== null
          ? `${hold.label}: execution ${hold.execution} over ${plural(hold.done, 'rated task')}`
          : '',
        curve.drop !== null ? `a ${curve.drop}-point step between them` : '',
      ].filter(Boolean),
      relevance: `The level to work is ${hold?.label ?? 'the one below it'}, not the one above.`,
    },
    {
      id: 'families',
      when: perf.families.known && perf.families.answered >= 6
        && perf.families.notConceptual >= 60,
      claim: 'Most of what goes wrong is not about knowing the material.',
      direction: 'hurts',
      evidence: [
        `${perf.families.notConceptual}% of named struggles were not conceptual`,
        `out of ${plural(perf.families.answered, 'answered struggle')}`,
        perf.families.leading
          ? `most common: ${perf.families.leading.label}, ${perf.families.leading.share}%`
          : '',
      ].filter(Boolean),
      relevance: 'Harder material would add a second problem on top of this one.',
    },
    {
      id: 'divergence',
      when: perf.divergence.known && perf.divergence.reading === 'capability-ahead',
      claim: 'Capability is moving faster than the result.',
      direction: 'watch',
      evidence: [
        `execution ${(perf.divergence.capability ?? 0) > 0 ? '+' : ''}${perf.divergence.capability} points across the window`,
        `quality ${(perf.divergence.outcome ?? 0) > 0 ? '+' : ''}${perf.divergence.outcome} points over the same run`,
      ],
      relevance: 'The gap is between what you can do and what you finish.',
    },
    {
      id: 'momentum',
      when: state.momentum.known && state.momentum.direction !== 'flat',
      claim: state.momentum.direction === 'climbing'
        ? 'Execution is improving across this window.'
        : 'Execution is falling across this window.',
      direction: state.momentum.direction === 'climbing' ? 'helps' : 'hurts',
      evidence: [
        `${state.momentum.earlier} to ${state.momentum.later} on execution`,
        `${(state.momentum.change ?? 0) > 0 ? '+' : ''}${state.momentum.change} points, earlier half to later`,
      ],
      relevance: state.momentum.direction === 'climbing'
        ? 'Whatever is being done now is worth keeping in rotation.'
        : 'Something changed recently and it is worth finding out what.',
    },
    {
      id: 'rushed',
      when: perf.calibration.known && perf.calibration.rushed >= 3,
      claim: 'A run of work was finished fast and rated badly.',
      direction: 'hurts',
      evidence: [
        `${plural(perf.calibration.rushed, 'task')} came in under your own median for the level and rated 3 or below`,
      ],
      relevance: 'Rushing has a different fix from not knowing.',
    },
    {
      id: 'drift',
      when: Boolean(goal && goal.drift !== null && goal.drift !== 0),
      claim: (goal?.drift ?? 0) > 0
        ? 'The current rate does not reach the date.'
        : 'The current rate arrives ahead of the date.',
      direction: (goal?.drift ?? 0) > 0 ? 'hurts' : 'helps',
      evidence: [
        `${goal?.title}: ${Math.round(goal?.progress ?? 0)}% done`,
        goal?.expected !== null && goal?.expected !== undefined
          ? `${Math.round(goal.expected)}% of its time gone`
          : '',
        `${plural(Math.abs(goal?.drift ?? 0), 'day')} ${(goal?.drift ?? 0) > 0 ? 'late' : 'early'} at this rate`,
      ].filter(Boolean),
      relevance: (goal?.drift ?? 0) > 0
        ? 'Either the rate rises or the date moves.'
        : 'There is room to raise the level rather than the volume.',
    },
    {
      id: 'idle',
      when: Boolean(goal && goal.sinceWork !== null && goal.sinceWork >= 14),
      claim: 'Nothing has been pointed at this goal lately.',
      direction: 'hurts',
      evidence: [
        `${plural(goal?.sinceWork ?? 0, 'day')} since a task here named it`,
        `${goal?.recentDays ?? 0} of the last 14 days had one`,
      ],
      relevance: 'A goal with no work pointed at it is not being pursued.',
    },
  ];
}

/** How many cards the section draws. See the note on the model's own cap. */
export const EVIDENCE_SHOWN = 3;

/**
 * The section's cards: the model's when there are any, the counted ones
 * otherwise.
 *
 * Not merged. The model's three are chosen *against the goal* out of the same
 * evidence these are chosen from by rule, so interleaving them would put two
 * readings of one record side by side with nothing saying which was which —
 * and the counted card would usually be the one restating a figure the model
 * had already decided was not the point.
 */
export function evidenceFrom(
  state: SubjectState,
  perf: Performance,
  goals: SubjectGoal[],
  read?: GoalEvidence[] | null,
): EvidenceCard[] {
  if (read && read.length > 0) {
    return read.slice(0, EVIDENCE_SHOWN).map((card, at) => ({
      ...card,
      id: `read-${at}`,
      source: 'read' as const,
    }));
  }

  const ranked = candidates(state, perf, goals[0] ?? null).filter((one) => one.when);
  return ranked.slice(0, EVIDENCE_SHOWN).map((one) => ({
    id: one.id,
    claim: one.claim,
    direction: one.direction,
    evidence: one.evidence,
    relevance: one.relevance,
    source: 'counted' as const,
  }));
}

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
 * fortnight being spent on the wrong thing.
 *
 * So "capability is ahead of what lands" comes first: it is the one that says
 * plainly that harder material is not the move, and getting that call wrong
 * costs a fortnight of work at the wrong level in either direction. The
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
        'What you can take on is moving faster than what you finish well. '
        + 'The ceiling is not the material; it is reproducing what you can '
        + 'already do often enough that it stops being a good day.',
      ruled_out: enough && families.notConceptual >= 60
        ? 'Harder material is not the next move — most of what goes wrong is '
          + 'not about knowing it.'
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
        'The work is going wrong after it starts rather than because of what '
        + 'is in it. That has a different fix from not knowing: the session '
        + 'has to change shape before its contents do.',
      ruled_out:
        'Adding difficulty would put a second problem on top of the one you have.',
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
        `The curve holds and then falls, which is a ceiling rather than a `
        + `general weakness. The level to work is ${holds.label} — the one `
        + `that is landing — until it stops being the hard one.`,
      ruled_out: `Everything below ${cliff.label} is not the problem.`,
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
        'Work is being finished quicker than it usually takes you and rated '
        + 'badly for it. That is a pace problem, and a pace problem does not '
        + 'improve by being given more to do.',
      ruled_out: 'More volume is not the move.',
      confidence: calibration.rushed >= 6 ? 0.6 : 0.45,
      source: 'counted',
    };
  }

  /* The composite, last. It names a group of measures rather than a thing to
     do, which is why nothing above it defers to it. */
  if (gap.known && gap.largest && gap.total > 0) {
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
        `More of the shortfall sits here than anywhere else. It is `
        + `${gap.largest.label.toLowerCase()} — `
        + `${gap.parts.find((part) => part.key === gap.largest?.key)?.from ?? ''}.`,
      ruled_out: '',
      confidence: 0.45,
      source: 'counted',
    };
  }

  return null;
}

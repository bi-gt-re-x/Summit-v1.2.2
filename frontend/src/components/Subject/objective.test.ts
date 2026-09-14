/**
 * components/Subject/objective — the band the page opens on.
 *
 * Two things are worth pinning here and neither is the shape of the object.
 *
 * **The counted layer always answers.** The whole reason this module exists
 * rather than reading the model's fields directly is that the page's first
 * section cannot be empty until a paid call succeeds. So: a band with no
 * reading still has a goal and a focus, and the cards still draw.
 *
 * **The overlay is field by field.** The server blanks a sentence that cited
 * a figure nobody counted and keeps the rest of the reading, so a band that
 * took the reading wholesale would lose its heading to one overreaching
 * clause. Every test below about `read` is really a test about that.
 */
import { describe, expect, it } from 'vitest';
import { bottleneckFrom, evidenceFrom, objectiveFrom } from './objective';
import type { Performance } from './performance';
import type { SubjectGoal } from './model';
import type { SubjectState } from './state';

const TODAY = '2026-09-13';

function stateWith(over: Partial<SubjectState> = {}): SubjectState {
  return {
    any: true,
    span: { from: '', to: TODAY, previousFrom: '', previousTo: '', days: 90 },
    finished: 40,
    finishedBefore: 30,
    ratedCount: 30,
    activeDays: 20,
    dimensions: [],
    overall: 70,
    curve: {
      rungs: [], any: false, best: null, holds: null,
      threshold: null, ceiling: null, drop: null,
    },
    time: {
      known: false, typical: null, hours: 0, drift: null,
      efficiency: null, quicker: null, rushed: 0, thorough: 0,
    },
    momentum: { known: false, change: null, earlier: null, later: null, direction: 'unknown' },
    standings: [],
    mistakes: [],
    ...over,
  } as SubjectState;
}

function perfWith(over: Partial<Performance> = {}): Performance {
  return {
    families: { known: false, answered: 0, shares: [], leading: null, notConceptual: 0 },
    gap: { known: false, standing: 0, total: 0, parts: [], largest: null },
    calibration: { known: false, outgrown: [], overestimated: [], rushed: 0 },
    divergence: { known: false, capability: null, outcome: null, reading: 'unknown' },
    ...over,
  } as Performance;
}

function rung(level: number, label: string, done: number, execution: number) {
  return { level, label, done, execution, quality: null, minutes: null, cleared: null };
}

/** A curve that falls off at Hard, which is the case every card is about. */
function cliffCurve(): SubjectState['curve'] {
  const holds = rung(3, 'Fair', 12, 88);
  const threshold = rung(4, 'Hard', 9, 64);
  return {
    rungs: [holds, threshold],
    any: true,
    drop: 24,
    best: holds,
    holds,
    threshold,
    ceiling: threshold,
  };
}

function goalWith(over: Partial<SubjectGoal> = {}): SubjectGoal {
  return {
    id: 'g1',
    title: 'Qualify for AIME',
    progress: 40,
    deadline: '2026-11-01',
    need: null,
    have: null,
    drift: null,
    unit: '',
    current: 0,
    target: 0,
    numeric: true,
    remaining: null,
    daysLeft: null,
    lands: null,
    expected: null,
    factor: null,
    stagesDone: 0,
    stagesTotal: 0,
    aimed: 4,
    ofFinished: 46,
    recentDays: 0,
    sinceWork: null,
    levers: [],
    ...over,
  } as SubjectGoal;
}

// ---------------------------------------------------------------------------
describe('objectiveFrom', () => {
  it("prefers the reader's own sentence to the goal's title", () => {
    // They wrote the first to say what the work is *for*. The second is a
    // label on a row on another page.
    const band = objectiveFrom(
      stateWith(), perfWith(), [goalWith()],
      { aim: 'Get to AIME without losing easy points' }, TODAY,
    );

    expect(band.objective).toBe('Get to AIME without losing easy points');
  });

  it('falls back to the goal when nothing was written', () => {
    const band = objectiveFrom(stateWith(), perfWith(), [goalWith()], null, TODAY);
    expect(band.objective).toBe('Qualify for AIME');
  });

  it('will not guess what kind of goal it is', () => {
    // The most consequential word in the reading, and arithmetic cannot supply
    // it: whether "Qualify for AIME" is an exam or a competition changes what
    // counts as progress, and no table here knows which.
    const band = objectiveFrom(stateWith(), perfWith(), [goalWith()], null, TODAY);
    expect(band.kind).toBe('unstated');
    expect(band.source).toBe('counted');
  });

  it('writes a focus from the arithmetic before any reading exists', () => {
    const band = objectiveFrom(
      stateWith(),
      perfWith({
        divergence: { known: true, capability: 14, outcome: 2, reading: 'capability-ahead' },
      }),
      [], null, TODAY,
    );

    expect(band.focus).toBe('Turn what you can already do into work that lands.');
  });

  it('says nothing rather than something generic when there is no evidence', () => {
    // A generated sentence over no figures is the placeholder this page exists
    // not to print.
    expect(objectiveFrom(stateWith(), perfWith(), [], null, TODAY).focus).toBe('');
  });

  it('takes the reading over the arithmetic when there is one', () => {
    const band = objectiveFrom(
      stateWith(),
      perfWith({
        divergence: { known: true, capability: 14, outcome: 2, reading: 'capability-ahead' },
      }),
      [goalWith()], { aim: 'Get to AIME' }, TODAY,
      {
        objective: 'Qualify for AIME by turning solving ability into contest execution',
        kind: 'competition',
        focus: 'Reproduce what you can already do, under a clock.',
        why_kind: 'The goal names a contest with a date.',
      },
    );

    expect(band.objective).toContain('contest execution');
    expect(band.kind).toBe('competition');
    expect(band.focus).toBe('Reproduce what you can already do, under a clock.');
    expect(band.source).toBe('read');
    // Their own words survive the rewrite. A page that replaces somebody's
    // sentence with a paraphrase and shows only the paraphrase has taken the
    // goal off them.
    expect(band.aim).toBe('Get to AIME');
  });

  it('keeps the counted sentence when the server blanked the read one', () => {
    // `_clean` blanks a clause that cited a figure nobody counted and keeps
    // the rest. Taking the reading wholesale would lose the heading to it.
    const band = objectiveFrom(
      stateWith(),
      perfWith({
        divergence: { known: true, capability: 14, outcome: 2, reading: 'capability-ahead' },
      }),
      [goalWith()], null, TODAY,
      { objective: '', kind: 'competition', focus: '', why_kind: '' },
    );

    expect(band.objective).toBe('Qualify for AIME');
    expect(band.focus).toBe('Turn what you can already do into work that lands.');
    expect(band.kind).toBe('competition');
  });

  it('marks how much of the work is actually pointed at the goal', () => {
    const band = objectiveFrom(
      stateWith(), perfWith(),
      [goalWith({ drift: 9, aimed: 4, ofFinished: 46 })], null, TODAY,
    );

    const marks = Object.fromEntries(band.marks.map((mark) => [mark.label, mark]));
    expect(marks['Work pointed here']?.value).toBe('4 of 46');
    expect(marks['At this rate']?.value).toBe('9 days late');
    expect(marks['At this rate']?.tone).toBe('bad');
    expect(marks.Left?.value).toBe('49 days');
  });

  it('reports an overdue goal as overdue rather than as negative days', () => {
    const band = objectiveFrom(
      stateWith(), perfWith(), [goalWith({ deadline: '2026-09-01' })], null, TODAY,
    );

    const left = band.marks.find((mark) => mark.label === 'Overdue');
    expect(left?.value).toBe('12 days');
    expect(left?.tone).toBe('bad');
  });
});

// ---------------------------------------------------------------------------
describe('evidenceFrom', () => {
  it('draws counted cards when there is no reading', () => {
    const cards = evidenceFrom(
      stateWith({
        momentum: { known: true, change: 8, earlier: 62, later: 70, direction: 'climbing' },
      }),
      perfWith(), [],
    );

    const [card] = cards;
    expect(cards).toHaveLength(1);
    expect(card?.source).toBe('counted');
    expect(card?.direction).toBe('helps');
    // The claim leads and the figure follows — the whole shift this section is.
    expect(card?.claim).toBe('Execution is improving across this window.');
    expect(card?.evidence).toContain('62 to 70 on execution');
  });

  it('caps at three however much is wrong', () => {
    const cards = evidenceFrom(
      stateWith({
        momentum: { known: true, change: -9, earlier: 70, later: 61, direction: 'slipping' },
        curve: cliffCurve(),
      }),
      perfWith({
        families: {
          known: true, answered: 12, shares: [],
          leading: { key: 'execution', label: 'The sitting', share: 58 },
          notConceptual: 83,
        },
        calibration: { known: true, outgrown: [], overestimated: [], rushed: 5 },
      }),
      [goalWith({ drift: 9, sinceWork: 20, recentDays: 0 })],
    );

    expect(cards).toHaveLength(3);
  });

  it('leads with the cliff, because that is the one that names a level', () => {
    const cards = evidenceFrom(
      stateWith({
        momentum: { known: true, change: 8, earlier: 62, later: 70, direction: 'climbing' },
        curve: cliffCurve(),
      }),
      perfWith(), [],
    );

    expect(cards[0]?.claim).toBe('Work stops landing at Hard.');
    expect(cards[0]?.relevance).toBe('The level to work is Fair, not the one above.');
  });

  it("uses the model's cards instead of its own, not as well as", () => {
    // Interleaving would put two readings of one record side by side with
    // nothing saying which was which.
    const cards = evidenceFrom(
      stateWith({
        momentum: { known: true, change: 8, earlier: 62, later: 70, direction: 'climbing' },
      }),
      perfWith(), [],
      [{
        claim: 'Your contest execution is improving.',
        direction: 'helps',
        evidence: ['62 to 70 on execution'],
        relevance: 'Timed work is what the goal is scored on.',
      }],
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]?.source).toBe('read');
    expect(cards[0]?.claim).toBe('Your contest execution is improving.');
  });

  it('draws nothing rather than filler when there is no evidence either way', () => {
    expect(evidenceFrom(stateWith(), perfWith(), [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('bottleneckFrom', () => {
  it('names nothing when the figures do not agree on anything', () => {
    // A page that names a bottleneck at low confidence is how somebody spends
    // a month on the wrong thing. No answer is a real answer.
    expect(bottleneckFrom(stateWith(), perfWith())).toBeNull();
  });

  it('leads with capability ahead of what lands, because it rules the most out', () => {
    const neck = bottleneckFrom(
      stateWith({ curve: cliffCurve() }),
      perfWith({
        divergence: { known: true, capability: 14, outcome: 2, reading: 'capability-ahead' },
        families: {
          known: true, answered: 14, shares: [],
          leading: { key: 'execution', label: 'The sitting', share: 58 },
          notConceptual: 83,
        },
      }),
    );

    expect(neck?.name).toBe('Turning capability into work that lands');
    // The half a reader cannot get anywhere else: the thing to stop doing.
    expect(neck?.ruled_out).toContain('Harder material');
  });

  it('will not rule anything out on figures that do not support it', () => {
    // Same bottleneck, no reasons behind it. The naming survives; the
    // instruction to stop does not.
    const neck = bottleneckFrom(
      stateWith(),
      perfWith({
        divergence: { known: true, capability: 14, outcome: 2, reading: 'capability-ahead' },
      }),
    );

    expect(neck?.name).toBe('Turning capability into work that lands');
    expect(neck?.ruled_out).toBe('');
    expect(neck?.confidence).toBeLessThan(0.6);
  });

  it('names the rung when the curve holds and then falls', () => {
    const neck = bottleneckFrom(stateWith({ curve: cliffCurve() }), perfWith());

    expect(neck?.name).toBe('Work at Hard');
    expect(neck?.reading).toContain('The level to work is Fair');
    expect(neck?.ruled_out).toBe('Everything below Hard.');
    expect(neck?.evidence).toContain('a 24-point step between them');
  });

  it('is less sure of a cliff with less behind it', () => {
    const thin = cliffCurve();
    const sure = bottleneckFrom(stateWith({ curve: thin }), perfWith())?.confidence ?? 0;
    thin.threshold = { ...thin.threshold!, done: 4 };
    const unsure = bottleneckFrom(stateWith({ curve: thin }), perfWith())?.confidence ?? 0;

    expect(unsure).toBeLessThan(sure);
  });

  it('takes the reading over its own naming', () => {
    const neck = bottleneckFrom(
      stateWith({ curve: cliffCurve() }), perfWith(),
      {
        name: 'Reliable execution under time pressure',
        evidence: ['Sprint: 24 to 30'],
        reading: 'Your ceiling is ahead of your contest reliability.',
        ruled_out: 'Harder problems are not the highest-return move.',
        confidence: 0.8,
      },
    );

    expect(neck?.name).toBe('Reliable execution under time pressure');
    expect(neck?.source).toBe('read');
  });

  it('falls back to its own naming when the reading had none', () => {
    // `_clean` drops a bottleneck whole when any part of it cites a figure
    // nobody counted, so an empty one reaching here is the normal case.
    const neck = bottleneckFrom(
      stateWith({ curve: cliffCurve() }), perfWith(),
      { name: '', evidence: [], reading: '', ruled_out: '', confidence: 0 },
    );

    expect(neck?.name).toBe('Work at Hard');
    expect(neck?.source).toBe('counted');
  });
});

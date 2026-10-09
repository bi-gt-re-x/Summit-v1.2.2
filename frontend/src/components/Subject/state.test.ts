/**
 * The deterministic half of subject analytics.
 *
 * Everything the model is later handed comes from here, and the instruction
 * it is given — "quote these figures and produce no others" — is only
 * workable if these figures are right. So what is pinned here is the
 * arithmetic where a plausible-looking wrong answer would never be noticed:
 * a cliff named at the wrong rung, a "fast" that is really an abandoned task,
 * a momentum reading off four data points, a dimension that scores an account
 * for not using a feature.
 */
import { describe, expect, it } from 'vitest';
import {
  CLIFF,
  RUNG_FLOOR,
  difficultyCurve,
  momentumOf,
  subjectState,
  timeAnalysis,
} from './state';
import type { AnalyticsTask } from '@/services/analytics';

const TODAY = '2026-09-05';

let seq = 0;

/** A finished, rated task in the subject under test. */
function did(over: Partial<AnalyticsTask> = {}): AnalyticsTask {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    status: 'done',
    priority: 'medium',
    subject: 'maths',
    xp_value: 30,
    created_at: TODAY,
    completed_at: TODAY,
    difficulty: 3,
    execution: 3,
    ...over,
  } as AnalyticsTask;
}

/** `n` tasks at one rung, all rated the same. */
const rung = (n: number, difficulty: number, execution: number, seconds = 900) =>
  Array.from({ length: n }, () => did({ difficulty, execution, completion_seconds: seconds }));

function ago(days: number): string {
  const at = new Date(`${TODAY}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - days);
  return at.toISOString().slice(0, 10);
}

describe('the difficulty curve', () => {
  it('names the steepest fall, not the first dip below the best', () => {
    /* The failure this exists to prevent, and it is not hypothetical: a
       reader is almost always strongest at the bottom of the scale, so "the
       first level below your best" is nearly always the second rung. Here
       Fair is 25 points under Easy and Hard is 50 under Fair — a page that
       pointed at Fair would be naming a real step down while ignoring one
       twice its size two levels up. */
    const curve = difficultyCurve([
      ...rung(5, 1, 5),
      ...rung(5, 2, 5),
      ...rung(5, 3, 4),
      ...rung(5, 4, 2),
    ]);

    expect(curve.threshold?.label).toBe('Hard');
    expect(curve.holds?.label).toBe('Fair');
    expect(curve.drop).toBe(50);
  });

  it('finds no cliff when the curve does not fall away', () => {
    // A real answer with its own instruction — go up a level, rather than
    // practice more — and one that a "lowest rung wins" rule would never give.
    const curve = difficultyCurve([...rung(5, 2, 4), ...rung(5, 3, 4), ...rung(5, 4, 4)]);
    expect(curve.threshold).toBeNull();
    expect(curve.holds).toBeNull();
    expect(curve.best?.label).toBe('Easy');
  });

  it('does not call half a star a cliff', () => {
    /* Execution is one to five stars, so a whole star is 25 points on the
       scale this is expressed in. A threshold under that would fire on the
       scale being coarse rather than on anything about the reader. */
    const curve = difficultyCurve([
      ...rung(4, 2, 4),
      ...rung(4, 3, 4),
      ...rung(2, 3, 3),
    ]);
    const fall = curve.rungs[1]!;
    expect(CLIFF).toBeGreaterThanOrEqual(20);
    expect(fall.execution).not.toBeNull();
    expect(curve.threshold).toBeNull();
  });

  it('leaves a rung under the floor unmeasured rather than scoring it', () => {
    // Two tasks is not a finding. Reporting it as a low percentage would put
    // a bad afternoon on the chart with the same weight as a quarter's work.
    const curve = difficultyCurve([...rung(6, 2, 4), ...rung(RUNG_FLOOR - 1, 5, 1)]);
    const brutal = curve.rungs[4]!;

    expect(brutal.done).toBe(RUNG_FLOOR - 1);
    expect(brutal.execution).toBeNull();
    expect(curve.threshold).toBeNull();
  });

  it('counts landing a task separately from getting through it', () => {
    /* A rung split between excellent and poor has the same mean as one that
       is uniformly middling, and they are different findings. */
    const split = difficultyCurve([...rung(3, 3, 5), ...rung(3, 3, 1)]).rungs[2]!;
    const flat = difficultyCurve(rung(6, 3, 3)).rungs[2]!;

    expect(split.execution).toBe(flat.execution);
    expect(split.cleared).toBe(50);
    expect(flat.cleared).toBe(0);
  });
});

describe('time, read against what it bought', () => {
  /* The rule the composite exists to enforce, and the two cases the spec
     names. A plain time ratio calls the first of these efficient. */
  it('does not call a fast, badly-rated task efficient', () => {
    const fast = timeAnalysis([
      ...rung(4, 3, 4, 1800), // the baseline: 30 minutes at Fair
      did({ difficulty: 3, execution: 2, completion_seconds: 1080 }), // 18 min, poor
    ]);
    const good = timeAnalysis([
      ...rung(4, 3, 4, 1800),
      did({ difficulty: 3, execution: 5, completion_seconds: 1320 }), // 22 min, excellent
    ]);

    expect(fast.efficiency!).toBeLessThan(good.efficiency!);
    expect(fast.rushed).toBe(1);
    expect(good.rushed).toBe(0);
  });

  it('counts the slow-but-landed case as its own thing, not as a failure', () => {
    const read = timeAnalysis([
      ...rung(4, 3, 3, 1800),
      did({ difficulty: 3, execution: 5, completion_seconds: 2700 }),
    ]);
    expect(read.thorough).toBe(1);
    expect(read.rushed).toBe(0);
  });

  it('has no reading at all without enough at one level to have a usual', () => {
    // "Usual" is the account's own median at that difficulty. One task at a
    // level has no median, and inventing one would compare a task to itself.
    const read = timeAnalysis([did({ completion_seconds: 600 })]);
    expect(read.known).toBe(false);
    expect(read.efficiency).toBeNull();
  });
});

describe('momentum', () => {
  it('reads direction from the halves rather than from standing', () => {
    // 80 and climbing has more momentum than 90 and flat, and the two want
    // opposite advice.
    const climbing = momentumOf([
      ...Array.from({ length: 5 }, (_, at) => did({ execution: 2, completed_at: ago(20 - at) })),
      ...Array.from({ length: 5 }, (_, at) => did({ execution: 5, completed_at: ago(5 - at) })),
    ]);

    expect(climbing.direction).toBe('climbing');
    expect(climbing.change).toBeGreaterThan(0);
  });

  it('says nothing at all off too few rated tasks', () => {
    // A direction read off three points is a number with a confidence
    // interval wider than itself.
    const thin = momentumOf(Array.from({ length: 5 }, () => did()));
    expect(thin.known).toBe(false);
    expect(thin.direction).toBe('unknown');
  });
});

describe('the dimensions', () => {
  it('keeps mastery and execution apart', () => {
    /* The most useful distinction on the page and the easiest to collapse.
       Somebody working entirely at Brutal and rating it Poor has high mastery
       and low execution; a blended "skill" figure would report them as
       average, which is the one reading that leads to the wrong instruction. */
    const state = subjectState(rung(8, 5, 1), 'maths', '30d', TODAY);
    const mastery = state.dimensions.find((entry) => entry.key === 'mastery')!;
    const execution = state.dimensions.find((entry) => entry.key === 'execution')!;

    expect(mastery.value).toBe(100);
    expect(execution.value).toBe(0);
  });

  it('leaves a dimension unknown rather than scoring an account nought', () => {
    // An account that has never rated a task has no execution figure, and a
    // nought there scores somebody for not using a feature.
    const state = subjectState(
      [did({ difficulty: undefined, execution: undefined })],
      'maths', '30d', TODAY,
    );
    const execution = state.dimensions.find((entry) => entry.key === 'execution')!;

    expect(execution.known).toBe(false);
    expect(execution.value).toBeNull();
    expect(state.finished).toBe(1);
  });

  it('gives every known dimension the counts it was made of', () => {
    // The rule the whole page rests on: a figure that cannot say where it
    // came from is a figure asking to be trusted.
    const state = subjectState(rung(10, 4, 4, 1500), 'maths', '30d', TODAY);
    for (const entry of state.dimensions) {
      if (entry.known) expect(entry.evidence.length).toBeGreaterThan(0);
    }
  });

  it('leaves momentum out of the overall figure', () => {
    /* Momentum is centred on 50 and is a direction rather than a standing.
       Averaging it into the headline would drag a strong-but-flat subject
       toward the middle for not improving, which is not what the number
       claims to say. */
    const state = subjectState(rung(12, 4, 5, 1200), 'maths', '30d', TODAY);
    const scored = state.dimensions.filter(
      (entry) => entry.key !== 'momentum' && entry.known && entry.value !== null,
    );
    const mean = Math.round(
      scored.reduce((sum, entry) => sum + entry.value!, 0) / scored.length,
    );
    expect(state.overall).toBe(mean);
  });
});

describe('standings', () => {
  it('counts a run rather than a rate', () => {
    /* A rate lets a bad fortnight hide inside a good quarter. The achievement
       is about doing it again, so the measure is the longest run. */
    const state = subjectState(
      [
        ...Array.from({ length: 8 }, (_, at) => did({ execution: 5, completed_at: ago(20 - at) })),
        did({ execution: 1, completed_at: ago(11) }),
        ...Array.from({ length: 4 }, (_, at) => did({ execution: 5, completed_at: ago(9 - at) })),
      ],
      'maths', '30d', TODAY,
    );
    const held = state.standings.find((entry) => entry.id === 'consistency')!;
    expect(held.at).toBe('best run 8');
    expect(held.reached).toBe(false);
  });

  it('is recomputed from the record rather than stored', () => {
    // Nothing here is written down, which is what stops a badge from
    // disagreeing with the figures it claims to describe.
    const state = subjectState(rung(12, 4, 5, 1200), 'maths', '30d', TODAY);
    const breakthrough = state.standings.find((entry) => entry.id === 'breakthrough')!;
    expect(breakthrough.reached).toBe(true);
    expect(breakthrough.progress).toBe(100);
  });
});

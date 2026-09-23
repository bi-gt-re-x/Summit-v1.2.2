/**
 * What the interval log is allowed to conclude, and when it must refuse.
 *
 * The refusals are the half worth pinning. A recommendation is a sentence about
 * somebody's concentration, and the failure mode of this arithmetic is not a
 * wrong number — it is a confident one drawn from an afternoon. Three intervals
 * at one length say what that person picked, not what suits them, so the
 * thresholds in components/Timer/intervals.ts exist to keep the page on its
 * ordinary picker until the record can actually answer.
 *
 * The scoring is pinned by ordering rather than by value: the property that
 * matters is that a full interrupted sitting beats half an uninterrupted one,
 * because the work that got done is the part that counts.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_INTERVALS,
  execution,
  focusScore,
  isStyleLength,
  marks,
  nextMove,
  pace,
  ranFrom,
  readinessEffect,
  recommend,
  tasksPerHour,
  unanswered,
  verdict,
  wasJustNow,
  type Interval,
} from './intervals';

function row(over: Partial<Interval> = {}): Interval {
  return {
    day: '2026-05-01',
    styleId: 'classic',
    planned: 25,
    minutes: 25,
    pauses: 0,
    finished: true,
    ...over,
  };
}

/** `count` identical intervals at one length. */
function many(count: number, over: Partial<Interval> = {}): Interval[] {
  return Array.from({ length: count }, () => row(over));
}

describe('scoring one interval', () => {
  it('gives a full, unbroken sitting the lot', () => {
    expect(focusScore(row())).toBe(100);
  });

  it('marks an interrupted sitting down, and by less each time', () => {
    const once = focusScore(row({ pauses: 1 }));
    const twice = focusScore(row({ pauses: 2 }));
    const thrice = focusScore(row({ pauses: 3 }));
    expect(once).toBeLessThan(100);
    expect(twice).toBeLessThan(once);
    expect(once - twice).toBeGreaterThan(twice - thrice);
  });

  it('rates a full interrupted sitting above half an unbroken one', () => {
    expect(focusScore(row({ pauses: 2 })))
      .toBeGreaterThan(focusScore(row({ minutes: 12, finished: false })));
  });

  it('never goes outside 0-100, whatever it is handed', () => {
    for (const odd of [
      row({ pauses: 400 }),
      row({ minutes: 0 }),
      row({ minutes: 900 }),
      row({ planned: 0, minutes: 0 }),
    ]) {
      const score = focusScore(odd);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

describe('refusing to recommend', () => {
  it('says nothing at all from an empty log', () => {
    expect(recommend([])).toBeNull();
  });

  it('says nothing until there are enough intervals', () => {
    expect(recommend(many(MIN_INTERVALS - 1, { planned: 50, minutes: 50 }))).toBeNull();
  });

  it('says nothing when every interval was the same length', () => {
    // The commonest shape of a real log: somebody who has only ever run
    // Classic. There is nothing to compare it against, so there is no verdict
    // to give — see MIN_LENGTHS.
    expect(recommend(many(MIN_INTERVALS + 4))).toBeNull();
  });

  it('will not let a single experiment at one length win', () => {
    const log = [
      ...many(5, { styleId: 'classic', planned: 25, minutes: 25, pauses: 2 }),
      // One flawless ninety. Better scoring, and one sitting.
      row({ styleId: 'ultradian', planned: 90, minutes: 90 }),
      ...many(2, { styleId: 'deep-work', planned: 50, minutes: 50, pauses: 1 }),
    ];
    expect(recommend(log)?.minutes).not.toBe(90);
  });

  it('ignores intervals nobody sat', () => {
    const log = [...many(MIN_INTERVALS, { minutes: 0 }), ...many(3, { planned: 50, minutes: 50 })];
    expect(recommend(log)).toBeNull();
  });
});

describe('recommending', () => {
  const log = [
    ...many(4, { styleId: 'classic', planned: 25, minutes: 12, pauses: 3, finished: false }),
    ...many(4, { styleId: 'deep-work', planned: 50, minutes: 50 }),
  ];

  it('names the length the account actually works best at', () => {
    expect(recommend(log)?.minutes).toBe(50);
  });

  it('names a style the app can really run', () => {
    const at = recommend(log);
    expect(at?.styleId).toBe('deep-work');
    expect(isStyleLength(at?.minutes ?? 0)).toBe(true);
  });

  it('counts everything it looked at, so the page can say how sure it is', () => {
    expect(recommend(log)?.sample).toBe(8);
  });

  it('gives a band, and puts the winner inside it', () => {
    const at = recommend(log)!;
    expect(at.low).toBeLessThanOrEqual(at.minutes);
    expect(at.high).toBeGreaterThanOrEqual(at.minutes);
  });

  it('widens the band over lengths that behave alike', () => {
    const alike = [
      ...many(3, { styleId: 'study-hall', planned: 45, minutes: 45 }),
      ...many(3, { styleId: 'deep-work', planned: 50, minutes: 50 }),
      ...many(3, { styleId: 'gentle', planned: 10, minutes: 4, pauses: 5, finished: false }),
    ];
    const at = recommend(alike)!;
    expect(at.low).toBe(45);
    expect(at.high).toBe(50);
  });

  it('prefers the style the account has actually been using at that length', () => {
    // Both are 50-minute methods in the list; only one of them is in the log.
    const log50 = [
      ...many(4, { styleId: 'deep-work', planned: 50, minutes: 50 }),
      ...many(3, { styleId: 'gentle', planned: 10, minutes: 3, pauses: 4, finished: false }),
    ];
    expect(recommend(log50)?.styleId).toBe('deep-work');
  });
});

describe('scoring an intention', () => {
  it('scores what was done against what was intended', () => {
    expect(execution(row({ intent: 'Finish 15', target: 15, done: 17 }))).toBe(113);
    expect(execution(row({ intent: 'Finish 15', target: 15, done: 12 }))).toBe(80);
  });

  it('refuses to score an intention that had no number', () => {
    // "Understand integration by parts" is a real objective and not a
    // quantity. A percentage here would be the page marking its own homework.
    expect(execution(row({ intent: 'Understand integration by parts' }))).toBeNull();
    expect(execution(row({ intent: 'Finish 15', target: 15 }))).toBeNull();
  });

  it('is flat about falling short, and says so without arithmetic', () => {
    expect(verdict(row({ intent: 'x', target: 10, done: 11 }))).toMatch(/more than/i);
    expect(verdict(row({ intent: 'x', target: 10, done: 8 }))).toMatch(/most of the way/i);
    expect(verdict(row({ intent: 'x', target: 10, done: 2 }))).toMatch(/short of/i);
  });

  it('answers a yes-or-no intention in kind', () => {
    expect(verdict(row({ intent: 'x', met: true }))).toMatch(/did what you set out/i);
    expect(verdict(row({ intent: 'x', met: false }))).toMatch(/not this time/i);
    expect(verdict(row({ intent: 'x' }))).toBe('');
  });
});

describe('what the page may still ask about', () => {
  const now = 1_780_000_000_000;

  it('asks about a sitting that has just happened', () => {
    expect(unanswered(row({ intent: 'Finish 15', target: 15, at: now - 60_000 }), now))
      .not.toBeNull();
  });

  it('does not ask about one with no intention', () => {
    expect(unanswered(row({ at: now - 60_000 }), now)).toBeNull();
  });

  it('does not ask twice', () => {
    expect(unanswered(row({ intent: 'x', target: 5, done: 4, at: now - 60_000 }), now)).toBeNull();
    expect(unanswered(row({ intent: 'x', met: false, at: now - 60_000 }), now)).toBeNull();
    // Nothing done, explicitly: an answer of zero is an answer.
    expect(unanswered(row({ intent: 'x', target: 5, done: 0, at: now - 60_000 }), now)).toBeNull();
  });

  it('stops asking once the answer would be a guess', () => {
    expect(unanswered(row({ intent: 'x', target: 5, at: now - 3 * 3600_000 }), now)).toBeNull();
  });

  it('treats a row from before the timestamp existed as old', () => {
    // Rows written by the build that had no `at`. Read as unknown, never as
    // the epoch — the other direction would interrogate somebody about a
    // sitting from last week on their next reload.
    expect(wasJustNow(row({ intent: 'x' }), now)).toBe(false);
    expect(unanswered(row({ intent: 'x', target: 5 }), now)).toBeNull();
  });
});

describe('what readiness has been worth', () => {
  it('says nothing from an account that never answered', () => {
    expect(readinessEffect(many(10))).toBeNull();
  });

  it('says nothing when only one level was ever pressed', () => {
    // The commonest shape: somebody who always says Normal has said nothing
    // about readiness, and turning that into advice would be the page reading
    // its own default back.
    expect(readinessEffect(many(8, { readiness: 'normal' }))).toBeNull();
  });

  it('says nothing from one or two sittings at a level', () => {
    expect(readinessEffect([
      ...many(4, { readiness: 'high' }),
      ...many(2, { readiness: 'low', minutes: 6, pauses: 4, finished: false }),
    ])).toBeNull();
  });

  it('reports a real difference, with the sample behind it', () => {
    const read = readinessEffect([
      ...many(4, { readiness: 'high' }),
      ...many(4, { readiness: 'low', minutes: 8, pauses: 4, finished: false }),
    ])!;
    expect(read.clear).toBe(true);
    expect(read.best).toBe('high');
    expect(read.worst).toBe('low');
    expect(read.bestScore).toBeGreaterThan(read.worstScore);
    expect(read.sample).toBe(8);
  });

  it('reports no difference as a finding rather than staying quiet', () => {
    // Both levels run the same. The page has a sentence for this, and it is
    // the one that would never be written by accident.
    const read = readinessEffect([
      ...many(4, { readiness: 'high' }),
      ...many(4, { readiness: 'low' }),
    ])!;
    expect(read).not.toBeNull();
    expect(read.clear).toBe(false);
    expect(read.bestScore).toBe(read.worstScore);
  });
});

describe('the marks', () => {
  it('has nothing to show for an empty log', () => {
    const best = marks([]);
    expect(best.unbroken).toBeNull();
    expect(best.best).toBeNull();
    expect(best.run).toBe(0);
  });

  it('counts only a sitting that ran clean through as unbroken', () => {
    const best = marks([
      row({ planned: 90, minutes: 90, pauses: 2 }),
      row({ planned: 50, minutes: 50, pauses: 0 }),
      // Longer, and abandoned: not a record of sitting still.
      row({ planned: 90, minutes: 80, pauses: 0, finished: false }),
    ]);
    expect(best.unbroken?.minutes).toBe(50);
  });

  it('finds the best-scoring sitting', () => {
    const best = marks([
      row({ pauses: 3 }),
      row({ pauses: 0 }),
      row({ pauses: 1 }),
    ]);
    expect(focusScore(best.best!)).toBe(100);
  });

  it('counts the longest run of sittings seen through', () => {
    // Two, then an abandoned one, then three, then another abandoned one,
    // then one: the answer is the middle run and not the total.
    const best = marks([
      row(), row(), row({ finished: false }), row(), row(), row(), row({ finished: false }), row(),
    ]);
    expect(best.run).toBe(3);
  });

  it('keeps a record that a later abandoned sitting cannot take away', () => {
    // The property that makes these safe to show somebody who is tired: a bad
    // afternoon does not delete the best morning.
    const good = [row({ planned: 50, minutes: 50 }), row({ planned: 50, minutes: 50 })];
    const after = marks([...good, row({ minutes: 3, pauses: 6, finished: false })]);
    expect(after.unbroken?.minutes).toBe(50);
    expect(focusScore(after.best!)).toBe(100);
    // The run breaks, which is what a run is.
    expect(after.run).toBe(2);
  });
});

describe('recommending for one kind of work', () => {
  const drills = many(6, { styleId: 'short-burst', planned: 15, minutes: 15, kind: 'repetition' });
  const proofs = [
    ...many(4, { styleId: 'deep-work', planned: 50, minutes: 50, kind: 'deep' }),
    ...many(3, { styleId: 'classic', planned: 25, minutes: 6, pauses: 3, finished: false, kind: 'deep' }),
  ];

  it('answers about the kind it was asked about', () => {
    const at = recommend([...drills, ...proofs], 'deep');
    expect(at?.minutes).toBe(50);
    expect(at?.kind).toBe('deep');
    // Only the deep-work sittings were counted, not all thirteen.
    expect(at?.sample).toBe(7);
  });

  it('refuses rather than falling back to every sitting', () => {
    // Two speed runs among a hundred others is not an answer about speed runs,
    // and answering with the average over everything would be the averaging
    // this grouping exists to undo. The page asks again without a kind.
    const log = [...drills, ...proofs, ...many(2, { planned: 20, minutes: 20, kind: 'speed' })];
    expect(recommend(log, 'speed')).toBeNull();
    expect(recommend(log)).not.toBeNull();
  });

  it('says when it is answering about everything', () => {
    expect(recommend([...drills, ...proofs])?.kind).toBeNull();
  });
});

describe('when the sitting ran', () => {
  it('works back from the end and the length', () => {
    const at = 1_780_000_000_000;
    expect(ranFrom(row({ at, minutes: 25 }))).toEqual({ from: at - 25 * 60_000, to: at });
  });

  it('is nothing for a row with no timestamp', () => {
    expect(ranFrom(row())).toBeNull();
  });
});

describe('the next move', () => {
  it('says nothing from a short log', () => {
    expect(nextMove(many(2))).toBeNull();
  });

  it('says nothing when there is no pattern', () => {
    // The common case, and the one a horoscope would fill in anyway.
    expect(nextMove([
      row({ planned: 25, minutes: 25 }),
      row({ planned: 50, minutes: 20, finished: false }),
      row({ planned: 25, minutes: 25, pauses: 1 }),
    ])).toBeNull();
  });

  it('suggests something shorter after a run of abandoned sittings', () => {
    const move = nextMove(many(3, { styleId: 'deep-work', planned: 50, minutes: 20, finished: false }))!;
    expect(move.move).toMatch(/study hall|shorter/i);
    expect(move.because).toMatch(/last 3 at 50 min were all cut short/i);
  });

  it('suggests going longer after a run of clean ones', () => {
    const move = nextMove(many(3, { styleId: 'classic', planned: 25, minutes: 25, pauses: 0 }))!;
    expect(move.move).toMatch(/longer/i);
    expect(move.because).toMatch(/ran clean through/i);
  });

  it('will not tell somebody to sit longer while they are under-delivering', () => {
    // Three full, unbroken sittings that each produced under half of what was
    // intended. "You could go longer" is the wrong answer to that, and it is
    // the one the rule order exists to prevent.
    const move = nextMove(many(3, {
      styleId: 'classic', planned: 25, minutes: 25, pauses: 0,
      intent: 'Finish 20', target: 20, done: 8,
    }))!;
    expect(move.move).toMatch(/smaller number/i);
  });

  it('notices interruptions above the account\'s own normal', () => {
    const move = nextMove([
      ...many(4, { pauses: 0 }),
      ...many(3, { planned: 25, minutes: 25, pauses: 3 }),
    ])!;
    expect(move.move).toMatch(/break|shorter/i);
    expect(move.because).toMatch(/against your usual/i);
  });

  it('suggests a smaller number after a run of missed intentions', () => {
    const move = nextMove(many(3, { intent: 'Finish 20', target: 20, done: 8 }))!;
    expect(move.move).toMatch(/smaller number/i);
    expect(move.because).toMatch(/40%/);
  });

  it('always brings the figures it fired on', () => {
    const move = nextMove(many(3, { styleId: 'classic', planned: 25, minutes: 25 }))!;
    // A suggestion whose reason cannot be checked is a horoscope.
    expect(move.because).toMatch(/\d/);
  });
});

describe('pace', () => {
  it('will not read a rate off a few minutes', () => {
    expect(tasksPerHour(1, 4 * 60)).toBeNull();
  });

  it('reads tasks against focused time, not against the day', () => {
    expect(tasksPerHour(2, 3600)).toBe(2);
    expect(tasksPerHour(2, 1800)).toBe(4);
  });

  it('is null rather than zero when there is nothing to compare with', () => {
    expect(pace(3, null)).toBeNull();
    expect(pace(null, 3)).toBeNull();
    expect(pace(3, 0)).toBeNull();
  });

  it('says how far off the account is from its own normal', () => {
    expect(pace(2.24, 2)).toBe(12);
    expect(pace(1, 2)).toBe(-50);
  });
});

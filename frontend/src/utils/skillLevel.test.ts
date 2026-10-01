/**
 * The level ladder, pinned rung by rung.
 *
 * Every number the skill tree prints about a reader now comes from here, and
 * each rule is one a reader can check against their own memory of the
 * problems — so each gets a test in those terms: five Easy problems at 80% is
 * level 2, a run of misses takes a level away, one evening of Hard problems is
 * not mastery.
 */
import { describe, expect, it } from 'vitest';
import {
  levelChange,
  nextStepText,
  readLevel,
  sinceText,
  bySkill,
  lastAt,
  type Attempt,
  type Tier,
} from './skillLevel';

let seq = 0;
function row(over: Partial<Attempt> & { weight: Tier }): Attempt {
  seq += 1;
  return {
    id: String(seq),
    node_id: 'm.quadratics',
    ordinal: 3,
    attempted: 1,
    correct: 1,
    source: 'problem',
    at: '2026-09-10T10:00:00',
    ...over,
  };
}

/** `count` single problems at one difficulty, `right` of them correct, on `day`. */
function marks(weight: Tier, count: number, right: number, day = '2026-09-10'): Attempt[] {
  return Array.from({ length: count }, (_, i) =>
    row({ weight, correct: i < right ? 1 : 0, at: `${day}T10:${String(i).padStart(2, '0')}:00` }),
  );
}

const NOW = new Date('2026-09-30T12:00:00');

describe('the ladder', () => {
  it('is 0 with nothing answered', () => {
    const read = readLevel([], NOW);
    expect(read.level).toBe(0);
    expect(read.mastery).toBe(0);
    expect(read.accuracy).toBeNull();
    expect(read.evidence).toBe('none');
  });

  it('is 1 once anything is answered, right or wrong', () => {
    expect(readLevel(marks('warmup', 1, 0), NOW).level).toBe(1);
  });

  it('is 2 for Easy problems at 70%+ over five or more', () => {
    expect(readLevel(marks('warmup', 5, 4), NOW).level).toBe(2);
    // Four is not enough to call it reliable, however many are right.
    expect(readLevel(marks('warmup', 4, 4), NOW).level).toBe(1);
    // Five, but three of five is 60%.
    expect(readLevel(marks('warmup', 5, 3), NOW).level).toBe(1);
  });

  it('is the hardest difficulty cleared, not a climb through each', () => {
    // Medium problems only, and right: level 3 without an Easy one in sight.
    expect(readLevel(marks('core', 6, 5), NOW).level).toBe(3);
  });

  it('is 4 for Hard problems at 70%+', () => {
    expect(readLevel(marks('stretch', 5, 4), NOW).level).toBe(4);
  });

  it('does not call one evening of Hard problems mastery', () => {
    const oneDay = marks('stretch', 12, 12, '2026-09-20');
    expect(readLevel(oneDay, NOW).level).toBe(4);

    const twoDays = [...marks('stretch', 6, 6, '2026-09-20'), ...marks('stretch', 6, 6, '2026-09-21')];
    expect(readLevel(twoDays, NOW).level).toBe(5);
    expect(readLevel(twoDays, NOW).mastery).toBe(100);
  });

  it('reads recent work, so a run of misses can take a level away', () => {
    const early = marks('stretch', 10, 10, '2026-09-01');
    const lately = marks('stretch', 20, 6, '2026-09-25');
    expect(readLevel(early, NOW).level).toBeGreaterThanOrEqual(4);
    expect(readLevel([...early, ...lately], NOW).level).toBeLessThan(4);
  });

  it('takes a large log in part when it crosses the window', () => {
    // Fifty Medium problems logged at once, 40 right: the window is 20 of
    // them at the same 80%, not all fifty.
    const log = row({ weight: 'core', source: 'log', attempted: 50, correct: 40 });
    const read = readLevel([log], NOW);
    expect(read.tiers.core.attempted).toBe(20);
    expect(read.tiers.core.correct).toBe(16);
    expect(read.attempted).toBe(50);
    expect(read.level).toBe(3);
  });

  it('gives partial credit toward the next level', () => {
    // Level 2, with two of the five Medium problems needed, both right.
    const read = readLevel([...marks('warmup', 5, 5), ...marks('core', 2, 2)], NOW);
    expect(read.level).toBe(2);
    expect(read.mastery).toBeGreaterThan(40);
    expect(read.mastery).toBeLessThan(60);
  });
});

describe('the other figures', () => {
  it('names the hardest difficulty answered correctly', () => {
    const read = readLevel([...marks('warmup', 3, 3), ...marks('stretch', 2, 0)], NOW);
    // Two Hard attempts, none right: the hardest *solved* is still Easy.
    expect(read.hardest).toBe('warmup');
  });

  it('counts practice days in the last four weeks', () => {
    const rows = [
      ...marks('core', 1, 1, '2026-09-29'),
      ...marks('core', 1, 1, '2026-09-20'),
      ...marks('core', 1, 1, '2026-08-01'), // outside the window
    ];
    expect(readLevel(rows, NOW).activeDays).toBe(2);
  });

  it('reads only what existed at the date asked about', () => {
    const rows = [...marks('warmup', 5, 5, '2026-09-01'), ...marks('core', 5, 5, '2026-09-25')];
    expect(readLevel(rows, new Date('2026-09-10T00:00:00')).level).toBe(2);
    expect(readLevel(rows, NOW).level).toBe(3);
  });

  it('counts a row stamped ahead of this clock when reading now', () => {
    /* A server whose clock runs ahead of the reader's time zone stamps a mark
       made a second ago with a time that is still in the future here. The
       answer the reader just gave has to count. */
    const ahead = marks('warmup', 5, 5, '2099-01-01');
    expect(readLevel(ahead).level).toBe(2);
    // A reading *at a date* still means "by then".
    expect(readLevel(ahead, NOW).level).toBe(0);
  });

  it('reports a change over a period', () => {
    const rows = [...marks('warmup', 5, 5, '2026-09-01'), ...marks('stretch', 6, 5, '2026-09-25')];
    const change = levelChange(rows, new Date('2026-09-10T00:00:00'), NOW);
    expect(change.then.level).toBe(2);
    expect(change.now.level).toBe(4);
    expect(change.inPeriod).toBe(6);
  });
});

describe('the words', () => {
  it('says what the next level needs, with the reader’s own numbers', () => {
    const text = nextStepText(readLevel([...marks('warmup', 5, 5), ...marks('core', 2, 1)], NOW));
    expect(text).toMatch(/Level 3 needs Medium problems right at least 70% of the time, over 5 or more/);
    expect(text).toMatch(/You're at 2 answered, 50% right/);
  });

  it('asks for the days on the way to mastery', () => {
    const text = nextStepText(readLevel(marks('stretch', 10, 10, '2026-09-20'), NOW));
    expect(text).toMatch(/on 2 different days/);
    expect(text).toMatch(/on 1 day\./);
  });

  it('starts a reader with nothing at the first problem', () => {
    expect(nextStepText(readLevel([], NOW))).toMatch(/Answer any problem/);
  });

  it('says how long ago in words', () => {
    expect(sinceText('2026-09-30T08:00:00', NOW)).toBe('today');
    expect(sinceText('2026-09-29T08:00:00', NOW)).toBe('yesterday');
    expect(sinceText('2026-09-25T08:00:00', NOW)).toBe('5 days ago');
    expect(sinceText(null, NOW)).toBe('never');
  });
});

describe('grouping', () => {
  it('keys a step and the whole node apart', () => {
    const groups = bySkill([
      row({ weight: 'core', ordinal: 3 }),
      row({ weight: 'core', ordinal: 3 }),
      row({ weight: 'core', ordinal: 0 }),
    ]);
    expect(groups.get('m.quadratics#3')).toHaveLength(2);
    expect(groups.get('m.quadratics#0')).toHaveLength(1);
  });

  it('finds the newest mark on one problem', () => {
    const rows = [
      row({ weight: 'core', slot: 2, correct: 0, at: '2026-09-01T10:00:00' }),
      row({ weight: 'core', slot: 2, correct: 1, at: '2026-09-05T10:00:00' }),
      row({ weight: 'core', slot: 3, correct: 0, at: '2026-09-09T10:00:00' }),
    ];
    expect(lastAt(rows, 'm.quadratics', 3, 2)?.correct).toBe(1);
    expect(lastAt(rows, 'm.quadratics', 3, 9)).toBeNull();
  });
});

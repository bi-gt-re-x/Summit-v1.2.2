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
  nextStepText,
  sinceText,
  lastAt,
  NOTHING,
  type Attempt,
  type NextLevel,
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

const NOW = new Date('2026-09-30T12:00:00');

/** A reading whose next step is `next` — the shape the server sends. */
const towards = (next: NextLevel | null) => ({ ...NOTHING, next });
const have = (attempted: number, rate: number, days: number) =>
  ({ attempted, correct: Math.round(attempted * rate), rate, days, cleared: false });

describe('the words', () => {
  it('says what the next level needs, with the reader’s own numbers', () => {
    const text = nextStepText(
      towards({ level: 3, tier: 'core', need: 5, rate: 0.7, days: 1, have: have(2, 0.5, 1) }),
    );
    expect(text).toMatch(/Level 3 needs Medium problems right at least 70% of the time, over 5 or more/);
    expect(text).toMatch(/You're at 2 answered, 50% right/);
  });

  it('asks for the days on the way to mastery', () => {
    const text = nextStepText(
      towards({ level: 5, tier: 'stretch', need: 10, rate: 0.85, days: 2, have: have(10, 1, 1) }),
    );
    expect(text).toMatch(/on 2 different days/);
    expect(text).toMatch(/on 1 day\./);
  });

  it('starts a reader with nothing at the first problem', () => {
    expect(nextStepText(NOTHING)).toMatch(/Answer any problem/);
  });

  it('says how long ago in words', () => {
    expect(sinceText('2026-09-30T08:00:00', NOW)).toBe('today');
    expect(sinceText('2026-09-29T08:00:00', NOW)).toBe('yesterday');
    expect(sinceText('2026-09-25T08:00:00', NOW)).toBe('5 days ago');
    expect(sinceText(null, NOW)).toBe('never');
  });
});

describe('grouping', () => {
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

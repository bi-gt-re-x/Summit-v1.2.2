/** How a goal choice at sign-up becomes the plan's target score. */
import { describe, expect, it } from 'vitest';
import { goalFor } from './AmcProfile';

const DEFAULTS = { 'AMC 10': 105, 'AMC 12': 90, AIME: 7 } as const;

describe('goalFor', () => {
  it('qualifying means the AIME cutoff on the AMC, and 10 on the AIME', () => {
    expect(goalFor('AMC 10', 'qualify', undefined, { ...DEFAULTS })).toBe(105);
    expect(goalFor('AMC 12', 'qualify', 70, { ...DEFAULTS })).toBe(90);
    expect(goalFor('AIME', 'qualify', undefined, { ...DEFAULTS })).toBe(10);
  });

  it('beating a last score adds two problems, capped at the maximum', () => {
    expect(goalFor('AMC 10', 'beat', 84, { ...DEFAULTS })).toBe(96);
    expect(goalFor('AMC 10', 'beat', 145.5, { ...DEFAULTS })).toBe(150);
    expect(goalFor('AIME', 'beat', 5, { ...DEFAULTS })).toBe(7);
  });

  it('without a last score, "beat" and "better" aim a little below the cutoff', () => {
    expect(goalFor('AMC 10', 'beat', undefined, { ...DEFAULTS })).toBe(90);
    expect(goalFor('AIME', 'better', undefined, { ...DEFAULTS })).toBe(5);
  });
});

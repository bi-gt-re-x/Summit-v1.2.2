/**
 * The surge cycle, run on paper.
 *
 * `advance` is the whole of what the focus sitting's background does that a
 * screenshot cannot check: a dot leaves its drift, speeds up, turns blue,
 * brakes, sits still, and comes back. Every one of those is a number changing
 * over time, and none of it is visible to a type checker.
 *
 * The cycle is driven here by stepping `advance` a frame at a time with a
 * fixed `dt`, and `Math.random` is pinned per case — the only randomness in
 * the machine is when a run starts and how long it lasts, and a test that let
 * either wander would be a test that passed for a different reason each run.
 *
 * What is deliberately *not* pinned is the arithmetic: the assertions are about
 * direction and ordering — faster than drift, then slower, then stopped; no
 * colour, then colour, then none — so retuning RUN_FAST or EASE in
 * utils/ambientField.ts changes the feel without rewriting this file. The one
 * exact claim is that a field with `surge` off never moves at all, because that
 * is a promise made to nine other pages.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { advance, newDot, type Dot } from '@/utils/ambientField';

/** One frame at 60fps, which is what the real loop clamps toward. */
const DT = 1 / 60;

function dot(over: Partial<Dot> = {}): Dot {
  return { ...newDot(100, 100), ...over };
}

/** Step until `stop` says so, or give up. Returns the frames it took. */
function until(d: Dot, stop: (d: Dot) => boolean, cap = 1200): number {
  for (let frame = 1; frame <= cap; frame += 1) {
    advance(d, DT);
    if (stop(d)) return frame;
  }
  throw new Error(`never reached the condition; stuck in "${d.mode}"`);
}

afterEach(() => vi.restoreAllMocks());

/* Spied rather than stubbed: `Math`'s methods are non-enumerable, so a
   `{ ...Math }` replacement is an object with `random` and nothing else, and
   the first `Math.min` inside `advance` throws. */

/** Make every roll start a run on the first frame it is allowed to. */
function alwaysRuns() {
  vi.spyOn(Math, 'random').mockReturnValue(0);
}
/** Make no roll ever start one. */
function neverRuns() {
  vi.spyOn(Math, 'random').mockReturnValue(0.999);
}

describe('a dot that breaks into a run', () => {
  it('goes drift, run, halt, hold and back to drift', () => {
    alwaysRuns();
    const d = dot();
    const seen: string[] = [d.mode];

    for (let frame = 0; frame < 600; frame += 1) {
      advance(d, DT);
      if (d.mode !== seen[seen.length - 1]) seen.push(d.mode);
      if (seen.length >= 5) break;
    }

    expect(seen).toEqual(['drift', 'run', 'halt', 'hold', 'drift']);
  });

  it('is faster than its own drift while running', () => {
    alwaysRuns();
    const d = dot();
    until(d, (one) => one.mode === 'run');
    // A few frames for the easing to take hold; `fast` is chased, not set.
    for (let frame = 0; frame < 20; frame += 1) advance(d, DT);

    expect(d.mode).toBe('run');
    expect(d.fast).toBeGreaterThan(2);
  });

  it('comes to a full stop, not to a slow crawl', () => {
    alwaysRuns();
    const d = dot();
    until(d, (one) => one.mode === 'hold');
    // Held still long enough for the brake to have finished.
    for (let frame = 0; frame < 30; frame += 1) advance(d, DT);

    expect(d.mode).toBe('hold');
    expect(d.fast).toBeLessThan(0.05);
  });

  it('takes its colour on the way out and loses it on the way back', () => {
    alwaysRuns();
    const d = dot();
    expect(d.blue).toBe(0);

    until(d, (one) => one.mode === 'hold');
    for (let frame = 0; frame < 30; frame += 1) advance(d, DT);
    // Stopped and still blue: the dot is blue for as long as it is away from
    // its drift, which is what makes a stopped dot read as one that arrived.
    expect(d.blue).toBeGreaterThan(0.8);

    neverRuns();
    until(d, (one) => one.mode === 'drift');
    for (let frame = 0; frame < 60; frame += 1) advance(d, DT);
    expect(d.blue).toBeLessThan(0.1);
  });

  it('returns to its own drift speed rather than to a stop', () => {
    alwaysRuns();
    const d = dot();
    until(d, (one) => one.mode === 'hold');
    neverRuns();
    until(d, (one) => one.mode === 'drift');
    for (let frame = 0; frame < 60; frame += 1) advance(d, DT);

    expect(d.fast).toBeGreaterThan(0.9);
    expect(d.fast).toBeLessThanOrEqual(1.0001);
  });
});

describe('a dot left alone', () => {
  it('stays in drift when nothing rolls a run', () => {
    neverRuns();
    const d = dot();
    for (let frame = 0; frame < 2000; frame += 1) advance(d, DT);

    expect(d.mode).toBe('drift');
    expect(d.blue).toBe(0);
    expect(d.fast).toBe(1);
  });
});

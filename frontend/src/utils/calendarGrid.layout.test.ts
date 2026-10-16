/**
 * Which layout a block gets, and the pixels that decide it.
 *
 * `layOut` picks one of three shapes from a block's length — one strip, two
 * lines, or the full four — and the thresholds are pure arithmetic against a
 * height the same function computes. That makes this exactly the kind of rule
 * that breaks silently: `.wk-event` is `overflow: hidden`, so a block asked to
 * draw more lines than it has room for does not overflow, spill or throw. It
 * simply has its last line cut through the middle, which reads as a rendering
 * glitch rather than as a layout decision that has stopped being true.
 *
 * That is what had happened. The one-strip ceiling was twenty minutes to the
 * two-line layout needs thirty, so every block between them — a twenty-five
 * minute meditation, a quarter-past to quarter-to — was drawn with a name and
 * a floor for its time and six pixels less than the pair required.
 *
 * So the assertions below are about the *boundary*, not about the middle of
 * each band: 29 and 30 are the two numbers worth pinning, and the second half
 * checks that the shape chosen actually fits the height chosen alongside it.
 */
import { describe, expect, it } from 'vitest';
import { HOUR_H, layOut, type Block } from './calendarGrid';

/** What a block of `minutes` comes out as. */
function laid(minutes: number): Block {
  const start = 9;
  const block = {
    kind: 'event',
    name: 'Morning meditation',
    family: 'sage',
    startHM: '09:00',
    endHM: '09:30',
    start,
    end: start + minutes / 60,
    top: 0,
    height: 0,
    compact: false,
    snug: false,
  } as unknown as Block;
  return layOut([block]).blocks[0]!;
}

/**
 * The room the two-line layout needs: two 11px lines at 1.25, between 5px of
 * padding at each end. Written out rather than hard-coded so the sum is
 * checkable against styles/calendar/week.css, which is where the numbers are.
 */
const LINE = 11 * 1.25;
const PADDING = 5 * 2;
const TWO_LINES = LINE * 2 + PADDING;

describe('the layout a block is given', () => {
  it('is one strip under half an hour', () => {
    expect(laid(25).compact).toBe(true);
    expect(laid(25).snug).toBe(false);
    expect(laid(29).compact).toBe(true);
  });

  it('is two lines from half an hour up', () => {
    expect(laid(30).compact).toBe(false);
    expect(laid(30).snug).toBe(true);
    expect(laid(45).snug).toBe(true);
  });

  it('is the full four lines from eighty minutes up', () => {
    expect(laid(80).compact).toBe(false);
    expect(laid(80).snug).toBe(false);
    expect(laid(120).snug).toBe(false);
  });
});

describe('the height that goes with it', () => {
  /* The property the threshold exists to guarantee, stated once: whatever
     `snug` is true of has the height its two lines need. */
  it('gives a two-line block room for two lines', () => {
    expect(laid(30).height).toBeGreaterThanOrEqual(TWO_LINES);
  });

  /* Twenty-five minutes is the case that was reported: drawn with two lines
     and nearly six pixels short of them, so the time was cut through the
     middle. Twenty-nine is the boundary's honest edge — it clears the minimum
     by seven hundredths of a pixel, which is why the threshold is thirty and
     not the last value that technically fits. */
  it('is a strip at the heights two lines do not fit, or barely do', () => {
    const natural = (minutes: number) => (minutes / 60) * HOUR_H - 4;
    expect(natural(25)).toBeLessThan(TWO_LINES - 5);
    expect(natural(29)).toBeLessThan(TWO_LINES + 0.1);
    expect(natural(30)).toBeGreaterThan(TWO_LINES + 1);
  });

  /* A quarter of an hour is 17.5px of grid and the single row inside it needs
     about 20, so the shortest blocks are floored rather than drawn to scale —
     a block that cannot be read is not worth drawing to scale. */
  it('floors the shortest strips so their one row fits', () => {
    expect(laid(15).height).toBeGreaterThanOrEqual(20);
    expect(laid(5).height).toBeGreaterThanOrEqual(20);
  });

  /* And only the shortest: by twenty minutes the grid is already taller than
     the floor, so the floor must not be quietly resizing ordinary blocks. */
  it('leaves a strip that already fits at its true height', () => {
    expect(laid(25).height).toBeCloseTo((25 / 60) * HOUR_H - 4, 5);
  });
});

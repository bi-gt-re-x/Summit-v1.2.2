/**
 * Milestone captions on the growth line, which used to print over each other.
 *
 * Four subjects crossing a band in the same week came out as one unreadable
 * smear of overlapping words. Pinned here: marks on one point merge, a
 * crowded caption is left to the tooltip rather than printed on top of its
 * neighbour, and captions at the ends anchor inward.
 */
import { describe, expect, it } from 'vitest';
import { placeMarks } from './GrowthLine';

const mark = (at: number, label: string) => ({ at, label, glyph: '▲' });

describe('placing milestone captions', () => {
  it('merges marks on the same point into one caption', () => {
    const [only, ...rest] = placeMarks(
      [mark(3, 'Running reached Strong'), mark(3, 'Health reached Advanced'), mark(3, 'Music reached Strong')],
      10,
    );
    expect(rest).toEqual([]);
    expect(only!.label).toBe('Running reached Strong +2 more');
    expect(only!.title).toBe('Running reached Strong\nHealth reached Advanced\nMusic reached Strong');
  });

  it('prints only the captions that have room, keeping every glyph', () => {
    // Points 10 and 11 of 61 are ~1.6% of the width apart.
    const placed = placeMarks([mark(10, 'A'), mark(11, 'B'), mark(40, 'C')], 61);
    expect(placed.map((one) => one.show)).toEqual([true, false, true]);
    expect(placed).toHaveLength(3);
  });

  it('anchors a caption at either end inward', () => {
    const placed = placeMarks([mark(0, 'First'), mark(30, 'Middle'), mark(60, 'Last')], 61);
    expect(placed.map((one) => one.edge)).toEqual(['start', 'middle', 'end']);
  });
});

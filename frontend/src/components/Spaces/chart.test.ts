/**
 * A chart block's arithmetic — components/Spaces/chart.ts.
 */
import { describe, expect, it } from 'vitest';
import { cleanChart, defaultChart, type ChartData } from './blocks';
import {
  POINTS_MAX,
  addPoint,
  arcPath,
  moveEdge,
  nudgeEdge,
  removePoint,
  renamePoint,
  setMax,
  setValue,
  slices,
  snapValue,
  stepFor,
  turnAt,
  valueAt,
} from './chart';

const chart = (values: number[], extra: Partial<ChartData> = {}): ChartData => ({
  kind: 'bar',
  max: 100,
  points: values.map((value, at) => ({ label: `P${at}`, value })),
  ...extra,
});

describe('the value axis', () => {
  it('snaps to about a hundredth of the scale, as a 1, 2 or 5', () => {
    expect(stepFor(100)).toBe(1);
    expect(stepFor(250)).toBe(5);
    expect(stepFor(1000)).toBe(10);
    expect(stepFor(10)).toBe(0.1);
  });

  it('reads a height on the plot as a value, snapped and kept on the scale', () => {
    expect(valueAt(0.5, 100)).toBe(50);
    expect(valueAt(0.333, 100)).toBe(33);
    expect(valueAt(1.4, 100)).toBe(100);
    expect(valueAt(-0.2, 100)).toBe(0);
    expect(snapValue(12.34, 10)).toBe(10);
  });

  it('sets one value and leaves the rest', () => {
    expect(setValue(chart([10, 20]), 1, 47.4).points.map((p) => p.value)).toEqual([10, 47]);
  });

  it('brings values down to a lower scale', () => {
    const next = setMax(chart([10, 90]), 50);
    expect(next.max).toBe(50);
    expect(next.points.map((p) => p.value)).toEqual([10, 50]);
  });
});

describe('items', () => {
  it('adds one half way up, up to the limit', () => {
    expect(addPoint(chart([10])).points[1]).toEqual({ label: 'Item 2', value: 50 });
    const full = chart(Array.from({ length: POINTS_MAX }, () => 1));
    expect(addPoint(full).points).toHaveLength(POINTS_MAX);
  });

  it('removes one, but never the last', () => {
    expect(removePoint(chart([1, 2, 3]), 1).points.map((p) => p.value)).toEqual([1, 3]);
    expect(removePoint(chart([1]), 0).points).toHaveLength(1);
  });

  it('renames one', () => {
    expect(renamePoint(chart([1]), 0, 'Monday').points[0]!.label).toBe('Monday');
  });
});

describe('pies', () => {
  it('splits the turn by value, and evenly when everything is zero', () => {
    expect(slices(chart([1, 3]).points).map((s) => s.share)).toEqual([0.25, 0.75]);
    expect(slices(chart([0, 0]).points).map((s) => s.share)).toEqual([0.5, 0.5]);
  });

  it('measures a turn from the top, clockwise', () => {
    expect(turnAt(0, -1)).toBeCloseTo(0);
    expect(turnAt(1, 0)).toBeCloseTo(0.25);
    expect(turnAt(0, 1)).toBeCloseTo(0.5);
    expect(turnAt(-1, 0)).toBeCloseTo(0.75);
  });

  it('moves an edge by giving one slice what the next loses, and nothing else changes', () => {
    const before = chart([25, 25, 50]);
    const after = moveEdge(before, 0, 0.4);
    expect(after.points.map((p) => p.value)).toEqual([40, 10, 50]);
  });

  it('never lets a slice vanish', () => {
    const after = moveEdge(chart([25, 25, 50]), 0, 0.9);
    expect(after.points[1]!.value).toBeGreaterThan(0);
    expect(after.points[0]!.value + after.points[1]!.value).toBe(50);
  });

  it('nudges an edge one step from the keyboard', () => {
    expect(nudgeEdge(chart([50, 50]), 0, 1).points.map((p) => p.value)).toEqual([51, 49]);
    expect(nudgeEdge(chart([50, 50]), 0, -1).points.map((p) => p.value)).toEqual([49, 51]);
  });

  it('draws a whole circle as two arcs, and a slice as one', () => {
    expect(arcPath(50, 40, 0, 0, 1)).toContain('A 40 40 0 1 1 50 90');
    expect(arcPath(50, 40, 0, 0, 0.25)).toBe('M 50 50 L 50 10 A 40 40 0 0 1 90 50 Z');
  });
});

describe('a chart as stored', () => {
  it('is cleaned: a known kind, a sane scale, values kept on it', () => {
    const clean = cleanChart({ kind: 'radar', max: -3, points: [{ label: 'a', value: -5 }, { label: 7, value: 'x' }] });
    expect(clean.kind).toBe('bar');
    expect(clean.max).toBe(100);
    expect(clean.points).toEqual([{ label: 'a', value: 0 }, { label: 'Item 2', value: 0 }]);
  });

  it('starts as four items scaled to 100', () => {
    expect(defaultChart('pie')).toMatchObject({ kind: 'pie', max: 100 });
    expect(defaultChart().points).toHaveLength(4);
  });
});

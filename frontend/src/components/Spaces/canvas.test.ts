/**
 * The page grid — components/Spaces/canvas.ts.
 *
 * Every case is a small page and the places its items are drawn at: flowing
 * blocks stacking like text, pinned ones staying put, and nothing overlapping.
 */
import { describe, expect, it } from 'vitest';
import type { Block } from './blocks';
import {
  COLS,
  bottomOf,
  dropAt,
  groups,
  layout,
  resizeTo,
  rowsFor,
  snap,
  sortByPlace,
  strip,
  swapPlaces,
} from './canvas';

const b = (id: string, extra: Partial<Block> = {}): Block => ({ id, type: 'text', text: id, ...extra });
const tall = (entries: Record<string, number>) => new Map(Object.entries(entries));
const places = (blocks: Block[], heights = new Map<string, number>()) =>
  layout(blocks, heights).map((item) => [item.id, item.x, item.y, item.w]);

describe('items', () => {
  it('are the blocks at the left edge, each with what is indented under it', () => {
    const blocks = [b('a'), b('a1', { indent: 1 }), b('a2', { indent: 2 }), b('b'), b('c'), b('c1', { indent: 1 })];
    expect(groups(blocks)).toEqual([
      { id: 'a', start: 0, end: 2 },
      { id: 'b', start: 3, end: 3 },
      { id: 'c', start: 4, end: 5 },
    ]);
  });

  it('take a row per 8px, with room for the gap under them', () => {
    expect(rowsFor(0)).toBe(1);
    expect(rowsFor(26)).toBe(4);
    expect(rowsFor(34)).toBe(5);
  });
});

describe('a page nobody has dragged anything on', () => {
  it('flows: each block full width, straight under the one before', () => {
    expect(places([b('a'), b('b'), b('c')], tall({ a: 4, b: 6, c: 2 }))).toEqual([
      ['a', 0, 0, COLS],
      ['b', 0, 4, COLS],
      ['c', 0, 10, COLS],
    ]);
  });

  it('keeps a new block under the one it was written after, as wide as it', () => {
    const blocks = [b('chart', { x: 6, y: 0, w: 6 }), b('note')];
    expect(places(blocks, tall({ chart: 30, note: 4 }))).toEqual([
      ['chart', 6, 0, 6],
      ['note', 6, 30, 6],
    ]);
  });
});

describe('pinned items', () => {
  it('stay where they were put, side by side', () => {
    const blocks = [b('left', { x: 0, y: 0, w: 6 }), b('right', { x: 6, y: 0, w: 6 })];
    expect(places(blocks, tall({ left: 10, right: 10 }))).toEqual([
      ['left', 0, 0, 6],
      ['right', 6, 0, 6],
    ]);
  });

  it('are pushed down when something above grows into them, and come back when it shrinks', () => {
    const blocks = [b('a', { x: 0, y: 0, w: 12 }), b('b', { x: 0, y: 10, w: 12 })];
    expect(places(blocks, tall({ a: 6, b: 4 }))[1]).toEqual(['b', 0, 10, 12]);
    expect(places(blocks, tall({ a: 15, b: 4 }))[1]).toEqual(['b', 0, 15, 12]);
    expect(places(blocks, tall({ a: 6, b: 4 }))[1]).toEqual(['b', 0, 10, 12]);
  });

  it('only push what shares their columns', () => {
    const blocks = [b('a', { x: 0, y: 0, w: 6 }), b('b', { x: 6, y: 2, w: 6 }), b('c', { x: 0, y: 3, w: 6 })];
    expect(places(blocks, tall({ a: 8, b: 4, c: 4 }))).toEqual([
      ['a', 0, 0, 6],
      ['b', 6, 2, 6],
      ['c', 0, 8, 6],
    ]);
  });

  it('carry the blocks indented under them', () => {
    const blocks = [b('toggle', { type: 'toggle', x: 3, y: 4, w: 6 }), b('inside', { indent: 1 })];
    const items = layout(blocks, new Map());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'toggle', start: 0, end: 1, x: 3, y: 4, w: 6 });
  });

  it('ignore a place that is off the grid', () => {
    expect(places([b('a', { x: 10, y: 0, w: 6 })])).toEqual([['a', 0, 0, COLS]]);
  });
});

describe('while dragging', () => {
  it('draws the held item exactly where the pointer is, and moves the rest out of its way', () => {
    const blocks = [b('a', { x: 0, y: 0, w: 12 }), b('b', { x: 0, y: 5, w: 12 })];
    const items = layout(blocks, tall({ a: 5, b: 5 }), { hold: { id: 'b', place: { x: 0, y: 0, w: 12 } } });
    expect(items.map((item) => [item.id, item.y])).toEqual([
      ['a', 5],
      ['b', 0],
    ]);
  });
});

describe('a narrow screen', () => {
  it('stacks everything full width in page order', () => {
    const blocks = [b('a', { x: 6, y: 0, w: 6 }), b('b', { x: 0, y: 0, w: 6 })];
    expect(layout(blocks, tall({ a: 3, b: 3 }), { narrow: true }).map((item) => [item.x, item.y, item.w])).toEqual([
      [0, 0, COLS],
      [0, 3, COLS],
    ]);
  });
});

describe('dropping', () => {
  it('pins everything where it was drawn, so only the dropped item moves', () => {
    const blocks = [b('a'), b('b'), b('c')];
    const items = layout(blocks, tall({ a: 4, b: 4, c: 4 }));
    const next = dropAt(blocks, items, 'a', { x: 6, y: 20, w: 6 });
    expect(next.map((one) => [one.id, one.x, one.y, one.w])).toEqual([
      ['b', 0, 4, COLS],
      ['c', 0, 8, COLS],
      ['a', 6, 20, 6],
    ]);
  });

  it('sorts the page into reading order: top to bottom, then left to right', () => {
    const blocks = [b('a', { x: 0, y: 10, w: 6 }), b('b', { x: 6, y: 0, w: 6 }), b('c', { x: 0, y: 0, w: 6 })];
    expect(sortByPlace(blocks).map((one) => one.id)).toEqual(['c', 'b', 'a']);
  });

  it('takes a block out of the one it was inside, with its own children, as an item of its own', () => {
    const blocks = [b('list'), b('child', { indent: 1 }), b('grand', { indent: 2 }), b('end')];
    const items = layout(blocks, tall({ list: 9, end: 3 }));
    const next = dropAt(blocks, items, 'child', { x: 4, y: 30, w: 4 });
    expect(next.map((one) => [one.id, one.indent ?? 0, one.x, one.y, one.w])).toEqual([
      ['list', 0, 0, 0, COLS],
      ['end', 0, 0, 9, COLS],
      ['child', 0, 4, 30, 4],
      ['grand', 1, undefined, undefined, undefined],
    ]);
  });

  it('keeps a dropped place on the grid', () => {
    const items = layout([b('a')], new Map());
    expect(dropAt([b('a')], items, 'a', { x: 20, y: -4, w: 6 })[0]).toMatchObject({ x: 6, y: 0, w: 6 });
  });
});

describe('snapping a pointer to the grid', () => {
  it('rounds to the nearest column and row', () => {
    expect(snap(130, 45, 50, 4)).toEqual({ x: 3, y: 6, w: 4 });
  });

  it('narrows an item dragged toward the right edge instead of stopping it', () => {
    expect(snap(9 * 50, 0, 50, 12)).toEqual({ x: 9, y: 0, w: 3 });
    expect(snap(20 * 50, 0, 50, 12)).toEqual({ x: 10, y: 0, w: 2 });
  });

  it('gives back the width when it is dragged back left', () => {
    expect(snap(0, 0, 50, 12)).toEqual({ x: 0, y: 0, w: 12 });
  });
});

describe('resizing and swapping', () => {
  it('resizes one item, no wider than the room to its right', () => {
    const blocks = [b('a'), b('b')];
    const items = layout(blocks, tall({ a: 3, b: 3 }));
    expect(resizeTo(blocks, items, 'a', 4).map((one) => one.w)).toEqual([4, COLS]);
    const right = [b('a', { x: 8, y: 0, w: 4 })];
    expect(resizeTo(right, layout(right, new Map()), 'a', 12)[0]!.w).toBe(4);
  });

  it('swaps an item with the one before it in reading order', () => {
    const blocks = [b('a', { x: 0, y: 0, w: 6 }), b('b', { x: 6, y: 0, w: 6 })];
    const next = swapPlaces(blocks, layout(blocks, tall({ a: 4, b: 4 })), 'b', -1);
    expect(next.map((one) => [one.id, one.x, one.y])).toEqual([
      ['b', 0, 0],
      ['a', 6, 0],
    ]);
  });
});

describe('cleaning', () => {
  it('drops the place of a block indented under another', () => {
    expect(strip([b('a', { indent: 1, x: 0, y: 0, w: 4 })])[0]).toEqual({ id: 'a', type: 'text', text: 'a', indent: 1 });
  });

  it('finds the bottom of the page', () => {
    expect(bottomOf(layout([b('a'), b('b')], tall({ a: 4, b: 7 })))).toBe(11);
  });
});

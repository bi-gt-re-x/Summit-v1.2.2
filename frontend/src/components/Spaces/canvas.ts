/**
 * Where each block sits on a space's page — the grid, with no React in it.
 *
 * The page is a grid of COLS columns and rows ROW_PX tall. Every top-level
 * block is an item on it, carrying the blocks indented under it inside it
 * (a toggle and what it hides, a list item and its sub-items). An item has a
 * column `x`, a width `w` in columns, and a row `y`.
 *
 * Two kinds of item:
 *
 *   - **Pinned**: it has `x`, `y` and `w` of its own, because somebody dragged
 *     it (or anything else on the page) there. It stays put.
 *   - **Flowing**: it has none yet. It sits straight under the item before it,
 *     as wide as that one, which is how a page of text reads. Pressing Enter
 *     or pasting makes flowing blocks, so writing still feels like writing.
 *
 * Nothing overlaps. Items are laid out in page order, and one that would land
 * on an item already placed is pushed down below it. So when a block grows,
 * what is under it moves down, and when it shrinks again it moves back up:
 * the stored row is where it was put, the drawn row is where it fits.
 *
 * Every drag pins the whole page first, so nothing else moves when one item
 * does, then sorts the blocks into reading order (top to bottom, then left to
 * right). Keys, the plain-text copy and the slash menu all read that order.
 */
import { cleanPlace, span, type Block } from './blocks';
import { RULES } from '@/utils/sharedRules';

export const COLS: number = RULES.spaces.grid.cols;
export const ROW_PX: number = RULES.spaces.grid.row_px;
export const Y_MAX: number = RULES.spaces.grid.y_max;

/** Space kept under an item before the next one, in pixels. */
export const GAP_PX = 6;

/** Below this canvas width the grid stacks everything in one column. */
export const NARROW_PX = 560;

export interface Place {
  x: number;
  y: number;
  w: number;
}

export interface Item extends Place {
  /** The top-level block's id. */
  id: string;
  /** Its index in the blocks, and the index of the last block inside it. */
  start: number;
  end: number;
  /** Height in rows. */
  h: number;
  pinned: boolean;
}

/** How many rows an item of this many pixels takes, with the gap under it. */
export const rowsFor = (px: number): number => Math.max(1, Math.ceil((px + GAP_PX) / ROW_PX));

/** The page's items: each block not inside another, with what is inside it. */
export function groups(blocks: Block[]): Array<{ id: string; start: number; end: number }> {
  const out: Array<{ id: string; start: number; end: number }> = [];
  let at = 0;
  while (at < blocks.length) {
    const end = span(blocks, at);
    out.push({ id: blocks[at]!.id, start: at, end });
    at = end + 1;
  }
  return out;
}

const pinnedPlace = (one: Block): Place | null => {
  const place = cleanPlace(one);
  return place.x === undefined ? null : (place as Place);
};

const overlaps = (a: Place & { h: number }, b: Place & { h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export interface LayoutOptions {
  /** One column, every item full width, in page order. */
  narrow?: boolean;
  /** The item being dragged: drawn exactly here, and everything else makes room. */
  hold?: { id: string; place: Place };
}

/**
 * Every item's drawn place, in page order. `heights` is rows per item id; an
 * item not measured yet counts as one row.
 */
export function layout(blocks: Block[], heights: ReadonlyMap<string, number>, options: LayoutOptions = {}): Item[] {
  const { narrow = false, hold } = options;
  const all = groups(blocks);
  const placed: Item[] = [];
  const out = new Map<string, Item>();

  if (hold && !narrow) {
    const group = all.find((one) => one.id === hold.id);
    if (group) {
      const item: Item = { ...group, ...hold.place, h: heights.get(group.id) ?? 1, pinned: true };
      placed.push(item);
      out.set(item.id, item);
    }
  }

  let before: Item | null = null;
  for (const group of all) {
    const held = out.get(group.id);
    if (held) {
      before = held;
      continue;
    }
    const root = blocks[group.start]!;
    const h = heights.get(group.id) ?? 1;
    const pinned = narrow ? null : pinnedPlace(root);
    // A flowing block with a width of its own (a sticky note, a shape) keeps
    // it; otherwise it is as wide as the block it follows. A place that is
    // off the grid is dropped whole, width and all.
    const own = !narrow && root.x === undefined && Number.isInteger(root.w) && root.w! >= 1 ? root.w! : null;
    const want: Place = pinned
      ?? (before && !narrow
        ? { x: before.x, w: Math.min(own ?? before.w, COLS - before.x), y: before.y + before.h }
        : { x: 0, w: own ?? COLS, y: before ? before.y + before.h : 0 });

    // Down past anything already here, until it lands somewhere free.
    let y = want.y;
    for (let moved = true; moved; ) {
      moved = false;
      for (const other of placed) {
        if (overlaps({ ...want, y, h }, other)) {
          y = other.y + other.h;
          moved = true;
        }
      }
    }
    const item: Item = { ...group, x: want.x, w: want.w, y, h, pinned: Boolean(pinned) };
    placed.push(item);
    out.set(item.id, item);
    before = item;
  }
  return all.map((group) => out.get(group.id)!);
}

/** The row under the lowest item. */
export const bottomOf = (items: Item[]): number => items.reduce((low, item) => Math.max(low, item.y + item.h), 0);

/** Whether anything on the page has been placed by hand. */
export const anyPinned = (blocks: Block[]): boolean =>
  groups(blocks).some((group) => pinnedPlace(blocks[group.start]!) !== null);

/** Blocks indented under another ride inside it, so they keep no place of their own. */
export function strip(blocks: Block[]): Block[] {
  return blocks.map((one) => {
    if (!one.indent || (one.x === undefined && one.y === undefined && one.w === undefined)) return one;
    const { x: _x, y: _y, w: _w, ...rest } = one;
    return rest;
  });
}

/** Every item pinned where it is drawn now, so the next change moves only what it means to. */
export function pinAll(blocks: Block[], items: Item[]): Block[] {
  const at = new Map(items.map((item) => [item.id, item]));
  return blocks.map((one) => {
    const item = at.get(one.id);
    return item ? { ...one, x: item.x, y: item.y, w: item.w } : one;
  });
}

/** The items in reading order: top to bottom, then left to right. Ties keep page order. */
export function sortByPlace(blocks: Block[]): Block[] {
  const all = groups(blocks).map((group, order) => ({ ...group, order, place: pinnedPlace(blocks[group.start]!) }));
  // A flowing item keeps its spot just after the item it follows.
  let last = { x: 0, y: -1 };
  const keyed = all.map((group) => {
    const key = group.place ? { x: group.place.x, y: group.place.y } : { x: last.x, y: last.y + 0.5 };
    last = key;
    return { ...group, key };
  });
  keyed.sort((a, b) => a.key.y - b.key.y || a.key.x - b.key.x || a.order - b.order);
  return keyed.flatMap((group) => blocks.slice(group.start, group.end + 1));
}

/** A place kept inside the grid. */
export function clampPlace(place: Place): Place {
  const w = Math.max(1, Math.min(COLS, Math.round(place.w)));
  const x = Math.max(0, Math.min(COLS - w, Math.round(place.x)));
  const y = Math.max(0, Math.min(Y_MAX, Math.round(place.y)));
  return { x, y, w };
}

/**
 * The page with one block — and whatever is inside it — moved to `place`.
 *
 * `items` is the page as drawn before the move. Everything is pinned where it
 * was first, so only the moved item goes anywhere. A block that was inside
 * another comes out of it and becomes an item of its own.
 */
export function dropAt(blocks: Block[], items: Item[], id: string, place: Place): Block[] {
  const pinned = pinAll(blocks, items);
  const from = pinned.findIndex((one) => one.id === id);
  if (from < 0) return blocks;
  const end = span(pinned, from);
  const shift = pinned[from]!.indent ?? 0;
  const moving = pinned.slice(from, end + 1).map((one, at) => {
    const indent = (one.indent ?? 0) - shift;
    const { x: _x, y: _y, w: _w, indent: _indent, ...rest } = one;
    const next: Block = { ...rest };
    if (indent > 0) next.indent = indent;
    if (at === 0) Object.assign(next, clampPlace(place));
    return next;
  });
  const rest = [...pinned.slice(0, from), ...pinned.slice(end + 1)];
  return sortByPlace([...rest, ...moving]);
}

/** The page with one item made `w` columns wide, everything else pinned where it is. */
export function resizeTo(blocks: Block[], items: Item[], id: string, w: number): Block[] {
  const item = items.find((one) => one.id === id);
  if (!item) return blocks;
  const pinned = pinAll(blocks, items);
  const width = Math.max(1, Math.min(COLS - item.x, Math.round(w)));
  return pinned.map((one) => (one.id === id ? { ...one, w: width } : one));
}

/**
 * Swap an item with the one before (-1) or after (1) it in reading order.
 * Each keeps its own width; anything they now land on is pushed down.
 */
export function swapPlaces(blocks: Block[], items: Item[], id: string, step: -1 | 1): Block[] {
  const ordered = sortByPlace(pinAll(blocks, items));
  const list = groups(ordered);
  const at = list.findIndex((group) => group.id === id);
  const other = list[at + step];
  if (at < 0 || !other) return blocks;
  const mine = pinnedPlace(ordered[list[at]!.start]!)!;
  const theirs = pinnedPlace(ordered[other.start]!)!;
  const swapped = ordered.map((one) => {
    if (one.id === id) return { ...one, ...clampPlace({ x: theirs.x, y: theirs.y, w: mine.w }) };
    if (one.id === other.id) return { ...one, ...clampPlace({ x: mine.x, y: mine.y, w: theirs.w }) };
    return one;
  });
  return sortByPlace(swapped);
}

/** The narrowest an item gets when it is dragged toward the right edge. */
export const MIN_W = 2;

/**
 * Where a pointer puts an item: the grid cell nearest its top-left corner.
 * `left` and `top` are pixels from the canvas's corner to the item's corner.
 *
 * `w` is the item's width when it was picked up. Dragged toward the right
 * edge, it narrows to fit what is left of the row rather than stopping, so a
 * full-width block can be dropped beside a half-width one; dragged back, it
 * widens again up to `w`.
 */
export function snap(left: number, top: number, columnPx: number, w: number): Place {
  const narrowest = Math.min(w, MIN_W);
  const x = Math.max(0, Math.min(COLS - narrowest, Math.round(columnPx > 0 ? left / columnPx : 0)));
  return clampPlace({ x, y: top / ROW_PX, w: Math.min(w, COLS - x) });
}

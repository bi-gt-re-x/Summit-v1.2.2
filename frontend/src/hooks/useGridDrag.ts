/**
 * Dragging on the time grid: making something, moving it, changing its length.
 *
 * Three interactions, one pointer gesture each, sharing a set of rules:
 *
 *   * **Create.** Press on empty column and drag. The selection grows with the
 *     pointer and stops dead at the neighbours either side, so a new slot can
 *     never be drawn through something that is already there. Release opens the
 *     "event or task?" chooser with the dragged times.
 *   * **Move.** Press anywhere inside a block that is not its ⋮ menu or (on an
 *     unfinished task) its click-to-finish name, and it follows the pointer —
 *     up and down for the time, across for the day.
 *   * **Length.** Press a block's top or bottom edge and only that end moves.
 *     The other stays put, and a block always keeps at least a quarter hour.
 *
 * Everything snaps to fifteen minutes. A move or a resize is previewed with the
 * times it would take, and a slot overlapping any other block — task or event,
 * by so much as a minute — is refused: the preview turns red and releasing
 * leaves the block exactly where it was. That is the same rule the grid already
 * enforces after the fact, applied before the fact instead.
 *
 * Ported from the drag half of the old calendar-week.js, which was deleted with
 * the rest of the vanilla calendar when the views moved to React and never came
 * back. The arithmetic is that file's; the plumbing is not.
 *
 * ## Why the DOM, and not state
 *
 * The preview is created, positioned and removed by hand rather than rendered.
 * A drag is a stream of pointer events at screen rate, and putting each one
 * through React would re-render seven columns and everything on them to move
 * one rectangle. The measurements come off the live DOM for the same reason —
 * and because they have to: whether a slot is free depends on where the blocks
 * actually are *now*, including on a column the pointer has just crossed into.
 *
 * Nothing here writes anything. It hands the finished slot back to the caller,
 * which owns the store and the API.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  BLOCK_GAP,
  END_HOUR,
  HOUR_H,
  MIN_STEP_PX,
  START_HOUR,
  hmLabel,
  minutesToHm,
  pxToClockMinutes,
  pxToDate,
  snapPx,
} from '@/utils/calendarGrid';

const GRID_H = (END_HOUR - START_HOUR) * HOUR_H;
/** Pointer travel before a press on a block counts as a drag and not a click. */
const MOVE_THRESHOLD = 4;
/** How near a scroll edge the pointer has to be to start auto-scrolling. */
const EDGE = 46;
/** The most one frame of auto-scroll moves. Nearer the edge is faster. */
const MAX_STEP = 16;
/** Touching edges are not an overlap. */
const EPSILON = 0.5;

/** A slot the reader has dragged out on one day. */
export interface DraggedSlot {
  iso: string;
  /** "HH:MM", 24-hour. */
  startTime: string;
  endTime: string;
}

/** A block the reader has dragged somewhere else. */
export interface DroppedBlock {
  kind: 'task' | 'event';
  /** `data-id` for a task; the name for an event. */
  id: string;
  /**
   * The times the block had before the drag, "HH:MM". An event has no id of its
   * own — it is a row in a day's list — so name plus these two is what finds it
   * again in the store.
   */
  fromStartTime: string;
  fromEndTime: string;
  fromIso: string;
  toIso: string;
  startTime: string;
  endTime: string;
  /** The real moments, so an overnight block keeps the right dates. */
  startAt: Date;
  endAt: Date;
}

export interface UseGridDragOptions {
  /**
   * The scroller to auto-scroll when the pointer nears its edge. A plain ref is
   * enough here, unlike the columns: it is read when a drag starts, by which
   * time everything is mounted.
   */
  scroller: RefObject<HTMLElement | null>;
  /** A slot was dragged out on empty grid. */
  onCreate: (slot: DraggedSlot) => void;
  /** A block was dropped somewhere legal. */
  onDrop: (drop: DroppedBlock) => void;
  /** Off while a dialog is up, so a drag cannot start behind it. */
  enabled?: boolean;
}

type Mode = 'create' | 'move' | 'top' | 'bottom';

interface DragState {
  mode: Mode;
  col: HTMLElement;
  iso: string;
  /** The day the drag started on. Only a move can change it. */
  fromIso: string;
  preview: HTMLElement;
  scroller: HTMLElement | null;
  lastX: number;
  lastY: number;
  raf: number | null;
  moved: boolean;

  // create
  y0?: number;
  gap?: [number, number];

  // move / resize
  block?: HTMLElement;
  grabDY?: number;
  top0?: number;
  bottom0?: number;
  span?: number;
  startX?: number;
  startY?: number;
  armed?: boolean;

  // the slot being proposed
  top: number;
  bottom: number;
  ok: boolean;
}

/** Every column the container holds — or the container, when it is one. */
function columnsOf(host: HTMLElement): HTMLElement[] {
  if (host.classList.contains('wk-daycol')) return [host];
  return Array.from(host.querySelectorAll<HTMLElement>('.wk-daycol'));
}

function columnAt(host: HTMLElement, clientX: number): HTMLElement | null {
  return (
    columnsOf(host).find((col) => {
      const box = col.getBoundingClientRect();
      return clientX >= box.left && clientX <= box.right;
    }) ?? null
  );
}

/**
 * The free [top, bottom] range around `y` in a column, or null when `y` is
 * inside a block — where a drag to create has nothing to select.
 */
function gapAround(col: HTMLElement, y: number, self?: HTMLElement): [number, number] | null {
  let top = 0;
  let bottom = GRID_H;
  for (const other of col.querySelectorAll<HTMLElement>('.wk-event')) {
    if (other === self) continue;
    const oTop = other.offsetTop;
    const oBottom = oTop + other.offsetHeight + BLOCK_GAP;
    if (oTop <= y && oBottom > y) return null;
    if (oBottom <= y && oBottom > top) top = oBottom;
    if (oTop >= y && oTop < bottom) bottom = oTop;
  }
  return [top, bottom];
}

/** Is [top, bottom) clear of everything else in this column? */
function slotIsFree(col: HTMLElement, top: number, bottom: number, self?: HTMLElement): boolean {
  for (const other of col.querySelectorAll<HTMLElement>('.wk-event')) {
    if (other === self) continue;
    const oTop = other.offsetTop;
    const oBottom = oTop + other.offsetHeight + BLOCK_GAP;
    if (Math.min(bottom, oBottom) - Math.max(top, oTop) > EPSILON) return false;
  }
  return true;
}

function label(top: number, bottom: number): string {
  return `${hmLabel(minutesToHm(pxToClockMinutes(top)))} to ${hmLabel(
    minutesToHm(pxToClockMinutes(bottom)),
  )}`;
}

/**
 * Returns the ref to put on the columns container.
 *
 * A **callback** ref, not an object one, and that is not a preference. The page
 * renders a spinner while the week loads, so the grid is not in the document
 * when the effects first run — and an effect keyed on a ref object never runs
 * again when the node it was waiting for finally appears, because the ref
 * changing is not a render. Nothing was wired, and nothing said so. React calls
 * a callback ref with the node the moment it exists, and holding that node in
 * state is what re-runs the effect below.
 */
export function useGridDrag({
  scroller,
  onCreate,
  onDrop,
  enabled = true,
}: UseGridDragOptions): (node: HTMLElement | null) => void {
  // The callbacks are read through a ref so the document listeners below are
  // wired once for the life of the grid, instead of being torn down and rebuilt
  // every time the page re-renders with a new closure.
  const handlers = useRef({ onCreate, onDrop });
  handlers.current = { onCreate, onDrop };

  const state = useRef<DragState | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const setColumns = useCallback((node: HTMLElement | null) => setHost(node), []);

  useEffect(() => {
    if (!host || !enabled) return;
    // Bound after the guard so the handlers below — hoisted function
    // declarations — see it as an element rather than as possibly null.
    const grid: HTMLElement = host;

    // ---- positioning ----------------------------------------------------
    function apply() {
      const st = state.current;
      if (!st) return;

      if (st.mode === 'create') {
        const y = st.lastY - st.col.getBoundingClientRect().top;
        const [lo, hi] = st.gap as [number, number];
        const clamped = Math.max(lo, Math.min(y, hi));
        st.top = Math.max(lo, snapPx(Math.min(st.y0 as number, clamped)));
        st.bottom = Math.min(hi, snapPx(Math.max(st.y0 as number, clamped)));
        st.ok = true;
        if (st.bottom - st.top > 3) st.moved = true;
      } else if (st.mode === 'move') {
        // The whole block: the column under the pointer decides the day.
        const col = columnAt(grid, st.lastX) ?? st.col;
        if (col !== st.col) {
          st.col = col;
          st.iso = col.dataset.iso ?? st.iso;
          col.appendChild(st.preview);
        }
        const y = snapPx(st.lastY - col.getBoundingClientRect().top - (st.grabDY as number));
        st.top = Math.max(0, Math.min(y, GRID_H - (st.span as number)));
        st.bottom = st.top + (st.span as number);
        st.ok = slotIsFree(st.col, st.top, st.bottom, st.block);
      } else {
        // One edge. The day is fixed and the end being dragged cannot pass the
        // other: a block always keeps at least one quarter-hour step.
        const edge = snapPx(st.lastY - st.col.getBoundingClientRect().top);
        if (st.mode === 'top') {
          st.top = Math.max(0, Math.min(edge, (st.bottom0 as number) - MIN_STEP_PX));
          st.bottom = st.bottom0 as number;
        } else {
          st.top = st.top0 as number;
          st.bottom = Math.min(GRID_H, Math.max(edge, (st.top0 as number) + MIN_STEP_PX));
        }
        st.ok = slotIsFree(st.col, st.top, st.bottom, st.block);
      }

      st.preview.style.top = `${st.top}px`;
      st.preview.style.height = `${Math.max(
        2,
        st.bottom - st.top - (st.mode === 'create' ? 0 : BLOCK_GAP),
      )}px`;
      st.preview.classList.toggle('is-bad', !st.ok);
      const caption = st.preview.firstElementChild;
      if (caption) {
        caption.textContent = st.ok ? label(st.top, st.bottom) : 'Something is already here';
      }
    }

    // ---- auto-scroll near an edge ---------------------------------------
    function edgeAmount(): number {
      const st = state.current;
      const box = st?.scroller?.getBoundingClientRect();
      if (!st || !box) return 0;
      const ceiling = st.mode === 'create' ? (st.gap as [number, number])[1] : GRID_H;
      const floor = st.mode === 'create' ? (st.gap as [number, number])[0] : 0;
      if (st.lastY > box.bottom - EDGE && st.bottom < ceiling) {
        return Math.min(MAX_STEP, Math.max(3, ((st.lastY - (box.bottom - EDGE)) / EDGE) * MAX_STEP));
      }
      if (st.lastY < box.top + EDGE && st.top > floor) {
        return -Math.min(MAX_STEP, Math.max(3, (((box.top + EDGE) - st.lastY) / EDGE) * MAX_STEP));
      }
      return 0;
    }

    function tick() {
      const st = state.current;
      if (!st) return;
      const amount = edgeAmount();
      if (st.scroller && amount !== 0) {
        const before = st.scroller.scrollTop;
        st.scroller.scrollTop += amount;
        if (st.scroller.scrollTop !== before) apply();
        st.raf = requestAnimationFrame(tick);
      } else {
        st.raf = null; // idle; the next move restarts it
      }
    }

    // ---- starting a drag -------------------------------------------------
    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0 || state.current) return;
      const target = event.target as HTMLElement;
      if (target.closest('.wk-card-menu') || target.closest('.wk-card-pop')) return;

      const col = target.closest<HTMLElement>('.wk-daycol');
      if (!col) return;
      const iso = col.dataset.iso ?? '';
      const block = target.closest<HTMLElement>('.wk-event');

      const preview = document.createElement('div');
      preview.setAttribute('aria-hidden', 'true');

      if (!block) {
        // --- create ---
        const y = event.clientY - col.getBoundingClientRect().top;
        const gap = gapAround(col, y);
        if (!gap) return;
        event.preventDefault();
        preview.className = 'wk-drag-preview';
        col.appendChild(preview);
        state.current = {
          mode: 'create', col, iso, fromIso: iso, preview,
          scroller: scroller.current, lastX: event.clientX, lastY: event.clientY,
          raf: null, moved: false, y0: y, gap, top: y, bottom: y, ok: true,
        };
        document.body.style.userSelect = 'none';
        return;
      }

      // --- move or resize ---
      // A finished task is a record of what happened; it does not get moved.
      // The name of an unfinished one is the click-to-finish target, so a press
      // there is a click and not a grab.
      if (block.classList.contains('is-done')) return;
      if (target.closest('.wk-task-name')) return;

      const handle = target.closest<HTMLElement>('.wk-resize');
      const mode: Mode = handle
        ? handle.classList.contains('wk-resize-top')
          ? 'top'
          : 'bottom'
        : 'move';

      const top0 = block.offsetTop;
      const span = block.offsetHeight + BLOCK_GAP;
      preview.className = 'wk-move-preview';
      preview.appendChild(document.createElement('span'));

      state.current = {
        mode, col, iso, fromIso: iso, preview,
        scroller: scroller.current, lastX: event.clientX, lastY: event.clientY,
        raf: null, moved: false,
        block, grabDY: event.clientY - block.getBoundingClientRect().top,
        top0, bottom0: top0 + span, span,
        startX: event.clientX, startY: event.clientY, armed: false,
        top: top0, bottom: top0 + span, ok: true,
      };
      event.preventDefault();
    }

    /** A move/resize does not begin until the pointer has actually travelled. */
    function arm() {
      const st = state.current;
      if (!st || st.armed || st.mode === 'create') return;
      st.armed = true;
      st.moved = true;
      st.block?.classList.add('is-moving');
      st.col.appendChild(st.preview);
      document.body.style.userSelect = 'none';
      document.body.classList.add(st.mode === 'move' ? 'wk-moving' : 'wk-resizing');
    }

    function onPointerMove(event: PointerEvent) {
      const st = state.current;
      if (!st) return;
      st.lastX = event.clientX;
      st.lastY = event.clientY;

      if (st.mode !== 'create' && !st.armed) {
        const travelled =
          Math.abs(event.clientX - (st.startX as number)) +
          Math.abs(event.clientY - (st.startY as number));
        if (travelled < MOVE_THRESHOLD) return;
        arm();
      }

      apply();
      if (st.raf === null && edgeAmount() !== 0) st.raf = requestAnimationFrame(tick);
    }

    function onPointerUp() {
      const st = state.current;
      if (!st) return;
      state.current = null;
      if (st.raf !== null) cancelAnimationFrame(st.raf);
      st.preview.remove();
      st.block?.classList.remove('is-moving');
      document.body.style.userSelect = '';
      document.body.classList.remove('wk-moving', 'wk-resizing');

      if (!st.moved) return;

      if (st.mode === 'create') {
        // A flick rather than a drag selects nothing worth acting on.
        if (st.bottom - st.top < MIN_STEP_PX) return;
        handlers.current.onCreate({
          iso: st.iso,
          startTime: minutesToHm(pxToClockMinutes(st.top)),
          endTime: minutesToHm(pxToClockMinutes(st.bottom)),
        });
        return;
      }

      // Refused: the slot is over something else, so nothing changes.
      if (!st.ok) return;
      // Dropped exactly where it was picked up, on the same day.
      if (st.iso === st.fromIso && st.top === st.top0 && st.bottom === st.bottom0) return;

      const block = st.block as HTMLElement;
      handlers.current.onDrop({
        kind: block.dataset.kind === 'event' ? 'event' : 'task',
        id: block.dataset.id ?? '',
        fromStartTime: block.dataset.start ?? '',
        fromEndTime: block.dataset.end ?? '',
        fromIso: st.fromIso,
        toIso: st.iso,
        startTime: minutesToHm(pxToClockMinutes(st.top)),
        endTime: minutesToHm(pxToClockMinutes(st.bottom)),
        startAt: pxToDate(st.iso, st.top),
        endAt: pxToDate(st.iso, st.bottom),
      });
    }

    grid.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);

    return () => {
      grid.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      // A drag interrupted by a re-render leaves nothing behind: no orphaned
      // preview, no body class that would pin the cursor to `grabbing` forever.
      const st = state.current;
      if (st) {
        if (st.raf !== null) cancelAnimationFrame(st.raf);
        st.preview.remove();
        st.block?.classList.remove('is-moving');
        state.current = null;
      }
      document.body.style.userSelect = '';
      document.body.classList.remove('wk-moving', 'wk-resizing');
    };
  }, [enabled, host, scroller]);

  return setColumns;
}

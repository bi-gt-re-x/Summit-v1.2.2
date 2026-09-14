/**
 * The canvas: connections underneath, nodes on top, and the means to move
 * around both.
 *
 * ## Native scrolling, scaled content — not a transform matrix
 *
 * The obvious build is a single transformed layer and a pointer handler that
 * owns pan and zoom outright. This one does not do that. The content sits in an
 * ordinary `overflow: auto` box and scale is applied to the drawing inside it,
 * with the box's scrollable area sized to the scaled drawing. Everything that
 * makes scrolling feel right is then the platform's rather than ours: trackpad
 * inertia, touch momentum and rubber-banding, shift-wheel for sideways, the
 * scrollbars themselves, and the browser scrolling a focused node into view
 * when it is tabbed to. A hand-rolled matrix has to reimplement all of that and
 * usually reimplements the first two badly.
 *
 * Panning is then drag-to-scroll, and zoom is a number that changes the size of
 * the scrollable area. Both are a handful of lines because the hard part is not
 * being done here.
 *
 * ## Zoom holds the point under the cursor
 *
 * Scaling alone would keep the top-left pinned and slide whatever you were
 * looking at off the screen. The content coordinate under the pointer is worked
 * out before the scale changes and the scroll offset is set to put it back
 * where it was after — the two lines in `zoomTo`. Buttons pass the middle of
 * the viewport as the anchor, so keyboard and mouse zoom both hold what is in
 * front of you.
 *
 * ## Wheel
 *
 * Ctrl or ⌘ with the wheel zooms and is the only case that calls
 * `preventDefault`, so a plain wheel or a two-finger swipe still scrolls the
 * box natively. That listener is attached by hand rather than with `onWheel`
 * because React registers wheel handlers passively, and a passive listener is
 * not allowed to prevent the browser's own pinch-zoom.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  GEOM,
  layoutGraph,
  type Geometry,
  type GraphNode,
  type PlacedNode,
  type SkillGraph,
} from '@/utils/skillGraph';
import { SkillConnection } from './SkillConnection';
import { SkillNode } from './SkillNode';

/** How far the canvas will scale, and the step the buttons move in. */
export const ZOOM = { min: 0.5, max: 1.6, step: 0.15, start: 1 };

const clampZoom = (value: number) =>
  Math.max(ZOOM.min, Math.min(ZOOM.max, Number(value.toFixed(3))));

export interface SkillTreeProps {
  graph: SkillGraph;
  selectedId: string | null;
  onSelect: (node: GraphNode | null) => void;
  /** Shown in place of the drawing when a filter has emptied it. */
  empty?: React.ReactNode;
  /**
   * The node size and spacing the layout runs on. Defaults to the wide labelled
   * card geometry; the subject-tree feed hands in {@link LATTICE_GEOM} to pack
   * a tight lattice of square nodes instead. Same algorithm either way.
   */
  geom?: Geometry;
  /**
   * How one placed node is drawn. Defaults to the labelled {@link SkillNode}
   * card. A feed that wants a different node — the compact lattice tile, say —
   * supplies its own here, and the canvas keeps owning the pan, zoom and
   * placement around it.
   */
  renderNode?: (
    placed: PlacedNode,
    ctx: { selected: boolean; onSelect: (node: GraphNode | null) => void },
  ) => React.ReactNode;
  /** Open each graph at a scale that fits its width. Off by default, so the
   *  card feeds keep opening at 100% exactly as they did. */
  fit?: boolean;
  /**
   * The focus layer, node id → weight, or absent while there is none.
   *
   * The canvas uses it for the *wires* only; the tiles are drawn by the
   * caller's own `renderNode`, which reads the same map. A line is lit when
   * both ends are in the layer and neither is dimmed, and faded when either
   * end is — so a run of prerequisites reads as one route rather than as four
   * lines that happen to touch. See `emphasise` in skills/route.
   */
  focus?: ReadonlyMap<string, 'here' | 'near' | 'dim'>;
}

export function SkillTree({
  graph,
  selectedId,
  onSelect,
  empty,
  geom = GEOM,
  renderNode,
  fit = false,
  focus,
}: SkillTreeProps) {
  const layout = useMemo(() => layoutGraph(graph, geom), [graph, geom]);
  const scroller = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(ZOOM.start);
  const [full, setFull] = useState(false);
  const [dragging, setDragging] = useState(false);

  /**
   * Open a tree at a scale that fits its width.
   *
   * A lattice of twenty-five nodes is wider than any panel it shares a row
   * with, and arriving on a tree cut off at the right edge reads as breakage
   * rather than as something to scroll. So the first paint of each graph picks
   * the scale that brings the whole width into view — never magnifying, only
   * ever shrinking, and never below the zoom floor.
   *
   * Keyed on the graph so it re-fits when you walk into another tree, and it is
   * a *starting* value, not a constraint: the zoom controls and the wheel
   * override it immediately and are never fought.
   *
   * `clientWidth` read once in a layout effect rather than a ResizeObserver.
   * The observer does not fire in a tab that is not being rendered, which is
   * exactly when a mis-fit would be baked in; a direct read after layout always
   * has a real number.
   */
  useLayoutEffect(() => {
    if (!fit || layout.width === 0) return;
    // Measured after the browser has settled the surrounding grid, not during
    // this render. The canvas shares its row with a fixed-width panel, and read
    // synchronously here the box is briefly its full width — which fitted the
    // tree to a canvas 225px wider than the one it ended up in, and left every
    // large tree overflowing by exactly that much. Two frames: one for the
    // layout to land, one to be sure of it.
    const measure = () => {
      const box = scroller.current;
      if (!box) return;
      const room = box.clientWidth - 8;
      if (room <= 0) return;
      setScale(clampZoom(Math.min(ZOOM.start, room / layout.width)));
      box.scrollTo({ top: 0, left: 0 });
    };
    // Timers rather than requestAnimationFrame: a frame callback does not run
    // at all in a tab the browser is not currently rendering, so the fit would
    // silently never happen there and the tree would open overflowing. Timers
    // fire regardless, and reading `clientWidth` forces the layout we need.
    // Twice, because the stylesheet can land after the first paint — the second
    // pass is what catches a canvas that was briefly full width.
    const soon = window.setTimeout(measure, 0);
    const later = window.setTimeout(measure, 220);
    return () => {
      window.clearTimeout(soon);
      window.clearTimeout(later);
    };
  }, [fit, layout.width, graph.id]);


  /**
   * Change scale while holding the content point at (ax, ay) — viewport px.
   * Omit the anchor and the middle of the viewport is used.
   *
   * `next` is a function of the current scale rather than a number, and that is
   * not a style choice: the buttons read `scale` from the render they were
   * drawn in, so two clicks inside one frame both computed from the same
   * starting value and the second quietly did nothing. Resolving inside the
   * updater means every call starts from whatever the last one left.
   */
  const zoomTo = useCallback((next: (current: number) => number, ax?: number, ay?: number) => {
    const box = scroller.current;
    setScale((current) => {
      const wanted = clampZoom(next(current));
      if (!box || wanted === current) return wanted;
      const px = ax ?? box.clientWidth / 2;
      const py = ay ?? box.clientHeight / 2;
      const cx = (box.scrollLeft + px) / current;
      const cy = (box.scrollTop + py) / current;
      // After React has painted the new size, put the same content point back
      // under the same pixel. Queued rather than set now: the scrollable area
      // is still the old size until the render lands, and a scroll offset past
      // the old maximum would be clamped away.
      requestAnimationFrame(() => {
        box.scrollLeft = cx * wanted - px;
        box.scrollTop = cy * wanted - py;
      });
      return wanted;
    });
  }, []);

  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = box.getBoundingClientRect();
      // deltaY is in whatever unit the device reports; only its sign and rough
      // size matter, and the divisor is what makes a pinch feel like a pinch.
      zoomTo(
        (current) => current * (1 - event.deltaY / 320),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [zoomTo]);

  // ---- drag to pan --------------------------------------------------------
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const box = scroller.current;
    // Only the background drags. A pointerdown that started on something
    // clickable is that thing's click, and stealing it does not merely make the
    // click need a steady hand — `setPointerCapture` below moves every
    // subsequent pointer event to the scroller, so the button never sees the
    // pointerup and no click is ever dispatched at all.
    //
    // Matched on the elements rather than on a class list, which is what this
    // was and what broke: it named `.stx-node`, so when the lattice arrived
    // with tiles called `.stx-tile` every one of them became un-clickable. Both
    // are buttons, as is anything else worth putting on a canvas, so ask that
    // question instead and a third kind of node cannot reintroduce this.
    if (
      !box ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest('button, a, input, select, textarea, [role="button"]')
    ) {
      return;
    }
    drag.current = { x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop };
    box.setPointerCapture(event.pointerId);
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const box = scroller.current;
    const from = drag.current;
    if (!box || !from) return;
    box.scrollLeft = from.left - (event.clientX - from.x);
    box.scrollTop = from.top - (event.clientY - from.y);
  }, []);

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    scroller.current?.releasePointerCapture(event.pointerId);
  }, []);

  // Escape leaves the expanded canvas. The button is still there, but a layer
  // covering the window with no keyboard way out is a trap.
  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFull(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [full]);

  /** Every path touching the selection, so the run comes forward together. */
  const lit = useMemo(() => {
    if (!selectedId) return new Set<string>();
    return new Set(
      layout.edges
        .filter((edge) => edge.from === selectedId || edge.to === selectedId)
        .map((edge) => edge.id),
    );
  }, [layout.edges, selectedId]);

  /* Faded by the focus layer: either end dimmed. Kept apart from `lit`, which
     is about the selection and stays true whether or not a layer is on. */
  const faded = useMemo(() => {
    if (!focus) return new Set<string>();
    return new Set(
      layout.edges
        .filter((edge) => focus.get(edge.from) === 'dim' || focus.get(edge.to) === 'dim')
        .map((edge) => edge.id),
    );
  }, [focus, layout.edges]);

  const bare = layout.nodes.length === 0;

  /**
   * The drawing at its current scale — and, below, how it is centred without
   * anything measuring anything.
   *
   * A drawing narrower than its box used to sit against the left edge with the
   * field empty beside it, which reads as a page that failed to fill rather
   * than as a tree. The fix is two lines of arithmetic the browser does for us:
   * the stage takes `max(drawn, 100%)`, so it is never narrower than the scroll
   * box, and the scaled layer is pushed to `left: 50%` and pulled back by half
   * its own drawn width. When the stage is the box, that centres the drawing in
   * it; when the stage is the drawing — anything wider than the box — the two
   * halves cancel to zero and it sits flush left, which is what a canvas you
   * pan around wants. No ResizeObserver, so it is also right on the first paint
   * and inside a tab that is not currently being rendered.
   */
  const drawnWidth = layout.width * scale;
  const drawnHeight = layout.height * scale;

  return (
    <section className={`stx-canvas${full ? ' is-full' : ''}`}>
      <div
        ref={scroller}
        className={`stx-scroll${dragging ? ' is-dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {bare ? (
          <div className="stx-canvas-empty">{empty}</div>
        ) : (
          <div
            className="stx-stage"
            style={{ width: `max(${drawnWidth}px, 100%)`, height: drawnHeight }}
          >
            <div
              className="stx-scaled"
              style={{
                width: layout.width,
                height: layout.height,
                left: '50%',
                marginLeft: -drawnWidth / 2,
                transform: `scale(${scale})`,
                // @ts-expect-error -- a custom property, which React types as
                // unknown on CSSProperties but passes straight through.
                '--stx-node-w': `${geom.nodeW}px`,
                '--stx-node-h': `${geom.nodeH}px`,
              }}
            >
              <svg
                className="stx-wires"
                width={layout.width}
                height={layout.height}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                aria-hidden="true"
              >
                {layout.edges.map((edge) => (
                  <SkillConnection
                    key={edge.id}
                    edge={edge}
                    lit={lit.has(edge.id)}
                    faded={faded.has(edge.id)}
                  />
                ))}
              </svg>

              {layout.nodes.map((placed) =>
                renderNode ? (
                  <div key={placed.node.id}>
                    {renderNode(placed, {
                      selected: selectedId === placed.node.id,
                      onSelect,
                    })}
                  </div>
                ) : (
                  <SkillNode
                    key={placed.node.id}
                    node={placed.node}
                    x={placed.x}
                    y={placed.y}
                    selected={selectedId === placed.node.id}
                    onSelect={onSelect}
                  />
                ),
              )}
            </div>
          </div>
        )}
      </div>

      <div className="stx-zoom" role="group" aria-label="Canvas">
        <button
          type="button"
          aria-label="Zoom in"
          disabled={scale >= ZOOM.max}
          onClick={() => zoomTo((current) => current + ZOOM.step)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
            <path d="M12 6v12M6 12h12" />
          </svg>
        </button>
        <span className="stx-zoom-read">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          aria-label="Zoom out"
          disabled={scale <= ZOOM.min}
          onClick={() => zoomTo((current) => current - ZOOM.step)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
            <path d="M6 12h12" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Reset the view"
          onClick={() => {
            zoomTo(() => ZOOM.start);
            requestAnimationFrame(() => scroller.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' }));
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 11A8 8 0 1 0 12 20M20 5v6h-6" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={full ? 'Leave full screen' : 'Fill the window'}
          aria-pressed={full}
          onClick={() => setFull((value) => !value)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {full ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
          </svg>
        </button>
      </div>

      <p className="stx-hint">Drag to pan · ⌘ or Ctrl + scroll to zoom</p>
    </section>
  );
}

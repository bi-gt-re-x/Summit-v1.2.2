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
 *
 * ## Framing: a percentage is not a view
 *
 * Zoom controls answer "how magnified is this", which is never the question.
 * The question is "show me the branch I am in", "show me what I have
 * finished", "show me the whole thing" — so the canvas takes a *set of nodes*
 * and works out the scale and the scroll that bring them into view together
 * (`frameTo`). Which nodes is decided by the page, which is the only thing
 * here that knows what a branch or a mastered skill is.
 *
 * ## And a map, so panning is not a way of getting lost
 *
 * A tree several screens wide has no horizon. ./Minimap draws the layout at
 * thumbnail size with a box around what is on screen, and it is draggable —
 * see that file for why it moves its own rectangle rather than re-rendering.
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
import { Minimap } from './Minimap';
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
  /**
   * Scroll until this node is in the middle of the box.
   *
   * For the controls that select a node the reader cannot see — the next-up
   * strip, the route crumbs, later the search. Not for an ordinary click on a
   * tile: yanking the canvas because somebody pressed something already in
   * front of them is the behaviour that makes a map feel like it is fighting
   * you.
   *
   * The `token` is what makes asking twice for the same node work. Without it
   * the prop would be unchanged on the second press and the effect would not
   * run, so a reader who scrolled away and pressed the same row again would
   * get nothing. It is also what stops the canvas jumping on its own: the
   * graph object changes on every practice click, and without the token being
   * the thing that is watched, the last reveal would replay each time.
   *
   * A reveal that arrives *with a new tree* is handled by the fit below rather
   * than here, because the fit is what decides the scale the node has to be
   * centred at — and, left to fight, the fit's own "back to the top-left"
   * landed 220ms after the scroll and undid it.
   */
  reveal?: { id: string; token: number } | null;
  /**
   * Put these nodes on the screen together — the camera, asked for by name.
   *
   * The canvas works out the box they occupy, the scale that brings it into
   * view and the scroll that centres it. What it never works out is *which*
   * nodes: "the branch I am standing in", "everything I have mastered" and
   * "the whole tree" are judgements about meaning, and this file's whole
   * arrangement is that it has none. The page names the set — see `frameOn` in
   * pages/SkillTrees — and this does the arithmetic.
   *
   * Tokened like `reveal`, and for the same two reasons: asking for the same
   * frame twice must work, and the layout is rebuilt on every practice click.
   */
  frame?: { ids: readonly string[]; token: number } | null;
  /**
   * The feed's own view buttons, placed in the canvas's control cluster.
   *
   * A slot rather than a list of framings, because the alternative is this
   * file learning the words "branch" and "mastered" — and every camera control
   * living in one cluster is worth more than the purity of refusing the feed a
   * button. What lands here is drawn by the caller and understood by the
   * caller; this only says where it goes.
   */
  views?: React.ReactNode;
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
  reveal,
  frame,
  views,
}: SkillTreeProps) {
  const layout = useMemo(() => layoutGraph(graph, geom), [graph, geom]);
  const scroller = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(ZOOM.start);
  const [full, setFull] = useState(false);
  const [dragging, setDragging] = useState(false);

  /* The reveal the fit is allowed to read. A ref rather than a dependency
     because the fit runs on a *timer*, so by the time it fires every effect of
     that commit has flushed and this holds the current value — which is what
     lets one pass do both jobs for a tree opened at a node. */
  const wanted = useRef(reveal);
  useEffect(() => {
    wanted.current = reveal;
  });

  /**
   * Bring a node into the middle of the box, at a given scale.
   *
   * The arithmetic is the layout's own coordinates times the scale, against
   * the scroller's client box — which works precisely because the canvas is a
   * real scrolling element rather than a transform matrix, and is one of the
   * things the note at the top of this file is about.
   *
   * The scaled layer is centred inside the stage — `left: 50%` and a negative
   * margin below — so on a drawing narrower than the box there is slack on
   * both sides that the node's own coordinate knows nothing about. That slack
   * is `(box - drawing) / 2`, worked out from numbers we already hold rather
   * than read off `scrollWidth`: this is called during a scale change, when
   * the DOM still has the old size and reading it would place the node with
   * last frame's arithmetic.
   */
  const centreAt = useCallback(
    (cx: number, cy: number, at: number, behavior: ScrollBehavior) => {
      const box = scroller.current;
      if (!box) return;
      const slack = Math.max(0, (box.clientWidth - layout.width * at) / 2);
      box.scrollTo({
        left: Math.max(0, slack + cx * at - box.clientWidth / 2),
        top: Math.max(0, cy * at - box.clientHeight / 2),
        behavior,
      });
    },
    [layout.width],
  );

  /** The same, for a node: its middle rather than its corner. */
  const centreOn = useCallback(
    (placed: PlacedNode, at: number, behavior: ScrollBehavior) =>
      centreAt(placed.x + geom.nodeW / 2, placed.y + geom.nodeH / 2, at, behavior),
    [centreAt, geom.nodeH, geom.nodeW],
  );

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
      const next = clampZoom(Math.min(ZOOM.start, room / layout.width));
      setScale(next);

      /* Where a tree was opened *at* a node — the search, a focus card — the
         top-left is the wrong place to land: the reader named a node and the
         canvas would be showing them the root of a lattice they did not ask
         about. So the fit ends on that node instead, at the scale it has just
         chosen.

         One more timer, because `setScale` has not been applied yet and the
         scroll range is still the old drawing's: an offset past the old
         maximum is clamped away and the node lands half off the screen. */
      const placed = wanted.current
        ? layout.nodes.find((one) => one.node.id === wanted.current?.id)
        : undefined;
      if (!placed) {
        box.scrollTo({ top: 0, left: 0 });
        return;
      }
      window.setTimeout(() => centreOn(placed, next, 'auto'), 0);
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
    // `centreOn` and `layout.nodes` are deliberately not dependencies: this
    // pass belongs to *arriving* at a graph, and re-running it because a
    // practice click rebuilt the layout would re-fit a tree the reader had
    // zoomed. It reads whatever the current ones are when the timer fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /* Scroll to a node the reader asked for from somewhere off the canvas.
   *
   * `smooth`, because they pressed something on a strip and need to see where
   * the canvas went; an instant jump reads as a different screen.
   *
   * Each token is acted on once. The effect has to watch the layout — a tree
   * opened at a node has a layout that arrives in the same render as the
   * request — but the layout is rebuilt on every practice click too, and
   * without the guard the canvas would silently scroll back to the last
   * revealed node each time somebody pressed Practice. Marked handled only
   * where the node was actually found, so a request that arrives a beat before
   * its tree still lands. */
  const done = useRef(0);
  const revealToken = reveal?.token;
  const revealId = reveal?.id;
  useEffect(() => {
    if (!revealId || !revealToken || revealToken === done.current) return;
    const placed = layout.nodes.find((one) => one.node.id === revealId);
    if (!placed) return;
    done.current = revealToken;
    centreOn(placed, scale, 'smooth');
  }, [centreOn, layout.nodes, revealId, revealToken, scale]);

  /**
   * Fit a set of nodes into the box: the camera move behind every framing
   * control, and behind "Fit" itself, which is this over the whole tree.
   *
   * The scale is whichever of the two directions runs out of room first,
   * never magnified past 100% — a branch of three tiles blown up to 160% is a
   * canvas that has lost its context — and never below the zoom floor, where
   * the tiles stop being legible and the frame stops being worth having.
   *
   * The scroll is queued behind the scale for the reason the fit gives: the
   * scrollable area is still the old drawing's size until React has painted
   * the new one, and an offset past the old maximum is clamped away.
   */
  const frameTo = useCallback(
    (ids: readonly string[]) => {
      const box = scroller.current;
      if (!box) return;
      const want = new Set(ids);
      const rows = layout.nodes.filter((one) => want.has(one.node.id));
      if (rows.length === 0) return;

      const left = Math.min(...rows.map((one) => one.x));
      const top = Math.min(...rows.map((one) => one.y));
      const right = Math.max(...rows.map((one) => one.x)) + geom.nodeW;
      // The label and the percentage hang below the tile, so the bottom of a
      // node is not the bottom of what a reader sees as the node.
      const bottom = Math.max(...rows.map((one) => one.y)) + geom.nodeH + geom.rowGap / 2;

      const next = clampZoom(
        Math.min(
          ZOOM.start,
          (box.clientWidth - geom.pad) / Math.max(1, right - left),
          (box.clientHeight - geom.pad) / Math.max(1, bottom - top),
        ),
      );
      setScale(next);
      window.setTimeout(
        () => centreAt((left + right) / 2, (top + bottom) / 2, next, 'smooth'),
        0,
      );
    },
    [centreAt, geom.nodeH, geom.nodeW, geom.pad, geom.rowGap, layout.nodes],
  );

  /** The whole drawing, which is what the canvas's own "Fit" button means. */
  const fitAll = useCallback(
    () => frameTo(layout.nodes.map((one) => one.node.id)),
    [frameTo, layout.nodes],
  );

  /* The framing the page has asked for. Acted on once per token, exactly as
     the reveal above is, so a practice click cannot replay the last one. */
  const shown = useRef(0);
  const frameToken = frame?.token;
  const frameIds = frame?.ids;
  useEffect(() => {
    if (!frameToken || !frameIds || frameToken === shown.current) return;
    shown.current = frameToken;
    frameTo(frameIds);
  }, [frameIds, frameTo, frameToken]);

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

      {/* The map, on anything big enough to get lost in.
          The threshold is a node count rather than "is the drawing wider than
          the box", which would be truer and would also mean measuring on
          every resize and zoom to decide whether a control exists — a control
          that comes and goes as you pinch is worse than one that is sometimes
          unnecessary. Sixteen tiles is about where a lattice stops fitting a
          laptop canvas at full size. */}
      {!bare && layout.nodes.length > 16 && (
        <Minimap
          layout={layout}
          scale={scale}
          geom={geom}
          box={scroller}
          selectedId={selectedId}
          onJump={(cx, cy) => centreAt(cx, cy, scale, 'auto')}
        />
      )}

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
        {/* Two named views in place of the reset arrow that used to sit here.
            "Reset" meant 100% at the top-left corner, which is a statement
            about the scroll box rather than about the tree — and on anything
            larger than a screen it put the reader back where they could see
            least. A percentage is the same problem: it says how magnified the
            drawing is and never what is in front of you. These say what you
            will be looking at. */}
        <i className="stx-zoom-cut" aria-hidden="true" />
        <button type="button" className="stx-zoom-view" title="Fit the whole tree" onClick={fitAll}>
          Fit
        </button>
        {views}
        <button
          type="button"
          className="stx-zoom-view"
          title="Back to full size"
          /* Full size about the middle of the viewport rather than about the
             origin, so the tile you were reading is the tile still in front of
             you. `zoomTo` holds the centre point for us. */
          onClick={() => zoomTo(() => ZOOM.start)}
        >
          1:1
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

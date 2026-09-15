/**
 * The whole lattice at thumbnail size, with a box around what you can see.
 *
 * ## What it is for
 *
 * A large tree is several screens wide and most of it is off the edge at any
 * moment. Panning is how you look at the rest, and panning is also how you get
 * lost: there is no horizon on an infinite grey field. The map answers the two
 * questions that follow from that — *how much more is there* and *where am I
 * in it* — and answers the third, *take me there*, by being draggable.
 *
 * ## It does not re-render while you scroll
 *
 * The obvious build holds the scroll offset in React state. That means a
 * re-render of the canvas and all ninety of its tiles on every scroll event,
 * which is how a smooth trackpad pan turns into a stutter.
 *
 * So the viewport rectangle is moved **imperatively**: one listener on the
 * scrolling box, one `requestAnimationFrame`, and a style written straight
 * onto the rect. Nothing above it renders. That is the one place in this
 * component tree where the DOM is touched by hand, and it is worth it here for
 * exactly the reason the canvas scrolls natively in the first place — see the
 * note at the top of ./SkillTree.
 *
 * ## The drawing is the graph, not a picture of it
 *
 * One `<rect>` per node, coloured by status, at the layout's own coordinates
 * through a `viewBox`. So the map cannot drift from the canvas: it is the same
 * placement arithmetic, drawn smaller. Edges are left out — at this size sixty
 * curves are a grey smudge that hides the very thing the map is for.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { GraphLayout, Geometry } from '@/utils/skillGraph';

export interface MinimapProps {
  layout: GraphLayout;
  /** The canvas's current scale, which decides how much of it is on screen. */
  scale: number;
  geom: Geometry;
  /** The scrolling box this is a picture of. */
  box: React.RefObject<HTMLDivElement | null>;
  selectedId: string | null;
  /** Put this content point in the middle of the canvas. */
  onJump: (cx: number, cy: number) => void;
}

/** The room the thumbnail is fitted into. The drawing keeps its own shape. */
const ROOM = { w: 148, h: 116 };

export function Minimap({ layout, scale, geom, box, selectedId, onJump }: MinimapProps) {
  const rect = useRef<SVGRectElement>(null);
  const face = useRef<SVGSVGElement>(null);

  const k = Math.min(ROOM.w / layout.width, ROOM.h / layout.height);
  const w = Math.round(layout.width * k);
  const h = Math.round(layout.height * k);

  /* Where the viewport sits, in the layout's own coordinates.
   *
   * The scaled layer is centred inside the stage, so on a drawing narrower
   * than the box there is slack down each side that the content coordinates
   * know nothing about — the same arithmetic `centreAt` in ./SkillTree does,
   * and it has to be the same or the box would sit a few tiles off. */
  const draw = useCallback(() => {
    const scroller = box.current;
    const mark = rect.current;
    if (!scroller || !mark) return;
    const slack = Math.max(0, (scroller.clientWidth - layout.width * scale) / 2);
    mark.setAttribute('x', String(Math.max(0, (scroller.scrollLeft - slack) / scale)));
    mark.setAttribute('y', String(scroller.scrollTop / scale));
    mark.setAttribute('width', String(Math.min(layout.width, scroller.clientWidth / scale)));
    mark.setAttribute('height', String(Math.min(layout.height, scroller.clientHeight / scale)));
  }, [box, layout.height, layout.width, scale]);

  useEffect(() => {
    const scroller = box.current;
    if (!scroller) return;
    // Coalesced to one write per frame: a trackpad fires scroll events faster
    // than the screen refreshes, and every one of them would otherwise be a
    // layout read and a write.
    let queued = 0;
    const onScroll = () => {
      if (queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        draw();
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    // And once now, for the zoom and tree changes that move the viewport
    // without anybody scrolling.
    draw();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (queued) cancelAnimationFrame(queued);
    };
  }, [box, draw]);

  /** A point on the thumbnail, in the layout's coordinates. */
  const at = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = face.current;
    if (!svg) return null;
    const bounds = svg.getBoundingClientRect();
    return {
      cx: ((event.clientX - bounds.left) / bounds.width) * layout.width,
      cy: ((event.clientY - bounds.top) / bounds.height) * layout.height,
    };
  };

  /* Press to jump, and keep pressing to pan. One handler for both: a drag is
     a jump that has not let go, and treating them separately would mean the
     map moved on release rather than under the finger. */
  const drag = useRef(false);
  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const point = at(event);
    if (point) onJump(point.cx, point.cy);
  };

  return (
    <div className="stx-mini" aria-hidden="true">
      <svg
        ref={face}
        className="stx-mini-face"
        width={w}
        height={h}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="none"
        onPointerDown={(event) => {
          drag.current = true;
          // The jump first, the capture second: capture is what makes the
          // *drag* work, and a press that landed somewhere should land there
          // whether or not the pointer is ever captured.
          const point = at(event);
          if (point) onJump(point.cx, point.cy);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={(event) => {
          drag.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = false;
        }}
      >
        {layout.nodes.map((placed) => (
          <rect
            key={placed.node.id}
            className={`stx-mini-node is-${placed.node.status}${
              placed.node.id === selectedId ? ' is-selected' : ''
            }`}
            x={placed.x}
            y={placed.y}
            width={geom.nodeW}
            height={geom.nodeH}
            /* In layout units, so it survives the viewBox: a 1px radius here
               would be invisible at a scale of a twentieth. */
            rx={geom.nodeW * 0.22}
          />
        ))}
        {/* Last, so it is over the tiles rather than under them. */}
        <rect ref={rect} className="stx-mini-view" x={0} y={0} width={0} height={0} />
      </svg>
    </div>
  );
}

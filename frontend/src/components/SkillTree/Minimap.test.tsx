/**
 * The map, and the two things it has to get right.
 *
 * It is a picture of the layout, so it must draw the layout — one mark per
 * node, in the state that node is in, at the layout's own coordinates. A map
 * that quietly drew something else would be worse than no map, because it
 * would still look like one.
 *
 * And pressing it must land where it was pressed. That arithmetic goes from a
 * click in screen pixels to a point in layout units to a scroll offset, and
 * every step of it is an opportunity to be off by a factor of the scale — the
 * kind of mistake that looks like "the map is a bit wrong" and is actually a
 * missing division.
 *
 * jsdom has no layout, so the two rectangles the arithmetic reads are stubbed
 * below rather than measured. That is the honest shape of this test: the
 * geometry is the thing under test and the measurements are the inputs.
 */
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { Minimap } from './Minimap';
import { LATTICE_GEOM, layoutGraph, type GraphNode, type NodeStatus, type SkillGraph } from '@/utils/skillGraph';

/* jsdom implements no pointer capture. Stubbed in the suite rather than
   guarded in the component, for the reason ./SubjectRail.test gives about
   `scrollIntoView`. */
beforeAll(() => {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

function node(id: string, status: NodeStatus, requires: string[] = []): GraphNode {
  return {
    id,
    name: id,
    blurb: '',
    category: 'Maths',
    difficulty: 'beginner',
    status,
    percent: status === 'complete' ? 100 : 0,
    xp: 0,
    have: 0,
    need: 0,
    unit: 'XP',
    on: '',
    requires,
    gate: '',
  };
}

const GRAPH: SkillGraph = {
  id: 'mathematics',
  name: 'Mathematics',
  nodes: [
    node('arith', 'complete'),
    node('fractions', 'progress', ['arith']),
    node('negatives', 'available', ['arith']),
    node('algebra', 'locked', ['fractions', 'negatives']),
  ],
};

const LAYOUT = layoutGraph(GRAPH, LATTICE_GEOM);

/** A scrolling box of a plausible size, since jsdom's is 0×0. */
function boxRef(over: Partial<Record<'clientWidth' | 'clientHeight' | 'scrollLeft' | 'scrollTop', number>> = {}) {
  const ref = createRef<HTMLDivElement>();
  const box = document.createElement('div');
  const sizes = { clientWidth: 600, clientHeight: 400, scrollLeft: 0, scrollTop: 0, ...over };
  for (const [key, value] of Object.entries(sizes)) {
    Object.defineProperty(box, key, { value, configurable: true });
  }
  /* Written by hand, which is the point: the component is handed the canvas's
     own scroller, and there is no canvas here. */
  ref.current = box;
  return ref;
}

function draw(over: Partial<React.ComponentProps<typeof Minimap>> = {}) {
  const onJump = vi.fn();
  render(
    <Minimap
      layout={LAYOUT}
      scale={1}
      geom={LATTICE_GEOM}
      box={boxRef()}
      selectedId={null}
      onJump={onJump}
      {...over}
    />,
  );
  return { onJump };
}

describe('the minimap', () => {
  it('draws every node in the state it is in', () => {
    draw();
    const marks = document.querySelectorAll('.stx-mini-node');
    expect(marks).toHaveLength(GRAPH.nodes.length);
    expect(document.querySelectorAll('.stx-mini-node.is-complete')).toHaveLength(1);
    expect(document.querySelectorAll('.stx-mini-node.is-progress')).toHaveLength(1);
    expect(document.querySelectorAll('.stx-mini-node.is-available')).toHaveLength(1);
    expect(document.querySelectorAll('.stx-mini-node.is-locked')).toHaveLength(1);
  });

  it('marks the selection', () => {
    draw({ selectedId: 'algebra' });
    expect(document.querySelectorAll('.stx-mini-node.is-selected')).toHaveLength(1);
  });

  it('puts the viewport box where the canvas is scrolled to', () => {
    // Scrolled a hundred down, at half scale: two hundred layout units.
    draw({ scale: 0.5, box: boxRef({ scrollTop: 100, scrollLeft: 0 }) });
    const view = document.querySelector('.stx-mini-view')!;
    expect(view.getAttribute('y')).toBe('200');
    /* Eight hundred units of canvas are on screen and the tree is shorter than
       that, so the box is the whole tree rather than a rectangle hanging off
       the bottom of the map claiming there is more down there. */
    expect(Number(view.getAttribute('height'))).toBe(LAYOUT.height);
  });

  it('jumps to the point that was pressed, in layout units', () => {
    const { onJump } = draw();
    const face = document.querySelector('.stx-mini-face') as SVGSVGElement;
    // The thumbnail, as the browser would have measured it.
    vi.spyOn(face, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 100, height: 80, right: 100, bottom: 80, x: 0, y: 0,
      toJSON: () => '',
    });

    // A quarter across and half down the thumbnail is the same fraction of
    // the drawing — that is the whole claim.
    face.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 25, clientY: 40, bubbles: true }),
    );

    expect(onJump).toHaveBeenCalledWith(LAYOUT.width * 0.25, LAYOUT.height * 0.5);
  });

  it('is a picture of the layout, not of its own idea of one', () => {
    draw();
    const first = document.querySelector('.stx-mini-node')!;
    const placed = LAYOUT.nodes[0]!;
    expect(first.getAttribute('x')).toBe(String(placed.x));
    expect(first.getAttribute('width')).toBe(String(LATTICE_GEOM.nodeW));
    expect(screen.queryByRole('img')).toBeNull();
  });
});

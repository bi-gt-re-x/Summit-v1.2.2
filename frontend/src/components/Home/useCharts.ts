/**
 * The charts draw themselves — the port of home-charts.js.
 *
 * Every chart on the page is SVG that is already in the markup. Nothing here
 * invents data; it measures what is there and animates it into place:
 *
 *   line charts   the grid fades, then each grid line draws left to right,
 *                 then the line draws itself across, then the points pop in
 *                 along it, then the area underneath fades up
 *   bar charts    bars grow from nothing on a curve that overshoots slightly
 *                 and settles, one after another
 *
 * Two things are measured rather than written down. Dash lengths come from
 * getTotalLength(), so editing a chart's `d` never leaves the animation drawing
 * the wrong amount. And the points are placed with getPointAtLength() at even
 * intervals along the real path, so they sit on the line by construction
 * instead of by a second list of coordinates that could drift out of step.
 *
 * That measuring is why this is a hook over the rendered page rather than a
 * chart component per chart: the numbers only exist once the SVG is laid out,
 * and they change when the Daily/Weekly tabs swap the path — which is what the
 * MutationObserver below is watching for. The dots it adds are the only nodes
 * on this page React does not own; they are added and removed by the same
 * effect, inside SVGs whose JSX children never change.
 *
 * Hovering a point enlarges it, floats a tooltip above it and thickens the
 * line; hovering a bar lifts it and floats its value. Both are real pointer
 * interactions, not part of the timeline.
 */
import { useEffect, type RefObject } from 'react';
import { onView, reduced, timeline, type Timeline } from '@/utils/homePlay';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Everything one chart set up, so the effect can take all of it back. */
type Teardown = () => void;

export function useCharts(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const host = root.current;
    if (!host) return;

    const undo: Teardown[] = [];

    host
      .querySelectorAll<SVGSVGElement>('.lp-area-lg')
      .forEach((svg) => undo.push(setupLine(svg, 7, labelsFor(svg))));
    host
      .querySelectorAll<SVGSVGElement>('.lp-chart-sm .lp-spark, .lp-metric > .lp-spark')
      .forEach((svg) => undo.push(setupLine(svg, 5, null)));
    host
      .querySelectorAll<SVGSVGElement>('.lp-bars-sm')
      .forEach((svg) => undo.push(setupBars(svg)));

    return () => undo.forEach((fn) => fn());
  }, [root]);
}

/** The x-axis labels already under the chart, reused for the tooltips. */
function labelsFor(svg: SVGSVGElement): string[] | null {
  const chart = svg.closest('.lp-perf-main');
  const row = chart?.querySelector('.lp-chart-x');
  if (!row) return null;
  return Array.from(row.children).map((el) => el.textContent?.trim() ?? '');
}

// --------------------------------------------------------------------------
// Line charts
// --------------------------------------------------------------------------
function setupLine(
  svg: SVGSVGElement,
  count: number,
  labels: string[] | null,
): Teardown {
  const line = svg.querySelector<SVGGeometryElement>('path[fill="none"], polyline');
  if (!line) return () => {};

  const area = svg.querySelector('path[fill^="url"]');
  const grid = Array.from(svg.querySelectorAll<SVGElement>('.lp-grid'));
  const host = (svg.closest('.lp-chart') ?? svg.parentElement) as HTMLElement | null;
  if (!host) return () => {};

  let length = 0;
  try {
    length = line.getTotalLength();
  } catch {
    return () => {};
  }

  line.classList.add('ch-line');
  line.style.strokeDasharray = String(length);
  area?.classList.add('ch-area');
  grid.forEach((g) => g.classList.add('ch-grid-line'));

  // Points, evenly spaced along the real path.
  const dots: SVGCircleElement[] = [];
  for (let i = 0; i < count; i++) {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('r', '4.5');
    dot.setAttribute('fill', 'currentColor');
    dot.setAttribute('class', 'ch-dot');
    svg.appendChild(dot);
    dots.push(dot);
  }

  function placeDots() {
    dots.forEach((dot, i) => {
      const at = line!.getPointAtLength(length * (i / (dots.length - 1)));
      dot.setAttribute('cx', String(at.x));
      dot.setAttribute('cy', String(at.y));
    });
  }
  placeDots();

  /* The Daily/Weekly tabs rewrite the path. Re-measure when they do, or the
   * dash would be cut for a shape that no longer exists and the points would
   * sit off the new line. */
  const watcher = new MutationObserver(() => {
    let next = 0;
    try {
      next = line.getTotalLength();
    } catch {
      return;
    }
    if (!next || Math.abs(next - length) < 0.5) return;
    length = next;
    line.style.strokeDasharray = String(length);
    line.style.strokeDashoffset = svg.classList.contains('ch-armed')
      ? String(length)
      : '0';
    placeDots();
  });
  watcher.observe(line, { attributes: true, attributeFilter: ['d', 'points'] });

  let tip: HTMLSpanElement | null = null;
  if (labels) {
    tip = document.createElement('span');
    tip.className = 'ch-tip';
    host.appendChild(tip);
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  }

  let tl: Timeline | null = null;

  function reset() {
    tl?.cancel();
    svg.classList.add('ch-armed');
    line!.style.strokeDashoffset = String(length);
    grid.forEach((g) => (g.style.transitionDelay = ''));
    dots.forEach((d) => (d.style.transitionDelay = ''));
    tip?.classList.remove('is-on');
  }

  function play() {
    tl = timeline();
    grid.forEach((g, i) => (g.style.transitionDelay = `${i * 90}ms`));
    // The points come in behind the line as it passes them.
    dots.forEach((d, i) => (d.style.transitionDelay = `${700 + i * 90}ms`));

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        svg.classList.remove('ch-armed');
        line!.style.strokeDashoffset = '0';
      });
    });
  }

  function still() {
    svg.classList.remove('ch-armed');
    line!.style.strokeDashoffset = '0';
  }

  reset();
  const unwatch = onView(svg, { play, reset, still, threshold: 0.3 });

  // --- hover ---
  const listeners: Teardown[] = [];
  if (!reduced) {
    dots.forEach((dot, i) => {
      const enter = () => {
        dot.classList.add('is-hot');
        line.style.strokeWidth = String(lineWidth(line) + 1);
        if (!tip || !labels) return;
        const box = dot.getBoundingClientRect();
        const hostBox = host.getBoundingClientRect();
        tip.textContent = `${labels[i] ?? ''} · ${valueAt(svg, dot)}`;
        tip.style.left = `${box.left - hostBox.left + box.width / 2}px`;
        tip.style.top = `${box.top - hostBox.top}px`;
        tip.classList.add('is-on');
      };
      const leave = () => {
        dot.classList.remove('is-hot');
        line.style.strokeWidth = '';
        tip?.classList.remove('is-on');
      };
      dot.addEventListener('pointerenter', enter);
      dot.addEventListener('pointerleave', leave);
      listeners.push(() => {
        dot.removeEventListener('pointerenter', enter);
        dot.removeEventListener('pointerleave', leave);
      });
    });
  }

  return () => {
    tl?.cancel();
    watcher.disconnect();
    unwatch();
    listeners.forEach((fn) => fn());
    dots.forEach((dot) => dot.remove());
    tip?.remove();
  };
}

function lineWidth(line: SVGGeometryElement): number {
  return parseFloat(getComputedStyle(line).strokeWidth) || 3;
}

/**
 * The chart's own y-axis labels say what the top and bottom of the box mean, so
 * a point's height can be read back as a number rather than invented. Falls
 * back to a percentage of the box when there are none.
 */
function valueAt(svg: SVGSVGElement, dot: SVGCircleElement): string {
  const chart = svg.closest('.lp-chart');
  const axis = chart?.querySelector('.lp-chart-y');
  const box = svg.viewBox.baseVal;
  const y = parseFloat(dot.getAttribute('cy') ?? '0');
  const fraction = 1 - (y - box.y) / box.height;

  if (axis && axis.children.length >= 2) {
    const top = parseFloat(axis.children[0]?.textContent ?? '');
    const bottom = parseFloat(
      axis.children[axis.children.length - 1]?.textContent ?? '',
    );
    if (!isNaN(top) && !isNaN(bottom)) {
      return String(Math.round(bottom + (top - bottom) * fraction));
    }
  }
  return `${Math.round(fraction * 100)}%`;
}

// --------------------------------------------------------------------------
// Bar charts
// --------------------------------------------------------------------------
function setupBars(svg: SVGSVGElement): Teardown {
  const bars = Array.from(svg.querySelectorAll<SVGRectElement>('rect'));
  if (!bars.length) return () => {};

  const host = svg.parentElement as HTMLElement | null;
  if (!host) return () => {};
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  const tip = document.createElement('span');
  tip.className = 'ch-tip';
  host.appendChild(tip);

  // The heights stay in the markup; only a scale is animated. Each bar's own
  // height is kept for the hover readout.
  const heights = bars.map((bar) => {
    bar.classList.add('ch-bar');
    return parseFloat(bar.getAttribute('height') ?? '0');
  });
  const box = svg.viewBox.baseVal;

  function reset() {
    svg.classList.add('ch-armed');
    bars.forEach((bar) => (bar.style.transitionDelay = ''));
  }

  function play() {
    // One after another, on a curve that overshoots and settles.
    bars.forEach((bar, i) => (bar.style.transitionDelay = `${i * 70}ms`));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => svg.classList.remove('ch-armed'));
    });
  }

  function still() {
    svg.classList.remove('ch-armed');
  }

  reset();
  const unwatch = onView(svg, { play, reset, still, threshold: 0.4 });

  const listeners: Teardown[] = [];
  if (!reduced) {
    bars.forEach((bar, i) => {
      const enter = () => {
        bar.classList.add('is-hot');
        const b = bar.getBoundingClientRect();
        const h = host.getBoundingClientRect();
        // Height as a share of the plot box, read off the bar itself.
        tip.textContent = `${Math.round(((heights[i] ?? 0) / box.height) * 100)}%`;
        tip.style.left = `${b.left - h.left + b.width / 2}px`;
        tip.style.top = `${b.top - h.top}px`;
        tip.classList.add('is-on');
      };
      const leave = () => {
        bar.classList.remove('is-hot');
        tip.classList.remove('is-on');
      };
      bar.addEventListener('pointerenter', enter);
      bar.addEventListener('pointerleave', leave);
      listeners.push(() => {
        bar.removeEventListener('pointerenter', enter);
        bar.removeEventListener('pointerleave', leave);
      });
    });
  }

  return () => {
    unwatch();
    listeners.forEach((fn) => fn());
    tip.remove();
  };
}

/**
 * A chart block's arithmetic — no React. ./ChartBlock draws it and turns
 * drags into calls here.
 *
 * Bars, lines and areas share one value axis from 0 to the chart's `max`. A
 * drag reads the pointer's height on that axis and rounds it to the step the
 * scale suits, so dragging feels like turning a dial, not like nudging pixels.
 *
 * A pie has no axis: what moves is the edge between two neighbouring slices.
 * Dragging it gives one slice what the other loses, so the two always add up
 * to what they did and every other slice stays exactly as it was.
 */
import type { ChartData, ChartKind, ChartPoint } from './blocks';
import { RULES } from '@/utils/sharedRules';

const LIMITS = RULES.spaces.chart;

export const POINTS_MAX: number = LIMITS.points_max;
export const POINTS_MIN: number = LIMITS.points_min;
export const LABEL_MAX: number = LIMITS.label_max;
export const VALUE_MAX: number = LIMITS.value_max;

export const KIND_LABEL: Record<ChartKind, string> = {
  bar: 'Bar',
  line: 'Line',
  area: 'Area',
  pie: 'Pie',
  donut: 'Donut',
};

export const isRound = (kind: ChartKind): boolean => kind === 'pie' || kind === 'donut';

/** Rounding that does not leave 0.30000000000000004 behind. */
const tidy = (value: number): number => Number(value.toFixed(6));

/**
 * The step values snap to: the smallest 1, 2 or 5 (times a power of ten) that
 * splits the scale into at most a hundred. A scale of 100 steps by 1, 250 by
 * 5, 10 by 0.1.
 */
export function stepFor(max: number): number {
  if (!(max > 0)) return 1;
  const raw = max / 100;
  const power = 10 ** Math.floor(Math.log10(raw) + 1e-9);
  const nice = [1, 2, 5, 10].find((m) => m * power >= raw - 1e-9) ?? 10;
  return tidy(nice * power);
}

/** A value rounded to the step and kept between 0 and `max`. */
export function snapValue(value: number, max: number): number {
  const step = stepFor(max);
  return tidy(Math.max(0, Math.min(max, Math.round(value / step) * step)));
}

/**
 * The value at a height on the axis. `fromBottom` is how far up the plot the
 * pointer is, as a share of the plot's height (0 at the bottom, 1 at the top).
 */
export const valueAt = (fromBottom: number, max: number): number => snapValue(fromBottom * max, max);

/** Five gridlines, 0 to max. */
export const ticks = (max: number): number[] => [0, 0.25, 0.5, 0.75, 1].map((share) => tidy(share * max));

/** A number as an axis or a tooltip writes it: 1,250 / 12.5 / 2.4k. */
export function short(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${tidy(value / 1e6)}M`;
  if (abs >= 1e4) return `${tidy(Math.round(value / 100) / 10)}k`;
  return Number.isInteger(value) ? value.toLocaleString() : String(tidy(value));
}

/** The chart with one point's value set. */
export function setValue(chart: ChartData, at: number, value: number): ChartData {
  return {
    ...chart,
    points: chart.points.map((point, i) => (i === at ? { ...point, value: snapValue(value, chart.max) } : point)),
  };
}

/** A new scale. Values above it come down to it. */
export function setMax(chart: ChartData, max: number): ChartData {
  const top = Math.max(stepFor(1), Math.min(VALUE_MAX, Number.isFinite(max) && max > 0 ? max : chart.max));
  return { ...chart, max: top, points: chart.points.map((point) => ({ ...point, value: Math.min(point.value, top) })) };
}

/** One more point, half way up, named after its place. */
export function addPoint(chart: ChartData): ChartData {
  if (chart.points.length >= POINTS_MAX) return chart;
  const point: ChartPoint = { label: `Item ${chart.points.length + 1}`, value: snapValue(chart.max / 2, chart.max) };
  return { ...chart, points: [...chart.points, point] };
}

export function removePoint(chart: ChartData, at: number): ChartData {
  if (chart.points.length <= POINTS_MIN) return chart;
  return { ...chart, points: chart.points.filter((_, i) => i !== at) };
}

export function renamePoint(chart: ChartData, at: number, label: string): ChartData {
  return { ...chart, points: chart.points.map((point, i) => (i === at ? { ...point, label: label.slice(0, LABEL_MAX) } : point)) };
}

// --------------------------------------------------------------------------
// Pies
// --------------------------------------------------------------------------
/** Each slice's value, or an even share each when they are all zero. */
const sliceValues = (points: ChartPoint[]): number[] => {
  const values = points.map((point) => Math.max(0, point.value));
  return values.some((value) => value > 0) ? values : values.map(() => 1);
};

/** Where each slice starts and ends, as shares of the whole turn (0 at the top, clockwise). */
export function slices(points: ChartPoint[]): Array<{ from: number; to: number; share: number }> {
  const values = sliceValues(points);
  const total = values.reduce((sum, value) => sum + value, 0);
  let from = 0;
  return values.map((value) => {
    const share = value / total;
    const slice = { from, to: from + share, share };
    from += share;
    return slice;
  });
}

/** How far round the circle a point is, as a share of a turn from the top, clockwise. */
export function turnAt(dx: number, dy: number): number {
  const angle = Math.atan2(dx, -dy);
  return (angle < 0 ? angle + 2 * Math.PI : angle) / (2 * Math.PI);
}

/**
 * Move the edge after slice `at` to `turn`. Only that slice and the next
 * change, and the two keep their total; neither can shrink below one step.
 */
export function moveEdge(chart: ChartData, at: number, turn: number): ChartData {
  const values = sliceValues(chart.points);
  if (at < 0 || at >= values.length - 1) return chart;
  const total = values.reduce((sum, value) => sum + value, 0);
  const pair = values[at]! + values[at + 1]!;
  const step = stepFor(total);
  const before = values.slice(0, at).reduce((sum, value) => sum + value, 0);
  const wanted = turn * total - before;
  const mine = tidy(Math.max(step, Math.min(pair - step, Math.round(wanted / step) * step)));
  const points = chart.points.map((point, i) => {
    if (i === at) return { ...point, value: mine };
    if (i === at + 1) return { ...point, value: tidy(pair - mine) };
    return { ...point, value: values[i]! };
  });
  return { ...chart, points };
}

/** One step of the whole from the next slice to this one (or back, with -1). */
export function nudgeEdge(chart: ChartData, at: number, direction: 1 | -1): ChartData {
  const parts = slices(chart.points);
  const step = stepFor(sliceValues(chart.points).reduce((sum, value) => sum + value, 0));
  const total = sliceValues(chart.points).reduce((sum, value) => sum + value, 0);
  const edge = parts[at]?.to ?? 0;
  return moveEdge(chart, at, edge + (direction * step) / total);
}

/** The arc of a slice, as an SVG path, on a circle at (c, c). `inner` > 0 makes it a ring. */
export function arcPath(c: number, r: number, inner: number, from: number, to: number): string {
  const point = (turn: number, radius: number) => {
    const angle = turn * 2 * Math.PI;
    return [tidy(c + radius * Math.sin(angle)), tidy(c - radius * Math.cos(angle))] as const;
  };
  if (to - from >= 0.9999) {
    // A full circle cannot be one arc; two halves make it.
    const outer = `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r} Z`;
    return inner > 0
      ? `${outer} M ${c} ${c - inner} A ${inner} ${inner} 0 1 0 ${c} ${c + inner} A ${inner} ${inner} 0 1 0 ${c} ${c - inner} Z`
      : outer;
  }
  const large = to - from > 0.5 ? 1 : 0;
  const [x1, y1] = point(from, r);
  const [x2, y2] = point(to, r);
  if (inner <= 0) return `M ${c} ${c} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  const [x3, y3] = point(to, inner);
  const [x4, y4] = point(from, inner);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`;
}

/** A share as a whole percent. */
export const percent = (share: number): string => `${Math.round(share * 100)}%`;

/**
 * The growth line — several metrics over one period, with a readout under the
 * pointer.
 *
 * ## Why this is not `AreaChart`
 *
 * The drawing kit in ./charts is deliberately static, and says so: it is SVG
 * rather than canvas *because* nothing on the page needed a hover crosshair,
 * and the file states that a chart with wheel-zoom and a crosshair would have
 * been worth the canvas renderer that was deleted. Adding a pointer readout to
 * `AreaChart` would have put an interaction into fourteen panels that do not
 * want one, and every one of them would then be re-rendering on mousemove.
 *
 * So this is the one interactive chart, and it stays in its own file where the
 * cost is paid by the one tab that asked for it.
 *
 * ## The readout is HTML over the drawing, not inside it
 *
 * The box is `preserveAspectRatio="none"`, which is what lets every other chart
 * here resize without JavaScript — and it means anything drawn *in* the SVG is
 * stretched by whatever ratio the panel's width happens to give it. A `<text>`
 * label would come out condensed on a narrow screen and stretched on a wide
 * one, and a circle would be an ellipse.
 *
 * Everything the reader points at is therefore positioned as a percentage in an
 * HTML layer above the SVG: the rule, the dots on each line, and the tooltip.
 * Those are laid out by the browser at their natural proportions, and the only
 * thing the SVG has to get right is the paths.
 *
 * ## What a point is
 *
 * Not a day. Each point is the five metrics scored over the days *behind* it —
 * `trend_window` of them, which the caller prints — so the line is a moving
 * average and reads as "how was I doing around then". A daily reading would be
 * unusable: four of the five metrics are meaningless over a single day, and
 * consistency over one day is either 0 or 100.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { toneVar, type Tone } from './charts';

export interface LineSeries {
  key: string;
  label: string;
  tone: Tone;
  /**
   * A colour that is not one of the five, as a CSS value.
   *
   * For a series that is not a measure. The overall line is the *mean* of the
   * other four, and painting it in a sixth hue would put it in the same visual
   * class as its own terms — while borrowing one of the five would hand it a
   * colour that already means something else on this page. It gets a
   * near-neutral of its own instead, and `tone` stays as the fallback for
   * everything that is a measure.
   */
  color?: string;
  /** One value per point, 0-100. Same length as `marks`. */
  values: number[];
}

/** A moment worth marking on the line, placed at the point it happened on. */
export interface LineMark {
  /** Index into `dates`. The caller resolves the date; this only draws. */
  at: number;
  label: string;
  /** One emoji. Drawn above the rule, in the reader's own font. */
  glyph: string;
}

export interface GrowthLineProps {
  series: LineSeries[];
  /** The date under each point, ISO. Drives the x axis and the tooltip. */
  dates: string[];
  /** Formatted for the reader — "12 Aug". One per point. */
  labels: string[];
  /** Milestones, drawn as a dashed rule with a caption above it. */
  marks?: LineMark[];
  height?: number;
}

/** Scores are out of a hundred, so the axis is too. Never scaled to the data. */
const SCALE = 100;
const TICKS = ['100', '75', '50', '25', '0'];

/** The drawing's own units. The CSS decides how wide it actually is. */
const WIDTH = 600;

/** Room above and below the extremes so a line at 100 is not clipped in half. */
const PAD = 5;

function pathFor(values: number[], height: number): string {
  const steps = Math.max(1, values.length - 1);
  const inner = height - PAD * 2;
  return values
    .map((value, index) => {
      const x = (index / steps) * WIDTH;
      const y = PAD + inner - (Math.max(0, Math.min(SCALE, value)) / SCALE) * inner;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

/** The same points as zero-length subpaths, which a round cap draws as dots. */
function dotsFor(values: number[], height: number): string {
  const steps = Math.max(1, values.length - 1);
  const inner = height - PAD * 2;
  return values
    .map((value, index) => {
      const x = ((index / steps) * WIDTH).toFixed(2);
      const y = (PAD + inner - (Math.max(0, Math.min(SCALE, value)) / SCALE) * inner).toFixed(2);
      return `M${x},${y}L${x},${y}`;
    })
    .join(' ');
}

/** Where a point sits across the box, 0-1. The HTML layer's only arithmetic. */
const ratioAt = (index: number, count: number) => (count < 2 ? 0 : index / (count - 1));

/** And how high up it sits, 0-1 from the top, matching `pathFor`. */
function heightAt(value: number, height: number): number {
  const inner = height - PAD * 2;
  const y = PAD + inner - (Math.max(0, Math.min(SCALE, value)) / SCALE) * inner;
  return y / height;
}

/**
 * The milestones, ready to draw without drawing over each other.
 *
 * Every caption is 132px wide and centred on its rule, so two marks on the
 * same point — or a few points apart — printed their words on top of one
 * another: four subjects crossing a band in the same week came out as one
 * unreadable smear. Three rules stop that:
 *
 * - marks on the same point become one, its caption the first label and a
 *   count of the rest, and every label in the glyph's tooltip;
 * - a caption is only printed where it has room — a caption's width of chart
 *   (`CAPTION_PX`, measured against the chart as drawn) from
 *   the last one printed — and a crowded mark keeps its glyph and tooltip, so
 *   nothing is lost, only not written out twice on top of itself;
 * - a caption near either end is anchored to that end rather than centred, so
 *   it never hangs off the chart.
 */
export interface PlacedMark extends LineMark {
  show: boolean;
  title: string;
  edge: 'start' | 'middle' | 'end';
}

/** What a caption needs to itself, in pixels: its 132px width and a margin. */
const CAPTION_PX = 140;

/** The fallback share of the width, before the chart has been measured. */
const MIN_GAP = 0.14;

export function placeMarks(marks: LineMark[], count: number, minGap = MIN_GAP): PlacedMark[] {
  const byPoint = new Map<number, LineMark[]>();
  for (const mark of marks) {
    const list = byPoint.get(mark.at);
    if (list) list.push(mark);
    else byPoint.set(mark.at, [mark]);
  }
  let lastShown = -Infinity;
  return [...byPoint.entries()]
    .sort(([a], [b]) => a - b)
    .map(([at, group]) => {
      const first = group[0]!;
      const ratio = ratioAt(at, count);
      const show = ratio - lastShown >= minGap;
      if (show) lastShown = ratio;
      return {
        at,
        glyph: first.glyph,
        label: group.length === 1 ? first.label : `${first.label} +${group.length - 1} more`,
        title: group.map((mark) => mark.label).join('\n'),
        show,
        edge: ratio < 0.12 ? 'start' : ratio > 0.88 ? 'end' : 'middle',
      };
    });
}

export function GrowthLine({
  series,
  dates,
  labels,
  marks: milestones = [],
  height = 260,
}: GrowthLineProps) {
  const count = dates.length;
  const box = useRef<HTMLDivElement | null>(null);
  /* The chart's width as drawn, so "room for a caption" is room in pixels. A
     fixed share of the width was right on a wide screen and let two captions
     touch on a narrow one. */
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = box.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(node);
    return () => observer.disconnect();
    // Again once there is something drawn: the box only exists with points.
  }, [count > 0]);
  const placed = useMemo(
    () => placeMarks(milestones, count, width > 0 ? CAPTION_PX / width : MIN_GAP),
    [milestones, count, width],
  );
  const [at, setAt] = useState<number | null>(null);
  const gradient = useId();

  /* A handful of x-axis labels rather than one per point. Sixty dates along
     600 units is a grey smear; five is a scale. The ends are always among them
     so the reader can see what the line spans without pointing at it. */
  const marks = useMemo(() => {
    if (count === 0) return [];
    const wanted = Math.min(5, count);
    const step = (count - 1) / Math.max(1, wanted - 1);
    return Array.from({ length: wanted }, (_, n) => Math.round(n * step));
  }, [count]);

  const track = useCallback(
    (event: { clientX: number }) => {
      const rect = box.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || count === 0) return;
      const ratio = (event.clientX - rect.left) / rect.width;
      setAt(Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1)))));
    },
    [count],
  );

  if (count < 2 || series.length === 0) {
    return (
      <p className="ax-empty">
        A line needs more than one reading. This fills in as the period gets longer.
      </p>
    );
  }

  const shown = at === null ? null : at;

  return (
    <div className="ax-gp-chart" style={{ '--ax-gp-h': `${height}px` } as CSSProperties}>
      <div className="ax-gp-y" aria-hidden="true">
        {TICKS.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>

      <div className="ax-gp-plot">
        <div
          className="ax-gp-box"
          ref={box}
          onPointerMove={track}
          onPointerLeave={() => setAt(null)}
        >
          <svg
            viewBox={`0 0 ${WIDTH} ${height}`}
            preserveAspectRatio="none"
            className="ax-gp-svg"
            role="img"
            aria-label={
              `${series.map((line) => line.label).join(', ')} from ${labels[0]} to ` +
              `${labels[count - 1]}. The figures are listed under "Then and now" below.`
            }
          >
            <defs>
              {series.map((line) => (
                <linearGradient
                  key={line.key}
                  id={`${gradient}-${line.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={(line.color ?? toneVar(line.tone))} stopOpacity="0.26" />
                  <stop offset="100%" stopColor={(line.color ?? toneVar(line.tone))} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>

            {TICKS.map((_, index) => {
              const y = (index / (TICKS.length - 1)) * height;
              return (
                <line
                  key={index}
                  x1="0"
                  y1={y}
                  x2={WIDTH}
                  y2={y}
                  className="ax-gridline"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}

            {/* Filled only when one metric is showing. Five translucent washes
                over each other leave four bands belonging to nobody, and the
                reader is comparing slopes at that point rather than levels. */}
            {series.length === 1 &&
              series.map((line) => (
                <path
                  key={`${line.key}-fill`}
                  className="ax-gp-area"
                  d={`${pathFor(line.values, height)} L${WIDTH},${height} L0,${height} Z`}
                  fill={`url(#${gradient}-${line.key})`}
                />
              ))}

            {series.map((line) => (
              <g key={line.key}>
                <path
                  className={`ax-gp-line${line.key === 'overall' ? ' is-overall' : ''}`}
                  d={pathFor(line.values, height)}
                  fill="none"
                  stroke={(line.color ?? toneVar(line.tone))}
                  strokeWidth="2.25"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                {/* A dot on every reading. Zero-length round-capped subpaths
                    with a non-scaling stroke, for the reason the header gives:
                    a <circle> in a box with no fixed aspect is an ellipse of
                    whatever eccentricity the panel's width happens to give it.
                    Same device as `dots` in ./charts. */}
                <path
                  className="ax-gp-point"
                  d={dotsFor(line.values, height)}
                  fill="none"
                  stroke={(line.color ?? toneVar(line.tone))}
                  strokeWidth="5"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}
          </svg>

          {/* Milestones, over the drawing and under the pointer readout. The
              rule is HTML for the same reason everything else here is: a dashed
              stroke in a non-uniformly scaled box comes out with dashes of two
              different lengths depending on which way it runs. */}
          {placed.map((mark) => (
            <div
              key={`${mark.at}-${mark.label}`}
              className={`ax-gp-mark is-${mark.edge}`}
              style={{ left: `${ratioAt(mark.at, count) * 100}%` }}
            >
              <span className="ax-gp-mark-glyph" title={mark.title}>
                {mark.glyph}
              </span>
              {mark.show && <span className="ax-gp-mark-label">{mark.label}</span>}
            </div>
          ))}

          {/* Where each line ends, as a pill on the axis. A five-line chart
              whose lines are told apart only by a key in the header makes the
              reader look away and back for every one of them; the value at the
              right-hand end is both the label and the reading. */}
          <div className="ax-gp-ends" aria-hidden="true">
            {series.map((line) => (
              <span
                key={line.key}
                className="ax-gp-end"
                style={{
                  top: `${heightAt(line.values[count - 1] ?? 0, height) * 100}%`,
                  color: (line.color ?? toneVar(line.tone)),
                }}
              >
                {Math.round(line.values[count - 1] ?? 0)}
              </span>
            ))}
          </div>

          {/* The readout. HTML rather than SVG for the reason in the header:
              nothing here survives a non-uniform scale intact. */}
          {shown !== null && (
            <div
              className="ax-gp-rule"
              style={{ left: `${ratioAt(shown, count) * 100}%` }}
              aria-hidden="true"
            >
              {series.map((line) => (
                <span
                  key={line.key}
                  className="ax-gp-pin"
                  style={{
                    top: `${heightAt(line.values[shown] ?? 0, height) * 100}%`,
                    background: (line.color ?? toneVar(line.tone)),
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="ax-gp-x" aria-hidden="true">
          {marks.map((index) => (
            <span key={index} style={{ left: `${ratioAt(index, count) * 100}%` }}>
              {labels[index]}
            </span>
          ))}
        </div>

        {/* Anchored to the side the pointer is not on, so the box never covers
            the part of the line the reader is reading. */}
        {shown !== null && (
          <div
            className={`ax-gp-tip${ratioAt(shown, count) > 0.5 ? ' is-left' : ''}`}
            role="status"
          >
            <p className="ax-gp-tip-date">{labels[shown]}</p>
            <ul>
              {series.map((line) => (
                <li key={line.key}>
                  <span className="ax-gp-tip-key" style={{ background: (line.color ?? toneVar(line.tone)) }} />
                  <span>{line.label}</span>
                  <strong>{Math.round(line.values[shown] ?? 0)}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

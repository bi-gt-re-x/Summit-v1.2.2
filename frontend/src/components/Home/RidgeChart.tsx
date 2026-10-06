/**
 * A series of numbers, drawn as a mountain range.
 *
 * The landing page had four charts and every one of them was a thin line over
 * a faint wash — the shape every product page has used since about 2014, and
 * the shape a reader's eye has learned to slide off. This draws the same
 * numbers as rock: one summit per reading, sharp at the top and round in the
 * valleys, with snow on the highest.
 *
 * It is not decoration standing in for a chart. The apex of each peak sits at
 * exactly the height its value asks for, the y-axis is labelled, and the
 * gridlines are real. What the mountain adds is a silhouette worth looking at
 * and, on a page whose whole argument is that work adds up to something you
 * can climb, a picture that says the same thing the copy does.
 *
 * The rounding that makes a polyline read as rock is utils/ridgeline.ts, which
 * components/Range.tsx uses for the scenery behind every page's hero. Sharing
 * it is the point: the chart in the hero card and the mountains behind the
 * hero card are drawn by the same two functions, so the page has one landscape
 * in it rather than two that nearly match.
 *
 * ## Layers are periods, not decoration
 *
 * `series` is given far-to-near and every layer is plotted against one shared
 * scale, so a ridge standing behind another really is lower than it. That is
 * what makes the depth honest: the range in the distance is the earlier
 * period, and it is behind *because* it is smaller. A back layer invented to
 * fill the picture would be the chart lying about its own third dimension,
 * which is the whole reason 3-D bar charts are a joke.
 */
import { useId, useMemo } from 'react';
import { ridgePath, snowCap, type Point } from '@/utils/ridgeline';

/** The drawing's own box. */
const W = 320;
const FLOOR = 120;
/**
 * Sky above the tallest peak. Without it the maximum reading is a summit
 * touching the top edge, which reads as a chart that has run out of room
 * rather than as a mountain.
 */
const TOP = 16;

export interface RidgeSeries {
  /** The readings, left to right, in whatever unit the caption names. */
  values: readonly number[];
  /** What this period is called, for the legend and the description. */
  name: string;
}

export interface RidgeChartProps {
  /** Far to near. The last one is the foreground, and the one with snow on it. */
  series: readonly RidgeSeries[];
  /** What the numbers are, said once. Reaches a screen reader, not the eye. */
  label: string;
  /** The three y-axis marks, top to bottom. Drawn beside the chart. */
  axis?: readonly [string, string, string];
  /** An extra class on the figure, for a card that sizes its chart. */
  className?: string;
}

/**
 * The points one period's readings pass through.
 *
 * Each reading is a summit at its own height. Between every pair of them sits a
 * saddle, and that saddle is the only invented point in the drawing: without
 * one, two adjacent readings make a straight run that `ridgePath` cannot tell a
 * peak from a slope, and the range comes out as a folded ribbon. It is placed
 * below both of its neighbours by a fraction of the drop between them, so a
 * flat stretch dips a little and a cliff dips a lot — which is what a real
 * valley does, and what keeps the eye reading the summits rather than the gaps.
 */
function pointsFor(values: readonly number[], scale: number): Point[] {
  const stride = W / Math.max(1, values.length - 1);
  const y = (value: number) => FLOOR - Math.max(0, value) * scale;

  const points: Point[] = [];
  values.forEach((value, n) => {
    const here: Point = [Math.round(n * stride), Math.round(y(value))];
    if (n > 0) {
      const before = points[points.length - 1]!;
      const lower = Math.max(before[1], here[1]);
      const drop = Math.abs(before[1] - here[1]);
      points.push([
        Math.round((before[0] + here[0]) / 2),
        // Never below the floor, and never so shallow that the two summits
        // beside it stop being summits.
        Math.round(Math.min(FLOOR - 1, lower + 5 + drop * 0.34)),
      ]);
    }
    points.push(here);
  });

  // The ends are square against the box, which is what a chart's edges are.
  points[0] = [0, points[0]![1]];
  points[points.length - 1] = [W, points[points.length - 1]![1]];
  return points;
}

export function RidgeChart({ series, label, axis, className }: RidgeChartProps) {
  const uid = useId().replace(/:/g, '');
  const id = (part: string) => `rg-${part}-${uid}`;

  const drawn = useMemo(() => {
    // One scale for every layer, or the depth would be a lie — see the note at
    // the top of this file.
    const high = Math.max(1, ...series.flatMap((one) => [...one.values]));
    const scale = (FLOOR - TOP) / high;

    return series.map((one, depth) => {
      const points = pointsFor(one.values, scale);
      const near = depth === series.length - 1;
      // Snow on the front range's highest summit and nothing else. A cap on
      // every peak is a sugared cake, and one on a distant ridge is snow lying
      // at the altitude of the valley in front of it.
      const summits = points.filter((_, at) => at % 2 === 0);
      const best = [...summits].sort((a, b) => a[1] - b[1])[0]!;
      return {
        name: one.name,
        d: ridgePath(points, FLOOR),
        cap: near ? snowCap(best, 11) : null,
        peak: near ? best : null,
      };
    });
  }, [series]);

  const front = drawn[drawn.length - 1]!;

  return (
    <figure className={className ? `lp-ridge ${className}` : 'lp-ridge'}>
      {axis && (
        <div className="lp-ridge-y" aria-hidden="true">
          {axis.map((mark) => (
            <span key={mark}>{mark}</span>
          ))}
        </div>
      )}
      <svg
        className="lp-ridge-art"
        viewBox={`0 0 ${W} ${FLOOR}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
      >
        <defs>
          {/* Far and near read from the page's two accents rather than from one
              colour at two opacities: a distant ridge that is only a paler
              version of the front one reads as a shadow of it. */}
          <linearGradient id={id('far')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--lp-accent-2)" stopOpacity=".42" />
            <stop offset="100%" stopColor="var(--lp-accent-2)" stopOpacity=".06" />
          </linearGradient>
          <linearGradient id={id('near')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--lp-accent)" stopOpacity=".88" />
            <stop offset="100%" stopColor="var(--lp-accent)" stopOpacity=".22" />
          </linearGradient>
          {/* The air in front of a ridge. Mapped to the drawing's box, so every
              layer is veiled over the same part of itself. */}
          <linearGradient id={id('haze')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--lp-surface)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--lp-surface)" stopOpacity=".62" />
          </linearGradient>
        </defs>

        {/* Two gridlines and the ground. `vectorEffect` keeps them one pixel:
            the chart is stretched to its card by `preserveAspectRatio: none`,
            and a hairline scaled with it would come out thicker across than
            down. */}
        {[TOP, (TOP + FLOOR) / 2, FLOOR - 1].map((y) => (
          <line
            key={y}
            className="lp-ridge-grid"
            x1="0"
            y1={y}
            x2={W}
            y2={y}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {drawn.map((layer, n) => {
          const near = n === drawn.length - 1;
          return (
            <g key={layer.name}>
              <path fill={`url(#${id(near ? 'near' : 'far')})`} d={layer.d} />
              {!near && <path fill={`url(#${id('haze')})`} d={layer.d} />}
              {layer.cap && <path fill="var(--lp-surface)" fillOpacity=".9" d={layer.cap} />}
            </g>
          );
        })}
      </svg>
      {front.peak && (
        <span
          className="lp-ridge-mark"
          aria-hidden="true"
          style={{
            left: `${(front.peak[0] / W) * 100}%`,
            top: `${(front.peak[1] / FLOOR) * 100}%`,
          }}
        />
      )}
      {/* Named in the order they are drawn is the order they stand: the far
          range first, the one in front of it second. A legend that listed them
          the other way round would be describing a different picture. */}
      {drawn.length > 1 && (
        <figcaption className="lp-ridge-key" aria-hidden="true">
          {drawn.map((layer, n) => (
            <span key={layer.name} className={n === drawn.length - 1 ? 'is-near' : undefined}>
              <i /> {layer.name}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

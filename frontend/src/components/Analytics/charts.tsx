/**
 * The page's drawing kit — small SVG pieces, no library.
 *
 * SVG rather than the canvas the growth page drew into, and the reason is
 * theming: every colour here is a CSS custom property read by the cascade, so
 * the light and dark palettes are two blocks of CSS and a chart repaints itself
 * on a theme change with no listener, no MutationObserver and no repaint on the
 * JS side at all. A canvas renderer has to watch `data-theme` and redraw by
 * hand — worth it for a chart with wheel-zoom and a hover crosshair, and pure
 * cost for fourteen static panels. That was the trade; the canvas renderer is
 * gone and these are what the page draws with.
 *
 * Every component here takes a `viewBox` and no width or height: the CSS sizes
 * the box and `preserveAspectRatio` does the rest, so a panel that changes
 * width at a breakpoint needs no JS to stay drawn correctly.
 */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';

/** The series colours, as the CSS variable each panel paints with. */
export type Tone = 'violet' | 'blue' | 'green' | 'amber' | 'pink';

export const TONES: Tone[] = ['violet', 'blue', 'green', 'amber', 'pink'];

export function toneVar(tone: string): string {
  return `var(--ax-${tone})`;
}

/**
 * A tone name from somewhere that does not know about `Tone`, made safe.
 *
 * The behavioural modules under utils/ carry a tone on every finding, and they
 * deliberately do not import from a component file to get the type — the
 * arithmetic has no business knowing what draws it. This is the one boundary
 * where the loose string becomes the narrow one.
 */
export function asTone(name: string): Tone {
  return (TONES as string[]).includes(name) ? (name as Tone) : 'violet';
}

/**
 * One point of a series, or `null` for "this series is not drawn here".
 *
 * A gap is not a zero. The compounding chart is two series over one x axis
 * where each covers half of it — history to today, forecast from today — and
 * filling the other half with a number puts a line on the chart claiming
 * something was measured, or projected, when it was not. Nulls hold the
 * position without drawing it, which is what lets the forecast begin exactly
 * where the history ends instead of running flat beneath it and then leaping.
 */
export type AreaValue = number | null;

interface Drawn {
  /** The path, `M`-restarted across every gap. */
  d: string;
  /** Where the drawn part begins and ends, for closing an area under it. */
  fromX: number;
  toX: number;
  /**
   * Every point the line actually passes through, in box units.
   *
   * For `dots`. Recomputing these beside the path would be the same arithmetic
   * written twice, and a marker half a pixel off its own line is the kind of
   * wrong that looks like a rendering bug rather than a mistake.
   */
  points: Array<[number, number]>;
}

/**
 * Turns values into an SVG path, scaled into the box. `null` when too few.
 *
 * `at` is where each point sits across the width, 0 to 1. Without it the
 * points are spaced evenly, which is right when the x axis is *positions* —
 * the trajectory chart draws two equal-length periods over each other so that
 * the same distance into each lands at the same x, and dates would pull them
 * apart. It is wrong when the x axis is time: the compounding chart carries a
 * year of weekly history and five years of quarterly forecast, and spacing
 * those evenly gives sixty per cent of the width to the first sixth of the
 * span and bends the forecast upward for no reason but the spacing.
 */
function linePath(
  values: AreaValue[],
  width: number,
  height: number,
  min: number,
  max: number,
  pad = 0,
  at?: number[],
): Drawn | null {
  if (values.length < 2) return null;
  const span = max - min || 1;
  const inner = height - pad * 2;
  const steps = values.length - 1;

  const parts: string[] = [];
  const points: Array<[number, number]> = [];
  let fromX: number | null = null;
  let toX = 0;
  let drawn = 0;
  // `open` tracks whether the previous point was drawn: the first point after a
  // gap has to start a new subpath rather than draw a line across it.
  let open = false;

  values.forEach((value, index) => {
    if (value === null || Number.isNaN(value)) {
      open = false;
      return;
    }
    const x = (at?.[index] ?? index / steps) * width;
    const y = pad + inner - ((value - min) / span) * inner;
    parts.push(`${open ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`);
    points.push([x, y]);
    if (fromX === null) fromX = x;
    toX = x;
    drawn += 1;
    open = true;
  });

  if (drawn < 2 || fromX === null) return null;
  return { d: parts.join(' '), fromX, toX, points };
}

/**
 * Where one value sits up the box — the same arithmetic `linePath` does inline.
 *
 * Pulled out because the crosshair needs it for a *specific index*, and
 * `linePath`'s `points` cannot answer that: it only carries the points it drew,
 * so a series with a gap in it has its indices shifted by however many holes
 * came before. A marker half a series out of position is worse than no marker.
 */
function yAt(value: number, height: number, min: number, max: number, pad: number): number {
  const span = max - min || 1;
  const inner = height - pad * 2;
  return pad + inner - ((value - min) / span) * inner;
}

/**
 * Where each index sits across the width, 0 to 1.
 *
 * One place, because the line, the crosshair and the readout's own position all
 * have to agree about it. `at` is the caller's override for a time axis; the
 * fallback is even spacing. See `linePath`.
 */
function ratioAt(index: number, count: number, at?: number[]): number {
  return at?.[index] ?? (count > 1 ? index / (count - 1) : 0);
}

// --------------------------------------------------------------------------
// Sparkline — the line under a KPI tile
// --------------------------------------------------------------------------
export interface SparklineProps {
  values: number[];
  tone: Tone;
}

/**
 * A tile's own days, with no axis and no scale.
 *
 * The tile states one figure for the whole window, which cannot tell a period
 * that climbed steadily from one that did everything in its last fortnight.
 * This is the shape of the arriving, and it is deliberately unlabelled — a
 * sparkline that invites a reading off its y-axis has stopped being one.
 */
export function Sparkline({ values, tone }: SparklineProps) {
  const width = 100;
  const height = 26;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const drawn = linePath(values, width, height, min, max, 2);
  if (!drawn) return <svg className="ax-spark" viewBox={`0 0 ${width} ${height}`} />;
  const path = drawn.d;

  return (
    <svg
      className="ax-spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Closed on the extent the line covers rather than on the box. A tile's
          series is normally gapless and the two are then the same thing, but a
          metric that cannot be read for a day arrives as a hole, and closing on
          the box would have run the wash out to an edge the line never got to. */}
      <path
        className="ax-spark-area"
        d={`${path} L${drawn.toX.toFixed(2)},${height} L${drawn.fromX.toFixed(2)},${height} Z`}
        fill={toneVar(tone)}
        opacity="0.12"
      />
      <path
        className="ax-spark-line"
        d={path}
        fill="none"
        stroke={toneVar(tone)}
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// --------------------------------------------------------------------------
// AreaChart — the trajectory, and the compounding curve
// --------------------------------------------------------------------------
export interface AreaSeries {
  /** `null` anywhere this series does not reach. See `AreaValue`. */
  values: AreaValue[];
  tone: Tone;
  /**
   * The second line — the period being compared against, or the forecast.
   *
   * Drawn solid like the first, in the same colour, at a lighter weight. It
   * used to be dashed, and a dash is the wrong tool at these sizes: sixty
   * points across six hundred units makes a five-unit dash about the length of
   * one segment, so a line that changes direction often came out as a scatter
   * of ticks rather than a line, and one that climbs steeply came out solid
   * anyway. Weight separates the two everywhere; the pattern only did so on
   * the flat parts.
   */
  muted?: boolean;
  /**
   * Whether the area under this line is filled. Defaults to `!muted`.
   *
   * The default is right for an *overlay* — the trajectory panel draws the
   * previous period over the current one, and two stacked translucent washes
   * there would leave a middle band that belongs to neither line. It is wrong
   * for a *continuation*: the compounding chart's line is one curve cut in half
   * at today, and filling only the history ended the wash in a vertical cliff
   * down to the axis in the middle of the panel with the line carrying on above
   * it. That chart passes a third series — the whole curve, `line: false` — to
   * fill under both halves at once.
   *
   * **A continuation is filled by one series covering all of it, never by two
   * filled halves.** Two filled paths meeting on an exact edge are antialiased
   * independently either side of it and the join comes out as a hairline: dark
   * where they abut, because neither side lays down full coverage, and bright
   * where they are overlapped to avoid that, because both do. A single path has
   * no interior edge to seam.
   */
  fill?: boolean;
  /**
   * Whether this series draws its line. Defaults to true.
   *
   * `false` is for a series that exists to be the fill under other series' lines
   * — see `fill` above. It keeps the two halves of the compounding curve as the
   * separate lines they need to be, drawn at different weights, over one
   * unbroken wash.
   */
  line?: boolean;
  /**
   * A marker on every point the series passes through. Off by default.
   *
   * For a series whose points are *readings* rather than samples. The
   * trajectory and compounding charts carry sixty and more points each, where
   * a marker per point is a string of beads and the shape is the whole content
   * — so those stay bare. The Growth tab's ratings are one reading a year, six
   * of them, and without markers a reader cannot see where a year sits: the
   * line between 2023 and 2024 looks exactly like the line through them.
   *
   * ## Why these are drawn as a path and not as circles
   *
   * The box is `preserveAspectRatio="none"`, so a `<circle>` in it comes out an
   * ellipse of whatever eccentricity the panel's width happens to give it —
   * and changes shape at every breakpoint. A zero-length subpath — `M x,y
   * L x,y` — with a round cap and `non-scaling-stroke` is a dot of exactly
   * `stroke-width` *screen* pixels, round at every width, which is what the
   * rest of this file already relies on to keep its lines an even weight.
   */
  dots?: boolean;
}

/** How far back a series is painted: the wash, then the second line, then the
 *  headline one. Lower goes down first. */
function depth(entry: AreaSeries): number {
  if (entry.line === false) return 0;
  return entry.muted ? 1 : 2;
}

/**
 * What the chart says when a reader points at it.
 *
 * The charts on this page were shapes for a long time: no hover, no focus, no
 * way to get a number back out of one. That is a defensible trade on a
 * sparkline under a stated figure — see `Sparkline`, which stays deliberately
 * mute — and it is not defensible here, where the panel's whole content is the
 * line. A reader who wants to know what happened on the twelfth had to guess it
 * off the gridlines.
 *
 * Passing this turns three things on at once, and they are one feature rather
 * than three: a crosshair under the pointer, the same crosshair under the arrow
 * keys, and a hidden table carrying every row for a reader who is not pointing
 * at anything. The chart is `aria-hidden` once the table exists — a `role="img"`
 * with a one-line label beside a table of the same numbers is the label
 * competing with the data.
 */
export interface AreaReadout {
  /** What the x axis is at each index. One entry per point, not per `mark`. */
  labels: string[];
  /** What each series is called, index-matched to `series`. */
  names: string[];
  /**
   * How a value is written, unit included.
   *
   * The caller's business, because this component has never known what it is
   * drawing: the same box carries XP, a rating out of five and a score out of
   * ten, and "3.7" is the right rendering of exactly one of them.
   */
  format?: (value: number) => string;
}

export interface AreaChartProps {
  series: AreaSeries[];
  /**
   * Where each index sits across the width, 0 to 1, when even spacing would
   * misplace it. One array for every series — they share an x axis, which is
   * the only reason they can be read against each other at all.
   */
  at?: number[];
  /** Printed up the left edge, top value first. */
  ticks: string[];
  /** Printed along the bottom, evenly spaced. */
  marks: string[];
  /** A unique prefix for this chart's gradient ids. Two charts on one page
   *  sharing an id is how one of them ends up unfilled. */
  id: string;
  /**
   * What the chart is, for a reader who cannot see it.
   *
   * Required, and it used to be the string `"Growth over the selected period"`
   * written into the component. That was true of one of the four charts drawn
   * with this and wrong about the other three — the score line, the year
   * ratings and the five-year outlook were all announced as growth over a
   * period none of them covers. A label that is wrong is worse than the generic
   * one it replaced, so it is the caller's to supply.
   */
  label: string;
  /** Turns the crosshair, the keyboard readout and the data table on. */
  readout?: AreaReadout;
  height?: number;
  /**
   * The top of the y axis, when the data must not be the one that sets it.
   *
   * Left off, the chart scales to its own tallest point, which is right for a
   * count that has no ceiling — XP, tasks, hours. It is wrong for a figure
   * drawn from a fixed scale: a rating out of five that never exceeds 3.7
   * would fill the box to the brim and its `ticks` would have to be relabelled
   * to match, which is how a five-point scale ends up looking like a
   * three-point one. Pass the real ceiling and the ticks stay true.
   *
   * Ignored when the data goes past it, because clipping a line is worse than
   * a stretched axis.
   */
  max?: number;
}

/**
 * Two lines over one box, the second one dashed.
 *
 * Both series are scaled to the same extent — that is the entire point of
 * drawing them together, and scaling each to its own peak would make every
 * period look identical to the one before it. The second series is drawn first
 * so the headline one wins where they cross.
 */
export function AreaChart({
  series,
  ticks,
  marks,
  id,
  at,
  label,
  readout,
  height = 200,
  max: ceiling,
}: AreaChartProps) {
  const width = 600;
  const all = series
    .flatMap((entry) => entry.values)
    .filter((value): value is number => value !== null && !Number.isNaN(value));
  const min = 0;
  const max = Math.max(...all, ceiling ?? 0, 1);
  /* The same padding `linePath` is called with below. The crosshair's markers
     have to sit on the line rather than near it, and a second literal here is
     how that stops being true the first time one of them is changed. */
  const pad = 4;

  /* How many points the x axis carries. The longest series, not the first:
     the compounding chart's forecast is longer than its history, and reading
     the count off `series[0]` put the last third of that axis out of reach. */
  const count = series.reduce((longest, entry) => Math.max(longest, entry.values.length), 0);

  /** Which point the crosshair is on. `null` is the resting state — no chrome. */
  const [active, setActive] = useState<number | null>(null);

  const write = readout?.format ?? ((value: number) => `${Math.round(value * 10) / 10}`);

  /* Every drawn point of every series, by index, for the table and the
     readout. Memoised because the table is `count` rows deep and rebuilding it
     on a pointer move — which changes `active` and nothing else — would be the
     one thing on this page that made moving the mouse cost real work. */
  const rows = useMemo(() => {
    if (!readout) return [];
    return Array.from({ length: count }, (_, index) => ({
      label: readout.labels[index] ?? '',
      values: series.map((entry) => {
        const value = entry.values[index];
        return value === null || value === undefined || Number.isNaN(value) ? null : value;
      }),
    }));
  }, [count, readout, series]);

  /* What a screen reader is told as the crosshair moves. Empty at rest, so
     arriving on the chart does not announce a point nobody asked for. */
  const spoken =
    active === null || !rows[active]
      ? ''
      : `${rows[active]!.label}. ${rows[active]!.values
          .map((value, index) =>
            value === null
              ? `${readout!.names[index] ?? `Series ${index + 1}`}: no reading`
              : `${readout!.names[index] ?? `Series ${index + 1}`}: ${write(value)}`,
          )
          .join('. ')}`;

  /**
   * The point nearest the pointer, in the chart's own 0-1 space.
   *
   * Off the element's client rect rather than the viewBox, because
   * `preserveAspectRatio="none"` means the two are unrelated: the box is 600
   * units wide and however many pixels the panel gave it, and the ratio is the
   * only thing the two agree about.
   */
  const nearest = (ratio: number): number => {
    if (count < 2) return 0;
    if (!at) return Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))));
    let best = 0;
    let gap = Infinity;
    for (let index = 0; index < count; index += 1) {
      const distance = Math.abs(ratioAt(index, count, at) - ratio);
      if (distance < gap) {
        gap = distance;
        best = index;
      }
    }
    return best;
  };

  const track = (event: PointerEvent<HTMLDivElement>) => {
    if (!readout) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    setActive(nearest((event.clientX - box.left) / box.width));
  };

  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!readout) return;
    const keys: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
    if (event.key === 'Escape') {
      setActive(null);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActive(event.key === 'Home' ? 0 : count - 1);
      return;
    }
    const move = keys[event.key];
    if (move === undefined) return;
    /* Or the arrow scrolls the page out from under the chart being read. */
    event.preventDefault();
    setActive((current) => {
      const next = current === null ? (move > 0 ? 0 : count - 1) : current + move;
      return Math.max(0, Math.min(count - 1, next));
    });
  };

  const cursor = active === null ? null : ratioAt(active, count, at);

  return (
    <div className="ax-chart" style={{ '--ax-chart-h': `${height}px` } as CSSProperties}>
      <div className="ax-chart-y">
        {ticks.map((tick, index) => (
          <span key={`${tick}-${index}`}>{tick}</span>
        ))}
      </div>
      <div className="ax-chart-box">
      {/* The focusable thing is this wrapper and not the SVG. Firefox and
          Safari both refuse a tab stop on an `<svg>` reliably, and the readout
          below is HTML that has to be positioned against the drawing anyway —
          so the element that owns the pointer, the focus ring and the tooltip
          is one box around both. */}
      <div
        className={`ax-chart-plot${active === null ? '' : ' is-reading'}`}
        {...(readout
          ? {
              tabIndex: 0,
              role: 'group' as const,
              'aria-label': `${label}. Use the left and right arrow keys to read each point.`,
              onPointerMove: track,
              onPointerDown: track,
              onPointerLeave: () => setActive(null),
              onBlur: () => setActive(null),
              onKeyDown: step,
            }
          : {})}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="ax-chart-svg"
          {...(readout
            ? /* The table below says everything this does, in rows. Two
                 descriptions of one chart is one description too many. */
              { 'aria-hidden': true as const }
            : { role: 'img' as const, 'aria-label': label })}
        >
          <defs>
            {series.map((entry, index) => (
              <linearGradient key={index} id={`${id}-fill-${index}`} x1="0" y1="0" x2="0" y2="1">
                {/* Every filled series gets the same wash, including a forecast
                    half. Giving that one a lighter stop looked reasonable and
                    drew a hard vertical edge down the middle of the compounding
                    panel — the same edge the unfilled version had, in a paler
                    colour. The line above it already carries the distinction at
                    `is-muted`, which is the mark a reader is looking at. */}
                <stop offset="0%" stopColor={toneVar(entry.tone)} stopOpacity="0.32" />
                <stop offset="100%" stopColor={toneVar(entry.tone)} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {ticks.map((_, index) => {
            const y = (index / Math.max(1, ticks.length - 1)) * height;
            return (
              <line
                key={index}
                x1="0"
                y1={y}
                x2={width}
                y2={y}
                className="ax-gridline"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* Painted back to front: a bare wash, then the second line, then the
              headline one, so the series a reader came for wins wherever they
              cross and no fill lands on top of a line.

              Sorted for that order, but each entry keeps the index it had in
              `series` — that index names its gradient in `defs` above, and
              reading it off the sorted position instead handed every filled
              series the gradient belonging to whichever series happened to sort
              into its slot. Invisible while one chart's series shared a tone,
              and a silently wrong colour the moment one did not. */}
          {series
            .map((entry, index) => ({ entry, index }))
            .sort((a, b) => depth(a.entry) - depth(b.entry))
            .map(({ entry, index }) => {
              const drawn = linePath(entry.values, width, height, min, max, 4, at);
              if (!drawn) return null;
              const filled = entry.fill ?? !entry.muted;
              return (
                <g key={index}>
                  {/* The area closes on the extent the line actually covers,
                      not on the box: a series that stops halfway across — the
                      history under a forecast — would otherwise be filled with
                      a diagonal running off to the far corner. */}
                  {filled && (
                    <path
                      className="ax-chart-area"
                      d={`${drawn.d} L${drawn.toX.toFixed(2)},${height} L${drawn.fromX.toFixed(2)},${height} Z`}
                      fill={`url(#${id}-fill-${index})`}
                    />
                  )}
                  {/* No `pathLength` here, and that is deliberate — see the
                      `ax-wipe` note in styles/analytics.css. It existed only to
                      normalise the old `stroke-dasharray` entrance, which it
                      could not do on a line that also carries
                      `non-scaling-stroke`, and the cost was every line on the
                      page stopping partway across and staying there. */}
                  {(entry.line ?? true) && (
                    <path
                      className={`ax-chart-line${entry.muted ? ' is-muted' : ''}`}
                      d={drawn.d}
                      fill="none"
                      stroke={toneVar(entry.tone)}
                      strokeWidth={entry.muted ? 1.5 : 2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {/* Over the line rather than under it: a marker the line is
                      drawn across is a bulge in the line, not a point. */}
                  {entry.dots && (
                    <path
                      className={`ax-chart-dot${entry.muted ? ' is-muted' : ''}`}
                      d={drawn.points
                        .map(([x, y]) => `M${x.toFixed(2)},${y.toFixed(2)}L${x.toFixed(2)},${y.toFixed(2)}`)
                        .join(' ')}
                      fill="none"
                      stroke={toneVar(entry.tone)}
                      strokeWidth={entry.muted ? 5 : 6.5}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              );
            })}
          {/* The crosshair, over everything, drawn last so no fill lands on it.

              `aria-hidden` on the group as well as the SVG around it: this is
              the sighted half of the readout, and the half a screen reader gets
              is the live region and the table below. */}
          {cursor !== null && (
            <g className="ax-crosshair" aria-hidden="true">
              <line
                x1={(cursor * width).toFixed(2)}
                x2={(cursor * width).toFixed(2)}
                y1="0"
                y2={height}
                vectorEffect="non-scaling-stroke"
              />
              {/* A marker per series that has a reading here. Drawn the same
                  way `dots` is — a zero-length subpath with a round cap — for
                  the same reason: under `preserveAspectRatio="none"` a
                  `<circle>` comes out an ellipse of whatever eccentricity the
                  panel's width happens to give it. */}
              {series.map((entry, index) => {
                const value = entry.values[active!];
                if (value === null || value === undefined || Number.isNaN(value)) return null;
                const x = (cursor * width).toFixed(2);
                const y = yAt(value, height, min, max, pad).toFixed(2);
                return (
                  <path
                    key={index}
                    className="ax-crosshair-dot"
                    d={`M${x},${y}L${x},${y}`}
                    fill="none"
                    stroke={toneVar(entry.tone)}
                    strokeWidth="7"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </g>
          )}
        </svg>

        {/* The tooltip. HTML rather than SVG `<text>`, because the box is
            `preserveAspectRatio="none"` and every glyph in it would be
            stretched by whatever ratio the panel's width to its height happens
            to be — the one thing on a chart that must not be scaled with the
            drawing is the writing. */}
        {readout && active !== null && rows[active] && (
          <div
            className="ax-readout"
            /*
             * Placed by the point *and* aligned by it, which is what stops it
             * needing to be clamped.
             *
             * A tooltip pinned at `left: x` and centred with a flat
             * `translateX(-50%)` hangs half its own width outside the panel at
             * either end of the axis — and the width is the caller's text, so
             * there is no number here that could clamp it. Translating by the
             * same ratio the point sits at makes the box left-aligned at 0,
             * centred in the middle and right-aligned at 1, so it is always
             * inside the drawing, at every width, with no measuring.
             */
            style={
              {
                left: `${(cursor ?? 0) * 100}%`,
                transform: `translateX(-${(cursor ?? 0) * 100}%)`,
              } as CSSProperties
            }
            aria-hidden="true"
          >
            <span className="ax-readout-when">{rows[active]!.label}</span>
            {rows[active]!.values.map((value, index) =>
              value === null ? null : (
                <span className="ax-readout-row" key={index}>
                  <span
                    className="ax-readout-mark"
                    style={{ background: toneVar(series[index]!.tone) }}
                  />
                  {readout.names[index] ?? `Series ${index + 1}`}
                  <strong>{write(value)}</strong>
                </span>
              ),
            )}
          </div>
        )}
      </div>
        <div className="ax-chart-x">
          {marks.map((mark, index) => (
            <span key={`${mark}-${index}`}>{mark}</span>
          ))}
        </div>
      </div>

      {/* The other half of the readout, and the reason the drawing above is
          allowed to be `aria-hidden`.

          The live region carries the crosshair as it moves — the same sentence
          a sighted reader gets from the tooltip — and the table carries the
          whole series, for a reader who wants the shape rather than one point
          of it. Both are `.ax-sr`: this is the same chart, said twice for two
          ways of reading, not a second chart. */}
      {readout && (
        <>
          <div className="ax-sr" aria-live="polite">
            {spoken}
          </div>
          <table className="ax-sr">
            <caption>{label}</caption>
            <thead>
              <tr>
                <th scope="col">Point</th>
                {readout.names.map((name, index) => (
                  <th scope="col" key={index}>
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <th scope="row">{row.label}</th>
                  {row.values.map((value, column) => (
                    <td key={column}>{value === null ? 'No reading' : write(value)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Radar — subject growth
// --------------------------------------------------------------------------
export interface RadarAxis {
  label: string;
  /** 0-1, already scaled against the largest value on the chart. */
  value: number;
}

/**
 * One polygon per period over a labelled web.
 *
 * A radar is the right shape here and the wrong one almost everywhere else: it
 * is readable only when the axes are few, named, and genuinely comparable, and
 * "XP earned per subject" is all three. The axes are scaled against the largest
 * single value rather than each against its own maximum, so a subject that
 * dwarfs the others looks like it dwarfs the others.
 */
/** Longest axis name drawn before it is cut. "Computer Science" is 16. */
const RADAR_LABEL = 13;

/**
 * @param label What the web is, for a reader who cannot see it. It used to be
 *              the string `"XP earned by subject"` written in here, which is
 *              what the Subjects panel draws and *not* what the Growth tab's
 *              Balance web draws — that one is five readings of one skill. Both
 *              charts announced themselves as the first.
 *
 *              There is no data table beside this one, unlike `AreaChart`, and
 *              that is deliberate: both call sites already print a legend of
 *              every axis and its real value next to the web, in the document,
 *              where a screen reader meets it in order. A hidden table here
 *              would be the same list a third time — and in the normalised 0-1
 *              units the polygon is drawn from rather than the XP the legend
 *              states, which is the version nobody wants.
 */
export function Radar({
  axes,
  tone = 'violet',
  label,
}: {
  axes: RadarAxis[];
  tone?: Tone;
  label: string;
}) {
  const size = 220;
  const centre = size / 2;
  const radius = size / 2 - 34;
  const rings = [0.25, 0.5, 0.75, 1];

  /**
   * Room either side of the square the web is drawn in, for the axis names.
   *
   * The names sit outside the outer ring, so on a square box they were drawn
   * outside the viewBox and — with `overflow: visible` on the SVG — landed on
   * whatever was next to the chart. In the subject panel that is the legend,
   * so "Computer Science" was printed straight through it. Padding the box
   * horizontally is what makes a label part of the chart rather than something
   * escaping from it; the names run left and right, which is why there is no
   * vertical equivalent.
   */
  const padX = 48;

  if (axes.length < 3) return <div className="ax-radar-empty">Not enough subjects yet</div>;

  // Typed as a tuple rather than number[]: the callers destructure it, and
  // under noUncheckedIndexedAccess an array's members are possibly undefined.
  const at = (index: number, scale: number): [number, number] => {
    // Start at twelve o'clock and go clockwise, which is where a reader's eye
    // starts on a dial.
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    return [centre + Math.cos(angle) * radius * scale, centre + Math.sin(angle) * radius * scale];
  };

  const polygon = (scale: (index: number) => number) =>
    axes.map((_, index) => at(index, scale(index)).map((n) => n.toFixed(1)).join(',')).join(' ');

  return (
    <svg
      viewBox={`${-padX} 0 ${size + padX * 2} ${size}`}
      className="ax-radar"
      role="img"
      aria-label={label}
    >
      {rings.map((ring) => (
        <polygon key={ring} points={polygon(() => ring)} className="ax-radar-ring" />
      ))}
      {axes.map((_, index) => {
        const [x, y] = at(index, 1);
        return <line key={index} x1={centre} y1={centre} x2={x} y2={y} className="ax-radar-ring" />;
      })}
      <polygon
        className="ax-radar-shape"
        points={polygon((index) => Math.max(0.04, axes[index]!.value))}
        fill={toneVar(tone)}
        fillOpacity="0.28"
        stroke={toneVar(tone)}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {axes.map((axis, index) => {
        const [x, y] = at(index, 1.2);
        // Cut rather than wrapped: a two-line axis name on a web this size
        // collides with the name of the axis next to it, and the panel's
        // legend beside the chart prints every name in full anyway.
        const short =
          axis.label.length > RADAR_LABEL ? `${axis.label.slice(0, RADAR_LABEL - 1)}…` : axis.label;
        return (
          <text
            key={axis.label}
            x={x}
            y={y}
            className="ax-radar-label"
            textAnchor={x > centre + 4 ? 'start' : x < centre - 4 ? 'end' : 'middle'}
            dominantBaseline="middle"
          >
            <title>{axis.label}</title>
            {short}
          </text>
        );
      })}
    </svg>
  );
}

// --------------------------------------------------------------------------
// Columns — one series of labelled bars
// --------------------------------------------------------------------------
export interface Column {
  label: string;
  value: number;
  /** Printed above the bar. The unit is the caller's business. */
  text: string;
  /** Drawn in the accent rather than the base — the best day, the peak hour. */
  peak?: boolean;
  /**
   * What this bar is called when it is read rather than drawn. Defaults to
   * `label`.
   *
   * For a chart that labels only some of its bars. The clock draws eighteen
   * hours and prints a label on every third, because eighteen labels under
   * bars that narrow is a grey smear — so two thirds of its columns have
   * `label: ''`, which is right on the drawing and useless in the sentence the
   * group is announced as. This is the name that is always there.
   */
  name?: string;
}

/**
 * A distribution, as bars sharing one scale.
 *
 * All the same measurement, so they share a scale and the comparison between
 * any two of them is real — that is the whole
 * point of the panel, and scaling each to itself would flatten exactly the
 * difference the reader is looking for. The tallest is marked so the answer to
 * "when" is visible before any of the numbers are read.
 */
/**
 * @param label What the distribution is of. See the `role="img"` below.
 */
export function Columns({
  columns,
  tone = 'violet',
  label,
}: {
  columns: Column[];
  tone?: Tone;
  label: string;
}) {
  const peak = Math.max(...columns.map((column) => column.value), 1);
  return (
    /*
     * `role="img"` with the whole distribution in its label, rather than
     * nothing at all.
     *
     * These are divs, so a screen reader was walking them and reading the value
     * and the label of each as two unrelated runs of text — "12", "Mon", "8",
     * "Tue" — with nothing anywhere saying what was being counted. `role="img"`
     * makes the group a leaf, so the fragments stop being announced separately
     * and the label below is what is read instead: one sentence, in order, with
     * the units the caller already wrote into `text`.
     */
    <div
      className="ax-columns"
      role="img"
      aria-label={`${label}. ${columns
        .map((column) => `${column.name ?? column.label} ${column.text || column.value}`)
        .join(', ')}.`}
    >
      {columns.map((column) => (
        <div className="ax-column" key={column.label}>
          <span className="ax-column-value">{column.text}</span>
          <div className="ax-column-track">
            <div
              className={`ax-column-bar${column.peak ? ' is-peak' : ''}`}
              style={{
                height: `${(column.value / peak) * 100}%`,
                background: column.peak ? toneVar(tone) : undefined,
              }}
            />
          </div>
          <span className="ax-column-label">{column.label}</span>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// Panel furniture
// --------------------------------------------------------------------------
export interface PanelProps {
  title: string;
  /** A line under the title, when the panel needs one. */
  note?: string;
  /** Pushed to the right of the title row — a picker, usually. */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
  /** The link row along the bottom. */
  footer?: ReactNode;
  /**
   * The panel's finding, in a sentence, printed above the chart it came from.
   *
   * A claim is a smaller thing to read than a chart and says more of what the
   * chart was for, so a panel that can state its finding states it — but it
   * states it *with* the evidence, not instead of it. It used to fold the
   * chart, grid or table away behind a "Show the workings" disclosure, and
   * that was the wrong trade: a reader who came to look at the year of days
   * found a sentence about it and a button, and the panel's whole reason for
   * existing was one click away on every visit.
   *
   * A panel with no claim renders exactly as it always did.
   */
  claim?: ReactNode;
}

/**
 * How deep in the page a panel's title sits.
 *
 * Every panel used to print an `<h2>`, including the ones nested inside a
 * `PanelGroup` — so a screen reader moving by heading met a flat list where the
 * page has two levels, and the group headings that organise a tab were not in
 * the outline at all, because `PanelGroup` drew its title as a `<strong>`
 * inside a button rather than as a heading.
 *
 * A context rather than a prop because `PanelGroup` takes its panels as opaque
 * `children` and cannot reach in to tell each one what level it is at.
 * Ungrouped panels stay at 2, which is what they have always rendered.
 */
const HeadingLevel = createContext(2);

/** A heading at whatever depth the surrounding groups have reached. */
function Heading({ className, children }: { className?: string; children: ReactNode }) {
  const level = useContext(HeadingLevel);
  // Capped at 6 because there is no h7; nothing here nests that far, and a tag
  // the browser does not know is worse than a heading one level too shallow.
  const Tag = `h${Math.min(level, 6)}` as 'h2';
  return <Tag className={className}>{children}</Tag>;
}

/**
 * A panel.
 *
 * It used to carry one more thing: a Sample chip in the top right, marking a
 * panel drawn from invented figures. Both the chip and the figures behind it
 * are gone — a panel on this page is now always this account's own record, so
 * there is nothing left to disclaim. A tab that cannot be filled says so as a
 * whole rather than shipping placeholder panels with a footnote; see `Building`.
 */
export function Panel({
  title,
  note,
  aside,
  className,
  children,
  footer,
  claim,
}: PanelProps) {
  return (
    <section className={`ax-panel${className ? ` ${className}` : ''}`}>
      <header className="ax-panel-head">
        <div className="ax-panel-title">
          <Heading>{title}</Heading>
        </div>
        {aside && <div className="ax-panel-aside">{aside}</div>}
      </header>
      {note && <p className="ax-panel-note">{note}</p>}
      {/* No wrapper around `children` when there is a claim: the claim is a
          sibling of the content, not a lid on it, and `.ax-panel`'s rules for
          what may grow into the panel's slack — `.ax-heat`, `.ax-standing`,
          `.ax-timeline` — are direct-child selectors that a wrapper would
          have cut off from the content they are meant to size. */}
      {claim && <p className="ax-claim">{claim}</p>}
      {children}
      {footer && <div className="ax-panel-foot">{footer}</div>}
    </section>
  );
}

// --------------------------------------------------------------------------
// Panel footers
// --------------------------------------------------------------------------
/**
 * The two things a panel's footer is allowed to be.
 *
 * It used to be allowed to be a third: a `<span>` styled like a link, pointing
 * nowhere. Eleven panels carried one — "View all insights →", "View streak
 * history →", "How projections work →" — and not one of them had a handler or
 * an href. They were the page's most-clicked dead end, and the cost is not the
 * click: a reader who presses two of them and gets nothing stops believing the
 * rest of the page, including the parts that work.
 *
 * So a footer either goes somewhere (`PanelLink`, to a tab that exists) or it
 * opens in place (`PanelNote`, for the ones whose honest destination was always
 * an explanation rather than another screen). Nothing here renders a control
 * that does not do what it looks like it does.
 */
export function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="ax-link" to={to}>
      {children} →
    </Link>
  );
}

/**
 * A named group of panels, opening and closing as one.
 *
 * Insights carried fifteen panels in eight rows, every one of them the same
 * weight, none of them saying which of the tab's three questions it belonged
 * to. A reader scrolling it met fifteen equal claims and had to build the
 * grouping themselves, every visit.
 *
 * So the grouping is stated. Three headings — what is true now, why it happens,
 * when and what you work on — and the panels live inside whichever one they
 * answer. It is the same disclosure as `Panel`'s `claim` one level up: the
 * heading and its one-line summary are always readable, and the panels open on
 * request.
 *
 * ## Only the first is open
 *
 * A tab whose three groups are all shut is a tab that looks broken, and one
 * whose three are all open is the wall this replaced. The first opens because
 * it is the one that answers "how am I doing" — the others are there for the
 * reader who has a follow-up question, which is most of what Insights is for.
 */
export function PanelGroup({
  title,
  note,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** One line saying what the group answers. Always visible. */
  note: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const level = useContext(HeadingLevel);
  return (
    <section className={`ax-group${open ? ' is-open' : ''}`}>
      {/* The button is *inside* the heading rather than around it: the group
          title is what a reader navigating by heading is looking for, and a
          heading wrapping the control is the shape that gives them both. */}
      <Heading>
        <button
          type="button"
          className="ax-group-head"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="ax-group-title">
            <strong>{title}</strong>
            <span className="ax-muted ax-small">{note}</span>
          </span>
          {/* The chevron gets a target around it rather than floating loose at
              the far end of a full-width row. A bare 13px glyph two feet from
              the words it belongs to does not read as a control — it reads as
              punctuation, and these rows were being missed because of it. The
              whole head is still the button; this is what makes that look
              true. */}
          <span className="ax-group-toggle" aria-hidden="true">
            <span className="ax-finding-mark" />
          </span>
        </button>
      </Heading>
      {/*
        One wrapper, for the reason `.ax-finding-body` documents.

        `inert` while shut, and that is not decoration. The collapse is a grid
        row going to `0fr` with `overflow: hidden`, which hides the content from
        the eye and from nothing else: it stayed in the accessibility tree and
        in the tab order, so `aria-expanded="false"` announced a closed group
        whose charts a screen reader then read out, and a keyboard user tabbed
        into buttons they could not see. `inert` is what actually closes it.
      */}
      <div className="ax-group-body" inert={!open}>
        <HeadingLevel.Provider value={level + 1}>
          <div>{children}</div>
        </HeadingLevel.Provider>
      </div>
    </section>
  );
}

/** A footer that explains itself in place rather than sending the reader away. */
export function PanelNote({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="ax-link"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label} {open ? '↑' : '↓'}
      </button>
      {open && <div className="ax-note">{children}</div>}
    </>
  );
}

// --------------------------------------------------------------------------
// Scatter — a relationship, drawn as the observations and nothing else
// --------------------------------------------------------------------------
export interface ScatterProps {
  /** Already normalised to 0-1 on both axes by the caller. */
  points: Array<[number, number]>;
  tone: Tone;
  xLabel: string;
  yLabel: string;
  /** Drawn only when the caller says the correlation is worth a line. */
  trend?: boolean;
}

/**
 * A cloud of dots, with a line of fit only when one is earned.
 *
 * The default is no line, and that is the point. A line of best fit asserts a
 * model; a cloud asserts nothing beyond the observations it is made of. On a
 * relationship the page has already labelled "possible, not established", a
 * confident diagonal through the middle of the smear would contradict the
 * label right next to it — so the caller passes `trend` only where the evidence
 * carries it, and everywhere else the reader gets to see the scatter for what
 * it is.
 */
export function Scatter({ points, tone, xLabel, yLabel, trend }: ScatterProps) {
  const width = 300;
  const height = 150;
  const pad = 6;

  const at = (point: [number, number]): [number, number] => [
    pad + point[0] * (width - pad * 2),
    height - pad - point[1] * (height - pad * 2),
  ];

  // Least squares in the normalised space — the same fit the coefficient came
  // from, so the line and the number beside it cannot disagree.
  let line: string | null = null;
  if (trend && points.length >= 3) {
    const n = points.length;
    const meanX = points.reduce((sum, [x]) => sum + x, 0) / n;
    const meanY = points.reduce((sum, [, y]) => sum + y, 0) / n;
    let top = 0;
    let bottom = 0;
    points.forEach(([x, y]) => {
      top += (x - meanX) * (y - meanY);
      bottom += (x - meanX) ** 2;
    });
    if (bottom > 0) {
      const slope = top / bottom;
      const from = at([0, Math.max(0, Math.min(1, meanY + slope * (0 - meanX)))]);
      const to = at([1, Math.max(0, Math.min(1, meanY + slope * (1 - meanX)))]);
      line = `M${from[0].toFixed(1)},${from[1].toFixed(1)} L${to[0].toFixed(1)},${to[1].toFixed(1)}`;
    }
  }

  return (
    <div className="ax-scatter">
      {/* The count and the fit, not the points.
          
          A scatter's content is its shape, and sixty coordinate pairs read
          aloud is not a shape — it is sixty numbers. What a reader can actually
          use is how many observations there are and whether the page thought
          the relationship strong enough to draw a line through them, which is
          the same thing the panel's own prose says beside it. */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${xLabel} against ${yLabel}. ${points.length} ${
          points.length === 1 ? 'observation' : 'observations'
        }${trend ? ', with a line of best fit' : ', with no line of fit drawn'}.`}
      >
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1="0"
            x2={width}
            y1={height * ratio}
            y2={height * ratio}
            className="ax-gridline"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {line && (
          <path
            d={line}
            className="ax-scatter-fit"
            stroke={toneVar(tone)}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {points.map((point, index) => {
          const [x, y] = at(point);
          return <circle key={index} cx={x} cy={y} r="2.6" fill={toneVar(tone)} fillOpacity="0.55" />;
        })}
      </svg>
      <div className="ax-scatter-axes">
        <span>{xLabel} →</span>
        <span>↑ {yLabel}</span>
      </div>
    </div>
  );
}

/** The "↑ 46% vs previous 2 years" line, or nothing when there is no baseline. */
export function Delta({ value, suffix }: { value: number | null; suffix: string }) {
  if (value === null) return <span className="ax-delta ax-delta-none">No earlier period</span>;
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  return (
    <span className={`ax-delta ax-delta-${direction}`}>
      {direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→'} {Math.abs(value)}% {suffix}
    </span>
  );
}

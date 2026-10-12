/**
 * The mountain range that stands behind a page's opening card.
 *
 * This started on the focus page, beside a sunset that once sat behind the
 * timer's quote, and it is here because the range turned out not to be about
 * pomodoros. It is the app's one piece of scenery, and a
 * page that opens with it reads as somewhere you arrived rather than a screen
 * that appeared. Every page's hero now draws one; styles/summit.css is the
 * card it sits in.
 *
 * Inline SVG rather than an image, for the reasons the timer's copy gives: a
 * photograph would be a binary in the repo, a request on every load, a licence
 * to track, and a fixed palette that cannot follow the theme. This one paints
 * with `--peak-a`, `--peak-b`, `--peak-c`, `--peak-surface` and `--peak-snow`,
 * which the hero sets, so a page picks its own weather by naming a tone.
 *
 * `aria-hidden`, always. It carries no information, and a screen reader
 * announcing "mountains" above every page would be reading out the wallpaper.
 *
 * ## Why the ridgelines are generated
 *
 * The timer's three were placed by hand and read well, and twelve pages
 * wearing those same three would read as one wallpaper repeated — which is
 * worse than no scenery, because it tells the eye that nothing changed when
 * the page did. So a range is grown from its name: `variant="goals"` is the
 * same mountains on every visit, and a different set from `variant="tasks"`.
 * The shaping below is what keeps a generated ridge from looking generated.
 */
import { useId, useMemo } from 'react';
import { ridgePath, snowCap, type Point } from '@/utils/ridgeline';

// ---------------------------------------------------------------------------
// Drawing a range
// ---------------------------------------------------------------------------
/**
 * The drawing's own box. Ridges run past both edges so nothing ends mid-air.
 *
 * The rounding rule that turns these points into rock — sharp summits, round
 * saddles — is utils/ridgeline.ts, shared with the landing page's charts so the
 * app's scenery and its mountain graphs are made of the same shape.
 */
const LEFT = -8;
const RIGHT = 428;
const FLOOR = 180;

// ---------------------------------------------------------------------------
// Growing one
// ---------------------------------------------------------------------------
/**
 * A small deterministic generator, so a variant's mountains never move.
 *
 * mulberry32. `Math.random` would redraw the range on every render, which on a
 * page that re-renders when a filter moves is a landscape that twitches.
 */
function rolls(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A variant name as a seed. Any string, one range. */
function seedOf(name: string): number {
  let hash = 0x811c9dc5;
  for (let n = 0; n < name.length; n += 1) {
    hash ^= name.charCodeAt(n);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The y bands a layer's summits and saddles are drawn from. */
interface Band {
  peaks: number;
  crest: readonly [number, number];
  saddle: readonly [number, number];
}

/**
 * One ridgeline: left edge, then summit, saddle, summit … to the right edge.
 *
 * Summits and saddles alternate strictly and are drawn from two bands that do
 * not overlap, which is what stops the generator producing a wobble instead of
 * a mountain. The x positions are evenly spaced and then jittered by half
 * of a step — enough that the peaks are not a comb, not enough for two to
 * collide and give `ridge` a segment too short to round.
 *
 * The first version of this drew four peaks a layer from a fifteen-unit crest
 * band, and every range it grew came out as the same repeated shape: four
 * summits, evenly spaced, all the same height. A real ridgeline has one
 * mountain you look at and the others are context. So the bands here are wide
 * — a crest can land thirty units above or below its neighbour — and there are
 * fewer of them, which is what leaves each peak room to be a different size
 * from the one beside it.
 */
function ridgeline(next: () => number, band: Band): Point[] {
  const steps = band.peaks * 2;
  const stride = (RIGHT - LEFT) / steps;
  const pick = ([lo, hi]: readonly [number, number]) => Math.round(lo + next() * (hi - lo));

  const points: Point[] = [[LEFT, pick(band.saddle)]];
  for (let n = 1; n < steps; n += 1) {
    const x = Math.round(LEFT + stride * n + (next() - 0.5) * stride * 0.5);
    points.push([x, n % 2 ? pick(band.crest) : pick(band.saddle)]);
  }
  points.push([RIGHT, pick(band.saddle)]);
  return points;
}

/**
 * The three layers, far to near.
 *
 * Each is lower on the card and taller than the one behind it, and each has
 * fewer, wider peaks — which is the whole of what makes three silhouettes read
 * as three distances rather than as a stack. The bands never overlap between
 * layers either, so a near summit cannot poke through a far one and leave a
 * hole where the mountain in front should be.
 */
const LAYERS: readonly Band[] = [
  { peaks: 3, crest: [72, 104], saddle: [116, 132] },
  { peaks: 3, crest: [92, 126], saddle: [138, 154] },
  { peaks: 2, crest: [98, 134], saddle: [154, 172] },
];

interface Layer {
  d: string;
  /** The two highest summits, which are the ones that hold snow. */
  caps: string[];
}

function grow(name: string): Layer[] {
  const next = rolls(seedOf(name));
  return LAYERS.map((band, depth) => {
    const points = ridgeline(next, band);
    // Odd indices are the summits; the two highest of them get the snow. A cap
    // on every peak is a sugared cake, and a cap on the lowest one is snow
    // lying at the altitude of the valley beside it.
    const summits = points.filter((_, at) => at % 2 === 1);
    const highest = [...summits].sort((a, b) => a[1] - b[1]).slice(0, 2);
    return {
      d: ridgePath(points, FLOOR),
      caps: highest.map((peak, n) => snowCap(peak, 12 + depth * 3 - n * 2)),
    };
  });
}

/** Built once per variant. The shapes never change, and three pages may ask. */
const grown = new Map<string, Layer[]>();
function rangeFor(name: string): Layer[] {
  const held = grown.get(name);
  if (held) return held;
  const made = grow(name);
  grown.set(name, made);
  return made;
}

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------
export interface RangeProps {
  /**
   * Which range to draw. The same name is the same mountains every visit, and
   * two names are two places — pass the page's own, not a shared constant.
   */
  variant: string;
  /** An extra class on the scene layer, for a hero that places it differently. */
  className?: string;
}

/**
 * The range along the bottom of a hero.
 *
 * Three ridgelines at falling opacity, with a wash of the card's own colour
 * laid over each one's base. The wash is what does the work: a distant ridge
 * is not merely paler, it is *eaten into* from the bottom by the air in front
 * of it, and drawing that is the difference between three silhouettes stacked
 * up and three mountains standing at three distances.
 *
 * `meet` rather than `slice`. `slice` scales a picture to *cover* its box and
 * discards whatever hangs over the edge, so on a tall hero the range would be
 * scaled past its own size and cropped — and what the crop takes first is the
 * left-hand fade, which lives in the drawing's coordinates. The range would
 * then end in exactly the hard vertical line that fade exists to prevent.
 * `meet` scales to fit, so the whole range is in the box whatever shape the
 * card is; anchoring bottom-right leaves the spare room above it, which is sky.
 *
 * Gradient ids are scoped with `useId`, because two heroes on one page with
 * two different tones would otherwise share one set of definitions and the
 * second would silently paint in the first one's colours.
 *
 * ## The wrapper is what does the clipping, and it has to be
 *
 * The range and the sky behind it both run past the card — the range's own
 * paths overshoot both sides so a drifting layer cannot pull its end into
 * view, and the sky is a wash half again the card's height. So something has
 * to be `overflow: hidden` with the card's radius on it, and the obvious
 * candidate is the card.
 *
 * It cannot be. Two of the headers a hero now wraps carry dropdown menus — the
 * overflow menu on Tasks, the tools on Goals — and a menu is a positioned
 * child of the header, so a card that clips its scenery clips the menu too and
 * the page silently loses a control. `.peak-scene` is an inert layer behind
 * the content that clips itself instead, which leaves the card free to let
 * anything hang out of it. See styles/summit.css.
 */
export function Range({ variant, className }: RangeProps) {
  const uid = useId().replace(/:/g, '');
  const layers = useMemo(() => rangeFor(variant), [variant]);
  const id = (part: string) => `pk-${part}-${uid}`;

  return (
    <div className={className ? `peak-scene ${className}` : 'peak-scene'} aria-hidden="true">
    <svg
      className="peak-range"
      viewBox="0 0 420 180"
      preserveAspectRatio="xMaxYMax meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id('far')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--peak-b)" stopOpacity=".38" />
          <stop offset="100%" stopColor="var(--peak-b)" stopOpacity=".05" />
        </linearGradient>
        <linearGradient id={id('mid')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--peak-a)" stopOpacity=".44" />
          <stop offset="100%" stopColor="var(--peak-a)" stopOpacity=".10" />
        </linearGradient>
        <linearGradient id={id('near')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--peak-c)" stopOpacity=".70" />
          <stop offset="100%" stopColor="var(--peak-c)" stopOpacity=".18" />
        </linearGradient>

        {/* The air in front of a ridge, mapped to that ridge's own box rather
            than to the card — so a low far one is veiled over the same
            fraction of itself as a tall near one, which is what distance
            actually does. */}
        <linearGradient id={id('haze')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--peak-surface)" stopOpacity="0" />
          <stop offset="42%" stopColor="var(--peak-surface)" stopOpacity=".14" />
          <stop offset="100%" stopColor="var(--peak-surface)" stopOpacity=".78" />
        </linearGradient>

        {/* Cloud, for the drifting band below. Soft at every edge, so it has
            nothing that can be seen to arrive or leave. */}
        <radialGradient id={id('cloud')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--peak-surface)" stopOpacity=".85" />
          <stop offset="55%" stopColor="var(--peak-surface)" stopOpacity=".38" />
          <stop offset="100%" stopColor="var(--peak-surface)" stopOpacity="0" />
        </radialGradient>

        {/* The art stops where its box does, and a tinted shape cut off by a
            straight vertical line reads as a bug in the card rather than as a
            range in the distance. So the whole thing is masked on its left and
            dissolves into the page instead of ending. */}
        <linearGradient id={id('edge')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="30%" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id={id('fade')}>
          <rect x="0" y="0" width="420" height="180" fill={`url(#${id('edge')})`} />
        </mask>
      </defs>

      <g mask={`url(#${id('fade')})`}>
        {/* Each ridge three times: the rock, the mist standing in front of its
            lower half, then the snow, which is above the mist and stays crisp.
            The drifting cloud sits between the far pair and the near one, where
            weather actually is — in front of the distance and behind the
            foreground. */}
        <g className="peak-layer peak-layer-far">
          <path fill={`url(#${id('far')})`} d={layers[0]!.d} />
          <path fill={`url(#${id('haze')})`} d={layers[0]!.d} />
          {layers[0]!.caps.map((snow, n) => (
            <path key={n} fill="var(--peak-snow)" fillOpacity=".48" d={snow} />
          ))}
        </g>

        <g className="peak-layer peak-layer-mid">
          <path fill={`url(#${id('mid')})`} d={layers[1]!.d} />
          <path fill={`url(#${id('haze')})`} d={layers[1]!.d} />
          {layers[1]!.caps.map((snow, n) => (
            <path key={n} fill="var(--peak-snow)" fillOpacity=".58" d={snow} />
          ))}
        </g>

        <g className="peak-weather" fill={`url(#${id('cloud')})`}>
          <ellipse className="peak-cloud peak-cloud-a" cx="0" cy="118" rx="86" ry="13" />
          <ellipse className="peak-cloud peak-cloud-b" cx="0" cy="136" rx="62" ry="10" />
        </g>

        <g className="peak-layer peak-layer-near">
          <path fill={`url(#${id('near')})`} d={layers[2]!.d} />
          <path fill={`url(#${id('haze')})`} d={layers[2]!.d} />
          {layers[2]!.caps.map((snow, n) => (
            <path key={n} fill="var(--peak-snow)" fillOpacity=".68" d={snow} />
          ))}
        </g>
      </g>
    </svg>
    </div>
  );
}

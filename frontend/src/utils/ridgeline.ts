/**
 * How a mountain is drawn, as two functions and nothing else.
 *
 * This was private to components/Range.tsx, which grows the scenery every page
 * opens with. It is here because a second thing now draws mountains and means
 * something different by them: components/Home/RidgeChart.tsx plots a series as
 * a range, so the landing page's charts and the app's wallpaper are the same
 * rock. Two copies of the rounding rule below would be two chances for the
 * chart to stop looking like the scenery, and nobody would notice until both
 * were on screen at once.
 *
 * Nothing here knows about colour, layers, animation or data. It takes points
 * and returns a `d`.
 */

/** A point on a ridgeline. */
export type Point = readonly [number, number];

/**
 * A ridgeline as a closed shape, from the summits and saddles it passes through.
 *
 * The first and last points sit on the drawing's edges and stay square; every
 * point between them is rounded, and by how much depends on which kind it is.
 * A summit — lower `y` than both its neighbours — gets a small radius, because
 * a peak is very nearly a corner and rounding it off is what turns a path into
 * a hill. A saddle gets a large one: the floor of a valley is where scree
 * collects, and it is the one part of a mountain that really is a curve.
 *
 * That asymmetry is the whole trick. A plain polyline draws the same corner at
 * the top and the bottom and reads as a sawtooth from across the room. Same
 * points, two radii, and it reads as rock.
 *
 * `floor` is the y the shape closes down to — the bottom of the box it is
 * being drawn in. It is a parameter rather than a constant because the two
 * callers draw at two sizes: a hero's range is 180 units tall and a chart in a
 * card is not.
 */
export function ridgePath(points: readonly Point[], floor: number): string {
  const at = (n: number) => points[n]!;
  const [firstX, firstY] = at(0);
  const [lastX] = at(points.length - 1);

  // How far back from a corner the curve starts, never more than it has room
  // for — a short segment between two close peaks must not round past its own
  // midpoint, or the two curves cross and the ridge folds over itself.
  const toward = ([x, y]: Point, [tx, ty]: Point, want: number): Point => {
    const span = Math.hypot(tx - x, ty - y);
    const step = Math.min(want, span / 2) / (span || 1);
    return [x + (tx - x) * step, y + (ty - y) * step];
  };

  let d = `M${firstX} ${firstY}`;
  for (let n = 1; n < points.length - 1; n += 1) {
    const here = at(n);
    const summit = here[1] < at(n - 1)[1] && here[1] < at(n + 1)[1];
    const want = summit ? 3.5 : 13;
    const [ix, iy] = toward(here, at(n - 1), want);
    const [ox, oy] = toward(here, at(n + 1), want);
    d += ` L${ix.toFixed(1)} ${iy.toFixed(1)} Q${here[0]} ${here[1]} ${ox.toFixed(1)} ${oy.toFixed(1)}`;
  }
  const [endX, endY] = at(points.length - 1);
  return `${d} L${endX} ${endY} L${lastX} ${floor} L${firstX} ${floor} Z`;
}

/**
 * The snow lying on a summit, hanging down its lee side.
 *
 * Ragged rather than triangular, and asymmetric — snow sits where the wind
 * does not reach, so a cap that is the same on both flanks looks drawn and one
 * that spills down one side looks seen. `size` is the drop in user units.
 *
 * Painted by its callers with `--peak-snow` rather than with the card's own
 * colour, and that is the one place the two have to differ. On white, the rock
 * is a pale tint and the card colour *is* snow. On the dark theme the rock is a
 * tint over near-black, which makes it lighter than the card — so a cap in the
 * card's colour came out as a dark notch cut into the summit, which is a hole
 * rather than snow.
 */
export function snowCap([x, y]: Point, size: number): string {
  const s = size / 20;
  return `M${x} ${y} l${20 * s} ${15 * s} l${-8 * s} ${2 * s}`
    + ` l${-6 * s} ${-4 * s} l${-7 * s} ${5 * s} l${-8 * s} ${-2 * s} Z`;
}

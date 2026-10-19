/**
 * The little drawings on the tiles, the timeline and the insight rows.
 *
 * Inline data URIs used as a **mask**, not as an image — the same trick
 * `.cal-ico` in styles/layout.css plays with the 80 calendar icons, and for the
 * same reason: the alpha is the shape and `currentColor` is the paint, so one
 * drawing sits legibly in a violet tile, an amber one, and on either theme
 * without a second copy of the file.
 *
 * Inline rather than files under utils/icons/ because these are a closed set of
 * nine belonging to one page. A drawing that only this page uses, living in the
 * shared icon folder, is how that folder got to 80 entries.
 */

/** Wraps a path in the stroke-style envelope all of these share. */
function stroke(body: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`,
  )}")`;
}

/** Solid shapes, where the drawing reads better filled than outlined. */
function solid(body: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='#000'>${body}</svg>`,
  )}")`;
}

export const GLYPHS = {
  /** Total XP, and the growth score — the page's "this is the headline" mark. */
  sparkle: solid(
    "<path d='M12 2l1.9 5.6a4 4 0 0 0 2.5 2.5L22 12l-5.6 1.9a4 4 0 0 0-2.5 2.5L12 22l-1.9-5.6a4 4 0 0 0-2.5-2.5L2 12l5.6-1.9a4 4 0 0 0 2.5-2.5z'/>",
  ),
  clock: stroke("<circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/>"),
  check: stroke("<circle cx='12' cy='12' r='9'/><path d='m8.5 12 2.5 2.5 4.5-5'/>"),
  calendar: stroke(
    "<rect x='3' y='4' width='18' height='17' rx='2'/><path d='M3 10h18M8 2v4M16 2v4'/>",
  ),
  trophy: stroke(
    "<path d='M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z'/><path d='M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3'/>",
  ),
  flame: solid(
    "<path d='M12 2s5 4.5 5 9a5 5 0 0 1-10 0c0-1.6.7-3 1.4-4 .2 1.3.9 2.2 1.8 2.2 1.1 0 1.6-.9 1.4-2.4C11.3 5.2 12 3.4 12 2z'/>",
  ),
  target: stroke("<circle cx='12' cy='12' r='9'/><circle cx='12' cy='12' r='5'/><circle cx='12' cy='12' r='1.4'/>"),
  lock: stroke("<rect x='5' y='11' width='14' height='10' rx='2'/><path d='M8 11V7a4 4 0 0 1 8 0v4'/>"),
  trend: stroke("<path d='M3 17 9 11l4 4 8-8'/><path d='M16 7h5v5'/>"),
  rocket: stroke(
    "<path d='M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2a2.8 2.8 0 0 0-3-3z'/><path d='M14.5 4.5C17 2 21 3 21 3s1 4-1.5 6.5L14 15l-5-5 5.5-5.5z'/><path d='m9 10-4 1 3.5 3.5L9 10z' opacity='.4'/>",
  ),
} as const;

export type GlyphName = keyof typeof GLYPHS;

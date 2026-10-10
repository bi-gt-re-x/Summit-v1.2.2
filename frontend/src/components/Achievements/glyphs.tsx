/**
 * The badge wall's drawings — one per badge, and the tables that pick them.
 *
 * Lifted out of the badge wall (components/Achievements/BadgeWall.tsx) when the art stopped being a handful of
 * shapes. Inline rather than files under utils/icons/, for the reason
 * components/Analytics/glyphs.ts gives for doing the same: a closed set
 * belonging to one page, living in the shared icon folder, is how that folder
 * got to 80 entries. Stroked in `currentColor` so one drawing sits legibly in
 * a green hexagon, a gold one, and on either theme without a second copy.
 *
 * ## Every badge has its own
 *
 * It did not. There were forty drawings for a hundred and forty-nine badges,
 * and the rest fell back to their metric — so the seven streak badges were
 * seven identical flames, the six tree-progress badges six identical lattices,
 * and a wall whose whole job is to be looked at had one picture for every four
 * things on it. A row of tiles that differ only in their text is a list with
 * decoration, not a wall.
 *
 * `BADGE_GLYPH` now names all 149. Where a family escalates, so does its art:
 * the streak runs spark, flame, torch, bonfire, comet; the mountains climb
 * from a footprint to a range of peaks. That is the point of the picture —
 * "Two Months Deep" and "Year of Fire" are different achievements and should
 * not be the same object in a different shade.
 *
 * `tests/test_achievement_art.py` asserts the table covers the catalogue, so a
 * badge added in backend/api/achievements.py without a drawing fails a test
 * rather than quietly turning into a fallback star.
 *
 * METRIC_GLYPH stays as the floor under all of it: it is what a badge gets
 * between being added to the catalogue and being drawn.
 */
import type { ReactNode } from 'react';

import type { Badge, Category, Metric } from '@/services/achievements';


// --------------------------------------------------------------------------
// The drawings
// --------------------------------------------------------------------------
/**
 * The drawings, inline and stroked in `currentColor`.
 *
 * Inline rather than files under utils/icons/ for the reason
 * components/Analytics/glyphs.ts gives for doing the same: a closed set
 * belonging to one page, living in the shared icon folder, is how that folder
 * got to 80 entries. Stroked in `currentColor` so one drawing sits legibly in
 * a green hexagon, a gold one, and on either theme without a second copy.
 *
 * Two sets, and the split is the rule for using them. The first is one drawing
 * per metric — the flame for a streak, the clock for focus — and every badge
 * falls back to its own. The second is for the badges whose name promises a
 * picture the metric does not: a mountain for The Long Haul, coins for Six
 * Figures, a shelf for A Library of Your Own. See METRIC_GLYPH and BADGE_GLYPH.
 */
export const GLYPH = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2.5" />
      <path d="M8.5 11V8a3.5 3.5 0 017 0v3" />
    </>
  ),
  bolt: <path d="M13 2 4.5 13.5H11l-1 8.5L19 10.5h-6.5L13 2Z" />,
  star: <path d="m12 2.6 2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45l-5.8 3.05 1.1-6.45-4.7-4.6 6.5-.95z" />,
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
      <path d="M3 10h18M8 2.5v4M16 2.5v4" />
    </>
  ),
  calendarCheck: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
      <path d="M3 10h18M8 2.5v4M16 2.5v4m-6.5 9 2 2 4-4" />
    </>
  ),
  sparkle: (
    <path d="M12 2.5l1.8 5.3a4 4 0 002.4 2.4l5.3 1.8-5.3 1.8a4 4 0 00-2.4 2.4L12 21.5l-1.8-5.3a4 4 0 00-2.4-2.4L2.5 12l5.3-1.8a4 4 0 002.4-2.4z" />
  ),
  levelUp: <path d="m5 13.5 7-7 7 7M5 20l7-7 7 7" />,
  lattice: (
    <>
      <path d="M12 6.6v4.2m0 0L6.8 15m5.2-4.2L17.2 15" />
      <circle cx="12" cy="4.6" r="2.1" />
      <circle cx="6" cy="17" r="2.1" />
      <circle cx="18" cy="17" r="2.1" />
    </>
  ),
  flame: <path d="M12 22a6.5 6.5 0 006.5-6.5c0-5-5-7-4.5-13-4 2.2-6.5 5.6-6.5 9.5a4 4 0 01-1.2-2.7S5.5 12.5 5.5 15.5A6.5 6.5 0 0012 22Z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" />
    </>
  ),
  sunrise: <path d="M17.5 19a5.5 5.5 0 00-11 0M12 2.5v4.5M4.4 9.4l1.5 1.5m12.2-1.5-1.5 1.5M2 19h2m16 0h2M3.5 22.5h17" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2v2.6m0 14.8V22M4.2 4.2l1.9 1.9m11.8 11.8 1.9 1.9M2 12h2.6m14.8 0H22M4.2 19.8l1.9-1.9M17.9 6.1l1.9-1.9" />
    </>
  ),
  moon: <path d="M20.5 14.8A8.6 8.6 0 019.2 3.5a8.6 8.6 0 1011.3 11.3Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.8V12l3.4 2" />
    </>
  ),
  layers: <path d="m12 2.8 8.6 4.6L12 12 3.4 7.4 12 2.8Zm-8.6 9.6L12 17l8.6-4.6M3.4 16.8 12 21.4l8.6-4.6" />,
  book: (
    <>
      <path d="M4 5A2.5 2.5 0 016.5 2.5H20v16H6.5A2.5 2.5 0 004 21z" />
      <path d="M4 18.5A2.5 2.5 0 016.5 16H20" />
    </>
  ),
  medal: (
    <>
      <circle cx="12" cy="14.5" r="6.2" />
      <path d="M8.6 8.9 6 2.5h12l-2.6 6.4" />
    </>
  ),
  trophy: (
    <>
      <path d="M7.5 3.5h9v5.5a4.5 4.5 0 01-9 0z" />
      <path d="M16.5 4.8h3.2v1.9a3.2 3.2 0 01-3.2 3.2M7.5 4.8H4.3v1.9a3.2 3.2 0 003.2 3.2M12 13.5v4.2M8.5 20.5h7" />
    </>
  ),

  /* The second set: drawings for the badges whose name is about something
     more particular than the metric they are counted on. See BADGE_GLYPH. */
  flag: (
    <>
      <path d="M5.5 21.5V3" />
      <path d="M5.5 4.2h11.8l-2.4 3.9 2.4 3.9H5.5z" />
    </>
  ),
  checklist: (
    <>
      <path d="M3.5 6.6 5 8.1 8 5.1M3.5 12.6 5 14.1 8 11.1M3.5 18.6 5 20.1 8 17.1" />
      <path d="M11.5 6.6h9M11.5 12.6h9M11.5 18.6h9" />
    </>
  ),
  dumbbell: <path d="M2.5 12H5m14 0h2.5M6 8.5v7m12-7v7M9 6.5v11m6-11v11M9 12h6" />,
  bars: <path d="M3.5 20.5h17M6.5 20.5v-4.5M11 20.5v-9M15.5 20.5v-6M20 20.5V6" />,
  trendUp: <path d="M3.5 16.5 9 11l3.5 3.5L20.5 6.5M15.5 6.5h5v5" />,
  mountain: <path d="M2.5 19.5h19L14.6 6.8l-3.3 5.6-2.1-2.7z" />,
  shield: <path d="M12 2.5 20 6v6.2c0 4.8-3.3 7.9-8 9.3-4.7-1.4-8-4.5-8-9.3V6z" />,
  gauge: (
    <>
      <path d="M3.5 18.5a8.5 8.5 0 1 1 17 0" />
      <path d="M12 14.8 16.6 9" />
      <circle cx="12" cy="16.2" r="1.4" />
    </>
  ),
  burst: <path d="M12 2.5v6M12 15.5v6M2.5 12h6m6.5 0h6M5.3 5.3l4.2 4.2m5 5 4.2 4.2M18.7 5.3l-4.2 4.2m-5 5-4.2 4.2" />,
  crown: <path d="M2.8 8.2 6.6 11.6 12 4.5l5.4 7.1 3.8-3.4L19 19.5H5z" />,
  gem: (
    <>
      <path d="M12 2.8 21 9.4 12 21.2 3 9.4z" />
      <path d="M3 9.4h18M8.1 9.4 12 2.8l3.9 6.6M8.1 9.4 12 21.2l3.9-11.8" />
    </>
  ),
  infinity: <path d="M6.6 8.4a3.6 3.6 0 1 0 0 7.2c3.6 0 5.2-7.2 8.8-7.2a3.6 3.6 0 1 1 0 7.2c-3.6 0-5.2-7.2-8.8-7.2z" />,
  hourglass: (
    <>
      <path d="M6.5 2.5h11M6.5 21.5h11" />
      <path d="M7.6 2.5v3.1c0 2.4 4.4 4.3 4.4 6.4s-4.4 4-4.4 6.4v3.1M16.4 2.5v3.1c0 2.4-4.4 4.3-4.4 6.4s4.4 4 4.4 6.4v3.1" />
    </>
  ),
  stopwatch: (
    <>
      <circle cx="12" cy="13.8" r="7.7" />
      <path d="M12 9.8v4l2.6 1.6M9.5 2.5h5M12 2.5v3.6M18.9 5.4l1.7-1.7" />
    </>
  ),
  seedling: (
    <>
      <path d="M12 21.5v-7.2" />
      <path d="M12 14.3C12 9.9 8.6 7.4 4.6 7.4c0 4.4 3.3 6.9 7.4 6.9zM12 14.3c0-3.6 2.9-6.5 6.6-6.5 0 3.6-3 6.5-6.6 6.5z" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7.6" height="7.6" rx="1.8" />
      <rect x="13.4" y="3" width="7.6" height="7.6" rx="1.8" />
      <rect x="3" y="13.4" width="7.6" height="7.6" rx="1.8" />
      <rect x="13.4" y="13.4" width="7.6" height="7.6" rx="1.8" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.7 2.7 2.7 15.3 0 18M12 3c-2.7 2.7-2.7 15.3 0 18" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.8 8.2 13.7 13.7 8.2 15.8 10.3 10.3z" />
    </>
  ),
  pen: <path d="M4 20.5 5.1 16 16.6 4.5a2.1 2.1 0 0 1 3 3L8.1 19z" />,
  books: (
    <>
      <rect x="3.2" y="4" width="4.6" height="16" rx="1.3" />
      <rect x="9.6" y="4" width="4.6" height="16" rx="1.3" />
      <path d="m16.5 5.2 4.3 1.1L17.6 20l-4.3-1.1z" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="3.5" width="18" height="4.6" rx="1.5" />
      <path d="M4.6 8.1v10a2.5 2.5 0 0 0 2.5 2.5h9.8a2.5 2.5 0 0 0 2.5-2.5v-10M9.6 12.6h4.8" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="12" cy="6.4" rx="7.6" ry="3.1" />
      <path d="M4.4 6.4v5.2c0 1.7 3.4 3.1 7.6 3.1s7.6-1.4 7.6-3.1V6.4M4.4 11.6v5.2c0 1.7 3.4 3.1 7.6 3.1s7.6-1.4 7.6-3.1v-5.2" />
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="8.8" r="6.3" />
      <path d="M8.2 14.1 6.4 21.5 12 18.4l5.6 3.1-1.8-7.4" />
    </>
  ),
  podium: (
    <>
      <rect x="9" y="6.8" width="6" height="14" rx="1" />
      <rect x="2.8" y="11.8" width="6" height="9" rx="1" />
      <rect x="15.2" y="14.8" width="6" height="6" rx="1" />
    </>
  ),
  moonStar: (
    <>
      <path d="M20.6 15.4A8.4 8.4 0 0 1 9.4 4.2a8.4 8.4 0 1 0 11.2 11.2Z" />
      <path d="m17.4 2.5.9 2.1 2.2.9-2.2.9-.9 2.1-.9-2.1-2.2-.9 2.2-.9z" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 2.4c3.3 2.5 5.1 6.1 5.1 10.1L14.5 15h-5l-2.6-2.5c0-4 1.8-7.6 5.1-10.1z" />
      <circle cx="12" cy="9.6" r="1.9" />
      <path d="M9.5 15 7 17.6v3.9l2.7-1.6M14.5 15l2.5 2.6v3.9l-2.7-1.6" />
    </>
  ),

  /* ---- Added when every badge was given its own drawing ----------------
     Fifty-one shapes, because a hundred and forty-nine badges cannot be
     told apart by forty. Each reads at the sixteen pixels a tile’s
     hexagon actually gives it, which is what rules out anything with a
     face, a hand, or more than about six strokes. */
  doubleCheck: <path d="m2 13 4 4 7-8M11.5 17.5 13 19l9-11" />,
  anvil: <path d="M4 8h9a5 5 0 0 0 5 4h2a7 7 0 0 1-6 4H9l-1 4h9M8 8V6h4" />,
  calculator: (
    <>
      <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
      <path d="M8.5 6.5h7M8.5 11h1.5M11.5 11H13M8.5 14.5H10M11.5 14.5H13M8.5 18H10M11.5 18h4" />
    </>
  ),
  abacus: (
    <>
      <path d="M4 3v18M20 3v18M4 8h16M4 13h16M4 18h16" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="13" cy="13" r="1.5" />
      <circle cx="16.5" cy="18" r="1.5" />
    </>
  ),
  signpost: <path d="M12 2.5v19M12 5.5h7l2.2 2.8L19 11h-7M12 13H5l-2.2 2.8L5 18.6h7" />,
  scales: (
    <>
      <path d="M12 4v16M8.5 20h7M4.5 7.5h15M4.5 7.5 2 13.5a2.8 2.8 0 0 0 5 0zM19.5 7.5 22 13.5a2.8 2.8 0 0 1-5 0z" />
      <circle cx="12" cy="5" r="1.4" />
    </>
  ),
  spark: <path d="M12 4.5v4M12 15.5v4M4.5 12h4M15.5 12h4M7.4 7.4l2.5 2.5M14.1 14.1l2.5 2.5M16.6 7.4l-2.5 2.5M9.9 14.1l-2.5 2.5" />,
  torch: (
    <>
      <path d="M12 12.5a3.4 3.4 0 0 0 3.4-3.4C15.4 6.4 12 2.5 12 2.5S8.6 6.4 8.6 9.1A3.4 3.4 0 0 0 12 12.5Z" />
      <path d="M9.6 12.8 11 21.5h2l1.4-8.7" />
    </>
  ),
  bonfire: (
    <>
      <path d="M12 17.5a4 4 0 0 0 4-4c0-2.8-4-7-4-7s-4 4.2-4 7a4 4 0 0 0 4 4Z" />
      <path d="m3.5 21 17-3.4M20.5 21 3.5 17.6" />
    </>
  ),
  candle: (
    <>
      <path d="M9 21h6M9.5 9.5h5V21h-5z" />
      <path d="M12 9.5V7M12 7c1.6-1.1 1.6-2.5 0-4-1.6 1.5-1.6 2.9 0 4Z" />
    </>
  ),
  comet: (
    <>
      <circle cx="16.5" cy="7.5" r="3.6" />
      <path d="m13.4 10.6-9 9M10.6 8.6 5.4 10.8M15.4 13.4l-2.2 5.2" />
    </>
  ),
  orbit: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <ellipse cx="12" cy="12" rx="10" ry="4.6" transform="rotate(-28 12 12)" />
      <circle cx="20" cy="8" r="1.5" />
    </>
  ),
  planet: (
    <>
      <circle cx="12" cy="11" r="5.8" />
      <ellipse cx="12" cy="11" rx="10.8" ry="3.4" transform="rotate(-20 12 11)" />
    </>
  ),
  footprints: (
    <>
      <ellipse cx="7.5" cy="8" rx="2.6" ry="4" transform="rotate(-12 7.5 8)" />
      <ellipse cx="16" cy="15.5" rx="2.6" ry="4" transform="rotate(12 16 15.5)" />
    </>
  ),
  stairs: <path d="M2.5 20.5V17h5v-3.5h5V10h5V6.5h4" />,
  heart: <path d="M12 20.5S4 15.8 4 10.6A4.5 4.5 0 0 1 12 7.8a4.5 4.5 0 0 1 8 2.8c0 5.2-8 9.9-8 9.9Z" />,
  ribbon: (
    <>
      <circle cx="12" cy="8.5" r="5.2" />
      <path d="m8.7 12.6-2 8.4 5.3-3.1 5.3 3.1-2-8.4" />
    </>
  ),
  wreath: (
    <>
      <path d="M7.5 19.5A9 9 0 0 1 7.5 4.5M16.5 4.5a9 9 0 0 1 0 15M9.5 21h5" />
      <path d="m12 7.5 1.5 3 3.2.5-2.3 2.3.6 3.2-3-1.6-3 1.6.6-3.2L7.3 11l3.2-.5z" />
    </>
  ),
  bullseye: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.8" />
      <circle cx="12" cy="12" r="1.4" />
    </>
  ),
  bell: (
    <>
      <path d="M18.5 16.5h-13l1.7-2.9V10a4.8 4.8 0 0 1 9.6 0v3.6z" />
      <path d="M9.8 19.5a2.4 2.4 0 0 0 4.4 0" />
    </>
  ),
  alarm: (
    <>
      <circle cx="12" cy="13.5" r="6.8" />
      <path d="M12 10v3.8l2.5 1.7M5.2 4.2 2.5 6.6M18.8 4.2l2.7 2.4M8 20.5l-1.5 2M16 20.5l1.5 2" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 2.8 19 5.8v5.4c0 4.5-3 7.6-7 9.6-4-2-7-5.1-7-9.6V5.8z" />
      <path d="m9 11.8 2.3 2.3 4.2-4.6" />
    </>
  ),
  pieChart: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 3.4V12h8.6" />
    </>
  ),
  telescope: (
    <>
      <path d="m2.8 13.2 12.4-6.4 2.6 5-12.4 6.4z" />
      <path d="m18.5 5.8 2.7 1.4-1.3 2.6M9 16.4 8 21.5M13 14.4l3 6.9" />
    </>
  ),
  anchor: (
    <>
      <circle cx="12" cy="4.6" r="2.1" />
      <path d="M12 6.7v14.1M7.5 10.5h9M3.6 12.5a8.4 8.4 0 0 0 16.8 0" />
    </>
  ),
  battery: (
    <>
      <rect x="2" y="8" width="17" height="8.6" rx="2.6" />
      <path d="M21.6 11.2v2.2M5.6 11v2.6M9.1 11v2.6M12.6 11v2.6" />
    </>
  ),
  mug: (
    <>
      <path d="M4 7.5h12v6.6a5.2 5.2 0 0 1-10.4 0z" />
      <path d="M16 9.6h2.4a2.6 2.6 0 0 1 0 5.2H16M5 20.5h13" />
    </>
  ),
  bookmark: <path d="M6.5 3h11v18l-5.5-4-5.5 4z" />,
  ladder: <path d="M8 2.5v19M16 2.5v19M8 7h8M8 12h8M8 17h8" />,
  brain: (
    <>
      <path d="M12 5.6A3.1 3.1 0 0 0 6.6 8v1A2.9 2.9 0 0 0 6 14.4 3.3 3.3 0 0 0 12 17M12 5.6A3.1 3.1 0 0 1 17.4 8v1a2.9 2.9 0 0 1 .6 5.4A3.3 3.3 0 0 1 12 17" />
      <path d="M12 5.6V19" />
    </>
  ),
  thermometer: (
    <>
      <path d="M14.6 13.8V5.1a2.6 2.6 0 1 0-5.2 0v8.7a4.4 4.4 0 1 0 5.2 0Z" />
      <path d="M12 8.5v6.6" />
    </>
  ),
  atom: (
    <>
      <circle cx="12" cy="12" r="2" />
      <ellipse cx="12" cy="12" rx="9.6" ry="3.9" />
      <ellipse cx="12" cy="12" rx="9.6" ry="3.9" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9.6" ry="3.9" transform="rotate(-60 12 12)" />
    </>
  ),
  quill: (
    <>
      <path d="M20.8 2.8C12.4 4 7 9.2 5 16.6l2.2 2.2C14.6 16.8 19.8 11.4 20.8 2.8Z" />
      <path d="m4.2 20.4 4.2-4.2" />
    </>
  ),
  scroll: (
    <>
      <path d="M6.5 3.5h11v14.8a2.7 2.7 0 0 1-2.7 2.7H7a3.2 3.2 0 0 0 3.2-3.2V3.5" />
      <path d="M6.5 3.5A2.7 2.7 0 0 0 3.8 6.2v2.1h4" />
      <path d="M10.5 8h4M10.5 12h4" />
    </>
  ),
  leaf: (
    <>
      <path d="M20.4 3.6c.6 9.3-4.3 13.8-10.6 13.8a7 7 0 0 1-4.3-1.4c-.5-7.9 4.4-12.4 14.9-12.4Z" />
      <path d="M4.5 20.5c3.8-5.2 7.2-7.7 12.4-10" />
    </>
  ),
  branch: (
    <>
      <path d="M5 21C5 12 9 6 19 3" />
      <path d="M9.6 12.5c-.4-2.6.9-4.5 4.4-5.2M7.2 17.2c-1.9-1.2-2.4-3-1.6-5.6M13.8 8c.3-2.3 1.9-3.6 4.9-4" />
    </>
  ),
  tree: (
    <>
      <path d="m12 2.8 5.4 7.4h-2.8l4 5.6H5.4l4-5.6H6.6z" />
      <path d="M12 15.8v5.4M9 21.2h6" />
    </>
  ),
  forest: (
    <>
      <path d="m8 2.6 3.8 5.6H9.4l2.8 4.4H3.8l2.8-4.4H4.2z" />
      <path d="M8 12.6v3.4" />
      <path d="m16.8 8 3.4 5.2h-2.2l2.6 4.2h-7.6l2.6-4.2h-2.2z" />
      <path d="M16.8 17.4v3.8" />
    </>
  ),
  roots: (
    <>
      <path d="m12 3 2.8 3.9h-1.5L15.4 11H8.6l2.1-4.1H9.2z" />
      <path d="M12 11v3.5M12 14.5c0 2.6-2 3.4-4 4.2M12 14.5c0 2.6 2 3.4 4 4.2M12 14.5v6.5" />
    </>
  ),
  fields: (
    <>
      <rect x="2.8" y="3.6" width="8" height="7" rx="1.4" />
      <rect x="13.2" y="3.6" width="8" height="7" rx="1.4" />
      <rect x="2.8" y="13.4" width="8" height="7" rx="1.4" />
      <rect x="13.2" y="13.4" width="8" height="7" rx="1.4" />
    </>
  ),
  atlas: (
    <>
      <path d="M3.6 5.2 9 3.4l6 1.8 5.4-1.8v15.2L15 20.4l-6-1.8-5.4 1.8z" />
      <path d="M9 3.4v15.2M15 5.2v15.2" />
    </>
  ),
  map: (
    <>
      <path d="m3.4 6.4 5.8-2.2 5.6 2.2 5.8-2.2v13.4l-5.8 2.2-5.6-2.2-5.8 2.2z" />
      <path d="M9.2 4.2v15.6M14.8 6.4V22" />
    </>
  ),
  shelf: (
    <>
      <path d="M3.5 3.5v17M20.5 3.5v17M3.5 12h17M3.5 20.5h17" />
      <path d="M7 5.5v6.5M10 5.5v6.5M13.5 6.5v5.5M16.5 5.5v6.5M7 14v6M10.5 14v6M14 15v5" />
    </>
  ),
  puzzle: <path d="M10.2 3.5h4.2a1.6 1.6 0 0 1 1.6 1.7c1.9 0 3.5 1 3.5 2.5s-1.6 2.5-3.5 2.5v4.4a1.7 1.7 0 0 1-1.7 1.6c0 2-1 3.6-2.5 3.6s-2.5-1.6-2.5-3.6a1.7 1.7 0 0 1-1.7-1.6H4.6v-4.4c2 0 3.5-1 3.5-2.5S6.6 5.2 4.6 5.2h4v-.1a1.6 1.6 0 0 1 1.6-1.6Z" />,
  tent: (
    <>
      <path d="m12 3.8 8.4 16.4H3.6z" />
      <path d="M12 3.8v16.4M12 20.2l4.4-8.6M12 20.2 7.6 11.6" />
    </>
  ),
  peakFlag: (
    <>
      <path d="m2.6 20.2 5.8-10 3.4 5.4 2.4-3.8 7.2 8.4z" />
      <path d="M14.2 11.8V2.6l4.6 2.3-4.6 2.3" />
    </>
  ),
  peaks: (
    <>
      <path d="m1.8 20.2 5.2-8.4 3.2 4.8 4.2-7.2 7.8 10.8z" />
      <path d="m7 11.8 2-3.4 1.2 2" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8.4" r="4" />
      <path d="m10.9 11.3 9.3 9.3M17.4 17.8l2.2-2.2M14.6 15l2.2-2.2" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="5.8" r="2.6" />
      <circle cx="18" cy="18.2" r="2.6" />
      <path d="M8.6 5.8h5.6a3.4 3.4 0 0 1 0 6.8H9.8a3.4 3.4 0 0 0 0 6.8h5.6" />
    </>
  ),
  lineChart: (
    <>
      <path d="M3.4 20.6h17.2M3.4 3.4v17.2" />
      <path d="m6 16.4 4-5 3.4 2.6 5.2-7" />
      <circle cx="6" cy="16.4" r="1.3" />
      <circle cx="13.4" cy="14" r="1.3" />
      <circle cx="18.6" cy="7" r="1.3" />
    </>
  ),
  certificate: (
    <>
      <rect x="2.8" y="3.6" width="18.4" height="11.4" rx="2.2" />
      <path d="M6.4 7.6h8M6.4 11h5" />
      <circle cx="16.8" cy="14.6" r="2.8" />
      <path d="m14.8 16.8-1 4.6 3-1.6 3 1.6-1-4.6" />
    </>
  ),
} satisfies Record<string, ReactNode>;

/**
 * What a badge is measured on decides what it is drawn as.
 *
 * By metric rather than one drawing hand-assigned per badge: a hundred hand
 * assignments is a hundred chances for the picture to disagree with the rule,
 * and a reader who learns that the flame means a streak has learned it for all
 * seven streak badges at once. Several metrics share a drawing where they
 * genuinely mean the same thing — three ways of counting focus are all a
 * clock — because inventing a distinct picture for each would be drawing a
 * distinction the badges do not make.
 */
const METRIC_GLYPH: Record<Metric, ReactNode> = {
  tasks: GLYPH.check,
  priority: GLYPH.bolt,
  day_tasks: GLYPH.star,
  events: GLYPH.calendar,
  xp: GLYPH.sparkle,
  day_xp: GLYPH.sparkle,
  level: GLYPH.levelUp,
  streak: GLYPH.flame,
  active_days: GLYPH.calendarCheck,
  perfect_days: GLYPH.target,
  months: GLYPH.calendar,
  early: GLYPH.sunrise,
  weekend: GLYPH.sun,
  night: GLYPH.moon,
  focus: GLYPH.clock,
  focus_days: GLYPH.clock,
  focus_best: GLYPH.clock,
  subjects: GLYPH.layers,
  trees: GLYPH.lattice,
  trees_deep: GLYPH.lattice,
  tree_best: GLYPH.lattice,
  /* The three newer tree ladders take their own drawing rather than a fourth
     lattice. Covering one outright is a summit, breadth across fields is a
     globe, and the running total is a stack — a section of thirty-one badges
     all wearing the same mark is a section nobody can scan. */
  trees_done: GLYPH.mountain,
  tree_groups: GLYPH.globe,
  tree_xp: GLYPH.layers,
  /* The graded half. A score is a gauge, a rate is a chart, and rating your
     own work is a pen. */
  growth_score: GLYPH.gauge,
  productivity_score: GLYPH.gauge,
  quality_score: GLYPH.gem,
  consistency_score: GLYPH.gauge,
  efficiency_score: GLYPH.stopwatch,
  focus_score: GLYPH.target,
  consistency_rate: GLYPH.bars,
  on_time: GLYPH.clock,
  rated: GLYPH.pen,
  notes: GLYPH.book,
  goals: GLYPH.target,
  records: GLYPH.medal,
};

/**
 * Every badge's own drawing, in catalogue order.
 *
 * All 149 of them. It used to be 40 exceptions over a fallback to the metric,
 * which meant the seven streak badges were seven identical flames and the six
 * tree-progress badges six identical lattices — a wall whose whole job is to
 * be looked at, with one picture for every four things on it.
 *
 * Where a family climbs, the drawing climbs with it. The streak runs spark,
 * flame, torch, bonfire, comet, sun, orbit — a year being one trip round. The
 * mountains go footprints, stairs, ladder, an arrow, a tent, a flag on the
 * top. That progression is the argument for drawing each one: "Two Months
 * Deep" and "Year of Fire" are different achievements and should not be the
 * same object in a different shade.
 *
 * Nothing here is unique across the whole wall — 149 distinct shapes that
 * still read at sixteen pixels do not exist, and inventing them would mean
 * drawings that say nothing about their badge. What is guaranteed, and what
 * tests/test_achievement_art.py holds, is that no two badges sharing a metric
 * or a category share a drawing: any two you can see at once are different.
 */
const BADGE_GLYPH: Record<string, ReactNode> = {

  // ---- Productivity --------------------------------------------------
  'first-task':   GLYPH.flag,           // First Step
  'tasks-10':     GLYPH.check,          // Warmed Up
  'tasks-50':     GLYPH.checklist,      // Half a Hundred
  'tasks-100':    GLYPH.doubleCheck,    // Century
  'tasks-250':    GLYPH.bars,           // Quarter Thousand
  'tasks-500':    GLYPH.anvil,          // Task Crusher
  'tasks-1000':   GLYPH.calculator,     // Four Figures
  'tasks-2500':   GLYPH.route,          // The Long Haul
  'hard-10':      GLYPH.signpost,       // Triage
  'hard-50':      GLYPH.dumbbell,       // Heavy Lifter
  'hard-200':     GLYPH.shield,         // Firefighter
  'day-5':        GLYPH.sun,            // Productive Day
  'day-10':       GLYPH.abacus,         // Double Digits
  'day-20':       GLYPH.burst,          // Relentless
  'day-30':       GLYPH.gauge,          // Machine Mode
  'events-10':    GLYPH.calendar,       // Scheduled
  'events-50':    GLYPH.calendarCheck,  // Calendar Keeper
  'events-200':   GLYPH.crown,          // Master of the Week

  // ---- Consistency ---------------------------------------------------
  'streak-3':     GLYPH.spark,          // Three in a Row
  'streak-7':     GLYPH.flame,          // Week Warrior
  'streak-14':    GLYPH.torch,          // Two Weeks Strong
  'streak-30':    GLYPH.bonfire,        // Unstoppable
  'streak-60':    GLYPH.comet,          // Two Months Deep
  'streak-100':   GLYPH.sun,            // Hundred Days
  'streak-365':   GLYPH.orbit,          // Year of Fire
  'days-30':      GLYPH.footprints,     // Regular
  'days-100':     GLYPH.stairs,         // Hundred Days In
  'days-250':     GLYPH.heart,          // Devoted
  'days-500':     GLYPH.ribbon,         // Half a Thousand Days
  'goal-day-5':   GLYPH.target,         // On Target
  'goal-day-25':  GLYPH.bullseye,       // Consistent Aim
  'goal-day-100': GLYPH.award,          // Dead Centre
  'goal-day-250': GLYPH.wreath,         // Unerring
  'early-10':     GLYPH.sunrise,        // Early Bird
  'early-50':     GLYPH.bell,           // Dawn Patrol
  'early-200':    GLYPH.alarm,          // Sunrise Discipline
  'weekend-10':   GLYPH.shieldCheck,    // Weekend Warrior
  'weekend-50':   GLYPH.infinity,       // No Days Off
  'weekend-150':  GLYPH.scroll,         // Saturday Scholar
  'months-3':     GLYPH.pieChart,       // Quarter Year
  'months-6':     GLYPH.moon,           // Half a Year
  'months-12':    GLYPH.planet,         // Full Circle

  // ---- Learning ------------------------------------------------------
  'focus-1':      GLYPH.stopwatch,      // First Hour
  'focus-10':     GLYPH.clock,          // Ten Deep
  'focus-50':     GLYPH.layers,         // Fifty Down
  'focus-100':    GLYPH.telescope,      // Knowledge Seeker
  'focus-250':    GLYPH.anchor,         // Deep Diver
  'focus-500':    GLYPH.battery,        // Five Hundred Hours
  'focus-1000':   GLYPH.mountain,       // The Thousand
  'fdays-10':     GLYPH.mug,            // Showing Up
  'fdays-50':     GLYPH.bookmark,       // Fifty Sittings
  'fdays-150':    GLYPH.ladder,         // Practiced
  'fdays-365':    GLYPH.tree,           // A Year of Focus
  'deep-3':       GLYPH.hourglass,      // Long Session
  'deep-6':       GLYPH.brain,          // Marathon Mind
  'deep-10':      GLYPH.thermometer,    // All Day Deep
  'subj-3':       GLYPH.seedling,       // Broadening
  'subj-8':       GLYPH.atom,           // Well Rounded
  'subj-15':      GLYPH.globe,          // Renaissance
  'subj-25':      GLYPH.compass,        // Wide Field
  'notes-1':      GLYPH.pen,            // First Note
  'notes-10':     GLYPH.quill,          // Note Taker
  'notes-50':     GLYPH.book,           // Notebook Filler
  'notes-200':    GLYPH.archive,        // Archivist
  'notes-500':    GLYPH.books,          // A Library of Your Own

  // ---- Mastery -------------------------------------------------------
  'trees-1':      GLYPH.lattice,        // First Lattice
  'trees-3':      GLYPH.grid,           // Three Fronts
  'trees-5':      GLYPH.puzzle,         // Five Lattices
  'trees-8':      GLYPH.signpost,       // Broad Front
  'trees-15':     GLYPH.forest,         // Wide Curriculum
  'trees-25':     GLYPH.shelf,          // Whole Shelf
  'trees-40':     GLYPH.map,            // Cartography
  'tree-10':      GLYPH.footprints,     // First Steps Up
  'tree-25':      GLYPH.stairs,         // Foot in the Door
  'tree-50':      GLYPH.ladder,         // Halfway Up
  'tree-75':      GLYPH.trendUp,        // Three Quarters
  'tree-90':      GLYPH.tent,           // Near the Summit
  'tree-100':     GLYPH.peakFlag,       // Topped Out
  'deep-trees-1': GLYPH.seedling,       // Depth
  'deep-trees-2': GLYPH.roots,          // Two Deep
  'deep-trees-3': GLYPH.layers,         // Three Deep
  'deep-trees-6': GLYPH.key,            // Specialist
  'deep-trees-10':GLYPH.peaks,          // Many Mountains
  'deep-trees-15':GLYPH.telescope,      // A Range of Peaks
  'trees-done-1': GLYPH.mountain,       // Summit
  'trees-done-2': GLYPH.medal,          // Two Summits
  'trees-done-5': GLYPH.wreath,         // Five Summits
  'trees-done-10':GLYPH.crown,          // The Whole Range
  'tgroup-2':     GLYPH.route,          // Two Fields
  'tgroup-4':     GLYPH.compass,        // Four Fields
  'tgroup-6':     GLYPH.fields,         // Six Fields
  'tgroup-9':     GLYPH.globe,          // Every Field
  'treexp-1':     GLYPH.leaf,           // A Tree’s Worth
  'treexp-3':     GLYPH.branch,         // Three Trees’ Worth
  'treexp-8':     GLYPH.tree,           // Eight Trees’ Worth
  'treexp-20':    GLYPH.atlas,          // Twenty Trees’ Worth

  // ---- Milestones ----------------------------------------------------
  'xp-1000':      GLYPH.spark,          // Getting Going
  'xp-5000':      GLYPH.bolt,           // Five Thousand
  'xp-10000':     GLYPH.star,           // Ten Thousand
  'xp-25000':     GLYPH.sparkle,        // Twenty-Five K
  'xp-50000':     GLYPH.coins,          // Fifty Thousand
  'xp-100000':    GLYPH.gem,            // Six Figures
  'xp-250000':    GLYPH.crown,          // Quarter Million
  'xp-500000':    GLYPH.orbit,          // Half a Million
  'level-5':      GLYPH.levelUp,        // Level Five
  'level-10':     GLYPH.stairs,         // Level Ten
  'level-25':     GLYPH.ladder,         // Ascending
  'level-50':     GLYPH.trendUp,        // Halfway to a Hundred
  'level-75':     GLYPH.rocket,         // Seventy-Five
  'level-100':    GLYPH.medal,          // Centurion
  'level-150':    GLYPH.comet,          // Beyond
  'dayxp-500':    GLYPH.sunrise,        // Big Day
  'dayxp-1500':   GLYPH.sun,            // Huge Day
  'dayxp-3000':   GLYPH.burst,          // Record Day
  'goal-1':       GLYPH.flag,           // Goal Getter
  'goal-5':       GLYPH.target,         // Five Reached
  'goal-15':      GLYPH.award,          // Goal Machine
  'goal-30':      GLYPH.trophy,         // Thirty Down
  'goal-50':      GLYPH.wreath,         // Finisher
  'rec-1':        GLYPH.bars,           // On the Board
  'rec-10':       GLYPH.lineChart,      // Record Keeper
  'rec-25':       GLYPH.podium,         // Statistician
  'rec-50':       GLYPH.certificate,    // Your Own Worst Rival

  // ---- Analytics -----------------------------------------------------
  'score-40':     GLYPH.gauge,          // Graded
  'score-60':     GLYPH.lineChart,      // Passing Grade
  'score-75':     GLYPH.certificate,    // Solid Record
  'score-85':     GLYPH.medal,          // Straight B
  'score-90':     GLYPH.trophy,         // Top of the Class
  'prod-70':      GLYPH.checklist,      // Productive
  'prod-90':      GLYPH.anvil,          // Prolific
  'qual-70':      GLYPH.gem,            // Good Work
  'qual-90':      GLYPH.sparkle,        // Excellent Work
  'cons-70':      GLYPH.clock,          // Reliable
  'cons-90':      GLYPH.orbit,          // Metronome
  'eff-70':       GLYPH.stopwatch,      // Efficient
  'eff-90':       GLYPH.bolt,           // Sharp
  'foc-70':       GLYPH.target,         // Focused
  'foc-90':       GLYPH.bullseye,       // Locked In
  'rate-50':      GLYPH.pieChart,       // Half the Days
  'rate-75':      GLYPH.calendarCheck,  // Most Days
  'rate-90':      GLYPH.infinity,       // Nearly Every Day
  'ontime-75':    GLYPH.alarm,          // Punctual
  'ontime-90':    GLYPH.shieldCheck,    // Dependable
  'rated-25':     GLYPH.pen,            // Marking Your Work
  'rated-100':    GLYPH.scales,         // Honest Record
  'rated-500':    GLYPH.scroll,         // Nothing Unexamined

  // ---- Special -------------------------------------------------------
  'night-10':     GLYPH.moonStar,       // Night Owl
  'dayxp-5000':   GLYPH.comet,          // Once in a Lifetime
  'deep-14':      GLYPH.candle,         // Fourteen Hours

  /* The hidden five, drawn only once they are earned — until then the
     padlock is the whole truth about them and Mark never asks for these. */
  'hidden-nocturne':GLYPH.moonStar,
  'hidden-polymath':GLYPH.atom,
  'hidden-iron-will':GLYPH.anvil,
  'hidden-10k-hours':GLYPH.hourglass,
  'hidden-ascended':GLYPH.peakFlag,
};

/** The badge's own drawing: its exception if it has one, else its family's. */
export function glyphFor(badge: Badge): ReactNode {
  return BADGE_GLYPH[badge.id] ?? METRIC_GLYPH[badge.metric as Metric] ?? GLYPH.star;
}

/** The seven headings, drawn. The same drawing the category's badges carry. */
export const CATEGORY_GLYPH: Record<Category, ReactNode> = {
  Productivity: GLYPH.target,
  Consistency: GLYPH.flame,
  Learning: GLYPH.book,
  Mastery: GLYPH.lattice,
  Milestones: GLYPH.trophy,
  Analytics: GLYPH.gauge,
  Special: GLYPH.star,
};

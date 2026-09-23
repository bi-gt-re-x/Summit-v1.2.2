/**
 * The badge wall.
 *
 * A wall of badges, arranged so that a reader meets them in the order the
 * questions arrive: how far am I, what did I just get, which kinds am I behind
 * on, what is next in the trees, and then the whole list.
 *
 *     the ring and three figures   how far along the wall is, and the streak
 *     Recently Earned              the last four, largest — the news
 *     Achievement Categories       one bar per heading
 *     Skill Trees                  the six tree ladders, and the way in
 *     All Achievements             the wall, in two grids: still to earn, then
 *                                  earned
 *
 * ## The wall is split, and neither half is behind a control
 *
 * "Still to earn · 32" and "Earned · 68", one grid each, both always drawn.
 * A single list sorted by difficulty answers "how hard is this badge" — a
 * question nobody arrives with — while burying the two the reader did come
 * for: what is next, and what have I got. Splitting it answers both in the
 * headings before a tile is read.
 *
 * ## What is still out there comes first
 *
 * The unearned half leads. Both halves are worth drawing, but only one of them
 * can be acted on: "Still to earn" sorted easiest-and-nearest-first is a list
 * of things to go and do, and the top of it is literally the next one. The
 * earned half is a record — it is the more pleasant half to look at and it
 * does not change what anybody does this afternoon, so it reads better as
 * what the page arrives at than as what it opens with.
 *
 * The four largest badges on the page are still the four most recently earned,
 * up at the top. Nothing about this ordering hides the good news; it stops the
 * good news from standing between the reader and the wall.
 *
 * It is a split rather than a toggle for the same reason the panels on the
 * Growth page show their charts rather than offering them: a page whose job is
 * to say where you are should not make you ask twice. The category chips and
 * the search box narrow both halves at once, so a reader filtering to Learning
 * still sees the Learning badges they have beside the ones they do not.
 *
 * ## Nothing here is computed
 *
 * The server decides what is earned and holds the date it happened. This page
 * draws what it is given. That matters for the streak badges in particular: a
 * badge earned in March is still earned in July, and a client recomputing
 * "streak >= 30" against the *current* streak would take it away again on the
 * first missed day. See the note in backend/api/achievements.py.
 *
 * The category counts and the achievement score arrive counted for the same
 * reason — two places counting the same badges is two places that can disagree
 * about a wall the reader is looking at all at once.
 *
 * ## Progress is only drawn on locked badges
 *
 * An earned badge shows the day it was earned instead. A full bar under a
 * badge that is already won is a bar nobody reads, and it takes the row's
 * width from the one thing on it that is still news.
 *
 * ## The hidden ones draw as they arrive
 *
 * A locked hidden badge arrives with no name, no threshold and no progress —
 * see the service. The page does not have to know which they are, and
 * could not leak them if it wanted to: it draws "???" because that is what it
 * was sent. What it adds is the lock styling and the line at the foot of the
 * list saying how many are still out there, which is the honest version of
 * "more achievements coming soon" — they are not coming, they are already here
 * and you have not found them.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, Loading, PageHero, RefreshButton } from '@/components';
import { useApi, useAuth, useDocumentTitle, usePageEntrance } from '@/hooks';
import { achievements as service } from '@/services';
import { TREE_CATEGORY } from '@/services/achievements';
import type { Badge, Category, Metric } from '@/services/achievements';
import '@/styles/achievements.css';

/** The filter's options. "All" first, then the seven headings, server order. */
const FILTERS = [
  'All Achievements', 'Productivity', 'Consistency', 'Learning', 'Mastery',
  'Milestones', 'Analytics', 'Special',
] as const;
type Filter = (typeof FILTERS)[number];

/** How many of the most recent earnings lead the page. */
const RECENT = 4;

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
const GLYPH = {
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
 * The badges whose name is about something the metric does not say.
 *
 * The metric is still the default and still the family: seven streak badges
 * share the flame, and a reader who learns the flame once has learned all
 * seven. What this adds is the exceptions — the badges whose *name* promises a
 * particular picture, and which get a wall of identical flames otherwise. "The
 * Long Haul" is a mountain, "Six Figures" is a stack of coins, "A Library of
 * Your Own" is a shelf of books, and each of them is the drawing the name
 * already put in the reader's head.
 *
 * Keyed by id, so an override is impossible to attach to the wrong badge, and
 * deliberately partial — most badges still take the family drawing,
 * because inventing a distinct picture for the fourth rung of the same ladder
 * is drawing a distinction the badges do not make. The rung is carried by the
 * tier's colour and its pips, which is how the wall says "III" without a word.
 */
const BADGE_GLYPH: Record<string, ReactNode> = {
  // Productivity
  'first-task': GLYPH.flag,
  'tasks-50': GLYPH.checklist,
  'tasks-100': GLYPH.checklist,
  'tasks-250': GLYPH.checklist,
  'tasks-500': GLYPH.dumbbell,
  'tasks-1000': GLYPH.bars,
  'tasks-2500': GLYPH.mountain,
  'hard-200': GLYPH.shield,
  'day-20': GLYPH.burst,
  'day-30': GLYPH.gauge,
  'events-200': GLYPH.crown,

  // Consistency
  'goal-day-250': GLYPH.award,
  'early-200': GLYPH.award,
  'weekend-150': GLYPH.books,
  'months-12': GLYPH.infinity,

  // Learning
  'focus-1': GLYPH.stopwatch,
  'focus-1000': GLYPH.mountain,
  'deep-3': GLYPH.hourglass,
  'deep-6': GLYPH.hourglass,
  'deep-10': GLYPH.hourglass,
  'subj-3': GLYPH.seedling,
  'subj-8': GLYPH.grid,
  'subj-15': GLYPH.globe,
  'subj-25': GLYPH.compass,
  'notes-1': GLYPH.pen,
  'notes-10': GLYPH.pen,
  'notes-200': GLYPH.archive,
  'notes-500': GLYPH.books,

  // Milestones
  'xp-100000': GLYPH.coins,
  'xp-250000': GLYPH.gem,
  'xp-500000': GLYPH.gem,
  'level-100': GLYPH.crown,
  'level-150': GLYPH.rocket,
  'dayxp-3000': GLYPH.trendUp,
  'goal-50': GLYPH.award,
  'rec-25': GLYPH.bars,
  'rec-50': GLYPH.podium,

  // Special
  'night-10': GLYPH.moonStar,
  'dayxp-5000': GLYPH.burst,
  'deep-14': GLYPH.hourglass,

  // The hidden ones, drawn only once they have been earned — until then
  // the padlock is the whole truth about them and Mark never asks for these.
  'hidden-nocturne': GLYPH.moonStar,
  'hidden-polymath': GLYPH.globe,
  'hidden-iron-will': GLYPH.shield,
  'hidden-10k-hours': GLYPH.hourglass,
  'hidden-ascended': GLYPH.crown,
};

/** The badge's own drawing: its exception if it has one, else its family's. */
function glyphFor(badge: Badge): ReactNode {
  return BADGE_GLYPH[badge.id] ?? METRIC_GLYPH[badge.metric as Metric] ?? GLYPH.star;
}

/** The seven headings, drawn. The same drawing the category's badges carry. */
const CATEGORY_GLYPH: Record<Category, ReactNode> = {
  Productivity: GLYPH.target,
  Consistency: GLYPH.flame,
  Learning: GLYPH.book,
  Mastery: GLYPH.lattice,
  Milestones: GLYPH.trophy,
  Analytics: GLYPH.gauge,
  Special: GLYPH.star,
};

function pretty(iso: string | null): string {
  if (!iso) return '';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  return when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * "2h ago", "1d ago", "3w ago".
 *
 * Relative rather than absolute on the recent cards because the whole reason
 * they are at the top is that they are news, and "Earned 2h ago" is news in a
 * way that "Earned 28 Apr" is not. The list below prints the date, which is
 * the right form for a row somebody is scrolling past.
 */
function ago(iso: string | null): string {
  if (!iso) return '';
  const when = new Date(iso).getTime();
  if (Number.isNaN(when)) return '';
  const mins = Math.max(0, Math.round((Date.now() - when) / 60000));
  if (mins < 60) return `${mins || 1}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return pretty(iso);
}

/**
 * A badge's mark: a hexagon, the thing the badge is about, and its rank.
 *
 * One shape for every badge and the tier carried in its colour, so a reader
 * scanning the wall reads difficulty from the hue rather than from a word. The
 * hexagon rather than a circle because the wall is the one page in this app
 * that is allowed to look like a game.
 *
 * ## The drawing is the badge's, earned or not
 *
 * It used to be a tick once a badge was won. That made the picture a report on
 * the reader rather than a picture of the badge, and on an account with
 * seventy earned it turned two thirds of the wall into the same drawing
 * repeated. Earning is said by the tint, the solid rim and the rosette in the
 * corner; the hexagon keeps saying what the badge is. The padlock survives for
 * the one case where it is the whole truth: a hidden badge nobody has been
 * told the shape of.
 *
 * ## Pips are the rung
 *
 * One to five, along the top edge, in the tier's own tone. The colour already
 * carries difficulty for a reader who has learned it; the pips are the same
 * fact counted, so it can be read on the first visit and off a screenshot. A
 * secret badge draws none: its tier is one more thing nobody has been told.
 */
function Mark({ badge, size }: { badge: Badge; size?: 'lg' }) {
  const secret = badge.hidden && !badge.earned;
  return (
    <span
      className={`ac-mark tier-${badge.tier}${badge.earned ? ' is-earned' : ''}${secret ? ' is-secret' : ''}${size === 'lg' ? ' is-lg' : ''}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="ac-mark-hex">
        <path d="M16 1.6 29 9v14L16 30.4 3 23V9z" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        className="ac-mark-glyph"
        fill="none"
        stroke="currentColor"
        strokeWidth={badge.earned ? 2.1 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {secret ? GLYPH.lock : glyphFor(badge)}
      </svg>

      {!secret && (
        <span className="ac-pips">
          {Array.from({ length: badge.tier }, (_, index) => (
            <i key={index} />
          ))}
        </span>
      )}

      {badge.earned && (
        <span className="ac-mark-tick">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5 9.5 17 19 7.5" />
          </svg>
        </span>
      )}
    </span>
  );
}

/** One of the four cards along the top — the badges most recently earned. */
function RecentCard({ badge }: { badge: Badge }) {
  return (
    <li className={`ac-recent-card tier-${badge.tier}`}>
      <Mark badge={badge} size="lg" />
      <strong>{badge.name}</strong>
      <span className="ac-quiet">{badge.description}</span>
      <div className="ac-recent-foot">
        <span className="ac-xp">+{badge.xp_reward} XP</span>
        <span className="ac-quiet">Earned {ago(badge.earned_at)}</span>
      </div>
    </li>
  );
}

/**
 * One badge in the wall.
 *
 * A tile rather than a full-width row. The row put the mark, the name, the
 * bar and the score on one line and gave the description whatever was left,
 * which on a wide screen was one badge every sixty pixels of height and eight
 * hundred pixels of empty middle. Three or four tiles across is the same
 * the whole wall in a third of the scroll, and it puts badges beside each
 * other, which is how a wall is read — the eye compares neighbours.
 *
 * The tile is the same size earned or locked. What changes is the tint and the
 * foot: a date on one, a bar on the other. Earned tiles carry their tier's
 * colour across the whole card rather than only the hexagon, so "what have I
 * got" is answerable from across the room and before any word is read.
 */
function BadgeTile({ badge }: { badge: Badge }) {
  const secret = badge.hidden && !badge.earned;
  const share = badge.threshold > 0 ? Math.min(1, badge.value / badge.threshold) : 0;

  return (
    <li className={`ac-tile tier-${badge.tier}${badge.earned ? ' is-earned' : ''}${secret ? ' is-secret' : ''}`}>
      <Mark badge={badge} />

      <div className="ac-tile-text">
        <div className="ac-tile-top">
          <strong>{badge.name}</strong>
          {/* A secret badge's rank is withheld with the rest of it — the word
              "Legendary" beside the blanked rows would say which they are. */}
          <span className="ac-rank">{secret ? 'Hidden' : badge.tier_label}</span>
        </div>
        <span className="ac-quiet">{badge.description}</span>
        {badge.title && <em className="ac-title">Title unlocked · {badge.title}</em>}
      </div>

      <div className="ac-tile-foot">
        {badge.earned ? (
          <span className="ac-done">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12.5l2.6 2.6L16 9.5" />
            </svg>
            Earned {pretty(badge.earned_at)}
          </span>
        ) : secret ? (
          /* No bar and no figures: the server sent neither, and inventing an
             empty one would say "you are at zero" about a threshold nobody
             has been told. */
          <span className="ac-quiet ac-secret-note">Hidden until earned</span>
        ) : (
          <div className="ac-progress">
            <div className="ac-bar" role="presentation">
              <i style={{ width: `${Math.round(share * 100)}%` }} />
            </div>
            <span className="ac-quiet ac-figures">
              {badge.value.toLocaleString()} / {badge.threshold.toLocaleString()}
            </span>
          </div>
        )}

        {/* A secret badge's score is withheld with everything else about it.
            The server blanks the name, the threshold and the progress but
            still sends `xp_reward`, and printing it undoes the rest: four
            hidden tiles at +1,000 and one at +5,000 tells a reader exactly
            which of the five is the monster. */}
        {secret ? (
          <span className="ac-xp" title="Withheld until it is earned">??? XP</span>
        ) : (
          <span
            className={`ac-xp${badge.earned ? ' is-earned' : ''}`}
            title={`${badge.tier_label} · worth ${badge.xp_reward} toward your achievement score`}
          >
            +{badge.xp_reward} XP
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * One half of the wall, headed by what it is and how many are in it.
 *
 * Locked and earned are drawn as two grids rather than one, in that order, and
 * neither is behind a control: a toggle would make the reader ask twice for a
 * page whose whole job is to answer "where am I" once. The heading carries the
 * count, so the split is also the tally — "Earned · 71" is the sentence the
 * ring at the top of the page draws as an arc.
 */
function Wall({ title, note, badges }: { title: string; note: string; badges: Badge[] }) {
  if (badges.length === 0) return null;
  return (
    <>
      <div className="ac-wall-head">
        <h3>
          {title} <span className="ac-wall-count">{badges.length}</span>
        </h3>
        <span className="ac-quiet">{note}</span>
      </div>
      <ul className="ac-grid">
        {badges.map((badge) => (
          <BadgeTile badge={badge} key={badge.id} />
        ))}
      </ul>
    </>
  );
}

/**
 * The skill trees, given a section of their own.
 *
 * ## Why this one heading gets more than a chip
 *
 * Every heading has a chip in the band above and a share of the wall below,
 * and for five of the seven that is the right amount of room. Mastery is the
 * exception for two reasons that have nothing to do with it being newer.
 *
 * It is the largest heading on the wall — thirty-one badges across six ladders
 * — and it is the only one whose badges are not about the app at all. Every
 * other badge is counted off something the reader did *here*: tasks finished,
 * days turned up, XP earned. These are counted off how far into a *subject*
 * the work went, against a curriculum somebody wrote, and the honest thing to
 * do with a reader who has just learned that is show them the curriculum.
 * Hence the way out at the foot of it, which is the only link on this page.
 *
 * Mixed into the wall, all of that was thirty-one tiles a reader met in tier
 * order between "Night Owl" and "Six Figures", with nothing saying they were
 * six ladders rather than a pile, and nothing saying where to go.
 *
 * ## It is a second view, not a second copy
 *
 * These badges are still in the wall below, under the filter and the search
 * like everything else. This section is the same rows arranged by the thing
 * that makes them different from each other — which ladder each is on — and
 * that is a grouping the wall cannot do without becoming six walls.
 */
function TreeWall({ badges }: { badges: Badge[] }) {
  /* The six ladders, in the order the server lists them, and each one's next
     rung. `find` over a list already sorted by threshold inside its metric —
     see the note in the Mastery block of backend/api/achievements.py, and the
     test that holds it true. */
  const ladders = useMemo(() => {
    const out = new Map<string, { rows: Badge[]; next: Badge | null; earned: number }>();
    badges.forEach((badge) => {
      const key = badge.metric || 'other';
      const entry = out.get(key) ?? { rows: [], next: null, earned: 0 };
      entry.rows.push(badge);
      if (badge.earned) entry.earned += 1;
      out.set(key, entry);
    });
    out.forEach((entry) => {
      entry.next = entry.rows.find((badge) => !badge.earned) ?? null;
    });
    return [...out.values()];
  }, [badges]);

  if (badges.length === 0) return null;

  const earned = badges.filter((badge) => badge.earned).length;

  return (
    <section className="ac-section ac-trees">
      <header className="ac-section-head">
        <h2>
          <span className="ac-trees-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              {GLYPH.lattice}
            </svg>
          </span>
          Skill Trees
        </h2>
        <span className="ac-quiet">
          {earned} / {badges.length} earned
        </span>
      </header>

      <p className="ac-trees-note">
        Counted on your own XP in the subjects that open each lattice, against what
        that lattice is worth — never on a tree&rsquo;s own drawing, which is the same on
        every account. Six ladders: how many you have touched, how far into the best
        one, how many passed half, how many you covered outright, how many fields they
        sit in, and the whole lot added up.
      </p>

      {/* One row per ladder, and the row is the next rung on it. A reader
          asking "what is next in the trees" has six answers, not one, and a
          single "next badge" line would have had to pick one of them. */}
      <ul className="ac-ladders">
        {ladders.map((ladder) => {
          const next = ladder.next;
          return (
            <li className="ac-ladder" key={ladder.rows[0]!.id}>
              <span className="ac-ladder-count">
                {ladder.earned} / {ladder.rows.length}
              </span>
              {next ? (
                <span className="ac-ladder-next">
                  <strong>{next.name}</strong>
                  <span className="ac-quiet">{next.description}</span>
                  {next.threshold > 0 && (
                    <span className="ac-bar" role="presentation">
                      <i style={{ width: `${Math.round((next.value / next.threshold) * 100)}%` }} />
                    </span>
                  )}
                  <span className="ac-quiet">
                    {next.value} / {next.threshold} {next.unit}
                  </span>
                </span>
              ) : (
                /* Every rung on this ladder is done. Saying so is the point of
                   splitting them: a reader who has topped out one of the six
                   should be able to see that without counting tiles. */
                <span className="ac-ladder-next is-done">
                  <strong>{ladder.rows[ladder.rows.length - 1]!.name}</strong>
                  <span className="ac-quiet">Every rung on this one is yours.</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <ul className="ac-grid">
        {badges.map((badge) => (
          <BadgeTile badge={badge} key={badge.id} />
        ))}
      </ul>

      {/* The only link on the page. See the note at the top of this component
          for why this heading is the one that earns it. */}
      <p className="ac-foot">
        <Link to="/skill-trees">Open the skill trees</Link>
      </p>
    </section>
  );
}


/**
 * One of the three figures beside the ring.
 *
 * The drawing is not decoration: three numbers of the same size in a row read
 * as one table, and the reader has to get to the label under each before they
 * know which is which. A trophy, a flame and a sparkle are told apart before
 * they are read.
 */
function Stat({
  glyph,
  tone,
  value,
  label,
  note,
}: {
  glyph: ReactNode;
  tone: string;
  value: string;
  label: string;
  note: string;
}) {
  return (
    <div className={`ac-stat tone-${tone}`}>
      <div className="ac-stat-top">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {glyph}
        </svg>
        <strong>{value}</strong>
      </div>
      <span className="ac-stat-label">{label}</span>
      <span className="ac-quiet">{note}</span>
    </div>
  );
}

/** The completion ring. One arc, drawn as a stroked circle. */
function Ring({ share }: { share: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="ac-ring">
      <svg viewBox="0 0 100 100">
        <circle className="ac-ring-track" cx="50" cy="50" r={radius} />
        <circle
          className="ac-ring-arc"
          cx="50"
          cy="50"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - share)}
        />
      </svg>
      <div className="ac-ring-face">
        <strong>{Math.round(share * 100)}%</strong>
      </div>
    </div>
  );
}

export default function Achievements() {
  useDocumentTitle('Achievements');

  // `useAuth`, not `useUserData`: this page wants a name to key its own
  // fetch on, and asking `useUserData` for one is what makes the app read the
  // account's entire task list. See hooks/useUserData.
  const { username } = useAuth();
  const call = useCallback(
    () =>
      username
        ? service.getAchievements()
        : Promise.resolve({ success: false as const, message: 'Sign in to see your badges.' }),
    [username],
  );
  const { data, error, loading, refreshing, reload } = useApi(call, [username]);

  const [filter, setFilter] = useState<Filter>('All Achievements');
  const [query, setQuery] = useState('');

  /* "View All" — clear both narrowings and go to the list. Scrolled rather
     than routed because the full list is already on this page. */
  const listRef = useRef<HTMLElement | null>(null);
  const showAll = useCallback(() => {
    setFilter('All Achievements');
    setQuery('');
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const badges = useMemo(() => data?.achievements ?? [], [data]);

  /* The last four earned, newest first. A badge with no date sorts last rather
     than being dropped: the date is written the first time a read sees it
     earned, so the only rows without one are older than that mechanism. */
  const recent = useMemo(
    () =>
      badges
        .filter((badge) => badge.earned)
        .sort((a, b) => (b.earned_at ?? '').localeCompare(a.earned_at ?? ''))
        .slice(0, RECENT),
    [badges],
  );

  /* The wall, filtered and searched — both halves of it, before the split. */
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return badges
      .filter((badge) => filter === 'All Achievements' || badge.category === filter)
      .filter(
        (badge) =>
          !needle ||
          badge.name.toLowerCase().includes(needle) ||
          badge.description.toLowerCase().includes(needle),
      );
  }, [badges, filter, query]);

  /* Earned, hardest first — within its own half, which is the second one. On
     a page that says "71 of 100" the interesting seventy-one are the Legendary
     ones, not the first afternoon's Starters, so the half opens on those. */
  const won = useMemo(
    () => shown.filter((badge) => badge.earned).sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name)),
    [shown],
  );

  /* Locked, easiest first, and within a rung the closest to done first — which
     makes the top of this half literally the answer to "what is next". A
     secret badge has no progress to sort on and arrives at 0, so the five sit
     at the bottom of the Legendary rung, which is where they belong. */
  const left = useMemo(
    () =>
      shown
        .filter((badge) => !badge.earned)
        .sort((a, b) => {
          if (a.tier !== b.tier) return a.tier - b.tier;
          const near = (badge: Badge) => (badge.threshold > 0 ? badge.value / badge.threshold : 0);
          return near(b) - near(a) || a.name.localeCompare(b.name);
        }),
    [shown],
  );

  /* The skill trees, in the order the server sends them — which is ladder
     order, and the one thing `TreeWall` cannot reconstruct from a set. Off
     `badges` rather than off `shown`: this section is not what the filter and
     the search are for, and a reader searching "streak" should not watch the
     tree section empty out beside the wall that is actually answering them. */
  const treeBadges = useMemo(
    () => badges.filter((badge) => badge.category === TREE_CATEGORY),
    [badges],
  );

  const hiddenLeft = useMemo(
    () => badges.filter((badge) => badge.hidden && !badge.earned).length,
    [badges],
  );

  /* The arrival cascade. Bound to the read rather than to mount, so it
     starts when there is something to animate — see hooks/usePageEntrance. */
  const entering = usePageEntrance(!loading);

  if (loading) return <Loading label="Reading your record" />;
  if (error && !badges.length) return <ErrorState message={error} onRetry={reload} />;

  const earned = data?.earned ?? 0;
  const total = data?.total ?? 0;
  const share = total > 0 ? earned / total : 0;

  return (
    <div className="ac-page">
      <div className={`ac-shell page-shell${entering ? ' pg-enter' : ''}`}>
        {/* Rose, which is this page and nothing else in the rail. */}
        <PageHero variant="achievements" tone="rose">
          <header className="ac-head">
            <div>
              <h1>Achievements</h1>
              <p className="ac-quiet">Celebrate your progress. Every step forward counts.</p>
            </div>
            <div className="ac-head-tools">
              <label className="ac-select">
                <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
                  {FILTERS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <RefreshButton busy={refreshing} onRefresh={reload} />
            </div>
          </header>
        </PageHero>

        {error && <ErrorState message={error} onRetry={reload} />}

        {/* The band. The ring is the wall; the three figures beside it are the
            account — what it has earned, whether it is still turning up, and
            what the wall scores. */}
        <section className="ac-band">
          <div className="ac-band-ring">
            <Ring share={share} />
            <span className="ac-quiet">Overall Completion</span>
          </div>

          <Stat
            glyph={GLYPH.trophy}
            tone="gold"
            value={String(earned)}
            label="Achievements Earned"
            note={`/ ${total} total`}
          />

          <Stat
            glyph={GLYPH.flame}
            tone="flame"
            value={String(data?.streak ?? 0)}
            label="Day Streak"
            note={(data?.streak ?? 0) > 0 ? 'Keep it going!' : 'Finish a task to start one'}
          />

          {/* Not the account's XP, and it does not say it is. The badges are
              weighted by difficulty and this is their sum — see the note on the
              endpoint. Printed against the full wall, because the number on its
              own says nothing, and labelled "score" rather than "XP" because a
              reader who reads it as XP will wait for a level that never comes. */}
          <Stat
            glyph={GLYPH.sparkle}
            tone="violet"
            value={(data?.achievement_xp ?? 0).toLocaleString()}
            label="Achievement Score"
            note={`of ${(data?.total_xp ?? 0).toLocaleString()} on the wall`}
          />
        </section>

        {data?.title && (
          <p className="ac-title-banner">
            You have earned the title <strong>{data.title}</strong>.
          </p>
        )}

        {recent.length > 0 && (
          <section className="ac-section">
            <header className="ac-section-head">
              <h2>Recently Earned</h2>
              {/* It goes somewhere: it clears the filter and the search and
                  puts the reader at the top of the full list, which is the only
                  honest "all" on a page whose list is already here. A link that
                  navigated away would be leaving the page it is on. */}
              <button type="button" className="ac-view-all" onClick={showAll}>
                View All
              </button>
            </header>
            <ul className="ac-recent">
              {recent.map((badge) => (
                <RecentCard badge={badge} key={badge.id} />
              ))}
            </ul>
          </section>
        )}

        <section className="ac-section">
          <header className="ac-section-head">
            <h2>Achievement Categories</h2>
          </header>
          <ul className="ac-cats">
            {(data?.categories ?? []).map((category) => (
              /* A chip is the filter it names. The row was five read-only
                 gauges sitting directly above a list with a category filter on
                 it — the control the reader wanted was already on screen and
                 not connected to the thing that looked like it. */
              <li className={`ac-cat cat-${category.name.toLowerCase()}`} key={category.name}>
                <button
                  type="button"
                  aria-pressed={filter === category.name}
                  onClick={() => setFilter(filter === category.name ? 'All Achievements' : category.name)}
                >
                  <span className="ac-cat-head">
                    <span className="ac-cat-ico" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        {CATEGORY_GLYPH[category.name]}
                      </svg>
                    </span>
                    <span className="ac-cat-text">
                      <strong>{category.name}</strong>
                      <span className="ac-quiet">
                        {category.earned} / {category.total}
                      </span>
                    </span>
                  </span>
                  <span className="ac-bar" role="presentation">
                    <i
                      style={{
                        width: `${category.total > 0 ? Math.round((category.earned / category.total) * 100) : 0}%`,
                      }}
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Above the wall, because it is a way *in* to a section of it and a
            reader who has scrolled past the whole wall has already made up
            their mind. */}
        <TreeWall badges={treeBadges} />

        <section className="ac-section" ref={listRef}>
          <header className="ac-section-head">
            <h2>All Achievements</h2>
            <label className="ac-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={query}
                placeholder="Search achievements…"
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search achievements"
              />
            </label>
          </header>

          {shown.length === 0 ? (
            <p className="ac-empty">Nothing matches that.</p>
          ) : (
            <>
              <Wall
                title="Still to earn"
                note="Easiest first, then nearest"
                badges={left}
              />
              <Wall
                title="Earned"
                note="Hardest first"
                badges={won}
              />
            </>
          )}

          {/* The honest version of "more coming soon". They are not coming;
              they are on the wall already and have not been found. */}
          {hiddenLeft > 0 && filter === 'All Achievements' && !query && (
            <p className="ac-foot">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                <rect x="5" y="11" width="14" height="9" rx="2.5" />
                <path d="M8.5 11V8a3.5 3.5 0 017 0v3" />
              </svg>
              {hiddenLeft} hidden {hiddenLeft === 1 ? 'achievement is' : 'achievements are'} still out
              there. Nobody is told what they are.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

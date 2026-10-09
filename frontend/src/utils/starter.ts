/**
 * Getting started: which pages a new account sees, and when the rest arrive.
 *
 * Summit has a lot in it — goals with milestones, a skill tree, five tabs of
 * analytics, notes, spaces — and a brand-new reader shown all of it at once
 * sees a cockpit rather than a place to start. So an account opens on three
 * pages, the three that are the daily loop:
 *
 *   - **Dashboard** — today's tasks, the streak, the XP.
 *   - **Calendar**  — when the work happens.
 *   - **Timer**     — sitting down and doing it.
 *
 * Settings is always there as well; it is not a feature, it is the account.
 *
 * ## Three stages
 *
 * `starter` — the first {@link STARTER_DAYS} days, or until level
 *   {@link STARTER_LEVEL}, whichever comes first. The rail lists the three
 *   pages and nothing else, apart from one quiet row saying more is coming.
 *
 * `gated` — after that. Every page is listed, and the advanced ones carry a
 *   lock. A lock is a note, not a wall: opening a locked page shows what it is
 *   and why it can wait (components/FeatureGate), and "Open it" opens it for
 *   good. Nothing is ever refused.
 *
 * `open` — nothing is locked. Every account made before this existed is here
 *   (see {@link STARTER_SINCE}), as is one that chose "Unlock everything", or
 *   has opened every advanced page one by one.
 *
 * A page can be opened early in either of the first two stages — from the
 * rail's "More tools" row, a link on the dashboard, search, or a typed URL.
 * Every route goes through the same note, so there is no way round it that
 * skips the explanation, and no way it stops anyone.
 *
 * ## Where it is kept
 *
 * On the account, not the browser (`welcome_seen`, `starter_done` and
 * `features_open` in backend/api/settings.py): a page opened on the laptop is
 * open on the phone. The stage itself is never stored — it is worked out here
 * from the sign-up date and the level every time, so it cannot drift.
 */
import type { Prefs } from '@/services/settings';

export type FeatureId = 'tasks' | 'goals' | 'analytics' | 'skill-tree' | 'notes' | 'achievements' | 'spaces';

export interface Feature {
  id: FeatureId;
  /** What the rail calls it. */
  name: string;
  /** Where it opens when opened from the note. */
  to: string;
  /** Path prefixes that belong to it. */
  paths: string[];
  /** One sentence: what it is for. */
  what: string;
  /** Why it waits: what makes it more than the starter pages. */
  why: string;
}

/** In the rail's order. */
export const FEATURES: Feature[] = [
  {
    id: 'analytics',
    name: 'Analytics',
    to: '/recommendations',
    paths: ['/analytics', '/recommendations', '/insights', '/habits', '/subjects', '/growth'],
    what: 'Reports on how you work: your growth score, trends, per-subject pages and recommended sessions.',
    why: 'It asks a few setup questions and has five tabs of charts. It also needs about a week of tasks and sessions before the numbers mean much.',
  },
  {
    id: 'tasks',
    name: 'Tasks',
    to: '/tasks',
    paths: ['/tasks'],
    what: 'The full task manager: every task you have, with filters, grouping, sorting and ratings.',
    why: 'The dashboard already shows what is due today. This is the whole list, with a lot of controls, and is most useful once there are more tasks than one screen holds.',
  },
  {
    id: 'goals',
    name: 'Goals',
    to: '/goals',
    paths: ['/goals', '/trends'],
    what: 'Long-term goals with milestones and a roadmap, linked to the tasks that move them.',
    why: 'A goal is a plan with checkpoints and dates. It works best once you know your weekly rhythm from the dashboard and the timer.',
  },
  {
    id: 'skill-tree',
    name: 'Skill Tree',
    to: '/skill-trees',
    paths: ['/skill-trees', '/growth-tree'],
    what: 'A map of a subject as connected skills, with problems to practise and levels to earn.',
    why: 'It is a big graph with categories, modes and practice sets. Worth the time, but not on day one.',
  },
  {
    id: 'notes',
    name: 'Notes',
    to: '/notes',
    paths: ['/notes'],
    what: 'A notebook with Markdown, folders and search.',
    why: 'Not hard, just one more place to put things. Starting with fewer places makes the habit easier to build.',
  },
  {
    id: 'achievements',
    name: 'Achievements',
    to: '/achievements',
    paths: ['/achievements', '/records'],
    what: 'Your personal bests and the badge wall.',
    why: 'There is not much on it in the first few days. It fills up as you work.',
  },
  {
    id: 'spaces',
    name: 'Spaces',
    to: '/spaces/1',
    paths: ['/spaces/', '/team/'],
    what: 'Pages of your own, like a notebook crossed with a whiteboard, with blocks, charts, sticky notes and team members.',
    why: 'A blank page with a block editor is a lot of freedom. Most people do better with the timer and the calendar first.',
  },
];

const BY_ID = new Map(FEATURES.map((feature) => [feature.id, feature]));

export const featureById = (id: string): Feature | undefined => BY_ID.get(id as FeatureId);

/** The advanced feature a path belongs to, or undefined for a starter page. */
export function featureForPath(pathname: string): Feature | undefined {
  return FEATURES.find((feature) =>
    feature.paths.some((prefix) =>
      prefix.endsWith('/') ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`),
    ),
  );
}

/** How long the starter pages are all a new account sees. */
export const STARTER_DAYS = 3;
/** Or until this level: about ten tasks at the default XP. */
export const STARTER_LEVEL = 3;
/**
 * Accounts made before this day never see a lock. They already know their way
 * round, and taking pages away from them would be a regression, not a tour.
 */
export const STARTER_SINCE = '2026-10-09';

export type Stage = 'open' | 'starter' | 'gated';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The sign-up moment, or null when it cannot be read. */
function joinedAt(createdAt: string): Date | null {
  if (!createdAt) return null;
  const when = new Date(createdAt);
  return Number.isNaN(when.getTime()) ? null : when;
}

export interface StarterInput {
  createdAt: string;
  /** The account's level, or 0 when it is not known yet. */
  level: number;
  prefs: Pick<Prefs, 'starter_done' | 'features_open'>;
  now?: Date;
}

export function stageOf({ createdAt, level, prefs, now = new Date() }: StarterInput): Stage {
  const joined = joinedAt(createdAt);
  // An account whose age cannot be read is treated as an old one: a lock it
  // should not have is worse than a tour it does not get.
  if (!joined || joined < new Date(`${STARTER_SINCE}T00:00:00`)) return 'open';
  if (FEATURES.every((feature) => prefs.features_open.includes(feature.id))) return 'open';
  const young = now.getTime() - joined.getTime() < STARTER_DAYS * DAY_MS;
  if (!prefs.starter_done && young && level < STARTER_LEVEL) return 'starter';
  return 'gated';
}

/** Whole days left in the starter stage, at least 1 while it lasts. */
export function starterDaysLeft(createdAt: string, now = new Date()): number {
  const joined = joinedAt(createdAt);
  if (!joined) return 0;
  const left = STARTER_DAYS * DAY_MS - (now.getTime() - joined.getTime());
  return Math.max(1, Math.ceil(left / DAY_MS));
}

/** Whether this feature still shows its note before opening. */
export function isLocked(stage: Stage, id: FeatureId, opened: readonly string[]): boolean {
  return stage !== 'open' && !opened.includes(id);
}

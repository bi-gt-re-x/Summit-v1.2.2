/**
 * Getting started: which pages a new account sees, and when the rest arrive.
 *
 * A new account opens on the daily loop and nothing else: Dashboard (add and
 * finish tasks), Calendar, Timer and Log. Settings is always there too.
 *
 * Everything else unlocks one page at a time, as a task habit forms. The count
 * is days with at least one finished task (`task_days` in /api/stats), not
 * days since sign-up, so somebody who signs up and vanishes for a week comes
 * back to the same short list. Each page's `after` is the day it opens on.
 * Nothing opens on day one however many tasks get done: the five-tab
 * Analytics waits a week, and Spaces waits longest.
 *
 * Locked pages aren't listed. A typed URL lands on a note
 * (components/FeatureGate) that says when it opens, with a way in anyway.
 * Mango says when one opens (components/Tutorial/Unlocked.tsx), once.
 *
 * ## Two stages
 *
 * `starter`: some page is still locked.
 * `open`: nothing is. Every account made before this existed is here (see
 *   {@link STARTER_SINCE}), and so is one that chose "Unlock everything" or has
 *   unlocked every page.
 *
 * ## Where it is kept
 *
 * On the account (`welcome_seen`, `features_open` in backend/api/settings.py).
 * `features_open` is the pages opened early or already announced by Mango.
 * The stage itself is never stored: it is worked out here every time.
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
  /** Days with a finished task before it opens. */
  after: number;
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
    after: 7,
  },
  {
    id: 'tasks',
    name: 'Tasks',
    to: '/tasks',
    paths: ['/tasks'],
    what: 'The full task manager: every task you have, with filters, grouping, sorting and ratings.',
    why: "The dashboard already shows what's due today. This is the whole list with lots of controls. It's most useful once you have more tasks than fit on one screen.",
    after: 2,
  },
  {
    id: 'goals',
    name: 'Goals',
    to: '/goals',
    paths: ['/goals', '/trends'],
    what: 'Long-term goals with milestones and a roadmap, linked to the tasks that move them.',
    why: 'A goal is a plan with checkpoints and dates. It works best once you know how your weeks usually go.',
    after: 3,
  },
  {
    id: 'skill-tree',
    name: 'Skill Tree',
    to: '/skill-trees',
    paths: ['/skill-trees', '/growth-tree'],
    what: 'Every class you take, mapped out skill by skill, with problems to practice and levels to earn.',
    why: "It's a big map with 150 subjects and practice sets. Worth the time, just not on day one.",
    after: 4,
  },
  {
    id: 'notes',
    name: 'Notes',
    to: '/notes',
    paths: ['/notes'],
    what: 'A notebook with Markdown, folders and search.',
    why: 'Not hard, just one more place to put things. Starting with fewer places makes the habit easier to build.',
    after: 5,
  },
  {
    id: 'achievements',
    name: 'Achievements',
    to: '/achievements',
    paths: ['/achievements', '/records'],
    what: 'Your personal bests and the badge wall.',
    why: "There's not much on it in the first few days. It fills up as you work.",
    after: 6,
  },
  {
    id: 'spaces',
    name: 'Spaces',
    to: '/spaces/1',
    paths: ['/spaces/', '/team/'],
    what: 'Pages of your own, like a notebook crossed with a whiteboard, with blocks, charts, sticky notes and team members.',
    why: 'A blank page with a block editor is a lot of freedom. Most people do better with the timer and the calendar first.',
    after: 10,
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

/**
 * Accounts made before this day never see a lock. They already know their way
 * round, and taking pages away from them would be a regression, not a tour.
 */
export const STARTER_SINCE = '2026-10-09';

export type Stage = 'open' | 'starter';

/** The sign-up moment, or null when it cannot be read. */
function joinedAt(createdAt: string): Date | null {
  if (!createdAt) return null;
  const when = new Date(createdAt);
  return Number.isNaN(when.getTime()) ? null : when;
}

/**
 * Whether this account goes through getting started at all. An account whose
 * age cannot be read counts as an old one: a lock it should not have is worse
 * than a tour it does not get.
 */
export function isNewAccount(createdAt: string): boolean {
  const joined = joinedAt(createdAt);
  return Boolean(joined && joined >= new Date(`${STARTER_SINCE}T00:00:00`));
}

export interface StarterInput {
  createdAt: string;
  /** Days with at least one finished task. */
  taskDays: number;
  prefs: Pick<Prefs, 'features_open'>;
}

/** Whether this feature is still locked. */
export function isLocked({ createdAt, taskDays, prefs }: StarterInput, id: FeatureId): boolean {
  if (!isNewAccount(createdAt) || prefs.features_open.includes(id)) return false;
  return taskDays < (BY_ID.get(id)?.after ?? 0);
}

export function stageOf(input: StarterInput): Stage {
  return FEATURES.some((feature) => isLocked(input, feature.id)) ? 'starter' : 'open';
}

/** The next page to open, and how many more days of tasks it takes. */
export function nextUnlock(input: StarterInput): { feature: Feature; days: number } | null {
  const waiting = FEATURES.filter((feature) => isLocked(input, feature.id)).sort((a, b) => a.after - b.after);
  const feature = waiting[0];
  return feature ? { feature, days: feature.after - input.taskDays } : null;
}

/**
 * Pages the task days have opened that Mango hasn't announced yet, in the
 * order they opened. Announcing one adds it to `features_open`.
 */
export function newlyOpened(input: StarterInput): Feature[] {
  if (!isNewAccount(input.createdAt)) return [];
  return FEATURES.filter(
    (feature) => !input.prefs.features_open.includes(feature.id) && input.taskDays >= feature.after,
  ).sort((a, b) => a.after - b.after);
}

/** "1 more day of tasks", "3 more days of tasks". */
export function daysOfTasks(days: number): string {
  return `${days} more ${days === 1 ? 'day' : 'days'} of tasks`;
}

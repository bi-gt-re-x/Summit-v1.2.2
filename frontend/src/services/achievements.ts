/**
 * Badges earned for milestones.
 *
 * Backend: backend/api/achievements.py, over the tables in
 * data/sql/achievements.sql.
 *
 * One call. Every badge comes back on every read, earned or not — a wall with
 * the locked ones missing would not be a wall, and the whole point of the
 * locked ones is that they say what is next.
 *
 * `value` arrives already capped at `threshold`, so a progress bar is
 * `value / threshold` and never overflows on an account that is far past it.
 *
 * ## A locked hidden badge arrives blank
 *
 * Six of them are hidden, and the server does not describe one until it
 * is earned: the name is "???", the description says only that it exists, and
 * `threshold`, `value` and `metric` are all zeroed. That is why nothing here is
 * optional — the shape is the same for every badge, and the emptiness is the
 * message. Read `hidden && !earned` to draw it as a secret rather than
 * inferring it from a zero threshold.
 */
import { get } from './api';
import type { ApiResult } from '@/types';

/** Everything a badge can be measured on. See `METRIC_LABELS` on the server. */
export type Metric =
  | 'tasks' | 'priority' | 'day_tasks' | 'events'
  | 'xp' | 'day_xp' | 'level'
  | 'streak' | 'active_days' | 'perfect_days' | 'months'
  | 'early' | 'weekend' | 'night'
  | 'focus' | 'focus_days' | 'focus_best'
  | 'subjects' | 'notes' | 'goals' | 'records'
  | 'trees' | 'trees_deep' | 'trees_done' | 'tree_best' | 'tree_groups' | 'tree_xp'
  /* The graded half, read off the analytics report card rather than counted.
     See "The graded metrics" in backend/api/achievements.py. */
  | 'growth_score' | 'productivity_score' | 'quality_score'
  | 'consistency_score' | 'efficiency_score' | 'focus_score'
  | 'consistency_rate' | 'on_time' | 'rated';

/** The seven headings the wall is filed under. */
export type Category =
  | 'Productivity' | 'Consistency' | 'Learning' | 'Mastery' | 'Milestones'
  | 'Analytics' | 'Special';

/**
 * The heading the skill trees are filed under.
 *
 * Named rather than written out at the three call sites that test for it: the
 * page gives this one category a section of its own, and a string literal
 * repeated three times is how that section quietly stops matching the server
 * if the heading is ever renamed.
 */
export const TREE_CATEGORY = 'Mastery' as const;

export interface Badge {
  id: string;
  /** "???" while a hidden badge is unearned. */
  name: string;
  description: string;
  /** Empty while a hidden badge is unearned. */
  metric: Metric | '';
  /** What `value` counts — "tasks", "XP", "days". */
  unit: string;
  /** Zero while a hidden badge is unearned. */
  threshold: number;
  /** Progress toward the threshold, capped at it. */
  value: number;
  earned: boolean;
  /** ISO timestamp of the first read that saw it earned, or null. */
  earned_at: string | null;
  /** 1 to 5: how hard it is, not what order it comes in. */
  tier: number;
  /** The tier in words — "Starter" to "Legendary". */
  tier_label: string;
  category: Category;
  /** What earning it is worth toward the achievement score. Never account XP. */
  xp_reward: number;
  /** One of the five nobody is told about until they have it. */
  hidden: boolean;
  /** The title it confers, once earned. Exactly one badge has one. */
  title: string | null;
}

export interface CategoryCount {
  name: Category;
  earned: number;
  total: number;
}

export interface AchievementsResult {
  achievements: Badge[];
  earned: number;
  total: number;
  /** The account's current value for each metric, uncapped. */
  figures: Record<Metric, number>;
  categories: CategoryCount[];
  /**
   * The sum of the rewards on the badges earned, and what a full wall scores.
   *
   * A score, not currency: the server never adds it to the account's XP. Two
   * figures rather than one because "5,240" says nothing on its own — it is
   * only a reading of a wall against the wall it could be.
   */
  achievement_xp: number;
  total_xp: number;
  /** The live streak, for the band at the top. */
  streak: number;
  level: number;
  xp_to_next: number;
  /** The title this account has earned, or null. Only `Ascended` confers one. */
  title: string | null;
}

export function getAchievements(): Promise<ApiResult<AchievementsResult>> {
  return get<AchievementsResult>('/api/achievements');
}

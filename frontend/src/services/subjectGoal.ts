/**
 * What one subject is for: the goals its work feeds, what the plan says about
 * them and what the work shows. The server reads where the work is, since a goal's
 * filing is often missing or wrong, and takes its order and pace from the plan.
 *
 * Backend: backend/api/subject_read.py, rules in backend/tracking/subject_read.py.
 */
import { get } from './api';
import type { ApiResult } from '@/types';

export type SubjectTone = 'good' | 'bad' | 'flat';
/** How the plan treats the goal this subject feeds. */
export type SubjectStance = 'first' | 'also' | 'second' | 'waits' | 'none';
export type GoalPace = 'on_track' | 'behind' | 'stalled' | 'missing' | 'done' | 'undated';

/** Headline, figures, then what they suggest and what to try. */
export interface SubjectCard {
  tone: SubjectTone;
  title: string;
  figures: string;
  suggests: string;
}

export interface SubjectInsight extends SubjectCard {
  id: string;
  /** How sure, for a claim that can be wrong. Null on a plain count. */
  evidence: string | null;
  resource: { name: string; url: string } | null;
}

export interface SubjectGoalRow {
  goal_id: string;
  title: string;
  state: GoalPace;
  days_left: number | null;
  percent: number | null;
  needs: number | null;
  pace: number | null;
  gets_time: boolean;
  /** Whether the goal names this subject. Its work can be here either way. */
  filed: boolean;
  work_here: number;
  work_total: number;
  next: string;
  note: string;
}

/** A goal filed under this subject with its work somewhere else. */
export interface MisfiledGoal {
  goal_id: string;
  title: string;
  work_here: number;
  work_total: number;
  home: string | null;
  home_name: string;
}

export interface SubjectGoalRead {
  subject: string;
  stance: SubjectStance;
  top: { goal_id: string; title: string; days_left: number | null } | null;
  /** The goal this page reads against, or null with none. */
  lead: string | null;
  card: SubjectCard;
  goals: SubjectGoalRow[];
  misfiled: MisfiledGoal[];
  insights: SubjectInsight[];
}

export function subjectGoalRead(subject: string): Promise<ApiResult<SubjectGoalRead>> {
  return get<SubjectGoalRead>(`/api/analytics/subject_goal?subject=${encodeURIComponent(subject)}`);
}

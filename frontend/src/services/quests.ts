/**
 * Quests: the Dashboard's first-week card and today's quest.
 *
 * Backend: backend/api/quests.py, over backend/tracking/quests.py. Two calls,
 * read the line and claim one. Nothing here decides whether a quest is done:
 * the server looks for the row the action left, and pays once. Both send the
 * reader's own day, since their clock says when today's quest turns over.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';

export type QuestId = 'task' | 'focus' | 'practice' | 'log' | 'goal' | 'back';

export interface Quest {
  id: QuestId;
  title: string;
  hint: string;
  /** The page where it's done. Null for "come back tomorrow". */
  to: string | null;
  xp: number;
  done: boolean;
  claimed: boolean;
}

/** One small quest a day for a young account. Picked by the server. */
export interface DailyQuest {
  /** `daily:<iso day>`, the claim's id. */
  id: string;
  day: string;
  /** Which action from the server's pool. */
  action: string;
  title: string;
  hint: string;
  to: string | null;
  xp: number;
  done: boolean;
  claimed: boolean;
  /** Days of head start Analytics counts, so the countdown matches that page. */
  head_start: number;
}

export interface QuestLine {
  quests: Quest[];
  /** Every quest claimed, or the account is clearly past its first week. */
  retired: boolean;
  /** The day the account was made, ISO. */
  joined: string;
  /** Today's quest. Null once the account has plenty of days behind it. */
  daily: DailyQuest | null;
}

export interface QuestClaim {
  /** A first-week id, or `daily:<iso day>`. */
  quest: string;
  xp_earned: number;
  /** The account's lifetime XP after the claim. */
  total_xp: number;
  new_level: number;
  leveled_up: boolean;
}

export function list(day: string): Promise<ApiResult<QuestLine>> {
  return get<QuestLine>('/api/quests', { day });
}

export function claim(id: QuestId): Promise<ApiResult<QuestClaim>> {
  return post<QuestClaim>('/api/quests/claim', { id });
}

/** Today's quest. `day` is the one the card showed. */
export function claimDaily(day: string): Promise<ApiResult<QuestClaim>> {
  return post<QuestClaim>('/api/quests/claim', { id: 'daily', day });
}

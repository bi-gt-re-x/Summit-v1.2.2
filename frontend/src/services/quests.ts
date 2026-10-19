/**
 * First-week quests: the Dashboard's quest card.
 *
 * Backend: backend/api/quests.py, over backend/tracking/quests.py. Two calls,
 * read the line and claim one. Nothing here decides whether a quest is done:
 * the server looks for the row the action left, and pays once.
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

export interface QuestLine {
  quests: Quest[];
  /** Every quest claimed, or the account is clearly past its first week. */
  retired: boolean;
  /** The day the account was made, ISO. */
  joined: string;
}

export interface QuestClaim {
  quest: QuestId;
  xp_earned: number;
  /** The account's lifetime XP after the claim. */
  total_xp: number;
  new_level: number;
  leveled_up: boolean;
}

export function list(): Promise<ApiResult<QuestLine>> {
  return get<QuestLine>('/api/quests');
}

export function claim(id: QuestId): Promise<ApiResult<QuestClaim>> {
  return post<QuestClaim>('/api/quests/claim', { id });
}

/**
 * The account's level, XP and streak: what the nametag's title is read from.
 *
 * This file was the task list's service. When Summit became an AMC prep site
 * the tasks went, and this one read is what still uses it (context/StatsProvider).
 */
import { post } from './api';
import type { ApiResult, UserStats } from '@/types';

/**
 * The six numbers, without the task list.
 *
 * The read every page makes. The old `getUserData` was the same six numbers plus
 * several megabytes of tasks, which is why it is no longer what the rail and
 * the top bar call — see context/StatsProvider.
 *
 * This is also the call that decays a streak gone stale overnight. Exactly one
 * endpoint does that (backend/api/dashboard.py says why it is this one), so
 * this is the read that makes every page agree on the streak.
 */
export function getStats(): Promise<ApiResult<{ stats: UserStats }>> {
  // A POST, because asking is also when a streak that went stale overnight is
  // written down as broken (backend/api/dashboard.py). `GET /api/stats` gives
  // the same numbers and writes nothing; no GET in the app writes.
  return post<{ stats: UserStats }>('/api/stats');
}

/**
 * Live blocks on a space's page. Backend: the live endpoints in
 * backend/api/spaces.py, rules in backend/tracking/live.py.
 */
import { get } from './api';
import type { ApiResult } from '@/types';
import { liveQuery, type LiveConfig, type LiveData, type LiveOptions } from '@/components/Spaces/live';

export interface LiveReply {
  config: LiveConfig;
  data: LiveData;
  /** This source's stamp when it was read. A newer one means read again. */
  revision: string;
  at: string;
}

/** What one live block shows right now. */
export function readLive(config: LiveConfig): Promise<ApiResult<LiveReply>> {
  return get<LiveReply>('/api/spaces/live', liveQuery(config));
}

/** What a live block can be pointed at. */
export function liveOptions(): Promise<ApiResult<LiveOptions>> {
  return get<LiveOptions>('/api/spaces/live/options');
}

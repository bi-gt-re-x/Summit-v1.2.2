/**
 * The three Personal spaces. Backend: backend/api/spaces.py.
 *
 * A name and a page of text each. The rail lists them and the space page
 * edits them; `SPACES_CHANGED` carries a rename from the page to the rail,
 * which is mounted outside the router and would otherwise keep the old name.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';

export interface Space {
  id: number;
  name: string;
  body: string;
}

/** How many there are; fixed, and mirrored by `COUNT` on the server. */
export const SPACE_COUNT = 3;

/** What a space is called before anybody renames it. */
export const defaultName = (id: number) => `Space ${id}`;

/** The three, as they are before anything is saved. */
export const DEFAULT_SPACES: Space[] = Array.from({ length: SPACE_COUNT }, (_, at) => ({
  id: at + 1,
  name: defaultName(at + 1),
  body: '',
}));

export const SPACES_CHANGED = 'summit:spaces-changed';

export function list(): Promise<ApiResult<{ spaces: Space[] }>> {
  return get<{ spaces: Space[] }>('/api/spaces');
}

export async function save(
  id: number,
  changes: { name?: string; body?: string },
): Promise<ApiResult<{ space: Space }>> {
  const result = await post<{ space: Space }>(`/api/spaces/${id}`, changes);
  if (result.success) {
    window.dispatchEvent(new CustomEvent<Space>(SPACES_CHANGED, { detail: result.space }));
  }
  return result;
}

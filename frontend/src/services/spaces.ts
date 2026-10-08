/**
 * The three Personal spaces and the three Team ones. Backend:
 * backend/api/spaces.py.
 *
 * A name and a page of blocks each, and on a team space a list of pending
 * invites. The rail lists them and the space page edits them; `SPACES_CHANGED`
 * carries a rename from the page to the rail, which is mounted outside the
 * router and would otherwise keep the old name.
 *
 * **Invites are a placeholder.** An address is kept and shown as pending, and
 * nothing is sent — see the note at the top of the backend module.
 */
import { get, post } from './api';
import type { ApiResult } from '@/types';
import type { SpaceDoc } from '@/components/Spaces/blocks';
import { RULES } from '@/utils/sharedRules';

export type { SpaceDoc };

export type SpaceKind = 'personal' | 'team';

export interface Invite {
  email: string;
  status: 'pending';
}

export interface Space {
  id: number;
  name: string;
  /** The page as plain text. Written by the server from `doc` once there is one. */
  body: string;
  /**
   * The page as blocks, with its icon and cover (components/Spaces/blocks).
   * Absent on a page never opened in the block editor; the editor reads
   * `body` into blocks for that one.
   */
  doc?: SpaceDoc;
  /** Team spaces only. */
  invites?: Invite[];
}

/** How many of each; fixed. From shared/rules.json, as the server's is. */
export const SPACE_COUNT: number = RULES.spaces.count;

const BASE: Record<SpaceKind, string> = { personal: '/api/spaces', team: '/api/team-spaces' };

/** Where each kind's pages live in the app. */
export const SPACE_PATH: Record<SpaceKind, string> = { personal: '/spaces', team: '/team' };

/** What a space is called before anybody renames it. */
export const defaultName = (id: number, kind: SpaceKind = 'personal') =>
  kind === 'team' ? `Team Space ${id}` : `Space ${id}`;

/** The three of a kind, as they are before anything is saved. */
export const defaultSpaces = (kind: SpaceKind): Space[] =>
  Array.from({ length: SPACE_COUNT }, (_, at) => ({
    id: at + 1,
    name: defaultName(at + 1, kind),
    body: '',
    ...(kind === 'team' ? { invites: [] } : {}),
  }));

export const DEFAULT_SPACES = defaultSpaces('personal');

export const SPACES_CHANGED = 'summit:spaces-changed';

export interface SpacesChanged {
  kind: SpaceKind;
  space: Space;
}

function announce(kind: SpaceKind, result: ApiResult<{ space: Space }>) {
  if (result.success) {
    window.dispatchEvent(
      new CustomEvent<SpacesChanged>(SPACES_CHANGED, { detail: { kind, space: result.space } }),
    );
  }
  return result;
}

export function list(kind: SpaceKind = 'personal'): Promise<ApiResult<{ spaces: Space[] }>> {
  return get<{ spaces: Space[] }>(BASE[kind]);
}

export async function save(
  id: number,
  changes: { name?: string; body?: string; doc?: SpaceDoc },
  kind: SpaceKind = 'personal',
): Promise<ApiResult<{ space: Space }>> {
  return announce(kind, await post<{ space: Space }>(`${BASE[kind]}/${id}`, changes));
}

/** Add a pending invite to a team space. Nothing is sent. */
export async function invite(id: number, email: string): Promise<ApiResult<{ space: Space }>> {
  return announce('team', await post<{ space: Space }>(`${BASE.team}/${id}/invite`, { email }));
}

export async function uninvite(id: number, email: string): Promise<ApiResult<{ space: Space }>> {
  return announce('team', await post<{ space: Space }>(`${BASE.team}/${id}/uninvite`, { email }));
}

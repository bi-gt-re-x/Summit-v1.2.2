/**
 * The Personal spaces and the Team ones: three of each to start, more added
 * from the rail, filed under folders if the reader wants. Backend:
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
  /** The folder it's filed under, by id, or '' for none. */
  folder?: string;
}

/** A folder in the rail. Pages name it; it holds nothing itself. */
export interface Folder {
  id: string;
  name: string;
}

/** How many of each a new account starts with, and the most there can be. From shared/rules.json. */
export const SPACE_COUNT: number = RULES.spaces.count;
export const SPACE_MAX: number = RULES.spaces.max_count;
export const FOLDERS_MAX: number = RULES.spaces.folders_max;

const BASE: Record<SpaceKind, string> = { personal: '/api/spaces', team: '/api/team-spaces' };

/** Where each kind's pages live in the app. */
export const SPACE_PATH: Record<SpaceKind, string> = { personal: '/spaces', team: '/team' };

/** What a space is called before anybody renames it. */
export const defaultName = (id: number, kind: SpaceKind = 'personal') =>
  kind === 'team' ? `Team Space ${id}` : `Space ${id}`;

/** The starting three of a kind, as they are before anything is saved. */
export const defaultSpaces = (kind: SpaceKind): Space[] =>
  Array.from({ length: SPACE_COUNT }, (_, at) => ({
    id: at + 1,
    name: defaultName(at + 1, kind),
    body: '',
    ...(kind === 'team' ? { invites: [] } : {}),
  }));

export const DEFAULT_SPACES = defaultSpaces('personal');

export const SPACES_CHANGED = 'summit:spaces-changed';

/** A page added, deleted, filed or reordered, or a folder changed: the rail reads the list again. */
export const SPACES_RELOAD = 'summit:spaces-reload';

function reload<T>(kind: SpaceKind, result: ApiResult<T>): ApiResult<T> {
  if (result.success) window.dispatchEvent(new CustomEvent<SpaceKind>(SPACES_RELOAD, { detail: kind }));
  return result;
}

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

export function list(kind: SpaceKind = 'personal'): Promise<ApiResult<{ spaces: Space[]; folders?: Folder[] }>> {
  return get<{ spaces: Space[]; folders?: Folder[] }>(BASE[kind]);
}

/** A new page at the end, in a folder when one is given. */
export async function create(kind: SpaceKind, change: { name?: string; folder?: string } = {}): Promise<ApiResult<{ space: Space }>> {
  return reload(kind, await post<{ space: Space }>(`${BASE[kind]}/new`, change));
}

/** A page, its history and its chat. The last one of a kind can't go. */
export async function remove(kind: SpaceKind, id: number): Promise<ApiResult<{ id: number }>> {
  return reload(kind, await post<{ id: number }>(`${BASE[kind]}/${id}/delete`));
}

/** File a page under a folder, or '' to take it out of one. */
export async function move(kind: SpaceKind, id: number, folder: string): Promise<ApiResult<{ space: Space }>> {
  return reload(kind, await post<{ space: Space }>(`${BASE[kind]}/${id}/folder`, { folder }));
}

export async function reorder(kind: SpaceKind, ids: number[]): Promise<ApiResult<{ spaces: Space[] }>> {
  return reload(kind, await post<{ spaces: Space[] }>(`${BASE[kind]}/order`, { ids }));
}

export async function addFolder(kind: SpaceKind, name: string): Promise<ApiResult<{ folder: Folder; folders: Folder[] }>> {
  return reload(kind, await post<{ folder: Folder; folders: Folder[] }>(`${BASE[kind]}/folders`, { name }));
}

export async function renameFolder(kind: SpaceKind, id: string, name: string): Promise<ApiResult<{ folder: Folder }>> {
  return reload(kind, await post<{ folder: Folder }>(`${BASE[kind]}/folders/${encodeURIComponent(id)}`, { name }));
}

/** The folder goes; its pages stay, out of any folder. */
export async function removeFolder(kind: SpaceKind, id: string): Promise<ApiResult<{ folders: Folder[] }>> {
  return reload(kind, await post<{ folders: Folder[] }>(`${BASE[kind]}/folders/${encodeURIComponent(id)}/delete`));
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

/** One turn of a space's AI chat (components/Spaces/SpaceChat). */
export interface ChatTurn {
  role: 'user' | 'ai';
  text: string;
  /** When it was said, ISO. */
  at?: string;
  /** What the AI did: rewrote, added, edited, or only answered. */
  mode?: 'replace' | 'append' | 'edit' | 'reply';
  /** What the contrast check found after it built. */
  notes?: string[];
  /** Whether this turn's change can still be undone. */
  undo?: boolean;
  undone?: boolean;
  failed?: boolean;
}

export interface AskResult {
  space: Space;
  reply: string;
  mode: 'replace' | 'append' | 'edit' | 'reply';
  /** The page before the change, or null when nothing changed. */
  before: SpaceDoc | null;
  notes: string[];
  /** The whole chat after this turn. */
  chat: ChatTurn[];
}

const CHAT_BASE: Record<SpaceKind, string> = { personal: '/api/spaces', team: '/api/team-spaces' };

/**
 * Ask the AI to build, change or answer about a page
 * (backend/tracking/space_ai.py). The server saves the page and the chat,
 * which is this account's and this space's alone.
 */
export async function ask(
  id: number,
  prompt: string,
  doc: SpaceDoc,
  kind: SpaceKind = 'personal',
): Promise<ApiResult<AskResult>> {
  const result = await post<AskResult>(`${CHAT_BASE[kind]}/${id}/ai`, { prompt, doc });
  if (result.success && result.mode !== 'reply') {
    announce(kind, { success: true, space: result.space } as ApiResult<{ space: Space }>);
  }
  return result;
}

/** This account's chat on one space. */
export function chat(id: number, kind: SpaceKind = 'personal'): Promise<ApiResult<{ chat: ChatTurn[] }>> {
  return get<{ chat: ChatTurn[] }>(`${CHAT_BASE[kind]}/${id}/chat`);
}

/** Put the page back as it was before one AI turn. */
export async function undoTurn(
  id: number,
  at: number,
  kind: SpaceKind = 'personal',
): Promise<ApiResult<{ space: Space; chat: ChatTurn[] }>> {
  const result = await post<{ space: Space; chat: ChatTurn[] }>(`${CHAT_BASE[kind]}/${id}/chat/undo`, { at });
  if (result.success) announce(kind, { success: true, space: result.space } as ApiResult<{ space: Space }>);
  return result;
}

export function clearChat(id: number, kind: SpaceKind = 'personal'): Promise<ApiResult<{ chat: ChatTurn[] }>> {
  return post<{ chat: ChatTurn[] }>(`${CHAT_BASE[kind]}/${id}/chat/clear`);
}

/** One earlier version of a page (backend/api/spaces.py, "Version history"). */
export interface SpaceVersion {
  /** When it was put aside, ISO. */
  at: string;
  words: number;
  blocks: number;
  /** Why it was kept: a while of editing, a big cut, an AI change, or a restore. */
  reason: 'edit' | 'cut' | 'ai' | 'restore';
  /** Its first few lines, as plain text. */
  preview: string[];
}

/** Earlier versions of one page, newest first. */
export function history(id: number, kind: SpaceKind = 'personal'): Promise<ApiResult<{ versions: SpaceVersion[] }>> {
  return get<{ versions: SpaceVersion[] }>(`${CHAT_BASE[kind]}/${id}/history`);
}

/** Put one back. What's on the page now goes into the history first. */
export async function restore(id: number, at: number, kind: SpaceKind = 'personal'): Promise<ApiResult<{ space: Space }>> {
  return announce(kind, await post<{ space: Space }>(`${CHAT_BASE[kind]}/${id}/history/restore`, { at }));
}
